import type { RiderEmail } from "./rider-order.ts";

function esc(s: string | null | undefined): string {
  return (s ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const PRODUCT_LABEL: Record<string, string> = {
  "pro-review": "Consulenza Tecnica",
  "rider-pronto": "Rider pronto",
  "production-pack": "Produzione Tecnica Completa",
};

function peso(byte: number | null): string {
  if (byte == null) return "";
  return byte >= 1_048_576 ? ` (${(byte / 1_048_576).toFixed(1)} MB)` : ` (${Math.max(1, Math.round(byte / 1024))} KB)`;
}

function dataIt(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** Il materiale mandato dal cliente del Rider pronto: descrizione e link firmati (a scadenza) agli allegati. */
function bloccoRider(r: RiderEmail): string {
  const giorni = 7;
  const files = r.allegati.length
    ? `<ul>${r.allegati.map((a) => a.url
      ? `<li><a href="${esc(a.url)}">${esc(a.name)}</a>${esc(peso(a.size))}</li>`
      : `<li>${esc(a.name)}${esc(peso(a.size))} — <em>file non caricato, o link non generato: cercarlo nel bucket</em></li>`).join("")}</ul>` +
      `<p style="color:#666;font-size:13px">I link valgono ${giorni} giorni; dopo, i file restano nel bucket privato «consultation-uploads» (Supabase → Storage) fino alla pulizia automatica.</p>`
    : r.allegati_rimossi
    ? "<p><em>Allegati già cancellati dalla pulizia automatica.</em></p>"
    : "<p><em>Nessun allegato.</em></p>";
  return `<h3>Materiale del cliente</h3>` +
    (r.senza_progetto ? `<p><strong>Senza progetto StagePlot:</strong> il materiale è tutto qui sotto.</p>` : "") +
    `<p><strong>Per chi:</strong> ${esc(r.per_chi)} — <strong>Data dell'evento:</strong> ${esc(dataIt(r.data_evento))}</p>` +
    `<p><strong>Descrizione:</strong></p><div style="white-space:pre-wrap;border-left:3px solid #0d9488;padding-left:10px">${esc(r.descrizione)}</div>` +
    `<p><strong>Allegati:</strong></p>${files}`;
}

export function buildPaidEmail(a: {
  name: string | null; email: string | null; product: string | null;
  amount: number | null; viewUrl: string | null; rider?: RiderEmail | null;
}): { subject: string; html: string } {
  const label = a.product ? (PRODUCT_LABEL[a.product] ?? a.product) : "—";
  const eur = a.amount != null ? (a.amount / 100).toFixed(2) + " €" : "—";
  const subject = `Nuova consulenza pagata — ${label} — ${a.name || a.email || "cliente"}`;
  const html =
    `<h2>Consulenza pagata</h2>` +
    `<p><strong>Contatto:</strong> ${esc(a.name)} &lt;${esc(a.email)}&gt;</p>` +
    `<p><strong>Pacchetto:</strong> ${esc(label)} — <strong>Importo:</strong> ${esc(eur)}</p>` +
    (a.viewUrl ? `<p><strong>Link vivo (sessione):</strong> <a href="${esc(a.viewUrl)}">${esc(a.viewUrl)}</a></p>` : "") +
    (a.rider ? bloccoRider(a.rider) : "");
  return { subject, html };
}
