// web/esporta/png.mjs — figura per la tesi: titolo, i due spettrogrammi, legenda, piede con la fonte
const mmss = (s) => `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}`

// nome del file dal titolo scelto: senza accenti né caratteri speciali, al massimo 60 caratteri
export function nomeFigura (titolo, sel, scostamento = 0) {
  const base = String(titolo ?? '').replace(/\.(wav|aiff?|flac|mp3|m4a)$/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '')
  const parti = ['voce']
  if (base) parti.push(base)
  if (sel) parti.push(`${mmss(sel.da + scostamento)}-${mmss(sel.a + scostamento)}`)
  return parti.join('_') + '.png'
}

export function componiFigura ({ canvasPre, canvasPost, titolo, legenda, piede }) {
  const W = Math.max(canvasPre.width, canvasPost.width), testa = Math.round(W / 28), pie = Math.round(W / 16)
  const out = document.createElement('canvas')
  out.width = W; out.height = testa + canvasPre.height + canvasPost.height + pie
  const c = out.getContext('2d')
  c.fillStyle = '#fff'; c.fillRect(0, 0, out.width, out.height)
  const m = Math.round(W / 140), larg = W - 2 * m
  c.fillStyle = '#111'; c.font = `bold ${Math.round(W / 50)}px system-ui, sans-serif`
  c.fillText(titolo, m, Math.round(testa * 0.7), larg)
  c.drawImage(canvasPre, 0, testa); c.drawImage(canvasPost, 0, testa + canvasPre.height)
  c.font = `${Math.round(W / 85)}px system-ui, sans-serif`; c.fillStyle = '#444'
  c.fillText(legenda, m, out.height - Math.round(pie * 0.55), larg)
  c.fillText(piede, m, out.height - Math.round(pie * 0.2), larg)
  return out
}

// risolve il blob, o null se il browser non riesce a codificare l'immagine
export function scarica (canvas, nome) {
  return new Promise((res) => canvas.toBlob((b) => {
    if (!b) { res(null); return }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); res(b)
  }, 'image/png'))
}
