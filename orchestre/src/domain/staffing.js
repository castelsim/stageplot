/* Organico: modelli, etichette e piccole funzioni pure (testate in Node). */

export const PROD_STATUS = {
  draft: "Bozza", planning: "Pianificazione", staffing: "Organico da definire", collecting: "Raccolta disponibilità",
  partial: "Organico parziale", complete: "Organico completo", confirmed: "Confermata", running: "In corso",
  done: "Conclusa", cancelled: "Annullata", archived: "Archiviata",
};
export const PROD_STATUS_PILL = { draft: "", planning: "", staffing: "warn", collecting: "warn", partial: "warn", complete: "ok", confirmed: "ok", running: "accent", done: "", cancelled: "danger", archived: "" };
export const PROD_KIND = { concerto: "Concerto", registrazione: "Registrazione", teatro: "Teatro / musical", tour: "Tournée", evento: "Evento", altro: "Altro" };
export const DATE_KIND = { rehearsal: "Prova", concert: "Concerto", recording: "Registrazione", travel: "Viaggio", other: "Altro" };
export const PART = { principal: "Prima parte", tutti: "Fila", solo: "Solista" };
export const SLOT_STATUS = { open: "Scoperto", invited: "Invitato", confirmed: "Confermato", reserve: "Riserva", replaced: "Sostituito", cancelled: "Annullato" };
export const SLOT_PILL = { open: "warn", invited: "accent", confirmed: "ok", reserve: "accent", replaced: "", cancelled: "danger" };
export const EVENT = {
  proposed: "Proposto", invited: "Invitato", available: "Disponibile", partial: "Parzialmente disponibile", unavailable: "Non disponibile",
  no_reply: "Nessuna risposta", confirmed: "Confermato", withdrew: "Ha rinunciato", replaced: "Sostituito", revoked: "Revocato",
  reserve_set: "Messo in riserva", override: "Scelta manuale", cancelled: "Annullato",
};

/* Modelli di organico: [{section, roles:[{instrument, name, seats, part}]}]. Gli strumenti sono codici
   di orc_instruments (0042). Un modello è un punto di partenza: si corregge dopo. */
const R = (instrument, name, seats, part = "tutti") => ({ instrument, name, seats, part });
export const TEMPLATES = {
  ritmico_sinfonica: {
    name: "Orchestra ritmico-sinfonica",
    note: "Archi, fiati, ottoni, percussioni e sezione ritmica: il formato dei concerti pop e da colonna sonora.",
    sections: [
      { section: "Archi", roles: [R("violino", "Violini primi", 6, "principal"), R("violino", "Violini secondi", 5), R("viola", "Viole", 4), R("violoncello", "Violoncelli", 3), R("contrabbasso", "Contrabbassi", 2), R("arpa", "Arpa", 1)] },
      { section: "Legni", roles: [R("flauto", "Flauti", 2), R("oboe", "Oboe", 1), R("clarinetto", "Clarinetti", 2), R("fagotto", "Fagotto", 1), R("sax_alto", "Sax alto", 1), R("sax_tenore", "Sax tenore", 1)] },
      { section: "Ottoni", roles: [R("corno", "Corni", 2), R("tromba", "Trombe", 2), R("trombone", "Tromboni", 2)] },
      { section: "Percussioni", roles: [R("timpani", "Timpani", 1), R("percussioni", "Percussioni", 1), R("batteria", "Batteria", 1)] },
      { section: "Ritmica", roles: [R("pianoforte", "Pianoforte", 1), R("tastiere", "Tastiere", 1), R("chitarra_elettrica", "Chitarra", 1), R("basso_elettrico", "Basso", 1)] },
    ],
  },
  sinfonica: {
    name: "Orchestra sinfonica",
    note: "Organico classico a legni doppi.",
    sections: [
      { section: "Archi", roles: [R("violino", "Violini primi", 10, "principal"), R("violino", "Violini secondi", 8), R("viola", "Viole", 6), R("violoncello", "Violoncelli", 5), R("contrabbasso", "Contrabbassi", 3), R("arpa", "Arpa", 1)] },
      { section: "Legni", roles: [R("flauto", "Flauti", 2), R("oboe", "Oboi", 2), R("clarinetto", "Clarinetti", 2), R("fagotto", "Fagotti", 2)] },
      { section: "Ottoni", roles: [R("corno", "Corni", 4), R("tromba", "Trombe", 2), R("trombone", "Tromboni", 3), R("tuba", "Tuba", 1)] },
      { section: "Percussioni", roles: [R("timpani", "Timpani", 1), R("percussioni", "Percussioni", 2)] },
    ],
  },
  archi: {
    name: "Sezione archi",
    note: "Solo archi, per un ensemble o per aggiungere gli archi a una band.",
    sections: [
      { section: "Archi", roles: [R("violino", "Violini primi", 4, "principal"), R("violino", "Violini secondi", 3), R("viola", "Viole", 2), R("violoncello", "Violoncelli", 2), R("contrabbasso", "Contrabbasso", 1)] },
    ],
  },
  pop: {
    name: "Band con archi e fiati",
    note: "Sezione ritmica, coro e una piccola sezione d'archi e fiati.",
    sections: [
      { section: "Ritmica", roles: [R("batteria", "Batteria", 1), R("basso_elettrico", "Basso", 1), R("chitarra_elettrica", "Chitarre", 2), R("tastiere", "Tastiere", 1), R("pianoforte", "Pianoforte", 1)] },
      { section: "Voci", roles: [R("cantante", "Voce solista", 1, "solo"), R("corista", "Coristi", 3)] },
      { section: "Archi", roles: [R("violino", "Violini", 4, "principal"), R("viola", "Viole", 2), R("violoncello", "Violoncelli", 2)] },
      { section: "Fiati", roles: [R("sax_alto", "Sax alto", 1), R("sax_tenore", "Sax tenore", 1), R("tromba", "Tromba", 1), R("trombone", "Trombone", 1)] },
    ],
  },
};

/* Somma dei posti di un modello. */
export function templateSeats(t) {
  return t.sections.reduce((n, s) => n + s.roles.reduce((k, r) => k + r.seats, 0), 0);
}

/* Le righe di orc_staffing() (un record per posto) → sezioni → ruoli → posti. */
export function groupStaffing(rows) {
  const sections = new Map();
  for (const r of rows) {
    const sk = r.section_id || "_";
    if (!sections.has(sk)) sections.set(sk, { id: r.section_id, name: r.section_name || "Senza sezione", sort: r.section_sort ?? 999, roles: new Map() });
    const sec = sections.get(sk);
    if (!sec.roles.has(r.role_id)) {
      sec.roles.set(r.role_id, { id: r.role_id, name: r.role_name, instrument_code: r.instrument_code, instrument_name: r.instrument_name,
        seats: r.seats, part: r.part, min_level: r.min_level, notes: r.notes, sort: r.role_sort, slots: [] });
    }
    if (r.slot_id) sec.roles.get(r.role_id).slots.push({ id: r.slot_id, seat_no: r.seat_no, status: r.slot_status, musician_id: r.musician_id, musician_name: r.musician_name });
  }
  const out = [...sections.values()].sort((a, b) => a.sort - b.sort);
  for (const s of out) { s.roles = [...s.roles.values()].sort((a, b) => a.sort - b.sort); for (const r of s.roles) r.slots.sort((a, b) => a.seat_no - b.seat_no); }
  return out;
}

/* Conteggi per il riepilogo: posti, confermati, scoperti. */
export function staffingCounts(sections) {
  let seats = 0, filled = 0, open = 0;
  for (const s of sections) for (const r of s.roles) for (const sl of r.slots) { seats++; if (sl.status === "confirmed") filled++; if (sl.status === "open") open++; }
  return { seats, filled, open };
}

/* Stato suggerito dai posti: senza ruoli → organico da definire; tutti confermati → completo; alcuni → parziale. */
export function suggestedStatus(counts, current) {
  if (["done", "cancelled", "archived", "running", "confirmed"].includes(current)) return current;
  if (counts.seats === 0) return "staffing";
  if (counts.open === 0 && counts.filled === counts.seats) return "complete";
  if (counts.filled > 0) return "partial";
  return current === "draft" ? "planning" : current;
}
