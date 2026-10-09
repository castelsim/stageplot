// web/ascolto/ab.mjs — ascolto A/B sincronizzato con WebAudio
import { guadagnoPareggiato } from '../audio/file.mjs'

const PAUSA = 0.7
const RAMPA = 0.01 // dissolvenza di 10 ms (niente clic)

export function creaAscolto () {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const buf = {}, g = {}, pari = { PRE: 1, POST: 1 }
  for (const l of ['PRE', 'POST']) { g[l] = ctx.createGain(); g[l].connect(ctx.destination) }
  let sorgenti = [], scelto = 'PRE', inizio = 0, offset = 0, attivo = false, ciclo = null, pareggio = true
  let gen = 0 // generazione: un onended di una partenza vecchia non tocca lo stato nuovo
  let rich = 0 // richiesta: una play/prePoiPost in attesa di resume() decade se arriva altro
  let seq = null // sequenza «PRE poi POST» in corso: { t0, da, a, d, lati, gg, env }

  const lineare = (l) => (pareggio ? pari[l] : 1)
  const durataMax = () => Math.max(0, ...['PRE', 'POST'].map(l => (buf[l] ? buf[l].duration : 0)))
  // porta un parametro a 0 con una rampa di 10 ms partendo dal valore attuale
  function giu (param, t) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t); else param.cancelScheduledValues(t)
    param.linearRampToValueAtTime(0, t + RAMPA)
  }
  function applica () {
    const t = ctx.currentTime
    for (const l of ['PRE', 'POST']) {
      const p = g[l].gain
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t)
      p.setTargetAtTime(l === scelto ? lineare(l) : 0, t, 0.01)
    }
    if (seq) for (const l of seq.lati) seq.gg[l].gain.value = lineare(l)
  }
  function ferma () {
    gen++; rich++
    const t = ctx.currentTime
    giu(g.PRE.gain, t); giu(g.POST.gain, t)
    if (seq) seq.env.forEach(e => giu(e.gain, t))
    // le sorgenti si fermano a rampa finita
    sorgenti.forEach(s => { try { s.stop(t + RAMPA + 0.005) } catch (_) {} })
    sorgenti = []; attivo = false; seq = null
  }

  // stato della sequenza «PRE poi POST» al tempo corrente
  function statoSeq () {
    const { t0, da, a, d, lati } = seq
    const t = Math.max(0, ctx.currentTime - t0)
    if (t < d) return { pos: da + t, lato: lati[0] }
    if (lati.length < 2) return { pos: a, lato: lati[0] }
    if (t < d + PAUSA) return { pos: a, lato: lati[0] }
    return { pos: Math.min(a, da + (t - d - PAUSA)), lato: lati[1] }
  }

  // posizione pubblica: avvolta nella selezione se il loop è attivo
  function posPub () {
    if (seq) return statoSeq().pos
    if (!attivo) return offset
    const p = offset + Math.max(0, ctx.currentTime - inizio)
    if (!ciclo) return Math.min(p, durataMax())
    const L = ciclo.a - ciclo.da
    return ciclo.da + (((p - ciclo.da) % L) + L) % L
  }

  function avvia (da) {
    ferma()
    const mio = gen
    offset = Math.max(0, da); inizio = ctx.currentTime + 0.035 // dopo la rampa di discesa
    let vive = 0
    for (const l of ['PRE', 'POST']) {
      if (!buf[l]) continue
      const dur = buf[l].duration
      // con il loop il lato più corto ripete solo la sua parte del ciclo (loopEnd limitato alla sua durata) e non parte
      // se il ciclo comincia oltre la sua fine; l'interfaccia comunque limita il loop al file più corto (selezioneAscoltabile)
      if (offset >= dur || (ciclo && ciclo.da >= dur)) continue
      const s = ctx.createBufferSource(); s.buffer = buf[l]; s.connect(g[l])
      if (ciclo) { s.loop = true; s.loopStart = ciclo.da; s.loopEnd = Math.min(ciclo.a, dur) }
      s.onended = () => {
        if (mio !== gen) return
        if (--vive <= 0 && !ciclo) { attivo = false; offset = durataMax() }
      }
      s.start(inizio, offset); vive++; sorgenti.push(s)
    }
    for (const l of ['PRE', 'POST']) {
      const p = g[l].gain
      p.cancelScheduledValues(inizio)
      p.setValueAtTime(0, inizio)
      if (l === scelto) p.linearRampToValueAtTime(lineare(l), inizio + RAMPA)
    }
    attivo = vive > 0
    if (!attivo) offset = Math.min(offset, durataMax())
  }

  const api = {
    async carica (lato, audioBuffer) {
      api.pausa()
      buf[lato] = audioBuffer
      pari[lato] = guadagnoPareggiato(audioBuffer.getChannelData(0), audioBuffer.sampleRate)
      if (offset > durataMax()) offset = 0
    },
    async play (da = posPub()) {
      const r = ++rich
      if (ctx.state === 'suspended') await ctx.resume()
      if (r !== rich) return
      if (!ciclo && da >= durataMax() - 0.01) da = 0
      avvia(ciclo && (da < ciclo.da || da >= ciclo.a) ? ciclo.da : da)
    },
    pausa () { const p = posPub(); ferma(); offset = p },
    scambia () { scelto = scelto === 'PRE' ? 'POST' : 'PRE'; applica(); return scelto },
    sceltoÈ: () => (seq ? statoSeq().lato : scelto),
    posizione: () => posPub(),
    loop (sel) {
      if (sel && sel.a - sel.da < 0.05) sel = null
      const p = posPub() // con il vecchio ciclo
      ciclo = sel
      if (attivo && !seq) avvia(sel ? sel.da : p)
      else if (attivo) { ferma(); offset = p }
    },
    async prePoiPost (sel) {
      const r = ++rich
      if (ctx.state === 'suspended') await ctx.resume()
      if (r !== rich) return
      ferma()
      const mio = gen
      const t0 = ctx.currentTime + 0.05, d = sel.a - sel.da
      const lati = ['PRE', 'POST'].filter(l => buf[l])
      const gg = {}, env = []
      lati.forEach((l, k) => {
        const ts = t0 + k * (d + PAUSA)
        const s = ctx.createBufferSource(); s.buffer = buf[l]
        const e = ctx.createGain(); e.gain.setValueAtTime(0, ts)
        e.gain.linearRampToValueAtTime(1, ts + RAMPA)
        if (d > 2 * RAMPA) { e.gain.setValueAtTime(1, ts + d - RAMPA); e.gain.linearRampToValueAtTime(0, ts + d) }
        gg[l] = ctx.createGain(); gg[l].gain.value = lineare(l)
        s.connect(e); e.connect(gg[l]); gg[l].connect(ctx.destination)
        env.push(e); s.start(ts, sel.da, d); sorgenti.push(s)
        if (k === lati.length - 1) {
          s.onended = () => { if (mio !== gen) return; seq = null; attivo = false; offset = sel.da }
        }
      })
      seq = { t0, da: sel.da, a: sel.a, d, lati, gg, env }
      attivo = true; inizio = t0; offset = sel.da
    },
    pareggia (on) { pareggio = on; applica() },
    inRiproduzione: () => attivo
  }
  return api
}
