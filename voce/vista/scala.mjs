// web/vista/scala.mjs — conversioni fra tempo e pixel, zoom, selezione
export function formatoTempo (s) {
  s = Math.round(s * 10) / 10
  const m = Math.floor(s / 60), r = s - m * 60
  return `${m}'${r.toFixed(1).padStart(4, '0').replace('.', ',')}"`
}
export const tempoInX = (t, v, w) => (t - v.da) / (v.a - v.da) * w
export const xInTempo = (x, v, w) => v.da + x / w * (v.a - v.da)
export function zoom (v, centro, fattore, durata) {
  const larg = Math.min(durata, Math.max(0.2, (v.a - v.da) * fattore))
  let da = centro - (centro - v.da) * fattore
  da = Math.max(0, Math.min(da, durata - larg))
  return { da: Math.round(da * 1e6) / 1e6, a: Math.round((da + larg) * 1e6) / 1e6 }
}
export const ordinaSelezione = (t1, t2) => ({ da: Math.min(t1, t2), a: Math.max(t1, t2) })
export function limitaSelezione (sel, durata) {
  const da = Math.max(0, sel.da), a = Math.min(durata, sel.a)
  return a - da >= 0.02 ? { da, a } : null
}

// Scala dell'altezza (asse destro), la stessa per PRE e POST: F0 finita nella vista su tutte le tracce,
// un semitono (×1,06) di margine, arrotondata a 50 Hz, ampiezza minima 100 Hz. null se nella vista non c'è voce.
export function scalaF0 (elencoTracce, vista) {
  let lo = Infinity, hi = -Infinity
  for (const tr of elencoTracce) {
    if (!tr) continue
    // solo i fotogrammi dentro la vista
    const i0 = Math.max(0, Math.ceil((vista.da - tr.t0) / tr.passo - 1e-9))
    const i1 = Math.min(tr.nT - 1, Math.floor((vista.a - tr.t0) / tr.passo + 1e-9))
    for (let i = i0; i <= i1; i++) {
      const v = tr.f0[i]
      if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v }
    }
  }
  if (!(hi >= lo)) return null
  let min = Math.floor(lo / 1.06 / 50) * 50, max = Math.ceil(hi * 1.06 / 50) * 50
  if (max - min < 100) {
    min = Math.max(0, Math.floor(((min + max) / 2 - 50) / 50) * 50)
    max = min + 100
  }
  return { min, max }
}

// tacche dell'asse dell'altezza: ogni 100 Hz se ce ne stanno almeno 4, altrimenti ogni 50 (ogni 25 se l'ampiezza è di soli 100 Hz)
export function taccheF0 ({ min, max }) {
  const ampiezza = max - min
  const passo = ampiezza >= 300 ? 100 : ampiezza >= 150 ? 50 : 25
  const out = []
  for (let f = Math.ceil(min / passo) * passo; f <= max + 1e-9; f += passo) out.push(f)
  return out
}
