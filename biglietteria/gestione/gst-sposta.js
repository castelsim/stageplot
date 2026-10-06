/* Biglietteria — «SPOSTA» una prenotazione (specifica area §4.1, decisione D6): si toccano i nuovi posti sulla pianta
   (tanti quanti ne ha adesso), si conferma; facoltativo «Avvisa per mail» (mail breve con i posti nuovi, nessun testo
   libero: Edge Function bgl-avvisa). Il server fa tutto in una transazione (bgl_sposta): qui si sceglie e si conferma. */
(function (root) {
  "use strict";
  var nodo = typeof module === "object" && module && module.exports;
  var PP = typeof root.piantaPostiModulo === "function" ? root.piantaPostiModulo() : (nodo ? require("../pianta-posti.js") : null);
  /* un tocco: aggiunge o toglie; mai un posto di un'altra persona, mai più posti di quelli di adesso */
  function spostaScelta(scelti, k, n, bloccati) {
    if ((bloccati || []).indexOf(k) >= 0) return { scelti: scelti.slice(), avviso: "occupato" };
    var i = scelti.indexOf(k);
    if (i >= 0) return { scelti: scelti.slice(0, i).concat(scelti.slice(i + 1)), avviso: null };
    if (scelti.length >= n) return { scelti: scelti.slice(), avviso: "pieno" };
    return { scelti: scelti.concat([k]), avviso: null };
  }
  /* pronto = tanti posti quanti adesso e (se si sanno i posti di adesso) non proprio gli stessi */
  function spostaPronto(scelti, n, attuali) {
    if (!(n > 0) || scelti.length !== n) return false;
    if (!attuali) return true;
    return scelti.some(function (k) { return attuali.indexOf(k) < 0; });
  }
  function frase(prima, dopo) { return PP.bglPostiNomi(prima) + " → " + PP.bglPostiNomi(dopo); }
  var PURO = { spostaScelta: spostaScelta, spostaPronto: spostaPronto, frase: frase };
  if (nodo) { module.exports = PURO; return; }
  var G = root.GST, A = G && G.app; if (!A) return;
  G.sposta = PURO;
  var BGL = root.BGL, ACC = root.BGLAccesso, esc = BGL.esc, S = null;

  A.estendi("prenotazione-azioni", function (p) { return p.stato === "attiva" ? [{ az: "sposta", testo: "Sposta" }] : []; });
  A.azione("sposta", function (el) { A.vai("sposta", { id: new URLSearchParams(location.search).get("id"), p: el.getAttribute("data-id") }); });
  A.azione("torna-scheda", function (el) { A.vai("scheda", { id: el.getAttribute("data-id") }); });
  A.registra("sposta", { disegna: function (q) { apri(q.get("id"), q.get("p")); } });

  function apri(id, pid) {
    A.corpo('<p class="carico" role="status">Carico la sala…</p>');
    G.api.prenotati(id).then(function (r) {
      if (!r.ok) return A.corpo('<section class="gst-centro"><h1>Sposta</h1><p class="gst-errore" role="alert">' + esc(G.messaggio(r)) + "</p></section>");
      var p = (r.prenotazioni || []).filter(function (x) { return x.id === pid && x.stato === "attiva"; })[0];
      if (!p) { A.avviso("Questa prenotazione non c'è più o è già disdetta.", "err"); return A.vai("scheda", { id: id }, true); }
      var altri = [];
      r.prenotazioni.forEach(function (x) { if (x.stato === "attiva" && x.id !== pid) altri = altri.concat(x.posti || []); });
      S = { id: id, p: p, ev: r.evento, altri: altri, scelti: [], inviando: false };
      disegna();
    });
  }
  function disegna() {
    var n = S.p.posti.length, ev = S.ev;
    document.title = "Sposta — " + ev.titolo;
    A.corpo('<section class="gst-sposta"><p class="ev-marchio"><a href="?v=scheda&amp;id=' + esc(S.id) + '" data-az="torna-scheda" data-id="' + esc(S.id) + '">← ' + esc(ev.titolo) + "</a></p>" +
      "<h1>Sposta " + esc(G.bglNomeCompleto(S.p)) + "</h1>" +
      '<p class="gst-aiuto">Adesso: <b>' + esc(PP.bglPostiNomi(S.p.posti)) + "</b> (bordo blu). Tocca " + n + (n === 1 ? " posto nuovo" : " posti nuovi") +
      " sulla pianta. I posti tenuti da parte si possono dare: escono dai tenuti.</p>" +
      '<div class="mappa gst-mappa" id="gst-sposta-mappa"></div>' +
      '<p class="gst-stato gst-sposta-stato" id="gst-sposta-stato" aria-live="polite"></p>' +
      '<label class="gst-spunta"><input type="checkbox" id="gst-avvisa"' + (S.p.email ? " checked" : " disabled") + "> Avvisa per mail" +
        (S.p.email ? "" : " (i dati di questa prenotazione sono già stati cancellati)") + "</label>" +
      (S.p.email ? '<p class="gst-aiuto">Una mail breve con i posti nuovi a ' + esc(S.p.email) + ".</p>" : "") +
      '<div class="gst-azioni"><button type="button" class="btn primario" data-az="conferma-sposta" disabled>Sposta</button>' +
        '<button type="button" class="btn" data-az="torna-scheda" data-id="' + esc(S.id) + '">Annulla</button></div></section>');
    var m = document.getElementById("gst-sposta-mappa");
    pianta(null);
    m.addEventListener("click", function (e) {
      var g = e.target.closest ? e.target.closest("g.posto[data-k]") : null; if (g) tocca(g.getAttribute("data-k"));
    });
    m.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var g = e.target.closest ? e.target.closest("g.posto[data-k]") : null; if (!g) return;
      e.preventDefault(); tocca(g.getAttribute("data-k"), true);
    });
  }
  /* solo la pianta e la riga sotto: un tocco non riporta la pagina in cima né sposta la pianta */
  function pianta(dove) {
    var m = document.getElementById("gst-sposta-mappa"), ev = S.ev, n = S.p.posti.length;
    m.innerHTML = BGL.svgPianta(ev.pianta, { occupati: S.altri, riservati: [], scelti: S.scelti, attiva: true });
    Array.prototype.forEach.call(m.querySelectorAll("g.posto[data-k]"), function (g) {
      var k = g.getAttribute("data-k");
      if (S.p.posti.indexOf(k) >= 0) g.classList.add("attuale");
      if ((ev.riservati || []).indexOf(k) >= 0 && S.scelti.indexOf(k) < 0 && S.altri.indexOf(k) < 0) g.classList.add("tenuto");
    });
    if (G.scheda && G.scheda.adattaMappa) G.scheda.adattaMappa(m, ev.pianta, dove);
    document.getElementById("gst-sposta-stato").textContent = S.scelti.length ? frase(S.p.posti, S.scelti) :
      "Nessun posto scelto (" + n + (n === 1 ? " da scegliere)" : " da scegliere)");
    var b = document.querySelector('[data-az="conferma-sposta"]');
    if (b && !S.inviando) b.disabled = !spostaPronto(S.scelti, n, S.p.posti);
  }
  function tocca(k, tastiera) {
    var n = S.p.posti.length, r = spostaScelta(S.scelti, k, n, S.altri);
    if (r.avviso === "pieno") A.avviso("Hai già scelto " + n + (n === 1 ? " posto" : " posti") + ": tocca uno scelto per toglierlo.", "err");
    else if (r.avviso === "occupato") A.avviso("Quel posto è di un'altra persona.", "err");
    var m = document.getElementById("gst-sposta-mappa");
    S.scelti = r.scelti; pianta({ l: m.scrollLeft, t: m.scrollTop });
    if (tastiera) { var g = m.querySelector('g.posto[data-k="' + (root.CSS && CSS.escape ? CSS.escape(k) : k) + '"]'); if (g && g.focus) g.focus(); }
  }
  /* la mail «posti cambiati» (Edge Function bgl-avvisa): true solo se il server dice che è partita. Con un tetto di
     attesa: una funzione che non risponde non deve lasciare l'organizzatore senza sapere com'è andata */
  var ATTESA_MAIL_MS = 20000;
  function avvisaPerMail(pid) {
    return ACC.token(A.cfg).then(function (tok) {
      if (!tok) return false;
      var ctl = typeof AbortController === "function" ? new AbortController() : null;
      var chiamata = fetch(A.cfg.api + "/functions/v1/bgl-avvisa", { method: "POST", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify({ prenotazione_id: pid }), signal: ctl ? ctl.signal : undefined })
        .then(function (res) { return res.json(); }).then(function (d) { return !!(d && d.ok && d.mail); });
      var scaduta = new Promise(function (ok) { setTimeout(function () { if (ctl) ctl.abort(); ok(false); }, ATTESA_MAIL_MS); });
      return Promise.race([chiamata, scaduta]);
    }).then(null, function () { return false; });
  }
  A.azione("conferma-sposta", function (el) {
    if (S.inviando || !spostaPronto(S.scelti, S.p.posti.length, S.p.posti)) return;
    S.inviando = true; el.disabled = true;
    var avvisa = document.getElementById("gst-avvisa").checked, prima = S.p.posti.slice(), pid = S.p.id, id = S.id;
    G.api.sposta(pid, S.scelti).then(function (r) {
      if (!r.ok) {
        S.inviando = false; el.disabled = false; A.avviso(G.messaggio(r), "err");
        if (r.errore === "posto_preso") apri(id, pid);   /* qualcuno ha appena prenotato: si ricarica la sala */
        return;
      }
      var fatto = "Spostato: " + frase(prima, r.posti) + ".";
      /* lo spostamento è fatto: si torna subito alla scheda; la mail si dice quando ha risposto */
      A.ricarica(); A.vai("scheda", { id: id }, true);
      if (!avvisa) { A.avviso(fatto); return; }
      A.avviso(fatto + " Invio la mail…");
      avvisaPerMail(pid).then(function (m) {
        A.avviso(fatto + (m ? " La mail è partita." : " La mail non è partita: avvisa tu la persona."), m ? "ok" : "err");
      });
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
