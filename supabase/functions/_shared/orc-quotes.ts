// L'email al cliente quando il preventivo è pronto. Testo puro, senza rete: si prova in Deno senza
// mandare niente a nessuno.
//
// La riga che arriva qui ha SOLO i campi che il cliente può vedere — descrizione e totali. Cachet,
// margine e note interne non ci sono nel tipo: non si possono mettere nell'email nemmeno per sbaglio.

import { esc } from "./orc-client-requests.ts";

export type QuoteMailRow = {
  id: string;
  description: string;
  net_cents: number;
  vat_cents: number;
  total_cents: number;
  vat_pct: number;
  event_title: string;
  event_when: string;
  contact_name: string;
  org_name: string;
};

/* 118950 → «1.189,50 €»: lo stesso formato di orchestre/src/domain/quote.js */
export function euro(centesimi: number): string {
  const n = Math.round(Number(centesimi) || 0);
  const a = Math.abs(n);
  const interi = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "-" : "") + interi + "," + String(a % 100).padStart(2, "0") + " €";
}

export function buildQuoteEmail(row: QuoteMailRow, base: string): { subject: string; html: string; text: string } {
  const nome = (row.contact_name || "").trim().split(/\s+/)[0] || "";
  const org = row.org_name || "StagePlot";
  const link = base.replace(/\/$/, "") + "/orchestre/mie-richieste/";
  const quando = row.event_when ? ` (${row.event_when})` : "";
  const subject = `Il preventivo per ${row.event_title}${quando} è pronto`;
  const desc = row.description ? `<p style="margin:0 0 16px;font-size:17px">${esc(row.description)}</p>` : "";
  const riga = (k: string, v: string, forte = false) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#555">${esc(k)}</td><td style="padding:4px 0;text-align:right${forte ? ";font-weight:700;font-size:17px" : ""}">${esc(v)}</td></tr>`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#222">
<p style="margin:0 0 16px">Ciao${nome ? " " + esc(nome) : ""}, ${esc(org)} ti ha preparato il preventivo per <b>${esc(row.event_title)}</b>${esc(quando)}.</p>
${desc}<table style="border-collapse:collapse;margin:0 0 20px">
${riga("Imponibile", euro(row.net_cents))}
${riga("IVA " + Number(row.vat_pct) + "%", euro(row.vat_cents))}
${riga("Totale", euro(row.total_cents), true)}
</table>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#0d9488;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Guarda e rispondi</a></p>
<p style="margin:0;color:#555;font-size:14px">Lo accetti — o no — con un tocco dalla tua area. Se vuoi cambiare qualcosa, rispondi a questa email.</p>
</div>`;
  const text = [
    `Ciao${nome ? " " + nome : ""}, ${org} ti ha preparato il preventivo per ${row.event_title}${quando}.`, "",
    ...(row.description ? [row.description, ""] : []),
    `Imponibile: ${euro(row.net_cents)}`,
    `IVA ${Number(row.vat_pct)}%: ${euro(row.vat_cents)}`,
    `Totale: ${euro(row.total_cents)}`, "",
    `Guarda e rispondi: ${link}`, "",
    "Se vuoi cambiare qualcosa, rispondi a questa email.",
  ].join("\n");
  return { subject, html, text };
}

/* chiave d'invio: diversa a ogni tentativo, così un nuovo tentativo non viene scambiato per un doppione */
export function quoteKey(id: string, attempt: number): string {
  return `orc-quote-${id}-${attempt}`;
}
