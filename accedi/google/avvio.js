/* Accesso con Google che passa da stageplot.it, non dal dominio tecnico di Supabase.
   (17/09/2026, Simone: Google scriveva «to continue to vsodplqkuvnsdiikvmjb.supabase.co».)

   Google mostra il dominio a cui torna il login. Con signInWithOAuth il ritorno è il callback di
   Supabase; qui invece Google torna a /accedi/google/ con un id_token (OpenID Connect, flusso
   implicito), e la pagina lo consegna a Supabase con signInWithIdToken. La sessione nasce uguale:
   stesso utente, stessa RLS.

   Il nonce: a Google va l'impronta SHA-256, a Supabase il valore grezzo (Supabase ricalcola
   l'impronta e la confronta con quella scritta nel token). Lo state difende dal ritorno forgiato.

   Script classico, senza dipendenze: lo usano l'editor, /consulenza/ e Orchestre (window.spGoogle),
   e i test in Node (module.exports). Se qualcosa manca (crypto, sessionStorage) accedi() restituisce
   false e il chiamante usa il login di prima. */
(function (root) {
  "use strict";
  var CLIENT_ID = "29634964193-fu9gauidvc56780mv625tjp6gatpaq1r.apps.googleusercontent.com";
  var PERCORSO = "/accedi/google/";
  var CHIAVE = "sp_google_accesso";
  var VALIDITA_MS = 10 * 60 * 1000;

  /* Dove tornare: solo un percorso di questo sito. Niente host, niente «//», niente schemi,
     niente ritorno alla pagina di accesso stessa (girerebbe in tondo). */
  function ritornoSicuro(back) {
    var s = String(back || "");
    if (s.charAt(0) !== "/" || s.charAt(1) === "/" || /[\s\\]/.test(s)) return "/app/";
    if (s.indexOf(PERCORSO) === 0) return "/app/";
    return s;
  }

  function urlGoogle(origin, nonceHash, state) {
    var p = {
      client_id: CLIENT_ID,
      redirect_uri: origin + PERCORSO,
      response_type: "id_token",
      scope: "openid email profile",
      nonce: nonceHash,
      state: state,
      prompt: "select_account"
    };
    return "https://accounts.google.com/o/oauth2/v2/auth?" + Object.keys(p).map(function (k) {
      return k + "=" + encodeURIComponent(p[k]);
    }).join("&");
  }

  /* La risposta di Google sta nel frammento (#id_token=…&state=… oppure #error=…). */
  function leggiRisposta(hash) {
    var out = {};
    String(hash || "").replace(/^#/, "").split("&").forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf("=");
      var k = i < 0 ? kv : kv.slice(0, i);
      var v = i < 0 ? "" : kv.slice(i + 1);
      try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { /* pezzo illeggibile: si ignora */ }
    });
    return out;
  }

  /* Confronta la risposta con quello che era stato chiesto. Pura: restituisce {ok, token, nonce, back}
     oppure {ok:false, motivo}. */
  function verificaRisposta(risposta, salvato, adesso) {
    if (!salvato || !salvato.state || !salvato.nonce) return { ok: false, motivo: "sessione" };
    var back = ritornoSicuro(salvato.back);
    if (risposta.error) return { ok: false, motivo: risposta.error === "access_denied" ? "annullato" : "google", back: back };
    if (!risposta.state || risposta.state !== salvato.state) return { ok: false, motivo: "state", back: back };
    if (!(adesso - (salvato.t || 0) < VALIDITA_MS)) return { ok: false, motivo: "scaduto", back: back };
    if (!risposta.id_token) return { ok: false, motivo: "token", back: back };
    return { ok: true, token: risposta.id_token, nonce: salvato.nonce, back: back };
  }

  function casuale() {
    var a = new Uint8Array(32);
    root.crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function sha256hex(s) {
    return root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }

  /* Parte il login. Restituisce una Promise<boolean>: false = qui non si può, usa il login di prima. */
  function accedi(back) {
    try {
      if (!root.crypto || !root.crypto.subtle || !root.sessionStorage || !root.location) return Promise.resolve(false);
      var nonce = casuale(), state = casuale();
      root.sessionStorage.setItem(CHIAVE, JSON.stringify({ nonce: nonce, state: state, back: ritornoSicuro(back), t: Date.now() }));
      return sha256hex(nonce).then(function (h) {
        root.location.assign(urlGoogle(root.location.origin, h, state));
        return true;
      }, function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  var api = { CLIENT_ID: CLIENT_ID, PERCORSO: PERCORSO, CHIAVE: CHIAVE, VALIDITA_MS: VALIDITA_MS,
    ritornoSicuro: ritornoSicuro, urlGoogle: urlGoogle, leggiRisposta: leggiRisposta,
    verificaRisposta: verificaRisposta, accedi: accedi };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.spGoogle = api;
})(typeof window !== "undefined" ? window : globalThis);
