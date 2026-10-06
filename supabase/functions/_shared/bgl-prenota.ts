// supabase/functions/_shared/bgl-prenota.ts
//
// BIGLIETTERIA — tutta la logica della Edge Function `bgl-prenota`, con le dipendenze iniettate (database,
// invio della mail, ambiente) così si prova con `deno test` senza rete né database.
//
// Ordine (specifica §3.1): OPTIONS → metodo → si LEGGE tutto il corpo e poi si misura (rispondere prima di
// averlo letto dà un 503 dopo due minuti, AGENTS §8) → JSON → validazione → informativa spuntata → limite
// globale → limite per IP → `bgl_prenota` nel database → errori del database tradotti in HTTP → mail
// (dopo il database, mai un errore verso il pubblico se non parte) → 200.

import { bglCors } from "./bgl-cors.ts";
import { ambienteLocale, BGL_SITE_URL, type InvioMail, mailConferma } from "./bgl-mail.ts";
import { validaPrenotazione } from "./bgl-validazione.ts";
import { clientIp } from "./feedback-limits.ts";
import { tentaInvio } from "./tenta-invio.ts";
import type { EnvLike } from "./service-role-key.ts";

/** Il corpo più grande che si accetta: una prenotazione sta in poche centinaia di byte. */
export const MAX_CORPO = 8 * 1024;
/** Richieste di prenotazione in un'ora dalla stessa impronta di IP. */
export const MAX_ORA_IP = 20;
/** Richieste di prenotazione in un'ora da tutta internet (regge anche se l'IP è falso). */
export const MAX_ORA_GLOBALE = 600;
/** Il contatore globale usa la tabella dei limiti per IP con un'impronta che nessun IP può avere. */
export const CHIAVE_GLOBALE = "0".repeat(64);

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export type Deps = {
  rpc: Rpc;
  invia: (a: InvioMail) => Promise<{ ok: boolean; status: number }>;
  env: EnvLike;
  log?: (msg: string) => void;
};

/** Errore del database → stato HTTP. Quello che non è qui è un guasto: 500. */
const HTTP: Record<string, number> = {
  dati_non_validi: 400, privacy_mancante: 400, troppi_posti: 400, posto_inesistente: 400,
  evento_inesistente: 404,
  posto_preso: 409, posto_riservato: 409, limite_email: 409, prenotazioni_chiuse: 409,
};
/** I dettagli che passano al pubblico insieme al codice (mai altro di quello che risponde il database). */
const DETTAGLI = ["campo", "presi", "posti", "gia", "max"];

async function impronta(ip: string, sale: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + sale));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function gestisciPrenota(req: Request, deps: Deps): Promise<Response> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const cors = bglCors(req.headers.get("origin"), deps.env.get("BGL_CORS_DEV") === "1");
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  const no = (errore: string, status: number, extra: Record<string, unknown> = {}) => json({ ok: false, errore, ...extra }, status);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    await req.arrayBuffer().catch(() => null);
    return no("metodo_non_ammesso", 405);
  }

  try {
    const corpo = new Uint8Array(await req.arrayBuffer());
    if (corpo.byteLength > MAX_CORPO) return no("richiesta_troppo_grande", 413);
    let x: unknown = null;
    try { x = JSON.parse(new TextDecoder().decode(corpo)); } catch { x = null; }
    const v = validaPrenotazione(x);
    if (!v.ok) return no(v.errore, HTTP[v.errore] ?? 400, v.campo ? { campo: v.campo } : {});
    if ((x as Record<string, unknown>).privacy !== true) return no("privacy_mancante", 400);

    // tetto globale: anche cambiando IP a ogni colpo, oltre questa soglia oraria non si prenota
    const g = await deps.rpc("bgl_throttle_hit", { p_ip_hash: CHIAVE_GLOBALE });
    if (g.error) log("bgl-prenota: limite globale non letto: " + g.error.message);
    else if (typeof g.data === "number" && g.data > MAX_ORA_GLOBALE) return no("troppe_richieste", 429);

    // tetto per impronta dell'IP (mai l'IP): senza il sale il limite per IP è spento, resta quello globale
    const sale = (deps.env.get("FEEDBACK_IP_SALT") ?? "").trim();
    const ip = clientIp(req.headers);
    if (!sale) log("bgl-prenota: FEEDBACK_IP_SALT assente, limite per IP spento");
    else if (ip) {
      const r = await deps.rpc("bgl_throttle_hit", { p_ip_hash: await impronta(ip, sale) });
      if (r.error) log("bgl-prenota: limite per IP non letto: " + r.error.message);
      else if (typeof r.data === "number" && r.data > MAX_ORA_IP) return no("troppe_richieste", 429);
    }

    const p = v.value;
    const { data, error } = await deps.rpc("bgl_prenota", {
      p_slug: p.e, p_posti: p.posti, p_nome: p.nome, p_cognome: p.cognome, p_email: p.email,
    });
    if (error || !data || typeof data !== "object") {
      log("bgl-prenota: database: " + (error ? error.message : "risposta vuota"));
      return no("errore_interno", 500);
    }
    const d = data as Record<string, unknown>;
    if (d.ok !== true) {
      const codice = String(d.errore ?? "");
      if (!(codice in HTTP)) { log("bgl-prenota: errore sconosciuto dal database: " + codice); return no("errore_interno", 500); }
      const extra: Record<string, unknown> = {};
      for (const k of DETTAGLI) if (d[k] !== undefined) extra[k] = d[k];
      return no(codice, HTTP[codice], extra);
    }

    const ev = d.evento as { slug: string; titolo: string; inizio: string; luogo: string };
    const token = String(d.token);
    const base = (deps.env.get("BGL_SITE_URL") ?? "").trim() || BGL_SITE_URL;
    const link = `${base}?e=${encodeURIComponent(ev.slug)}&c=${encodeURIComponent(token)}`;

    // la mail: la prenotazione è già salva, qualunque cosa succeda qui il pubblico riceve 200
    let mail = false;
    const chiave = (deps.env.get("RESEND_API_KEY") ?? "").trim();
    if (ambienteLocale(deps.env.get("SUPABASE_URL"))) {
      log("bgl-prenota: mail non inviata: ambiente locale");
    } else if (!chiave) {
      log("bgl-prenota: mail non inviata: RESEND_API_KEY assente");
    } else {
      try {
        const m = mailConferma({ nome: String(d.nome), titolo: ev.titolo, inizio: ev.inizio, luogo: ev.luogo,
          posti: d.posti as string[], codice: String(d.codice), link });
        mail = await tentaInvio(() => deps.invia({ apiKey: chiave, to: String(d.email), ...m }));
      } catch (e) {
        log("bgl-prenota: mail non composta: " + (e instanceof Error ? e.message : "?"));
      }
      if (!mail) log("bgl-prenota: mail non partita per la prenotazione " + String(d.codice));
    }

    return json({ ok: true, codice: d.codice, posti: d.posti, token, link, mail });
  } catch (e) {
    log("bgl-prenota: " + (e instanceof Error ? e.message : "errore"));
    return no("errore_interno", 500);
  }
}
