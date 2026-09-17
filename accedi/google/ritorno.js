/* Ritorno da Google (vedi avvio.js): consegna l'id_token a Supabase e torna dove si era.
   Il token sta nel frammento dell'indirizzo: lo si toglie SUBITO dalla barra e dalla cronologia,
   prima di qualsiasi altra cosa, così non resta in un segnalibro o in una schermata. */
(function () {
  "use strict";
  var hash = location.hash;
  try { history.replaceState(null, "", location.pathname); } catch (e) { /* resta nella barra: pazienza */ }

  var app = document.getElementById("app");
  var G = window.spGoogle;
  var SB_URL = "https://vsodplqkuvnsdiikvmjb.supabase.co";
  var SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzb2RwbHFrdXZuc2RpaWt2bWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTkyNjksImV4cCI6MjA5ODE5NTI2OX0.rZmZSvOnrNY3cC2JQ8XnbMTKIfjP5WmtbCtQ6l8zPrc";

  var MESSAGGI = {
    annullato: "Accesso annullato. Puoi riprovare quando vuoi.",
    sessione: "Questa pagina si è aperta senza una richiesta di accesso, oppure in un'altra scheda. Riprova da qui.",
    state: "La risposta di Google non corrisponde alla richiesta. Per sicurezza non ti faccio entrare: riprova.",
    scaduto: "È passato troppo tempo dalla richiesta. Riprova.",
    token: "Google non ha mandato l'accesso. Riprova.",
    google: "Google non ha completato l'accesso. Riprova.",
    supabase: "Il server non ha accettato l'accesso. Riprova, oppure usa l'accesso di riserva.",
    rete: "Il server non risponde. Controlla la connessione e riprova."
  };

  function nodo(tag, cls, testo) { var n = document.createElement(tag); if (cls) n.className = cls; if (testo) n.textContent = testo; return n; }

  function errore(motivo, back) {
    back = G ? G.ritornoSicuro(back) : "/app/";
    app.innerHTML = "";
    app.appendChild(nodo("h1", "", "Accesso non riuscito"));
    app.appendChild(nodo("p", "err", MESSAGGI[motivo] || MESSAGGI.google));
    var riprova = nodo("button", "btn primary block", "Riprova con Google");
    riprova.type = "button";
    riprova.addEventListener("click", function () {
      riprova.disabled = true;
      G.accedi(back).then(function (ok) { if (!ok) riserva(back); });
    });
    app.appendChild(riprova);
    /* Riserva: il login di prima, che passa dal dominio di Supabase ma non dipende da questa pagina. */
    var alt = nodo("button", "btn ghost block", "Usa l'accesso di riserva");
    alt.type = "button";
    alt.addEventListener("click", function () { riserva(back); });
    app.appendChild(alt);
    var torna = nodo("a", "btn ghost block", "Torna senza accedere");
    torna.href = back;
    app.appendChild(torna);
  }

  function client() {
    var lib = window.supabase;
    return lib && lib.createClient
      ? lib.createClient(SB_URL, SB_ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" } })
      : null;
  }

  function riserva(back) {
    var sb = client();
    if (!sb) { errore("rete", back); return; }
    sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + back } });
  }

  if (!G) { errore("rete", "/app/"); return; }
  var salvato = null;
  try { salvato = JSON.parse(sessionStorage.getItem(G.CHIAVE) || "null"); } catch (e) { salvato = null; }
  try { sessionStorage.removeItem(G.CHIAVE); } catch (e) { /* una volta sola comunque: lo state non vale due volte */ }

  var esito = G.verificaRisposta(G.leggiRisposta(hash), salvato, Date.now());
  if (!esito.ok) { errore(esito.motivo, esito.back); return; }
  var sb = client();
  if (!sb) { errore("rete", esito.back); return; }
  sb.auth.signInWithIdToken({ provider: "google", token: esito.token, nonce: esito.nonce }).then(function (r) {
    if (r && r.error) { console.error("accesso Google:", r.error.message); errore("supabase", esito.back); return; }
    try { sessionStorage.setItem("sp_accesso_google", "1"); } catch (e) { /* conta solo per le statistiche dell'editor */ }
    location.replace(esito.back);
  }, function () { errore("rete", esito.back); });
})();
