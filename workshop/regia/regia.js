/* © 2026 Simone Castellan. Tutti i diritti riservati (vedi LICENSE).
 * Regia della bacheca delle domande del workshop: mostra tutte le domande (anche nascoste o fermate dal filtro),
 * conteggi per persona e argomento, «nascondi», «risposta data», «vista grande» per il proiettore.
 * Il codice di regia sta solo in sessionStorage di questa scheda, mai nell'URL. Niente innerHTML. */
(function () {
  "use strict";
  var C = window.WSComune;
  var SESSIONE = C.sessioneDa(location.search);
  var CHI = { simone: "per Simone", marco: "per Marco", entrambi: "per tutti e due", "non-so": "non so" };
  var codice = null, dati = [];
  try { codice = window.sessionStorage.getItem("regia-codice"); } catch (e) { codice = null; }

  function el(tag, classe, testo) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo != null) e.textContent = testo;
    return e;
  }
  var fArg = document.getElementById("f-arg");
  C.ARGOMENTI.forEach(function (a) { var o = el("option", null, a[1]); o.value = a[0]; fArg.appendChild(o); });

  function errore(m) { var e = document.getElementById("errore"); e.textContent = m || ""; e.hidden = !m; }
  function carica() {
    if (!codice) return;
    return C.chiama("regia_elenco", { p_codice: codice, p_sessione: SESSIONE }).then(function (r) {
      dati = Array.isArray(r) ? r : []; errore("");
      document.getElementById("accesso").hidden = true; document.getElementById("dentro").hidden = false;
      document.getElementById("agg").textContent = "aggiornato alle " + new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      disegna();
    }).catch(function (e) {
      if (/codice/i.test(e.message)) {
        codice = null;
        try { window.sessionStorage.removeItem("regia-codice"); } catch (x) { /* niente */ }
        document.getElementById("accesso").hidden = false; document.getElementById("dentro").hidden = true;
      }
      errore(e.message);
    });
  }
  function bottone(testo, fn) { var b = el("button", null, testo); b.type = "button"; b.onclick = fn; return b; }
  function disegna() {
    var chi = document.getElementById("f-chi").value, arg = fArg.value, st = document.getElementById("f-stato").value;
    /* Conteggi sulle domande visibili e senza risposta: sono quelle ancora da trattare. */
    var aperte = dati.filter(function (d) { return !d.nascosta && !d.risposta; });
    var conti = document.getElementById("conti"); conti.textContent = "";
    function conto(etichetta, n) {
      var c = el("div", "ws-conto"); c.appendChild(el("b", null, n)); c.appendChild(document.createTextNode(etichetta)); conti.appendChild(c);
    }
    conto("domande da trattare", aperte.length);
    conto("per Simone", aperte.filter(function (d) { return d.per_chi === "simone"; }).length);
    conto("per Marco", aperte.filter(function (d) { return d.per_chi === "marco"; }).length);
    conto("nascoste o da guardare", dati.filter(function (d) { return d.nascosta; }).length);
    var perArg = {}; aperte.forEach(function (d) { perArg[d.argomento] = (perArg[d.argomento] || 0) + 1; });
    Object.keys(perArg).sort(function (a, b) { return perArg[b] - perArg[a]; }).forEach(function (k) { conto(C.nomeArgomento(k), perArg[k]); });

    var lista = document.getElementById("elenco"); lista.textContent = "";
    dati.filter(function (d) {
      return (!chi || d.per_chi === chi) && (!arg || d.argomento === arg) &&
        (!st || (st === "aperte" && !d.risposta && !d.nascosta) || (st === "nascoste" && d.nascosta));
    }).forEach(function (d) {
      var box = el("div", "ws-d" + (d.nascosta ? " nascosta" : "") + (d.risposta ? " fatta" : ""));
      var t = el("div", "ws-t"); t.appendChild(el("div", null, d.testo));
      var m = el("div", "ws-meta");
      m.appendChild(el("span", "ws-tag", C.nomeArgomento(d.argomento)));
      m.appendChild(el("span", "ws-tag " + d.per_chi, CHI[d.per_chi] || ""));
      if (d.filtrata) m.appendChild(el("span", "ws-tag rossa", "fermata dal filtro"));
      else if (d.nascosta) m.appendChild(el("span", "ws-tag rossa", "nascosta"));
      if (d.risposta) m.appendChild(el("span", "ws-tag", "✓ risposta data"));
      m.appendChild(el("span", "ws-tag", new Date(d.creata).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })));
      t.appendChild(m);
      var az = el("div", "ws-az");
      az.appendChild(bottone(d.nascosta ? "Mostra" : "Nascondi", function () { imposta(d.id, { p_nascosta: !d.nascosta }); }));
      az.appendChild(bottone(d.risposta ? "Riapri" : "✓ Risposta", function () { imposta(d.id, { p_risposta: !d.risposta }); }));
      box.appendChild(el("div", "ws-v", d.voti)); box.appendChild(t); box.appendChild(az); lista.appendChild(box);
    });
    if (!lista.firstChild) lista.appendChild(el("p", "ws-nota", "Nessuna domanda con questi filtri."));
  }
  function imposta(id, cosa) {
    var d = { p_codice: codice, p_id: id };
    Object.keys(cosa).forEach(function (k) { d[k] = cosa[k]; });
    C.chiama("regia_imposta", d).then(carica).catch(function (x) { errore(x.message); });
  }
  document.getElementById("accesso").addEventListener("submit", function (ev) {
    ev.preventDefault(); codice = document.getElementById("codice").value.trim();
    try { window.sessionStorage.setItem("regia-codice", codice); } catch (x) { /* resta in memoria */ }
    carica();
  });
  ["f-chi", "f-arg", "f-stato"].forEach(function (id) { document.getElementById(id).onchange = disegna; });
  document.getElementById("grande").onclick = function () { document.body.classList.add("grande"); };
  document.getElementById("esci").onclick = function () { document.body.classList.remove("grande"); };
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") document.body.classList.remove("grande"); });
  carica();
  setInterval(function () { if (codice && document.visibilityState === "visible") carica(); }, 5000);
})();
