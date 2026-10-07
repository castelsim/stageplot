/* Biglietteria — AREA DELL'ORGANIZZATORE, la parte che si vede (specifica area §2). Una schermata alla volta, una cosa
   principale per schermata. L'indirizzo dice dove si è (?v=nuovo|modifica|scheda|sala|sposta &id= &p=): il tasto
   Indietro del telefono funziona. Le viste stanno in file a parte e si registrano con GST.app.registra; i punti
   d'estensione permettono a sala cambiata e Sposta di aggiungersi senza toccare questo file. Il server decide chi
   può fare cosa: qui i suoi rifiuti si dicono in parole. */
(function (root) {
  "use strict";
  var GST = root.GST, BGL = root.BGL, I = root.BGLIndirizzi, ACC = root.BGLAccesso;
  var app = typeof document !== "undefined" && document.getElementById("gst-app");
  if (!app || !GST || !BGL || !I || !ACC) return;
  var esc = BGL.esc, cfg = BGL.configura(location.hostname, location.search);
  var viste = Object.create(null), punti = Object.create(null), azioni = Object.create(null), progetti = Object.create(null);
  var D = { utente: null, org: null, emailAccount: "", spettacoli: [] };
  GST.api.trasporto = function (fn, args) { return ACC.rpcGrezza(cfg, fn, args); };

  function base() { return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? location.origin : "https://stageplot.it"; }
  function scaricaBlob(blob, nome) {
    var u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }
  function caricaQr() {
    if (root.qrcode) return Promise.resolve(root.qrcode);
    return new Promise(function (ok, no) {
      var s = document.createElement("script"); s.src = "/vendor/qrcode.min.js"; s.async = true;
      s.onload = function () { root.qrcode ? ok(root.qrcode) : no(new Error("qrcode")); };
      s.onerror = function () { no(new Error("qrcode")); };
      document.head.appendChild(s);
    });
  }

  var A = GST.app = {
    cfg: cfg, dati: D, base: base,
    registra: function (nome, vista) { viste[nome] = vista; },
    estendi: function (punto, fn) { (punti[punto] = punti[punto] || []).push(fn); },
    chiama: function (punto) {
      var args = Array.prototype.slice.call(arguments, 1), out = [];
      (punti[punto] || []).forEach(function (f) {
        try { var r = f.apply(null, args); if (Array.isArray(r)) out = out.concat(r); } catch (e) { if (root.console) console.error(e); }
      });
      return out;
    },
    azione: function (nome, fn) { azioni[nome] = fn; },
    corpo: function (html) {
      app.innerHTML = html;
      var h = app.querySelector("h1, h2");
      if (h) { h.setAttribute("tabindex", "-1"); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
      window.scrollTo(0, 0);
    },
    avviso: function (testo, tipo) {
      var t = document.getElementById("gst-toast"); if (!t) return;
      t.textContent = testo; t.className = "gst-toast " + (tipo || "ok"); t.hidden = false;
      clearTimeout(A._toast); A._toast = setTimeout(function () { t.hidden = true; }, 5000);
    },
    conferma: function (o) {
      return new Promise(function (fine) {
        var ov = document.createElement("div"); ov.className = "gst-dlg-ov";
        ov.innerHTML = '<div class="gst-dlg" role="dialog" aria-modal="true" aria-labelledby="gst-dlg-t"><h2 id="gst-dlg-t">' + esc(o.titolo) + "</h2>" +
          '<p class="gst-dlg-testo">' + esc(o.testo || "") + '</p><div class="gst-dlg-az"><button type="button" class="btn" data-r="no">' +
          esc(o.no || "Annulla") + '</button><button type="button" class="btn ' + (o.pericolo ? "pericolo" : "primario") + '" data-r="si">' + esc(o.si) + "</button></div></div>";
        document.body.appendChild(ov);
        var prima = document.activeElement;
        function chiudi(si) { document.removeEventListener("keydown", tasto, true); ov.remove(); if (prima && prima.focus) prima.focus(); fine(si); }
        function tasto(e) { if (e.key === "Escape") { e.stopPropagation(); chiudi(false); } }
        document.addEventListener("keydown", tasto, true);
        ov.addEventListener("click", function (e) { var b = e.target.closest("[data-r]"); if (b) chiudi(b.getAttribute("data-r") === "si"); else if (e.target === ov) chiudi(false); });
        ov.querySelector('[data-r="no"]').focus();
      });
    },
    vai: function (vista, param, sostituisci) {
      var q = new URLSearchParams();
      if (vista && vista !== "elenco") q.set("v", vista);
      Object.keys(param || {}).forEach(function (k) { if (param[k] != null && param[k] !== "") q.set(k, param[k]); });
      var u = location.pathname + (q.toString() ? "?" + q.toString() : "");
      try { history[sostituisci ? "replaceState" : "pushState"]({ gst: 1 }, "", u); } catch (e) { location.href = u; return; }
      mostra();
    },
    ricarica: function () {
      return GST.api.organizzatoreMio().then(function (r) {
        if (r.ok) { D.org = r.organizzatore; D.emailAccount = r.email_account || ""; D.spettacoli = r.spettacoli || []; }
        return r;
      });
    },
    /* il documento salvato di un progetto dell'account (lo legge la RLS: è suo); null se eliminato o assente */
    progettoDati: function (id) {
      if (!progetti[id]) {
        progetti[id] = ACC.cliente(cfg).then(function (c) {
          return c.from("stageplot_projects").select("data,deleted_at").eq("id", id).maybeSingle();
        }).then(function (r) {
          if (r.error) throw r.error;
          return r.data && !r.data.deleted_at ? r.data.data : null;
        });
        progetti[id].catch(function () { delete progetti[id]; });
      }
      return progetti[id];
    },
    copia: function (testo) {
      var fatto = function (ok) { A.avviso(ok ? "Link copiato" : "Non riesco a copiare: selezionalo e copialo a mano", ok ? "ok" : "err"); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(testo).then(function () { fatto(true); }, function () { fatto(false); });
      else fatto(false);
    },
    /* il QR del link bello, come PNG grande abbastanza per la stampa (1024 px) */
    qr: function (testo, nome) {
      caricaQr().then(function (qrcode) {
        var q = qrcode(0, "M"); q.addData(testo); q.make();
        var n = q.getModuleCount(), margine = 4, cella = Math.floor(1024 / (n + 2 * margine)), lato = cella * (n + 2 * margine);
        var c = document.createElement("canvas"); c.width = lato; c.height = lato;
        var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, lato, lato); g.fillStyle = "#000";
        for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + margine) * cella, (r + margine) * cella, cella, cella);
        c.toBlob(function (b) { if (b) scaricaBlob(b, "qr-" + nome + ".png"); }, "image/png");
      }, function () { A.avviso("Il QR non si è creato: riprova.", "err"); });
    }
  };

  /* ---- le schermate di questo file ---- */
  function campo(id, etichetta, controllo, aiuto) {
    return '<div class="gst-campo" id="gst-c-' + id + '"><label for="gst-' + id + '">' + esc(etichetta) + "</label>" + controllo +
      (aiuto ? '<p class="gst-aiuto">' + esc(aiuto) + "</p>" : "") + '<p class="gst-err" id="gst-e-' + id + '" hidden></p></div>';
  }
  function vistaAccesso() {
    A.corpo('<section class="gst-centro"><h1>Biglietteria</h1><p>Entra con l\'account StagePlot per preparare e seguire i tuoi spettacoli.</p>' +
      '<button type="button" class="btn primario" data-az="accedi">Accedi con Google</button></section>');
  }
  function vistaNonAbilitato() {
    A.corpo('<section class="gst-centro"><h1>Biglietteria</h1><p>' +
      esc(GST.NON_ABILITATO).replace("info@stageplot.it", '<a href="mailto:info@stageplot.it">info@stageplot.it</a>') + "</p></section>");
  }
  function vistaSenzaRete() {
    A.corpo('<section class="gst-centro"><h1>Non riesco a collegarmi</h1><p>Controlla la connessione: i tuoi spettacoli sono al sicuro.</p>' +
      '<button type="button" class="btn primario" data-az="ricomincia">Riprova</button></section>');
  }
  function vistaErrore(r) {
    A.corpo('<section class="gst-centro"><h1>Qualcosa non ha funzionato</h1><p>' + esc(GST.messaggio(r)) + "</p>" +
      '<button type="button" class="btn primario" data-az="ricomincia">Riprova</button></section>');
  }
  function vistaPrimaVolta() {
    var stato = { toccato: false, timer: null, logo: null, seq: 0 };
    /* D7 + decisione di Simone del 06/10: l'indirizzo si blocca dal primo spettacolo pubblicato. Gli spettacoli nati
       nell'editor entrano nell'area proprio con questo salvataggio (bgl_collega_eventi): se uno è già pubblicato,
       l'indirizzo resta fisso da subito, e va detto PRIMA di salvare. */
    var giaPubblicati = D.spettacoli.some(function (e) { return e.pubblicato !== false; });
    A.corpo('<section class="gst-modulo"><h1>La tua pagina</h1>' +
      '<p class="gst-aiuto">Una volta sola: il nome che vede il pubblico e l\'indirizzo della pagina con tutti i tuoi spettacoli.</p>' +
      '<form id="gst-pv" novalidate>' +
      campo("nome", "Nome dell'organizzatore", '<input id="gst-nome" maxlength="80" autocomplete="organization">', "Per esempio: Teatro di Città, Associazione Musica Insieme.") +
      campo("slug", "Indirizzo della pagina", '<div class="gst-indirizzo"><span>stageplot.it/biglietteria/</span><input id="gst-slug" maxlength="40" autocapitalize="off" spellcheck="false" inputmode="url"></div>' +
        '<p class="gst-stato" id="gst-slug-stato" aria-live="polite"></p>' +
        (giaPubblicati ? '<p class="nota forte" id="gst-slug-fisso">Hai già uno spettacolo con le prenotazioni aperte: appena salvi, questo indirizzo resta fisso per sempre.</p>' : ""),
        "Sceglilo bene: dal primo spettacolo con le prenotazioni aperte non si cambia più, perché link e QR possono essere già stampati.") +
      /* decisione 3 di Simone (06/10): precompilata con l'email dell'account, ben visibile, modificabile. In pagina va
         solo quella salvata qui: vuota = nessuna email (revisione T23: niente ripiego nascosto sull'email dell'account) */
      campo("contatto", "Email per le domande del pubblico", '<input id="gst-contatto" type="email" maxlength="254" autocomplete="email" value="' + esc(D.emailAccount) + '">',
        "La vede chiunque apre la tua pagina. Meglio un indirizzo pensato per il pubblico, come info@… o quello del teatro. Se lo lasci vuoto, in pagina non compare nessuna email.") +
      campo("logo", "Logo (facoltativo)", '<input id="gst-logo" type="file" accept="image/*"><img id="gst-logo-ant" class="gst-logo" alt="" hidden>') +
      '<p class="gst-errore" id="gst-pv-err" role="alert" hidden></p>' +
      '<button type="submit" class="btn primario">Continua</button></form></section>');
    var nome = document.getElementById("gst-nome"), slug = document.getElementById("gst-slug"), st = document.getElementById("gst-slug-stato");
    function controlla() {
      clearTimeout(stato.timer);
      var v = slug.value, mio = ++stato.seq;
      if (!v) { st.textContent = ""; return; }
      stato.timer = setTimeout(function () {
        GST.api.slugLibero(v).then(function (r) {
          if (mio !== stato.seq) return;
          st.className = "gst-stato " + (r.ok && r.libero ? "ok" : "no");
          st.textContent = !r.ok ? GST.messaggio(r) : r.libero ? "stageplot.it/biglietteria/" + v + " — libero"
            : { formato: "Solo lettere minuscole, numeri e trattini, da 3 a 40.", riservato: "Questo indirizzo non si può usare.",
                occupato: "Già usato da un altro organizzatore: cambialo un poco." }[r.motivo] || "Non disponibile.";
        });
      }, 350);
    }
    nome.addEventListener("input", function () {
      if (stato.toccato) return;
      slug.value = GST.slugDaTesto(nome.value).slice(0, 40).replace(/-+$/, ""); controlla();
    });
    /* l'avviso «email non giusta» sparisce appena la si corregge */
    document.getElementById("gst-contatto").addEventListener("input", function () { document.getElementById("gst-pv-err").hidden = true; });
    slug.addEventListener("input", function () { stato.toccato = true; slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); controlla(); });
    document.getElementById("gst-logo").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0], er = document.getElementById("gst-e-logo"), img = document.getElementById("gst-logo-ant");
      er.hidden = true; stato.logo = null; img.hidden = true;
      if (!f) return;
      GST.immagine.riduci(f).then(function (r) { stato.logo = r; img.src = URL.createObjectURL(r.blob); img.hidden = false; },
        function (x) { er.textContent = x.message; er.hidden = false; });
    });
    document.getElementById("gst-pv").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = document.getElementById("gst-pv-err"), btn = e.target.querySelector("button[type=submit]");
      err.hidden = true;
      if (!nome.value.trim()) { err.textContent = "Scrivi il nome che vede il pubblico."; err.hidden = false; nome.focus(); return; }
      if (!I.slugOrgOk(slug.value)) { err.textContent = "Scegli un indirizzo: lettere minuscole, numeri e trattini, da 3 a 40."; err.hidden = false; slug.focus(); return; }
      var contatto = document.getElementById("gst-contatto");
      if (!GST.contattoOk(contatto.value)) { err.textContent = "L'email per il pubblico non sembra giusta: correggila, oppure lasciala vuota."; err.hidden = false; contatto.focus(); return; }
      btn.disabled = true;
      var passo = stato.logo ? GST.immagine.carica(cfg, D.utente.id, stato.logo) : Promise.resolve(null);
      passo.then(function (car) {
        if (car && car.errore) throw new Error(GST.immagine.MESSAGGI.carica);
        var dati = { nome: nome.value.trim(), slug: slug.value, contatto_email: document.getElementById("gst-contatto").value.trim() || null };
        if (car) dati.logo_path = car.path;
        return GST.api.organizzatoreSalva(dati).then(function (r) {
          if (!r.ok) { if (car) GST.immagine.togli(cfg, car.path); throw new Error(GST.messaggio(r, "organizzatore")); }
          return A.ricarica().then(entra);   /* con ?p= dall'editor si prosegue verso «Nuovo spettacolo» */
        });
      }).catch(function (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; });
    });
    nome.focus();
  }
  function riga(ev) {
    var st = GST.statoRiga(ev);
    var img = ev.locandina_path ? '<img class="gst-mini" src="' + esc(I.urlLocandina(cfg.api, ev.locandina_path)) + '" alt="" loading="lazy">'
      : '<span class="gst-mini riquadro" aria-hidden="true"></span>';
    var avvisi = A.chiama("riga-avvisi", ev).map(function (t) { return '<span class="gst-avviso">' + esc(t) + "</span>"; }).join("");
    return '<li><a class="gst-riga" href="?v=scheda&amp;id=' + esc(ev.id) + '" data-az="apri" data-id="' + esc(ev.id) + '">' + img +
      '<span class="gst-riga-testo"><span class="gst-riga-titolo">' + esc(ev.titolo) + '</span><span class="gst-riga-quando">' +
      esc(GST.bglQuandoBreve(ev.inizio)) + '</span><span class="gst-riga-conti"><span class="gst-stato-' + st.c + '">' + esc(st.t) +
      "</span> · " + esc(GST.contaRiga(ev)) + '</span><span class="gst-avvisi" data-avvisi-di="' + esc(ev.id) + '">' + avvisi +
      "</span></span></a></li>";
  }
  function vistaElenco(q) {
    var p = q.get("p"), lista = D.spettacoli.filter(function (e) { return !p || e.project_id === p; });
    var div = GST.dividiSpettacoli(lista, Date.now()), link = I.linkOrganizzatore(D.org.slug, base());
    document.title = "Biglietteria — " + D.org.nome;
    A.corpo('<section class="gst-elenco"><header class="gst-testa"><p class="ev-marchio">Biglietteria</p><h1>' + esc(D.org.nome) + "</h1>" +
      '<div class="gst-link"><a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link.replace(/^https?:\/\//, "")) + "</a>" +
      '<button type="button" class="btn piccolo" data-az="copia" data-testo="' + esc(link) + '">Copia</button>' +
      '<button type="button" class="btn piccolo" data-az="qr" data-testo="' + esc(link) + '" data-nome="' + esc(D.org.slug) + '">Scarica QR</button></div></header>' +
      '<button type="button" class="btn primario gst-nuovo" data-az="nuovo"' + (p ? ' data-p="' + esc(p) + '"' : "") + ">Nuovo spettacolo</button>" +
      (p ? '<p class="gst-filtro">Gli spettacoli di questo progetto · <a href="?" data-az="tutti">Tutti gli spettacoli</a></p>' : "") +
      '<h2 class="gst-sez">I miei spettacoli</h2>' +
      (div.prossimi.length ? '<ul class="gst-righe">' + div.prossimi.map(riga).join("") + "</ul>" : '<p class="gst-vuoto">Nessuno spettacolo in arrivo.</p>') +
      (div.passati.length ? '<details class="gst-passati"><summary>Passati (' + div.passati.length + ')</summary><ul class="gst-righe">' +
        div.passati.map(riga).join("") + "</ul></details>" : "") + "</section>");
    A.chiama("elenco-disegnato", lista);
  }
  /* il progetto si rilegge a ogni schermata: nel frattempo l'organizzatore può averlo cambiato nell'editor */
  function dimenticaProgetti() { progetti = Object.create(null); }
  function mostra() {
    if (!D.utente) return;
    if (!D.org) return vistaPrimaVolta();
    dimenticaProgetti();
    var q = new URLSearchParams(location.search), v = q.get("v") || "elenco";
    if (v !== "elenco" && viste[v]) return viste[v].disegna(q);
    if (v !== "elenco") { try { history.replaceState({ gst: 1 }, "", location.pathname); } catch (e) { /* niente */ } }
    vistaElenco(q);
  }

  /* ---- azioni ---- */
  azioni.accedi = function (el) {
    el.disabled = true;
    ACC.accedi(cfg, location.pathname + location.search).catch(function () {
      el.disabled = false; A.avviso("L'accesso non è partito: controlla la rete e riprova.", "err");
    });
  };
  azioni.ricomincia = function () { avvio(); };
  azioni.apri = function (el) { A.vai("scheda", { id: el.getAttribute("data-id") }); };
  azioni.nuovo = function (el) { A.vai("nuovo", { p: el.getAttribute("data-p") }); };
  azioni.tutti = function () { A.vai("elenco", {}); };
  azioni.copia = function (el) { A.copia(el.getAttribute("data-testo")); };
  azioni.qr = function (el) { A.qr(el.getAttribute("data-testo"), el.getAttribute("data-nome")); };
  app.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-az]") : null;
    if (!el || !app.contains(el)) return;
    var f = azioni[el.getAttribute("data-az")];
    if (f) { e.preventDefault(); f(el, e); }
  });
  window.addEventListener("popstate", mostra);

  function avvio() {
    app.innerHTML = '<p class="carico" role="status">Un momento…</p>';
    ACC.sessione(cfg).then(function (s) {
      var st = ACC.statoAccesso(s);
      if (st === "senza_rete") return vistaSenzaRete();
      if (st === "fuori") return vistaAccesso();
      D.utente = { id: s.sessione.user.id, email: s.sessione.user.email || "" };
      return A.ricarica().then(function (r) {
        if (!r.ok && r.errore === "non_abilitato") return vistaNonAbilitato();
        if (!r.ok && r.errore === "non_autenticato") return vistaAccesso();
        if (!r.ok && r.errore === "rete") return vistaSenzaRete();
        if (!r.ok) return vistaErrore(r);
        entra();
      });
    });
  }
  /* ?p=<progetto> (dal pulsante dell'editor): senza spettacoli di quel progetto si apre «Nuovo spettacolo» con la sala
     già scelta, altrimenti l'elenco filtrato */
  function entra() {
    var q = new URLSearchParams(location.search), p = q.get("p");
    if (p && !q.get("v") && D.org && !D.spettacoli.some(function (e) { return e.project_id === p; })) return A.vai("nuovo", { p: p }, true);
    mostra();
  }
  /* l'area resta aperta mentre si cambia la sala nell'editor (un'altra scheda, un'altra app): tornando qui, il progetto si
     rilegge e la schermata di adesso si aggiorna (elenco qui; scheda, sala e nuovo spettacolo col punto «di-nuovo-visibile») */
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible" || !D.utente || !D.org) return;
    dimenticaProgetti();
    var v = new URLSearchParams(location.search).get("v") || "elenco";
    if (v !== "elenco") { A.chiama("di-nuovo-visibile", v); return; }
    if (document.querySelector(".gst-dlg-ov")) return;   /* una domanda aperta non si cancella sotto il dito */
    A.ricarica().then(function (r) { if (r.ok && !new URLSearchParams(location.search).get("v")) mostra(); });
  });
  /* le viste degli altri file si registrano mentre la pagina finisce di caricarsi: si parte dopo */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", avvio); else setTimeout(avvio, 0);
})(typeof globalThis !== "undefined" ? globalThis : this);
