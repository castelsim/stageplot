/* Programma Fondatori — la pagina pubblica legge SOLO fondatori_pubblico() (0080): posti rimasti e nomi di chi ha
   acconsentito a comparire. Nessun altro dato esce dal database. Script classico, senza dipendenze. */
(function () {
  "use strict";
  /* anti-clickjacking: incorniciata da un ALTRO sito, la pagina si nasconde e prova a uscire (frame-ancestors in un
     <meta> il browser lo ignora). La stessa origine (prove al telefono in un iframe) resta dentro. */
  try {
    if (window.top !== window.self) {
      var stesso = false;
      try { stesso = window.top.location.origin === window.location.origin; } catch (e) {}
      if (!stesso) { document.documentElement.style.display = "none"; window.top.location = window.self.location; }
    }
  } catch (e) {}

  var API_PROD = "https://vsodplqkuvnsdiikvmjb.supabase.co";
  var ANON_PROD = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzb2RwbHFrdXZuc2RpaWt2bWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTkyNjksImV4cCI6MjA5ODE5NTI2OX0.rZmZSvOnrNY3cC2JQ8XnbMTKIfjP5WmtbCtQ6l8zPrc";
  var TETTO = 100;

  /* In produzione SEMPRE il server vero: ?api= e ?anon= valgono solo aprendo la pagina da localhost (prove sullo
     stack locale), come nella biglietteria. */
  function configura(hostname, search) {
    var cfg = { api: API_PROD, anon: ANON_PROD };
    if (hostname !== "localhost" && hostname !== "127.0.0.1") return cfg;
    var q = new URLSearchParams(search || "");
    var api = (q.get("api") || "").replace(/\/+$/, "");
    if (/^https?:\/\/[A-Za-z0-9.\-]+(:\d{1,5})?$/.test(api)) cfg.api = api;
    var anon = q.get("anon") || "";
    if (/^[A-Za-z0-9._\-]{1,2000}$/.test(anon)) cfg.anon = anon;
    return cfg;
  }

  function nomeOndata(d, n) {
    var t = "";
    (Array.isArray(d.ondate) ? d.ondate : []).forEach(function (o) { if (o && o.numero === n && typeof o.nome === "string") t = o.nome; });
    return t;
  }

  function mostra(d) {
    var posti = document.getElementById("posti"), barra = document.getElementById("postiBarra");
    var elenco = document.getElementById("elenco"), vuoto = document.getElementById("elencoVuoto");
    if (!d || typeof d.posti_rimasti !== "number") {
      if (posti) posti.textContent = "Il numero dei posti rimasti adesso non si riesce a leggere: riprova fra poco.";
      return;
    }
    /* i posti sono quelli dell'ondata aperta (oggi la prima, 100 posti) */
    var o = d.ondata && typeof d.ondata === "object" ? d.ondata : null;
    var tot = o && o.posti > 0 ? o.posti : TETTO;
    var n = Math.max(0, Math.min(tot, d.posti_rimasti));
    var prima = !o || o.numero === 1;
    if (posti) {
      if (!o) posti.textContent = "In questo momento non ci sono ondate aperte: le richieste restano in attesa.";
      else if (n > 0) posti.textContent = (prima ? "Posti rimasti: " : "Posti rimasti fra gli «" + o.nome + "»: ") + n + " su " + tot + ".";
      else posti.textContent = prima ? "I " + tot + " posti della prima ondata sono stati assegnati: le nuove richieste restano in attesa della seconda."
                                     : "I posti di questa ondata sono stati assegnati: le nuove richieste restano in attesa.";
    }
    if (barra && o) { barra.style.width = ((tot - n) / tot * 100) + "%"; barra.parentNode.hidden = false;
      barra.parentNode.setAttribute("aria-valuemax", String(tot)); barra.parentNode.setAttribute("aria-valuenow", String(tot - n)); }
    var nomi = Array.isArray(d.nomi) ? d.nomi.filter(function (x) { return x && typeof x.nome === "string" && x.nome; }) : [];
    if (!elenco) return;
    elenco.textContent = "";
    nomi.forEach(function (x) {
      var li = document.createElement("li"); li.textContent = x.nome;
      if (x.ondata && x.ondata !== 1) { var s = document.createElement("small"); s.textContent = " · " + (nomeOndata(d, x.ondata) || "ondata " + x.ondata); li.appendChild(s); }
      elenco.appendChild(li);
    });
    elenco.hidden = !nomi.length;
    var approvati = (prima && o) ? (tot - n) : 1;
    if (vuoto) {
      vuoto.hidden = !!nomi.length;
      vuoto.textContent = approvati > 0
        ? "Chi è già fondatore ha scelto di non comparire con il nome."
        : "Ancora nessun fondatore: il primo posto è libero.";
    }
  }

  function carica() {
    var cfg = configura(location.hostname, location.search);
    fetch(cfg.api + "/rest/v1/rpc/fondatori_pubblico", {
      method: "POST",
      headers: { apikey: cfg.anon, Authorization: "Bearer " + cfg.anon, "Content-Type": "application/json" },
      body: "{}"
    }).then(function (r) { return r.ok ? r.json() : null; }).then(mostra, function () { mostra(null); });
  }

  if (document.readyState !== "loading") carica(); else document.addEventListener("DOMContentLoaded", carica);
  if (typeof module === "object" && module && module.exports) module.exports = { configura: configura };
})();
