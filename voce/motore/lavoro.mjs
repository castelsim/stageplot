// web/motore/lavoro.mjs — cosa fa il worker, senza dipendere dal browser
import { componi, leggiRisultati } from './script.mjs'
import { costruisciTracce } from './tracce.mjs'

export const DURATA_MINIMA = 0.1 // s

const FILE = ['spettro', 'f0', 'f1', 'f2', 'f3', 'f4', 'intensita']

// 'formato' solo se è fallita la lettura dell'audio; tutto il resto è un errore di Praat
const LETTURA_FALLITA = /not performed or completed:\s*«[^»]*Read from file|Data not read from|not recognized|Unsupported|Not an old-type|No lines/i

function esito (err) {
  const msg = String(err && err.message || err)
  return { errore: LETTURA_FALLITA.test(msg) ? 'formato' : 'praat', dettaglio: msg.slice(0, 300) }
}

function eAudio (a) {
  return a instanceof ArrayBuffer || ArrayBuffer.isView(a)
}

export async function gestisci (praat, corpi, richiesta, avanzamento = () => {}) {
  const segnala = (fase) => { try { avanzamento(fase) } catch (_) {} }
  let percorso = null
  try {
    if (!richiesta || typeof richiesta !== 'object') return { errore: 'praat', dettaglio: 'richiesta non valida' }
    if (richiesta.tipo !== 'tracce' && richiesta.tipo !== 'misura' && richiesta.tipo !== 'wav') return { errore: 'praat', dettaglio: 'tipo non valido' }
    if (!eAudio(richiesta.audio)) return { errore: 'formato' }
    if (richiesta.tipo === 'misura' && !(richiesta.a - richiesta.da >= DURATA_MINIMA - 1e-9)) return { errore: 'tratto_corto' }
    const est = (String(richiesta.nome).match(/\.[a-z0-9]+$/i) || ['.wav'])[0].toLowerCase()
    percorso = '/tmp/ingresso' + est
    try {
      const dati = richiesta.audio instanceof ArrayBuffer
        ? new Uint8Array(richiesta.audio)
        : new Uint8Array(richiesta.audio.buffer, richiesta.audio.byteOffset, richiesta.audio.byteLength)
      praat.writeFile(percorso, dati)
    } catch (err) {
      return { errore: 'praat', dettaglio: String(err && err.message || err).slice(0, 300) }
    }
    if (richiesta.tipo === 'wav') {
      // conversione per l'ascolto (formati che Praat legge e il browser no, come l'AIFF); le misure usano sempre i byte originali
      praat.run('Read from file: "' + percorso + '"\nSave as WAV file: "/tmp/conversione.wav"\nselect all\nRemove\n')
      return { wav: praat.getFile('/tmp/conversione.wav').slice().buffer }
    }
    const comuni = { file$: percorso, canale: richiesta.canale ?? 0, tetto: richiesta.tetto, f0max: richiesta.f0max }
    if (richiesta.tipo === 'tracce') {
      segnala('calcolo')
      try { praat.FS.mkdirTree('/tmp/out') } catch (_) {}
      const info = praat.run(componi(corpi.tracce, { ...comuni, out$: '/tmp/out/' }))
      if (!/sp_nx\t\d+/.test(info)) return { errore: 'praat', dettaglio: String(info).slice(0, 300) }
      segnala('lettura')
      const dec = new TextDecoder()
      const testi = Object.fromEntries(FILE.map(n => [n, dec.decode(praat.getFile('/tmp/out/' + n + '.txt'))]))
      return costruisciTracce(info, testi)
    }
    segnala('misura')
    const info = praat.run(componi(corpi.tratto, { ...comuni, da: richiesta.da, a: richiesta.a }))
    const r = leggiRisultati(info)
    if (!('cpps' in r)) return { errore: 'praat', dettaglio: String(info).slice(0, 300) }
    return r
  } catch (err) {
    return esito(err)
  } finally {
    try { praat.removeAll() } catch (_) {}
    if (percorso) { try { praat.FS.unlink(percorso) } catch (_) {} }
    try { praat.FS.unlink('/tmp/conversione.wav') } catch (_) {}
    for (const n of FILE) { try { praat.FS.unlink('/tmp/out/' + n + '.txt') } catch (_) {} }
  }
}
