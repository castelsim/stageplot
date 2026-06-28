// supabase/functions/stripe-webhook/index.ts
import Stripe from "https://esm.sh/stripe@16?target=deno";
import { createClient } from "jsr:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig!, Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
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

    await supabase.from("consultation_payments").upsert({
      stripe_session_id: sessionId, email, amount,
      product: (s.metadata?.product as string) ?? null, paid_at: new Date().toISOString(),
    }, { onConflict: "stripe_session_id" });

    // Se il brief è già stato inviato, marcalo pagato.
    await supabase.from("consultation_requests")
      .update({ paid: true, paid_at: new Date().toISOString(), amount })
      .eq("stripe_session_id", sessionId);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
