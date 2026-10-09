// web/motore/script.mjs — compone gli script Praat e ne legge l'output «chiave<TAB>valore»
export function componi (corpo, variabili) {
  const righe = Object.entries(variabili).map(([k, v]) =>
    k.endsWith('$') ? `${k} = "${String(v).replace(/"/g, '""')}"` : `${k} = ${Number(v)}`)
  return righe.join('\n') + '\n' + corpo
}

export function leggiRisultati (info) {
  const out = {}
  for (const riga of String(info).split('\n')) {
    const i = riga.indexOf('\t')
    if (i <= 0) continue
    const k = riga.slice(0, i).trim()
    const v = riga.slice(i + 1).trim()
    if (v === '--undefined--' || v === '') { out[k] = null; continue }
    const n = Number(v)
    out[k] = Number.isFinite(n) ? n : v
  }
  return out
}
