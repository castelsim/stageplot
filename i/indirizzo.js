/* Inventario con QR — l'indirizzo FISSO scritto nell'etichetta (migrazione 0085). Script classico senza dipendenze: lo
   caricano 404.html (scorciatoia), la pagina pubblica /i/, l'area /inventario/ e, in Node, i test (module.exports).
   Scorciatoia (quella nel QR):  https://stageplot.it/i/<slug>/<codice>     es. /i/ava/TAS-003
   Elenco pubblico per tipo:     https://stageplot.it/i/<slug>              es. /i/ava
   Canonico:                     /i/?s=<slug>[&c=<codice>]
   GitHub Pages non ha regole di riscrittura: un indirizzo che non è un file arriva a 404.html, che rimanda alla forma
   canonica (come /programma/<slug> e /biglietteria/<org>). Queste regole NON cambiano mai: le etichette stampate le usano.
   slug = nome leggibile scelto dal proprietario (2-30 caratteri a-z 0-9 -, niente «--», niente parole riservate: stesse della
   migrazione 0085, un test le confronta); codice = PREFISSO (2-5 lettere) + «-» + numero (3-5 cifre).
   La pagina è tollerante su maiuscole/minuscole, perché un lettore QR o un telefono può cambiarle. */
(function (root) {
  "use strict";
  var SITO = "https://stageplot.it";
  /* come inv_slug_riservato (0085): parole che sono file o pagine sotto /i/ o /inventario/, o nomi di servizio */
  var RISERVATI = ["mie", "gestione", "nuovo", "admin", "api", "app", "aiuto", "privacy", "info", "stageplot", "www", "test", "accedi", "esci", "login",
    "inventario", "index", "inv", "indirizzo", "i"];
  var CODICE = /^[A-Z]{2,5}-[0-9]{3,5}$/;
  function slugOk(s) { return typeof s === "string" && /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(s) && s.indexOf("--") < 0 && RISERVATI.indexOf(s) < 0; }
  function codiceOk(s) { return typeof s === "string" && CODICE.test(s); }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return null; } }
  function param(search, nome) {
    var m = new RegExp("(?:^|[?&])" + nome + "=([^&#]*)").exec(String(search || ""));
    return m ? dec(m[1]) : null;
  }
  function norm(s, c) { return { slug: String(s == null ? "" : s).trim().toLowerCase(), codice: c == null ? null : String(c).trim().toUpperCase() }; }
  /* {slug, codice|null} dall'indirizzo della pagina (canonico o scorciatoia); null se non valido. codice null = elenco per tipo. */
  function daIndirizzo(pathname, search) {
    var s = param(search, "s"), c = param(search, "c");
    if (s == null) {
      var m = /^\/i\/([^\/]+)(?:\/([^\/]+))?\/?$/i.exec(String(pathname || ""));
      if (m) { s = dec(m[1]); c = m[2] == null ? null : dec(m[2]); if (s == null || (m[2] != null && c == null)) return null; }
    }
    if (s == null) return null;
    var n = norm(s, c);
    if (!slugOk(n.slug)) return null;
    if (n.codice !== null && !codiceOk(n.codice)) return null;
    return n;
  }
  /* per 404.html: /i/<slug>[/<codice>] → /i/?s=…[&c=…] ; null se non è una scorciatoia valida */
  function scorciatoia(pathname, search) {
    var m = /^\/i\/([^\/]+)(?:\/([^\/]+))?\/?$/i.exec(String(pathname || ""));
    if (!m) return null;
    var a = dec(m[1]), b = m[2] == null ? null : dec(m[2]);
    if (a == null || (m[2] != null && b == null)) return null;
    var n = norm(a, b);
    if (!slugOk(n.slug) || (n.codice !== null && !codiceOk(n.codice))) return null;
    var resto = String(search || "").replace(/^\?/, "").split("&").filter(function (kv) { return kv && !/^(s|c)=/.test(kv); });
    return "/i/?s=" + n.slug + (n.codice ? "&c=" + n.codice : "") + (resto.length ? "&" + resto.join("&") : "");
  }
  /* l'indirizzo che va dentro il QR; e quello dell'elenco */
  function link(slug, codice, base) { return (base || SITO) + "/i/" + String(slug).toLowerCase() + "/" + String(codice).toUpperCase(); }
  function linkElenco(slug, base) { return (base || SITO) + "/i/" + String(slug).toLowerCase(); }
  var I = { SITO: SITO, RISERVATI: RISERVATI, slugOk: slugOk, codiceOk: codiceOk, daIndirizzo: daIndirizzo, scorciatoia: scorciatoia, link: link, linkElenco: linkElenco };
  root.INVIndirizzo = I;
  if (typeof module === "object" && module && module.exports) module.exports = I;
})(typeof globalThis !== "undefined" ? globalThis : this);
