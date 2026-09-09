// supabase/functions/orc-respond/index.ts
//
// La porta del musicista convocato. Il link (/orchestre/rispondi/?t=TOKEN) parla solo con questa
// funzione, che gira con service role e delega al database le due RPC riservate:
//   GET  ?t=TOKEN                  → orc_invitation_open: il pacchetto per la pagina, marca «visualizzato»
//   POST ?t=TOKEN {answer,dates,note} → orc_respond: registra sì / no / solo alcune date
// Il client anonimo non ha nessuna policy: se questa funzione dicesse di sì per sbaglio non ci sarebbe
// una seconda rete. Fail-closed: token non plausibile = 404 identico a un token inesistente.
import { createClient } from "jsr:@supabase/supabase-js@2.108.2";
import { serviceRoleKey } from "../_shared/service-role-key.ts";
import { DENY_TEXT, hashToken, isPlausibleToken, parseAnswer } from "../_shared/orc-invitations.ts";

/* in locale (supabase start) il browser di prova sta su 127.0.0.1:8077: si apre l'origine; in produzione
   resta stageplot.it e basta */
const LOCAL = /127\.0\.0\.1|localhost/.test(Deno.env.get("SUPABASE_URL") ?? "");
const corsHeaders = {
  "Access-Control-Allow-Origin": LOCAL ? "*" : "https://stageplot.it",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

const MAX_BODY = 16 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_WRITES = 20;

function denied(error: string) {
  const status = error === "not_found" ? 404 : error === "expired" || error === "revoked" ? 410 : error === "locked" ? 409 : 400;
  return json({ error, message: DENY_TEXT[error] ?? DENY_TEXT.not_found }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (!isPlausibleToken(token)) return denied("not_found");

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey(Deno.env), { auth: { persistSession: false } });
  const tokenHash = await hashToken(token);

  if (req.method === "GET") {
    const { data, error } = await supabase.rpc("orc_invitation_open", { token_hash_in: tokenHash });
    if (error) return json({ error: "server" }, 500);
    if (data?.error) return denied(String(data.error));
    return json(data);
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413);
  let body: unknown;
  try { body = JSON.parse(raw || "{}"); } catch { return json({ error: "bad_json" }, 400); }
  const parsed = parseAnswer(body);
  if (!parsed.ok) return json({ error: parsed.error, message: "Risposta non capita: riprova dalla pagina." }, 422);

  /* anti-abuso senza tabelle nuove: quante risposte ha scritto questo link nell'ultimo minuto */
  const { data: inv } = await supabase.from("orc_invitations").select("id").eq("token_hash", tokenHash).maybeSingle();
  if (!inv) return denied("not_found");
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = await supabase.from("orc_invitation_events").select("id", { count: "exact", head: true })
    .eq("invitation_id", inv.id).eq("event", "responded").gte("at", since);
  if ((count ?? 0) >= RATE_MAX_WRITES) return json({ error: "rate_limited" }, 429);

  const { data, error } = await supabase.rpc("orc_respond", { token_hash_in: tokenHash, answer: parsed.answer, dates: parsed.dates, note: parsed.note });
  if (error) return json({ error: "server" }, 500);
  if (data?.error) return denied(String(data.error));
  return json({ ok: true, status: data.status });
});
