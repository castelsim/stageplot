// supabase/functions/submit-consultation/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { validateBrief, validateUploadRequest } from "../_shared/validation.ts";
import { buildEmailHtml, sendEmail } from "../_shared/email.ts";

const BUCKET = "consultation-uploads";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const action = new URL(req.url).searchParams.get("action");
  const payload = await req.json().catch(() => null);

  if (action === "prepare-upload") {
    const v = validateUploadRequest((payload as { files?: unknown })?.files);
    if (!v.ok) return json({ error: v.error }, 400);
    const uploads: { path: string; signedUrl: string }[] = [];
    for (const f of v.value) {
      const path = `${crypto.randomUUID()}/${f.name}`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) return json({ error: error.message }, 500);
      uploads.push({ path, signedUrl: data.signedUrl });
    }
    return json({ uploads });
  }

  if (action === "submit") {
    const v = validateBrief(payload);
    if (!v.ok) return json({ error: v.error }, 400);
    const b = v.value;

    // Lega il pagamento se presente
    let paid = false, amount: number | null = null, product: string | null = null, paidAt: string | null = null;
    if (b.stripe_session_id) {
      const { data: pay, error: payErr } = await supabase.from("consultation_payments")
        .select("*").eq("stripe_session_id", b.stripe_session_id).maybeSingle();
      if (payErr) console.error("lookup pagamento fallito:", payErr.message);
      if (pay) { paid = true; amount = pay.amount; product = pay.product; paidAt = pay.paid_at; }
    }

    const { data: row, error } = await supabase.from("consultation_requests").insert({
      name: b.name, email: b.email, event_type: b.event_type, date_place: b.date_place,
      lineup: b.lineup, materials: b.materials, notes: b.notes,
      attachments: b.attachments ?? [], stripe_session_id: b.stripe_session_id ?? null,
      paid, paid_at: paidAt, amount, product,
    }).select("id").single();
    if (error) return json({ error: error.message }, 500);

    // Link firmati per gli allegati (7 giorni)
    const attachmentUrls: string[] = [];
    for (const p of (b.attachments ?? [])) {
      const { data: sig, error: sigErr } = await supabase.storage.from(BUCKET).createSignedUrl(p, 60 * 60 * 24 * 7);
      if (sigErr) console.error("signed url allegato fallito:", sigErr.message);
      if (sig?.signedUrl) attachmentUrls.push(sig.signedUrl);
    }

    // Email (non blocca: se fallisce, la riga è già salvata)
    try {
      const { subject, html } = buildEmailHtml(b, { paid, attachmentUrls });
      await sendEmail({
        apiKey: Deno.env.get("RESEND_API_KEY")!,
        to: Deno.env.get("NOTIFY_EMAIL")!, subject, html,
      });
    } catch (e) { console.error("email fallita:", e); }

    return json({ ok: true, id: row.id });
  }

  return json({ error: "azione sconosciuta" }, 400);
});
