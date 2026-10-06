/* Biglietteria — «Nuovo spettacolo» e «Modifica» (specifica area §2.3): UN modulo, in quest'ordine — sala, spettacolo,
   prenotazioni, «Apri le prenotazioni» (o «Salva come bozza»). La pianta della sala si calcola dal progetto salvato con
   la STESSA funzione dell'editor (pianta-posti.js); i posti tenuti da parte si toccano sulla pianta, come nell'editor, e
   ognuno può avere il suo «per chi» (stampato nella lista d'ingresso). La locandina si riduce nel browser (gst-immagine). */
(function (root) {
  "use strict";
  function varianteScelta(progetto, varianteId) {
    var vs = (progetto && progetto.varianti) || [];
    return vs.filter(function (x) { return varianteId != null && x.id === varianteId; })[0] ||
      vs.filter(function (x) { return x.attiva; })[0] || vs[0] || null;
  }
  function toggleTenuto(riservati, k, occupati) {
    if ((occupati || []).indexOf(k) >= 0) return riservati.slice();
    var i = riservati.indexOf(k);
    return i >= 0 ? riservati.slice(0, i).concat(riservati.slice(i + 1)) : riservati.concat([k]);
  }
  /* La foto salvata sul server (bgl_pianta_pulita) ha settore, fila e posto ma non la chiave «k» che la pianta calcolata
     dal progetto porta con sé: senza, bglProblemiPianta vedrebbe tutti i posti «doppi» e «Aggiungi» non troverebbe niente.
     Copia, non tocca l'originale. La chiave è quella del server: settore|fila|posto. */
  function conChiavi(p) {
    if (!p || !Array.isArray(p.posti)) return p || null;
    var c = {}; for (var x in p) if (Object.prototype.hasOwnProperty.call(p, x)) c[x] = p[x];
    c.posti = p.posti.map(function (q) {
      var o = {}; for (var y in q) if (Object.prototype.hasOwnProperty.call(q, y)) o[y] = q[y];
      if (!o.k) o.k = String(q.settore) + "|" + String(q.fila) + "|" + String(q.posto);
      return o;
    });
    return c;
  }
  function chiaviPianta(p) { return ((p && p.posti) || []).map(function (q) { return q.k; }); }
  /* La pianta nel modulo si tocca col dito: sul telefono, «tutta la sala nello schermo» vuol dire posti di 14 px. Scala =
     la più grande fra «sta tutta» e tre quarti di quella a cui un posto è grande come il dito (BGL.scalaDettaglio): sul
     telefono si scorre dentro il riquadro, sul computer di solito sta tutta. Mai oltre il naturale (1 px per cm). */
  function scalaMappa(boxW, larghezza, dettaglio) {
    if (!(boxW > 0) || !(larghezza > 0)) return null;
    return Math.min(1, Math.max(larghezza / boxW, (dettaglio || 0) * 0.75));
  }
  /* da dove si parte: i posti in vista (al centro in orizzontale, la prima fila in alto), non il palco */
  function inizioMappa(p, k, w, h) {
    var posti = (p && p.posti) || [];
    if (!posti.length) return { l: 0, t: 0 };
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity;
    posti.forEach(function (q) { x0 = Math.min(x0, +q.x); x1 = Math.max(x1, +q.x); y0 = Math.min(y0, +q.y); });
    return { l: Math.max(0, Math.round((x0 + x1) / 2 * k - w / 2)), t: Math.max(0, Math.round(y0 * k - Math.min(40, h / 4))) };
  }
  var PURO = { varianteScelta: varianteScelta, toggleTenuto: toggleTenuto, conChiavi: conChiavi, chiaviPianta: chiaviPianta,
    scalaMappa: scalaMappa, inizioMappa: inizioMappa };
  if (typeof module === "object" && module && module.exports) { module.exports = PURO; return; }
  var GST = root.GST, A = GST && GST.app;
  if (!A) return;
  GST.modulo = PURO;
  var BGL = root.BGL, PP = root.piantaPostiModulo(), esc = BGL.esc, M = null;

  A.registra("nuovo", { disegna: function (q) { apri(null, q.get("p")); } });
  A.registra("modifica", { disegna: function (q) { apri(q.get("id"), null); } });
  /* nuovo spettacolo, di ritorno dall'editor: la sala scelta si rilegge (quello che si è scritto resta). In «Modifica»
     no: lì la pianta è quella pubblicata, e si cambia solo scegliendo la sala, mai da sola */
  A.estendi("di-nuovo-visibile", function (v) {
    if (v === "nuovo" && M && !M.id && M.progetto && !M.inviando && (M.pianta || M.erroreSala)) { leggi(); scegliSala(M.progetto, M.variante); }
  });

  function torna() { return '<p class="ev-marchio"><a href="?" data-az="tutti">← I miei spettacoli</a></p>'; }
  function apri(id, progetto) {
    var ev = id ? A.dati.spettacoli.filter(function (e) { return e.id === id; })[0] : null;
    if (id && !ev) return A.vai("elenco", {}, true);
    var o = ev ? GST.bglDataOra(ev.inizio) : null, ch = ev ? GST.bglDataOra(ev.chiusura) : null;
    M = { id: id, ev: ev, progetti: [], progetto: ev ? ev.project_id : progetto, variante: ev ? ev.variante : null, pianta: null,
      salaCambiata: false, occupati: [], riservati: [], per: {}, locandina: ev ? ev.locandina_path : null, nuova: null, nuovaUrl: "",
      tolta: false, slugToccato: !!ev, haPrenotazioni: false, erroreSala: "", inviando: false, disegnato: false, errori: {},
      c: { titolo: ev ? ev.titolo : "", data: o ? o.data : "", ora: o ? o.ora : "21:00", luogo: ev ? ev.luogo : GST.luogoPredefinito(A.dati.spettacoli),
        descrizione: (ev && ev.descrizione) || "", note: (ev && ev.note) || "", chiusuraAllInizio: !ev || ev.chiusura === ev.inizio,
        chiusuraData: ch ? ch.data : "", chiusuraOra: ch ? ch.ora : "", slug_breve: ev ? ev.slug_breve : "" } };
    var mio = M;
    A.corpo('<p class="carico" role="status">Carico le sale…</p>');
    Promise.all([GST.api.progettiSala(), ev ? GST.api.prenotati(ev.id) : Promise.resolve(null)]).then(function (r) {
      if (M !== mio) return;   /* nel frattempo si è andati altrove */
      if (!r[0].ok) return A.corpo('<section class="gst-modulo">' + torna() + '<h1>' + (id ? "Modifica lo spettacolo" : "Nuovo spettacolo") +
        '</h1><p class="gst-errore" role="alert">' + esc(GST.messaggio(r[0])) + '</p><button type="button" class="btn primario" data-az="riprova-modulo">Riprova</button></section>');
      M.progetti = r[0].progetti || [];
      if (ev) {
        if (!r[1].ok) return A.corpo('<section class="gst-modulo">' + torna() + '<p class="gst-errore" role="alert">' + esc(GST.messaggio(r[1])) + "</p></section>");
        var e = r[1].evento;
        M.pianta = conChiavi(e.pianta); M.riservati = (e.riservati || []).slice(); M.per = Object.assign({}, e.riservati_per || {});
        (r[1].prenotazioni || []).forEach(function (p) { if (p.stato === "attiva") M.occupati = M.occupati.concat(p.posti || []); });
        M.haPrenotazioni = (r[1].prenotazioni || []).length > 0;
        return disegna();
      }
      if (M.progetto) return scegliSala(M.progetto, null);
      disegna();
    });
  }
  function scegliSala(pid, vid) {
    var pr = M.progetti.filter(function (x) { return x.id === pid; })[0];
    if (!pr) { M.progetto = null; M.pianta = null; return disegna(); }
    var v = varianteScelta(pr, vid), mio = M;
    M.progetto = pid; M.variante = v ? v.id : null; M.pianta = null; M.erroreSala = ""; M.salaCambiata = !!M.id;
    disegna();
    A.progettoDati(pid).then(function (doc) {
      if (M !== mio || M.progetto !== pid) return;
      M.pianta = PP.piantaDaDocumento(doc, M.variante);
      if (!M.pianta) M.erroreSala = "Non riesco a leggere la sala di questo progetto: aprilo nell'editor, controlla i posti numerati e salvalo.";
      var chiavi = chiaviPianta(M.pianta);
      M.riservati = M.riservati.filter(function (k) { return chiavi.indexOf(k) >= 0; });
      disegna();
    }, function () { if (M === mio) { M.erroreSala = "Non riesco a leggere il progetto: controlla la rete e riprova."; disegna(); } });
  }
  function leggi() {
    var v = function (id) { var n = document.getElementById("gst-" + id); return n ? n.value : ""; };
    if (!document.getElementById("gst-titolo")) return;
    M.c.titolo = v("titolo"); M.c.data = v("data"); M.c.ora = v("ora"); M.c.luogo = v("luogo");
    M.c.descrizione = v("descrizione"); M.c.note = v("note"); M.c.slug_breve = v("slug");
    var ck = document.getElementById("gst-chiusura-inizio"); M.c.chiusuraAllInizio = !ck || ck.checked;
    M.c.chiusuraData = v("chiusura-data"); M.c.chiusuraOra = v("chiusura-ora");
    Array.prototype.forEach.call(document.querySelectorAll("[data-per]"), function (n) { M.per[n.getAttribute("data-per")] = n.value; });
  }
  /* gli errori di datiModulo hanno i nomi dei dati (slug_breve), i campi quelli del modulo (slug) */
  function errore(id) { return M.errori && (M.errori[id] || (id === "slug" && M.errori.slug_breve) || ""); }
  function campo(id, etichetta, controllo, aiuto) {
    var e = errore(id);
    return '<div class="gst-campo' + (e ? " ha-errore" : "") + '"><label for="gst-' + id + '">' + esc(etichetta) + "</label>" + controllo +
      (aiuto ? '<p class="gst-aiuto">' + aiuto + "</p>" : "") + (e ? '<p class="gst-err" role="alert">' + esc(e) + "</p>" : "") + "</div>";
  }
  function mappa() {
    if (M.erroreSala) return '<p class="gst-errore" role="alert">' + esc(M.erroreSala) + "</p>";
    if (!M.pianta) return M.progetto ? '<p class="carico">Carico la pianta…</p>' : "";
    var problemi = PP.bglProblemiPianta(M.pianta);
    return '<div class="mappa gst-mappa" id="gst-mappa">' + BGL.svgPianta(M.pianta, { occupati: M.occupati, riservati: [], scelti: M.riservati, attiva: true }) +
      '</div><p class="gst-aiuto">' + esc(GST.piantaRiassuntoBreve(M.pianta)) + "</p>" +
      problemi.map(function (t) { return '<p class="gst-errore" role="alert">' + esc(t) + "</p>"; }).join("");
  }
  function perChi() {
    if (!M.riservati.length) return '<p class="gst-aiuto">Nessun posto tenuto da parte.</p>';
    return '<ul class="gst-per">' + M.riservati.map(function (k) {
      return '<li><span class="gst-per-posto">' + esc(PP.bglPostoNome(k)) + '</span><input data-per="' + esc(k) + '" maxlength="60" placeholder="per chi (facoltativo)" aria-label="Per chi è il posto ' +
        esc(PP.bglPostoNome(k)) + '" value="' + esc(M.per[k] || "") + '"></li>';
    }).join("") + "</ul>";
  }
  function urlNuova() {
    if (!M.nuova) return "";
    if (!M.nuovaUrl) M.nuovaUrl = URL.createObjectURL(M.nuova.blob);
    return M.nuovaUrl;
  }
  function disegna() {
    leggi();
    var mp = document.getElementById("gst-mappa");
    M.dove = mp && M.pianta ? { l: mp.scrollLeft, t: mp.scrollTop } : null;
    /* ridisegnare dopo la scelta della sala o della locandina non deve riportare in cima alla pagina */
    var primo = !M.disegnato, y = window.scrollY, fuoco = document.activeElement && document.activeElement.id;
    M.disegnato = true;
    var org = A.dati.org, pr = M.progetti.filter(function (x) { return x.id === M.progetto; })[0];
    var titolo = M.id ? "Modifica lo spettacolo" : "Nuovo spettacolo";
    if (!M.progetti.length && !M.id) {
      /* niente da scegliere: una cosa sola da fare (specifica §2.3) */
      A.corpo('<section class="gst-modulo">' + torna() + "<h1>" + titolo + '</h1><p class="nota">Nessun tuo progetto ha posti numerati. ' +
        'Apri il progetto nell\'editor e usa <b>Numera i posti</b>, poi torna qui.</p><a class="btn primario" href="/app/" target="_blank" rel="noopener">Apri l\'editor</a></section>');
      return;
    }
    var locSrc = M.nuova ? urlNuova() : (M.locandina && !M.tolta ? root.BGLIndirizzi.urlLocandina(A.cfg.api, M.locandina) : "");
    var sala = campo("progetto", "Sala (un progetto StagePlot con i posti numerati)", '<select id="gst-progetto"><option value="">Scegli…</option>' +
          M.progetti.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === M.progetto ? " selected" : "") + ">" + esc(p.titolo) + "</option>"; }).join("") + "</select>") +
        (pr && pr.varianti.length > 1 ? campo("variante", "Variante", '<select id="gst-variante">' + pr.varianti.map(function (v) {
          return '<option value="' + esc(v.id) + '"' + (v.id === M.variante ? " selected" : "") + ">" + esc(v.nome) + " — " + v.posti + " posti</option>"; }).join("") + "</select>") : "") +
        (errore("sala") ? '<p class="gst-err" role="alert">' + esc(errore("sala")) + "</p>" : "") +
        '<div id="gst-sala">' + mappa() + "</div>";
    var bozza = !M.ev || M.ev.pubblicato === false;
    A.corpo('<section class="gst-modulo">' + torna() + "<h1>" + titolo + "</h1>" +
      '<form id="gst-form" novalidate>' +
      '<h2 class="gst-sez">1. Sala</h2>' + sala +
      '<h2 class="gst-sez">2. Spettacolo</h2>' +
      campo("titolo", "Titolo", '<input id="gst-titolo" maxlength="120" value="' + esc(M.c.titolo) + '">') +
      '<div class="gst-due">' + campo("data", "Giorno", '<input id="gst-data" type="date" value="' + esc(M.c.data) + '">') +
        campo("ora", "Ora", '<input id="gst-ora" type="time" value="' + esc(M.c.ora) + '">') + "</div>" +
      campo("luogo", "Luogo", '<input id="gst-luogo" maxlength="160" value="' + esc(M.c.luogo) + '">') +
      campo("locandina", "Locandina (facoltativa)", '<input id="gst-locandina" type="file" accept="image/*">' +
        (locSrc ? '<img class="gst-locandina" src="' + esc(locSrc) + '" alt="Anteprima della locandina"><button type="button" class="btn piccolo" data-az="togli-locandina">Togli la locandina</button>' : ""),
        "Carica solo immagini di cui hai i diritti: la locandina è pubblica. La riduciamo noi (1200 px).") +
      campo("descrizione", "Descrizione breve (facoltativa)", '<textarea id="gst-descrizione" rows="4" maxlength="600">' + esc(M.c.descrizione) + "</textarea>",
        '<span id="gst-cont-descrizione">' + Array.from(M.c.descrizione).length + "</span>/600") +
      campo("note", "Nota per il pubblico (facoltativa)", '<textarea id="gst-note" rows="2" maxlength="200" placeholder="Es. porte alle 20:30">' + esc(M.c.note) + "</textarea>",
        '<span id="gst-cont-note">' + Array.from(M.c.note).length + "</span>/200") +
      campo("slug", "Indirizzo dello spettacolo", '<div class="gst-indirizzo"><span>stageplot.it/biglietteria/' + esc(org.slug) + '/</span><input id="gst-slug" maxlength="40" autocapitalize="off" spellcheck="false" value="' +
        esc(M.c.slug_breve) + '"' + (M.haPrenotazioni ? " readonly" : "") + "></div>",
        M.haPrenotazioni ? "Non si cambia più: qualcuno ha già prenotato con questo indirizzo." : "Lo proponiamo dal titolo e dal giorno; puoi cambiarlo finché nessuno ha prenotato.") +
      '<h2 class="gst-sez">3. Prenotazioni</h2>' +
      '<div class="gst-campo"><label class="gst-spunta"><input id="gst-chiusura-inizio" type="checkbox"' + (M.c.chiusuraAllInizio ? " checked" : "") +
        "> Si prenota fino all'inizio dello spettacolo</label></div>" +
      '<div class="gst-due" id="gst-chiusura"' + (M.c.chiusuraAllInizio ? " hidden" : "") + ">" +
        campo("chiusura-data", "Chiudi le prenotazioni il", '<input id="gst-chiusura-data" type="date" value="' + esc(M.c.chiusuraData) + '">') +
        campo("chiusura-ora", "alle", '<input id="gst-chiusura-ora" type="time" value="' + esc(M.c.chiusuraOra) + '">') + "</div>" +
      (errore("chiusura") ? '<p class="gst-err" role="alert">' + esc(errore("chiusura")) + "</p>" : "") +
      '<div class="gst-campo"><p class="gst-label">Posti tenuti da parte</p><p class="gst-aiuto">Tocca i posti sulla pianta qui sopra (diventano scuri; tocca di nuovo per liberarli), oppure scrivili:</p>' +
        '<div class="gst-riga-form"><input id="gst-scrivi" placeholder="Es. A1-4, B5" aria-label="Posti da tenere da parte"><button type="button" class="btn piccolo" data-az="aggiungi-tenuti">Aggiungi</button></div>' +
        '<div id="gst-per">' + perChi() + "</div></div>" +
      '<p class="gst-errore" id="gst-form-err" role="alert"' + (Object.keys(M.errori || {}).length ? ">Controlla i campi segnati in rosso." : " hidden>") + "</p>" +
      '<div class="gst-azioni">' + (bozza ? '<button type="submit" class="btn primario" data-pubblica="si">Apri le prenotazioni</button>' +
        '<button type="submit" class="btn" data-pubblica="no">' + (M.id ? "Salva la bozza" : "Salva come bozza") + "</button>"
        : '<button type="submit" class="btn primario" data-pubblica="">Salva le modifiche</button>') + "</div>" +
      (bozza ? '<p class="gst-aiuto">Una bozza non compare nella tua pagina finché non apri le prenotazioni.</p>' : "") + "</form></section>");
    adattaMappa(M.dove);
    if (!primo) {
      window.scrollTo(0, y);
      var f = fuoco && document.getElementById(fuoco);
      if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* niente */ } }
    }
    collega();
  }
  /* misura la pianta sul riquadro vero; `dove` = lo scorrimento da tenere (dopo un tocco), altrimenti i posti in vista */
  function adattaMappa(dove) {
    var m = document.getElementById("gst-mappa"), svg = m && m.querySelector("svg"), box = M.pianta && M.pianta.box;
    if (!svg || !box) return;
    var k = scalaMappa(box[2], m.clientWidth, BGL.scalaDettaglio(M.pianta));
    if (!k) return;
    svg.style.width = Math.round(box[2] * k) + "px"; svg.style.height = Math.round(box[3] * k) + "px";
    var s = dove || inizioMappa(M.pianta, k, m.clientWidth, m.clientHeight);
    m.scrollLeft = s.l; m.scrollTop = s.t;
  }
  function aggiornaSala() {
    var m = document.getElementById("gst-mappa"), dove = m ? { l: m.scrollLeft, t: m.scrollTop } : null;
    var s = document.getElementById("gst-sala"); if (s) s.innerHTML = mappa();
    adattaMappa(dove);
    var p = document.getElementById("gst-per"); if (p) { leggi(); p.innerHTML = perChi(); }
  }
  function collega() {
    var f = document.getElementById("gst-form"); if (!f) return;
    var sel = document.getElementById("gst-progetto"); if (sel) sel.addEventListener("change", function () { leggi(); scegliSala(sel.value, null); });
    var va = document.getElementById("gst-variante"); if (va) va.addEventListener("change", function () { leggi(); scegliSala(M.progetto, va.value); });
    ["descrizione", "note"].forEach(function (id) {
      var t = document.getElementById("gst-" + id), c = document.getElementById("gst-cont-" + id);
      t.addEventListener("input", function () { c.textContent = Array.from(t.value).length; });
    });
    function proponi() {
      if (M.slugToccato) return;
      var s = GST.slugProposto(document.getElementById("gst-titolo").value, GST.bglInizioIso(document.getElementById("gst-data").value, document.getElementById("gst-ora").value) || "");
      if (s) document.getElementById("gst-slug").value = s;
    }
    ["titolo", "data", "ora"].forEach(function (id) {
      var n = document.getElementById("gst-" + id);
      n.addEventListener("input", proponi); n.addEventListener("change", proponi);
    });
    document.getElementById("gst-slug").addEventListener("input", function (e) { M.slugToccato = true; e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); });
    document.getElementById("gst-chiusura-inizio").addEventListener("change", function (e) {
      document.getElementById("gst-chiusura").hidden = e.target.checked;
      /* chiusura scelta a mano: si parte dal giorno e dall'ora dello spettacolo, non da due campi vuoti */
      var cd = document.getElementById("gst-chiusura-data"), co = document.getElementById("gst-chiusura-ora");
      if (!e.target.checked && !cd.value && !co.value) { cd.value = document.getElementById("gst-data").value; co.value = document.getElementById("gst-ora").value; }
    });
    document.getElementById("gst-locandina").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0]; if (!file) return;
      GST.immagine.riduci(file).then(function (r) {
        leggi(); if (M.nuovaUrl) { URL.revokeObjectURL(M.nuovaUrl); M.nuovaUrl = ""; }
        M.nuova = r; M.tolta = false; M.errori = Object.assign({}, M.errori); delete M.errori.locandina; disegna();
      }, function (x) { leggi(); M.errori = Object.assign({}, M.errori, { locandina: x.message }); disegna(); });
    });
    /* il contenitore resta, la pianta dentro si ridisegna a ogni tocco: l'ascolto sta sul contenitore */
    document.getElementById("gst-sala").addEventListener("click", function (e) {
      var g = e.target.closest ? e.target.closest("g.posto[data-k]") : null; if (!g) return;
      var k = g.getAttribute("data-k");
      if (M.occupati.indexOf(k) >= 0) { A.avviso("Il posto " + PP.bglPostoNome(k) + " è prenotato: non si tiene da parte.", "err"); return; }
      leggi(); M.riservati = toggleTenuto(M.riservati, k, M.occupati); aggiornaSala();
    });
    document.getElementById("gst-sala").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var g = e.target.closest ? e.target.closest("g.posto[data-k]") : null; if (!g) return;
      e.preventDefault(); g.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    /* Invio in un campo di una riga NON apre le prenotazioni (il primo pulsante del modulo): si pubblica solo col dito */
    f.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target && e.target.tagName === "INPUT" && e.target.type !== "checkbox") {
        e.preventDefault();
        if (e.target.id === "gst-scrivi") document.querySelector('[data-az="aggiungi-tenuti"]').click();
      }
    });
    f.addEventListener("submit", function (e) { e.preventDefault(); var b = e.submitter || f.querySelector("[type=submit]"); invia(b.getAttribute("data-pubblica")); });
  }
  A.azione("togli-locandina", function () { leggi(); M.nuova = null; if (M.nuovaUrl) { URL.revokeObjectURL(M.nuovaUrl); M.nuovaUrl = ""; } M.tolta = true; disegna(); });
  A.azione("riprova-modulo", function () { var q = new URLSearchParams(location.search); apri(q.get("id"), q.get("p")); });
  A.azione("aggiungi-tenuti", function () {
    leggi();
    var t = document.getElementById("gst-scrivi"), chiavi = chiaviPianta(M.pianta);
    var R = GST.bglRiservatiDaTesto(t.value, chiavi), presi = [];
    R.chiavi.forEach(function (k) {
      if (M.occupati.indexOf(k) >= 0) presi.push(k);
      else if (M.riservati.indexOf(k) < 0) M.riservati.push(k);
    });
    if (R.sconosciuti.length) A.avviso("Non trovati nella sala: " + R.sconosciuti.join(", "), "err");
    else if (presi.length) A.avviso("Già prenotati, non si tengono da parte: " + PP.bglPostiNomi(presi), "err");
    t.value = ""; aggiornaSala();
  });
  function invia(pubblica) {
    if (M.inviando) return;
    leggi();
    var campi = Object.assign({}, M.c, { project_id: M.progetto, riservati: M.riservati, riservatiPer: M.per });
    if (!M.id || M.salaCambiata) campi.variante = M.variante;
    /* indirizzo: con prenotazioni non si manda (non si cambia); nuovo e mai toccato non si manda e lo sceglie il server
       con la stessa regola (bgl_slug_proposto, gemella di slugProposto) più -2, -3 se è già usato */
    if (M.haPrenotazioni || (!M.id && !M.slugToccato)) delete campi.slug_breve;
    var R = GST.datiModulo(campi, { nuovo: !M.id });
    if (!M.pianta) R.errori.sala = R.errori.sala || "Scegli la sala e aspetta che si carichi la pianta.";
    else if (PP.bglProblemiPianta(M.pianta).length) R.errori.sala = PP.bglProblemiPianta(M.pianta)[0];
    if (Object.keys(R.errori).length) {
      M.errori = R.errori; disegna();
      var e1 = document.querySelector(".ha-errore input, .ha-errore textarea, .ha-errore select") || document.getElementById("gst-progetto");
      if (e1) { e1.focus(); if (e1.scrollIntoView) e1.scrollIntoView({ block: "center" }); }
      return;
    }
    M.errori = {};
    if (!M.id || M.salaCambiata) { R.dati.pianta = M.pianta; R.dati.project_id = M.progetto; }
    if (pubblica === "si") { R.dati.pubblicato = true; R.dati.stato = "aperta"; }
    else if (pubblica === "no" && !M.id) R.dati.pubblicato = false;
    if (M.tolta && !M.nuova) R.dati.locandina_path = null;
    var err = document.getElementById("gst-form-err");
    M.inviando = true; Array.prototype.forEach.call(document.querySelectorAll("#gst-form [type=submit]"), function (b) { b.disabled = true; });
    var car = M.nuova ? GST.immagine.carica(A.cfg, A.dati.utente.id, M.nuova) : Promise.resolve(null);
    car.then(function (c) {
      if (c && c.errore) throw new Error(GST.immagine.MESSAGGI.carica);
      if (c) R.dati.locandina_path = c.path;
      return GST.api.spettacoloSalva(M.id, R.dati).then(function (r) {
        if (!r.ok) { if (c) GST.immagine.togli(A.cfg, c.path); throw new Error(GST.messaggio(r, "spettacolo")); }
        if (r.locandina_vecchia) GST.immagine.togli(A.cfg, r.locandina_vecchia);
        return A.ricarica().then(function () {
          A.avviso(pubblica === "si" ? "Prenotazioni aperte" : (pubblica === "no" ? "Bozza salvata: il pubblico non la vede" : "Modifiche salvate"));
          A.vai("scheda", { id: r.id }, true);
        });
      });
    }).catch(function (x) {
      M.inviando = false; err.textContent = x.message; err.hidden = false;
      Array.prototype.forEach.call(document.querySelectorAll("#gst-form [type=submit]"), function (b) { b.disabled = false; });
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
