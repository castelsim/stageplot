// supabase/functions/_shared/bgl-mail.ts
//
// BIGLIETTERIA — la mail di conferma della prenotazione e quella dei posti cambiati («Sposta», area §4.1). Contenuto (puro, testato) e invio (Resend).
// Mittente: lo stesso indirizzo che Resend consegna già oggi per le segnalazioni (dominio verificato),
// con un nome diverso; le risposte vanno alla casella vera. `email.ts` non si tocca: il suo `sendEmail` ha
// il mittente fisso e niente reply_to né testo semplice, e cambiarlo obbligherebbe a ridistribuire tutte le
// funzioni che lo importano. Lo stesso endpoint, lo stesso timeout (RESEND_TIMEOUT_MS).

import { RESEND_TIMEOUT_MS } from "./tenta-invio.ts";

export const BGL_FROM = "Biglietteria StagePlot <feedback@stageplot.it>";
export const BGL_REPLY_TO = "info@stageplot.it";
export const BGL_PRIVACY_URL = "https://stageplot.it/privacy/#biglietteria";
export const BGL_SITE_URL = "https://stageplot.it/biglietteria/";
/** A chi scrivere per un problema o un gruppo più grande: lo stesso indirizzo delle risposte e della pagina. */
export const BGL_CONTATTO = "info@stageplot.it";
const FUSO = "Europe/Rome";

/** Tutto il testo che arriva dall'utente o dall'organizzatore passa di qui prima di finire nell'HTML. */
export function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** «venerdì 9 ottobre 2026, ore 21:00», sempre all'ora italiana. */
export function dataLunga(iso: string): string {
  const d = new Date(iso);
  const giorno = new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  const ora = new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${giorno}, ore ${ora}`;
}

/** «ven 9 ottobre», per l'oggetto. */
export function dataBreve(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: FUSO, weekday: "short", day: "numeric", month: "long" })
    .format(new Date(iso)).replace(/\.$/, "").replace(/^(\p{L}+)\./u, "$1");
}

/** Elenco in italiano: «5», «5 e 6», «5, 6 e 7». */
function elenco(v: string[]): string {
  return v.length <= 1 ? v.join("") : v.slice(0, -1).join(", ") + " e " + v[v.length - 1];
}

/** Ordine naturale: le file a numero per numero, quelle a lettere per lettera. */
function confronta(a: string, b: string): number {
  const na = /^\d+$/.test(a), nb = /^\d+$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na !== nb) return na ? 1 : -1;
  return a.length - b.length || a.localeCompare(b, "it");
}

/** I posti raggruppati per fila: «Fila A, posti 5 e 6». Il settore si scrive solo se non è «Platea»
 *  oppure se ce n'è più di uno: «Galleria, fila B, posto 3». */
export function postiInParole(chiavi: string[]): string[] {
  const gruppi = new Map<string, { settore: string; fila: string; posti: number[] }>();
  for (const k of chiavi) {
    const [settore, fila, posto] = k.split("|");
    const id = settore + "|" + fila;
    if (!gruppi.has(id)) gruppi.set(id, { settore, fila, posti: [] });
    gruppi.get(id)!.posti.push(Number(posto));
  }
  const settori = new Set([...gruppi.values()].map((g) => g.settore));
  const conSettore = settori.size > 1 || !settori.has("Platea");
  return [...gruppi.values()]
    .sort((a, b) => a.settore.localeCompare(b.settore, "it") || confronta(a.fila, b.fila))
    .map((g) => {
      const n = g.posti.sort((a, b) => a - b).map(String);
      const posti = (n.length === 1 ? "posto " : "posti ") + elenco(n);
      return conSettore ? `${g.settore}, fila ${g.fila}, ${posti}` : `Fila ${g.fila}, ${posti}`;
    });
}

// Nessun testo scritto da chi prenota entra nella mail (revisione del 06/10): l'indirizzo non è verificato,
// e un nome come «Hai vinto: https://…» farebbe della conferma un modo di mandare messaggi a chiunque.
// Restano solo i dati dell'evento (scritti dall'organizzatore, che ha un account) e quelli generati qui.
export type DatiMail = {
  titolo: string;
  inizio: string;   // ISO
  luogo: string;
  note?: string | null;  // la nota dell'organizzatore, es. «porte aperte alle 20:30»
  posti: string[];  // chiavi
  codice: string;
  link: string;     // link per vedere/disdire
};

/** Oggetto, HTML e testo semplice della conferma. Nessun dato oltre a quelli della prenotazione. */
export function mailConferma(d: DatiMail): { subject: string; html: string; text: string } {
  // deno-lint-ignore no-control-regex
  const unaRiga = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  const subject = unaRiga(`Prenotazione confermata — ${d.titolo}, ${dataBreve(d.inizio)}`);
  const quando = dataLunga(d.inizio);
  const righe = postiInParole(d.posti);
  // la nota può andare a capo: righe vere nel testo, <br> nell'HTML; i caratteri di controllo no
  // deno-lint-ignore no-control-regex
  const note = String(d.note ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim();

  const text = [
    "Ciao,",
    "",
    "la tua prenotazione è confermata.",
    "",
    unaRiga(d.titolo),
    quando,
    unaRiga(d.luogo),
    ...(note ? ["", note] : []),
    "",
    ...righe,
    "",
    `Codice: ${d.codice}`,
    "",
    "Ingresso gratuito: all'ingresso di' il tuo cognome o mostra questo codice.",
    "",
    `Non puoi più venire? Disdici qui e libera i posti per altri: ${d.link}`,
    "",
    `Per un problema rispondi a questa mail o scrivi a ${BGL_CONTATTO}.`,
    `Come trattiamo i tuoi dati: ${BGL_PRIVACY_URL}`,
  ].join("\n");

  const html = `<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#f6f6f4;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
<p style="font-size:16px;margin:0 0 16px">Ciao,</p>
<p style="font-size:16px;margin:0 0 16px">la tua prenotazione è confermata.</p>
<h1 style="font-size:20px;margin:0 0 4px">${esc(d.titolo)}</h1>
<p style="font-size:16px;margin:0">${esc(quando)}</p>
<p style="font-size:16px;margin:0 0 16px">${esc(d.luogo)}</p>
${note ? `<p style="font-size:16px;margin:0 0 16px;padding:10px 12px;background:#f0fdfa;border-radius:8px">${note.split("\n").map(esc).join("<br>")}</p>\n` : ""}
<p style="font-size:16px;margin:0 0 16px"><strong>${righe.map(esc).join("<br>")}</strong></p>
<p style="font-size:14px;margin:0">Codice</p>
<p style="font-size:32px;letter-spacing:4px;font-weight:bold;margin:0 0 16px;font-family:'Courier New',monospace">${esc(d.codice)}</p>
<p style="font-size:16px;margin:0 0 24px">Ingresso gratuito: all'ingresso di' il tuo cognome o mostra questo codice.</p>
<p style="font-size:14px;margin:0 0 24px">Non puoi più venire? <a href="${esc(d.link)}">Disdici qui</a> e libera i posti per altri.</p>
<p style="font-size:14px;margin:0 0 24px">Per un problema rispondi a questa mail o scrivi a <a href="mailto:${BGL_CONTATTO}">${BGL_CONTATTO}</a>.</p>
<p style="font-size:12px;color:#666;margin:0">Hai ricevuto questa mail perché hai prenotato su stageplot.it. <a href="${esc(BGL_PRIVACY_URL)}">Come trattiamo i tuoi dati</a>.</p>
</div></body></html>`;

  return { subject, html, text };
}

export type DatiSpostamento = { titolo: string; inizio: string; luogo: string; posti: string[]; codice: string; link: string };

/** «Posti cambiati» (specifica area §4.1): breve, solo dati dello spettacolo e dei posti, nessun testo libero. */
export function mailSpostamento(d: DatiSpostamento): { subject: string; html: string; text: string } {
  // deno-lint-ignore no-control-regex
  const unaRiga = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  const subject = unaRiga(`Posti cambiati — ${d.titolo}, ${dataBreve(d.inizio)}`);
  const quando = dataLunga(d.inizio), righe = postiInParole(d.posti);
  const text = ["Ciao,", "", `l'organizzatore ha cambiato i tuoi posti per «${unaRiga(d.titolo)}».`, "", quando, unaRiga(d.luogo), "",
    "I posti nuovi:", ...righe, "", `Codice: ${d.codice}`, "",
    "Per vedere o disdire la prenotazione usa il link della mail di conferma che hai già ricevuto.",
    `La pagina dello spettacolo: ${d.link}`, "", `Per un problema scrivi a ${BGL_CONTATTO}.`].join("\n");
  const html = `<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#f6f6f4;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
<p style="font-size:16px;margin:0 0 16px">Ciao,</p>
<p style="font-size:16px;margin:0 0 16px">l'organizzatore ha cambiato i tuoi posti per <strong>${esc(d.titolo)}</strong>.</p>
<p style="font-size:16px;margin:0">${esc(quando)}</p>
<p style="font-size:16px;margin:0 0 16px">${esc(d.luogo)}</p>
<p style="font-size:14px;margin:0">I posti nuovi</p>
<p style="font-size:18px;margin:0 0 16px"><strong>${righe.map(esc).join("<br>")}</strong></p>
<p style="font-size:14px;margin:0">Codice</p>
<p style="font-size:28px;letter-spacing:4px;font-weight:bold;margin:0 0 16px;font-family:'Courier New',monospace">${esc(d.codice)}</p>
<p style="font-size:14px;margin:0 0 16px">Per vedere o disdire la prenotazione usa il link della mail di conferma che hai già ricevuto.
<a href="${esc(d.link)}">La pagina dello spettacolo</a>.</p>
<p style="font-size:14px;margin:0">Per un problema scrivi a <a href="mailto:${BGL_CONTATTO}">${BGL_CONTATTO}</a>.</p>
</div></body></html>`;
  return { subject, html, text };
}

/** In locale non parte mai una mail: lo stack di prova ha SUPABASE_URL su 127.0.0.1, localhost o kong. */
export function ambienteLocale(supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return true;
  try {
    const h = new URL(supabaseUrl).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "kong" || h === "host.docker.internal" || h === "0.0.0.0";
  } catch {
    return true;
  }
}

export type InvioMail = { apiKey: string; to: string; subject: string; html: string; text: string };

/** Spedisce con Resend. Risponde {ok,status}; può lanciare (rete): chi chiama usa `tentaInvio`. */
export async function inviaMail(a: InvioMail, fetchFn: typeof fetch = fetch): Promise<{ ok: boolean; status: number }> {
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${a.apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    body: JSON.stringify({ from: BGL_FROM, to: [a.to], reply_to: BGL_REPLY_TO, subject: a.subject, html: a.html, text: a.text }),
  });
  await res.body?.cancel().catch(() => {});
  return { ok: res.ok, status: res.status };
}
