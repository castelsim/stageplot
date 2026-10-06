// supabase/functions/_shared/bgl-prenota.ts
//
// BIGLIETTERIA — tutta la logica della Edge Function `bgl-prenota`, con le dipendenze iniettate (database,
// invio della mail, ambiente) così si prova con `deno test` senza rete né database.
//
// Ordine (specifica §3.1, rivisto il 06/10): OPTIONS → metodo → si LEGGE tutto il corpo e poi si misura
// (rispondere prima di averlo letto dà un 503 dopo due minuti, AGENTS §8) → JSON → validazione → informativa
// spuntata → limite per IP → limite globale, contato SOLO per un evento che esiste ed è aperto
// (`bgl_globale_hit`: prima, chi era già fermo per il suo IP o martellava uno slug inventato consumava il
// contatore di tutti e bloccava la biglietteria per un'ora) → `bgl_prenota` nel database, con l'impronta
// della connessione (tetto di posti per connessione) e il codice segreto scelto dalla pagina (una richiesta
// ripetuta dopo una risposta persa ridà la stessa prenotazione) → errori del database tradotti in HTTP →
// mail, solo se il database dice che può partire (al massimo 3 al giorno allo stesso indirizzo, niente
// mail nel giro «prenota, disdici, prenota»; mai per una richiesta ripetuta) → 200.

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
/** Il contatore globale usa la tabella dei limiti per IP con un'impronta che nessun IP può avere
 *  (lo incrementa `bgl_globale_hit` nel database). */
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
  posto_preso: 409, posto_riservato: 409, limite_email: 409, limite_connessione: 409, prenotazioni_chiuse: 409,
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

    const p = v.value;

    // tetto per impronta dell'IP (mai l'IP), PRIMA di tutto il resto: chi l'ha superato si ferma qui e non
    // tocca né il contatore di tutti né il database delle prenotazioni. Senza il sale il limite per IP è
    // spento (e con lui il tetto di posti per connessione): resta quello globale.
    const sale = (deps.env.get("FEEDBACK_IP_SALT") ?? "").trim();
    const ip = clientIp(req.headers);
    let ipHash: string | null = null;
    if (!sale) log("bgl-prenota: FEEDBACK_IP_SALT assente, limite per IP spento");
    else if (ip) {
      ipHash = await impronta(ip, sale);
      const r = await deps.rpc("bgl_throttle_hit", { p_ip_hash: ipHash });
      if (r.error) log("bgl-prenota: limite per IP non letto: " + r.error.message);
      else if (typeof r.data === "number" && r.data > MAX_ORA_IP) return no("troppe_richieste", 429);
    }

    // tetto globale: anche cambiando IP a ogni colpo, oltre questa soglia oraria non si prenota. Il database
    // lo conta solo se l'evento esiste ed è aperto, e altrimenti risponde il perché (404/409).
    const g = await deps.rpc("bgl_globale_hit", { p_slug: p.e });
    if (g.error || !g.data || typeof g.data !== "object") {
      log("bgl-prenota: limite globale non letto: " + (g.error ? g.error.message : "risposta vuota"));
    } else {
      const gd = g.data as Record<string, unknown>;
      if (gd.ok === false && (gd.errore === "evento_inesistente" || gd.errore === "prenotazioni_chiuse")) {
        return no(String(gd.errore), HTTP[String(gd.errore)]);
      }
      if (typeof gd.n === "number" && gd.n > MAX_ORA_GLOBALE) return no("troppe_richieste", 429);
    }

    const { data, error } = await deps.rpc("bgl_prenota", {
      p_slug: p.e, p_posti: p.posti, p_nome: p.nome, p_cognome: p.cognome, p_email: p.email,
      p_ip_hash: ipHash, p_token: p.token,
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

    const ev = d.evento as { slug: string; titolo: string; inizio: string; luogo: string; note?: string | null };
    const ripetuta = d.ripetuta === true;
    const token = String(d.token);
    const base = (deps.env.get("BGL_SITE_URL") ?? "").trim() || BGL_SITE_URL;
    const link = `${base}?e=${encodeURIComponent(ev.slug)}&c=${encodeURIComponent(token)}`;

    // la mail: la prenotazione è già salva, qualunque cosa succeda qui il pubblico riceve 200
    let mail = false;
    const chiave = (deps.env.get("RESEND_API_KEY") ?? "").trim();
    if (ripetuta) {
      log("bgl-prenota: richiesta ripetuta per la prenotazione " + String(d.codice) + ": nessuna seconda mail");
    } else if (d.mail !== true) {
      log("bgl-prenota: mail non inviata: limite per destinatario o disdette ripetute (" + String(d.codice) + ")");
    } else if (ambienteLocale(deps.env.get("SUPABASE_URL"))) {
      log("bgl-prenota: mail non inviata: ambiente locale");
    } else if (!chiave) {
      log("bgl-prenota: mail non inviata: RESEND_API_KEY assente");
    } else {
      try {
        const m = mailConferma({ titolo: ev.titolo, inizio: ev.inizio, luogo: ev.luogo, note: ev.note ?? null,
          posti: d.posti as string[], codice: String(d.codice), link });
        mail = await tentaInvio(() => deps.invia({ apiKey: chiave, to: String(d.email), ...m }));
      } catch (e) {
        log("bgl-prenota: mail non composta: " + (e instanceof Error ? e.message : "?"));
      }
      if (!mail) log("bgl-prenota: mail non partita per la prenotazione " + String(d.codice));
    }

    return json({ ok: true, codice: d.codice, posti: d.posti, token, link, mail, ripetuta });
  } catch (e) {
    log("bgl-prenota: " + (e instanceof Error ? e.message : "errore"));
    return no("errore_interno", 500);
  }
}
