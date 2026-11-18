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
  /* Il foglio è IDENTICO al Word di AVA («Modulo comodato strumenti AVA ok.docx», 18/11/2026): stesse frasi, stesse etichette, stessi puntini (numero di «…» per riga);
     dove l'app ha il dato, il valore sta sulla riga AL POSTO dei puntini. Senza versione e senza «1 di N»: il piè è solo l'indirizzo dell'ente (le righe `piede` del DB). */
  var PUNTI = { data: 12, nome: 16, cognome: 17, corso: 29, codice: 6, strumento: 12, accessori: 13, luogo: 17, firma: 15 };
  function puntini(n) { return new Array(n + 1).join("…"); }
  /* le frasi, con i segnaposto già sostituiti. {t, b} = testo e grassetto. */
  function testiModulo(d) {
    return {
      titolo: "COMODATO D'USO GRATUITO DI STRUMENTO MUSICALE",
      apertura: [{ t: "Con la presente si attesta che in data " + (d.data || puntini(PUNTI.data)) + " " + d.ente + " consegna " }, { t: "in comodato d'uso gratuito", b: true }, { t: " all'allievo:" }],
      nome: "Nome", cognome: "Cognome", corso: "Corso / classe",
      strumentoIntro: "il seguente strumento:",
      codiceEt: "Codice sull'etichetta (es. TAS-003)", strumentoEt: "Strumento e modello", accessoriEt: "Accessori consegnati (alimentatore, custodia, bacchette, cavalletto…)",
      uso: "ad uso di studio nella propria abitazione.",
      clausole: [
        [{ t: "Lo strumento dovrà essere restituito, con i suoi accessori, tassativamente alla fine del corso/anno accademico, oppure in qualsiasi momento su richiesta di " + d.enteBreve + "." }],
        [{ t: "L'allievo (o il genitore, per i minori) si impegna a custodire lo strumento con cura. " }, { t: "In caso di danneggiamento, smarrimento o mancata riconsegna, lo strumento dovrà essere pagato per l'intero costo.", b: true }],
        [{ t: "Il codice dello strumento e il nome dell'allievo sono registrati nell'inventario " + d.registro + "." }]
      ],
      luogoDataEt: "Luogo e data", luogoData: [d.luogo, d.data].filter(Boolean).join(", "),
      infede: "In fede", firmaEnte: d.firmaEnte, firmaAllievo: "ALLIEVO (o genitore per i minori)",
      piede: d.piede.slice(0, 2)
    };
  }
  function nomeFile(codice, dataIso) {
    var c = typeof codice === "string" && CODICE.test(codice.toUpperCase()) ? codice.toUpperCase() : "strumento", dt = data(dataIso);
    return "Modulo comodato " + c + (dt ? " " + dt : "") + ".pdf";
  }
  function testoPiano(T) { /* tutte le frasi del foglio in fila (per i confronti nelle prove) */
    var s = function (a) { return a.map(function (x) { return x.t; }).join(""); };
    return [T.titolo, s(T.apertura), T.strumentoIntro, T.uso].concat(T.clausole.map(s), [T.infede, T.firmaEnte, T.firmaAllievo], T.piede).join("\n");
  }
  function lungo(d) { return (d.nome + d.cognome + d.corso + d.strumento + d.accessori).length; }

  var P = { componiAssegnato: componiAssegnato, notaConsegna: notaConsegna, leggiAccessori: leggiAccessori, daAssegnato: daAssegnato, pulisciModulo: pulisciModulo,
    datiModulo: datiModulo, testiModulo: testiModulo, PUNTI: PUNTI, puntini: puntini, nomeFile: nomeFile, testoPiano: testoPiano, VERSIONE_GENERICA: VERSIONE_GENERICA };

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
      if (d.logo) { var im = el("img", "f-logo"); im.alt = ""; im.src = d.logo; f.appendChild(im); }
      if (d.intestazione) {
        var nm = el("div", "f-nome");
        d.intestazione.split("·").forEach(function (pezzo, i) { if (i > 0) nm.appendChild(el("b", "", "·")); if (pezzo) nm.appendChild(document.createTextNode(pezzo)); });
        f.appendChild(nm);
      }
      if (d.logo || d.intestazione) f.appendChild(el("div", "f-filo"));
      var corpo = el("div", "f-corpo"); f.appendChild(corpo);
      corpo.appendChild(el("h1", "f-titolo", T.titolo));
      var par = function (cls, segs) { var p = el("p", "f-p " + cls); segs.forEach(function (x) { p.appendChild(x.b ? el("b", "", x.t) : document.createTextNode(x.t)); }); corpo.appendChild(p); return p; };
      /* una riga di campi: «Etichetta ……» oppure «Etichetta valore» (il valore al posto dei puntini, sottolineato a puntini sulla larghezza dei puntini) */
      var campi = function (cls, lista) {
        var p = el("p", "f-p f-campi " + cls);
        lista.forEach(function (c, i) {
          p.appendChild(document.createTextNode((i ? "    " : "") + c[0] + " "));
          if (c[1]) { var v = el("span", "f-v f-w" + c[2], c[1]); p.appendChild(v); } else p.appendChild(document.createTextNode(puntini(c[2])));
        });
        corpo.appendChild(p);
      };
      par("g d6", T.apertura);
      campi("", [[T.nome, d.nome, PUNTI.nome], [T.cognome, d.cognome, PUNTI.cognome]]);
      campi("", [[T.corso, d.corso, PUNTI.corso]]);
      par("d6", [{ t: T.strumentoIntro }]);
      campi("", [[T.codiceEt, d.codice, PUNTI.codice], [T.strumentoEt, d.strumento, PUNTI.strumento]]);
      campi("", [[T.accessoriEt, d.accessori, PUNTI.accessori]]);
      par("d6", [{ t: T.uso }]);
      par("g d6", T.clausole[0]); par("g d6", T.clausole[1]); par("g d14", T.clausole[2]);
      campi("", [[T.luogoDataEt, T.luogoData, PUNTI.luogo]]);
      par("d14", [{ t: T.infede }]);
      var firme = el("div", "f-firme");
      [T.firmaEnte, T.firmaAllievo].forEach(function (x) { var b = el("div", "f-firma"); b.appendChild(el("div", "f-et", x)); b.appendChild(el("div", "f-pp", puntini(PUNTI.firma))); firme.appendChild(b); });
      corpo.appendChild(firme);
      var pie = el("div", "f-piede"); T.piede.forEach(function (r) { pie.appendChild(el("div", "", r)); }); f.appendChild(pie);
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
    /* Posizioni del Word di AVA (pt dalla cima della pagina, 1 pt = 0,3528 mm): primo rigo di ogni blocco = «yMin» misurato sul PDF del Word + 10,1 (linea di base di Georgia 11 pt).
       Georgia non si può incorporare in jsPDF: il corpo usa Times (misura più stretta, stesse posizioni verticali, stessi margini). Il piè e le etichette sono Helvetica come nel Word. */
    var MM = 25.4 / 72, BASE = 10.1, HB = 0.76, HN = 0.78;   /* HB/HN: dalla cima del rigo Helvetica alla linea di base (bold / normale), tarati sul PDF del Word */
    var Y = { apertura: 192.9, nome: 228.0, corso: 252.2, seguente: 276.4, codice: 297.1, accessori: 321.3, uso: 345.6, cl1: 366.0, cl2: 400.5, cl3: 449.7, luogo: 478.3, infede: 502.5, firme: 532.7, puntiFirma: 583.6 };
    var DOT = 0.807;   /* larghezza di «…» in Georgia, in em: i puntini sono lunghi come nel Word anche se il corpo è Times */
    /* una riga di campi: «Etichetta ……» o «Etichetta valore» (valore al posto dei puntini, filo a puntini sotto); coppie = [[etichetta, valore, n punti], …]; ritorna nulla */
    function riga2(doc, X, yb, size, coppie, maxW, inter) {
      doc.setFont("times", "normal"); doc.setFontSize(size); impostaColore(doc, [0, 0, 0]);
      var x = X, extra = 0, dw = function (n) { return n * DOT * size * MM; }, sp = doc.getTextWidth("a a") - doc.getTextWidth("aa");
      var punti = function (x1, x2, y) { doc.setDrawColor(0); doc.setLineWidth(0.35); doc.setLineDashPattern([0.35, 0.695], 0); doc.line(x1, y, x2, y); doc.setLineDashPattern([], 0); };
      coppie.forEach(function (c, i) {
        if (i) x += sp * 4;
        doc.setFont("times", "normal"); doc.setFontSize(size); doc.text(c[0], x, yb); x += doc.getTextWidth(c[0]) + sp;
        var W = dw(c[2]);
        if (!c[1]) { punti(x, x + W, yb - 0.35); x += W; return; }
        var fs = size, vw = doc.getTextWidth(c[1]), libero = X + maxW - x, xv = x, yv = yb;
        if (vw > libero) { xv = X; yv = yb + inter; libero = maxW; extra = 1; }   /* non sta sulla riga: va a capo, a sinistra (come nella stampa), e il resto scende di una riga */
        while (vw > libero && fs > 6) { fs -= 0.5; doc.setFontSize(fs); vw = doc.getTextWidth(c[1]); }
        doc.text(c[1], xv, yv); doc.setFontSize(size); punti(xv, xv + Math.max(W, vw), yv + 1.1);
        if (!extra) x += Math.max(W, vw);
      });
      return extra;
    }
    function disegna(doc, d, T, size, logo) {
      var X = 20, L = 170, col = rgb(d.colore), inter = 14.4 * MM, ex = 0, y0 = function (k) { return (Y[k] + BASE) * MM + ex * inter; };
      if (logo || d.intestazione) {
        if (logo) { var hh = 27, ww = Math.min(34, hh * logo.rapporto); doc.addImage(logo.url, logo.formato, 21.8, 16.9, ww, hh); }
        if (d.intestazione) {
          var nome = d.intestazione, sp = 1.75 * MM, ns = 21; doc.setFont("times", "normal"); doc.setFontSize(ns);
          var larg = function (f) { var tot = 0; nome.split("").forEach(function (c) { doc.setFont("times", c === "·" ? "bold" : "normal"); doc.setFontSize(f); tot += doc.getTextWidth(c) + sp; }); return tot - sp; };
          while (ns > 10 && larg(ns) > 136) ns -= 0.5;
          var cx = 122 - larg(ns) / 2, yb = (62.5 + 0.891 * 21) * MM;   /* centrato nella cella di 136 mm che inizia a 54 mm */
          nome.split("").forEach(function (c) { doc.setFont("times", c === "·" ? "bold" : "normal"); doc.setFontSize(ns); impostaColore(doc, c === "·" ? col : [0, 0, 0]); doc.text(c, cx, yb); cx += doc.getTextWidth(c) + sp; });
        }
        doc.setDrawColor(col[0], col[1], col[2]); doc.setLineWidth(0.75 * MM); doc.setLineDashPattern([], 0); doc.line(19.4, 152.25 * MM, 190.3, 152.25 * MM);
      }
      impostaColore(doc, [0, 0, 0]);
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(T.titolo, 105, (165.7 + HB * 13) * MM, { align: "center" });
      paragrafo(doc, T.apertura, X, y0("apertura"), L, size, true, inter);
      ex += riga2(doc, X, y0("nome"), size, [[T.nome, d.nome, PUNTI.nome], [T.cognome, d.cognome, PUNTI.cognome]], L, inter);
      ex += riga2(doc, X, y0("corso"), size, [[T.corso, d.corso, PUNTI.corso]], L, inter);
      paragrafo(doc, [{ t: T.strumentoIntro }], X, y0("seguente"), L, size, false, inter);
      ex += riga2(doc, X, y0("codice"), size, [[T.codiceEt, d.codice, PUNTI.codice], [T.strumentoEt, d.strumento, PUNTI.strumento]], L, inter);
      ex += riga2(doc, X, y0("accessori"), size, [[T.accessoriEt, d.accessori, PUNTI.accessori]], L, inter);
      paragrafo(doc, [{ t: T.uso }], X, y0("uso"), L, size, false, inter);
      paragrafo(doc, T.clausole[0], X, y0("cl1"), L, size, true, inter);
      paragrafo(doc, T.clausole[1], X, y0("cl2"), L, size, true, inter);
      paragrafo(doc, T.clausole[2], X, y0("cl3"), L, size, true, inter);
      ex += riga2(doc, X, y0("luogo"), size, [[T.luogoDataEt, T.luogoData, PUNTI.luogo]], L, inter);
      paragrafo(doc, [{ t: T.infede }], X, y0("infede"), L, size, false, inter);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); impostaColore(doc, [0, 0, 0]);
      doc.text(T.firmaEnte, X, (Y.firme + HN * 10) * MM + ex * inter); doc.text(T.firmaAllievo, 105, (Y.firme + HN * 10) * MM + ex * inter);
      var yp = (Y.puntiFirma + BASE) * MM - 0.35 + ex * inter, wp = PUNTI.firma * DOT * size * MM;
      doc.setDrawColor(0); doc.setLineWidth(0.35); doc.setLineDashPattern([0.35, 0.695], 0); doc.line(X, yp, X + wp, yp); doc.line(105, yp, 105 + wp, yp); doc.setLineDashPattern([], 0);
      /* piè: solo le righe dell'ente, Helvetica 8 pt centrate, come nel Word (nessun filetto, nessuna versione, nessun «1 di N») */
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); impostaColore(doc, [0, 0, 0]);
      T.piede.forEach(function (r, i) { doc.text(doc.splitTextToSize(r, L)[0], 105, (781.8 + i * 9.6 + HN * 8) * MM, { align: "center" }); });
      return { fine: 0, limite: 1 };
    }
    /* il PDF come File; `logo` = {url, formato, rapporto} già decodificato (così la costruzione è sincrona) */
    P.pdfModulo = function (d, logo) {
      var J = root.jspdf && root.jspdf.jsPDF; if (!J) throw new Error("jsPDF non caricato");
      var T = testiModulo(d), doc = null, r;
      doc = new J({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      doc.setProperties({ title: "Modulo di comodato", creator: "stageplot.it" });
      r = disegna(doc, d, T, 11, logo);
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
