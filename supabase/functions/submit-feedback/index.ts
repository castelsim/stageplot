// supabase/functions/submit-feedback/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { validateFeedback } from "../_shared/feedback-validation.ts";
import { buildFeedbackEmail } from "../_shared/feedback-prompt.ts";
import { sendEmail } from "../_shared/email.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ipHash(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + salt));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const payload = await req.json().catch(() => null);
  const v = validateFeedback(payload);
  if (!v.ok) {
    if (v.error === "spam") return json({ ok: true }); // honeypot: finto successo, nessun insert
    return json({ error: v.error }, 400);
  }
  const f = v.value;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Rate-limit per IP hashato (best-effort: se manca IP o salt, si salta)
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const salt = Deno.env.get("FEEDBACK_IP_SALT") || "";
  if (ip && salt) {
    const h = await ipHash(ip, salt);
    const { data: count, error: rlErr } = await supabase.rpc("feedback_throttle_hit", { p_ip_hash: h });
    if (rlErr) console.error("throttle fallito:", rlErr.message);
    else if (typeof count === "number" && count > 5) return json({ error: "troppi invii, riprova più tardi" }, 429);
  }

  const { data: row, error } = await supabase.from("feedback").insert({
    message: f.message, hint: f.hint,
    user_id: f.user_id, user_email: f.user_email, project_id: f.project_id,
    app_version: f.meta.app_version ?? null, page_url: f.meta.page_url ?? null,
    user_agent: f.meta.user_agent ?? null, viewport: f.meta.viewport ?? null, language: f.meta.language ?? null,
    tech_context: f.tech_context, project_snapshot: f.project_snapshot,
  }).select("id").single();
  if (error) { console.error("insert feedback:", error.message); return json({ error: "errore interno" }, 500); }

  // Email best-effort col prompt Claude (se fallisce, la riga è già salvata)
  try {
    const { subject, html } = buildFeedbackEmail(f);
    await sendEmail({ apiKey: Deno.env.get("RESEND_API_KEY")!, to: Deno.env.get("NOTIFY_EMAIL")!, subject, html });
  } catch (e) { console.error("email feedback fallita:", e); }

  return json({ ok: true, id: row.id });
});
