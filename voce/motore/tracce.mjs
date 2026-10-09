// web/motore/tracce.mjs — dai file di Praat a un oggetto tracce campionato sugli istanti dello spettrogramma
import { leggiRisultati } from './script.mjs'

const DINAMICA = 70  // dB
const SILENZIO = -150 // dB: sotto questo massimo il file è silenzio digitale (il minimo calcolato è −200 dB)

function righe (testo) {
  return String(testo).trim().split('\n').map(r => r.split('\t').map(Number))
}

// valore del fotogramma più vicino a t; fuori dai limiti → NaN
function campiona (valori, x1, dx, t) {
  // sulla parità (k+0,5) il rumore in virgola mobile deciderebbe: scelgo sempre il fotogramma successivo
  const k = Math.floor((t - x1) / dx + 0.5 + 1e-9)
  return k >= 0 && k < valori.length ? valori[k] : NaN
}

export function costruisciTracce (info, testi) {
  const m = leggiRisultati(info)
  const nT = m.sp_nx, nF = m.sp_ny
  const tempi = Array.from({ length: nT }, (_, i) => m.sp_x1 + i * m.sp_dx)

  const sp = righe(testi.spettro)                 // righe = bande, colonne = istanti
  if (sp.length !== nF || sp.some(r => r.length !== nT)) throw new Error('spettrogramma: dimensioni incoerenti')
  const db = new Float32Array(nT * nF)
  let dbMax = -Infinity
  for (let j = 0; j < nF; j++) for (let i = 0; i < nT; i++) {
    const v = 10 * Math.log10(Math.max(sp[j][i], 1e-20))
    db[i * nF + j] = v
    if (v > dbMax) dbMax = v
  }
  // tutto silenzio: spettrogramma bianco, non nero (senza energia non c'è nulla da mostrare)
  const silenzioso = !(dbMax >= SILENZIO)
  const spettro = new Uint8Array(nT * nF)
  if (!silenzioso) for (let k = 0; k < db.length; k++) {
    spettro[k] = Math.max(0, Math.min(255, Math.round((db[k] - dbMax + DINAMICA) / DINAMICA * 255)))
  }

  const f0grezzo = righe(testi.f0)[0]
  const f0 = new Float32Array(nT)
  tempi.forEach((t, i) => { const v = campiona(f0grezzo, m.f0_x1, m.f0_dx, t); f0[i] = v > 0 ? v : NaN })

  const intGrezza = righe(testi.intensita)[0]
  const intensita = new Float32Array(nT)
  tempi.forEach((t, i) => { intensita[i] = campiona(intGrezza, m.in_x1, m.in_dx, t) })
  let iMax = -Infinity
  for (const v of intensita) if (Number.isFinite(v) && v > iMax) iMax = v

  const formanti = [1, 2, 3, 4].map(n => {
    const g = righe(testi['f' + n])[0]
    const out = new Float32Array(nT)
    tempi.forEach((t, i) => {
      const v = campiona(g, m.fo_x1, m.fo_dx, t)
      out[i] = (Number.isFinite(f0[i]) && intensita[i] > iMax - 25 && v > 0) ? v : NaN
    })
    return out
  })

  return { durata: m.durata, t0: m.sp_x1, passo: m.sp_dx, nT, nF, fPrimo: m.sp_y1, fPasso: m.sp_dy, dbMax, silenzioso, spettro, f0, formanti, intensita }
}
