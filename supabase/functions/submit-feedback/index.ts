// supabase/functions/submit-feedback/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { validateFeedback } from "../_shared/feedback-validation.ts";
import { buildFeedbackEmail, feedbackAttachment } from "../_shared/feedback-prompt.ts";
import { sendEmail } from "../_shared/email.ts";
import { redactSnapshotForFeedback } from "../_shared/project-sharing.ts";
import { serviceRoleKey } from "../_shared/service-role-key.ts";

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
    serviceRoleKey(Deno.env),
  );

  // Identità dal JWT verificato, non dal client (audit S5): l'endpoint è pubblico
  // (verify_jwt=false, accetta feedback anche da anonimi), ma se arriva un Bearer valido
  // ne ricaviamo l'utente reale. Un payload con user_id/user_email arbitrari viene ignorato.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (jwt && jwt !== Deno.env.get("SUPABASE_ANON_KEY")) {
    const { data: u } = await supabase.auth.getUser(jwt);
    if (u?.user) { f.user_id = u.user.id; f.user_email = u.user.email ?? null; }
  }

  // Rate-limit per IP hashato (best-effort: se manca IP o salt, si salta)
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const salt = Deno.env.get("FEEDBACK_IP_SALT") || "";
  if (ip && salt) {
    const h = await ipHash(ip, salt);
    const { data: count, error: rlErr } = await supabase.rpc("feedback_throttle_hit", { p_ip_hash: h });
    if (rlErr) console.error("throttle fallito:", rlErr.message);
    else if (typeof count === "number" && count > 5) return json({ error: "troppi invii, riprova più tardi" }, 429);
  }

  // audit M-13: minimizza i contatti di terzi nello snapshot prima di archiviarlo (e prima dell'email)
  f.project_snapshot = redactSnapshotForFeedback(f.project_snapshot);

  // Schermata: prima sul bucket, poi il riferimento nella riga. Se il caricamento fallisce la
  // segnalazione parte lo stesso senza allegato — il messaggio di chi scrive vale più della foto.
  //
  // DUE COPIE, DI PROPOSITO (decisione di Simone, 18/08). Il bucket e l'allegato della mail sono
  // strade indipendenti: l'allegato si costruisce da f.screenshot, cioè dal corpo di QUESTA
  // richiesta, non rileggendo il bucket. Se il caricamento qui sotto fallisce, la mail parte lo
  // stesso con l'immagine attaccata. La copia nel bucket serve perché la mail è best-effort (sta
  // in un try che al massimo scrive nel log): senza bucket, una mail non consegnata porterebbe via
  // la schermata per sempre. E il triage da riga di comando (ops/segnalazioni.sh) legge da lì.
  // Il bucket scade a 30 giorni, la mail dura quanto la tieni.
  let screenshotPath: string | null = null;
  if (f.screenshot) {
    try {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(f.screenshot);
      if (m) {
        const bin = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
        const est = m[1].split("/")[1].replace("jpeg", "jpg");
        // nome che non dice niente di chi lo manda, e non collide
        const nome = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${est}`;
        const { error: upErr } = await supabase.storage.from("feedback-shots")
          .upload(nome, bin, { contentType: m[1], upsert: false });
        if (upErr) console.error("upload schermata:", upErr.message);
        else screenshotPath = nome;
      }
    } catch (e) { console.error("schermata non caricata:", String(e)); }
  }

  const { data: row, error } = await supabase.from("feedback").insert({
    message: f.message, hint: f.hint,
    user_id: f.user_id, user_email: f.user_email, project_id: f.project_id,
    app_version: f.meta.app_version ?? null, page_url: f.meta.page_url ?? null,
    user_agent: f.meta.user_agent ?? null, viewport: f.meta.viewport ?? null, language: f.meta.language ?? null,
    tech_context: f.tech_context, project_snapshot: f.project_snapshot,
    screenshot_path: screenshotPath,
  }).select("id").single();
  if (error) { console.error("insert feedback:", error.message); return json({ error: "errore interno" }, 500); }

  // Email best-effort col prompt Claude (se fallisce, la riga è già salvata)
  try {
    const { subject, html } = buildFeedbackEmail(f);
    const shot = feedbackAttachment(f);   // la schermata viaggia con la mail: nel bucket scade a 30 giorni
    await sendEmail({
      apiKey: Deno.env.get("RESEND_API_KEY")!, to: Deno.env.get("NOTIFY_EMAIL")!, subject, html,
      ...(shot ? { attachments: [shot] } : {}),
    });
  } catch (e) { console.error("email feedback fallita:", e); }

  return json({ ok: true, id: row.id });
});
