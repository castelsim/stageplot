// supabase/functions/orc-request-notify/index.ts
//
// Manda SUBITO le due email di una richiesta «Richiedi musicisti»: quella alla società e la conferma al
// cliente. La chiama la pagina appena la richiesta è stata creata.
//
// Perché esiste: le email erano affidate al worker che gira col cron di GitHub, e GitHub sui repository
// poco attivi dirada i giri da solo — il 10/09/2026 sono passate ore fra un giro e l'altro, e una richiesta
// vera è rimasta ferma. Il worker resta come rete di sicurezza (se questa chiamata fallisce o l'utente
// chiude la pagina, la riga è ancora «pending» e la prende lui), ma la strada normale è questa.
//
// Chi può chiamarla: solo chi ha mandato quella richiesta. Il JWT lo verifica Supabase (verify_jwt), e qui
// si controlla comunque che la riga sia sua: un utente autenticato non deve poter far spedire le richieste
// degli altri.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { serviceRoleKey } from "../_shared/service-role-key.ts";
import { sendEmail } from "../_shared/email.ts";
import { buildClientEmail, buildInternalEmail, type ClientRequestRow, isReservedAddress, requestKey } from "../_shared/orc-client-requests.ts";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const payload = await req.json().catch(() => null) as { request_id?: string } | null;
  const id = String(payload?.request_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return json({ error: "richiesta non valida" }, 400);
  }

  const roleKey = serviceRoleKey(Deno.env);
  if (!roleKey) return json({ error: "service role key missing" }, 503);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, roleKey, { auth: { persistSession: false } });

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "non autenticato" }, 401);
  const user = userData.user;

  const { data: row, error } = await supabase.from("orc_client_requests")
    .select("id,user_id,contact_name,contact_company,contact_email,account_email,contact_phone,event_kind,event_title,event_when,event_place,schedule,repertoire,budget,notes,created_at,snapshot,formation_unknown,notification_status,notification_attempts,ack_status,ack_attempts,orc_organizations(name),orc_client_request_slots(label,instrument_code,qty,covered)")
    .eq("id", id).maybeSingle();
  if (error) { console.error("orc-request-notify lettura:", error.message); return json({ error: "errore" }, 500); }
  if (!row) return json({ error: "richiesta non trovata" }, 404);
  if (row.user_id !== user.id) return json({ error: "non tua" }, 403);

  const mode = (Deno.env.get("ORC_EMAIL_MODE") ?? "send").toLowerCase();
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (mode !== "log" && !resendKey) return json({ error: "notification provider not configured" }, 503);
  const base = Deno.env.get("ORC_PUBLIC_BASE") ?? "https://stageplot.it";
  const notifyTo = Deno.env.get("NOTIFY_EMAIL") ?? "";

  const data = {
    ...row,
    org_name: (row.orc_organizations as { name?: string } | null)?.name ?? "StagePlot",
    slots: (row.orc_client_request_slots ?? []) as ClientRequestRow["slots"],
  } as unknown as ClientRequestRow;

  const out = { internal: "skipped", client: "skipped" };

  /* 1. alla società. La presa è atomica: se il worker sta già spedendo questa riga, qui non si fa niente. */
  if (row.notification_status === "pending" && notifyTo) {
    const claim = await supabase.from("orc_client_requests")
      .update({ notification_status: "sending", notification_claimed_at: new Date().toISOString() })
      .eq("id", id).eq("notification_status", "pending").select("id");
    if (!claim.error && (claim.data ?? []).length) {
      const attempts = Number(row.notification_attempts ?? 0) + 1;
      const m = buildInternalEmail(data, base);
      let ok = false;
      if (mode === "log") { console.info("orc-request-notify [log] →", notifyTo, m.subject); ok = true; }
      else ok = (await sendEmail({ apiKey: resendKey, to: notifyTo, subject: m.subject, html: m.html, idempotencyKey: requestKey(id, "internal", attempts) })).ok;
      /* se non parte adesso torna «pending»: il worker riprova da solo, non si perde niente */
      await supabase.from("orc_client_requests").update({
        notification_status: ok ? "sent" : "pending", notification_attempts: attempts,
        notification_claimed_at: null, notification_last_error: ok ? null : "immediate_failed",
      }).eq("id", id);
      out.internal = ok ? "sent" : "retry";
    }
  }

  /* 2. al cliente. Gli indirizzi di prova non ricevono niente. */
  if (row.ack_status === "pending") {
    /* all'indirizzo VERIFICATO dell'account (lo scrive il database dal login), mai a quello scritto nel
       modulo: altrimenti chiunque faceva arrivare dal nostro dominio un testo suo a una persona qualsiasi */
    const dest = String(row.account_email ?? "");
    if (!dest || isReservedAddress(dest)) {
      await supabase.from("orc_client_requests").update({ ack_status: "none" }).eq("id", id);
      out.client = "riservato";
    } else {
      const attempts = Number(row.ack_attempts ?? 0) + 1;
      const m = buildClientEmail(data);
      let ok = false;
      if (mode === "log") { console.info("orc-request-notify [log] conferma →", dest, m.subject); ok = true; }
      else ok = (await sendEmail({ apiKey: resendKey, to: dest, subject: m.subject, html: m.html, idempotencyKey: requestKey(id, "client", attempts) })).ok;
      await supabase.from("orc_client_requests").update({ ack_status: ok ? "sent" : "pending", ack_attempts: attempts }).eq("id", id);
      out.client = ok ? "sent" : "retry";
    }
  }

  return json({ ok: true, ...out });
});
