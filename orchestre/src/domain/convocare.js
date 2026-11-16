/* Convocare (lotto P, 16/11): messaggio WhatsApp pronto, riepilogo delle risposte, famiglia degli strumenti.
   Funzioni pure: nessun accesso a rete o DOM, così si provano senza browser. */

/* Il messaggio da incollare in WhatsApp: saluto, titolo, eventuale testo aggiuntivo dell'evento (la nota dello staff
   scritta alla convocazione), link. Il cognome viene dall'elenco «Cognome Nome»: si usa il primo pezzo come cognome? No:
   l'elenco ha già «cognome nome», quindi il nome proprio è l'ultima parola. */
export function messaggioConvocazione({ nomeCompleto = "", titolo = "", url = "", nota = "" } = {}) {
  const nome = String(nomeCompleto).trim().split(/\s+/).slice(-1)[0] || "";
  const righe = [`Ciao ${nome}`.trim() + `, ecco il link per rispondere alla convocazione «${titolo}»:`];
  const n = String(nota || "").replace(/\s+/g, " ").trim();
  if (n) righe.push(n);
  righe.push(url);
  return righe.join("\n");
}

/* Numero per wa.me: solo cifre, con il prefisso del paese. Senza prefisso un numero italiano (mobile 3xx, fisso 0x)
   prende 39. Restituisce "" se non sembra un numero. */
export function numeroWhatsApp(phone) {
  let d = String(phone || "").trim();
  if (!d) return "";
  const piu = d.startsWith("+");
  d = d.replace(/\D/g, "");
  if (!piu && d.startsWith("00")) d = d.slice(2);
  else if (!piu && /^[03]/.test(d)) d = "39" + d;
  return d.length >= 9 && d.length <= 15 ? d : "";
}
export function linkWhatsApp(phone, testo) {
  const n = numeroWhatsApp(phone);
  return "https://wa.me/" + n + "?text=" + encodeURIComponent(testo || "");
}

/* Riepilogo: ogni convocazione sta in UNA sola casella. Annullate, revocate e sostituite non si contano. */
export const RIEPILOGO = [
  ["confermati", "Confermati", "ok"],
  ["disponibili", "Da confermare", "accent"],
  ["attesa", "In attesa", "accent"],
  ["senzaRisposta", "Senza risposta", "warn"],
  ["rifiutati", "Rifiutati", "danger"],
  ["riserve", "Riserve", ""],
];
export function casella(r) {
  const s = r && r.status;
  if (s === "confirmed") return "confermati";
  if (s === "reserve" || (r.reserve_only && ["available", "partial"].includes(s))) return "riserve";
  if (s === "available" || s === "partial") return "disponibili";
  if (["draft", "sent", "viewed"].includes(s)) return "attesa";
  if (s === "no_reply" || s === "expired") return "senzaRisposta";
  if (s === "unavailable") return "rifiutati";
  return null;
}
export function riepilogoInviti(rows) {
  const out = { confermati: 0, disponibili: 0, attesa: 0, senzaRisposta: 0, rifiutati: 0, riserve: 0, totale: 0 };
  for (const r of rows || []) { const c = casella(r); if (c) { out[c]++; out.totale++; } }
  return out;
}
export function filtraInviti(rows, chiave) {
  if (!chiave) return rows;
  return (rows || []).filter((r) => casella(r) === chiave);
}
export const chiaveRiepilogoValida = (k) => RIEPILOGO.some(([c]) => c === k);

/* Famiglie degli strumenti (catalogo orc_instruments.family) con un colore sobrio ciascuna. */
export const FAMIGLIE = {
  archi: "Archi", legni: "Legni", ottoni: "Ottoni", percussioni: "Percussioni", tastiere: "Tastiere",
  corde: "Corde", voci: "Voci", direzione: "Direzione", ritmica: "Ritmica",
};
export function famigliaDi(code, instruments) {
  const i = (instruments || []).find((x) => x.code === code);
  const f = i && i.family;
  return FAMIGLIE[f] ? f : "";
}
export const etichettaFamiglia = (f) => FAMIGLIE[f] || "";
