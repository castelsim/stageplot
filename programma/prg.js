/* Programma di sala — pagina pubblica (/programma/<slug>). Il QR su un roll-up punta a un indirizzo FISSO;
   il contenuto dietro cambia a ogni concerto (migrazione 0082, RPC prg_programma_pubblico).

   FORMATO di `dati` v1 (ogni campo facoltativo tranne v; tipi sconosciuti ignorati):
   {"v":1,
    "intestazione":{"sopratitolo":"…","titolo":"…","titolo_corsivo":"…","righe":["…"],"quando":"…"},
    "sezioni":[
      {"tipo":"interpreti","etichetta":"…","titolo":"…","persone":[{"nome":"…","ruolo":"…"}],"nota":"…"},
      {"tipo":"brani","etichetta":"…","titolo":"…","voci":[{"titolo":"…","dettaglio":"…","brani":"…","nota":"…"}]},
      {"tipo":"testo","etichetta":"…","titolo":"…","paragrafi":["…"]}],
    "link":[{"testo":"…","url":"https://…"}]}
   Le voci «brani» sono numerate 1, 2, 3…; il «titolo» delle voci è in corsivo.

   CAMPI FACOLTATIVI DELLA VERSIONE GRAFICA (dalla 0083; restano dentro v:1: un documento senza questi campi si disegna
   identico a prima, e il server della 0082 accetta solo v = 1):
   "tema":{"stile":"carta"|"notte" (default carta), "accento":"#RRGGBB", "fondo":"#RRGGBB", "fondo2":"#RRGGBB", "testo":"#RRGGBB"}
     colori non validi ignorati; "notte" = fondo blu notte sfumato, testo chiaro, accento arancio (stile locandina).
   "copertina":{"url","alt"}                       immagine a tutta larghezza in testa
   intestazione.logo:{"url","alt"}                 sostituisce titolo/titolo_corsivo (il testo resta in un <h1> nascosto alla vista)
   intestazione.nastro:"…"                         nastro inclinato color accento
   intestazione.data:{"giorno","numero","mese","ora"}   riquadro data come sulle locandine
   intestazione.luogo:{"nome","indirizzo"}
   sezioni: {"tipo":"immagine","etichetta","titolo","url","alt","didascalia"}
            {"tipo":"galleria","etichetta","titolo","immagini":[{"url","alt","didascalia"}]}
   IMMAGINI: solo URL del bucket pubblico `prg-immagini` (https://<progetto>.supabase.co/storage/v1/object/public/prg-immagini/
   <uid>/<32 hex>.(webp|jpg|png); da localhost anche lo stack locale 127.0.0.1:54321). Ogni altro URL: immagine scartata
   (una sezione immagine senza immagine valida, o una galleria vuota, sparisce). I colori del tema si applicano con
   style.setProperty (CSSOM): la CSP resta senza 'unsafe-inline'.

   SICUREZZA: il documento lo scrive un utente e lo legge chiunque. Si disegna SOLO con createElement/createTextNode/
   textContent (mai innerHTML); i link sono accettati solo se https:. validaDati() ripulisce ogni campo (tipo, lunghezza).
   Funzioni pure in testa (validaDati, costruisci, configura): le prova Node (test/programma-di-sala.test.mjs). */
(function (root) {
  "use strict";
  var API_PROD = "https://vsodplqkuvnsdiikvmjb.supabase.co";
  /* La stessa anon key della biglietteria e dell'editor: è pubblica per costruzione (decidono la RLS e i grant). */
  var ANON_PROD = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzb2RwbHFrdXZuc2RpaWt2bWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTkyNjksImV4cCI6MjA5ODE5NTI2OX0.rZmZSvOnrNY3cC2JQ8XnbMTKIfjP5WmtbCtQ6l8zPrc";
  var TIMEOUT_MS = 15000;
  var MAX_SEZIONI = 40, MAX_ELENTO = 300, MAX_LINK = 30, MAX_RIGHE = 20, MAX_IMMAGINI = 30;
  var IMG_PROD = API_PROD + "/storage/v1/object/public/prg-immagini/";
  var IMG_LOCALE = "http://127.0.0.1:54321/storage/v1/object/public/prg-immagini/";
  var IMG_RESTO = /^[0-9a-f-]{1,64}\/[0-9a-f]{32}\.(webp|jpg|png)$/;
  var PRGI = root.PRGIndirizzo || (typeof require === "function" ? require("./indirizzo.js") : null);

  /* ================================================================== FUNZIONI PURE */

  /* Dove sta il server: in produzione SEMPRE quello vero; ?api= e ?anon= valgono solo da localhost (prove). */
  function configura(hostname, search) {
    var cfg = { api: API_PROD, anon: ANON_PROD, locale: false };
    if (hostname !== "localhost" && hostname !== "127.0.0.1") return cfg;
    cfg.locale = true;
    var q = new URLSearchParams(search || "");
    var api = (q.get("api") || "").replace(/\/+$/, "");
    if (/^https?:\/\/[A-Za-z0-9.\-]+(:\d{1,5})?$/.test(api)) cfg.api = api;
    var anon = q.get("anon") || "";
    if (/^[A-Za-z0-9._\-]{1,2000}$/.test(anon)) cfg.anon = anon;
    return cfg;
  }

  /* testo: stringa ripulita dai caratteri di controllo (l'a capo resta per i paragrafi), tagliata; altrimenti "" */
  function testo(v, max) {
    if (typeof v !== "string") return "";
    var s = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
    return s.length > max ? s.slice(0, max) : s;
  }
  function riga(v, max) { return testo(v, max).replace(/\s*\n\s*/g, " "); }
  function lista(v, max) { return Array.isArray(v) ? v.slice(0, max) : []; }
  function oggetto(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

  /* solo https:, senza nome utente e password; restituisce l'indirizzo normalizzato o "" */
  function urlHttps(v) {
    if (typeof v !== "string" || v.length > 2000) return "";
    var u;
    try { u = new URL(v.trim()); } catch (e) { return ""; }
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname) return "";
    return u.href;
  }

  /* immagine: solo il bucket pubblico prg-immagini (percorso <uid>/<32 hex>.ext, senza query né frammenti);
     opt.locale = pagina aperta da localhost → vale anche lo stack locale. Restituisce {url, alt} o null. */
  function immagine(o, opt) {
    if (!oggetto(o) || typeof o.url !== "string" || o.url.length > 400) return null;
    var u = o.url, resto = null;
    if (u.indexOf(IMG_PROD) === 0) resto = u.slice(IMG_PROD.length);
    else if (opt && opt.locale && u.indexOf(IMG_LOCALE) === 0) resto = u.slice(IMG_LOCALE.length);
    if (resto === null || !IMG_RESTO.test(resto)) return null;
    return { url: u, alt: riga(o.alt, 300) };
  }
  function colore(v) { return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : ""; }
  function tema(t) {
    if (!oggetto(t)) return null;
    var out = { stile: t.stile === "notte" ? "notte" : "carta" };
    ["accento", "fondo", "fondo2", "testo"].forEach(function (k) { var c = colore(t[k]); if (c) out[k] = c; });
    return out;
  }
  /* colori: mescola(a, b, t) = a*t + b*(1-t); luminanza WCAG; testo scuro o bianco da mettere SOPRA un colore */
  function rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function mescola(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return "#" + [0, 1, 2].map(function (i) { var n = Math.round(x[i] * t + y[i] * (1 - t)); return (n < 16 ? "0" : "") + n.toString(16); }).join("");
  }
  function luminanza(h) {
    var c = rgb(h).map(function (n) { n /= 255; return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function suColore(h) {
    var l = luminanza(h);
    return (l + 0.05) / (luminanza("#0b1220") + 0.05) >= 1.05 / (l + 0.05) ? "#0b1220" : "#ffffff";
  }
  /* le variabili CSS del tema scelto (coppie nome/valore); vuote se il tema usa solo i colori di serie */
  var BASE = { carta: { fondo: "#f5f4f0", testo: "#292620" }, notte: { fondo: "#0a1830", testo: "#f4f6fb" } };
  function proprietaTema(t) {
    var p = [];
    if (!t) return p;
    if (t.accento) { p.push(["--accent", t.accento]); p.push(["--su-accent", suColore(t.accento)]); p.push(["--on-accent", suColore(t.accento)]); }
    if (t.fondo) p.push(["--fondo", t.fondo]);
    if (t.fondo2) p.push(["--fondo2", t.fondo2]);
    if (t.testo || t.fondo) {
      var tx = t.testo || BASE[t.stile].testo, bg = t.fondo2 || t.fondo || BASE[t.stile].fondo;
      p.push(["--text", tx], ["--text-2", mescola(tx, bg, 0.82)], ["--text-3", mescola(tx, bg, 0.7)],
        ["--border", mescola(tx, bg, 0.24)], ["--surface", mescola(tx, bg, 0.07)]);
    }
    return p;
  }

  /* Il documento ripulito, o null se non è un documento v1. Non lancia mai. opt.locale: vedi immagine(). */
  function validaDati(d, opt) {
    if (!oggetto(d) || d.v !== 1) return null;
    var out = { v: 1, intestazione: null, sezioni: [], link: [] };
    if (oggetto(d.intestazione)) {
      var i = d.intestazione;
      out.intestazione = {
        sopratitolo: riga(i.sopratitolo, 200), titolo: riga(i.titolo, 200), titolo_corsivo: riga(i.titolo_corsivo, 200),
        righe: lista(i.righe, MAX_RIGHE).map(function (x) { return riga(x, 300); }).filter(Boolean),
        quando: riga(i.quando, 200)
      };
      /* campi della versione grafica: presenti solo se validi (un documento senza di loro esce com'era) */
      var logo = immagine(i.logo, opt);
      if (logo) out.intestazione.logo = logo;
      if (riga(i.nastro, 60)) out.intestazione.nastro = riga(i.nastro, 60);
      if (oggetto(i.data)) {
        var dt = { giorno: riga(i.data.giorno, 40), numero: riga(i.data.numero, 12), mese: riga(i.data.mese, 40), ora: riga(i.data.ora, 40) };
        if (dt.giorno || dt.numero || dt.mese || dt.ora) out.intestazione.data = dt;
      }
      if (oggetto(i.luogo)) {
        var lg = { nome: riga(i.luogo.nome, 200), indirizzo: riga(i.luogo.indirizzo, 300) };
        if (lg.nome || lg.indirizzo) out.intestazione.luogo = lg;
      }
    }
    var tm = tema(d.tema);
    if (tm) out.tema = tm;
    var cop = immagine(d.copertina, opt);
    if (cop) out.copertina = cop;
    lista(d.sezioni, MAX_SEZIONI).forEach(function (s) {
      if (!oggetto(s)) return;
      var base = { tipo: s.tipo, etichetta: riga(s.etichetta, 120), titolo: riga(s.titolo, 200) };
      if (s.tipo === "interpreti") {
        base.persone = lista(s.persone, MAX_ELENTO).filter(oggetto).map(function (p) {
          return { nome: riga(p.nome, 200), ruolo: riga(p.ruolo, 200) };
        }).filter(function (p) { return p.nome || p.ruolo; });
        base.nota = testo(s.nota, 2000);
        out.sezioni.push(base);
      } else if (s.tipo === "brani") {
        base.voci = lista(s.voci, MAX_ELENTO).filter(oggetto).map(function (v) {
          return { titolo: riga(v.titolo, 300), dettaglio: riga(v.dettaglio, 300), brani: testo(v.brani, 2000), nota: testo(v.nota, 2000) };
        }).filter(function (v) { return v.titolo || v.dettaglio || v.brani || v.nota; });
        out.sezioni.push(base);
      } else if (s.tipo === "testo") {
        base.paragrafi = lista(s.paragrafi, MAX_ELENTO).map(function (p) { return testo(p, 5000); }).filter(Boolean);
        out.sezioni.push(base);
      } else if (s.tipo === "immagine") {
        var im = immagine(s, opt);
        if (im) { base.url = im.url; base.alt = im.alt; base.didascalia = riga(s.didascalia, 300); out.sezioni.push(base); }
      } else if (s.tipo === "galleria") {
        base.immagini = [];
        lista(s.immagini, MAX_IMMAGINI).forEach(function (g) {
          var gi = immagine(g, opt);
          if (gi) base.immagini.push({ url: gi.url, alt: gi.alt, didascalia: riga(g.didascalia, 300) });
        });
        if (base.immagini.length) out.sezioni.push(base);
      }
      /* tipi sconosciuti: ignorati */
    });
    lista(d.link, MAX_LINK).forEach(function (l) {
      if (!oggetto(l)) return;
      var url = urlHttps(l.url);
      if (!url) return;
      out.link.push({ testo: riga(l.testo, 200) || url, url: url });
    });
    return out;
  }

  /* Il DOM del programma. `doc` = document (o una finta nei test): si usano solo createElement e createTextNode. */
  function costruisci(dati, doc, opt) {
    var v = validaDati(dati, opt);
    if (!v) return null;
    function el(tag, cls, txt) {
      var e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (txt) e.appendChild(doc.createTextNode(txt));
      return e;
    }
    function righeDi(parent, cls, t) {
      t.split("\n").forEach(function (r) { if (r) parent.appendChild(el("p", cls, r)); });
    }
    /* immagine: alt sempre presente (vuoto = decorativa); la galleria e le immagini sotto la prima schermata sono pigre */
    function img(cls, i, w, h2, pigra) {
      var e = el("img", cls);
      e.setAttribute("src", i.url);
      e.setAttribute("alt", i.alt || "");
      e.setAttribute("width", String(w));
      e.setAttribute("height", String(h2));
      e.setAttribute("decoding", "async");
      if (pigra) e.setAttribute("loading", "lazy");
      e.setAttribute("referrerpolicy", "no-referrer");
      return e;
    }
    function figura(cls, i, w, h2, pigra, didascalia) {
      var f = el("figure", cls);
      f.appendChild(img("prg-img", i, w, h2, pigra));
      if (didascalia) f.appendChild(el("figcaption", "prg-didascalia", didascalia));
      return f;
    }
    var radice = el("div", "prg-doc");
    var props = proprietaTema(v.tema);
    if (v.tema) radice.setAttribute("data-stile", v.tema.stile);
    if (radice.style && radice.style.setProperty) props.forEach(function (c) { radice.style.setProperty(c[0], c[1]); });
    if (v.copertina) radice.appendChild(figura("prg-copertina", v.copertina, 1600, 900, false, ""));
    var h = v.intestazione;
    if (h && (h.sopratitolo || h.titolo || h.titolo_corsivo || h.righe.length || h.quando || h.logo || h.nastro || h.data || h.luogo)) {
      var testa = el("header", "prg-testa");
      if (h.sopratitolo) testa.appendChild(el("p", "prg-sopra", h.sopratitolo));
      if (h.titolo || h.titolo_corsivo) {
        /* con il logo il titolo resta nel documento (h1 per chi legge con lo screen reader) ma non si vede */
        var t1 = el("h1", h.logo ? "prg-titolo prg-nascosto" : "prg-titolo");
        if (h.titolo) t1.appendChild(doc.createTextNode(h.titolo));
        if (h.titolo && h.titolo_corsivo) t1.appendChild(doc.createTextNode(" "));
        if (h.titolo_corsivo) t1.appendChild(el("em", null, h.titolo_corsivo));
        testa.appendChild(t1);
      }
      if (h.logo) {
        var lp = el("p", "prg-logo");
        lp.appendChild(img("prg-img", { url: h.logo.url, alt: h.titolo || h.titolo_corsivo ? "" : h.logo.alt }, 600, 300, false));
        testa.appendChild(lp);
      }
      if (h.nastro) { var nw = el("p", "prg-nastro-riga"); nw.appendChild(el("span", "prg-nastro", h.nastro)); testa.appendChild(nw); }
      if (h.data) {
        var bx = el("div", "prg-data");
        if (h.data.giorno) bx.appendChild(el("p", "prg-data-giorno", h.data.giorno));
        if (h.data.numero) bx.appendChild(el("p", "prg-data-numero", h.data.numero));
        if (h.data.mese) bx.appendChild(el("p", "prg-data-mese", h.data.mese));
        if (h.data.ora) bx.appendChild(el("p", "prg-data-ora", h.data.ora));
        testa.appendChild(bx);
      }
      if (h.luogo) {
        var lu = el("div", "prg-luogo");
        if (h.luogo.nome) lu.appendChild(el("p", "prg-luogo-nome", h.luogo.nome));
        if (h.luogo.indirizzo) lu.appendChild(el("p", "prg-luogo-ind", h.luogo.indirizzo));
        testa.appendChild(lu);
      }
      h.righe.forEach(function (r) { testa.appendChild(el("p", "prg-riga", r)); });
      if (h.quando) testa.appendChild(el("p", "prg-quando", h.quando));
      radice.appendChild(testa);
    }
    v.sezioni.forEach(function (s) {
      var sez = el("section", "prg-sez prg-sez-" + s.tipo);
      if (s.etichetta) sez.appendChild(el("p", "prg-etichetta", s.etichetta));
      if (s.titolo) sez.appendChild(el("h2", "prg-sez-titolo", s.titolo));
      if (s.tipo === "interpreti") {
        if (s.persone.length) {
          var ul = el("ul", "prg-persone");
          s.persone.forEach(function (p) {
            var li = el("li");
            if (p.nome) li.appendChild(el("span", "prg-nome", p.nome));
            if (p.ruolo) li.appendChild(el("span", "prg-ruolo", p.ruolo));
            ul.appendChild(li);
          });
          sez.appendChild(ul);
        }
        if (s.nota) righeDi(sez, "prg-nota", s.nota);
      } else if (s.tipo === "brani") {
        if (s.voci.length) {
          var ol = el("ol", "prg-voci");
          s.voci.forEach(function (x) {
            var li = el("li");
            if (x.titolo) li.appendChild(el("em", "prg-voce-titolo", x.titolo));
            if (x.dettaglio) li.appendChild(el("span", "prg-dettaglio", x.dettaglio));
            if (x.brani) righeDi(li, "prg-brani", x.brani);
            if (x.nota) righeDi(li, "prg-nota", x.nota);
            ol.appendChild(li);
          });
          sez.appendChild(ol);
        }
      } else if (s.tipo === "immagine") {
        sez.appendChild(figura("prg-fig", { url: s.url, alt: s.alt }, 1200, 900, true, s.didascalia));
      } else if (s.tipo === "galleria") {
        var gl = el("ul", "prg-galleria");
        /* scorre in orizzontale: raggiungibile anche da tastiera */
        gl.setAttribute("tabindex", "0");
        gl.setAttribute("role", "list");
        gl.setAttribute("aria-label", s.titolo || s.etichetta || "Galleria di immagini");
        s.immagini.forEach(function (g) {
          var li = el("li", "prg-galleria-voce");
          li.appendChild(figura("prg-fig", g, 1200, 900, true, g.didascalia));
          gl.appendChild(li);
        });
        sez.appendChild(gl);
      } else {
        s.paragrafi.forEach(function (p) { righeDi(sez, "prg-par", p); });
      }
      radice.appendChild(sez);
    });
    if (v.link.length) {
      var nav = el("nav", "prg-link");
      var ul2 = el("ul");
      v.link.forEach(function (l) {
        var li = el("li"), a = el("a", null, l.testo);
        a.setAttribute("href", l.url);
        a.setAttribute("rel", "noopener noreferrer");
        a.setAttribute("target", "_blank");
        li.appendChild(a);
        ul2.appendChild(li);
      });
      nav.appendChild(ul2);
      radice.appendChild(nav);
    }
    return radice;
  }

  /* il titolo della scheda del browser, dal documento ripulito */
  function titoloPagina(dati) {
    var v = validaDati(dati), h = v && v.intestazione;
    var t = h ? [h.titolo, h.titolo_corsivo].filter(Boolean).join(" ") : "";
    return t ? t + " — Programma di sala" : "Programma di sala";
  }

  var P = { API_PROD: API_PROD, ANON_PROD: ANON_PROD, IMG_PROD: IMG_PROD, configura: configura, validaDati: validaDati, urlHttps: urlHttps,
    costruisci: costruisci, titoloPagina: titoloPagina, proprietaTema: proprietaTema, suColore: suColore };
  root.PRGProgramma = P;
  if (typeof module === "object" && module && module.exports) module.exports = P;

  /* ================================================================== BROWSER */
  if (typeof document === "undefined" || typeof window === "undefined" || !document.getElementById) return;
  var app = document.getElementById("prg-app");
  if (!app) return;
  var cfg = configura(location.hostname, location.search);
  var slug = PRGI ? PRGI.slugDaIndirizzo(location.pathname, location.search) : null;

  function piede() {
    var p = document.createElement("p");
    p.className = "prg-piede";
    p.appendChild(document.createTextNode("Programma di sala realizzato con "));
    var a = document.createElement("a");
    a.setAttribute("href", "https://stageplot.it");
    a.setAttribute("rel", "noopener");
    a.appendChild(document.createTextNode("stageplot.it"));
    p.appendChild(a);
    return p;
  }
  /* il tema vale per tutta la pagina (sfondo compreso): classe e variabili sul <html>, solo via CSSOM */
  function applicaTema(t) {
    var r = document.documentElement;
    r.classList.remove("prg-notte", "prg-tinta");
    ["--accent", "--su-accent", "--on-accent", "--fondo", "--fondo2", "--text", "--text-2", "--text-3", "--border", "--surface"].forEach(function (k) { r.style.removeProperty(k); });
    if (!t) return;
    if (t.stile === "notte") r.classList.add("prg-notte");
    if (t.fondo || t.fondo2) r.classList.add("prg-tinta");
    proprietaTema(t).forEach(function (c) { r.style.setProperty(c[0], c[1]); });
  }
  function mostra(nodo, stato) {
    app.setAttribute("aria-busy", "false");
    app.setAttribute("data-stato", stato);
    while (app.firstChild) app.removeChild(app.firstChild);
    app.appendChild(nodo);
    app.appendChild(piede());
  }
  function messaggio(titolo, testoMsg, ritenta) {
    var d = document.createElement("div");
    d.className = "prg-msg";
    var h = document.createElement("h1");
    h.appendChild(document.createTextNode(titolo));
    var p = document.createElement("p");
    p.appendChild(document.createTextNode(testoMsg));
    d.appendChild(h); d.appendChild(p);
    if (ritenta) {
      var b = document.createElement("button");
      b.setAttribute("type", "button");
      b.className = "prg-btn";
      b.appendChild(document.createTextNode("Riprova"));
      b.addEventListener("click", carica);
      d.appendChild(b);
    }
    return d;
  }
  function conTimeout(url, opt) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    if (ctrl) opt.signal = ctrl.signal;
    return fetch(url, opt).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
  }
  function carica() {
    if (!slug) { mostra(messaggio("Programma non disponibile", "L'indirizzo non è valido."), "non-disponibile"); return; }
    app.setAttribute("aria-busy", "true");
    var c = document.createElement("p");
    c.className = "prg-carico";
    c.setAttribute("role", "status");
    c.appendChild(document.createTextNode("Carico il programma…"));
    while (app.firstChild) app.removeChild(app.firstChild);
    app.appendChild(c);
    conTimeout(cfg.api + "/rest/v1/rpc/prg_programma_pubblico", {
      method: "POST", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "apikey": cfg.anon, "Authorization": "Bearer " + cfg.anon, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug })
    }).then(function (res) {
      if (!res.ok) throw new Error("http " + res.status);
      return res.json();
    }).then(function (r) {
      var nodo = r && costruisci(r.dati, document, { locale: cfg.locale });
      if (!nodo) { mostra(messaggio("Programma non disponibile", "Questo programma non è ancora pubblicato o non esiste."), "non-disponibile"); return; }
      document.title = titoloPagina(r.dati);
      applicaTema(validaDati(r.dati, { locale: cfg.locale }).tema);
      mostra(nodo, "ok");
    }).catch(function () {
      mostra(messaggio("Non riesco a caricare il programma", "Controlla la connessione e riprova.", true), "errore");
    });
  }
  carica();
})(typeof globalThis !== "undefined" ? globalThis : this);
