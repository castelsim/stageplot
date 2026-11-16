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

  /* Foglio A4 di etichette da plastificare. Misure in mm; margine in basso ≥ 15 (la Ricoh taglia il bordo), il piè sta lì sotto.
     3 colonne × 7 righe = 21 etichette da 58 × 34 con 4 mm fra l'una e l'altra (2 mm di bordo plastica per lato dopo il taglio). */
  var FOGLIO = { w: 210, h: 297, colonne: 3, righe: 7, ew: 58, eh: 34, gap: 4, alto: 12, basso: 23 };
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

  /* corpo (pt) del codice sull'etichetta: grande, ma i codici lunghi (PERC-0012) devono stare nei 26 mm accanto al QR; carattere a spaziatura fissa ≈ 0,6 em */
  function corpoCodice(lunghezza) { var pt = 26 / (Math.max(1, lunghezza) * 0.6 * 0.3528); return Math.max(8, Math.min(17, Math.floor(pt * 10) / 10)); }

  var L = { corpoCodice: corpoCodice, STATI: STATI, FOGLIO: FOGLIO, statoNome: statoNome, statoOk: statoOk, codice: codice, prefissoOk: prefissoOk, proponiPrefisso: proponiPrefisso,
    frase: frase, conteggi: conteggi, cella: cella, csv: csv, dataIt: dataIt, perPagina: perPagina, origineX: origineX, impagina: impagina, posizione: posizione,
    giusto: giusto, data: data, intervallo: intervallo };
  root.INVLib = L;
  if (typeof module === "object" && module && module.exports) module.exports = L;
})(typeof globalThis !== "undefined" ? globalThis : this);
