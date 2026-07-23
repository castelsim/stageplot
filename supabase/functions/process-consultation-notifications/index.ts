import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.108.2";
import { sendEmail } from "../_shared/email.ts";
import { buildPaidEmail } from "../_shared/paid-email.ts";
import {
  nextOutboxAttempt,
  notificationCandidateIsActive,
  outboxBatchHasFailures,
  outboxStatusAfterAttempt,
} from "../_shared/notification-outbox.ts";

const CLAIM_STALE_MS = 10 * 60 * 1000;
const BATCH_SIZE = 10;
type DbClient = SupabaseClient;
type Counts = { sent: number; failed: number; skipped: number };
type DeadLetters = {
  paid: number;
  payments: number;
  lifecycle: number;
  total: number;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function esc(value: unknown): string {
  return String(value ?? "—").replace(
    /[&<>]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]!),
  );
}

async function secretMatches(
  received: string,
  expected: string,
): Promise<boolean> {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let different = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    different |= a[index] ^ b[index];
  }
  return different === 0;
}

async function resetStaleClaims(
  supabase: DbClient,
  nowMs: number,
): Promise<void> {
  const staleBefore = new Date(nowMs - CLAIM_STALE_MS).toISOString();
  const resets = await Promise.all([
    supabase.from("consultation_requests").update({
      notification_status: "pending",
      notification_claimed_at: null,
      notification_last_error: "stale_claim_recovered",
    }).eq("notification_status", "sending")
      .or(
        `notification_claimed_at.is.null,notification_claimed_at.lt.${staleBefore}`,
      )
      .eq("paid", true)
      .in("status", ["paid", "in_progress", "completed"])
      .is("share_revoked_at", null),
    supabase.from("consultation_payments").update({
      alert_status: "pending",
      alert_claimed_at: null,
      alert_last_error: "stale_claim_recovered",
    }).eq("alert_status", "sending")
      .or(`alert_claimed_at.is.null,alert_claimed_at.lt.${staleBefore}`),
    supabase.from("consultation_payment_lifecycle").update({
      alert_status: "pending",
      alert_claimed_at: null,
      alert_last_error: "stale_claim_recovered",
    }).eq("alert_status", "sending")
      .or(`alert_claimed_at.is.null,alert_claimed_at.lt.${staleBefore}`),
    supabase.from("consultation_payments").update({
      association_status: "evaluation_timeout",
      alert_status: "pending",
      alert_reason: "evaluation_timeout",
      alert_claimed_at: null,
      alert_last_error: "webhook_evaluation_timeout",
      evaluation_started_at: null,
    }).eq("alert_status", "none")
      .in("association_status", ["received", "evaluating"])
      .lt("evaluation_started_at", staleBefore),
  ]);
  for (const reset of resets) {
    if (reset.error) throw new Error(reset.error.message);
  }
}

async function processPaidNotifications(
  supabase: DbClient,
  nowMs: number,
  resendKey: string,
  notifyEmail: string,
): Promise<Counts> {
  const counts: Counts = { sent: 0, failed: 0, skipped: 0 };
  const { data: candidates, error } = await supabase.from(
    "consultation_requests",
  )
    .select(
      "id,name,email,product,amount,share_token,share_expires_at,share_revoked_at,paid,status,payment_intent_id,notification_status,notification_attempts",
    )
    .eq("notification_status", "pending")
    .order("notification_attempts", { ascending: true })
    .order("paid_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) throw new Error(error.message);

  for (const candidate of candidates ?? []) {
    if (!notificationCandidateIsActive(candidate, nowMs)) {
      await supabase.from("consultation_requests").update({
        notification_status: "blocked",
        notification_last_error: "inactive_or_invalid_request",
        notification_claimed_at: null,
      }).eq("id", candidate.id).eq("notification_status", "pending");
      counts.skipped++;
      continue;
    }

    const claimTime = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase.from(
      "consultation_requests",
    ).update({
      notification_status: "sending",
      notification_claimed_at: claimTime,
      notification_last_error: null,
    }).eq("id", candidate.id)
      .eq("notification_status", "pending")
      .eq("paid", true)
      .in("status", ["paid", "in_progress", "completed"])
      .is("share_revoked_at", null)
      .gt("share_expires_at", new Date(nowMs).toISOString())
      .select(
        "id,name,email,product,amount,share_token,payment_intent_id,notification_attempts",
      )
      .maybeSingle();
    if (claimError) {
      counts.failed++;
      continue;
    }
    if (!claimed) {
      counts.skipped++;
      continue;
    }

    if (claimed.payment_intent_id) {
      const { data: blocking, error: blockError } = await supabase.from(
        "consultation_payment_lifecycle",
      ).select("stripe_event_id")
        .eq("payment_intent_id", claimed.payment_intent_id)
        .in("status", ["refunded", "disputed"])
        .limit(1)
        .maybeSingle();
      if (blockError) {
        await supabase.from("consultation_requests").update({
          notification_status: "pending",
          notification_last_error: "lifecycle_lookup_failed",
          notification_claimed_at: null,
        }).eq("id", claimed.id).eq("notification_claimed_at", claimTime);
        counts.failed++;
        continue;
      }
      if (blocking) {
        await supabase.from("consultation_requests").update({
          notification_status: "blocked",
          notification_last_error: "stripe_lifecycle_block",
          notification_claimed_at: null,
        }).eq("id", claimed.id).eq("notification_claimed_at", claimTime);
        counts.skipped++;
        continue;
      }
    }

    const { subject, html } = buildPaidEmail({
      name: claimed.name,
      email: claimed.email,
      product: claimed.product,
      amount: claimed.amount,
      viewUrl: `https://stageplot.it/?view=${claimed.share_token}`,
    });
    let result: { ok: boolean; status: number };
    try {
      result = await sendEmail({
        apiKey: resendKey,
        to: notifyEmail,
        subject,
        html,
        idempotencyKey: `consultation-${claimed.id}`,
      });
    } catch {
      result = { ok: false, status: 0 };
    }
    const attempts = nextOutboxAttempt(claimed.notification_attempts);
    const nextStatus = outboxStatusAfterAttempt(result.ok, attempts);
    const { data: finished, error: finishError } = await supabase.from(
      "consultation_requests",
    ).update({
      notification_status: nextStatus,
      notification_attempts: attempts,
      notification_last_error: result.ok ? null : `resend_${result.status}`,
      notification_claimed_at: null,
    }).eq("id", claimed.id)
      .eq("notification_status", "sending")
      .eq("notification_claimed_at", claimTime)
      .select("id")
      .maybeSingle();
    if (finishError || !finished || !result.ok) counts.failed++;
    else counts.sent++;
  }
  return counts;
}

async function processPaymentAlerts(
  supabase: DbClient,
  resendKey: string,
  notifyEmail: string,
): Promise<Counts> {
  const counts: Counts = { sent: 0, failed: 0, skipped: 0 };
  const { data: candidates, error } = await supabase.from(
    "consultation_payments",
  )
    .select(
      "stripe_session_id,email,amount,currency,request_reference,association_status,alert_reason,alert_status,alert_attempts,alert_claimed_at",
    )
    .eq("alert_status", "pending")
    .order("alert_attempts", { ascending: true })
    .order("paid_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) throw new Error(error.message);

  for (const candidate of candidates ?? []) {
    if (
      candidate.alert_status !== "pending" ||
      !candidate.stripe_session_id
    ) {
      counts.skipped++;
      continue;
    }
    const claimTime = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase.from(
      "consultation_payments",
    ).update({
      alert_status: "sending",
      alert_claimed_at: claimTime,
      alert_last_error: null,
    }).eq("stripe_session_id", candidate.stripe_session_id)
      .eq("alert_status", "pending")
      .select(
        "stripe_session_id,email,amount,currency,request_reference,association_status,alert_reason,alert_attempts",
      )
      .maybeSingle();
    if (claimError) {
      counts.failed++;
      continue;
    }
    if (!claimed) {
      counts.skipped++;
      continue;
    }
    const amountText = typeof claimed.amount === "number"
      ? `${(claimed.amount / 100).toFixed(2)} ${
        String(claimed.currency ?? "").toUpperCase()
      }`
      : "—";
    const alertReason = claimed.alert_reason ?? claimed.association_status;
    const subject =
      `URGENTE — pagamento consulenza da verificare — ${alertReason}`;
    const html = `<h2>Pagamento da verificare</h2>` +
      `<p><strong>Motivo:</strong> ${esc(alertReason)}</p>` +
      `<p><strong>Richiesta:</strong> ${esc(claimed.request_reference)}</p>` +
      `<p><strong>Email Stripe:</strong> ${esc(claimed.email)}</p>` +
      `<p><strong>Importo:</strong> ${esc(amountText)}</p>` +
      `<p><strong>Checkout Session:</strong> ${
        esc(claimed.stripe_session_id)
      }</p>` +
      `<p>Verificare subito pagamento, associazione e rimborso in Stripe.</p>`;
    let result: { ok: boolean; status: number };
    try {
      result = await sendEmail({
        apiKey: resendKey,
        to: notifyEmail,
        subject,
        html,
        idempotencyKey: `payment-alert-${claimed.stripe_session_id}`,
      });
    } catch {
      result = { ok: false, status: 0 };
    }
    const attempts = nextOutboxAttempt(claimed.alert_attempts);
    const nextStatus = outboxStatusAfterAttempt(result.ok, attempts);
    const { data: finished, error: finishError } = await supabase.from(
      "consultation_payments",
    ).update({
      alert_status: nextStatus,
      alert_attempts: attempts,
      alert_last_error: result.ok ? null : `resend_${result.status}`,
      alert_claimed_at: null,
    }).eq("stripe_session_id", claimed.stripe_session_id)
      .eq("alert_status", "sending")
      .eq("alert_claimed_at", claimTime)
      .select("stripe_session_id")
      .maybeSingle();
    if (finishError || !finished || !result.ok) counts.failed++;
    else counts.sent++;
  }
  return counts;
}

async function processLifecycleAlerts(
  supabase: DbClient,
  resendKey: string,
  notifyEmail: string,
): Promise<Counts> {
  const counts: Counts = { sent: 0, failed: 0, skipped: 0 };
  const { data: candidates, error } = await supabase.from(
    "consultation_payment_lifecycle",
  )
    .select(
      "stripe_event_id,payment_intent_id,status,alert_status,alert_attempts,alert_claimed_at",
    )
    .eq("alert_status", "pending")
    .in("status", ["partially_refunded", "refund_failed"])
    .order("alert_attempts", { ascending: true })
    .order("occurred_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) throw new Error(error.message);

  for (const candidate of candidates ?? []) {
    const claimTime = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase.from(
      "consultation_payment_lifecycle",
    ).update({
      alert_status: "sending",
      alert_claimed_at: claimTime,
      alert_last_error: null,
    }).eq("stripe_event_id", candidate.stripe_event_id)
      .eq("alert_status", "pending")
      .select("stripe_event_id,payment_intent_id,status,alert_attempts")
      .maybeSingle();
    if (claimError) {
      counts.failed++;
      continue;
    }
    if (!claimed) {
      counts.skipped++;
      continue;
    }
    const title = claimed.status === "refund_failed"
      ? "Rimborso fallito"
      : "Rimborso parziale";
    const subject = `ATTENZIONE — ${title.toLowerCase()} — consulenza`;
    const html = `<h2>${title} da verificare</h2>` +
      `<p><strong>PaymentIntent:</strong> ${
        esc(claimed.payment_intent_id)
      }</p>` +
      `<p><strong>Evento Stripe:</strong> ${esc(claimed.stripe_event_id)}</p>` +
      `<p>Nessuna riattivazione viene eseguita automaticamente. Verificare lo stato corrente in Stripe e gestire il cliente.</p>`;
    let result: { ok: boolean; status: number };
    try {
      result = await sendEmail({
        apiKey: resendKey,
        to: notifyEmail,
        subject,
        html,
        idempotencyKey: `lifecycle-alert-${claimed.stripe_event_id}`,
      });
    } catch {
      result = { ok: false, status: 0 };
    }
    const attempts = nextOutboxAttempt(claimed.alert_attempts);
    const nextStatus = outboxStatusAfterAttempt(result.ok, attempts);
    const { data: finished, error: finishError } = await supabase.from(
      "consultation_payment_lifecycle",
    ).update({
      alert_status: nextStatus,
      alert_attempts: attempts,
      alert_last_error: result.ok ? null : `resend_${result.status}`,
      alert_claimed_at: null,
    }).eq("stripe_event_id", claimed.stripe_event_id)
      .eq("alert_status", "sending")
      .eq("alert_claimed_at", claimTime)
      .select("stripe_event_id")
      .maybeSingle();
    if (finishError || !finished || !result.ok) counts.failed++;
    else counts.sent++;
  }
  return counts;
}

async function countDeadLetters(supabase: DbClient): Promise<DeadLetters> {
  const [paidResult, paymentsResult, lifecycleResult] = await Promise.all([
    supabase.from("consultation_requests")
      .select("id", { count: "exact", head: true })
      .eq("notification_status", "failed"),
    supabase.from("consultation_payments")
      .select("stripe_session_id", { count: "exact", head: true })
      .eq("alert_status", "failed"),
    supabase.from("consultation_payment_lifecycle")
      .select("stripe_event_id", { count: "exact", head: true })
      .eq("alert_status", "failed"),
  ]);
  for (const result of [paidResult, paymentsResult, lifecycleResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const paid = paidResult.count ?? 0;
  const payments = paymentsResult.count ?? 0;
  const lifecycle = lifecycleResult.count ?? 0;
  return {
    paid,
    payments,
    lifecycle,
    total: paid + payments + lifecycle,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const expectedSecret = Deno.env.get("CONSULTATION_WORKER_SECRET") ?? "";
  const receivedSecret = req.headers.get("x-stageplot-worker-secret") ?? "";
  if (!expectedSecret) return json({ error: "worker not configured" }, 503);
  if (!await secretMatches(receivedSecret, expectedSecret)) {
    return json({ error: "unauthorized" }, 401);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const notifyEmail = Deno.env.get("NOTIFY_EMAIL") ?? "";
  if (!resendKey || !notifyEmail) {
    return json({ error: "notification provider not configured" }, 503);
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const nowMs = Date.now();
  try {
    await resetStaleClaims(supabase, nowMs);
    const paid = await processPaidNotifications(
      supabase,
      nowMs,
      resendKey,
      notifyEmail,
    );
    const payments = await processPaymentAlerts(
      supabase,
      resendKey,
      notifyEmail,
    );
    const lifecycle = await processLifecycleAlerts(
      supabase,
      resendKey,
      notifyEmail,
    );
    const deadLetters = await countDeadLetters(supabase);
    const failed = outboxBatchHasFailures([
      paid,
      payments,
      lifecycle,
      { failed: deadLetters.total },
    ]);
    return json(
      { ok: !failed, paid, payments, lifecycle, deadLetters },
      failed ? 503 : 200,
    );
  } catch (error) {
    console.error(
      "worker notifiche fallito:",
      error instanceof Error ? error.message : "unknown",
    );
    return json({ error: "worker failed" }, 500);
  }
});
