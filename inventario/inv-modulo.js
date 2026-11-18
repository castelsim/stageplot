/* Inventario — modulo di comodato compilato (dopo la consegna fatta dalla pagina del QR). Solo nel browser: niente server, niente mail.
   Dal «Consegna a…» esce un foglio A4 già compilato da far firmare a chi prende lo strumento, con due uscite dallo STESSO modello dati:
   «Stampa» (foglio HTML in mm, window.print) e «Condividi» / «Scarica PDF» (vero PDF con jsPDF, già nel sito: /vendor/pdf.min.js).
   Il repo è pubblico: nel codice c'è solo il testo GENERICO del modulo. Intestazione, nome dell'ente, luogo, piè, logo e versione stanno nel DB,
   per inventario (colonna `modulo`, impostata dal proprietario); senza, il foglio esce generico col nome dell'inventario.
   Dati personali: il nome del genitore e le firme restano a penna; il PDF nasce nel telefono e non passa da nessun server.
   Funzioni pure in testa (le prova Node: test/engines.test.mjs); si disegna SOLO con createElement/textContent (mai innerHTML). */
(function (root) {
  "use strict";
  var MAX_ASSEGNATO = 120, MAX_NOTA = 500;
  var VERSIONE_GENERICA = "v1 · 17/11/2026";
  var ACCENTO = "#C09A5B";
  var CODICE = /^[A-Z]{2,5}-[0-9]{3,5}$/;

  function pulito(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : ""; }
  /* nel foglio non entrano mai parentesi graffe: i segnaposto sono solo nostri */
  function senzaGraffe(v, max) { return pulito(v, max).replace(/[{}]/g, ""); }
  function data(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; }
  function gmA(d) { return d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : ""; }

  /* ---- consegna: «Nome Cognome, Corso» e nota «Accessori: …» ---- */
  /* le virgole separano il corso: dentro nome, cognome e corso diventano spazi (così la ricostruzione è sempre leggibile) */
  function senzaVirgole(v, max) { return pulito(v, max).replace(/,/g, " ").replace(/\s+/g, " ").trim(); }
  function componiAssegnato(nome, cognome, corso) {
    var n = [senzaVirgole(nome, MAX_ASSEGNATO), senzaVirgole(cognome, MAX_ASSEGNATO)].filter(Boolean).join(" "), c = senzaVirgole(corso, MAX_ASSEGNATO);
    return (c ? n + ", " + c : n).slice(0, MAX_ASSEGNATO).trim();
  }
  function notaConsegna(acc, nota) {
    var a = pulito(acc, MAX_NOTA).replace(/ · /g, " "), n = pulito(nota, MAX_NOTA);
    var s = a ? "Accessori: " + a + (n ? " · " + n : "") : n;
    return s.slice(0, MAX_NOTA);
  }
  function leggiAccessori(nota) {
    var m = /^Accessori: (.*?)(?: · |$)/.exec(typeof nota === "string" ? nota : "");
    return m ? m[1].trim() : "";
  }
  /* il contrario di componiAssegnato (per la ristampa): corso dopo l'ultima «, »; nome = prima parola, cognome = il resto */
  function daAssegnato(s) {
    s = pulito(s, MAX_ASSEGNATO);
    var i = s.lastIndexOf(", "), corso = "", persona = s;
    if (i >= 0) { corso = s.slice(i + 2).trim(); persona = s.slice(0, i).trim(); }
    var sp = persona.indexOf(" ");
    return sp < 0 ? { nome: persona, cognome: "", corso: corso } : { nome: persona.slice(0, sp), cognome: persona.slice(sp + 1).trim(), corso: corso };
  }

  /* ---- configurazione dell'ente (colonna `modulo`, solo membri): whitelist e lunghezze ---- */
  var LOGO = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/]+=*$/;
  function pulisciModulo(m) {
    if (m === null || typeof m !== "object" || Array.isArray(m)) return null;
    var piede = (Array.isArray(m.piede) ? m.piede : []).slice(0, 3).map(function (r) { return senzaGraffe(r, 140); }).filter(Boolean);
    var logo = typeof m.logo === "string" && m.logo.length <= 100000 && LOGO.test(m.logo) ? m.logo : "";
    return {
      ente: senzaGraffe(m.ente, 120), ente_breve: senzaGraffe(m.ente_breve, 60), registro: senzaGraffe(m.registro, 40), intestazione: senzaGraffe(m.intestazione, 80),
      colore: typeof m.colore === "string" && /^#[0-9a-fA-F]{6}$/.test(m.colore) ? m.colore.toLowerCase() : "",
      luogo: senzaGraffe(m.luogo, 60), firma_ente: senzaGraffe(m.firma_ente, 60), piede: piede, versione: senzaGraffe(m.versione, 40), logo: logo
    };
  }

  /* ---- il modello dati unico per le due rese ---- */
  function datiModulo(scheda, membro, modulo, form) {
    scheda = scheda && typeof scheda === "object" ? scheda : {}; form = form && typeof form === "object" ? form : {};
    var mod = modulo ? pulisciModulo(modulo) : null; if (!mod) mod = pulisciModulo({}) ;
    var nomeInv = senzaGraffe(scheda.inventario, 80) || "l'ente";
    var strumento = [senzaGraffe(scheda.singolare, 40), senzaGraffe(scheda.modello, 120)].filter(Boolean).join(" · ");
    var cod = typeof scheda.codice === "string" ? scheda.codice.toUpperCase() : "";
    var iso = data(form.data);
    return {
      ente: mod.ente || nomeInv, enteBreve: mod.ente_breve || mod.ente || nomeInv, registro: mod.registro || "dell'ente",
      intestazione: mod.intestazione, colore: mod.colore || ACCENTO, logo: mod.logo, firmaEnte: mod.firma_ente || (mod.ente_breve || nomeInv).toUpperCase(),
      piede: mod.piede, versione: mod.versione || VERSIONE_GENERICA, luogo: senzaGraffe(form.luogo != null ? form.luogo : mod.luogo, 60),
      codice: CODICE.test(cod) ? cod : "", strumento: senzaGraffe(form.strumento != null ? form.strumento : strumento, 160),
      nome: senzaGraffe(form.nome, 60), cognome: senzaGraffe(form.cognome, 60), corso: senzaGraffe(form.corso, 120), accessori: senzaGraffe(form.accessori, 240),
      dataIso: iso, data: gmA(iso), personalizzato: !!(modulo && (mod.ente || mod.intestazione || mod.logo || mod.piede.length))
    };
  }
  /* le frasi finali, con i segnaposto già sostituiti (testo identico a quello approvato nel modulo cartaceo). {t, b} = testo e grassetto. */
  function testiModulo(d) {
    var ins = d.accessori ? "Accessori consegnati" : "Accessori consegnati (alimentatore, custodia, bacchette, cavalletto…)";
    return {
      titolo: "COMODATO D'USO GRATUITO DI STRUMENTO MUSICALE",
      apertura: [{ t: "Con la presente si attesta che in data " + (d.data || "………………………………") + " " + d.ente + " consegna " }, { t: "in comodato d'uso gratuito", b: true }, { t: " all'allievo:" }],
      nome: "Nome", cognome: "Cognome", corso: "Corso / classe",
      strumentoIntro: "il seguente strumento:",
      codiceEt: d.codice ? "Codice sull'etichetta" : "Codice sull'etichetta (es. TAS-003)", strumentoEt: "Strumento e modello", accessoriEt: ins,
      uso: "ad uso di studio nella propria abitazione.",
      clausole: [
        [{ t: "Lo strumento dovrà essere restituito, con i suoi accessori, tassativamente alla fine del corso/anno accademico, oppure in qualsiasi momento su richiesta di " + d.enteBreve + "." }],
        [{ t: "L'allievo (o il genitore, per i minori) si impegna a custodire lo strumento con cura. " }, { t: "In caso di danneggiamento, smarrimento o mancata riconsegna, lo strumento dovrà essere pagato per l'intero costo.", b: true }],
        [{ t: "Il codice dello strumento e il nome dell'allievo sono registrati nell'inventario " + d.registro + "." }]
      ],
      luogoDataEt: "Luogo e data", luogoData: [d.luogo, d.data].filter(Boolean).join(", "),
      infede: "In fede", firmaEnte: d.firmaEnte, firmaAllievo: "ALLIEVO (o genitore per i minori)",
      piede: d.piede.slice(), versione: d.versione + " · 1 di 1"
    };
  }
  function nomeFile(codice, dataIso) {
    var c = typeof codice === "string" && CODICE.test(codice.toUpperCase()) ? codice.toUpperCase() : "strumento", dt = data(dataIso);
    return "Modulo comodato " + c + (dt ? " " + dt : "") + ".pdf";
  }
  function testoPiano(T) { /* tutte le frasi del foglio in fila (per i confronti nelle prove) */
    var s = function (a) { return a.map(function (x) { return x.t; }).join(""); };
    return [T.titolo, s(T.apertura), T.strumentoIntro, T.uso].concat(T.clausole.map(s), [T.infede, T.firmaEnte, T.firmaAllievo], T.piede, [T.versione]).join("\n");
  }
  function lungo(d) { return (d.nome + d.cognome + d.corso + d.strumento + d.accessori).length; }

  var P = { componiAssegnato: componiAssegnato, notaConsegna: notaConsegna, leggiAccessori: leggiAccessori, daAssegnato: daAssegnato, pulisciModulo: pulisciModulo,
    datiModulo: datiModulo, testiModulo: testiModulo, nomeFile: nomeFile, testoPiano: testoPiano, VERSIONE_GENERICA: VERSIONE_GENERICA };

  /* ================================================================== BROWSER */
  if (typeof document !== "undefined") {
    var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

    /* ---- resa 1: il foglio HTML in mm (visibile solo in stampa, vedi inv.css) ---- */
    P.foglioStampa = function (d) {
      var T = testiModulo(d), old = document.getElementById("inv-foglio"); if (old && old.parentNode) old.parentNode.removeChild(old);
      var f = el("div", "inv-foglio" + (lungo(d) > 520 ? " fittissimo" : lungo(d) > 240 ? " fitto" : "")); f.id = "inv-foglio"; f.setAttribute("aria-hidden", "true");
      /* il colore d'accento: la CSP non ammette stili in linea (nemmeno via CSSOM su WebKit), quindi un foglio di stile costruito (validato: solo #rrggbb) */
      try {
        if (typeof CSSStyleSheet === "function" && /^#[0-9a-f]{6}$/i.test(d.colore)) {
          var sh = P._fogli || (P._fogli = new CSSStyleSheet()); sh.replaceSync("#inv-foglio{--acc:" + d.colore + "}");
          if (document.adoptedStyleSheets && document.adoptedStyleSheets.indexOf(sh) < 0) document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sh]);
        }
      } catch (e) { /* senza: resta l'accento di serie */ }
      if (d.logo || d.intestazione) {
        var testa = el("div", "f-testa");
        if (d.logo) { var im = el("img", "f-logo"); im.alt = ""; im.src = d.logo; testa.appendChild(im); }
        var nm = el("div", "f-nome");
        d.intestazione.split("·").forEach(function (pezzo, i) { if (i > 0) nm.appendChild(el("b", "", "·")); if (pezzo) nm.appendChild(document.createTextNode(pezzo)); });
        testa.appendChild(nm); f.appendChild(testa);
      }
      f.appendChild(el("h1", "f-titolo", T.titolo));
      var segmenti = function (tag, segs) { var p = el(tag, "f-p"); segs.forEach(function (s) { p.appendChild(s.b ? el("b", "", s.t) : document.createTextNode(s.t)); }); return p; };
      var campo = function (etichetta, valore, cls) { var c = el("div", "f-campo" + (cls ? " " + cls : "")); c.appendChild(el("span", "f-et", etichetta)); c.appendChild(el("span", "f-val", valore)); return c; };
      var riga = function (a) { var r = el("div", "f-riga"); a.forEach(function (x) { r.appendChild(x); }); return r; };
      f.appendChild(segmenti("p", T.apertura));
      f.appendChild(riga([campo(T.nome, d.nome), campo(T.cognome, d.cognome)]));
      f.appendChild(riga([campo(T.corso, d.corso)]));
      f.appendChild(el("p", "f-p", T.strumentoIntro));
      f.appendChild(riga([campo(T.codiceEt, d.codice, "stretto"), campo(T.strumentoEt, d.strumento)]));
      f.appendChild(riga([campo(T.accessoriEt, d.accessori)]));
      f.appendChild(el("p", "f-p", T.uso));
      T.clausole.forEach(function (c) { f.appendChild(segmenti("p", c)); });
      f.appendChild(riga([campo(T.luogoDataEt, T.luogoData, "meta")]));
      f.appendChild(el("p", "f-p f-fede", T.infede));
      var firme = el("div", "f-firme");
      [T.firmaEnte, T.firmaAllievo].forEach(function (x) { var b = el("div", "f-firma"); b.appendChild(el("span", "", x)); b.appendChild(el("div", "f-linea")); firme.appendChild(b); });
      f.appendChild(firme);
      var pie = el("div", "f-piede"); T.piede.forEach(function (r) { pie.appendChild(el("div", "", r)); }); pie.appendChild(el("div", "f-ver", T.versione)); f.appendChild(pie);
      document.body.appendChild(f); document.documentElement.classList.add("inv-stampa-modulo"); return f;
    };

    P.togliFoglio = function () { var o = document.getElementById("inv-foglio"); if (o && o.parentNode) o.parentNode.removeChild(o); document.documentElement.classList.remove("inv-stampa-modulo"); };

    /* ---- resa 2: il PDF vero con jsPDF (Times/Helvetica standard: à è é ì ò ù · … ’ sono in WinAnsi) ---- */
    var rgb = function (h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; };
    var impostaColore = function (doc, c) { doc.setTextColor(c[0], c[1], c[2]); };
    /* righe di parole con grassetti, spezzando le parole più lunghe della riga; ritorna le righe [{parole:[{w,b,x}], larg}] */
    function righe(doc, segs, larg, size) {
      var parole = []; segs.forEach(function (s) { s.t.split(/\s+/).filter(Boolean).forEach(function (w) { parole.push({ w: w, b: !!s.b }); }); });
      doc.setFontSize(size); doc.setFont("times", "normal"); var sp = doc.getTextWidth(" ");
      var out = [], riga = { parole: [], larg: 0 };
      var misura = function (p) { doc.setFont("times", p.b ? "bold" : "normal"); return doc.getTextWidth(p.w); };
      parole.forEach(function (p) {
        var wd = misura(p);
        while (wd > larg) { /* parola più larga della riga: si taglia a caratteri */
          var n = p.w.length; while (n > 1 && misura({ w: p.w.slice(0, n), b: p.b }) > larg) n--;
          if (riga.parole.length) { out.push(riga); riga = { parole: [], larg: 0 }; }
          out.push({ parole: [{ w: p.w.slice(0, n), b: p.b, wd: misura({ w: p.w.slice(0, n), b: p.b }) }], larg: misura({ w: p.w.slice(0, n), b: p.b }) });
          p = { w: p.w.slice(n), b: p.b }; wd = misura(p);
        }
        var nuova = riga.larg + (riga.parole.length ? sp : 0) + wd;
        if (riga.parole.length && nuova > larg) { out.push(riga); riga = { parole: [], larg: 0 }; nuova = wd; }
        riga.parole.push({ w: p.w, b: p.b, wd: wd }); riga.larg = nuova;
      });
      if (riga.parole.length) out.push(riga);
      return { righe: out, sp: sp };
    }
    function paragrafo(doc, segs, x, y, larg, size, giustifica, interlinea) {
      var R = righe(doc, segs, larg, size);
      R.righe.forEach(function (r, i) {
        var extra = giustifica && i < R.righe.length - 1 && r.parole.length > 1 ? (larg - r.larg) / (r.parole.length - 1) : 0, cx = x;
        r.parole.forEach(function (p) { doc.setFont("times", p.b ? "bold" : "normal"); doc.setFontSize(size); doc.text(p.w, cx, y + i * interlinea); cx += p.wd + R.sp + extra; });
      });
      return y + R.righe.length * interlinea;
    }
    /* il campo: etichetta piccola sopra, valore sotto con filo a puntini; ritorna l'altezza usata */
    function campoPdf(doc, etichetta, valore, x, y, larg, size) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); impostaColore(doc, [85, 85, 85]); doc.text(etichetta, x, y);
      doc.setFont("times", "normal"); doc.setFontSize(size); impostaColore(doc, [0, 0, 0]);
      var linee = valore ? doc.splitTextToSize(valore, larg) : [""], h = size * 0.4 * 1.25;
      linee.forEach(function (l, i) { doc.text(l, x, y + 5.2 + i * h); });
      var yl = y + 5.2 + (linee.length - 1) * h + 1.3;
      doc.setDrawColor(0); doc.setLineWidth(0.25); doc.setLineDashPattern([0.3, 0.8], 0); doc.line(x, yl, x + larg, yl); doc.setLineDashPattern([], 0);
      return yl - y;
    }
    function disegna(doc, d, T, size, logo) {
      var X = 20, L = 170, y = 15, inter = size * 0.4 * 1.42, col = rgb(d.colore);
      if (logo || d.intestazione) {
        var h = logo ? 28 : 0, w = logo ? h * logo.rapporto : 0, nome = d.intestazione, ns = 21;
        doc.setFont("times", "normal");
        var larghN = function (s) { doc.setFontSize(s); var tot = 0; nome.split("").forEach(function (c) { tot += doc.getTextWidth(c) + 0.9; }); return tot; };
        var maxN = L - w - (logo ? 6 : 0); while (ns > 10 && larghN(ns) > maxN) ns -= 0.5;
        var gruppo = w + (logo && nome ? 6 : 0) + (nome ? larghN(ns) : 0), x0 = 105 - gruppo / 2;
        if (logo) doc.addImage(logo.url, logo.formato, x0, y, w, h);
        if (nome) {
          var cx = x0 + w + (logo ? 6 : 0), yb = y + (h ? h / 2 + 2.5 : 7); doc.setFontSize(ns);
          nome.split("").forEach(function (c) { doc.setFont("times", c === "·" ? "bold" : "normal"); impostaColore(doc, c === "·" ? col : [17, 17, 17]); doc.text(c, cx, yb); cx += doc.getTextWidth(c) + 0.9; });
        }
        y += Math.max(h, 10) + 3.5; doc.setDrawColor(col[0], col[1], col[2]); doc.setLineWidth(0.5); doc.line(X, y, X + L, y); y += 8;
      }
      impostaColore(doc, [0, 0, 0]);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.text(T.titolo, 105, y, { align: "center" }); y += 8.5;
      y = paragrafo(doc, T.apertura, X, y, L, size, true, inter) + 2.5;
      var m = (L - 8) / 2;
      var h1 = Math.max(campoPdf(doc, T.nome, d.nome, X, y, m, size), campoPdf(doc, T.cognome, d.cognome, X + m + 8, y, m, size)); y += h1 + 5;
      y += campoPdf(doc, T.corso, d.corso, X, y, L, size) + 5;
      y = paragrafo(doc, [{ t: T.strumentoIntro }], X, y, L, size, false, inter) + 1.5;
      var a = 56, b = L - a - 8, h2 = Math.max(campoPdf(doc, T.codiceEt, d.codice, X, y, a, size), campoPdf(doc, T.strumentoEt, d.strumento, X + a + 8, y, b, size)); y += h2 + 5;
      y += campoPdf(doc, T.accessoriEt, d.accessori, X, y, L, size) + 5;
      y = paragrafo(doc, [{ t: T.uso }], X, y, L, size, false, inter) + 2;
      T.clausole.forEach(function (c) { y = paragrafo(doc, c, X, y, L, size, true, inter) + 2.2; });
      y += 2; y += campoPdf(doc, T.luogoDataEt, T.luogoData, X, y, 90, size) + 6;
      y = paragrafo(doc, [{ t: T.infede }], X, y, L, size, false, inter) + 3;
      var yf = y + 6; doc.setFont("helvetica", "normal"); doc.setFontSize(10); impostaColore(doc, [0, 0, 0]);
      doc.text(T.firmaEnte, X, y); doc.text(T.firmaAllievo, X + 87, y);
      doc.setDrawColor(0); doc.setLineWidth(0.25); doc.setLineDashPattern([0.3, 0.8], 0); doc.line(X, yf + 8, X + 80, yf + 8); doc.line(X + 87, yf + 8, X + 87 + 83, yf + 8); doc.setLineDashPattern([], 0);
      var fine = yf + 10;
      /* piè: filetto grigio + righe centrate, sempre in fondo (il margine basso resta ≥ 15 mm) */
      var righePie = T.piede.concat([T.versione]), top = 297 - 15 - 3.6 * righePie.length - 2.5;
      doc.setDrawColor(150); doc.setLineWidth(0.25); doc.line(X, top, X + L, top);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); impostaColore(doc, [51, 51, 51]);
      righePie.forEach(function (r, i) { doc.text(doc.splitTextToSize(r, L)[0], 105, top + 3.9 + i * 3.6, { align: "center" }); });
      return { fine: fine, limite: top - 3 };
    }
    /* il PDF come File; `logo` = {url, formato, rapporto} già decodificato (così la costruzione è sincrona) */
    P.pdfModulo = function (d, logo) {
      var J = root.jspdf && root.jspdf.jsPDF; if (!J) throw new Error("jsPDF non caricato");
      var T = testiModulo(d), doc = null, r;
      [11, 10.5, 10, 9.5, 9, 8.5].some(function (sz) {
        doc = new J({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
        doc.setProperties({ title: "Modulo di comodato", creator: "stageplot.it" });
        r = disegna(doc, d, T, sz, logo); return r.fine <= r.limite;
      });
      var nome = nomeFile(d.codice, d.dataIso);
      return { file: new File([doc.output("arraybuffer")], nome, { type: "application/pdf" }), pagine: doc.getNumberOfPages() };
    };
    /* decodifica il logo una volta sola (dimensioni per il rapporto) e lo APPIATTISCE su bianco: un PNG trasparente salvato come JPEG ha lo sfondo nero
       (un quadrato scuro intorno al logo, 18/11). I loghi già salvati così si riparano qui: se i quattro angoli sono scuri, il nero collegato ai bordi diventa bianco. */
    function appiattisci(im) {
      try {
        var w = im.naturalWidth, hh = im.naturalHeight; if (!w || !hh || w * hh > 4000000) return null;
        var cv = document.createElement("canvas"); cv.width = w; cv.height = hh; var g = cv.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, w, hh); g.drawImage(im, 0, 0);
        var dt = g.getImageData(0, 0, w, hh), px = dt.data;
        var scuro = function (i) { return px[i] < 60 && px[i + 1] < 60 && px[i + 2] < 60; };
        var ang = [0, (w - 1) * 4, (hh - 1) * w * 4, ((hh - 1) * w + w - 1) * 4];
        if (ang.every(function (i) { return scuro(i); })) {
          var vis = new Uint8Array(w * hh), pila = [], mettiB = function (x, y) { if (x < 0 || y < 0 || x >= w || y >= hh) return; var k = y * w + x; if (vis[k] || !scuro(k * 4)) return; vis[k] = 1; pila.push(k); };
          for (var x = 0; x < w; x++) { mettiB(x, 0); mettiB(x, hh - 1); } for (var y = 0; y < hh; y++) { mettiB(0, y); mettiB(w - 1, y); }
          while (pila.length) { var k = pila.pop(), xx = k % w, yy = (k - xx) / w; px[k * 4] = px[k * 4 + 1] = px[k * 4 + 2] = 255; mettiB(xx + 1, yy); mettiB(xx - 1, yy); mettiB(xx, yy + 1); mettiB(xx, yy - 1); }
          g.putImageData(dt, 0, 0);
        }
        return cv.toDataURL("image/png");
      } catch (e) { return null; }
    }
    P.leggiLogo = function (url) {
      return new Promise(function (res) {
        if (!url) return res(null);
        var im = new Image(); im.onload = function () {
          var piatto = appiattisci(im);
          res({ url: piatto || url, formato: piatto || /^data:image\/png/.test(url) ? "PNG" : "JPEG", rapporto: im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 1 });
        };
        im.onerror = function () { res(null); }; im.src = url;
      });
    };
    var libPromessa = null;
    P.caricaPdf = function () {
      if (root.jspdf && root.jspdf.jsPDF) return Promise.resolve();
      if (libPromessa) return libPromessa;
      libPromessa = new Promise(function (res, rej) {
        var s = document.createElement("script"); s.src = "/vendor/pdf.min.js"; s.async = true;
        s.onload = function () { if (root.jspdf && root.jspdf.jsPDF) res(); else { libPromessa = null; rej(new Error("jsPDF non disponibile")); } };
        s.onerror = function () { libPromessa = null; rej(new Error("librerie PDF non raggiungibili")); };
        document.head.appendChild(s);
      });
      return libPromessa;
    };

    /* ---- la carta «Modulo di comodato»: campi modificabili solo per il foglio, Stampa / Condividi (o Scarica PDF) / Fine ----
       opz: { scheda, membro, modulo, form:{nome,cognome,corso,accessori,data,luogo}, fine: function, fineEtichetta } */
    P.cartaModulo = function (opz) {
      var c = el("section", "inv-carta inv-modulo-carta"); c.id = "inv-modulo";
      var testa = el("div", "inv-form-testa"); testa.appendChild(el("b", "", "Modulo di comodato")); c.appendChild(testa);
      c.appendChild(el("p", "inv-nota inv-modulo-nota", "Controlla i dati e fai firmare il foglio a chi prende lo strumento. Le modifiche valgono solo per il foglio: non cambiano l'inventario."));
      var form = {}, vals = {}, campi = [["nome", "Nome", 60], ["cognome", "Cognome", 60], ["corso", "Corso / classe", 120], ["strumento", "Strumento e modello", 160], ["accessori", "Accessori consegnati", 240], ["luogo", "Luogo", 60]];
      var base = datiModulo(opz.scheda, opz.membro, opz.modulo, opz.form || {});
      vals = { nome: base.nome, cognome: base.cognome, corso: base.corso, strumento: base.strumento, accessori: base.accessori, luogo: base.luogo, data: base.dataIso };
      var libro = null, pronto = null, ultimo = null, timer = null, stato = el("p", "inv-esito inv-modulo-stato"); stato.setAttribute("role", "status");
      function dati() { return datiModulo(opz.scheda, opz.membro, opz.modulo, vals); }
      function fogli() { P.foglioStampa(dati()); }
      var griglia = el("div", "inv-griglia"), ws = {}; c.appendChild(griglia);
      campi.forEach(function (k) {
        var w = el("div", "inv-campo" + (k[0] === "strumento" || k[0] === "accessori" || k[0] === "luogo" ? " tutta" : "")), l = el("label", "", k[1]), i = el("input"); i.type = "text"; i.maxLength = k[2]; i.value = vals[k[0]]; i.autocomplete = "off"; i.id = "inv-mod-" + k[0]; l.setAttribute("for", i.id);
        i.addEventListener("input", function () { vals[k[0]] = i.value; fogli(); sporco(); }); w.appendChild(l); w.appendChild(i); griglia.appendChild(w); ws[k[0]] = w;
      });
      var wd = el("div", "inv-campo"), ld = el("label", "", "Data"), idt = el("input"); idt.type = "date"; idt.id = "inv-mod-data"; idt.value = vals.data; ld.setAttribute("for", idt.id);
      idt.addEventListener("input", function () { vals.data = idt.value; fogli(); sporco(); }); wd.appendChild(ld); wd.appendChild(idt); griglia.insertBefore(wd, ws.strumento);
      testa.appendChild(el("span", "", base.codice || "—"));
      var bott = el("div", "inv-modulo-bott");
      var bStampa = el("button", "btn primario grande", "Stampa"); bStampa.type = "button"; bStampa.id = "inv-mod-stampa";
      var bCond = el("button", "btn grande", "Condividi"); bCond.type = "button"; bCond.id = "inv-mod-condividi"; bCond.disabled = true;
      var bFine = el("button", "btn testo", opz.fineEtichetta || "Fine"); bFine.type = "button"; bFine.id = "inv-mod-fine";
      bott.appendChild(bStampa); bott.appendChild(bCond); bott.appendChild(bFine); c.appendChild(bott); c.appendChild(stato);
      c.appendChild(el("p", "inv-nota", "Nome del genitore e firme vanno a penna. Dopo la stampa cancella il PDF dal telefono: l'originale è il foglio firmato."));

      function costruisci() { return P.pdfModulo(dati(), libro).file; }
      function puoCondividere(f) { try { return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [f] }); } catch (e) { return false; } }
      function sporco() { ultimo = null; }
      function prepara() { /* il file si prepara in anticipo e a ogni modifica (300 ms): il clic su «Condividi» non aspetta niente, così iOS non perde il gesto */
        if (!libro && libro !== false) return; try { pronto = costruisci(); ultimo = dati(); } catch (e) { pronto = null; }
        if (pronto) bCond.textContent = puoCondividere(pronto) ? "Condividi" : "Scarica PDF";
      }
      var rimanda = function () { clearTimeout(timer); timer = setTimeout(prepara, 300); };
      c.addEventListener("input", rimanda);
      fogli();
      P.caricaPdf().then(function () { return P.leggiLogo(base.logo); }).then(function (lg) {
        libro = lg || false; prepara(); bCond.disabled = !pronto;
        if (!pronto) stato.textContent = "Il PDF non si prepara: puoi sempre usare «Stampa».";
      }, function () { stato.textContent = "Il PDF non si carica ora (connessione): puoi usare «Stampa»."; });
      bStampa.addEventListener("click", function () { fogli(); window.print(); });
      function scarica(f) {
        var u = URL.createObjectURL(f), a = el("a"); a.href = u; a.download = f.name; a.rel = "noopener"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
      }
      bCond.addEventListener("click", function () {
        stato.textContent = ""; clearTimeout(timer);
        var f; try { f = ultimo && pronto ? pronto : costruisci(); pronto = f; ultimo = dati(); } catch (e) { stato.textContent = "Non riesco a preparare il PDF: usa «Stampa»."; return; }
        if (!puoCondividere(f)) { scarica(f); return; }
        navigator.share({ files: [f], title: "Modulo di comodato" }).then(null, function (e) { if (e && e.name === "AbortError") return; scarica(f); });
      });
      bFine.addEventListener("click", function () { clearTimeout(timer); P.togliFoglio(); if (opz.fine) opz.fine(); });
      return c;
    };
  }

  root.INVModulo = P;
  if (typeof module === "object" && module && module.exports) module.exports = P;
})(typeof globalThis !== "undefined" ? globalThis : this);
