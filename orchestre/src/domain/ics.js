/* File .ics (RFC 5545) con le date di un ingaggio CONFERMATO: il musicista lo aggiunge al suo calendario.
   Puro: niente rete né DOM (testato in Node). Orari in UTC («Z»), righe a 75 byte con a capo «CRLF + spazio». */
const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
const z = (n) => String(n).padStart(2, "0");
export function utc(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return `${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}T${z(d.getUTCHours())}${z(d.getUTCMinutes())}${z(d.getUTCSeconds())}Z`;
}
/* piega una riga a 75 byte UTF-8 senza spezzare un carattere */
export function fold(line) {
  const enc = new TextEncoder(); const out = []; let cur = ""; let n = 0; let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > limit) { out.push(cur); cur = ""; n = 0; limit = 74; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const KIND = { rehearsal: "Prova", concert: "Concerto", recording: "Registrazione", travel: "Viaggio", other: "" };
/* ingaggio: { id, title, role, org, venue, address, dates:[{kind, starts_at, ends_at, venue, note}] } */
export function buildIcs(g, adesso = new Date()) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//stageplot.it//Orchestre//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  let n = 0;
  for (const d of g.dates || []) {
    const s = utc(d.starts_at); if (!s) continue;
    let e = utc(d.ends_at); if (!e || e <= s) e = utc(new Date(new Date(d.starts_at).getTime() + 3 * 3600e3));
    n++;
    const luogo = [d.venue || g.venue, d.venue ? "" : g.address].filter(Boolean).join(", ");
    L.push("BEGIN:VEVENT", `UID:orc-${g.id}-${n}-${s}@stageplot.it`, `DTSTAMP:${utc(adesso)}`, `DTSTART:${s}`, `DTEND:${e}`,
      `SUMMARY:${esc([KIND[d.kind] || "", g.title].filter(Boolean).join(" · "))}`);
    if (luogo) L.push(`LOCATION:${esc(luogo)}`);
    const note = [g.role ? "Ruolo: " + g.role : "", g.org || "", d.note || ""].filter(Boolean).join("\n");
    if (note) L.push(`DESCRIPTION:${esc(note)}`);
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return { n, text: L.map(fold).join("\r\n") + "\r\n" };
}
export function scaricaIcs(nomeFile, testo) {
  const a = document.createElement("a");
  a.setAttribute("href", URL.createObjectURL(new Blob([testo], { type: "text/calendar;charset=utf-8" }))); /* blob creato qui */
  a.download = nomeFile.replace(/[^\w.-]+/g, "_").slice(0, 60) + ".ics";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.getAttribute("href")), 1000);
}
