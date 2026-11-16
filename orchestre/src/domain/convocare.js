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

/* Promemoria (I7, 16/11): lo stesso messaggio, ma per chi non ha ancora risposto. Mai spedito da sistema: lo staff lo copia o lo apre in WhatsApp. */
export function messaggioPromemoria({ nomeCompleto = "", titolo = "", url = "", nota = "" } = {}) {
  const nome = String(nomeCompleto).trim().split(/\s+/).slice(-1)[0] || "";
  const righe = [`Ciao ${nome}`.trim() + `, non ho ancora la tua risposta sulla convocazione «${titolo}». Ti chiedo un attimo per rispondere (basta un tocco):`];
  const n = String(nota || "").replace(/\s+/g, " ").trim();
  if (n) righe.push(n);
  righe.push(url);
  return righe.join("\n");
}
/* Chi si sollecita: invitato e mai risposto, o scaduto senza risposta. Chi ha detto sì o no, o è annullato, no. */
export const DA_SOLLECITARE = ["sent", "viewed", "no_reply", "expired"];
export function daSollecitare(rows) { return (rows || []).filter((r) => DA_SOLLECITARE.includes(r && r.status)); }
/* Tutti i messaggi in un solo testo da incollare: una persona per blocco, il nome in testa. */
export function messaggiInsieme(voci) {
  return (voci || []).map((v) => `— ${v.nome} —\n${v.testo}`).join("\n\n");
}
/* «posto N» si dice solo di chi il posto lo ha davvero: dopo una revoca, un rifiuto o un annullamento il posto non è più suo. */
export function dicePosto(r) { return !!(r && r.slot_seat && !["revoked", "unavailable", "cancelled", "replaced", "withdrew"].includes(r.status)); }

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

/* Il menu degli strumenti per famiglia (65 voci in fila non si leggono): [{ famiglia, etichetta, strumenti:[…] }] nell'ordine delle
   famiglie, strumenti nell'ordine del catalogo. Una famiglia sconosciuta va in fondo, «Altri», senza sparire. */
export function strumentiPerFamiglia(instruments) {
  const ordine = Object.keys(FAMIGLIE), gruppi = new Map();
  for (const i of instruments || []) {
    const f = FAMIGLIE[i.family] ? i.family : "_altri";
    if (!gruppi.has(f)) gruppi.set(f, []);
    gruppi.get(f).push(i);
  }
  const out = [];
  for (const f of [...ordine, "_altri"]) if (gruppi.has(f)) out.push({ famiglia: f, etichetta: f === "_altri" ? "Altri" : FAMIGLIE[f], strumenti: gruppi.get(f) });
  return out;
}

/* La «parte» dedotta dal nome del ruolo: «Violini primi», «Violini I», «Primo corno» → prima parte; «Solista», «Voce solista» → solista;
   altrimenti fila. Mai «primi» dentro un'altra parola («Primavera»). */
export function parteDaNome(nome) {
  const n = String(nome || "").toLowerCase();
  if (/\bsolist[aei]\b|\bsolo\b/.test(n)) return "solo";
  if (/\bprim[aeio]\b|\b(i|1)\b|\bprima parte\b/.test(n) && !/\b(ii|iii|2|3)\b/.test(n)) return "principal";
  return "tutti";
}
