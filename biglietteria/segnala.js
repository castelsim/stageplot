/* Biglietteria — «Un problema? Scrivici» / «Cosa manca? Bug? Idea?» (07/10/2026, richiesta approvata da Simone).
   La stessa casella delle segnalazioni dell'editor, su TUTTE le pagine della biglietteria: area dell'organizzatore
   (gestione/), pagina dell'organizzatore e scheda dello spettacolo (index.html, anche ?e= e la disdetta ?c=),
   «Le mie prenotazioni» (mie/). Manda alla stessa Edge Function dell'editor (submit-feedback), senza toccare il server.

   PRIVACY. Nell'indirizzo della disdetta viaggia il codice che disdice i posti (?c=): chi lo legge può disdire. Per
   questo `meta.page_url` tiene SOLO origine, percorso e i parametri o, s, e (indirizzi pubblici dello spettacolo), e
   solo se hanno la forma giusta; `tech_context` dice dove si è (pagina, organizzatore, spettacolo), mai nomi, email o
   codici di prenotazione. La schermata è facoltativa, solo incolla o scegli file (niente cattura dello schermo).

   COMPUTER O TELEFONO (Simone, 07/10, «via di mezzo»). Una regola sola, MEDIA_COMPUTER (la stessa stringa in segnala.css):
   schermo largo almeno 700 px E mouse o trackpad (hover + puntatore fine). Lì: il riquadro in basso a destra che si apre e
   si chiude, come nell'editor. In tutti gli altri casi (telefono, tablet col dito, finestra stretta): NIENTE di fisso sulla
   pagina; una voce di testo nel piè di pagina, accanto a «Privacy» e ai contatti, apre il pannello dal basso con la ✕.
   Così sul telefono nulla galleggia sopra la barra «Avanti / Prenota» né sopra i posti.

   Il file ha due metà, come bgl.js: funzioni PURE esportate su globalThis.BGLSegnala e, in Node, su module.exports
   (le prova test/bgl-segnala.test.mjs); sotto, la casella vera, che parte solo nel browser. */
(function (root) {
  "use strict";

  /* ================================================================== 1. FUNZIONI PURE */

  var MIN = 5, MAX = 1000;                   /* gli stessi limiti del server (feedback-validation.ts) */
  var HINTS = ["bug", "missing", "idea"];
  var MAX_SHOT_CHARS = 2800000;              /* ≈ 2 MB di immagine: il tetto del server; si riduce prima di arrivarci */
  var LATO_MAX = 1600;                       /* come l'editor */
  var CONTATTO = "info@stageplot.it";
  var MEDIA_COMPUTER = "(min-width: 700px) and (hover: hover) and (pointer: fine)";

  var RE_ORG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;   /* slugOk di indirizzi.js (o, s) */
  var RE_SLUG10 = /^[a-z2-9]{10}$/;                    /* lo slug del link ?e= (slugValido di bgl.js) */
  function slugOk(s) { return typeof s === "string" && RE_ORG.test(s) && s.indexOf("--") < 0; }
  function slug10Ok(s) { return typeof s === "string" && RE_SLUG10.test(s); }

  /* Quale pagina è: lo dicono il percorso e i parametri (gli stessi che legge bgl.js) */
  function paginaDa(pathname, search) {
    var p = String(pathname || "");
    if (/\/biglietteria\/gestione(\/|$)/.test(p)) return "gestione";
    if (/\/biglietteria\/mie(\/|$)/.test(p)) return "mie";
    var q = new URLSearchParams(search || "");
    if (q.get("c") && q.get("e")) return "disdetta";
    if (q.get("e") || (q.get("o") && q.get("s"))) return "scheda";
    if (q.get("o")) return "organizzatore";
    return "ingresso";   /* /biglietteria/ senza spettacolo */
  }

  /* L'indirizzo della pagina senza niente di sensibile: origine + percorso + o, s, e (solo se ben fatti). Niente
     ?c= (il codice che disdice), niente frammento, niente altri parametri (?id=, ?p= dell'area, ?api=, …). */
  function urlPulito(href) {
    var u;
    try { u = new URL(String(href || "")); } catch (e) { return ""; }
    if (!/^https?:$/.test(u.protocol)) return "";
    var tieni = [];
    var o = (u.searchParams.get("o") || "").toLowerCase(), s = (u.searchParams.get("s") || "").toLowerCase(), e = u.searchParams.get("e") || "";
    if (slugOk(o)) tieni.push("o=" + o);
    if (slugOk(s)) tieni.push("s=" + s);
    if (slug10Ok(e)) tieni.push("e=" + e);
    return u.origin + u.pathname + (tieni.length ? "?" + tieni.join("&") : "");
  }

  /* Dove si è, per chi legge la segnalazione. Solo indirizzi pubblici e il nome della vista: nessun dato di persone. */
  var VISTE = ["elenco", "nuovo", "modifica", "scheda", "sala", "sposta", "organizzatore"];
  function contestoTecnico(pagina, d) {
    d = d || {};
    var c = { origine: "biglietteria", pagina: String(pagina || "") };
    var org = String(d.org || "").toLowerCase(), sp = String(d.spettacolo || "").toLowerCase();
    if (slugOk(org)) c.org = org;
    if (slugOk(sp)) c.spettacolo = sp;
    if (slug10Ok(d.slug)) c.slug = d.slug;
    if (VISTE.indexOf(d.vista) >= 0) c.vista = d.vista;
    if (d.schermata === "pianta" || d.schermata === "modulo") c.schermata = d.schermata;
    return c;
  }

  /* I testi: nell'area dell'organizzatore come nell'editor; al pubblico più semplici */
  function testi(pagina) {
    var area = pagina === "gestione";
    return {
      titolo: area ? "Cosa manca? Bug? Idea?" : "Un problema? Scrivici",
      segnaposto: area ? "Scrivi cosa manca, cosa non funziona o cosa vorresti migliorare…"
        : "Scrivi cosa non funziona o cosa non si capisce…",
      tipi: [["bug", "Bug"], ["missing", "Manca qualcosa"], ["idea", "Idea"]],
      schermata: "Allega un'immagine (facoltativo)",
      schermataCome: "Incolla uno screenshot o tocca per sceglierlo",
      invia: "Invia", inviando: "Invio…",
      nota: "Inviando, accetti che il messaggio e alcuni dati tecnici anonimi vengano usati per migliorare StagePlot.",
      notaSchermata: "Inviando, accetti che il messaggio, la schermata allegata e alcuni dati tecnici vengano usati per migliorare StagePlot. Controlla che la schermata non mostri cose tue.",
      notaPubblico: area ? "" : "Per domande sullo spettacolo o sulla tua prenotazione scrivi all'organizzatore o a " + CONTATTO + ": da qui non possiamo risponderti.",
      grazie: "Grazie, l'abbiamo ricevuto.",
      grazieDopo: "Le leggiamo una per una.",
      chiudi: "Chiudi"
    };
  }

  function hintValido(h) { return HINTS.indexOf(h) >= 0 ? h : null; }

  /* null = va bene; altrimenti la frase da mostrare */
  function erroreMessaggio(testo) {
    var t = String(testo == null ? "" : testo).trim();
    if (t.length < MIN) return "Scrivi almeno " + MIN + " caratteri.";
    if (t.length > MAX) return "Al massimo " + MAX + " caratteri.";
    return null;
  }

  /* Il corpo per submit-feedback (campi di feedback-validation.ts). Niente project_snapshot, niente project_id,
     niente user_id/email: l'account, se c'è, lo ricava il server dal token. */
  function corpo(o) {
    o = o || {};
    var shot = typeof o.screenshot === "string" && /^data:image\/(jpeg|webp|png);base64,/.test(o.screenshot) &&
      o.screenshot.length <= MAX_SHOT_CHARS ? o.screenshot : null;
    return {
      message: String(o.messaggio == null ? "" : o.messaggio).trim().slice(0, MAX),
      hint: hintValido(o.hint),
      honeypot: String(o.honeypot || ""),
      tech_context: contestoTecnico(o.pagina, o.dove),
      meta: {
        app_version: "biglietteria/" + String(o.pagina || ""),
        page_url: urlPulito(o.href),
        user_agent: String(o.userAgent || "").slice(0, 500),
        viewport: String(o.viewport || ""),
        language: String(o.lingua || "")
      },
      screenshot: shot
    };
  }

  function urlInvio(api) { return String(api || "").replace(/\/+$/, "") + "/functions/v1/submit-feedback"; }

  /* La risposta del server, in parole */
  function esitoInvio(status, j) {
    if (status === 200 && j && j.ok) return { ok: true };
    if (status === 429) return { ok: false, testo: "Hai già scritto da poco, riprova più tardi." };
    if (status === 413) return { ok: false, testo: "L'immagine è troppo pesante: togli l'immagine e riprova." };
    if (status === 400) return { ok: false, testo: "Il messaggio non va bene: scrivi almeno " + MIN + " caratteri." };
    return { ok: false, testo: "Non è partito: controlla la connessione e riprova." };
  }

  /* Misure dell'immagine ridotta: il lato lungo al massimo `max`, mai ingrandita */
  function misureRidotte(w, h, max) {
    w = +w || 0; h = +h || 0; max = +max || LATO_MAX;
    if (w <= 0 || h <= 0) return { w: 0, h: 0 };
    var k = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  var SG = {
    MEDIA_COMPUTER: MEDIA_COMPUTER, MIN: MIN, MAX: MAX, HINTS: HINTS, MAX_SHOT_CHARS: MAX_SHOT_CHARS, LATO_MAX: LATO_MAX,
    paginaDa: paginaDa, urlPulito: urlPulito, contestoTecnico: contestoTecnico, testi: testi, hintValido: hintValido,
    erroreMessaggio: erroreMessaggio, corpo: corpo, urlInvio: urlInvio, esitoInvio: esitoInvio, misureRidotte: misureRidotte
  };
  root.BGLSegnala = SG;
  if (typeof module === "object" && module && module.exports) module.exports = SG;

  /* ================================================================== 2. LA CASELLA */

  if (typeof document === "undefined" || !document.body || root.__bglSegnala) return;
  root.__bglSegnala = true;
  var BGL = root.BGL, ACC = root.BGLAccesso;
  if (!BGL || !BGL.configura) return;
  var cfg = BGL.configura(location.hostname, location.search);
  var pagina = paginaDa(location.pathname, location.search);
  var T = testi(pagina);
  var esc = BGL.esc;
  var hint = null, shot = null, aperto = false, inviando = false;
  var computer = root.matchMedia ? root.matchMedia(MEDIA_COMPUTER) : { matches: true };
  var chiamante = null;   /* chi ha aperto il pannello (il pulsante del riquadro o la voce del piè di pagina): lì torna il fuoco */

  var ICONA = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8.5 8h7M8.5 11.5h4.5"/></svg>';

  var tasto = document.createElement("button");
  tasto.type = "button"; tasto.id = "sg-tasto"; tasto.className = "sg-tasto";
  tasto.setAttribute("aria-expanded", "false"); tasto.setAttribute("aria-controls", "sg-pannello");
  tasto.setAttribute("aria-label", T.titolo);
  tasto.innerHTML = ICONA + '<span class="sg-tasto-t">' + esc(T.titolo) + '</span><span class="sg-freccia" aria-hidden="true">▴</span>';

  var velo = document.createElement("div"); velo.className = "sg-velo"; velo.hidden = true;

  var pan = document.createElement("div");
  pan.id = "sg-pannello"; pan.className = "sg-pannello"; pan.hidden = true;
  pan.setAttribute("role", "dialog"); pan.setAttribute("aria-labelledby", "sg-titolo");
  pan.innerHTML =
    '<div class="sg-testa"><h2 id="sg-titolo">' + esc(T.titolo) + '</h2>' +
    '<button type="button" class="sg-x" id="sg-chiudi" aria-label="Chiudi">✕</button></div>' +
    '<div class="sg-corpo" id="sg-modulo">' +
      '<label class="sg-vis" for="sg-msg">Il tuo messaggio</label>' +
      '<textarea id="sg-msg" maxlength="' + MAX + '" rows="4" placeholder="' + esc(T.segnaposto) + '" aria-describedby="sg-conta"></textarea>' +
      '<div class="sg-conta" id="sg-conta"><span id="sg-n">0</span>/' + MAX + '</div>' +
      '<div class="sg-tipi" role="group" aria-label="Di che si tratta">' +
        T.tipi.map(function (t) { return '<button type="button" class="sg-tipo" data-hint="' + t[0] + '" aria-pressed="false">' + esc(t[1]) + "</button>"; }).join("") +
      "</div>" +
      '<div class="sg-shot" id="sg-shot"></div>' +
      '<input type="file" id="sg-file" accept="image/*" hidden>' +
      '<input type="text" id="sg-hp" class="sg-hp" tabindex="-1" aria-hidden="true" autocomplete="off">' +
      '<button type="button" class="btn primario sg-invia" id="sg-invia">' + esc(T.invia) + "</button>" +
      '<p class="sg-esito" id="sg-esito" role="alert" hidden></p>' +
      '<p class="sg-nota" id="sg-nota"></p>' +
      (T.notaPubblico ? '<p class="sg-nota">' + esc(T.notaPubblico) + "</p>" : "") +
    "</div>" +
    '<div class="sg-corpo sg-grazie" id="sg-grazie" hidden><p class="sg-grazie-t" tabindex="-1" id="sg-grazie-t">' + esc(T.grazie) + "</p>" +
      "<p>" + esc(T.grazieDopo) + '</p><button type="button" class="btn sg-ok" id="sg-ok">' + esc(T.chiudi) + "</button></div>";

  document.body.appendChild(velo); document.body.appendChild(pan); document.body.appendChild(tasto);

  /* --- la voce nel piè di pagina (telefono, tablet, finestra stretta) ---
     Le pagine riscrivono il loro contenuto a ogni schermata (piè di pagina compreso): un osservatore rimette la voce nel
     <footer class="piede"> della pagina, subito dopo «Privacy». Dove la pagina non ne ha (l'area dell'organizzatore, i
     caricamenti) c'è un piè di pagina tutto suo, dopo il <main>. Sul computer la voce non si vede: c'è il riquadro. */
  var main = document.querySelector("main");
  var mioPiede = document.createElement("footer");
  mioPiede.className = "piede sg-piede"; mioPiede.hidden = true;
  if (main && main.parentNode) main.parentNode.insertBefore(mioPiede, main.nextSibling); else document.body.appendChild(mioPiede);
  function voce() {
    var b = document.createElement("button");
    b.type = "button"; b.className = "sg-voce"; b.textContent = T.titolo;
    b.setAttribute("aria-controls", "sg-pannello"); b.setAttribute("aria-expanded", String(aperto));
    b.setAttribute("aria-haspopup", "dialog");
    b.addEventListener("click", function () { if (aperto) chiudi(); else apri(b); });
    return b;
  }
  function sistemaVoce() {
    var f = main && main.querySelector("footer.piede");
    if (f) {
      if (!f.querySelector(".sg-voce")) {
        var priv = f.querySelector('a[href^="/privacy/"]');
        f.insertBefore(voce(), priv ? priv.nextSibling : null);
      }
      mioPiede.hidden = true;
    } else {
      if (!mioPiede.querySelector(".sg-voce")) mioPiede.appendChild(voce());
      mioPiede.hidden = false;
    }
  }
  if (main && root.MutationObserver) new root.MutationObserver(sistemaVoce).observe(main, { childList: true, subtree: true });
  sistemaVoce();
  document.body.classList.add("sg-on");

  var $ = function (id) { return document.getElementById(id); };
  var msg = $("sg-msg"), n = $("sg-n"), invia = $("sg-invia"), esito = $("sg-esito"), file = $("sg-file"), boxShot = $("sg-shot");

  function nota() {
    $("sg-nota").innerHTML = esc(shot ? T.notaSchermata : T.nota) + ' <a href="/privacy/" target="_blank" rel="noopener">Privacy</a>';
  }
  function shotVuoto() {
    shot = null;
    boxShot.className = "sg-shot";
    boxShot.innerHTML = '<button type="button" class="sg-scegli" id="sg-scegli"><span class="sg-shot-t">' + esc(T.schermata) +
      '</span><span class="sg-shot-s">' + esc(T.schermataCome) + "</span></button>";
    $("sg-scegli").addEventListener("click", function () { file.click(); });
    nota();
  }
  function shotPieno(r) {
    shot = r.url;
    boxShot.className = "sg-shot pieno";
    boxShot.innerHTML = '<img alt="Immagine allegata" src="' + r.url + '"><div class="sg-shot-riga"><span>' + r.w + "×" + r.h + " · " + r.kb +
      ' KB</span><button type="button" class="btn piccolo" id="sg-togli">Togli</button></div>';
    $("sg-togli").addEventListener("click", function () { shotVuoto(); try { $("sg-scegli").focus(); } catch (e) { /* niente */ } });
    nota();
  }

  /* Ridotta e compressa PRIMA di partire, come nell'editor: lato lungo 1600 px, JPEG; se resta troppo pesante si
     scende di qualità e di misura. Fondo bianco: un PNG trasparente in JPEG verrebbe nero. */
  function disegna(sorgente, w, h) {
    var tentativi = [[LATO_MAX, 0.75], [LATO_MAX, 0.6], [1200, 0.6], [900, 0.5]];
    for (var i = 0; i < tentativi.length; i++) {
      var m = misureRidotte(w, h, tentativi[i][0]);
      var c = document.createElement("canvas"); c.width = m.w; c.height = m.h;
      var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, m.w, m.h); g.drawImage(sorgente, 0, 0, m.w, m.h);
      var url = c.toDataURL("image/jpeg", tentativi[i][1]);
      if (/^data:image\/jpeg;base64,/.test(url) && url.length <= MAX_SHOT_CHARS) return { url: url, w: m.w, h: m.h, kb: Math.round(url.length * 0.75 / 1024) };
    }
    return null;
  }
  function daFile(blob) {
    if (root.createImageBitmap) {
      return root.createImageBitmap(blob).then(function (b) { return disegna(b, b.width, b.height); }, function () { return daFileLento(blob); });
    }
    return daFileLento(blob);
  }
  /* senza createImageBitmap: FileReader → data: (la CSP delle pagine ammette data:, non blob:) */
  function daFileLento(blob) {
    return new Promise(function (ok, no) {
      var fr = new FileReader();
      fr.onload = function () {
        var im = new Image();
        im.onload = function () { ok(disegna(im, im.naturalWidth, im.naturalHeight)); };
        im.onerror = no; im.src = fr.result;
      };
      fr.onerror = no; fr.readAsDataURL(blob);
    });
  }
  function metti(blob) {
    if (!blob || !/^image\//.test(blob.type || "")) return mostraEsito("Questo file non è un'immagine.");
    return daFile(blob).then(function (r) {
      if (!r) return mostraEsito("Non riesco a usare questa immagine: provane un'altra.");
      esito.hidden = true; shotPieno(r);
    }, function () { mostraEsito("Non riesco a usare questa immagine: provane un'altra."); });
  }
  file.addEventListener("change", function () { if (file.files && file.files[0]) metti(file.files[0]); file.value = ""; });
  /* incolla: solo col pannello aperto, e solo se negli appunti c'è un'immagine (il testo va nella casella come sempre) */
  document.addEventListener("paste", function (e) {
    if (!aperto) return;
    var it = [].slice.call((e.clipboardData || {}).items || []).filter(function (i) { return i.kind === "file" && /^image\//.test(i.type || ""); })[0];
    if (it) { e.preventDefault(); metti(it.getAsFile()); }
  });

  function mostraEsito(t) { esito.textContent = t; esito.hidden = !t; }

  /* --- sul computer il riquadro sta sopra la barra «Avanti / Prenota» della scheda: mai coprirla --- */
  var barra = $("bgl-barra");
  function posiziona() {
    var h = barra && !barra.hidden ? barra.getBoundingClientRect().height : 0;
    if (h > 0) document.body.style.setProperty("--sg-giu", Math.ceil(h + 12) + "px");
    else document.body.style.removeProperty("--sg-giu");
  }
  if (barra) {
    if (root.ResizeObserver) new root.ResizeObserver(posiziona).observe(barra);
    if (root.MutationObserver) new root.MutationObserver(posiziona).observe(barra, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });
  }
  root.addEventListener("resize", posiziona);
  posiziona();

  /* --- aprire e chiudere --- */
  function focalizzabili() {
    return [].slice.call(pan.querySelectorAll("button, textarea, input:not([type=hidden]):not([tabindex='-1']), a[href]"))
      .filter(function (x) { return !x.disabled && x.offsetParent !== null; });
  }
  function espanso(v) {
    tasto.setAttribute("aria-expanded", String(v));
    [].forEach.call(document.querySelectorAll(".sg-voce"), function (b) { b.setAttribute("aria-expanded", String(v)); });
  }
  function apri(da) {
    if (aperto) return;
    aperto = true;
    chiamante = da || tasto;
    posiziona();
    pan.hidden = false;
    var modale = !computer.matches;
    velo.hidden = !modale;
    pan.setAttribute("aria-modal", modale ? "true" : "false");
    document.body.classList.toggle("sg-aperto", modale);
    espanso(true);
    if (!$("sg-grazie").hidden) { $("sg-grazie").hidden = true; $("sg-modulo").hidden = false; }
    setTimeout(function () { try { msg.focus({ preventScroll: true }); } catch (e) { msg.focus(); } }, 30);
  }
  function chiudi(rimettiFuoco) {
    if (!aperto) return;
    aperto = false;
    pan.hidden = true; velo.hidden = true;
    document.body.classList.remove("sg-aperto");
    espanso(false);
    var dove = chiamante && document.contains(chiamante) && chiamante.offsetParent !== null ? chiamante
      : (computer.matches ? tasto : document.querySelector(".sg-voce"));
    if (rimettiFuoco !== false && dove) { try { dove.focus({ preventScroll: true }); } catch (e) { dove.focus(); } }
  }
  tasto.addEventListener("click", function () { if (aperto) chiudi(); else apri(tasto); });
  $("sg-chiudi").addEventListener("click", function () { chiudi(); });
  $("sg-ok").addEventListener("click", function () { chiudi(); });
  velo.addEventListener("click", function () { chiudi(); });
  /* Esc chiude, ovunque sia il fuoco; ma una finestra di conferma dell'area aperta sopra ha la precedenza */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !aperto || document.querySelector(".gst-dlg-ov")) return;
    e.preventDefault(); chiudi(pan.contains(document.activeElement) || document.activeElement === chiamante || document.activeElement === document.body);
  });
  pan.addEventListener("keydown", function (e) {
    if (e.key === "Tab" && pan.getAttribute("aria-modal") === "true") {   /* sul telefono il fuoco resta nel pannello */
      var f = focalizzabili(); if (!f.length) return;
      var primo = f[0], ultimo = f[f.length - 1];
      if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
    }
  });
  /* passando da computer a telefono (o ruotando) col pannello aperto: si riapre nella forma giusta */
  var cambio = function () { if (aperto) { var c = chiamante; chiudi(false); apri(c); } };
  if (computer.addEventListener) computer.addEventListener("change", cambio); else if (computer.addListener) computer.addListener(cambio);

  msg.addEventListener("input", function () { n.textContent = msg.value.length; if (!esito.hidden && msg.value.trim().length >= MIN) mostraEsito(""); });
  [].forEach.call(pan.querySelectorAll(".sg-tipo"), function (b) {
    b.addEventListener("click", function () {
      hint = hint === b.getAttribute("data-hint") ? null : b.getAttribute("data-hint");
      [].forEach.call(pan.querySelectorAll(".sg-tipo"), function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-hint") === hint)); });
    });
  });

  /* --- dove si è (letto al momento dell'invio: l'area cambia vista senza ricaricare) --- */
  function dove() {
    var q = new URLSearchParams(location.search), d = {};
    if (pagina === "gestione") {
      var A = root.GST && root.GST.app, D = A && A.dati;
      d.vista = q.get("v") || "elenco";
      if (D && D.org) d.org = D.org.slug;
      var id = q.get("id"), ev = id && D && (D.spettacoli || []).filter(function (x) { return x.id === id; })[0];
      if (ev) { d.spettacolo = ev.slug_breve; d.slug = ev.slug; }
    } else if (pagina !== "mie") {
      d.org = q.get("o"); d.spettacolo = q.get("s"); d.slug = q.get("e");
      var b = barra && !barra.hidden && barra.getAttribute("data-modo");
      if (b) d.schermata = b;
    }
    return d;
  }
  /* Con una sessione (Google del pubblico o organizzatore) il server ricava l'account dal token, come nell'editor;
     senza, nessuna intestazione (come l'editor: submit-feedback non chiede il JWT). supabase-js si carica solo se
     nel browser c'è davvero una sessione salvata, e si aspetta al massimo 5 secondi. */
  function tokenSessione() {
    var c = false;
    try { c = !!(ACC && ACC.sessioneSalvata(root.localStorage, cfg.api)); } catch (e) { c = false; }
    if (!c) return Promise.resolve(null);
    return ACC.conLimite(ACC.token(cfg), 5000, null).then(null, function () { return null; });
  }

  invia.addEventListener("click", function () {
    if (inviando) return;
    var err = erroreMessaggio(msg.value);
    if (err) { mostraEsito(err); msg.focus(); return; }
    inviando = true; invia.disabled = true; invia.textContent = T.inviando; mostraEsito("");
    var body = corpo({
      messaggio: msg.value, hint: hint, honeypot: $("sg-hp").value, screenshot: shot, pagina: pagina, dove: dove(),
      href: location.href, userAgent: navigator.userAgent, viewport: innerWidth + "x" + innerHeight, lingua: navigator.language
    });
    tokenSessione().then(function (tok) {
      var h = { "Content-Type": "application/json" };
      if (tok) h.Authorization = "Bearer " + tok;
      return fetch(urlInvio(cfg.api), { method: "POST", headers: h, body: JSON.stringify(body), credentials: "omit", referrerPolicy: "no-referrer" });
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, j: j }; }, function () { return { status: r.status, j: {} }; });
    }).then(function (r) {
      var e = esitoInvio(r.status, r.j);
      if (!e.ok) return mostraEsito(e.testo);
      msg.value = ""; n.textContent = "0"; hint = null; shotVuoto();
      [].forEach.call(pan.querySelectorAll(".sg-tipo"), function (x) { x.setAttribute("aria-pressed", "false"); });
      $("sg-modulo").hidden = true; $("sg-grazie").hidden = false;
      try { $("sg-grazie-t").focus(); } catch (x) { /* niente */ }
    }, function () {
      mostraEsito(esitoInvio(0).testo);
    }).then(function () { inviando = false; invia.disabled = false; invia.textContent = T.invia; });
  });

  shotVuoto();
})(typeof globalThis !== "undefined" ? globalThis : this);
