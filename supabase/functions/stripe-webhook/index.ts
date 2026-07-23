// supabase/functions/stripe-webhook/index.ts
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.108.2";
import { buildPaidEmail } from "../_shared/paid-email.ts";
import { sendEmail } from "../_shared/email.ts";
import {
  nextOutboxAttempt,
  outboxStatusAfterAttempt,
} from "../_shared/notification-outbox.ts";
import {
  isCanonicalUuid,
  isStripePaymentIntentId,
  paymentIntegrityAlertRequired,
  paymentLifecycleAction,
  validatePaidConsultation,
} from "../_shared/payment-integrity.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});
const SHARE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const CLAIM_STALE_MS = 10 * 60 * 1000;
type DbClient = SupabaseClient;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function markPayment(
  supabase: DbClient,
  sessionId: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const updates = { ...fields };
  const associationStatus = updates.association_status;
  if (
    typeof associationStatus === "string" &&
    associationStatus !== "received" &&
    associationStatus !== "evaluating"
  ) {
    updates.evaluation_started_at = null;
  }
  let update = supabase.from("consultation_payments").update(updates)
    .eq("stripe_session_id", sessionId);
  if (
    associationStatus === "payment_not_settled" ||
    associationStatus === "invalid_product" ||
    associationStatus === "currency_mismatch" ||
    associationStatus === "amount_mismatch"
  ) {
    update = update.in("association_status", [
      "received",
      "evaluating",
      "payment_not_settled",
    ]).eq("alert_status", "none");
  } else if (
    associationStatus !== "refunded" &&
    associationStatus !== "disputed"
  ) {
    update = update
      .neq("association_status", "refunded")
      .neq("association_status", "disputed");
  }
  const { error } = await update;
  if (error) console.error("stato pagamento non aggiornato:", error.message);
  return !error;
}

async function recordPaymentAlert(
  supabase: DbClient,
  sessionId: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const requestId = typeof fields.request_id === "string"
    ? fields.request_id
    : null;
  const requestReference = typeof fields.request_reference === "string"
    ? fields.request_reference
    : null;
  const paymentIntentId = typeof fields.payment_intent_id === "string"
    ? fields.payment_intent_id
    : null;
  const associationStatus = typeof fields.association_status === "string"
    ? fields.association_status
    : "";
  const { error } = await supabase.rpc(
    "stageplot_record_payment_alert",
    {
      p_stripe_session_id: sessionId,
      p_request_id: requestId,
      p_request_reference: requestReference,
      p_payment_intent_id: paymentIntentId,
      p_association_status: associationStatus,
    },
  );
  if (error) console.error("alert pagamento non accodato:", error.message);
  return !error;
}

async function markPaymentAssociated(
  supabase: DbClient,
  sessionId: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const { data: recovered, error: recoveryError } = await supabase.from(
    "consultation_payments",
  ).update({
    ...fields,
    evaluation_started_at: null,
    alert_status: "none",
    alert_reason: null,
    alert_last_error: null,
    alert_claimed_at: null,
  }).eq("stripe_session_id", sessionId)
    .eq("association_status", "evaluation_timeout")
    .eq("alert_status", "pending")
    .select("stripe_session_id")
    .maybeSingle();
  if (recoveryError) {
    console.error(
      "alert timeout non riconciliato:",
      recoveryError.message,
    );
    return false;
  }
  if (recovered) return true;
  return await markPayment(supabase, sessionId, fields);
}

async function duplicatePaymentResponse(args: {
  supabase: DbClient;
  sessionId: string;
  previousSessionId: string;
  requestId: string;
  eventId: string;
  amount: number | null;
  currency: string | null;
  name: string | null;
  email: string | null;
  paymentIntentId: string | null;
}): Promise<Response> {
  const recorded = await recordPaymentAlert(args.supabase, args.sessionId, {
    request_id: args.requestId,
    payment_intent_id: args.paymentIntentId,
    association_status: "duplicate_payment",
  });
  if (!recorded) return new Response("db error", { status: 500 });

  console.error("possibile doppio pagamento rilevato", {
    eventId: args.eventId,
    requestId: args.requestId,
    previousSessionId: args.previousSessionId,
    sessionId: args.sessionId,
  });
  return json({
    received: true,
    fulfilled: false,
    duplicate_payment: true,
    alert_queued: true,
  });
}

async function orphanPaymentResponse(args: {
  supabase: DbClient;
  sessionId: string;
  requestId?: string | null;
  requestReference: string | null;
  reason:
    | "invalid_request_id"
    | "request_not_found"
    | "request_unavailable"
    | "payment_intent_missing"
    | "payment_intent_mismatch"
    | "project_unavailable";
  eventId: string;
  amount: number | null;
  currency: string | null;
  email: string | null;
  paymentIntentId?: string | null;
}): Promise<Response> {
  const paymentFields: Record<string, unknown> = {
    association_status: args.reason,
    request_reference: args.requestReference,
    payment_intent_id: args.paymentIntentId,
  };
  if (args.requestId) paymentFields.request_id = args.requestId;
  const recorded = await recordPaymentAlert(
    args.supabase,
    args.sessionId,
    paymentFields,
  );
  if (!recorded) return new Response("db error", { status: 500 });

  console.error("pagamento non associato", {
    eventId: args.eventId,
    sessionId: args.sessionId,
    reason: args.reason,
  });
  return json({
    received: true,
    associated: false,
    manual_review: true,
    alert_queued: true,
  });
}

type BlockingLifecycleStatus = "refunded" | "disputed";

async function blockingLifecycleStatus(
  supabase: DbClient,
  paymentIntentId: string,
): Promise<{ status: BlockingLifecycleStatus | null; error: string | null }> {
  const { data, error } = await supabase.from(
    "consultation_payment_lifecycle",
  )
    .select("status")
    .eq("payment_intent_id", paymentIntentId)
    .in("status", ["refunded", "disputed"])
    // Una dispute resta lo stato operativo prevalente finché non esiste un flusso
    // esplicito e verificato che ne registri la chiusura.
    .order("status", { ascending: true })
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { status: null, error: error.message };
  const status = data?.status === "disputed"
    ? "disputed"
    : data?.status === "refunded"
    ? "refunded"
    : null;
  return { status, error: null };
}

async function knownLifecycleBlockResponse(args: {
  supabase: DbClient;
  sessionId: string;
  requestId: string;
  requestReference: string | null;
  paymentIntentId: string;
}): Promise<Response | null> {
  const lifecycleBlock = await blockingLifecycleStatus(
    args.supabase,
    args.paymentIntentId,
  );
  if (lifecycleBlock.error) {
    console.error(
      "verifica lifecycle pagamento fallita:",
      lifecycleBlock.error,
    );
    return new Response("db error", { status: 500 });
  }
  if (!lifecycleBlock.status) return null;

  const revokedAt = new Date().toISOString();
  const lifecycleStatus = lifecycleBlock.status;
  const { error: blockedRequestError } = await args.supabase.from(
    "consultation_requests",
  ).update({
    status: lifecycleStatus,
    payment_intent_id: args.paymentIntentId,
    share_revoked_at: revokedAt,
    notification_status: "blocked",
    notification_last_error: `stripe_${lifecycleStatus}`,
  }).eq("id", args.requestId);
  if (blockedRequestError) {
    console.error(
      "richiesta post-pagamento non bloccata:",
      blockedRequestError.message,
    );
    return new Response("db error", { status: 500 });
  }
  const recorded = await markPayment(args.supabase, args.sessionId, {
    request_id: args.requestId,
    request_reference: args.requestReference,
    payment_intent_id: args.paymentIntentId,
    association_status: lifecycleStatus,
  });
  if (!recorded) return new Response("db error", { status: 500 });
  return json({ received: true, fulfilled: false, access_revoked: true });
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
    );
  } catch (error) {
    console.error("firma webhook non valida:", error);
    return new Response("invalid signature", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const lifecycle = paymentLifecycleAction(event.type, event.data.object);
  if (lifecycle) {
    const occurredAt = new Date(event.created * 1000).toISOString();
    const { data: projectedStatus, error: lifecycleError } = await supabase.rpc(
      "stageplot_record_payment_lifecycle",
      {
        p_stripe_event_id: event.id,
        p_payment_intent_id: lifecycle.paymentIntentId,
        p_status: lifecycle.status,
        p_occurred_at: occurredAt,
      },
    );
    if (lifecycleError) {
      console.error(
        "evento post-pagamento non registrato:",
        lifecycleError.message,
      );
      return new Response("db error", { status: 500 });
    }
    const blockingStatus: BlockingLifecycleStatus | null =
      projectedStatus === "disputed"
        ? "disputed"
        : projectedStatus === "refunded"
        ? "refunded"
        : null;
    if (!lifecycle.revokesAccess) {
      console.error("evento rimborso in revisione manuale", {
        eventId: event.id,
        paymentIntentId: lifecycle.paymentIntentId,
        lifecycleStatus: lifecycle.status,
        blockingStatus,
      });
      return json({
        received: true,
        automatic_access_change: false,
        manual_review: true,
        alert_queued: true,
      });
    }
    if (!blockingStatus) {
      console.error(
        "stato revocante non ricalcolato:",
        "evento non trovato",
      );
      return new Response("db error", { status: 500 });
    }
    const { data: revoked, error: revokeLookupError } = await supabase.from(
      "consultation_requests",
    )
      .select("id")
      .eq("payment_intent_id", lifecycle.paymentIntentId)
      .maybeSingle();
    if (revokeLookupError) {
      console.error(
        "verifica revoca post-pagamento fallita:",
        revokeLookupError.message,
      );
      return new Response("db error", { status: 500 });
    }
    if (!revoked) {
      console.error("evento refund/dispute senza richiesta associata", {
        eventId: event.id,
        paymentIntentId: lifecycle.paymentIntentId,
      });
    }
    return json({ received: true, access_revoked: !!revoked });
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const sessionId = session.id;
  const requestId = session.client_reference_id ?? null;
  const requestReference = typeof requestId === "string"
    ? requestId.slice(0, 200)
    : null;
  const rawPaymentIntent = session.payment_intent;
  const paymentIntentId = typeof rawPaymentIntent === "string"
    ? rawPaymentIntent
    : rawPaymentIntent && typeof rawPaymentIntent === "object" &&
        "id" in rawPaymentIntent
    ? String(rawPaymentIntent.id)
    : null;
  const alertPaymentIntentId = isStripePaymentIntentId(paymentIntentId)
    ? paymentIntentId
    : null;
  const email = session.customer_details?.email ?? session.customer_email ??
    null;
  const amount = session.amount_total ?? null;
  const currency = session.currency ?? null;

  const evaluationStartedAt = new Date().toISOString();
  const initialAssociationStatus = session.payment_status === "paid"
    ? "evaluating"
    : "received";
  const { error: paymentError } = await supabase.from("consultation_payments")
    .upsert({
      stripe_session_id: sessionId,
      email,
      amount,
      currency,
      stripe_event_id: event.id,
      request_id: null,
      request_reference: requestReference,
      payment_intent_id: paymentIntentId,
      association_status: initialAssociationStatus,
      product: (session.metadata?.product as string) ?? null,
      paid_at: evaluationStartedAt,
      evaluation_started_at: evaluationStartedAt,
    }, { onConflict: "stripe_session_id", ignoreDuplicates: true });
  if (paymentError) {
    console.error("upsert pagamento fallito:", paymentError.message);
    return new Response("db error", { status: 500 });
  }
  if (session.payment_status === "paid") {
    const { error: evaluationError } = await supabase.from(
      "consultation_payments",
    ).update({
      email,
      amount,
      currency,
      stripe_event_id: event.id,
      request_reference: requestReference,
      payment_intent_id: paymentIntentId,
      association_status: "evaluating",
      evaluation_started_at: evaluationStartedAt,
    }).eq("stripe_session_id", sessionId)
      .eq("alert_status", "none")
      .in("association_status", [
        "received",
        "payment_not_settled",
        "evaluating",
      ]);
    if (evaluationError) {
      console.error(
        "valutazione pagamento non registrata:",
        evaluationError.message,
      );
      return new Response("db error", { status: 500 });
    }
  }

  if (!isCanonicalUuid(requestId)) {
    return orphanPaymentResponse({
      supabase,
      sessionId,
      requestReference,
      reason: "invalid_request_id",
      eventId: event.id,
      amount,
      currency,
      email,
      paymentIntentId: alertPaymentIntentId,
    });
  }

  const requestFields =
    "id,name,email,product,amount,project_id,share_token,paid,stripe_session_id,payment_event_id,payment_intent_id,notification_status,notification_attempts,notification_claimed_at";
  const { data: existing, error: lookupError } = await supabase.from(
    "consultation_requests",
  )
    .select(requestFields).eq("id", requestId).maybeSingle();
  if (lookupError) {
    console.error("lookup richiesta pagamento fallito:", lookupError.message);
    return new Response("db error", { status: 500 });
  }
  if (!existing) {
    return orphanPaymentResponse({
      supabase,
      sessionId,
      requestReference,
      reason: "request_not_found",
      eventId: event.id,
      amount,
      currency,
      email,
      paymentIntentId: alertPaymentIntentId,
    });
  }

  /* Un Payment Link è riusabile: una sessione diversa è un secondo addebito, non un retry webhook.
     Non sovrascrivere mai l'associazione originaria; registra e notifica l'incidente. */
  if (
    existing.stripe_session_id && existing.stripe_session_id !== sessionId &&
    session.payment_status === "paid"
  ) {
    return duplicatePaymentResponse({
      supabase,
      sessionId,
      previousSessionId: existing.stripe_session_id,
      requestId,
      eventId: event.id,
      amount,
      currency,
      name: existing.name,
      email: existing.email,
      paymentIntentId: alertPaymentIntentId,
    });
  }

  const integrity = validatePaidConsultation({
    requestId,
    product: existing.product,
    amountTotal: amount,
    currency,
    paymentStatus: session.payment_status,
  });
  if (!integrity.ok) {
    const alertRequired = paymentIntegrityAlertRequired(
      session.payment_status,
      integrity.reason,
    );
    const paymentFields: Record<string, unknown> = {
      request_id: requestId,
      request_reference: requestReference,
      payment_intent_id: alertPaymentIntentId,
      association_status: integrity.reason,
    };
    if (alertRequired) {
      const recorded = await recordPaymentAlert(
        supabase,
        sessionId,
        paymentFields,
      );
      if (!recorded) return new Response("db error", { status: 500 });
    } else {
      const recorded = await markPayment(
        supabase,
        sessionId,
        paymentFields,
      );
      if (!recorded) return new Response("db error", { status: 500 });
    }
    console.error("pagamento non conforme al prodotto richiesto", {
      eventId: event.id,
      sessionId,
      requestId,
      reason: integrity.reason,
    });
    /* Un evento incompleto o una seconda sessione errata non deve disattivare un ordine già pagato. */
    if (existing.paid !== true && !existing.stripe_session_id) {
      await supabase.from("consultation_requests").update({
        status: "payment_mismatch",
        notification_status: "blocked",
        notification_last_error: integrity.reason,
      }).eq("id", requestId).is("stripe_session_id", null);
    }
    return json({
      received: true,
      fulfilled: false,
      manual_review: alertRequired,
      alert_queued: alertRequired,
    });
  }

  if (!isStripePaymentIntentId(paymentIntentId)) {
    const { error: missingIntentError } = await supabase.from(
      "consultation_requests",
    ).update({
      status: "payment_mismatch",
      notification_status: "blocked",
      notification_last_error: "payment_intent_missing",
    }).eq("id", requestId).is("stripe_session_id", null);
    if (missingIntentError) {
      console.error(
        "richiesta senza PaymentIntent non aggiornata:",
        missingIntentError.message,
      );
      return new Response("db error", { status: 500 });
    }
    return orphanPaymentResponse({
      supabase,
      sessionId,
      requestId,
      requestReference,
      reason: "payment_intent_missing",
      eventId: event.id,
      amount,
      currency,
      email,
    });
  }

  /* Associazione atomica: serializza checkout/refund per PaymentIntent e mantiene
     il row lock sul progetto fino al commit della richiesta pagata. */
  const paidAt = new Date();
  const shareExpiresAt = new Date(paidAt.getTime() + SHARE_LIFETIME_MS);
  const { data: associationRaw, error: associationError } = await supabase.rpc(
    "stageplot_associate_consultation_payment",
    {
      p_request_id: requestId,
      p_stripe_session_id: sessionId,
      p_payment_intent_id: paymentIntentId,
      p_stripe_event_id: event.id,
      p_amount: amount,
      p_paid_at: paidAt.toISOString(),
      p_share_expires_at: shareExpiresAt.toISOString(),
    },
  );
  if (associationError) {
    console.error("associazione pagamento fallita:", associationError.message);
    if (associationError.code === "23505") {
      return orphanPaymentResponse({
        supabase,
        sessionId,
        requestId,
        requestReference,
        reason: "payment_intent_mismatch",
        eventId: event.id,
        amount,
        currency,
        email,
        paymentIntentId,
      });
    }
    return new Response("db error", { status: 500 });
  }
  const association = associationRaw && typeof associationRaw === "object"
    ? associationRaw as Record<string, unknown>
    : null;
  const associationOutcome = typeof association?.outcome === "string"
    ? association.outcome
    : "";
  if (associationOutcome === "duplicate_payment") {
    return duplicatePaymentResponse({
      supabase,
      sessionId,
      previousSessionId: String(association?.previous_session_id ?? "—"),
      requestId,
      eventId: event.id,
      amount,
      currency,
      name: typeof association?.name === "string" ? association.name : null,
      email: typeof association?.email === "string" ? association.email : null,
      paymentIntentId,
    });
  }
  if (associationOutcome === "lifecycle_blocked") {
    const blocked = await knownLifecycleBlockResponse({
      supabase,
      sessionId,
      requestId,
      requestReference,
      paymentIntentId,
    });
    return blocked ?? new Response("db error", { status: 500 });
  }
  if (
    associationOutcome === "project_unavailable" ||
    associationOutcome === "request_not_found" ||
    associationOutcome === "request_unavailable" ||
    associationOutcome === "payment_intent_mismatch"
  ) {
    return orphanPaymentResponse({
      supabase,
      sessionId,
      requestId,
      requestReference,
      reason: associationOutcome,
      eventId: event.id,
      amount,
      currency,
      email,
      paymentIntentId,
    });
  }
  const requestRow = association?.request &&
      typeof association.request === "object"
    ? association.request as Record<string, unknown>
    : null;
  if (
    !requestRow ||
    (associationOutcome !== "associated" &&
      associationOutcome !== "already_associated")
  ) {
    console.error("risposta associazione pagamento non valida", {
      eventId: event.id,
      outcome: associationOutcome,
    });
    return new Response("db error", { status: 500 });
  }

  /* Seconda lettura intenzionale: chiude la finestra in cui refund/dispute viene
     registrato subito dopo il commit atomico e prima della notifica. */
  const postAssociationLifecycle = await knownLifecycleBlockResponse({
    supabase,
    sessionId,
    requestId,
    requestReference,
    paymentIntentId,
  });
  if (postAssociationLifecycle) return postAssociationLifecycle;

  const paymentRecorded = await markPaymentAssociated(supabase, sessionId, {
    request_id: requestId,
    request_reference: requestReference,
    payment_intent_id: paymentIntentId,
    association_status: "associated",
  });
  if (!paymentRecorded) return new Response("db error", { status: 500 });

  if (requestRow.notification_status === "sent") {
    return json({ received: true, fulfilled: true, duplicate: true });
  }
  if (requestRow.notification_status === "failed") {
    return json({
      received: true,
      fulfilled: true,
      notification_delivered: false,
      manual_review: true,
    });
  }
  if (!requestRow.share_token) {
    console.error("richiesta pagata priva di share_token", {
      eventId: event.id,
      requestId,
    });
    return new Response("missing share token", { status: 500 });
  }

  /* Claim durevole: un solo delivery invia la mail. Un processo morto può essere reclamato dopo
     dieci minuti; l'idempotency key per richiesta impedisce la doppia mail dopo un crash post-send. */
  if (requestRow.notification_status === "sending") {
    const claimedAt = Date.parse(
      String(requestRow.notification_claimed_at ?? ""),
    );
    if (Number.isFinite(claimedAt) && claimedAt > Date.now() - CLAIM_STALE_MS) {
      return new Response("notification already processing", { status: 500 });
    }
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
    const { error: recoveryError } = await supabase.from(
      "consultation_requests",
    ).update({
      notification_status: "pending",
      notification_claimed_at: null,
    }).eq("id", requestId).eq("notification_status", "sending")
      .or(
        `notification_claimed_at.is.null,notification_claimed_at.lte.${staleBefore}`,
      );
    if (recoveryError) {
      console.error("recupero claim notifica fallito:", recoveryError.message);
      return new Response("db error", { status: 500 });
    }
  }

  const claimTime = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase.from(
    "consultation_requests",
  )
    .update({
      notification_status: "sending",
      notification_claimed_at: claimTime,
      notification_last_error: null,
    })
    .eq("id", requestId)
    .in("notification_status", ["none", "pending"])
    .eq("paid", true)
    .in("status", ["paid", "in_progress", "completed"])
    .is("share_revoked_at", null)
    .gt("share_expires_at", claimTime)
    .select("name,email,product,amount,share_token,notification_attempts")
    .maybeSingle();
  if (claimError) {
    console.error("claim notifica fallito:", claimError.message);
    return new Response("db error", { status: 500 });
  }
  if (!claimed) {
    const { data: current } = await supabase.from("consultation_requests")
      .select("notification_status").eq("id", requestId).maybeSingle();
    if (current?.notification_status === "sent") {
      return json({ received: true, fulfilled: true, duplicate: true });
    }
    if (current?.notification_status === "failed") {
      return json({
        received: true,
        fulfilled: true,
        notification_delivered: false,
        manual_review: true,
      });
    }
    return new Response("notification claim busy", { status: 500 });
  }

  const preNotificationLifecycle = await knownLifecycleBlockResponse({
    supabase,
    sessionId,
    requestId,
    requestReference,
    paymentIntentId,
  });
  if (preNotificationLifecycle) return preNotificationLifecycle;

  const { subject, html } = buildPaidEmail({
    name: claimed.name,
    email: claimed.email,
    product: claimed.product,
    amount: claimed.amount,
    viewUrl: `https://stageplot.it/?view=${claimed.share_token}`,
  });
  let mailResult: { ok: boolean; status: number };
  try {
    mailResult = await sendEmail({
      apiKey: Deno.env.get("RESEND_API_KEY")!,
      to: Deno.env.get("NOTIFY_EMAIL")!,
      subject,
      html,
      idempotencyKey: `consultation-${requestId}`,
    });
  } catch (error) {
    console.error("mail pagamento fallita:", error);
    mailResult = { ok: false, status: 0 };
  }

  const attempts = nextOutboxAttempt(claimed.notification_attempts);
  if (!mailResult.ok) {
    const nextStatus = outboxStatusAfterAttempt(false, attempts);
    const { data: failedDelivery, error: failedDeliveryError } = await supabase
      .from("consultation_requests").update({
        notification_status: nextStatus,
        notification_attempts: attempts,
        notification_last_error: `resend_${mailResult.status}`,
        notification_claimed_at: null,
      }).eq("id", requestId).eq("notification_status", "sending")
      .eq("notification_claimed_at", claimTime)
      .select("id")
      .maybeSingle();
    if (failedDeliveryError || !failedDelivery) {
      console.error(
        "stato notifica fallita non aggiornato:",
        failedDeliveryError?.message ?? "claim perso",
      );
      return new Response("db error", { status: 500 });
    }
    if (nextStatus === "failed") {
      return json({
        received: true,
        fulfilled: true,
        notification_delivered: false,
        manual_review: true,
      });
    }
    return new Response("notification error", { status: 500 });
  }

  const { data: sent, error: sentError } = await supabase.from(
    "consultation_requests",
  ).update({
    notification_status: "sent",
    notification_attempts: attempts,
    notification_last_error: null,
    notification_claimed_at: null,
  }).eq("id", requestId).eq("notification_status", "sending")
    .eq("notification_claimed_at", claimTime)
    .select("id")
    .maybeSingle();
  if (sentError || !sent) {
    console.error(
      "stato notifica non aggiornato:",
      sentError?.message ?? "claim perso",
    );
    return new Response("db error", { status: 500 });
  }

  return json({ received: true, fulfilled: true });
});
