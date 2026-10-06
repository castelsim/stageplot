/* Biglietteria — SCHEDA DI GESTIONE di uno spettacolo (specifica area §2.4): quello che faceva il pannello dell'editor
   (contatori, pianta con prenotati/liberi/tenuti, elenco con ricerca, «Disdici per conto suo», chiudi/riapri, lista per
   l'ingresso PDF per cognome e per fila, CSV, link e QR) più «Modifica», gli avvisi che aggiungono altri file (sala
   cambiata) e «Elimina spettacolo» con conferma. Le parti pure sono esportate per i test in Node. */
(function (root) {
  "use strict";
  var nodo = typeof module === "object" && module && module.exports;
  var G = root.GST || (nodo ? require("./gst.js") : null);
  var PP = typeof root.piantaPostiModulo === "function" ? root.piantaPostiModulo() : (nodo ? require("../pianta-posti.js") : null);

  /* l'elenco della scheda: prima le prenotazioni attive, poi le disdette; dentro, per cognome. La ricerca ignora
     accenti e maiuscole e guarda nome, cognome, email, codice e posti scritti come sulla lista («B 2») */
  function elencoPrenotazioni(lista, filtro) {
    var q = G.bglSenzaAccenti(filtro);
    return (lista || []).slice().sort(function (a, b) {
      var sa = a.stato === "attiva" ? 0 : 1, sb = b.stato === "attiva" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return G.bglCmp((a.cognome || "") + " " + (a.nome || ""), (b.cognome || "") + " " + (b.nome || ""));
    }).filter(function (p) {
      return !q || G.bglSenzaAccenti([p.nome, p.cognome, p.email, p.codice, PP.bglPostiNomi(p.posti)].join(" ")).indexOf(q) >= 0;
    });
  }
  /* posto → «Cognome Nome», solo per le prenotazioni attive (una disdetta ha lasciato il posto libero) */
  function nomiSuiPosti(lista) {
    var o = {};
    (lista || []).forEach(function (p) { if (p.stato === "attiva") (p.posti || []).forEach(function (k) { o[k] = G.bglNomeCompleto(p); }); });
    return o;
  }
  /* decisione 2 di Simone (06/10): eliminando uno spettacolo NON parte nessuna mail, e la conferma lo dice chiaro */
  function testoElimina(ev, n) {
    if (!n) return "«" + ev.titolo + "»: si cancella lo spettacolo. Il link e il QR smettono di funzionare. Non si può annullare.";
    return "«" + ev.titolo + "»: si cancellano lo spettacolo e le sue " + n + (n === 1 ? " prenotazione" : " prenotazioni") +
      ", con nomi ed email. Chi ha prenotato non riceve nessun avviso: se serve, avvisalo tu. Il link e il QR smettono di funzionare. Non si può annullare.";
  }
  var PURO = { elencoPrenotazioni: elencoPrenotazioni, nomiSuiPosti: nomiSuiPosti, testoElimina: testoElimina };
  if (nodo) { module.exports = PURO; return; }
  var A = G && G.app; if (!A) return;
  var BGL = root.BGL, I = root.BGLIndirizzi, esc = BGL.esc, S = { id: null, dati: null, filtro: "", seq: 0 };
  /* la pianta nel suo riquadro con la stessa misura del modulo (posti grandi abbastanza per il dito) e i posti in vista,
     non il palco; `dove` = lo scorrimento da tenere dopo un ridisegno. La usano anche sala cambiata e Sposta. */
  function adattaMappa(m, pianta, dove) {
    var svg = m && m.querySelector("svg"), box = pianta && pianta.box, MOD = G.modulo;
    if (!svg || !box || !MOD) return;
    var k = MOD.scalaMappa(box[2], m.clientWidth, BGL.scalaDettaglio(pianta));
    if (!k) return;
    svg.style.width = Math.round(box[2] * k) + "px"; svg.style.height = Math.round(box[3] * k) + "px";
    var s = dove || MOD.inizioMappa(pianta, k, m.clientWidth, m.clientHeight);
    m.scrollLeft = s.l; m.scrollTop = s.t;
  }
  G.scheda = { ricarica: carica, elencoPrenotazioni: elencoPrenotazioni, nomiSuiPosti: nomiSuiPosti, testoElimina: testoElimina, adattaMappa: adattaMappa };

  A.registra("scheda", { disegna: function (q) { S.filtro = ""; carica(q.get("id")); } });

  /* quieto = ridisegno dopo un'azione: niente «Carico…» e la pagina resta dov'era */
  function carica(id, quieto) {
    S.id = id; var mio = ++S.seq;
    if (!quieto) A.corpo('<p class="carico" role="status">Carico lo spettacolo…</p>');
    return G.api.prenotati(id).then(function (r) {
      if (mio !== S.seq) return r;
      if (!r.ok) {
        A.corpo('<section class="gst-centro"><h1>Spettacolo</h1><p>' + esc(G.messaggio(r)) + '</p><p><a href="?" data-az="tutti">← I miei spettacoli</a></p></section>');
        return r;
      }
      S.dati = r; disegna(quieto); return r;
    });
  }
  function link(ev) {
    return ev.slug_breve && A.dati.org ? I.linkSpettacolo(A.dati.org.slug, ev.slug_breve, A.base()) : A.base() + "/biglietteria/?e=" + ev.slug;
  }
  function legenda() {
    function voce(cls, t) {
      return '<li><svg viewBox="0 0 60 60" aria-hidden="true" class="leg-svg"><g class="posto ' + cls + '"><rect class="sedia" x="6" y="6" width="48" height="48" rx="10"/>' +
        '<path class="croce" d="M19 19L41 41M41 19L19 41"/></g></svg>' + t + "</li>";
    }
    return '<ul class="legenda" aria-label="Legenda">' + voce("libero", "Libero") + voce("occupato", "Prenotato") + voce("riservato", "Tenuto da parte") + "</ul>";
  }
  function disegna(tieni) {
    var D = S.dati, ev = D.evento, c = D.conteggi || {}, st = G.statoRiga(ev), l = link(ev), occ = nomiSuiPosti(D.prenotazioni);
    var aperta = ev.stato === "aperta", bozza = ev.pubblicato === false, y = window.scrollY, mp = document.getElementById("gst-pianta");
    var dove = tieni && mp ? { l: mp.scrollLeft, t: mp.scrollTop } : null;
    document.title = ev.titolo + " — Biglietteria";
    A.corpo('<section class="gst-scheda"><p class="ev-marchio"><a href="?" data-az="tutti">← I miei spettacoli</a></p>' +
      (bozza ? '<p class="nota forte gst-bozza">Bozza: il pubblico non la vede. <button type="button" class="btn primario piccolo" data-az="pubblica">Apri le prenotazioni</button></p>' : "") +
      '<div class="gst-avvisi-scheda" data-avvisi-di="' + esc(ev.id) + '"></div>' +
      "<h1>" + esc(ev.titolo) + '</h1><p class="gst-aiuto">' + esc(G.bglQuando(ev.inizio)) + " · " + esc(ev.luogo) + "</p>" +
      '<div class="gst-cont" role="group" aria-label="Posti"><div><b>' + (c.prenotati || 0) + "</b> <span>prenotati</span></div><div><b>" + (c.liberi || 0) +
        "</b> <span>liberi</span></div><div><b>" + (c.riservati || 0) + "</b> <span>tenuti da parte</span></div><div><b>" + (c.totali || 0) + "</b> <span>posti in tutto</span></div></div>" +
      (bozza ? "" : '<p class="gst-riga-stato"><span class="gst-stato-' + st.c + '">Prenotazioni ' + esc(st.t) + "</span>" +
        (aperta && st.c === "aperte" && ev.chiusura !== ev.inizio ? '<span class="gst-aiuto">fino a ' + esc(G.bglQuandoBreve(ev.chiusura)) + "</span>" : "") +
        /* aperte ma oltre l'ora di chiusura: «Chiudi» accanto a «chiuse» non si capirebbe; si riaprono cambiando l'ora */
        (aperta && st.c === "chiuse" ? '<span class="gst-aiuto">è passata l\'ora di chiusura: per riaprirle, cambiala con «Modifica»</span>' :
          st.c !== "concluso" ? '<button type="button" class="btn piccolo" data-az="' + (aperta ? "chiudi" : "riapri") + '">' +
          (aperta ? "Chiudi le prenotazioni" : "Riapri le prenotazioni") + "</button>" : "") + "</p>") +
      '<div class="gst-link"><a href="' + esc(l) + '" target="_blank" rel="noopener">' + esc(l.replace(/^https?:\/\//, "")) + "</a>" +
        '<button type="button" class="btn piccolo" data-az="copia" data-testo="' + esc(l) + '">Copia</button>' +
        '<button type="button" class="btn piccolo" data-az="qr" data-testo="' + esc(l) + '" data-nome="' + esc(ev.slug_breve || ev.slug) + '">Scarica QR</button></div>' +
      '<div class="gst-azioni gst-azioni-scheda"><button type="button" class="btn primario" data-az="pdf">Lista per l\'ingresso (PDF)</button>' +
        '<select id="gst-ordine" aria-label="Come ordinare la lista"><option value="entrambe">per cognome e per fila</option><option value="cognome">solo per cognome</option><option value="fila">solo per fila</option></select>' +
        '<button type="button" class="btn" data-az="csv">Elenco (CSV)</button><button type="button" class="btn" data-az="aggiorna">Aggiorna</button>' +
        '<button type="button" class="btn" data-az="modifica">Modifica</button></div>' +
      '<div class="mappa gst-mappa" id="gst-pianta">' + BGL.svgPianta(ev.pianta, { occupati: Object.keys(occ), riservati: ev.riservati || [], scelti: [], attiva: false }) + "</div>" +
      legenda() + '<p class="gst-aiuto gst-tocca">Tocca un posto prenotato o tenuto da parte per vedere di chi è.</p>' +
      '<h2 class="gst-sez">Prenotazioni <span class="gst-aiuto">(' + (c.prenotazioni_attive || 0) + " attive)</span></h2>" +
      '<input type="search" id="gst-filtro" class="gst-filtro-in" placeholder="Cerca per nome, email, codice o posto" aria-label="Cerca fra le prenotazioni" value="' + esc(S.filtro) + '">' +
      '<div id="gst-elenco"></div>' +
      '<div class="gst-azioni gst-fondo"><button type="button" class="btn pericolo" data-az="elimina">Elimina spettacolo</button></div></section>');
    adattaMappa(document.getElementById("gst-pianta"), ev.pianta, dove);
    if (tieni) window.scrollTo(0, y);
    var per = ev.riservati_per || {}, chiDi = {};
    Array.prototype.forEach.call(document.querySelectorAll("#gst-pianta g.posto[data-k]"), function (g) {
      var k = g.getAttribute("data-k"), chi = occ[k] || ((ev.riservati || []).indexOf(k) >= 0 ? "Tenuto da parte" + (per[k] ? " — " + per[k] : "") : null);
      if (!chi) return;
      chiDi[k] = PP.bglPostoNome(k) + ": " + chi;
      var t = document.createElementNS("http://www.w3.org/2000/svg", "title"); t.textContent = chiDi[k]; g.insertBefore(t, g.firstChild);
    });
    /* sul telefono il «title» non si vede: il tocco su un posto lo dice in basso */
    document.getElementById("gst-pianta").addEventListener("click", function (e) {
      var g = e.target.closest ? e.target.closest("g.posto[data-k]") : null;
      if (g && chiDi[g.getAttribute("data-k")]) A.avviso(chiDi[g.getAttribute("data-k")]);
    });
    document.getElementById("gst-filtro").addEventListener("input", function (e) { S.filtro = e.target.value; elenco(); });
    elenco();
    A.chiama("scheda-disegnata", ev, D);
  }
  function elenco() {
    var box = document.getElementById("gst-elenco"), D = S.dati, lista = elencoPrenotazioni(D.prenotazioni, S.filtro);
    if (!lista.length) { box.innerHTML = '<p class="gst-vuoto">' + ((D.prenotazioni || []).length ? "Nessuna prenotazione corrisponde." : "Ancora nessuna prenotazione.") + "</p>"; return; }
    var gruppi = G.bglGruppiConnessione(D.prenotazioni);
    box.innerHTML = (gruppi && !S.filtro ? '<p class="gst-aiuto">' + (gruppi === 1 ? "Un gruppo" : gruppi + " gruppi") +
      " di prenotazioni arrivate dalla stessa connessione internet («Stessa connessione»): di solito è una famiglia, ma se sono tante con email diverse può essere una persona sola.</p>" : "") +
      '<ul class="bgl-pren gst-pren">' + lista.map(function (p) {
        return G.bglRigaPrenotazione(p, p.stato === "attiva" ? A.chiama("prenotazione-azioni", p, D.evento) : []);
      }).join("") + "</ul>";
  }
  /* i dati di adesso (per la lista e il CSV: qualcuno può aver prenotato da un minuto) */
  function fresco() {
    var mio = ++S.seq;
    return G.api.prenotati(S.id).then(function (r) {
      if (!r.ok) { A.avviso(G.messaggio(r), "err"); return null; }
      if (mio === S.seq) { S.dati = r; disegna(true); }
      return r;
    });
  }
  function salva(campi, ok, el) {
    if (el) el.disabled = true;
    return G.api.spettacoloSalva(S.id, campi).then(function (r) {
      if (!r.ok) { if (el) el.disabled = false; A.avviso(G.messaggio(r, "spettacolo"), "err"); return; }
      A.avviso(ok); return A.ricarica().then(function () { return carica(S.id, true); });
    });
  }
  A.azione("chiudi", function (el) { salva({ stato: "chiusa" }, "Prenotazioni chiuse", el); });
  A.azione("riapri", function (el) { salva({ stato: "aperta" }, "Prenotazioni riaperte", el); });
  A.azione("pubblica", function (el) { salva({ pubblicato: true, stato: "aperta" }, "Prenotazioni aperte", el); });
  A.azione("aggiorna", function () { fresco().then(function (r) { if (r) A.avviso("Aggiornato"); }); });
  A.azione("modifica", function () { A.vai("modifica", { id: S.id }); });
  A.azione("pdf", function () {
    var ord = (document.getElementById("gst-ordine") || {}).value || "entrambe";
    fresco().then(function (r) {
      if (!r) return;
      var o = document.getElementById("gst-ordine"); if (o) o.value = ord;
      G.listaPdf(r, ord).catch(function (e) { A.avviso("Librerie PDF non disponibili: " + e.message, "err"); });
    });
  });
  A.azione("csv", function () {
    fresco().then(function (r) { if (r) G.scarica(G.bglCsv(r), G.bglSlug(r.evento.titolo) + "-prenotazioni.csv", "text/csv;charset=utf-8"); });
  });
  A.azione("disdici", function (el) {
    var id = el.getAttribute("data-id"), p = (S.dati.prenotazioni || []).filter(function (x) { return x.id === id; })[0]; if (!p) return;
    A.conferma({ titolo: "Disdire la prenotazione?", si: "Disdici", pericolo: true,
      testo: G.bglNomeCompleto(p) + " — " + PP.bglPostiNomi(p.posti) + " (codice " + p.codice + ").\nI posti tornano liberi per altri. Alla persona non arriva nessun avviso: se serve, avvisala tu." })
      .then(function (si) {
        if (!si) return;
        G.api.annulla(id).then(function (r) {
          if (!r.ok) { A.avviso(G.messaggio(r), "err"); return; }
          A.avviso("Prenotazione disdetta: " + (r.liberati || 0) + (r.liberati === 1 ? " posto libero" : " posti liberi"));
          A.ricarica(); carica(S.id, true);
        });
      });
  });
  A.azione("elimina", function () {
    var ev = S.dati.evento, n = (S.dati.prenotazioni || []).length;
    A.conferma({ titolo: "Eliminare lo spettacolo?", testo: testoElimina(ev, n), si: "Elimina", pericolo: true }).then(function (si) {
      if (!si) return;
      G.api.elimina(S.id).then(function (r) {
        if (!r.ok) { A.avviso(G.messaggio(r), "err"); return; }
        /* D4: il file lo toglie il browser (si aspetta, così chiudere subito la pagina non lo lascia); se no, la purga notturna */
        var via = r.locandina ? G.immagine.togli(A.cfg, r.locandina) : Promise.resolve();
        via.then(function () { return A.ricarica(); }).then(function () { A.avviso("Spettacolo eliminato"); A.vai("elenco", {}, true); });
      });
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
