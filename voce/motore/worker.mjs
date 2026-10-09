// web/motore/worker.mjs — Praat in un thread separato: la pagina non si blocca mai
import { createPraatWasm } from '../vendor/praat-wasm/js/praat-wasm.mjs'
import { gestisci } from './lavoro.mjs'

let praat = null
let corpi = null
let pronta = null

const prepara = () => pronta ??= (async () => {
  if (!praat) praat = await createPraatWasm(new URL('../vendor/praat-wasm/dist/praat.wasm', import.meta.url))
  if (!corpi) {
    const leggi = (n) => fetch(new URL('../misure/' + n + '.praat', import.meta.url)).then(r => {
      if (!r.ok) throw new Error('script ' + n + ': HTTP ' + r.status)
      return r.text()
    })
    corpi = { tratto: await leggi('tratto'), tracce: await leggi('tracce') }
  }
})().catch(e => { pronta = null; throw e })

// non lancia mai
async function rispondi ({ id, richiesta }) {
  // Praat (wasm o script) non caricato: errore distinto, la pagina chiede di controllare la connessione e ricaricare
  try { await prepara() } catch (err) {
    self.postMessage({ id, risultato: { errore: 'preparazione', dettaglio: String(err && err.message || err).slice(0, 300) } })
    return
  }
  try {
    if (richiesta.tipo === 'prepara') { self.postMessage({ id, risultato: true }); return }
    const risultato = await gestisci(praat, corpi, richiesta, (fase) => self.postMessage({ id, avanzamento: fase }))
    const trasf = risultato && risultato.spettro ? [risultato.spettro.buffer, risultato.f0.buffer, risultato.intensita.buffer, ...risultato.formanti.map(f => f.buffer)] : []
    self.postMessage({ id, risultato }, trasf)
  } catch (err) {
    const msg = String(err && err.message || err)
    if (/abort|out of memory/i.test(msg)) { praat = null; pronta = null }
    self.postMessage({ id, risultato: { errore: 'praat', dettaglio: msg.slice(0, 300) } })
  }
}

// Praat usa percorsi fissi in /tmp: le richieste non devono intrecciarsi
let coda = Promise.resolve()
self.onmessage = (e) => { coda = coda.then(() => rispondi(e.data)) }
