/* Programma di sala — l'indirizzo. Script classico senza dipendenze: lo caricano 404.html (scorciatoia), la pagina
   /programma/ e, in Node, i test (module.exports).
   Canonico: /programma/?p=<slug>. Scorciatoia (quella stampata nel QR): /programma/<slug>.
   GitHub Pages non ha regole di riscrittura: un indirizzo che non è un file arriva a 404.html, che rimanda qui.
   Regole dello slug = quelle della migrazione 0082 (2-40 caratteri a-z0-9-, niente «--», niente parole riservate). */
(function (root) {
  "use strict";
  /* bgl_slug_riservato (0074) + le parole che sono pagine sotto /programma/ (un test le confronta con la 0082) */
  var RISERVATI = ["mie", "gestione", "nuovo", "admin", "api", "app", "aiuto", "privacy", "info", "stageplot",
    "biglietteria", "www", "test", "accedi", "esci", "login", "programma", "programmi", "index", "prg"];
  var SITO = "https://stageplot.it";
  function slugOk(s) { return typeof s === "string" && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s) && s.indexOf("--") < 0 && RISERVATI.indexOf(s) < 0; }
  /* lo slug richiesto dall'indirizzo della pagina (canonico o scorciatoia), in minuscolo; null se non valido */
  function slugDaIndirizzo(pathname, search) {
    var q = /(?:^|[?&])p=([^&#]*)/.exec(String(search || ""));
    var c = null;
    if (q) { try { c = decodeURIComponent(q[1]).trim().toLowerCase(); } catch (e) { c = null; } }
    if (c == null) {
      var m = /^\/programma\/([^\/]+)\/?$/i.exec(String(pathname || ""));
      if (m) { try { c = decodeURIComponent(m[1]).toLowerCase(); } catch (e) { c = null; } }
    }
    return c != null && slugOk(c) ? c : null;
  }
  /* per 404.html: /programma/<slug> → /programma/?p=<slug>; null se non è una scorciatoia valida */
  function scorciatoia(pathname, search) {
    var m = /^\/programma\/([^\/]+)\/?$/i.exec(String(pathname || ""));
    if (!m) return null;
    var s = m[1].toLowerCase();
    if (!slugOk(s)) return null;
    var resto = String(search || "").replace(/^\?/, "").split("&").filter(function (kv) { return kv && !/^p=/.test(kv); });
    return "/programma/?p=" + s + (resto.length ? "&" + resto.join("&") : "");
  }
  function linkProgramma(slug, base) { return (base || SITO) + "/programma/" + slug; }
  var I = { RISERVATI: RISERVATI, slugOk: slugOk, slugDaIndirizzo: slugDaIndirizzo, scorciatoia: scorciatoia, linkProgramma: linkProgramma };
  root.PRGIndirizzo = I;
  if (typeof module === "object" && module && module.exports) module.exports = I;
})(typeof globalThis !== "undefined" ? globalThis : this);
