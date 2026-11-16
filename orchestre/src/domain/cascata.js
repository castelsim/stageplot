/* Cascata di riserve (lotto Q, 16/11): lista ordinata di candidati per ruolo, «chiama il prossimo», squadre tipo.
   Funzioni pure: nessun accesso a rete o DOM. L'invio vero resta quello di sempre (orc_invite), sempre a mano. */

/* Stato di un candidato: lo ricava il database dagli inviti (orc_cascade_list). */
export const STATO = {
  da_chiamare: ["Da chiamare", "accent"],
  in_corso: ["In corso", "accent"],
  confermato: ["Confermato", "ok"],
  rifiutato: ["Rifiutato", "danger"],
  senza_risposta: ["Senza risposta", "warn"],
  gia_chiamato: ["Già chiamato", ""],
  archiviato: ["Archiviato", "danger"],
};
export const statoEtichetta = (s) => (STATO[s] || [s, ""])[0];
export const statoPill = (s) => (STATO[s] || [s, ""])[1];

/* Righe di orc_cascade_list → Map(ruolo → righe in ordine di posizione). */
export function perRuolo(rows) {
  const m = new Map();
  for (const r of rows || []) { if (!m.has(r.role_id)) m.set(r.role_id, []); m.get(r.role_id).push(r); }
  for (const l of m.values()) l.sort((a, b) => a.pos - b.pos);
  return m;
}

/* Il prossimo da chiamare: il primo «da chiamare» in ordine. Chi è in corso, ha rifiutato, non ha risposto o è
   già stato chiamato non si richiama da solo; gli archiviati si saltano. */
export function prossimo(lista) {
  return (lista || []).slice().sort((a, b) => a.pos - b.pos).find((r) => r.state === "da_chiamare") || null;
}
export const quanteDaChiamare = (lista) => (lista || []).filter((r) => r.state === "da_chiamare").length;

/* Ordine: sposta di una posizione (-1 su, +1 giù), mette in cima, toglie, aggiunge in fondo senza doppioni. */
export function sposta(ids, id, verso) {
  const a = [...ids], i = a.indexOf(id), j = i + verso;
  if (i < 0 || j < 0 || j >= a.length) return a;
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}
export const inCima = (ids, id) => (ids.includes(id) ? [id, ...ids.filter((x) => x !== id)] : [...ids]);
export const togli = (ids, id) => ids.filter((x) => x !== id);
export function aggiungi(ids, nuovi) {
  const a = [...ids];
  for (const n of nuovi || []) if (!a.includes(n)) a.push(n);
  return a;
}

/* Dal matching: gli idonei nell'ordine mostrato (la scelta manuale «in cima» è già dentro). */
export const daMatching = (ordinati) => (ordinati || []).filter((r) => r.eligible).map((r) => r.musician_id);

/* La frase del pulsante: dice CHI verrà chiamato, perché un tocco manda un'email vera. */
export function testoChiama(prox) { return prox ? "Chiama il prossimo: " + prox.musician_name : ""; }

/* Squadre tipo: abbinamento per testo dello stesso tipo del database (nome senza maiuscole/spazi). */
export const nomeRuolo = (s) => String(s || "").trim().toLowerCase();
