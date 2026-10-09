// web/vista/spettrogramma.mjs — spettrogramma in grigi stile Praat + F0, formanti, fascia, selezione, cursore
// Asse sinistro: frequenza 0-6000 Hz (spettrogramma e formanti). Asse destro, come in Praat: la F0 sulla sua scala (st.f0Scala).
import { tempoInX, formatoTempo, taccheF0 } from './scala.mjs'

export const FMAX_VISTA = 6000
// margine destro fisso (anche senza asse della F0): spuntare l'altezza non sposta lo spettrogramma
const MARG = { s: 52, d: 58, a: 22, b: 46 }
const COLORI_F = ['#d55e00', '#009e73', '#0072b2', '#cc79a7'] // Okabe-Ito
const COLORE_F0 = '#e6007e'
const PASSI_TEMPO = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600]
const SPAZIO_TICK = 90 // px minimi fra due etichette del tempo
const FONT = 'system-ui, sans-serif'

// immagine dello spettrogramma in cache per canvas: si ricalcola solo se cambia la chiave
const cache = new WeakMap()

function immagineSpettrogramma (c, tr, vista, iw, ih) {
  const k = cache.get(c.canvas)
  if (k && k.tr === tr && k.da === vista.da && k.a === vista.a && k.iw === iw && k.ih === ih) return k.img
  const img = c.createImageData(iw, ih)
  const d = img.data
  d.fill(255) // sfondo bianco opaco dove non ci sono dati
  // riga di frequenza → indice di banda, calcolato una volta per riga
  const jr = new Int32Array(ih)
  for (let py = 0; py < ih; py++) {
    const f = (ih - py - 0.5) / ih * FMAX_VISTA
    const j = Math.floor((f - tr.fPrimo) / tr.fPasso + 0.5 + 1e-9)
    jr[py] = (j < 0 || j >= tr.nF) ? -1 : j
  }
  const durata = vista.a - vista.da
  for (let px = 0; px < iw; px++) {
    const t = vista.da + (px + 0.5) / iw * durata
    const i = Math.floor((t - tr.t0) / tr.passo + 0.5 + 1e-9)
    if (i < 0 || i >= tr.nT) continue
    const base = i * tr.nF
    for (let py = 0; py < ih; py++) {
      const j = jr[py]
      if (j < 0) continue
      const g = 255 - tr.spettro[base + j]
      const o = (py * iw + px) * 4
      d[o] = d[o + 1] = d[o + 2] = g
    }
  }
  cache.set(c.canvas, { tr, da: vista.da, a: vista.a, iw, ih, img })
  return img
}

export function disegna (canvas, tr, st) {
  const dpr = st.dpr || window.devicePixelRatio || 1
  const W = canvas.clientWidth, H = canvas.clientHeight
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
  const c = canvas.getContext('2d')
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, H)
  const w = W - MARG.s - MARG.d, h = H - MARG.a - MARG.b
  const vista = st.vista
  if (!(vista.a > vista.da) || !(w >= 1) || !(h >= 1)) return
  const y = (f) => MARG.a + h - f / FMAX_VISTA * h
  // F0 sulla sua scala a destra; senza scala (nessuna voce nella vista) resta sull'asse della frequenza
  const sF0 = st.mostra.f0 && st.f0Scala && st.f0Scala.max > st.f0Scala.min ? st.f0Scala : null
  const yF0 = sF0 ? (f) => MARG.a + h - (f - sF0.min) / (sF0.max - sF0.min) * h : y
  const X = (t) => MARG.s + tempoInX(t, vista, w)

  // pixel dello spettrogramma, alla risoluzione fisica (putImageData ignora la trasformazione del contesto)
  const iw = Math.max(1, Math.round(w * dpr)), ih = Math.max(1, Math.round(h * dpr))
  c.putImageData(immagineSpettrogramma(c, tr, vista, iw, ih), Math.round(MARG.s * dpr), Math.round(MARG.a * dpr))

  // sovrapposizioni ritagliate al riquadro
  c.save()
  c.beginPath(); c.rect(MARG.s, MARG.a, w, h); c.clip()

  if (st.mostra.fascia) { c.fillStyle = 'rgba(247,216,74,0.25)'; c.fillRect(MARG.s, y(5000), w, y(4000) - y(5000)) }

  // solo i fotogrammi della vista, al massimo un punto per pixel orizzontale
  const i0 = Math.max(0, Math.floor((vista.da - tr.t0) / tr.passo) - 1)
  const i1 = Math.min(tr.nT - 1, Math.ceil((vista.a - tr.t0) / tr.passo) + 1)
  const linea = (valori, scalaY) => {
    const p = new Path2D()
    let aperto = false, ultimo = NaN
    for (let i = i0; i <= i1; i++) {
      const v = valori[i]
      if (!Number.isFinite(v)) { aperto = false; continue }
      const x = X(tr.t0 + i * tr.passo)
      const col = Math.floor(x)
      if (col === ultimo) continue
      ultimo = col
      const yy = scalaY(v)
      if (aperto) p.lineTo(x, yy); else p.moveTo(x, yy)
      aperto = true
    }
    return p
  }
  const quadratini = (valori, colore) => {
    const piccoli = new Path2D()
    let ultimo = NaN
    const grandi = new Path2D()
    for (let i = i0; i <= i1; i++) {
      const v = valori[i]
      if (!Number.isFinite(v)) continue
      const x = X(tr.t0 + i * tr.passo)
      const col = Math.floor(x)
      if (col === ultimo) continue
      ultimo = col
      const yy = y(v)
      grandi.rect(x - 2.2, yy - 2.2, 4.4, 4.4)
      piccoli.rect(x - 1.2, yy - 1.2, 2.4, 2.4)
    }
    c.fillStyle = '#fff'; c.fill(grandi)
    c.fillStyle = colore; c.fill(piccoli)
  }
  if (st.mostra.formanti) tr.formanti.forEach((f, k) => quadratini(f, COLORI_F[k]))
  if (st.mostra.f0) {
    const p = linea(tr.f0, yF0)
    c.lineJoin = 'round'; c.lineCap = 'round'
    c.strokeStyle = '#fff'; c.lineWidth = 5; c.stroke(p)
    c.strokeStyle = COLORE_F0; c.lineWidth = 2.5; c.stroke(p)
  }

  if (st.selezione) {
    const x1 = X(st.selezione.da), x2 = X(st.selezione.a)
    c.fillStyle = 'rgba(138,59,18,0.15)'; c.fillRect(x1, MARG.a, x2 - x1, h)
    c.lineWidth = 3.5; c.strokeStyle = '#fff'; c.setLineDash([6, 4]); c.strokeRect(x1, MARG.a, x2 - x1, h)
    c.lineWidth = 1.5; c.strokeStyle = '#8a3b12'; c.strokeRect(x1, MARG.a, x2 - x1, h)
    c.setLineDash([])
  }
  if (st.cursore != null && st.cursore >= vista.da && st.cursore <= vista.a) {
    const x = X(st.cursore)
    c.beginPath(); c.moveTo(x, MARG.a); c.lineTo(x, MARG.a + h)
    c.strokeStyle = '#fff'; c.lineWidth = 4; c.stroke()
    c.strokeStyle = '#d2551e'; c.lineWidth = 2; c.stroke()
  }
  c.restore()

  // assi
  c.fillStyle = '#333'; c.font = `12px ${FONT}`; c.textAlign = 'right'
  for (let f = 0; f <= FMAX_VISTA; f += 1000) c.fillText(String(f), MARG.s - 6, y(f) + 4)
  c.fillText('Hz', MARG.s - 6, MARG.a - 8)

  // asse destro della F0: tacche e etichette in fucsia, solo con la F0 accesa e una scala
  if (sF0) {
    c.fillStyle = COLORE_F0; c.strokeStyle = COLORE_F0; c.lineWidth = 1; c.textAlign = 'left'
    const xa = MARG.s + w
    let ultimaY = Infinity
    for (const f of taccheF0(sF0)) {
      const yy = yF0(f)
      c.beginPath(); c.moveTo(xa, yy); c.lineTo(xa + 5, yy); c.stroke()
      if (ultimaY - yy < 14) continue // etichette troppo vicine: resta solo la tacca
      c.fillText(String(f), xa + 8, yy + 4)
      ultimaY = yy
    }
    c.font = `bold 12px ${FONT}`; c.textAlign = 'right'
    c.fillText('F0 (Hz)', W - 2, MARG.a - 8)
    c.font = `12px ${FONT}`; c.fillStyle = '#333'
  }

  // tempo mostrato T = t + scostamento; tick con indice intero
  const sc = st.scostamento || 0
  const durata = vista.a - vista.da
  const passo = PASSI_TEMPO.find(p => p / durata * w >= SPAZIO_TICK) || PASSI_TEMPO[PASSI_TEMPO.length - 1]
  c.textAlign = 'center'
  const kDa = Math.ceil((vista.da + sc) / passo - 1e-9), kA = Math.floor((vista.a + sc) / passo + 1e-9)
  let fine = -Infinity
  for (let k = kDa; k <= kA; k++) {
    const T = k * passo
    const x = X(T - sc)
    const testo = formatoTempo(T)
    const mis = c.measureText(testo).width
    if (x - mis / 2 < 0 || x + mis / 2 > W || x - mis / 2 < fine + 6) continue
    c.fillText(testo, x, MARG.a + h + 16)
    fine = x + mis / 2
  }
  c.fillText('tempo (min\'sec")', MARG.s + w / 2, H - 8)

  if (st.mostra.fascia) {
    c.font = `11px ${FONT}`; c.textAlign = 'right'
    c.lineWidth = 3; c.strokeStyle = '#fff'; c.lineJoin = 'round'
    c.strokeText('4-5 kHz', MARG.s + w - 4, y(5000) + 13)
    c.fillStyle = '#6b5300'; c.fillText('4-5 kHz', MARG.s + w - 4, y(5000) + 13)
  }

  // avviso dentro il riquadro (per esempio «Registrazione silenziosa»)
  if (st.nota) {
    c.font = `bold 16px ${FONT}`; c.textAlign = 'center'; c.fillStyle = '#555'
    c.fillText(st.nota, MARG.s + w / 2, MARG.a + h / 2)
  }

  c.font = `bold 18px ${FONT}`; c.textAlign = 'left'
  c.lineWidth = 4; c.strokeStyle = '#fff'; c.lineJoin = 'round'
  c.strokeText(st.etichetta, MARG.s + 8, MARG.a + 20)
  c.fillStyle = st.colore; c.fillText(st.etichetta, MARG.s + 8, MARG.a + 20)
  c.strokeStyle = '#999'; c.lineWidth = 1; c.strokeRect(MARG.s, MARG.a, w, h)
}

export const margini = () => ({ ...MARG })
