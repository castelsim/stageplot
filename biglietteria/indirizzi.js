/* Biglietteria — gli indirizzi (specifica area §1). Script classico senza dipendenze: lo caricano 404.html (scorciatoie),
   le pagine pubbliche, l'area dell'organizzatore e «Le mie prenotazioni»; in Node lo provano i test (module.exports).
   Canonico: /biglietteria/?o=<org>[&s=<spettacolo>]. Scorciatoia (QR e link copiati): /biglietteria/<org>[/<spettacolo>].
   GitHub Pages non ha regole di riscrittura: un indirizzo che non è un file arriva a 404.html, che rimanda qui.
   Le parole riservate sono le stesse della 0074 (un test le confronta). */
(function (root) {
  "use strict";
  var RISERVATI = ["mie", "gestione", "nuovo", "admin", "api", "app", "aiuto", "privacy", "info", "stageplot",
    "biglietteria", "www", "test", "accedi", "esci", "login"];
  var SITO = "https://stageplot.it";
  function slugOk(s) { return typeof s === "string" && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s) && s.indexOf("--") < 0; }
  function slugOrgOk(s) { return slugOk(s) && RISERVATI.indexOf(s) < 0; }
  function scorciatoia(pathname, search) {
    var p = String(pathname || "").toLowerCase().replace(/\/+$/, "");
    var m = /^\/biglietteria\/([^\/]+)(?:\/([^\/]+))?$/.exec(p);
    if (!m || !slugOrgOk(m[1]) || (m[2] != null && !slugOk(m[2]))) return null;
    var resto = String(search || "").replace(/^\?/, "").split("&").filter(function (kv) { return kv && !/^(o|s)=/.test(kv); });
    return "/biglietteria/?o=" + m[1] + (m[2] ? "&s=" + m[2] : "") + (resto.length ? "&" + resto.join("&") : "");
  }
  function linkOrganizzatore(org, base) { return (base || SITO) + "/biglietteria/" + org; }
  function linkSpettacolo(org, s, base) { return linkOrganizzatore(org, base) + "/" + s; }
  function linkCanonico(org, s) { return "/biglietteria/?o=" + encodeURIComponent(org) + (s ? "&s=" + encodeURIComponent(s) : ""); }
  function urlLocandina(api, path) {
    if (typeof path !== "string" || !/^[0-9a-f-]{36}\/[0-9a-f]{32}\.(webp|jpg)$/.test(path)) return "";
    return String(api || "").replace(/\/+$/, "") + "/storage/v1/object/public/bgl-locandine/" + path;
  }
  var I = { RISERVATI: RISERVATI, slugOk: slugOk, slugOrgOk: slugOrgOk, scorciatoia: scorciatoia, linkOrganizzatore: linkOrganizzatore,
    linkSpettacolo: linkSpettacolo, linkCanonico: linkCanonico, urlLocandina: urlLocandina };
  root.BGLIndirizzi = I;
  if (typeof module === "object" && module && module.exports) module.exports = I;
})(typeof globalThis !== "undefined" ? globalThis : this);
