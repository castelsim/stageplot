// supabase/functions/orc-invite-notify/index.ts
//
// Manda SUBITO le convocazioni in coda di UNA produzione: gli inviti appena creati, i promemoria, le
// conferme e le revoche. La chiama la pagina dello staff dopo ognuna di queste azioni.
//
// Perché subito: il worker `orc-notify` gira col cron di GitHub, che sui repository poco attivi dirada i
// giri da solo — nel collaudo dell'11/09 la pagina prometteva «entro dieci minuti» e passavano ore. Il
// worker resta la rete di sicurezza: quello che qui non parte resta «pending» e lo riprende lui.
//
// Chi può chiamarla: lo staff dell'organizzazione della produzione. Il JWT lo verifica Supabase
// (verify_jwt) e qui si controlla l'appartenenza: nessuno deve poter far spedire email a nome di una
// società che non è la sua. Si spedisce solo quello che è già in coda nel database: questa funzione non
// decide chi convocare, lo ha già deciso `orc_invite`.
import { createClient } from "jsr:@supabase/supabase-js@2.108.2";
import { corsHeaders } from "../_shared/cors.ts";
import { serviceRoleKey } from "../_shared/service-role-key.ts";
import { dispatchInvitations } from "../_shared/orc-invite-dispatch.ts";

const STAFF = ["owner", "admin", "artistic", "production"];
const LIMITE = 60;   /* un organico intero in una volta; il resto lo prende il worker */

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const payload = await req.json().catch(() => null) as { production_id?: string } | null;
  const id = String(payload?.production_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return json({ error: "produzione non valida" }, 400);

  const roleKey = serviceRoleKey(Deno.env);
  if (!roleKey) return json({ error: "service role key missing" }, 503);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, roleKey, { auth: { persistSession: false } });

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "non autenticato" }, 401);

  const { data: p, error } = await supabase.from("orc_productions").select("id,org_id").eq("id", id).maybeSingle();
  if (error) { console.error("orc-invite-notify lettura:", error.message); return json({ error: "errore" }, 500); }
  if (!p) return json({ error: "produzione non trovata" }, 404);
  const { data: m } = await supabase.from("orc_memberships").select("role").eq("org_id", p.org_id).eq("user_id", userData.user.id).maybeSingle();
  if (!m || !STAFF.includes(String(m.role))) return json({ error: "non della tua organizzazione" }, 403);

  const mode = (Deno.env.get("ORC_EMAIL_MODE") ?? "send").toLowerCase();
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (mode !== "log" && !resendKey) return json({ error: "notification provider not configured" }, 503);
  const base = Deno.env.get("ORC_PUBLIC_BASE") ?? "https://stageplot.it";
  try {
    const counts = await dispatchInvitations(supabase, { resendKey, mode, base, productionId: id, limit: LIMITE });
    return json({ ok: true, ...counts });
  } catch (e) {
    console.error("orc-invite-notify fallito:", e instanceof Error ? e.message : "unknown");
    return json({ error: "invio non riuscito" }, 500);
  }
});
