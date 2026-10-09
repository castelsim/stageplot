/* Biglietteria — l'accesso condiviso da area dell'organizzatore, «Le mie prenotazioni» e scheda dello spettacolo.
   Stesso progetto Supabase, stessa chiave di sessione in localStorage e quindi stessa sessione dell'editor (stesso sito).
   L'accesso Google passa da /accedi/google/ come nell'editor (Google mostra stageplot.it); se lì non si può, il login di
   Supabase (serve https://stageplot.it/biglietteria/** fra gli indirizzi di ritorno ammessi: task 24).
   supabase-js si carica SOLO quando serve. AGENTS §8: getSession() con session:null e un errore di rete NON è «uscito».
   Parte pura esportata per i test in Node, parte browser sotto. */
(function (root) {
  "use strict";
  function chiaveSessione(api) {
    var h; try { h = new URL(api).hostname; } catch (e) { return null; }
    return "sb-" + h.split(".")[0] + "-auth-token";
  }
  function sessioneSalvata(storage, api) {
    try {
      var k = chiaveSessione(api), v = k && storage ? storage.getItem(k) : null;
      if (!v) return false;
      var o = JSON.parse(v);
      return !!(o && (o.access_token || (o.currentSession && o.currentSession.access_token)));
    } catch (e) { return false; }
  }
  function statoAccesso(r) {
    if (r && r.sessione && r.sessione.access_token) return "dentro";
    var e = r && r.errore;
    if (e && (e.name === "AuthRetryableFetchError" || /fetch|network|rete|timeout/i.test(String(e.message || "")))) return "senza_rete";
    return "fuori";
  }
  function nomeDaGoogle(meta) {
    meta = meta || {};
    var n = String(meta.given_name || "").trim(), c = String(meta.family_name || "").trim();
    if (n || c) return { nome: n, cognome: c };
    var t = String(meta.full_name || meta.name || "").trim().replace(/\s+/g, " "), i = t.indexOf(" ");
    return i < 0 ? { nome: t, cognome: "" } : { nome: t.slice(0, i), cognome: t.slice(i + 1) };
  }

  /* ---- browser ---- */
  var libreria = null, clienti = {};
  function caricaLibreria() {
    if (root.supabase && root.supabase.createClient) return Promise.resolve(root.supabase);
    if (libreria) return libreria;
    libreria = new Promise(function (ok, no) {
      var s = document.createElement("script"); s.src = "/vendor/supabase.min.js"; s.async = true;
      s.onload = function () { root.supabase && root.supabase.createClient ? ok(root.supabase) : no(new Error("supabase")); };
      s.onerror = function () { libreria = null; no(new Error("supabase")); };
      document.head.appendChild(s);
    });
    return libreria;
  }
  function cliente(cfg) {
    if (clienti[cfg.api]) return Promise.resolve(clienti[cfg.api]);
    return caricaLibreria().then(function (L) {
      return (clienti[cfg.api] = clienti[cfg.api] || L.createClient(cfg.api, cfg.anon,
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } }));
    });
  }
  /* Senza rete e col token scaduto supabase-js riprova il rinnovo per circa 30 secondi prima di rispondere (prova del
     06/10 nel browser): troppo a lungo su «Un momento…». Passato ATTESA_MS si dice «senza rete» (e «Riprova»); la
     sessione salvata resta lì, non si butta fuori nessuno. */
  var ATTESA_MS = 10000;
  function conLimite(promessa, ms, valore) {
    return new Promise(function (ok, no) {
      var t = setTimeout(function () { ok(valore); }, ms);
      Promise.resolve(promessa).then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); no(e); });
    });
  }
  function sessione(cfg) {
    var lenta = { sessione: null, errore: { name: "AuthRetryableFetchError", message: "timeout" } };
    return conLimite(cliente(cfg).then(function (c) { return c.auth.getSession(); }).then(function (r) {
      return { sessione: (r && r.data && r.data.session) || null, errore: (r && r.error) || null };
    }), ATTESA_MS, lenta).then(null, function (e) { return { sessione: null, errore: { name: "AuthRetryableFetchError", message: String(e && e.message || e) } }; });
  }
  function accedi(cfg, back) {
    var g = root.spGoogle;
    return (g ? g.accedi(back) : Promise.resolve(false)).then(function (ok) {
      if (ok) return true;
      return cliente(cfg).then(function (c) {
        return c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + back } });
      }).then(function () { return true; });
    });
  }
  function esci(cfg) { return cliente(cfg).then(function (c) { return c.auth.signOut(); }).then(function () { return true; }, function () { return false; }); }
  function rpcGrezza(cfg, fn, args) { return cliente(cfg).then(function (c) { return c.rpc(fn, args || {}); }); }
  function token(cfg) { return sessione(cfg).then(function (s) { return s.sessione ? s.sessione.access_token : null; }); }

  var ACC = { chiaveSessione: chiaveSessione, sessioneSalvata: sessioneSalvata, statoAccesso: statoAccesso, nomeDaGoogle: nomeDaGoogle,
    conLimite: conLimite, ATTESA_MS: ATTESA_MS,
    cliente: cliente, sessione: sessione, accedi: accedi, esci: esci, rpcGrezza: rpcGrezza, token: token };
  root.BGLAccesso = ACC;
  if (typeof module === "object" && module && module.exports) module.exports = ACC;
})(typeof globalThis !== "undefined" ? globalThis : this);
