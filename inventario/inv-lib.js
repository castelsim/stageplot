/* Inventario con QR — parte pura (nessun DOM, nessuna rete): codici, stati, conteggi, CSV, impaginazione delle etichette.
   La usa l'area /inventario/ nel browser e i test in Node (module.exports). Un'idea, una funzione, un test. */
(function (root) {
  "use strict";
  var STATI = [
    { id: "in_sede", nome: "In sede" }, { id: "a_casa", nome: "A casa" }, { id: "in_riparazione", nome: "In riparazione" },
    { id: "smarrito", nome: "Smarrito" }, { id: "dismesso", nome: "Dismesso" }
  ];
  function statoNome(id) { for (var i = 0; i < STATI.length; i++) if (STATI[i].id === id) return STATI[i].nome; return String(id || ""); }
  function statoOk(id) { return STATI.some(function (s) { return s.id === id; }); }

  /* TAS + 3 → TAS-003 (3 cifre almeno; oltre il 999 se ne aggiungono, come fa il database) */
  function codice(prefisso, numero) { var n = String(Math.floor(+numero)); while (n.length < 3) n = "0" + n; return String(prefisso).toUpperCase() + "-" + n; }
  function prefissoOk(p) { return typeof p === "string" && /^[A-Z]{2,5}$/.test(p); }
  /* un prefisso proposto dal nome del tipo: prime lettere, maiuscole, senza accenti («Violoncello» → VIO) */
  function proponiPrefisso(nome) {
    var s = String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase();
    return s.length >= 2 ? s.slice(0, 3) : "";
  }
  /* «10 tastiere in inventario» / «1 tastiera in inventario» */
  function frase(totale, singolare, plurale) {
    var n = +totale || 0, nome = String(n === 1 ? singolare : plurale).toLowerCase();
    return n + " " + nome + " in inventario";
  }
  /* conteggi per tipo e per stato: {TAS:{totale, attivi, per_stato:{in_sede:7,…}}}; «attivi» = non dismessi (quelli che la pagina pubblica conta) */
  function conteggi(articoli) {
    var o = {};
    (articoli || []).forEach(function (a) {
      var c = o[a.tipo] || (o[a.tipo] = { totale: 0, attivi: 0, per_stato: {} });
      c.totale++; if (a.stato !== "dismesso") c.attivi++;
      c.per_stato[a.stato] = (c.per_stato[a.stato] || 0) + 1;
    });
    return o;
  }

  /* CSV (UTF-8, virgole): colonne come l'INVENTARIO.csv della scuola. Le celle che iniziano con = + - @ non diventano formule in Excel. */
  function cella(v) {
    var s = String(v == null ? "" : v).replace(/\r?\n/g, " ");
    if (/^[=+\-@\t]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(tipi, articoli, conNomi) {
    var nome = {}; (tipi || []).forEach(function (t) { nome[t.prefisso] = t.singolare; });
    var testa = ["codice", "tipo", "marca/modello", "stato", "note"]; if (conNomi) testa = testa.concat(["assegnato a", "data consegna", "data rientro"]);
    var righe = [testa];
    (articoli || []).slice().sort(function (a, b) { return a.codice < b.codice ? -1 : a.codice > b.codice ? 1 : 0; }).forEach(function (a) {
      var r = [a.codice, nome[a.tipo] || a.tipo, a.modello, statoNome(a.stato), a.note];
      if (conNomi) r = r.concat([a.assegnato_a, a.data_consegna || "", a.data_rientro || ""]);
      righe.push(r);
    });
    return righe.map(function (r) { return r.map(cella).join(","); }).join("\n") + "\n";
  }
  /* 2026-11-16 → 16/11/2026 */
  function dataIt(d) { return typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : ""; }

  /* Foglio A4 di etichette da plastificare. Misure in mm (allineate al foglio dei cavalletti del 16/11, richiesta di Simone «QR 2,5 × 2,5 cm»):
     3 colonne × 8 righe = 24 etichette da 56 × 27 (lato corto massimo 2,7 cm: Simone 16/11) con 4 mm fra l'una e l'altra; margini ≥ 15 su TUTTI i lati, piè compreso (la Ricoh taglia il bordo):
     alto 16, laterali 17, piè a 16 dal bordo. Il QR ha l'area NERA di 25 × 25 mm (senza bordo interno) in un riquadro bianco di 27 (1 mm di padding), a filo sopra e sotto del tratteggio. */
  var FOGLIO = { w: 210, h: 297, colonne: 3, righe: 8, ew: 56, eh: 27, gap: 4, alto: 16, basso: 16, lato: 17, qr: 25, qrBox: 27, qrPad: 1, testo: 24 };
  function perPagina() { return FOGLIO.colonne * FOGLIO.righe; }
  function origineX() { return (FOGLIO.w - (FOGLIO.colonne * FOGLIO.ew + (FOGLIO.colonne - 1) * FOGLIO.gap)) / 2; }
  function impagina(elementi) {
    var n = perPagina(), p = [];
    for (var i = 0; i < (elementi || []).length; i += n) p.push(elementi.slice(i, i + n));
    return p;
  }
  /* posizione (mm) dell'etichetta k-esima di una pagina */
  function posizione(k) {
    var c = k % FOGLIO.colonne, r = Math.floor(k / FOGLIO.colonne);
    return { x: origineX() + c * (FOGLIO.ew + FOGLIO.gap), y: FOGLIO.alto + r * (FOGLIO.eh + FOGLIO.gap) };
  }
  function giusto() { // l'ultima riga finisce sopra il margine basso?
    return FOGLIO.alto + FOGLIO.righe * FOGLIO.eh + (FOGLIO.righe - 1) * FOGLIO.gap <= FOGLIO.h - FOGLIO.basso;
  }
  function data(d) { d = d || new Date(); return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear(); }
  /* «TAS-001 … TAS-010» per il piè del foglio */
  function intervallo(codici) { return !codici.length ? "" : codici.length === 1 ? codici[0] : codici[0] + " … " + codici[codici.length - 1]; }

  /* corpo (pt) del codice sull'etichetta: grande, ma i codici lunghi (PERC-0012) devono stare nei 24 mm accanto al QR; carattere a spaziatura fissa ≈ 0,6 em */
  function corpoCodice(lunghezza) { var pt = FOGLIO.testo / (Math.max(1, lunghezza) * 0.6 * 0.3528); return Math.max(8, Math.min(17, Math.floor(pt * 10) / 10)); }

  /* piè sinistro del foglio: la VERSIONE c'è sempre («vN · data» su ogni foglio stampato; versione nuova = numero nuovo) */
  function piede(versione, ente, codici, d) {
    var v = Math.max(1, Math.min(99, Math.floor(+versione) || 1));
    return "v" + v + " · " + ente + " · " + intervallo(codici) + " · stampato il " + d;
  }

  /* ---- Elenco completo (17/11/2026, richiesta di Diego): dove sono e a chi sono, con ricerca, ordinamento, stampa A4 e CSV ---- */
  /* «In sede» · «Consegnato a Nome dal 16/11/2026» · «In riparazione» …; senza i nomi (conNomi falso): «Consegnato dal 16/11/2026». */
  function descrizioneStato(a, conNomi) {
    var dal = a.data_consegna ? " dal " + dataIt(a.data_consegna) : "";
    if (a.stato === "a_casa") {
      var chi = conNomi && a.assegnato_a ? " a " + a.assegnato_a : "";
      return "Consegnato" + chi + dal;
    }
    return statoNome(a.stato);
  }
  /* filtro: tipo, stato, testo libero su codice, modello, nota e (solo se i nomi sono ammessi) chi ha lo strumento */
  function filtra(articoli, f, conNomi) {
    f = f || {}; var t = String(f.testo || "").trim().toLowerCase();
    return (articoli || []).filter(function (a) {
      if (f.tipo && a.tipo !== f.tipo) return false;
      if (f.stato && a.stato !== f.stato) return false;
      if (!t) return true;
      var pagliaio = [a.codice, a.modello, a.note, statoNome(a.stato)].concat(conNomi ? [a.assegnato_a] : []).join(" ").toLowerCase();
      return pagliaio.indexOf(t) >= 0;
    });
  }
  /* ordinamento: per codice (naturale: prefisso, poi numero), per stato (ordine di STATI, poi codice) o per assegnatario (vuoti in fondo) */
  function confrontaCodice(a, b) {
    var pa = String(a.codice).split("-"), pb = String(b.codice).split("-");
    if (pa[0] !== pb[0]) return pa[0] < pb[0] ? -1 : 1;
    return (parseInt(pa[1], 10) || 0) - (parseInt(pb[1], 10) || 0);
  }
  function ordina(articoli, chiave) {
    var idx = function (id) { for (var i = 0; i < STATI.length; i++) if (STATI[i].id === id) return i; return 99; };
    return (articoli || []).slice().sort(function (a, b) {
      if (chiave === "stato") { var d = idx(a.stato) - idx(b.stato); if (d) return d; }
      if (chiave === "assegnato") {
        var x = String(a.assegnato_a || "").toLowerCase(), y = String(b.assegnato_a || "").toLowerCase();
        if (x !== y) { if (!x) return 1; if (!y) return -1; return x < y ? -1 : 1; }
      }
      return confrontaCodice(a, b);
    });
  }
  /* righe per foglio A4 dell'elenco (intestazione sulla prima riga di ogni foglio, margini ≥ 15 mm, piè a 16 mm dal bordo) */
  var RIGHE_ELENCO = 34;
  function impaginaElenco(articoli) {
    var p = [];
    for (var i = 0; i < (articoli || []).length; i += RIGHE_ELENCO) p.push(articoli.slice(i, i + RIGHE_ELENCO));
    return p.length ? p : [[]];
  }
  /* piè dell'elenco: «v1 · Ente · Elenco di 27 oggetti · stampato il GG/MM/AAAA» (la versione c'è sempre, come sulle etichette) */
  function piedeElenco(versione, ente, n, d) {
    var v = Math.max(1, Math.min(99, Math.floor(+versione) || 1));
    return "v" + v + " · " + ente + " · elenco di " + n + (n === 1 ? " oggetto" : " oggetti") + " · stampato il " + d;
  }
  /* sintesi per l'intestazione: «In sede 20 · Consegnato 6 · In riparazione 1» */
  function sintesi(articoli) {
    var c = {}; (articoli || []).forEach(function (a) { c[a.stato] = (c[a.stato] || 0) + 1; });
    return STATI.filter(function (s) { return c[s.id]; }).map(function (s) { return (s.id === "a_casa" ? "Consegnato" : s.nome) + " " + c[s.id]; }).join(" · ");
  }
  /* CSV dell'elenco mostrato: colonne di lettura («stato», «dove / a chi», «dal») con o senza i nomi */
  function csvElenco(tipi, articoli, conNomi) {
    var nome = {}; (tipi || []).forEach(function (t) { nome[t.prefisso] = t.singolare; });
    var righe = [["codice", "tipo", "marca/modello", "stato", conNomi ? "assegnato a" : "consegnato", "dal", "note"]];
    ordina(articoli, "codice").forEach(function (a) {
      righe.push([a.codice, nome[a.tipo] || a.tipo, a.modello, statoNome(a.stato), a.stato === "a_casa" ? (conNomi ? a.assegnato_a : "sì") : "", a.stato === "a_casa" ? dataIt(a.data_consegna) : "", a.note]);
    });
    return righe.map(function (r) { return r.map(cella).join(","); }).join("\n") + "\n";
  }

  var L = { descrizioneStato: descrizioneStato, filtra: filtra, ordina: ordina, confrontaCodice: confrontaCodice, RIGHE_ELENCO: RIGHE_ELENCO, impaginaElenco: impaginaElenco, piedeElenco: piedeElenco, sintesi: sintesi, csvElenco: csvElenco, piede: piede, corpoCodice: corpoCodice, STATI: STATI, FOGLIO: FOGLIO, statoNome: statoNome, statoOk: statoOk, codice: codice, prefissoOk: prefissoOk, proponiPrefisso: proponiPrefisso,
    frase: frase, conteggi: conteggi, cella: cella, csv: csv, dataIt: dataIt, perPagina: perPagina, origineX: origineX, impagina: impagina, posizione: posizione,
    giusto: giusto, data: data, intervallo: intervallo };
  root.INVLib = L;
  if (typeof module === "object" && module && module.exports) module.exports = L;
})(typeof globalThis !== "undefined" ? globalThis : this);
