// web/app.js — collega accesso, file, motore, vista, ascolto, misure ed esportazione
import { T } from './testi/it.mjs'
import { avviaAccesso, entraConGoogle, esci, provaSenzaAccesso } from './accesso/accesso.mjs'
import { classificaFile, scegliModo, wavPcm24, avvisoDurata, durataIntestazione, troppoLungo } from './audio/file.mjs'
import { creaMotore } from './motore/client.mjs'
import { disegna, margini } from './vista/spettrogramma.mjs'
import { formatoTempo, xInTempo, zoom, ordinaSelezione, limitaSelezione, scalaF0 } from './vista/scala.mjs'
import { creaAscolto } from './ascolto/ab.mjs'
import { REGISTRO } from './misure/registro.mjs'
import { righeTabella, motivoErrore } from './misura/tabella.mjs'
import { componiFigura, nomeFigura, scarica } from './esporta/png.mjs'

const $ = (id) => document.getElementById(id)
const PRAAT_VERSIONE = '6.4.62'
const LATI = ['PRE', 'POST']
const COLORI = { PRE: '#1f6fb4', POST: '#d2551e' }
const S = { lati: {}, vista: null, selezione: null, cursore: null, mostra: { f0: true, formanti: false, fascia: false }, maschile: false, motore: null, ascolto: null, durata: 0, giro: 0, occupato: false, titoloToccato: false, misure: false }
const tetto = () => (S.maschile ? 5000 : 5500)
const opzioniPraat = (l) => ({ nome: l.nome, canale: l.canale, tetto: tetto(), f0max: 1100 })

function testi () {
  const set = { sottotitolo: T.sottotitolo, perche: T.perche, entra: T.entra, esci: T.esci, 'testo-pre': T.caricaPre, 'testo-post': T.caricaPost,
    'testo-stereo': T.stereo, 'stereo-si': T.stereoSi, 'stereo-no': T.stereoNo, play: T.play, 'pre-poi-post': T.prePoiPost, togli: T.togli,
    misura: T.misura, esporta: T.esporta, 't-pareggio': T.pareggio, 't-f0': T.f0, 't-formanti': T.formanti, 't-fascia': T.fascia, 't-maschile': T.vocemaschile,
    'aiuto-comandi': T.aiutoComandi, didattico: T.didattico, 'link-fonti': T.fonti, 'link-sorgente': T.sorgente,
    'zoom-piu': T.zoomPiu, 'zoom-meno': T.zoomMeno, 'vedi-tutto': T.vediTutto, 't-titolo': T.titoloFigura, 'th-differenza': T.differenza }
  for (const [id, t] of Object.entries(set)) $(id).textContent = t
}

const stato = (msg) => { $('stato').textContent = msg }
// errori che non dipendono dal file (motore fermo, Praat non caricato): il messaggio vale per tutta la pagina
const globale = (r) => !!r && (r.errore === 'motore' || r.errore === 'preparazione')
const scrivi = (id, t) => { if ($(id).textContent !== t) $(id).textContent = t }

// legenda solo di ciò che si vede
const legendaAttuale = (mostra) => [T.legendaParti.grigio, ...['f0', 'formanti', 'fascia'].filter(k => mostra[k]).map(k => T.legendaParti[k])].join(' · ')
const titoloPredefinito = () => T.titoloPredefinito(S.selezione ? ' · ' + T.tratto + ' ' + formatoTempo(S.selezione.da) + ' – ' + formatoTempo(S.selezione.a) : '')

// un solo decodificatore (i browser limitano il numero di AudioContext); risultato a 44,1 kHz, solo per ascoltare
let decodificatore = null
async function leggiFile (file) {
  const tipo = classificaFile(file.name, file.type)
  if (tipo === 'non_audio') return { errore: 'formato' }
  // tetto prima di leggere tutto: dimensione, e durata dall'intestazione per WAV, AIFF e FLAC
  if (troppoLungo({ dimensione: file.size })) return { errore: 'troppo_lungo' }
  const testa = new Uint8Array(await file.slice(0, 65536).arrayBuffer())
  if (troppoLungo({ durata: durataIntestazione(testa, file.size) })) return { errore: 'troppo_lungo' }
  const byte = await file.arrayBuffer()
  decodificatore ??= new OfflineAudioContext(1, 1, 44100)
  let audioBuffer
  try { audioBuffer = await decodificatore.decodeAudioData(byte.slice(0)) } catch (_) {
    if (tipo !== 'praat') return { errore: 'formato' }
    // formati che Praat legge e il browser no (AIFF): Praat prepara un WAV solo per l'ascolto
    const r = await S.motore.converti(byte, { nome: file.name })
    if (r.errore) return { errore: globale(r) ? r.errore : 'formato' }
    try { audioBuffer = await decodificatore.decodeAudioData(r.wav) } catch (_) { return { errore: 'formato' } }
  }
  // MP3, M4A, OGG non dicono la durata nell'intestazione: il tetto si controlla dopo la decodifica, prima di Praat
  if (troppoLungo({ durata: audioBuffer.duration })) return { errore: 'troppo_lungo' }
  return { nome: file.name, byte: tipo === 'praat' ? byte : null, audioBuffer, canali: audioBuffer.numberOfChannels, decodificato: tipo === 'decodifica' }
}

function mediaCanali (audioBuffer) {
  const n = audioBuffer.numberOfChannels
  if (n === 1) return audioBuffer.getChannelData(0)
  const out = new Float32Array(audioBuffer.length)
  for (let c = 0; c < n; c++) { const d = audioBuffer.getChannelData(c); for (let i = 0; i < out.length; i++) out[i] += d[i] / n }
  return out
}

function monoDa (audioBuffer, k) {
  const b = new AudioBuffer({ length: audioBuffer.length, numberOfChannels: 1, sampleRate: audioBuffer.sampleRate })
  b.copyToChannel(audioBuffer.getChannelData(k), 0); return b
}

// canale 0: nessun canale scelto, a Praat va la media dei canali (file con i byte originali: lo fa Praat; file decodificati dal browser: la facciamo qui)
async function preparaLato (lato, { nome, byte, audioBuffer }, canale) {
  const campioni = canale > 0 ? audioBuffer.getChannelData(canale - 1) : mediaCanali(audioBuffer)
  const audio = byte || wavPcm24(campioni, audioBuffer.sampleRate)
  const mono = canale > 0 ? monoDa(audioBuffer, canale - 1) : audioBuffer
  S.lati[lato] = { nome, audio, canale: byte ? canale : 1, durata: audioBuffer.duration, tracce: null }
  await S.ascolto.carica(lato, mono)
}

function svuotaRisultati () {
  $('risultati').hidden = true; $('tabella').querySelector('tbody').textContent = ''; S.misure = false
  if (window.__voce) window.__voce.ultimiRisultati = null
}

function nuovoGiro () {
  S.giro++; S.selezione = null; S.cursore = null; S.vista = null; S.titoloToccato = false
  S.ascolto.pausa(); S.ascolto.loop(null)
  svuotaRisultati()
  $('titolo-figura').value = titoloPredefinito()
  for (const id of ['comandi', 'legenda', 'spg-pre', 'spg-post']) $(id).hidden = true
}

async function calcolaTracce () {
  const giro = S.giro
  const presenti = LATI.filter(l => S.lati[l])
  const lungo = avvisoDurata(Math.max(...presenti.map(l => S.lati[l].durata))) === 'lungo' ? T.lungo + ' ' : ''
  for (const lato of presenti) {
    const l = S.lati[lato]
    stato(lungo + T.calcolo + ' (' + lato + ')')
    const r = await S.motore.tracce(l.audio, opzioniPraat(l))
    if (giro !== S.giro) return
    if (r.errore) {
      stato(globale(r) ? motivoErrore(r) : lato + ': ' + (r.errore === 'praat' ? T.fileNonAnalizzato : motivoErrore(r)))
      return
    }
    l.tracce = r
  }
  S.durata = Math.max(...presenti.map(l => S.lati[l].durata))
  S.vista = { da: 0, a: S.durata }
  stato(presenti.filter(l => S.lati[l].tracce.silenzioso).map(l => l + ': ' + T.silenziosa).join(' · '))
  mostraApp(); ridisegna()
}

function mostraApp () {
  for (const id of ['comandi', 'legenda']) $(id).hidden = false
  $('spg-pre').hidden = !S.lati.PRE; $('spg-post').hidden = !S.lati.POST
  aggiornaEtichette()
}

function aggiornaEtichette () {
  scrivi('play', S.ascolto.inRiproduzione() ? T.pausa : T.play)
  scrivi('ab', T.ab + S.ascolto.sceltoÈ() + ' ⇄')
}

// scala dell'altezza comune a PRE e POST (per confrontarli), ricalcolata sulla vista corrente
const scalaAltezza = () => scalaF0(LATI.map(l => S.lati[l] && S.lati[l].tracce), S.vista)

function ridisegna () {
  if (!S.vista) return
  const f0Scala = scalaAltezza()
  for (const [lato, id] of [['PRE', 'spg-pre'], ['POST', 'spg-post']]) {
    const l = S.lati[lato]; if (!l || !l.tracce) continue
    disegna($(id), l.tracce, { vista: S.vista, selezione: S.selezione, cursore: S.cursore, mostra: S.mostra, etichetta: lato, colore: COLORI[lato], scostamento: 0, f0Scala, nota: l.tracce.silenzioso ? T.silenziosa : null })
  }
  $('tempo').textContent = formatoTempo(S.cursore ?? 0)
  scrivi('legenda', legendaAttuale(S.mostra))
  if (!S.titoloToccato && $('titolo-figura').value !== titoloPredefinito()) $('titolo-figura').value = titoloPredefinito()
}

let ridisegnoInAttesa = false
function ridisegnaPresto () {
  if (ridisegnoInAttesa) return
  ridisegnoInAttesa = true
  requestAnimationFrame(() => { ridisegnoInAttesa = false; ridisegna() })
}

// tempo sotto il mouse, limitato alla vista e al file
function tempoDaEvento (e, canvas) {
  const r = canvas.getBoundingClientRect(), m = margini()
  const t = xInTempo(e.clientX - r.left - m.s, S.vista, r.width - m.s - m.d)
  return Math.min(Math.max(t, S.vista.da, 0), S.vista.a, S.durata)
}

// il più corto fra i file caricati: il loop e l'ascolto «PRE poi POST» non escono dal file
function selezioneAscoltabile () {
  const sel = S.selezione
  if (!sel) return null
  const d = Math.min(...LATI.filter(l => S.lati[l]).map(l => S.lati[l].durata))
  const r = { da: sel.da, a: Math.min(sel.a, d) }
  return r.a - r.da < 0.05 ? null : r
}
const impostaLoop = () => S.ascolto.loop(selezioneAscoltabile())

function spostaVista (dt) {
  const w = S.vista.a - S.vista.da
  const da = Math.max(0, Math.min(S.vista.da + dt, S.durata - w))
  S.vista = { da, a: da + w }
}

function zoomCentrale (fattore) { S.vista = zoom(S.vista, (S.vista.da + S.vista.a) / 2, fattore, S.durata); ridisegna() }

function collegaSpettrogrammi () {
  let drag = null // { canvas, t0, x0 }
  const chiudi = (e) => {
    if (!drag) return
    const { canvas, t0, x0 } = drag; drag = null
    const t = tempoDaEvento(e, canvas)
    if (Math.abs(e.clientX - x0) < 4) {
      S.selezione = null; S.cursore = t; S.ascolto.loop(null)
      if (S.ascolto.inRiproduzione()) S.ascolto.play(t)
    } else { S.selezione = ordinaSelezione(t0, t); impostaLoop() }
    ridisegna()
  }
  for (const id of ['spg-pre', 'spg-post']) {
    const c = $(id)
    c.addEventListener('mousedown', (e) => { if (e.button !== 0 || !S.vista) return; drag = { canvas: c, t0: tempoDaEvento(e, c), x0: e.clientX } })
    c.addEventListener('wheel', (e) => {
      if (!S.vista) return
      if (e.ctrlKey || e.altKey) { // pizzico del trackpad o Ctrl/Alt + rotella: zoom con il punto sotto il puntatore fermo
        e.preventDefault()
        S.vista = zoom(S.vista, tempoDaEvento(e, c), Math.min(2, Math.max(0.5, Math.exp(e.deltaY * 0.01))), S.durata); ridisegna()
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { // scorrimento orizzontale
        e.preventDefault()
        const r = c.getBoundingClientRect(), m = margini()
        spostaVista((e.deltaX || e.deltaY) / (r.width - m.s - m.d) * (S.vista.a - S.vista.da)); ridisegna()
      } // la rotella verticale normale fa scorrere la pagina
    }, { passive: false })
    // Safari: il pizzico del trackpad arriva come gesture* (non come rotella con Ctrl); senza preventDefault ingrandirebbe la pagina
    let scalaPrima = 1
    c.addEventListener('gesturestart', (e) => { e.preventDefault(); scalaPrima = 1 })
    c.addEventListener('gesturechange', (e) => {
      e.preventDefault()
      if (!S.vista || !(e.scale > 0)) return
      const fattore = Math.min(2, Math.max(0.5, scalaPrima / e.scale)) // dita che si allargano → vista più stretta
      scalaPrima = e.scale
      const centro = Number.isFinite(e.clientX) ? tempoDaEvento(e, c) : (S.vista.da + S.vista.a) / 2
      S.vista = zoom(S.vista, centro, fattore, S.durata); ridisegnaPresto()
    })
    c.addEventListener('gestureend', (e) => e.preventDefault())
  }
  window.addEventListener('mousemove', (e) => {
    if (!drag || Math.abs(e.clientX - drag.x0) < 4) return
    S.selezione = ordinaSelezione(drag.t0, tempoDaEvento(e, drag.canvas)); ridisegna()
  })
  window.addEventListener('mouseup', chiudi)
  window.addEventListener('blur', () => { drag = null })
}

async function misura () {
  if (!S.vista) return null
  if (!S.selezione) { stato(T.selezionaPrima); return null }
  if (S.occupato) return null
  const giro = S.giro, sel = { ...S.selezione }
  S.occupato = true; $('misura').disabled = true
  try {
    stato(T.misurando)
    const ris = {}
    for (const lato of LATI) {
      const l = S.lati[lato]; if (!l) continue
      const s = limitaSelezione(sel, l.durata)
      ris[lato] = s ? await S.motore.misura(l.audio, s.da, s.a, opzioniPraat(l)) : { errore: sel.da >= l.durata ? 'oltre_fine' : 'tratto_corto' }
      if (giro !== S.giro) return null
    }
    mostraRisultati(ris, sel); stato('')
    if (window.__voce) window.__voce.ultimiRisultati = ris
    return ris
  } finally { S.occupato = false; $('misura').disabled = false }
}

function mostraRisultati (ris, sel) {
  $('risultati').hidden = false
  $('tratto-tempi').textContent = formatoTempo(sel.da) + ' – ' + formatoTempo(sel.a)
  const buono = (r) => (r && !r.errore ? r : null)
  const pre = buono(ris.PRE), post = buono(ris.POST)
  S.misure = !!(pre || post) // c'è una tabella di misure: il piede della figura nomina il CPPS Robust
  $('avviso-acuto').hidden = ![pre, post].some(r => r && r.f0_mediana > 350)
  $('avviso-acuto').textContent = T.acuto
  // un lato più corto della selezione è misurato solo fino alla sua fine: si dice sopra la tabella
  const fine = LATI.filter(l => S.lati[l] && ris[l] && !ris[l].errore && sel.a > S.lati[l].durata + 1e-6)
    .map(l => T.finisce(l, formatoTempo(S.lati[l].durata)))
  $('avviso-fine').textContent = fine.join(' '); $('avviso-fine').hidden = !fine.length
  const corpo = $('tabella').querySelector('tbody'); corpo.textContent = ''
  for (const lato of LATI) if (ris[lato] && ris[lato].errore) {
    const td = corpo.insertRow().insertCell(); td.colSpan = 5
    td.textContent = (globale(ris[lato]) ? '' : lato + ': ') + motivoErrore(ris[lato])
  }
  if (!pre && !post) return
  for (const r of righeTabella(pre, post, REGISTRO)) {
    const tr = corpo.insertRow()
    tr.insertCell().textContent = r.etichetta + (r.unita ? ' (' + r.unita + ')' : '')
    for (const v of [r.pre, r.post, r.differenza]) { const td = tr.insertCell(); td.className = 'num'; td.textContent = v }
    const b = document.createElement('button'); b.className = 'piccolo'; b.textContent = '?'; b.title = r.aiuto
    b.setAttribute('aria-label', 'Cosa significa: ' + r.etichetta); b.setAttribute('aria-expanded', 'false')
    let riga = null
    b.addEventListener('click', () => {
      if (riga) { riga.remove(); riga = null; b.setAttribute('aria-expanded', 'false'); return }
      riga = corpo.insertRow(tr.rowIndex); riga.className = 'aiuto-riga'
      const td = riga.insertCell(); td.colSpan = 5; td.textContent = r.aiuto; b.setAttribute('aria-expanded', 'true')
    })
    tr.insertCell().append(b)
  }
}

// la figura si ridisegna fuori schermo a risoluzione doppia, senza cursore, alla larghezza della pagina (almeno 1400 px)
async function esporta () {
  if (!S.vista) return null
  // durante il ricalcolo (per esempio dopo «voce maschile») le tracce di un lato mancano: si chiede di aspettare
  if (!LATI.every(l => S.lati[l] && S.lati[l].tracce)) { stato(T.attendiCalcolo); return null }
  const larghezza = Math.max($('spg-pre').clientWidth, 1400)
  const fuori = []
  let blob = null
  try {
    const f0Scala = scalaAltezza()
    const tele = LATI.map(lato => {
      const c = document.createElement('canvas')
      c.style.position = 'fixed'; c.style.left = '-99999px'; c.style.top = '0'; c.style.width = larghezza + 'px'; c.style.height = '300px'
      document.body.append(c); fuori.push(c)
      disegna(c, S.lati[lato].tracce, { vista: S.vista, selezione: S.selezione, cursore: null, mostra: S.mostra, etichetta: lato, colore: COLORI[lato], scostamento: 0, dpr: 2, f0Scala, nota: S.lati[lato].tracce.silenzioso ? T.silenziosa : null })
      return c
    })
    const titolo = $('titolo-figura').value.trim()
    const fig = componiFigura({ canvasPre: tele[0], canvasPost: tele[1], titolo, legenda: legendaAttuale(S.mostra), piede: T.piede(PRAAT_VERSIONE, { maschile: S.maschile, misure: S.misure }) })
    blob = await scarica(fig, nomeFigura(titolo, S.selezione, 0))
    if (!blob) stato(T.figuraNonRiuscita)
  } catch (_) {
    blob = null; stato(T.figuraNonRiuscita) // qualunque errore nel disegno o nella codifica: un messaggio, mai una promessa rifiutata
  } finally { fuori.forEach(c => c.remove()); ridisegna() }
  if (window.__voce) window.__voce.ultimaFigura = blob
  return blob
}

function collegaComandi () {
  $('play').onclick = async () => { if (S.ascolto.inRiproduzione()) { S.ascolto.pausa(); S.cursore = S.ascolto.posizione() } else await S.ascolto.play(S.cursore ?? 0); aggiornaEtichette(); ridisegna() }
  $('ab').onclick = () => { S.ascolto.scambia(); aggiornaEtichette() }
  $('pre-poi-post').onclick = () => {
    const sel = selezioneAscoltabile()
    if (!sel) { stato(T.selezionaPrima); return }
    S.ascolto.prePoiPost(sel)
  }
  $('togli').onclick = () => { S.selezione = null; S.ascolto.loop(null); ridisegna() }
  $('misura').onclick = misura
  $('esporta').onclick = esporta
  $('zoom-piu').onclick = () => S.vista && zoomCentrale(0.5)
  $('zoom-meno').onclick = () => S.vista && zoomCentrale(2)
  $('vedi-tutto').onclick = () => { if (S.vista) { S.vista = { da: 0, a: S.durata }; ridisegna() } }
  $('titolo-figura').oninput = () => { S.titoloToccato = true }
  $('c-pareggio').onchange = (e) => S.ascolto.pareggia(e.target.checked)
  for (const k of ['f0', 'formanti', 'fascia']) $('c-' + k).onchange = (e) => { S.mostra[k] = e.target.checked; ridisegna() }
  $('c-maschile').onchange = async (e) => {
    S.maschile = e.target.checked
    if (!S.vista) return
    // nuovo giro: scarta anche una misura in corso, e le tracce si ricalcolano con il nuovo tetto
    S.giro++; svuotaRisultati()
    for (const l of LATI) if (S.lati[l]) S.lati[l].tracce = null
    await calcolaTracce()
  }
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !S.vista) return
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return // lì i tasti servono a chi scrive o spunta
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) $('play').click() }
    else if (e.key === 'x' || e.key === 'X') $('ab').click()
    else if (e.key === 'Escape') $('togli').click()
  })
  // senza questo il pulsante col focus si attiverebbe anche al rilascio dello Spazio
  document.addEventListener('keyup', (e) => { if (e.code === 'Space' && e.target.tagName === 'BUTTON') e.preventDefault() })
  window.addEventListener('resize', ridisegnaPresto)
  const ciclo = () => {
    if (S.vista) { aggiornaEtichette(); if (S.ascolto.inRiproduzione()) { S.cursore = S.ascolto.posizione(); ridisegna() } }
    requestAnimationFrame(ciclo)
  }
  requestAnimationFrame(ciclo)
}

function collegaCaricamento () {
  const attesa = {}
  let sinistraDestra = null // file stereo diviso in PRE (sinistra) e POST (destra)
  // avvisi sotto le zone, sui file in uso
  function aggiornaAvvisi () {
    const usati = [...Object.values(attesa), ...(sinistraDestra ? [sinistraDestra] : [])]
    const avvisi = usati.some(f => f.decodificato) ? [T.decodificato] : []
    // in coppia un file a due canali non si divide: si analizza la media dei canali, e lo si dice
    if (attesa.PRE && attesa.POST) for (const l of LATI) if (attesa[l].canali === 2) avvisi.push(T.dueCanali(l))
    $('avvisi-file').textContent = avvisi.join(' ')
    $('avvisi-file').hidden = !avvisi.length
  }
  const zeroZone = () => { for (const lato of LATI) if (!attesa[lato]) $('testo-' + lato.toLowerCase()).textContent = lato === 'PRE' ? T.caricaPre : T.caricaPost }
  function azzeraAnalisi () {
    if (!S.vista && !Object.keys(S.lati).length) return
    nuovoGiro(); S.lati = {}; zeroZone()
  }
  // qualunque imprevisto (memoria, decodifica, ascolto): il file scartato libera la sua zona, l'analisi incompleta si azzera
  // se il file non era ancora entrato (errore in lettura) l'analisi già fatta e le zone restano come sono
  function fileScartato (nome, azzera) {
    if (azzera) { nuovoGiro(); S.lati = {}; sinistraDestra = null; zeroZone(); aggiornaAvvisi() }
    $('domanda-stereo').hidden = true
    stato(nome + ': ' + motivoErrore('formato'))
  }
  // non lancia mai: è chiamata dagli eventi senza attendere la promessa
  async function arrivato (lato, file) {
    let f = null
    try {
      stato(T.lettura + file.name + '…')
      f = await leggiFile(file)
      if (f.errore) { stato(globale(f) ? motivoErrore(f) : file.name + ': ' + motivoErrore(f)); return }
      attesa[lato] = f; sinistraDestra = null
      $('testo-' + lato.toLowerCase()).textContent = lato + ': ' + file.name
      aggiornaAvvisi()
      const modo = scegliModo(Object.values(attesa))
      if (modo.modo === 'chiedi_stereo') { $('domanda-stereo').hidden = false; S.stereoInAttesa = f; S.stereoLato = lato; stato(''); return }
      $('domanda-stereo').hidden = true
      if (modo.modo === 'coppia') {
        nuovoGiro()
        await preparaLato('PRE', attesa.PRE, 0); await preparaLato('POST', attesa.POST, 0)
        await calcolaTracce()
      } else { azzeraAnalisi(); stato(modo.errore ? motivoErrore(modo) : T.altroFile) }
    } catch (_) {
      const entrato = !!f && attesa[lato] === f
      if (entrato) delete attesa[lato]
      fileScartato(file.name, entrato)
    }
  }
  for (const lato of LATI) {
    const zona = $('zona-' + lato.toLowerCase()), input = $('file-' + lato.toLowerCase())
    input.onchange = () => { const f = input.files[0]; input.value = ''; if (f) arrivato(lato, f) }
    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('sopra') })
    zona.addEventListener('dragleave', () => zona.classList.remove('sopra'))
    zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('sopra'); e.dataTransfer.files[0] && arrivato(lato, e.dataTransfer.files[0]) })
  }
  // un file rilasciato fuori dalle zone non deve aprire una nuova pagina
  document.addEventListener('dragover', (e) => e.preventDefault())
  document.addEventListener('drop', (e) => e.preventDefault())
  $('stereo-si').onclick = async () => {
    $('domanda-stereo').hidden = true
    const f = S.stereoInAttesa
    if (!f) return
    try {
      for (const k of Object.keys(attesa)) delete attesa[k]
      sinistraDestra = f; aggiornaAvvisi()
      $('testo-pre').textContent = 'PRE: ' + f.nome + ' (sinistra)'; $('testo-post').textContent = 'POST: ' + f.nome + ' (destra)'
      nuovoGiro()
      await preparaLato('PRE', f, 1); await preparaLato('POST', f, 2)
      await calcolaTracce()
    } catch (_) { fileScartato(f.nome, true) }
  }
  // la zona libera è l'altra rispetto a quella del file stereo
  $('stereo-no').onclick = () => { $('domanda-stereo').hidden = true; stato(T.caricaAncora(S.stereoLato === 'POST' ? 'PRE' : 'POST')) }
}

// GitHub Pages non permette intestazioni HTTP (frame-ancestors): se la pagina è dentro un'altra, non parte
function dentroUnAltroSito () {
  try { return window.top !== window.self } catch (_) { return true }
}

function rifiutaIncorporamento () {
  document.body.textContent = ''
  const p = document.createElement('p'); p.style.cssText = 'padding:24px;font:16px system-ui,sans-serif'
  const a = document.createElement('a'); a.href = 'https://stageplot.it/voce/'; a.target = '_top'; a.textContent = 'stageplot.it/voce/'
  p.append(T.nonIncorporabile, a); document.body.append(p)
}

async function avvio () {
  if (dentroUnAltroSito()) { rifiutaIncorporamento(); return }
  testi()
  const acc = await avviaAccesso()
  if (acc.stato !== 'dentro') { $('schermo-accesso').hidden = false; $('entra').onclick = entraConGoogle; return }
  const prova = provaSenzaAccesso(location)
  $('utente').hidden = !acc.utente || prova; $('email').textContent = acc.utente?.email || ''; $('esci').onclick = esci
  $('schermo-app').hidden = false
  S.ascolto = creaAscolto(); S.motore = creaMotore()
  $('titolo-figura').value = titoloPredefinito()
  stato(T.primaVolta)
  S.motore.pronto.then((r) => {
    if (r && r.errore) stato(globale(r) ? motivoErrore(r) : T.prepNonRiuscita)
    else if ($('stato').textContent === T.primaVolta) stato('')
  })
  collegaCaricamento(); collegaSpettrogrammi(); collegaComandi()
  if (prova) {
    window.__voce = {
      S, ultimiRisultati: null, ultimaFigura: null, misura, esporta,
      seleziona: (da, a) => { S.selezione = { da, a }; impostaLoop(); ridisegna() }
    }
  }
}

avvio()
