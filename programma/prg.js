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

   SICUREZZA: il documento lo scrive un utente e lo legge chiunque. Si disegna SOLO con createElement/createTextNode/
   textContent (mai innerHTML); i link sono accettati solo se https:. validaDati() ripulisce ogni campo (tipo, lunghezza).
   Funzioni pure in testa (validaDati, costruisci, configura): le prova Node (test/programma-di-sala.test.mjs). */
(function (root) {
  "use strict";
  var API_PROD = "https://vsodplqkuvnsdiikvmjb.supabase.co";
  /* La stessa anon key della biglietteria e dell'editor: è pubblica per costruzione (decidono la RLS e i grant). */
  var ANON_PROD = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzb2RwbHFrdXZuc2RpaWt2bWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTkyNjksImV4cCI6MjA5ODE5NTI2OX0.rZmZSvOnrNY3cC2JQ8XnbMTKIfjP5WmtbCtQ6l8zPrc";
  var TIMEOUT_MS = 15000;
  var MAX_SEZIONI = 40, MAX_ELENTO = 300, MAX_LINK = 30, MAX_RIGHE = 20;
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

  /* Il documento ripulito, o null se non è un documento v1. Non lancia mai. */
  function validaDati(d) {
    if (!oggetto(d) || d.v !== 1) return null;
    var out = { v: 1, intestazione: null, sezioni: [], link: [] };
    if (oggetto(d.intestazione)) {
      var i = d.intestazione;
      out.intestazione = {
        sopratitolo: riga(i.sopratitolo, 200), titolo: riga(i.titolo, 200), titolo_corsivo: riga(i.titolo_corsivo, 200),
        righe: lista(i.righe, MAX_RIGHE).map(function (x) { return riga(x, 300); }).filter(Boolean),
        quando: riga(i.quando, 200)
      };
    }
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
  function costruisci(dati, doc) {
    var v = validaDati(dati);
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
    var radice = el("div", "prg-doc");
    var h = v.intestazione;
    if (h && (h.sopratitolo || h.titolo || h.titolo_corsivo || h.righe.length || h.quando)) {
      var testa = el("header", "prg-testa");
      if (h.sopratitolo) testa.appendChild(el("p", "prg-sopra", h.sopratitolo));
      if (h.titolo || h.titolo_corsivo) {
        var t1 = el("h1", "prg-titolo");
        if (h.titolo) t1.appendChild(doc.createTextNode(h.titolo));
        if (h.titolo && h.titolo_corsivo) t1.appendChild(doc.createTextNode(" "));
        if (h.titolo_corsivo) t1.appendChild(el("em", null, h.titolo_corsivo));
        testa.appendChild(t1);
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

  var P = { API_PROD: API_PROD, ANON_PROD: ANON_PROD, configura: configura, validaDati: validaDati, urlHttps: urlHttps,
    costruisci: costruisci, titoloPagina: titoloPagina };
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
      var nodo = r && costruisci(r.dati, document);
      if (!nodo) { mostra(messaggio("Programma non disponibile", "Questo programma non è ancora pubblicato o non esiste."), "non-disponibile"); return; }
      document.title = titoloPagina(r.dati);
      mostra(nodo, "ok");
    }).catch(function () {
      mostra(messaggio("Non riesco a caricare il programma", "Controlla la connessione e riprova.", true), "errore");
    });
  }
  carica();
})(typeof globalThis !== "undefined" ? globalThis : this);
