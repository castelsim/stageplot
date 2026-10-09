// web/accesso/accesso.mjs — login Google obbligatorio; offline non vuol dire uscito
import { SB_URL, SB_ANON, RITORNO } from './config.mjs'

export const chiaveSessione = () => 'sb-' + new URL(SB_URL).hostname.split('.')[0] + '-auth-token'

// Senza rete, o con la rete ma Supabase irraggiungibile (Wi-Fi senza internet), decide la sessione salvata.
export function statoAccesso ({ sessione, salvata, online, raggiungibile = true }) {
  if (!online || !raggiungibile) return salvata ? 'dentro' : 'fuori'
  return sessione ? 'dentro' : 'fuori'
}

export const provaSenzaAccesso = (loc) =>
  loc.hostname === '127.0.0.1' && new URLSearchParams(loc.search).get('prova-senza-accesso') === '1'

let client = null
function prendiClient () {
  if (!client) client = window.supabase.createClient(SB_URL, SB_ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  return client
}

export const ATTESA_MASSIMA_MS = 4000
// al ritorno da Google (?code=…) getSession scambia il codice con la sessione: una richiesta in più, si aspetta di più
export const ATTESA_CON_CODICE_MS = 15000
export const attesaPer = (loc) => (/[?&]code=/.test(loc.search || '') ? ATTESA_CON_CODICE_MS : ATTESA_MASSIMA_MS)

export function _azzeraPerTest () { client = null }

export async function avviaAccesso ({ attesaMs = attesaPer(location) } = {}) {
  if (provaSenzaAccesso(location)) return { stato: 'dentro', utente: { id: 'prova', email: 'prova@locale' }, client: null }
  let salvata = false
  try {
    const s = JSON.parse(localStorage.getItem(chiaveSessione()))
    salvata = !!(s && typeof s.refresh_token === 'string' && s.refresh_token)
  } catch (_) {}
  const online = navigator.onLine
  let sessione = null
  let raggiungibile = true
  if (online) {
    let timer
    try {
      const scadenza = new Promise((_, rifiuta) => { timer = setTimeout(() => rifiuta(new Error('timeout')), attesaMs) })
      const r = await Promise.race([prendiClient().auth.getSession(), scadenza])
      // qualunque errore vale «non raggiungibile»: con un Wi-Fi a pagina d'accesso gli errori sono strani, meglio far entrare chi ha una sessione salvata
      if (r.error) raggiungibile = false
      sessione = r.data && r.data.session ? r.data.session : null
    } catch (_) { sessione = null; raggiungibile = false } finally { clearTimeout(timer) }
  }
  const stato = statoAccesso({ sessione, salvata, online, raggiungibile })
  let utente = null
  if (sessione) utente = { id: sessione.user.id, email: sessione.user.email }
  else if (stato === 'dentro') {
    try { const s = JSON.parse(localStorage.getItem(chiaveSessione())); utente = { id: s.user.id, email: s.user.email } } catch (_) {}
  }
  return { stato, utente, client: online ? prendiClient() : null }
}

export function entraConGoogle () {
  return prendiClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + RITORNO } })
}

// promessa con un limite di tempo: con un Wi-Fi che non risponde l'uscita non deve restare appesa
const entro = (p, ms) => {
  let timer
  return Promise.race([Promise.resolve(p).catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, ms) })]).finally(() => clearTimeout(timer))
}

export const LIMITE_USCITA_MS = 3000

// Prima si esce da questo browser (sessione locale e chiave salvata), poi il signOut globale con un limite,
// poi si ricarica comunque. Anche il signOut locale di supabase-js passa dalla rete: ha lo stesso limite.
export async function esci ({ limiteMs = LIMITE_USCITA_MS } = {}) {
  try { await entro(prendiClient().auth.signOut({ scope: 'local' }), limiteMs) } catch (_) {}
  try { localStorage.removeItem(chiaveSessione()) } catch (_) {}
  try { await entro(prendiClient().auth.signOut(), limiteMs) } catch (_) {}
  location.reload()
}
