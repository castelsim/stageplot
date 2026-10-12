// supabase/functions/_shared/bgl-avvisa.ts
//
// BIGLIETTERIA — «Avvisa per mail» dopo «Sposta» (specifica area §4.1). La chiama l'area dell'organizzatore con il SUO
// token; chi può avvisare chi lo decide il database (bgl_avviso_spostamento: proprietario abilitato, prenotazione
// spostata nell'ultima ora, al massimo 3 avvisi). Mai una mail in locale o senza RESEND_API_KEY.

import { bglCors } from "./bgl-cors.ts";
import { ambienteLocale, BGL_SITE_URL, type InvioMail, mailSpostamento } from "./bgl-mail.ts";
import { tentaInvio } from "./tenta-invio.ts";
import { tokenDa, type Utente } from "./bgl-utente.ts";
import type { EnvLike } from "./service-role-key.ts";

export const MAX_CORPO_AVVISA = 2 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTP: Record<string, number> = { non_abilitato: 403, non_tuo: 404, gia_disdetta: 409, dati_cancellati: 409, non_spostata: 409, troppi_avvisi: 429 };

export type DepsAvvisa = {
  utente: (token: string) => Promise<Utente | null>;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  invia: (a: InvioMail) => Promise<{ ok: boolean; status: number }>;
  env: EnvLike;
  log?: (m: string) => void;
};

export async function gestisciAvvisa(req: Request, deps: DepsAvvisa): Promise<Response> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const cors = bglCors(req.headers.get("origin"), deps.env.get("BGL_CORS_DEV") === "1");
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const no = (errore: string, s: number) => json({ ok: false, errore }, s);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  /* prima si legge tutto il corpo, poi si risponde (AGENTS §8: altrimenti 503 dopo due minuti) */
  const corpo = new Uint8Array(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (req.method !== "POST") return no("metodo_non_ammesso", 405);
  if (corpo.byteLength > MAX_CORPO_AVVISA) return no("richiesta_troppo_grande", 413);
  try {
    let x: Record<string, unknown> | null = null;
    try { x = JSON.parse(new TextDecoder().decode(corpo)); } catch { x = null; }
    const id = x && typeof x.prenotazione_id === "string" && UUID.test(x.prenotazione_id) ? x.prenotazione_id : null;
    if (!id) return no("dati_non_validi", 400);
    const token = tokenDa(req);
    const u = token ? await deps.utente(token) : null;
    if (!u) return no("non_autenticato", 401);
    const { data, error } = await deps.rpc("bgl_avviso_spostamento", { p_uid: u.id, p_prenotazione_id: id });
    if (error || !data || typeof data !== "object") { log("bgl-avvisa: database: " + (error ? error.message : "risposta vuota")); return no("errore_interno", 500); }
    const d = data as Record<string, unknown>;
    if (d.ok !== true) { const c = String(d.errore ?? ""); return c in HTTP ? no(c, HTTP[c]) : no("errore_interno", 500); }
    if (ambienteLocale(deps.env.get("SUPABASE_URL"))) { log("bgl-avvisa: mail non inviata: ambiente locale"); return json({ ok: true, mail: false }); }
    const chiave = (deps.env.get("RESEND_API_KEY") ?? "").trim();
    if (!chiave) { log("bgl-avvisa: mail non inviata: RESEND_API_KEY assente"); return json({ ok: true, mail: false }); }
    const ev = d.evento as { titolo: string; inizio: string; luogo: string; percorso: string };
    const base = (deps.env.get("BGL_SITE_URL") ?? "").trim() || BGL_SITE_URL;
    const m = mailSpostamento({ titolo: ev.titolo, inizio: ev.inizio, luogo: ev.luogo, posti: d.posti as string[], codice: String(d.codice),
      link: base + ev.percorso });
    const mail = await tentaInvio(() => deps.invia({ apiKey: chiave, to: String(d.email), ...m }));
    if (!mail) log("bgl-avvisa: mail non partita per la prenotazione " + String(d.codice));
    return json({ ok: true, mail });
  } catch (e) {
    log("bgl-avvisa: " + (e instanceof Error ? e.message : "errore"));
    return no("errore_interno", 500);
  }
}
