// supabase/functions/_shared/bgl-validazione.ts
//
// BIGLIETTERIA — la richiesta di prenotazione che arriva dalla pagina pubblica. Qui si decide se è fatta bene,
// PRIMA di toccare il database (che ricontrolla tutto comunque: `bgl_prenota` è la seconda serratura).
// Le regole sono le stesse della funzione SQL: se ne cambia una, si cambia anche l'altra.

/** Lo slug dell'evento nell'indirizzo: 10 caratteri minuscoli e cifre senza 0 e 1. */
export const SLUG_RE = /^[a-z2-9]{10}$/;
/** La chiave di un posto: settore|fila|posto, es. «Platea|A|5». */
export const CHIAVE_RE = /^[^|]{1,24}\|[0-9A-Z]{1,4}\|[1-9][0-9]{0,3}$/;
/** Posti in una richiesta (e per email in un evento: lo controlla il database). */
export const MAX_POSTI = 4;

// deno-lint-ignore no-control-regex
const CONTROLLO = /[\u0000-\u001f\u007f]/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Prenotazione = { e: string; posti: string[]; nome: string; cognome: string; email: string };
export type EsitoValidazione =
  | { ok: true; value: Prenotazione }
  | { ok: false; errore: string; campo?: string };

const no = (errore: string, campo?: string): EsitoValidazione => campo ? { ok: false, errore, campo } : { ok: false, errore };

/** Testo dell'utente: tagliato, da `min` a `max` caratteri, senza caratteri di controllo. null se non va. */
function testo(x: unknown, min: number, max: number): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim();
  if (CONTROLLO.test(t)) return null;
  const n = [...t].length;
  return n >= min && n <= max ? t : null;
}

export function validaPrenotazione(x: unknown): EsitoValidazione {
  if (!x || typeof x !== "object" || Array.isArray(x)) return no("dati_non_validi", "corpo");
  const o = x as Record<string, unknown>;

  // il campo nascosto: una persona non lo vede e non lo riempie
  if (o.sito !== undefined && o.sito !== null && o.sito !== "") return no("dati_non_validi", "sito");

  // uno slug storto è un link sbagliato: per chi lo apre, l'evento non c'è
  if (typeof o.e !== "string" || !SLUG_RE.test(o.e)) return no("evento_inesistente");

  if (!Array.isArray(o.posti)) return no("dati_non_validi", "posti");
  const posti: string[] = [];
  for (const p of o.posti) {
    if (typeof p !== "string" || !CHIAVE_RE.test(p) || CONTROLLO.test(p)) return no("dati_non_validi", "posti");
    if (!posti.includes(p)) posti.push(p);   // due tocchi sullo stesso posto contano uno
  }
  if (posti.length === 0) return no("dati_non_validi", "posti");
  if (posti.length > MAX_POSTI) return no("troppi_posti");

  const nome = testo(o.nome, 1, 60);
  if (nome === null) return no("dati_non_validi", "nome");
  const cognome = testo(o.cognome, 1, 60);
  if (cognome === null) return no("dati_non_validi", "cognome");
  const email = testo(o.email, 3, 254);
  if (email === null || !EMAIL_RE.test(email)) return no("dati_non_validi", "email");

  return { ok: true, value: { e: o.e, posti, nome, cognome, email } };
}
