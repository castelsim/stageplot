/* Biglietteria — «LA SALA DEL PROGETTO È CAMBIATA» (specifica area §4, decisioni 5 e D8). La pianta pubblicata è una
   FOTO: il pubblico non legge mai il progetto. Ogni volta che l'organizzatore apre l'area, qui si ricalcola la pianta dal
   progetto con la STESSA funzione dell'editor e la si confronta con la foto. Se sono diverse, l'avviso; aprendolo, il
   riepilogo in parole, le due piante con i posti cambiati, le persone coinvolte. Mai un aggiornamento automatico, mai
   una modifica al progetto. Parti pure esportate per i test in Node. */
(function (root) {
  "use strict";
  var nodo = typeof module === "object" && module && module.exports;
  var PP = typeof root.piantaPostiModulo === "function" ? root.piantaPostiModulo() : (nodo ? require("../pianta-posti.js") : null);
  var TESTO = "La sala del progetto è cambiata";
  function nomeCompleto(p) {
    var c = String(p.cognome || "").trim(), n = String(p.nome || "").trim();
    return (c || n) ? (c + (c && n ? " " : "") + n) : "(dati cancellati)";
  }
  /* lo stato della sala di uno spettacolo: ev = {variante, pianta (la foto)}, doc = progetto salvato (null se non c'è
     più), prenotati = chiavi dei posti prenotati adesso */
  function statoSala(ev, doc, prenotati) {
    if (!ev || !ev.pianta) return { stato: "sconosciuto" };
    if (!doc) return { stato: "progetto_mancante" };
    var vs = PP.piantaVarianti(doc);
    function prova(vid) { var n = PP.piantaDaDocumento(doc, vid); return n ? { nuova: n, confronto: PP.piantaConfronta(ev.pianta, n, prenotati || []) } : null; }
    if (ev.variante != null) {
      if (!vs.some(function (v) { return v.id === ev.variante; })) return { stato: "variante_mancante" };
      var r = prova(ev.variante);
      if (!r) return { stato: "senza_posti", variante: ev.variante };
      return { stato: r.confronto.uguale ? "uguale" : "cambiata", nuova: r.nuova, confronto: r.confronto, variante: ev.variante };
    }
    /* D8: nato nell'editor, variante nulla. Se una variante è uguale alla foto è quella (si adotta in silenzio) */
    for (var i = 0; i < vs.length; i++) {
      var t = prova(vs[i].id);
      if (t && t.confronto.uguale) return { stato: "uguale", variante: vs[i].id, varianteTrovata: vs[i].id };
    }
    var att = vs.filter(function (v) { return v.attiva; })[0] || vs[0];
    var a = att ? prova(att.id) : null;
    if (!a) return { stato: "senza_posti", variante: att ? att.id : null };
    return { stato: a.confronto.uguale ? "uguale" : "cambiata", nuova: a.nuova, confronto: a.confronto, variante: att.id };
  }
  /* le persone da sistemare prima di aggiornare: posto prenotato (prenotazione ATTIVA) che sparisce o cambia numero */
  function righeBloccanti(c, prenotazioni) {
    return ((c && c.bloccanti) || []).map(function (b) {
      var p = (prenotazioni || []).filter(function (x) { return x.stato === "attiva" && (x.posti || []).indexOf(b.k) >= 0; })[0] || {};
      var chi = nomeCompleto(p), posto = PP.bglPostoNome(b.k);
      return { pid: p.id || null, chi: chi, posto: posto,
        testo: chi + " — " + posto + ": " + (b.motivo === "tolto" ? "questo posto non c'è più" : "ha un numero nuovo (" + PP.bglPostoNome(b.a) + ")") };
    });
  }
  /* i posti tenuti da parte che con l'aggiornamento spariscono (il server li toglie: tolti o con un numero nuovo) */
  function tenutiPersi(c, riservati) {
    var via = {};
    ((c && c.tolti) || []).forEach(function (k) { via[k] = 1; });
    ((c && c.rinumerati) || []).forEach(function (r) { via[r.da] = 1; });
    return (riservati || []).filter(function (k) { return via[k]; });
  }
  function evidenze(c) {
    var foto = {}, nuova = {};
    (c.spostati || []).forEach(function (k) { foto[k] = "cambio-spostato"; nuova[k] = "cambio-spostato"; });
    (c.tolti || []).forEach(function (k) { foto[k] = "cambio-tolto"; });
    (c.aggiunti || []).forEach(function (k) { nuova[k] = "cambio-nuovo"; });
    (c.rinumerati || []).forEach(function (r) { foto[r.da] = "cambio-numero"; nuova[r.a] = "cambio-numero"; });
    return { foto: foto, nuova: nuova };
  }
  var PURO = { statoSala: statoSala, righeBloccanti: righeBloccanti, tenutiPersi: tenutiPersi, evidenze: evidenze, TESTO: TESTO };
  if (nodo) { module.exports = PURO; return; }
  var G = root.GST, A = G && G.app; if (!A) return;
  G.sala = PURO;
  var BGL = root.BGL, esc = BGL.esc;

  function occupati(prenotazioni) {
    var o = []; (prenotazioni || []).forEach(function (p) { if (p.stato === "attiva") o = o.concat(p.posti || []); }); return o;
  }
  /* lo stato di uno spettacolo: foto (bgl_prenotati) + progetto salvato. D8: la variante trovata si adotta in silenzio
     (cambia solo il collegamento, mai la pianta pubblicata) */
  function calcola(id, dati) {
    var datiP = dati ? Promise.resolve(dati) : G.api.prenotati(id);
    return datiP.then(function (d) {
      if (!d || !d.ok || !d.evento.project_id) return { stato: d && d.ok ? "progetto_mancante" : "sconosciuto", dati: d };
      return A.progettoDati(d.evento.project_id).then(function (doc) {
        var s = statoSala(d.evento, doc, occupati(d.prenotazioni)); s.dati = d;
        if (s.varianteTrovata && d.evento.variante == null) {
          d.evento.variante = s.varianteTrovata;   /* una volta sola anche se elenco e scheda guardano insieme */
          G.api.spettacoloSalva(id, { variante: s.varianteTrovata });
        }
        return s;
      }, function () { return { stato: "sconosciuto", dati: d }; });
    });
  }
  /* nell'elenco: uno spettacolo alla volta, solo i prossimi */
  A.estendi("elenco-disegnato", function (lista) {
    var adesso = Date.now(), coda = (lista || []).filter(function (e) { return e.project_id && Date.parse(e.inizio) + 12 * 3600e3 >= adesso; });
    coda.reduce(function (pr, ev) {
      return pr.then(function () {
        return calcola(ev.id).then(function (s) {
          var box = document.querySelector('.gst-avvisi[data-avvisi-di="' + ev.id + '"]');
          if (box && s.stato === "cambiata" && !box.querySelector(".gst-avviso-sala")) box.insertAdjacentHTML("beforeend", '<span class="gst-avviso gst-avviso-sala">' + esc(TESTO) + "</span>");
        });
      });
    }, Promise.resolve());
  });
  /* nella scheda: l'avviso con il riepilogo e il bottone */
  A.estendi("scheda-disegnata", function (ev, dati) {
    calcola(ev.id, dati).then(function (s) {
      var box = document.querySelector('.gst-avvisi-scheda[data-avvisi-di="' + ev.id + '"]'); if (!box) return;
      if (s.stato === "cambiata") box.innerHTML = '<div class="nota forte gst-sala-avviso"><p><b>' + esc(TESTO) + "</b> — " + esc(PP.piantaRiassunto(s.confronto)) +
        '</p><button type="button" class="btn primario piccolo" data-az="vedi-sala" data-id="' + esc(ev.id) + '">Vedi cosa è cambiato</button></div>';
      else if (s.stato === "progetto_mancante") box.innerHTML = '<p class="nota">Il progetto della sala non c\'è più: la pianta pubblicata resta com\'è.</p>';
      else if (s.stato === "variante_mancante") box.innerHTML = '<p class="nota">La variante della sala non c\'è più nel progetto: la pianta pubblicata resta com\'è.</p>';
      else box.innerHTML = "";
    });
  });
  A.azione("vedi-sala", function (el) { A.vai("sala", { id: el.getAttribute("data-id") }); });

  A.registra("sala", { disegna: function (q) { vista(q.get("id")); } });
  function svg(pianta, occ, id, riservati) {
    return '<div class="mappa gst-mappa" id="' + id + '">' + BGL.svgPianta(pianta, { occupati: occ, riservati: riservati || [], scelti: [], attiva: false }) + "</div>";
  }
  function colora(id, classi) {
    Object.keys(classi).forEach(function (k) {
      var g = document.querySelector("#" + id + ' g.posto[data-k="' + (root.CSS && CSS.escape ? CSS.escape(k) : k) + '"]');
      if (g) g.classList.add(classi[k]);
    });
  }
  function adatta(id, pianta) { if (G.scheda && G.scheda.adattaMappa) G.scheda.adattaMappa(document.getElementById(id), pianta); }
  var seq = 0;
  function vista(id) {
    var mio = ++seq;
    A.corpo('<p class="carico" role="status">Confronto la sala…</p>');
    calcola(id).then(function (s) {
      if (mio !== seq) return;
      var d = s.dati;
      if (!d || !d.ok) return A.corpo('<section class="gst-centro"><h1>' + esc(TESTO) + '</h1><p>' + esc(G.messaggio(d || { errore: "rete" })) + "</p></section>");
      var ev = d.evento, torna = '<p class="ev-marchio"><a href="?v=scheda&amp;id=' + esc(ev.id) + '" data-az="torna-scheda" data-id="' + esc(ev.id) + '">← ' + esc(ev.titolo) + "</a></p>";
      document.title = TESTO + " — " + ev.titolo;
      if (s.stato !== "cambiata") {
        return A.corpo('<section class="gst-sala">' + torna + "<h1>La sala</h1><p>" + esc({ uguale: "La pianta pubblicata è uguale alla sala del progetto.",
          progetto_mancante: "Il progetto della sala non c'è più: la pianta pubblicata resta com'è.",
          variante_mancante: "La variante della sala non c'è più nel progetto: la pianta pubblicata resta com'è.",
          senza_posti: "Nel progetto la sala non ha più posti numerati: la pianta pubblicata resta com'è." }[s.stato] || "Non riesco a confrontare la sala adesso.") + "</p></section>");
      }
      var occ = occupati(d.prenotazioni), righe = righeBloccanti(s.confronto, d.prenotazioni), ev2 = evidenze(s.confronto);
      var chiaviNuove = s.nuova.posti.map(function (q) { return q.k; }), persi = tenutiPersi(s.confronto, ev.riservati);
      A.corpo('<section class="gst-sala">' + torna + "<h1>" + esc(TESTO) + '</h1><p class="gst-riepilogo">' + esc(PP.piantaRiassunto(s.confronto)) + "</p>" +
        '<div class="gst-due-piante"><figure><figcaption>Pubblicata adesso</figcaption>' + svg(ev.pianta, occ, "gst-foto", ev.riservati) + "</figure>" +
        "<figure><figcaption>Nel progetto</figcaption>" + svg(s.nuova, occ.filter(function (k) { return chiaviNuove.indexOf(k) >= 0; }), "gst-nuova") + "</figure></div>" +
        '<ul class="gst-leg-cambi"><li class="cambio-spostato">spostato</li><li class="cambio-nuovo">nuovo</li><li class="cambio-tolto">tolto</li><li class="cambio-numero">numero cambiato</li></ul>' +
        (righe.length ? '<h2 class="gst-sez">Prima sistema queste prenotazioni</h2><ul class="gst-bloccanti">' + righe.map(function (r) {
          return "<li><span>" + esc(r.testo) + "</span>" + (r.pid ? '<button type="button" class="btn piccolo" data-az="sala-disdici" data-id="' + esc(r.pid) + '">Disdici</button>' +
            '<button type="button" class="btn piccolo" data-az="sala-sposta" data-id="' + esc(r.pid) + '" data-ev="' + esc(ev.id) + '">Sposta</button>' : "") + "</li>";
        }).join("") + "</ul>" : "") +
        (persi.length ? '<p class="gst-aiuto gst-persi">Tenuti da parte che non ci saranno più: <b>' + esc(PP.bglPostiNomi(persi)) +
          "</b>. Dopo l'aggiornamento, se servono, scegli altri posti con «Modifica».</p>" : "") +
        (righe.length ? '<p class="gst-aiuto">«Aggiorna la pianta» si accende quando nessun posto prenotato sparisce o cambia numero.</p>' : "") +
        '<div class="gst-azioni"><button type="button" class="btn primario" data-az="aggiorna-pianta" data-id="' + esc(ev.id) + '"' + (righe.length ? " disabled" : "") + ">Aggiorna la pianta</button>" +
        '<button type="button" class="btn" data-az="torna-scheda" data-id="' + esc(ev.id) + '">Non adesso</button></div></section>');
      colora("gst-foto", ev2.foto); colora("gst-nuova", ev2.nuova);
      adatta("gst-foto", ev.pianta); adatta("gst-nuova", s.nuova);
      A.azione("aggiorna-pianta", function (el) {
        el.disabled = true;
        G.api.spettacoloSalva(ev.id, { pianta: s.nuova, variante: s.variante }).then(function (r) {
          if (!r.ok) { el.disabled = false; A.avviso(G.messaggio(r, "spettacolo"), "err"); return; }
          A.ricarica().then(function () { A.avviso("Pianta aggiornata: il pubblico vede la sala nuova"); A.vai("scheda", { id: ev.id }, true); });
        });
      });
    });
  }
  A.azione("torna-scheda", function (el) { A.vai("scheda", { id: el.getAttribute("data-id") }); });
  A.azione("sala-sposta", function (el) { A.vai("sposta", { id: el.getAttribute("data-ev"), p: el.getAttribute("data-id") }); });
  A.azione("sala-disdici", function (el) {
    A.conferma({ titolo: "Disdire la prenotazione?", testo: "I posti tornano liberi. Alla persona non arriva nessun avviso: se serve, avvisala tu.", si: "Disdici", pericolo: true })
      .then(function (si) {
        if (!si) return;
        G.api.annulla(el.getAttribute("data-id")).then(function (r) {
          if (!r.ok) { A.avviso(G.messaggio(r), "err"); return; }
          A.avviso("Prenotazione disdetta");
          A.ricarica(); vista(new URLSearchParams(location.search).get("id"));
        });
      });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
