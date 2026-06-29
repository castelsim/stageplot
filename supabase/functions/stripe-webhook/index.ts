// supabase/functions/stripe-webhook/index.ts
import Stripe from "https://esm.sh/stripe@16?target=deno";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildPaidEmail } from "../_shared/paid-email.ts";
import { sendEmail } from "../_shared/email.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig, Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
    );
  } catch (e) {
    console.error("firma webhook non valida:", e);
    return new Response("invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const sessionId = s.id;
    const email = s.customer_details?.email ?? s.customer_email ?? null;
    const amount = s.amount_total ?? null;

    const { error: upErr } = await supabase.from("consultation_payments").upsert({
      stripe_session_id: sessionId, email, amount,
      product: (s.metadata?.product as string) ?? null, paid_at: new Date().toISOString(),
    }, { onConflict: "stripe_session_id" });
    if (upErr) {
      console.error("upsert pagamento fallito:", upErr);
      return new Response("db error", { status: 500 });
    }

    // Se il brief è già stato inviato, marcalo pagato.
    const { error: updErr } = await supabase.from("consultation_requests")
      .update({ paid: true, paid_at: new Date().toISOString(), amount })
      .eq("stripe_session_id", sessionId);
    if (updErr) {
      console.error("update richiesta fallito:", updErr);
      return new Response("db error", { status: 500 });
    }

    // Flusso minimale: la richiesta è pre-creata, legata via client_reference_id.
    // Guard UUID: un client_reference_id malformato non deve generare un cast error
    // Postgres (500 → loop di retry Stripe che disabilita l'endpoint).
    const requestId = s.client_reference_id ?? null;
    if (requestId && /^[0-9a-fA-F-]{36}$/.test(requestId)) {
      // .eq("paid", false): idempotenza — su redelivery di Stripe la riga è già
      // paid=true, l'update matcha 0 righe (reqRow null) e la mail NON viene re-inviata.
      const { data: reqRow, error: refErr } = await supabase.from("consultation_requests")
        .update({ paid: true, paid_at: new Date().toISOString(), amount })
        .eq("id", requestId)
        .eq("paid", false)
        .select("name,email,product,amount,share_token")
        .maybeSingle();
      if (refErr) {
        console.error("update richiesta (client_reference_id) fallito:", refErr);
        return new Response("db error", { status: 500 });
      }
      if (reqRow?.share_token) {
        try {
          const { subject, html } = buildPaidEmail({
            name: reqRow.name, email: reqRow.email, product: reqRow.product,
            amount: reqRow.amount, viewUrl: `https://stageplot.it/?view=${reqRow.share_token}`,
          });
          await sendEmail({
            apiKey: Deno.env.get("RESEND_API_KEY")!,
            to: Deno.env.get("NOTIFY_EMAIL")!, subject, html,
          });
        } catch (e) { console.error("mail pagamento fallita:", e); }
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
