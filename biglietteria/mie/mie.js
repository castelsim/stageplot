/* Biglietteria — «LE MIE PRENOTAZIONI» (stageplot.it/biglietteria/mie/, specifica area §3.3): per chi ha prenotato con
   Google. Prossime (spettacolo, data, posti, codice, «Disdici»), poi le passate; «Esci» e, per gli account nati solo per
   la biglietteria, «Elimina il mio account» (§3.4, D9). Il database dice chi può eliminare l'account
   (bgl_account_stato) e la Edge Function bgl-account lo ricontrolla: la pagina non decide niente da sola.
   Parti pure esportate per i test in Node (module.exports), parte browser sotto. */
(function (root) {
  "use strict";
  var nodo = typeof module === "object" && module && module.exports;

  /* prima le prossime (dalla più vicina; quella che comincia adesso è ancora fra queste), poi le passate (dalla più recente) */
  function dividi(lista, adessoMs) {
    var future = [], passate = [];
    (lista || []).forEach(function (p) { (Date.parse(p.evento.inizio) >= adessoMs ? future : passate).push(p); });
    future.sort(function (a, b) { return Date.parse(a.evento.inizio) - Date.parse(b.evento.inizio); });
    passate.sort(function (a, b) { return Date.parse(b.evento.inizio) - Date.parse(a.evento.inizio); });
    return { future: future, passate: passate };
  }
  /* cosa succede eliminando l'account, detto prima di farlo */
  function testoElimina(n) {
    return "Si cancellano il tuo account e i nomi e le email delle tue prenotazioni" +
      (n === 1 ? "; la tua prenotazione futura viene disdetta e il posto torna libero" : n > 1 ? "; le tue " + n + " prenotazioni future vengono disdette e i posti tornano liberi" : "") +
      ". Non si può annullare.";
  }
  /* D9: «elimina» solo per un account nato per la biglietteria. «in_uso»: ha prenotato ma usa anche StagePlot.
     «scrivi»: tutto il resto (stato non letto, o entrato con Google senza mai prenotare: per il database non è
     «solo biglietteria», ma dirgli che usa StagePlot sarebbe falso) */
  function azioneAccount(stato, nPrenotazioni) {
    if (stato && stato.ok !== false && stato.solo_biglietteria === true) return "elimina";
    if (stato && stato.ok !== false && nPrenotazioni > 0) return "in_uso";
    return "scrivi";
  }
  var PURO = { dividi: dividi, testoElimina: testoElimina, azioneAccount: azioneAccount };
  if (nodo) { module.exports = PURO; return; }

  /* ---- browser ---- */
  var app = document.getElementById("mie-app"), BGL = root.BGL, ACC = root.BGLAccesso;
  if (!app || !BGL || !ACC) return;
  var esc = BGL.esc, cfg = BGL.configura(location.hostname, location.search), stato = null, esitoUna = "";
  var CONTATTO = BGL.CONTATTO;
  function corpo(html) {
    app.innerHTML = html;
    var h = app.querySelector("h1");
    if (h) { h.setAttribute("tabindex", "-1"); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
  }
  function rpc(fn, a) {
    return ACC.rpcGrezza(cfg, fn, a).then(function (r) { return r && !r.error && r.data ? r.data : { ok: false, errore: "rete" }; },
      function () { return { ok: false, errore: "rete" }; });
  }
  function piede() {
    return '<footer class="piede"><a href="/privacy/#biglietteria">Privacy</a><span>Problemi? <a href="mailto:' + CONTATTO + '">' + CONTATTO + "</a></span></footer>";
  }
  function scheda(p, futura) {
    var settore = (p.posti || []).some(function (k) { return String(k).split("|")[0] !== "Platea"; });
    var ev = p.evento || {}, come = p.stato === "attiva" ? "" : p.stato === "annullata" ? " · annullata dall'organizzatore" : " · disdetta";
    return '<li class="mia' + (p.stato === "attiva" ? "" : " spenta") + '">' +
      (ev.percorso ? '<a class="mia-titolo" href="/biglietteria/' + esc(ev.percorso) + '">' + esc(ev.titolo) + "</a>" : '<p class="mia-titolo">' + esc(ev.titolo) + "</p>") +
      '<p class="ev-quando">' + esc(BGL.dataOra(ev.inizio)) + "</p>" + (ev.luogo ? '<p class="ev-luogo">' + esc(ev.luogo) + "</p>" : "") +
      '<p class="mia-posti">' + ((p.posti || []).length ? "<b>" + esc(BGL.frasePosti(p.posti, settore)) + "</b> · " : "") +
        "codice <b>" + esc(p.codice) + "</b>" + esc(come) + "</p>" +
      (futura && p.disdicibile ? '<div class="mia-az" data-id="' + esc(p.id) + '"><button type="button" class="btn" data-az="disdici">Disdici</button></div>' : "") + "</li>";
  }
  function sezioneAccount(n) {
    var a = azioneAccount(stato, n);
    return '<div class="mie-account"><button type="button" class="btn" data-az="esci">Esci</button>' +
      (a === "elimina" ? '<button type="button" class="btn pericolo" data-az="elimina">Elimina il mio account</button>'
        : '<p class="aiuto">' + (a === "in_uso" ? "Questo account usa anche StagePlot: per eliminarlo scrivi a " : "Per eliminare questo account scrivi a ") +
          '<a href="mailto:' + CONTATTO + '">' + CONTATTO + "</a>.</p>") + "</div>";
  }
  function disegna(lista) {
    var D = dividi(lista, Date.now()), msg = esitoUna; esitoUna = "";
    corpo("<h1>Le mie prenotazioni</h1>" +
      (msg ? '<p class="nota ok" role="status">' + esc(msg) + "</p>" : "") +
      '<p class="aiuto">Qui trovi le prenotazioni fatte con Google. Quelle fatte con nome ed email le trovi nella mail di conferma.</p>' +
      (D.future.length ? '<ul class="mie">' + D.future.map(function (p) { return scheda(p, true); }).join("") + "</ul>" : '<p class="nota">Nessuna prenotazione in arrivo.</p>') +
      (D.passate.length ? '<details class="mie-passate"><summary>Passate (' + D.passate.length + ')</summary><ul class="mie">' +
        D.passate.map(function (p) { return scheda(p, false); }).join("") + "</ul></details>" : "") +
      sezioneAccount((lista || []).length) + piede());
  }
  function carica() {
    rpc("bgl_pubblico_registra", {}).then(null, function () { /* solo un segno per la pulizia (0079) */ });
    return Promise.all([rpc("bgl_mie_prenotazioni", {}), rpc("bgl_account_stato", {})]).then(function (r) {
      if (!r[0].ok) {
        return corpo("<h1>Le mie prenotazioni</h1><p>" + esc(r[0].errore === "rete"
          ? "Non riesco a caricare le tue prenotazioni: controlla la connessione e riprova."
          : "Qualcosa non ha funzionato: riprova fra un momento.") + '</p><button type="button" class="btn primario" data-az="riprova">Riprova</button>' + piede());
      }
      stato = r[1] && r[1].ok ? r[1] : null;
      disegna(r[0].prenotazioni || []);
    });
  }
  function errore(el, testo) {
    var vecchio = el.parentNode.querySelector(".err"); if (vecchio) vecchio.remove();
    el.insertAdjacentHTML("afterend", '<p class="err" role="alert">' + esc(testo) + "</p>");
  }
  function elimina(el) {
    el.disabled = true; el.textContent = "Elimino…";
    ACC.token(cfg).then(function (tok) {
      if (!tok) return { ok: false, errore: "non_autenticato" };
      return fetch(cfg.api + "/functions/v1/bgl-account", { method: "POST", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify({ azione: "elimina" }) })
        .then(function (r) { return r.json().then(null, function () { return { ok: false, errore: "errore_interno" }; }); });
    }).then(function (d) {
      if (!d || !d.ok) {
        el.disabled = false; el.textContent = "Elimina l'account";
        var e = d && d.errore;
        return errore(el, e === "account_in_uso" ? "Questo account usa anche StagePlot: per eliminarlo scrivi a " + CONTATTO + "."
          : e === "non_autenticato" ? "L'accesso è scaduto: esci, accedi di nuovo con Google e riprova."
          : "Non è andata: riprova fra un momento.");
      }
      return ACC.esci(cfg).then(function () {
        corpo("<h1>Account eliminato</h1><p>Il tuo account e i dati delle tue prenotazioni sono stati cancellati.</p>" + piede());
      });
    }, function () {
      el.disabled = false; el.textContent = "Elimina l'account";
      errore(el, "Non riesco a collegarmi: controlla la connessione e riprova.");
    });
  }
  app.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-az]") : null; if (!el) return;
    var az = el.getAttribute("data-az");
    if (az === "accedi") {
      el.disabled = true;
      ACC.accedi(cfg, "/biglietteria/mie/").then(null, function () { el.disabled = false; errore(el, "Non riesco a collegarmi: controlla la connessione e riprova."); });
    } else if (az === "riprova") { location.reload(); }
    else if (az === "esci") { el.disabled = true; ACC.esci(cfg).then(function () { location.href = "/biglietteria/mie/"; }); }
    else if (az === "disdici") {
      var riga = el.closest(".mia-az");
      riga.innerHTML = '<p>I posti tornano liberi per altri. Sicuro?</p><button type="button" class="btn pericolo" data-az="si-disdici">Sì, disdici</button>' +
        '<button type="button" class="btn" data-az="no">No, tengo i posti</button>';
      riga.querySelector('[data-az="si-disdici"]').focus();
    } else if (az === "no") { carica(); }
    else if (az === "si-disdici") {
      el.disabled = true; el.textContent = "Disdico…";
      var box = el.closest(".mia-az");
      rpc("bgl_disdici_mia", { p_prenotazione_id: box.getAttribute("data-id") }).then(function (d) {
        if (!d.ok) { box.innerHTML = '<p class="err" role="alert">' + esc(d.errore === "rete" ? "Non riesco a collegarmi: controlla la connessione e riprova." : BGL.messaggio(d.errore)) + "</p>"; return; }
        esitoUna = "Prenotazione disdetta: i posti sono di nuovo liberi per altri.";
        carica();
      });
    } else if (az === "elimina") {
      var acc = el.closest(".mie-account");
      acc.innerHTML = '<p class="nota forte">' + esc(testoElimina(stato ? stato.prenotazioni_future : 0)) + "</p>" +
        '<button type="button" class="btn pericolo" data-az="si-elimina">Elimina l\'account</button><button type="button" class="btn" data-az="no">Annulla</button>';
      acc.querySelector('[data-az="no"]').focus();
    } else if (az === "si-elimina") { elimina(el); }
  });
  ACC.sessione(cfg).then(function (s) {
    var st = ACC.statoAccesso(s);
    if (st === "senza_rete") {
      return corpo("<h1>Le mie prenotazioni</h1><p>Non riesco a collegarmi: controlla la connessione e riprova.</p>" +
        '<button type="button" class="btn primario" data-az="riprova">Riprova</button>' + piede());
    }
    if (st === "fuori") {
      return corpo("<h1>Le mie prenotazioni</h1><p>Accedi con lo stesso account Google con cui hai prenotato.</p>" +
        '<button type="button" class="btn primario" data-az="accedi">Accedi con Google</button>' +
        '<p class="aiuto">Hai prenotato con nome ed email? La prenotazione e il link per disdire sono nella mail di conferma.</p>' + piede());
    }
    carica();
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
