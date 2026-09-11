// supabase/functions/_shared/retention.ts
//
// La retention che l'informativa promette, nella parte che il database da solo non sa fare: le schermate
// allegate alle segnalazioni vivono 30 giorni. Fino all'11/09/2026 le cancellava `stageplot_purge_expired()`
// con un DELETE diretto su `storage.objects` — che Supabase ora rifiuta con un trigger, e che comunque
// toglieva la RIGA senza togliere il FILE dallo storage sottostante. Le schermate si cancellano con la
// Storage API; questo modulo decide quali, senza toccare niente.

export const SHOT_BUCKET = "feedback-shots";
export const SHOT_DAYS = 30;
const DAY_MS = 86_400_000;
const DAY_NAME = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Le cartelle-giorno del bucket che sono scadute a `now`.
 *
 *  `submit-feedback` salva ogni schermata in `AAAA-MM-GG/<uuid>.<est>`, con la data UTC del caricamento:
 *  una cartella contiene i file di un giorno intero. Si cancella quando anche l'ULTIMO istante di quel
 *  giorno è più vecchio della soglia — cioè mai in anticipo, al massimo un giorno in ritardo.
 *  Un nome che non è una data vera non si tocca: non si cancella quello che non si capisce. */
export function expiredDayFolders(names: string[], now: Date, days = SHOT_DAYS): string[] {
  const cutoff = now.getTime() - days * DAY_MS;
  const out: string[] = [];
  for (const name of names) {
    const m = DAY_NAME.exec(name);
    if (!m) continue;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const start = Date.UTC(y, mo - 1, d);
    const back = new Date(start);
    /* Date.UTC accetta il 31 febbraio e lo fa diventare il 3 marzo: il nome non è una data */
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) continue;
    if (start + DAY_MS <= cutoff) out.push(name);
  }
  return out.sort();
}

/** L'ultimo giorno (AAAA-MM-GG, UTC) interamente scaduto a `now`: tutto quello che porta questa data o una
 *  precedente è oltre la soglia. È la stessa regola di `expiredDayFolders`, detta come un confine — serve a
 *  togliere i riferimenti anche quando la cartella non c'è più (tolta da un giro precedente che poi era
 *  caduto sul secondo passo: senza, quel riferimento resterebbe per sempre). */
export function lastExpiredDay(now: Date, days = SHOT_DAYS): string {
  const cutoff = now.getTime() - days * DAY_MS;
  /* il giorno D è scaduto se D + 1 giorno <= cutoff: l'ultimo è quello che finisce entro la soglia */
  const endOfLast = Math.floor(cutoff / DAY_MS) * DAY_MS;
  return new Date(endOfLast - DAY_MS).toISOString().slice(0, 10);
}

/** Spezza un elenco in pezzi da `size`: la Storage API cancella a lotti. */
export function chunks<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("dimensione del lotto non valida");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
