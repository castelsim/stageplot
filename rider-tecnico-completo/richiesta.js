/* Rider tecnico completo — il modulo di richiesta (rider-tecnico-completo/, 11/11/2026).
   Servizio a 59 € deciso da Simone l'11/11/2026: la band chiede, il rider lo prepariamo noi, Simone lo controlla.

   COME ARRIVA. Non c'è un server nuovo: la richiesta passa dalla stessa Edge Function del box segnalazioni
   (submit-feedback), come fa la biglietteria (biglietteria/segnala.js). Così il modulo funziona appena la pagina va
   online, senza distribuire funzioni né migrazioni. La riga finisce nella tabella `feedback` (si legge con
   ops/segnalazioni.sh apri <id>) e parte la mail di avviso. Il server accetta un messaggio fra 5 e 1000 caratteri e un
   tech_context fino a 32 KB: nel messaggio va il RIASSUNTO (è l'unica parte che la mail mostra), nel tech_context la
   richiesta intera, campo per campo.

   PAGAMENTO. Nessuno: il modulo non chiede soldi. Il modo di pagare lo decide Simone (TECH_RIDER/PAGAMENTO_proposta.md).

   Il file ha due metà: funzioni PURE esportate su globalThis.RiderRichiesta e, in Node, su module.exports (le prova
   test/rider-richiesta.test.mjs); sotto, il collegamento al modulo vero, che parte solo nel browser. */
(function (root) {
  "use strict";

  /* ================================================================== 1. FUNZIONI PURE */

  var MSG_MIN = 5, MSG_MAX = 1000;          /* gli stessi limiti del server (feedback-validation.ts) */
  var TECH_MAX = 32768;                      /* tech_context oltre questo il server lo butta: si resta molto sotto */
  var INTESTAZIONE = "RICHIESTA RIDER TECNICO COMPLETO (59 €)";
  var SERVIZIO = "rider-tecnico-completo";
  var PREZZO = 59;
  var URL_INVIO = "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/submit-feedback";

  /* I campi del modulo: nome nel form · lunghezza massima · obbligatorio. Una lista sola per pulizia, controlli e test. */
  var CAMPI = [
    ["band", 80, true], ["genere", 80, false], ["zona", 80, false],
    ["musicisti", 3, true], ["formazione", 1500, true],
    ["ascolti", 40, false], ["palco", 60, false], ["fonico", 40, false],
    ["materiali", 1000, false], ["rider_vecchio", 3, false],
    ["data", 10, false], ["note", 1500, false],
    ["nome", 80, true], ["email", 120, true], ["telefono", 30, false],
    ["privacy", 3, true]
  ];
  var ASCOLTI = ["spie", "in-ear", "misto", "non-so"];
  var PALCHI = ["piccolo", "medio", "grande", "cambia"];
  var FONICI = ["nostro", "del-locale", "non-so"];

  /* Testo su una riga o a capo, senza caratteri di controllo, tagliato alla misura del campo */
  function pulito(v, max, aCapo) {
    var s = String(v == null ? "" : v).replace(/\r\n?/g, "\n");
    // eslint-disable-next-line no-control-regex
    s = s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​‎‏‪-‮⁦-⁩]/g, " ");
    s = aCapo ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : s.replace(/\s+/g, " ").trim();
    return s.slice(0, max);
  }

  /* Da un oggetto qualsiasi (FormData letta, test) ai soli campi noti, puliti */
  function datiPuliti(o) {
    o = o || {};
    var d = {};
    for (var i = 0; i < CAMPI.length; i++) {
      var k = CAMPI[i][0], max = CAMPI[i][1];
      d[k] = pulito(o[k], max, k === "formazione" || k === "note" || k === "materiali");
    }
    if (ASCOLTI.indexOf(d.ascolti) < 0) d.ascolti = "";
    if (PALCHI.indexOf(d.palco) < 0) d.palco = "";
    if (FONICI.indexOf(d.fonico) < 0) d.fonico = "";
    d.rider_vecchio = (o.rider_vecchio === true || o.rider_vecchio === "si" || o.rider_vecchio === "on") ? "si" : "";
    d.privacy = (o.privacy === true || o.privacy === "si" || o.privacy === "on") ? "si" : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data)) d.data = "";
    var n = parseInt(d.musicisti, 10);
    d.musicisti = (n >= 1 && n <= 99) ? String(n) : "";
    d.email = d.email.toLowerCase();
    return d;
  }

  function emailValida(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "")); }

  /* {campo: "frase"} per ciò che manca o non va; {} = si può inviare */
  function errori(d) {
    var out = {};
    if (!d.band) out.band = "Scrivi il nome della band.";
    if (!d.musicisti) out.musicisti = "Quanti siete sul palco? (da 1 a 99)";
    if (d.formazione.length < 10) out.formazione = "Scrivi chi suona cosa, anche in breve.";
    if (!d.nome) out.nome = "Scrivi il tuo nome.";
    if (!emailValida(d.email)) out.email = "Serve un indirizzo email valido: rispondiamo lì.";
    if (d.privacy !== "si") out.privacy = "Serve il consenso per poterti rispondere.";
    return out;
  }

  var ETICHETTE = {
    ascolti: { "spie": "spie", "in-ear": "in-ear", "misto": "spie e in-ear", "non-so": "da decidere" },
    palco: { "piccolo": "piccolo (fino a 4×3 m)", "medio": "medio (circa 6×4 m)", "grande": "grande (8×6 m e oltre)", "cambia": "cambia ogni volta" },
    fonico: { "nostro": "fonico della band", "del-locale": "fonico del locale/service", "non-so": "da decidere" }
  };
  function data(d) { return d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : ""; }

  /* Il riassunto per la mail (≤ 1000 caratteri). Prima i contatti e il nome della band: se qualcosa va tagliato,
     si taglia la formazione, mai a chi rispondere. */
  function messaggio(d) {
    var testa = [
      INTESTAZIONE,
      "Band: " + d.band + (d.genere ? " (" + d.genere + ")" : "") + (d.zona ? " · " + d.zona : ""),
      "Contatto: " + d.nome + " · " + d.email + (d.telefono ? " · " + d.telefono : ""),
      "Musicisti: " + d.musicisti +
        (d.ascolti ? " · ascolti: " + ETICHETTE.ascolti[d.ascolti] : "") +
        (d.palco ? " · palco: " + ETICHETTE.palco[d.palco] : "") +
        (d.fonico ? " · " + ETICHETTE.fonico[d.fonico] : ""),
      (d.data ? "Serve per il " + data(d.data) + ". " : "") + (d.rider_vecchio ? "Ha un rider vecchio da mandare. " : "") +
        (d.materiali ? "Materiali: " + d.materiali.replace(/\s+/g, " ") : "")
    ].filter(function (r) { return r.trim(); }).join("\n");
    var coda = "\nFormazione: " + d.formazione.replace(/\s+/g, " ") + (d.note ? "\nNote: " + d.note.replace(/\s+/g, " ") : "");
    var tutto = testa + coda;
    if (tutto.length <= MSG_MAX) return tutto;
    var resto = MSG_MAX - testa.length - 30;
    var codaCorta = resto > 0 ? coda.slice(0, resto).replace(/\s+\S*$/, "") : "";
    return (testa.slice(0, MSG_MAX - 30) + codaCorta + "\n[continua nella richiesta]").slice(0, MSG_MAX);
  }

  /* Il corpo per submit-feedback (campi di feedback-validation.ts). Niente progetto, niente schermata, niente account:
     l'email di chi scrive viaggia nel messaggio e nel tech_context, perché la risposta va a lei. */
  function corpo(d, ctx) {
    ctx = ctx || {};
    return {
      message: messaggio(d),
      hint: null,
      honeypot: String(ctx.honeypot || ""),
      tech_context: { servizio: SERVIZIO, prezzo_eur: PREZZO, richiesta: d },
      meta: {
        app_version: "servizio/" + SERVIZIO,
        page_url: "https://stageplot.it/" + SERVIZIO + "/",
        user_agent: String(ctx.userAgent || "").slice(0, 500),
        viewport: String(ctx.viewport || "").slice(0, 40),
        language: String(ctx.lingua || "").slice(0, 20)
      },
      screenshot: null
    };
  }

  /* La risposta del server, in parole */
  function esitoInvio(status, j) {
    if (status === 200 && j && j.ok) return { ok: true };
    if (status === 429) return { ok: false, testo: "Sono arrivate troppe richieste da qui: riprova fra un'ora, o scrivi a info@stageplot.it." };
    if (status === 400) return { ok: false, testo: "Qualcosa nel modulo non va: controlla i campi e riprova." };
    return { ok: false, testo: "La richiesta non è partita: controlla la connessione e riprova, o scrivi a info@stageplot.it." };
  }

  var RR = {
    CAMPI: CAMPI, MSG_MIN: MSG_MIN, MSG_MAX: MSG_MAX, TECH_MAX: TECH_MAX, INTESTAZIONE: INTESTAZIONE, URL_INVIO: URL_INVIO,
    ASCOLTI: ASCOLTI, PALCHI: PALCHI, FONICI: FONICI,
    pulito: pulito, datiPuliti: datiPuliti, emailValida: emailValida, errori: errori, messaggio: messaggio, corpo: corpo,
    esitoInvio: esitoInvio
  };
  root.RiderRichiesta = RR;
  if (typeof module === "object" && module && module.exports) module.exports = RR;

  /* ================================================================== 2. IL MODULO VERO (solo browser) */

  if (typeof document === "undefined") return;

  function avvia() {
    var form = document.getElementById("richiesta-form");
    if (!form) return;
    var esito = document.getElementById("richiesta-esito");
    var bottone = form.querySelector("button[type=submit]");

    function leggi() {
      var o = {};
      for (var i = 0; i < CAMPI.length; i++) {
        var k = CAMPI[i][0], el = form.elements[k];
        if (!el) continue;
        o[k] = el.type === "checkbox" ? (el.checked ? "si" : "") : el.value;
      }
      return o;
    }
    function mostraErrori(err) {
      var primo = null;
      for (var i = 0; i < CAMPI.length; i++) {
        var k = CAMPI[i][0], el = form.elements[k], box = document.getElementById("err-" + k);
        if (!el) continue;
        if (err[k]) { el.setAttribute("aria-invalid", "true"); if (!primo) primo = el; }
        else el.removeAttribute("aria-invalid");
        if (box) box.textContent = err[k] || "";
      }
      if (primo) primo.focus();
    }
    function scrivi(testo, tipo) {
      esito.textContent = testo;
      esito.className = "esito " + (tipo || "");
      esito.hidden = !testo;
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var d = datiPuliti(leggi());
      var err = errori(d);
      mostraErrori(err);
      if (Object.keys(err).length) { scrivi("Mancano alcune cose: le trovi segnate in rosso.", "ko"); return; }
      var body = corpo(d, {
        honeypot: form.elements.sito ? form.elements.sito.value : "",
        userAgent: navigator.userAgent, viewport: innerWidth + "x" + innerHeight, lingua: navigator.language
      });
      bottone.disabled = true;
      scrivi("Invio in corso…", "");
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;   /* una richiesta che non torna mai: dopo 20 s si dice */
      fetch(URL_INVIO, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) { return esitoInvio(r.status, j); });
      }, function () { return esitoInvio(0, null); }).then(function (e) {
        if (timer) clearTimeout(timer);
        bottone.disabled = false;
        if (e.ok) {
          form.hidden = true;
          scrivi("Richiesta arrivata, grazie. Ti scriviamo da simone@stageplot.it entro un giorno lavorativo all'indirizzo " +
            d.email + ": controlla anche lo spam. Se hai un rider vecchio, allegalo rispondendo a quella mail.", "ok");
          esito.focus();
        } else scrivi(e.testo, "ko");
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", avvia);
  else avvia();
})(typeof globalThis !== "undefined" ? globalThis : this);
