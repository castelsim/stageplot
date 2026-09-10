/* «Richiedi musicisti»: dal palco disegnato alla richiesta che arriva alla società. Puro, testato in Node.

   Quello che parte NON è il documento del progetto: è una copia funzionale, cioè le sole cose che servono a
   capire la richiesta (titolo, luogo, misure del palco, elenco delle postazioni-persona). Il documento
   contiene anche i contatti dei collaboratori del cliente, che non c'entrano nulla con una richiesta di
   musicisti: non partono per costruzione, non perché ce li dimentichiamo per strada. */

import { extractPositions, seatsOf } from "./stageplot-import.js";

export const EVENT_KINDS = {
  concerto: "Concerto",
  matrimonio: "Matrimonio o cerimonia",
  evento: "Evento aziendale",
  teatro: "Teatro o musical",
  registrazione: "Registrazione",
  tour: "Più date",
  altro: "Altro",
};

/* I campi che servono per mandare la richiesta. Gli altri sono utili ma non obbligatori: chi chiede
   musicisti spesso non ha ancora la data, e chiedergliela come condizione lo ferma sulla porta. */
export const REQUIRED = ["contact_name", "contact_email", "event_title"];
const FIELD_LABEL = {
  contact_name: "il tuo nome",
  contact_email: "l'email",
  event_title: "che evento è",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function missingFields(fields) {
  const out = [];
  for (const k of REQUIRED) if (!String((fields || {})[k] || "").trim()) out.push(k);
  const mail = String((fields || {}).contact_email || "").trim();
  if (mail && !EMAIL.test(mail) && !out.includes("contact_email")) out.push("contact_email");
  return out;
}
/* Si può mandare? Servono i campi obbligatori e, se il cliente non ha detto «non so quale formazione
   serve», almeno un posto da coprire. Chi dichiara di non saperlo sta facendo una domanda, non
   dimenticando una riga: la richiesta parte lo stesso e la formazione la propone la società. */
/* Come si legge, in una riga, quanti musicisti sta chiedendo: «0 musicisti» sarebbe una bugia per chi
   ha detto «non so quale formazione serve» — quello sta chiedendo una proposta. */
export function quantiLabel(r) {
  if ((r || {}).formation_unknown) return "formazione da definire";
  const n = Number((r || {}).n_needed) || 0;
  return n === 1 ? "1 musicista" : n + " musicisti";
}

export function motivoNonPronta(fields, righe) {
  const miss = missingFields(fields);
  if (miss.length) return missingLabel(miss);
  if (!(fields || {}).formation_unknown && !countNeeded(righe || [])) {
    return "Dicci chi ti serve: aggiungi almeno uno strumento, oppure spunta «non so quale formazione serve».";
  }
  return "";
}

export function missingLabel(missing) {
  const l = missing.map((k) => FIELD_LABEL[k] || k);
  if (!l.length) return "";
  if (l.length === 1) return "Manca " + l[0] + ".";
  return "Mancano " + l.slice(0, -1).join(", ") + " e " + l[l.length - 1] + ".";
}

/* Le postazioni-persona della scena scelta, pronte da spuntare: una riga per postazione, con lo strumento
   riconosciuto dal catalogo quando c'è. Le postazioni a due contano due posti. */
export function stagePositions(doc, variantId, typeMap, instruments) {
  const names = new Map((instruments || []).map((i) => [i.code, i.name]));
  const { positions, unmapped } = extractPositions(doc, variantId, typeMap || {});
  const righe = positions.map((p) => ({
    item_id: p.item_id,
    label: p.label || names.get(p.instrument_code) || p.item_type,
    instrument_code: p.instrument_code,
    instrument_name: names.get(p.instrument_code) || p.instrument_code,
    qty: p.seats,
    covered: false,
  }));
  return { righe, ignorate: unmapped.map((u) => u.label || u.item_type) };
}

/* La copia congelata: piccola, leggibile fra un anno, senza dati di terzi. */
export function snapshotOf(doc, variantId, righe) {
  const st = variantStateOf(doc, variantId);
  const stage = st && st.stage ? st.stage : null;
  return {
    _v: 1,
    titolo: String((st && st.titolo) || "").slice(0, 160),
    luogo: String((st && st.luogo) || "").slice(0, 160),
    palco: stage ? { larghezza_cm: Number(stage.w) || 0, profondita_cm: Number(stage.d) || 0 } : null,
    elementi: st && Array.isArray(st.items) ? st.items.length : 0,
    postazioni: (righe || []).map((r) => ({ item_id: r.item_id, label: r.label, strumento: r.instrument_name, posti: r.qty, coperto: !!r.covered })),
  };
}
function variantStateOf(doc, variantId) {
  if (!doc || typeof doc !== "object") return null;
  if (!Array.isArray(doc.variants)) return doc;
  const vs = doc.variants.filter((v) => v && v.state);
  const want = variantId || String(doc.active || "");
  return (vs.find((v) => String(v.id) === want) || vs[0] || {}).state || null;
}

/* Quanti musicisti sta chiedendo, davvero: la somma dei posti non coperti. */
export function countNeeded(righe) {
  return (righe || []).reduce((n, r) => n + (r.covered ? 0 : Number(r.qty) || 0), 0);
}

/* Il riepilogo da rileggere prima di mandare, in italiano. */
export function summaryLines(fields, righe) {
  const n = countNeeded(righe);
  const out = [];
  /* chi ha detto «non so quale formazione serve» non ha dimenticato di spuntare: sta chiedendo altro */
  out.push((fields || {}).formation_unknown ? "Formazione da definire: la proponiamo noi"
    : n === 0 ? "Nessun musicista richiesto: spunta almeno una postazione." : n === 1 ? "Un musicista" : n + " musicisti");
  const kind = EVENT_KINDS[(fields || {}).event_kind] || EVENT_KINDS.concerto;
  out.push([kind, (fields || {}).event_title].filter(Boolean).join(": "));
  const quando = [(fields || {}).event_when, (fields || {}).event_place].filter(Boolean).join(" · ");
  if (quando) out.push(quando);
  const chi = [(fields || {}).contact_name, (fields || {}).contact_company].filter(Boolean).join(" · ");
  if (chi) out.push(chi);
  return out;
}

export { seatsOf };
