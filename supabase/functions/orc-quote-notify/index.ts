// supabase/functions/orc-quote-notify/index.ts
//
// Manda SUBITO al cliente l'email «il tuo preventivo è pronto». La chiama la pagina della società appena
// il preventivo è partito.
//
// Perché subito: il worker delle notifiche gira col cron di GitHub, che sui repository poco attivi dirada
// i giri da solo (il 10/09/2026 sono passate ore fra l'uno e l'altro). Il worker resta la rete di
// sicurezza: se qui l'invio non parte, la riga resta «pending» e la riprende lui.
//
// Chi può chiamarla: lo staff della società che ha fatto il preventivo. Il JWT lo verifica Supabase
// (verify_jwt), e qui si controlla comunque l'appartenenza: un utente qualunque non deve poter far
// spedire email a nome di una società.
//
// Cosa manda: descrizione e totali. Cachet, margine e note non vengono nemmeno letti dal database.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { serviceRoleKey } from "../_shared/service-role-key.ts";
import { sendEmail } from "../_shared/email.ts";
import { isReservedAddress } from "../_shared/orc-client-requests.ts";
import { buildQuoteEmail, quoteKey, type QuoteMailRow } from "../_shared/orc-quotes.ts";

const STAFF = ["owner", "admin", "artistic", "production"];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const payload = await req.json().catch(() => null) as { quote_id?: string } | null;
  const id = String(payload?.quote_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return json({ error: "preventivo non valido" }, 400);

  const roleKey = serviceRoleKey(Deno.env);
  if (!roleKey) return json({ error: "service role key missing" }, 503);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, roleKey, { auth: { persistSession: false } });

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "non autenticato" }, 401);

  /* solo i campi che il cliente può vedere: niente righe, niente margine, niente note */
  const { data: q, error } = await supabase.from("orc_quotes")
    .select("id,org_id,status,description,net_cents,vat_cents,total_cents,vat_pct,notify_status,notify_attempts,orc_client_requests(contact_name,contact_email,event_title,event_when),orc_organizations(name)")
    .eq("id", id).maybeSingle();
  if (error) { console.error("orc-quote-notify lettura:", error.message); return json({ error: "errore" }, 500); }
  if (!q) return json({ error: "preventivo non trovato" }, 404);

  const { data: m } = await supabase.from("orc_memberships").select("role").eq("org_id", q.org_id).eq("user_id", userData.user.id).maybeSingle();
  if (!m || !STAFF.includes(String(m.role))) return json({ error: "non della tua organizzazione" }, 403);

  if (q.status !== "sent" || q.notify_status !== "pending") return json({ ok: true, client: "niente da fare" });

  const r = q.orc_client_requests as { contact_name?: string; contact_email?: string; event_title?: string; event_when?: string } | null;
  const dest = String(r?.contact_email ?? "");
  if (!dest || isReservedAddress(dest)) {
    await supabase.from("orc_quotes").update({ notify_status: "none" }).eq("id", id);
    return json({ ok: true, client: "riservato" });
  }

  const mode = (Deno.env.get("ORC_EMAIL_MODE") ?? "send").toLowerCase();
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (mode !== "log" && !resendKey) return json({ error: "notification provider not configured" }, 503);
  const base = Deno.env.get("ORC_PUBLIC_BASE") ?? "https://stageplot.it";

  /* la presa è atomica: se il worker sta già spedendo questo preventivo, qui non si fa niente */
  const claim = await supabase.from("orc_quotes").update({ notify_status: "sending", notify_claimed_at: new Date().toISOString() })
    .eq("id", id).eq("notify_status", "pending").select("id");
  if (claim.error || !(claim.data ?? []).length) return json({ ok: true, client: "già in corso" });

  const row: QuoteMailRow = {
    id, description: q.description ?? "", net_cents: Number(q.net_cents), vat_cents: Number(q.vat_cents), total_cents: Number(q.total_cents),
    vat_pct: Number(q.vat_pct), event_title: r?.event_title ?? "", event_when: r?.event_when ?? "", contact_name: r?.contact_name ?? "",
    org_name: (q.orc_organizations as { name?: string } | null)?.name ?? "StagePlot",
  };
  const attempts = Number(q.notify_attempts ?? 0) + 1;
  const mail = buildQuoteEmail(row, base);
  let ok = false;
  if (mode === "log") { console.info("orc-quote-notify [log] →", dest, mail.subject); ok = true; }
  else ok = (await sendEmail({ apiKey: resendKey, to: dest, subject: mail.subject, html: mail.html, idempotencyKey: quoteKey(id, attempts) })).ok;
  /* se non parte adesso torna «pending»: il worker riprova da solo, non si perde niente */
  await supabase.from("orc_quotes").update({ notify_status: ok ? "sent" : "pending", notify_attempts: attempts, notify_claimed_at: null }).eq("id", id);
  return json({ ok: true, client: ok ? "sent" : "retry" });
});
