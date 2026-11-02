/* © 2026 Simone Castellan. Tutti i diritti riservati (vedi LICENSE).
 * Bacheca delle domande del workshop — lato partecipanti (telefono, dal QR).
 * Niente innerHTML: ogni testo entra con textContent (le domande le scrivono gli utenti).
 * Poll ogni 6 s solo a scheda visibile; il voto non si ridisegna mentre sta partendo. */
(function () {
  "use strict";
  var C = window.WSComune;
  var SESSIONE = C.sessioneDa(location.search);
  var DISP = C.numeroDispositivo((function () { try { return window.localStorage; } catch (e) { return null; } })(), window.crypto);

  function el(tag, classe, testo) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo != null) e.textContent = testo;
    return e;
  }

  /* ── Schede ── */
  var tabB = document.getElementById("tab-bacheca"), tabN = document.getElementById("tab-nuova");
  var panB = document.getElementById("bacheca"), panN = document.getElementById("nuova");
  function mostra(nuova) {
    tabB.setAttribute("aria-selected", String(!nuova)); tabN.setAttribute("aria-selected", String(nuova));
    panB.hidden = nuova; panN.hidden = !nuova;
    if (!nuova) carica();
  }
  tabB.onclick = function () { mostra(false); };
  tabN.onclick = function () { mostra(true); };

  /* ── Bacheca ── */
  var elenco = document.getElementById("elenco"), inVoto = false;
  function tag(testo, classe) { return el("span", "ws-tag" + (classe ? " " + classe : ""), testo); }
  function disegna(righe) {
    elenco.textContent = "";
    if (!righe.length) {
      elenco.appendChild(el("p", "ws-vuoto", "Ancora nessuna domanda. Scrivi la prima da «Nuova domanda»."));
      return;
    }
    righe.forEach(function (d) {
      var box = el("article", "ws-domanda" + (d.risposta ? " fatta" : ""));
      var b = el("button", "ws-voto"); b.type = "button";
      b.setAttribute("aria-pressed", String(!!d.mio_voto));
      b.setAttribute("aria-label", (d.mio_voto ? "Togli il tuo +1" : "Anche io voglio saperlo") + ", voti: " + d.voti);
      b.appendChild(el("span", "freccia", "▲")); b.appendChild(el("span", null, d.voti));
      /* La propria domanda fermata dal filtro si vede, ma non si vota finché Simone non la sblocca. */
      if (d.in_attesa) { b.disabled = true; b.setAttribute("aria-label", "In attesa, non si può ancora votare"); }
      else b.onclick = function () { vota(d.id, b); };
      var t = el("div", "ws-testo");
      t.appendChild(el("div", null, d.testo));
      var m = el("div", "ws-meta");
      m.appendChild(tag(C.nomeArgomento(d.argomento)));
      var chi = C.frasePerChi(d.per_chi);
      if (chi) m.appendChild(tag(chi, d.per_chi));
      if (d.risposta) m.appendChild(tag("✓ risposta data", "fatta"));
      if (d.in_attesa) m.appendChild(tag("la vedi solo tu: prima la guarda Simone", "attesa"));
      else if (d.mia) m.appendChild(tag("la tua"));
      t.appendChild(m);
      box.appendChild(b); box.appendChild(t); elenco.appendChild(box);
    });
  }
  function carica() {
    if (inVoto || panB.hidden) return;
    C.chiama("bacheca", { p_sessione: SESSIONE, p_dispositivo: DISP })
      .then(function (r) { disegna(Array.isArray(r) ? r : []); })
      .catch(function (e) {
        if (!elenco.querySelector(".ws-domanda")) { elenco.textContent = ""; elenco.appendChild(el("p", "ws-vuoto", e.message)); }
      });
  }
  function vota(id, b) {
    if (b.disabled) return;
    b.disabled = true; inVoto = true;
    C.chiama("vota", { p_id: id, p_dispositivo: DISP })
      .then(function () { inVoto = false; carica(); })
      .catch(function () { inVoto = false; b.disabled = false; });
  }
  carica();
  setInterval(function () { if (document.visibilityState === "visible") carica(); }, 6000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") carica(); });

  /* ── Nuova domanda ── */
  function gruppo(contenitore, nome, voci) {
    voci.forEach(function (v) {
      var l = document.createElement("label");
      var i = document.createElement("input"); i.type = "radio"; i.name = nome; i.value = v[0];
      var s = el("span", null, v[1]);
      if (v[2]) s.appendChild(el("small", null, v[2]));
      l.appendChild(i); l.appendChild(s); contenitore.appendChild(l);
    });
  }
  gruppo(document.getElementById("argomenti"), "argomento", C.ARGOMENTI);
  gruppo(document.getElementById("perchi"), "perchi", C.PER_CHI);

  var testo = document.getElementById("testo"), conta = document.getElementById("conta");
  var avviso = document.getElementById("avviso"), invia = document.getElementById("invia");
  testo.addEventListener("input", function () { conta.textContent = testo.value.length; });
  function dici(msg, ok) { avviso.textContent = msg; avviso.className = "ws-avviso " + (ok ? "ok" : "errore"); avviso.hidden = false; }

  document.getElementById("modulo").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var arg = document.querySelector('input[name="argomento"]:checked');
    var chi = document.querySelector('input[name="perchi"]:checked');
    var t = testo.value.trim();
    if (!arg) return dici("Scegli di cosa parla la domanda (punto 1).");
    if (t.length < 3) return dici("Scrivi la domanda (punto 3).");
    invia.disabled = true; avviso.hidden = true;
    C.chiama("invia_domanda", { p_sessione: SESSIONE, p_testo: t, p_argomento: arg.value,
                                p_per_chi: chi ? chi.value : "non-so", p_dispositivo: DISP })
      .then(function (stato) {
        testo.value = ""; conta.textContent = "0";
        document.querySelectorAll("#modulo input").forEach(function (i) { i.checked = false; });
        dici(stato === "in_revisione" ? "Ricevuta. Prima di comparire la guarda Simone." : "Inviata, grazie! La trovi in «Più votate».", true);
      })
      .catch(function (e) { dici(e.message); })
      .then(function () { invia.disabled = false; });
  });
})();
