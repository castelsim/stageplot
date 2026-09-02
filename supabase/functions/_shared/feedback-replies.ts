// _shared/feedback-replies.ts — le risposte alle segnalazioni, viste dal lato di chi le ha mandate.
//
// La logica sta qui e non dentro Deno.serve perché è quella che va provata: cosa si mostra, cosa no,
// e soprattutto cosa NON deve mai uscire dalla riga di database. La riga `feedback` contiene il
// messaggio originale, l'IP hashato, lo user agent, le note interne del triage e — quando l'utente
// l'ha allegato — un pezzo del suo progetto. All'app ne torna soltanto la risposta.

/** Quello che l'app riceve. Nient'altro esce mai da qui. */
export interface RispostaPubblica {
  id: string;
  /** Il testo scritto nel triage. */
  risposta: string;
  /** Quando è stata scritta, ISO. Serve all'app per dire «il 2 settembre». */
  risposta_il: string;
  /** L'inizio del messaggio originale, per far ricordare a quale segnalazione si riferisce. */
  richiamo: string;
}

/** Quanto del messaggio originale si rimanda indietro come promemoria. */
export const RICHIAMO_MAX = 90;

/**
 * Il promemoria di che cosa aveva segnalato: senza, «abbiamo sistemato» non si capisce a che si
 * riferisce — fra la segnalazione e la risposta possono passare giorni. Si taglia su una parola
 * intera, perché un troncamento in mezzo a una parola sembra un guasto.
 */
export function richiamoDi(messaggio: unknown): string {
  const t = String(messaggio ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= RICHIAMO_MAX) return t;
  const tagliato = t.slice(0, RICHIAMO_MAX);
  const spazio = tagliato.lastIndexOf(" ");
  return (spazio > 40 ? tagliato.slice(0, spazio) : tagliato) + "…";
}

/**
 * Da righe di database a quello che l'app può vedere.
 *
 * Le regole, tutte qui in un posto solo:
 *  · niente risposta, niente da mostrare;
 *  · già letta, niente da mostrare (non si ripropone la stessa cosa a ogni avvio);
 *  · le più recenti per prime;
 *  · e passa SOLO id, testo, data e richiamo: mai il resto della riga.
 */
export function risposteDaMostrare(righe: unknown, max = 3): RispostaPubblica[] {
  if (!Array.isArray(righe)) return [];
  return righe
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .filter((r) => typeof r.risposta === "string" && r.risposta.trim() !== "")
    .filter((r) => r.risposta_letta_il == null)
    .filter((r) => typeof r.id === "string" && r.id !== "")
    .sort((a, b) => String(b.risposta_il ?? "").localeCompare(String(a.risposta_il ?? "")))
    .slice(0, max)
    .map((r) => ({
      id: String(r.id),
      risposta: String(r.risposta).trim(),
      risposta_il: String(r.risposta_il ?? ""),
      richiamo: richiamoDi(r.message),
    }));
}
