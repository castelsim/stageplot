// web/audio/file.mjs — riconoscere i file, scegliere PRE/POST, scrivere WAV, pareggiare il volume
const PRAAT = /\.(wav|wave|aif|aiff|aifc|flac|mp3)$/i
const DECODIFICA = /\.(m4a|aac|mp4|ogg|oga|opus|webm|caf)$/i

export function classificaFile (nome, tipoMime = '') {
  if (PRAAT.test(nome)) return 'praat'
  if (DECODIFICA.test(nome)) return 'decodifica'
  if (/^audio\//.test(tipoMime)) return 'decodifica'
  return 'non_audio'
}

export function scegliModo (files) {
  if (files.length === 0) return { errore: 'nessuno' }
  if (files.length > 2) return { errore: 'troppi' }
  if (files.length === 2) return { modo: 'coppia' }
  if (files.length === 1 && files[0].canali === 2) return { modo: 'chiedi_stereo' }
  return { modo: 'uno_solo' }
}

export function wavPcm24 (campioni, sr) {
  const n = campioni.length, dati = n * 3
  const riempimento = dati % 2   // RIFF: i blocchi hanno lunghezza pari, con un byte di riempimento
  const buf = new ArrayBuffer(44 + dati + riempimento), v = new DataView(buf)
  const scrivi = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  scrivi(0, 'RIFF'); v.setUint32(4, 36 + dati + riempimento, true); scrivi(8, 'WAVE'); scrivi(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * 3, true); v.setUint16(32, 3, true); v.setUint16(34, 24, true)
  scrivi(36, 'data'); v.setUint32(40, dati, true)
  for (let i = 0; i < n; i++) {
    const x = Number.isFinite(campioni[i]) ? Math.max(-1, Math.min(1, campioni[i])) : 0
    const y = x * 8388607
    const q = Math.sign(y) * Math.ceil(Math.abs(y) - 0.5)   // arrotondamento simmetrico (mezzi verso lo zero)
    v.setUint8(44 + i * 3, q & 255); v.setUint8(45 + i * 3, (q >> 8) & 255); v.setUint8(46 + i * 3, (q >> 16) & 255)
  }
  return buf
}

export function guadagnoPareggiato (campioni, sr, obiettivoDb = -20) {
  const n = Math.max(1, Math.round(0.05 * sr))
  const rms = []
  for (let i = 0; i + n <= campioni.length; i += n) {
    let s = 0; for (let k = i; k < i + n; k++) { const x = Number.isFinite(campioni[k]) ? campioni[k] : 0; s += x * x }
    rms.push(s / n)
  }
  if (!rms.length) return 1
  const ord = [...rms].sort((a, b) => a - b)
  const soglia = ord[Math.floor(ord.length * 0.6)]
  const forti = rms.filter(x => x >= soglia)
  const voce = Math.sqrt(forti.reduce((a, b) => a + b, 0) / forti.length)
  const g = voce > 0 ? Math.pow(10, obiettivoDb / 20) / voce : 1
  // Il taglio dei picchi creerebbe rumore finto (falsa HNR, CPPS, raucedine): il guadagno non supera −1 dBFS di picco.
  let picco = 0
  for (let i = 0; i < campioni.length; i++) { const a = Number.isFinite(campioni[i]) ? Math.abs(campioni[i]) : 0; if (a > picco) picco = a }
  return picco > 0 ? Math.min(g, 10 ** (-1 / 20) / picco) : g
}

export const avvisoDurata = (s) => (s > 600 ? 'lungo' : null)

// Tetto: oltre 30 minuti o 1 GB il file non si decodifica nemmeno (il browser esaurirebbe la memoria)
export const TETTO_SECONDI = 30 * 60
export const TETTO_BYTE = 1024 ** 3

// Durata in secondi letta dall'intestazione (primi 64 kB) di WAV, AIFF e FLAC, senza decodificare; null se non si sa.
export function durataIntestazione (u8, dimensione = u8.length) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const tag = (o) => (o + 4 <= u8.length ? String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]) : '')
  try {
    if (tag(0) === 'RIFF' && tag(8) === 'WAVE') {
      let byteAlSecondo = 0
      for (let o = 12; o + 8 <= u8.length;) {
        const id = tag(o), n = v.getUint32(o + 4, true)
        if (id === 'fmt ') byteAlSecondo = v.getUint32(o + 16, true)
        if (id === 'data') {
          if (!byteAlSecondo) return null
          // registrazioni in corso o troncate dichiarano più dati di quelli che ci sono: vale la dimensione vera
          return Math.min(n, Math.max(0, dimensione - o - 8)) / byteAlSecondo
        }
        o += 8 + n + (n % 2)
      }
      return null
    }
    if (tag(0) === 'FORM' && (tag(8) === 'AIFF' || tag(8) === 'AIFC')) {
      for (let o = 12; o + 8 <= u8.length;) {
        const id = tag(o), n = v.getUint32(o + 4, false)
        if (id === 'COMM') {
          const fotogrammi = v.getUint32(o + 10, false)
          // frequenza in virgola mobile a 80 bit (IEEE 754 esteso)
          const esp = v.getUint16(o + 16, false) & 0x7fff
          const mant = v.getUint32(o + 18, false) * 2 ** 32 + v.getUint32(o + 22, false)
          const sr = mant * 2 ** (esp - 16383 - 63)
          return sr > 0 ? fotogrammi / sr : null
        }
        o += 8 + n + (n % 2)
      }
      return null
    }
    if (tag(0) === 'fLaC' && (u8[4] & 0x7f) === 0) {
      // STREAMINFO: frequenza 20 bit, canali 3, bit 5, campioni totali 36 bit
      const b = 8 + 10
      const sr = u8[b] * 4096 + u8[b + 1] * 16 + (u8[b + 2] >> 4) // moltiplicazioni: lo script di pubblicazione rifiuta «<» doppio
      const campioni = (u8[b + 3] & 0x0f) * 2 ** 32 + v.getUint32(b + 4, false)
      return sr > 0 && campioni > 0 ? campioni / sr : null
    }
  } catch (_) {}
  return null
}

export const troppoLungo = ({ dimensione = 0, durata = null }) => dimensione > TETTO_BYTE || (durata != null && durata > TETTO_SECONDI)
