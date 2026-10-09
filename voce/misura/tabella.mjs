// web/misura/tabella.mjs — righe della tabella PRE/POST e messaggi d'errore
import { T } from '../testi/it.mjs'

// Scrive un valore già arrotondato a interi (n = valore × 10^decimali): virgola decimale, meno tipografico, mai «−0».
function scrivi (n, decimali, conSegno) {
  const p = 10 ** decimali
  if (n === 0) return (0).toFixed(decimali).replace('.', ',')
  const t = (Math.abs(n) / p).toFixed(decimali).replace('.', ',')
  return (n < 0 ? '−' : conSegno ? '+' : '') + t
}

export function righeTabella (pre, post, registro) {
  return registro.map(m => {
    const k = m.scala || 1
    const p = 10 ** m.decimali
    // Arrotondamento simmetrico (come wavPcm24); non finito o ≥ 1e15 dopo la scala → null («—»).
    const intero = (o) => {
      if (!o || !Number.isFinite(o[m.chiave])) return null
      const x = o[m.chiave] * k * p
      if (!Number.isFinite(x) || Math.abs(x) >= 1e15) return null
      const r = Math.sign(x) * Math.round(Math.abs(x))
      return Number.isFinite(r) ? r : null
    }
    const a = intero(pre)
    const b = intero(post)
    // La differenza si calcola sui valori già arrotondati, così chi legge la tabella può rifare il conto a mano.
    const diff = a !== null && b !== null ? b - a : null
    return {
      chiave: m.chiave, etichetta: m.etichetta, unita: m.unita, aiuto: m.aiuto,
      pre: a === null ? '—' : scrivi(a, m.decimali, false),
      post: b === null ? '—' : scrivi(b, m.decimali, false),
      differenza: diff === null ? '—' : scrivi(diff, m.decimali, true)
    }
  })
}

const MOTIVI = {
  tratto_corto: 'Tratto troppo corto: selezionane almeno 0,1 s.',
  formato: 'Formato non riconosciuto: usa un file audio (WAV, AIFF, FLAC, MP3, M4A, OGG…).',
  praat: 'Praat non è riuscito a misurare questo tratto (spesso succede se è quasi tutto silenzio).',
  nessuno: 'Scegli uno o due file audio: il PRE e il POST.',
  troppi: 'Al massimo due file: uno PRE e uno POST.',
  motore: 'Il motore di analisi si è fermato. Ricarica la pagina: i tuoi file restano sul computer.',
  preparazione: T.prepNonRiuscita,
  troppo_lungo: T.troppoLungo,
  oltre_fine: T.oltreFine
}
// Riceve solo il codice: il «dettaglio» tecnico non si mostra mai (contiene percorsi interni e testo di Praat).
// Accetta il codice oppure l'oggetto { errore, dettaglio } (il dettaglio viene ignorato).
export const motivoErrore = (e) => {
  const c = e !== null && typeof e === 'object' ? e.errore : e
  return typeof c === 'string' && Object.hasOwn(MOTIVI, c) ? MOTIVI[c] : MOTIVI.praat
}
