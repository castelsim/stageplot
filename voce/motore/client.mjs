// web/motore/client.mjs — interfaccia a Promise verso il worker (non va mai in reject)
export function creaMotore (url = new URL('./worker.mjs', import.meta.url)) {
  const w = new Worker(url, { type: 'module' })
  let n = 0
  let guasto = null
  const attese = new Map()
  w.onmessage = (e) => {
    const { id, risultato, avanzamento } = e.data
    const a = attese.get(id)
    if (!a) return
    if (avanzamento) { a.onAvanzamento?.(avanzamento); return }
    attese.delete(id)
    a.resolve(risultato)
  }
  const rompi = (e) => {
    // codice 'motore': worker morto, distinto da un errore di misura ('praat')
    guasto = { errore: 'motore', dettaglio: (e && e.message) || 'worker' }
    for (const a of attese.values()) a.resolve(guasto)
    attese.clear()
  }
  w.onerror = rompi
  w.onmessageerror = rompi
  function chiedi (richiesta, onAvanzamento) {
    if (guasto) return Promise.resolve(guasto)
    const id = ++n
    return new Promise((resolve) => {
      attese.set(id, { resolve, onAvanzamento })
      try {
        w.postMessage({ id, richiesta }, richiesta.audio ? [richiesta.audio] : [])
      } catch (err) {
        attese.delete(id)
        // errore della singola richiesta (non del worker): quindi 'praat', non 'motore'
        resolve({ errore: 'praat', dettaglio: String((err && err.message) || err) })
      }
    })
  }
  function copia (a) {
    if (a instanceof ArrayBuffer) return a.slice(0)
    if (ArrayBuffer.isView(a)) return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength)
    return null
  }
  function conAudio (tipo, audio, resto, onAvanzamento) {
    const c = copia(audio)
    if (!c) return Promise.resolve({ errore: 'formato' })
    return chiedi({ ...resto, tipo, audio: c }, onAvanzamento)
  }
  return {
    pronto: chiedi({ tipo: 'prepara' }),
    tracce: (audio, opz, onAvanzamento) => conAudio('tracce', audio, opz, onAvanzamento),
    converti: (audio, opz) => conAudio('wav', audio, opz),
    misura: (audio, da, a, opz) => conAudio('misura', audio, { ...opz, da, a })
  }
}
