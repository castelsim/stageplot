/* Produzione eventi — il modulo di richiesta (produzione-eventi/, 13/11/2026).
   Servizio «Produzione eventi» di stageplot.it (livelli 1-3, prezzi «da», in prova): chi organizza un evento descrive
   cosa gli serve, Simone Castellan risponde entro un giorno lavorativo con 2-3 domande e il preventivo.

   COME ARRIVA. Come per il rider (rider-tecnico-completo/richiesta.js): nessun server nuovo, la richiesta passa dalla
   Edge Function del box segnalazioni (submit-feedback). Il messaggio (5-1000 caratteri, l'unica parte che la mail di avviso
   mostra) inizia con «RICHIESTA PRODUZIONE EVENTO» e porta il RIASSUNTO; il tech_context (fino a 32 KB) la richiesta intera,
   campo per campo. La mail di avviso va dove la manda la funzione (variabile NOTIFY_EMAIL): la casella produzione@stageplot.it
   è indicata in pagina come alternativa, non è il destinatario di questo modulo.

   PAGAMENTO. Nessuno: il modulo non chiede soldi; il preventivo scritto lo manda Simone dopo la richiesta.

   Il file ha due metà: funzioni PURE esportate su globalThis.ProduzioneRichiesta e, in Node, su module.exports (le prova
   test/produzione-richiesta.test.mjs); sotto, il collegamento al modulo vero, che parte solo nel browser. */
(function (root) {
  "use strict";

  /* ================================================================== 1. FUNZIONI PURE */

  var MSG_MIN = 5, MSG_MAX = 1000;          /* gli stessi limiti del server (feedback-validation.ts) */
  var TECH_MAX = 32768;                      /* tech_context oltre questo il server lo butta: si resta molto sotto */
  var INTESTAZIONE = "RICHIESTA PRODUZIONE EVENTO";
  var SERVIZIO = "produzione-eventi";
  var URL_INVIO = "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/submit-feedback";

  /* I campi del modulo: nome nel form · lunghezza massima · obbligatorio. Una lista sola per pulizia, controlli e test. */
  var CAMPI = [
    ["tipo", 40, true], ["data", 10, false], ["luogo", 100, true], ["persone", 40, false],
    ["presente", 40, false], ["livello", 40, false], ["budget", 60, false],
    ["descrizione", 1500, true], ["scadenze", 400, false],
    ["ente", 100, false], ["nome", 80, true], ["email", 120, true], ["telefono", 30, false],
    ["privacy", 3, true]
  ];
  var TIPI = ["concerto-piazza", "rassegna", "festa-azienda", "convention", "evento-band", "serata-location", "altro"];
  var PERSONE = ["fino-100", "100-300", "300-1000", "oltre-1000", "non-so"];
  var PRESENTE = ["niente", "palco", "palco-impianto", "non-so"];
  var LIVELLI = ["documenti", "distanza", "in-loco", "non-so"];
  var CAMPI_A_CAPO = { descrizione: 1, scadenze: 1 };

  /* Testo su una riga o a capo, senza caratteri di controllo, tagliato alla misura del campo */
  function pulito(v, max, aCapo) {
    var s = String(v == null ? "" : v).replace(/\r\n?/g, "\n");
    // eslint-disable-next-line no-control-regex
    s = s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ");
    s = aCapo ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : s.replace(/\s+/g, " ").trim();
    return s.slice(0, max);
  }

  function scelta(v, ammessi) { return ammessi.indexOf(v) < 0 ? "" : v; }

  /* Da un oggetto qualsiasi (FormData letta, test) ai soli campi noti, puliti */
  function datiPuliti(o) {
    o = o || {};
    var d = {};
    for (var i = 0; i < CAMPI.length; i++) {
      var k = CAMPI[i][0], max = CAMPI[i][1];
      d[k] = pulito(o[k], max, !!CAMPI_A_CAPO[k]);
    }
    d.tipo = scelta(d.tipo, TIPI);
    d.persone = scelta(d.persone, PERSONE);
    d.presente = scelta(d.presente, PRESENTE);
    d.livello = scelta(d.livello, LIVELLI);
    d.privacy = (o.privacy === true || o.privacy === "si" || o.privacy === "on") ? "si" : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data)) d.data = "";
    d.email = d.email.toLowerCase();
    return d;
  }

  function emailValida(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "")); }

  /* {campo: "frase"} per ciò che manca o non va; {} = si può inviare */
  function errori(d) {
    var out = {};
    if (!d.tipo) out.tipo = "Scegli che tipo di evento è.";
    if (!d.luogo) out.luogo = "Scrivi dove si svolge (anche solo il comune).";
    if (d.descrizione.length < 10) out.descrizione = "Raccontaci in breve cosa deve succedere.";
    if (!d.nome) out.nome = "Scrivi il tuo nome.";
    if (!emailValida(d.email)) out.email = "Serve un indirizzo email valido: rispondiamo lì.";
    if (d.privacy !== "si") out.privacy = "Serve il consenso per poterti rispondere.";
    return out;
  }

  var ETICHETTE = {
    tipo: {
      "concerto-piazza": "concerto in piazza", "rassegna": "rassegna o più serate", "festa-azienda": "festa aziendale",
      "convention": "convention o cena di gala", "evento-band": "evento di una band", "serata-location": "serata in una location",
      "altro": "altro"
    },
    persone: { "fino-100": "fino a 100", "100-300": "100-300", "300-1000": "300-1000", "oltre-1000": "oltre 1000", "non-so": "da definire" },
    presente: { "niente": "non c'è niente", "palco": "c'è il palco", "palco-impianto": "palco e impianto", "non-so": "da verificare" },
    livello: { "documenti": "documenti (1)", "distanza": "coordinamento a distanza (2)", "in-loco": "produzione in loco (3)", "non-so": "da capire" }
  };
  function data(d) { return d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : ""; }

  /* Il riassunto per la mail (≤ 1000 caratteri). Prima i contatti e il tipo di evento: se qualcosa va tagliato,
     si taglia la descrizione, mai a chi rispondere. */
  function messaggio(d) {
    var testa = [
      INTESTAZIONE,
      "Evento: " + ETICHETTE.tipo[d.tipo] + " · " + d.luogo + (d.data ? " · " + data(d.data) : ""),
      "Contatto: " + d.nome + (d.ente ? " (" + d.ente + ")" : "") + " · " + d.email + (d.telefono ? " · " + d.telefono : ""),
      [d.persone ? "persone: " + ETICHETTE.persone[d.persone] : "", d.presente ? "sul posto: " + ETICHETTE.presente[d.presente] : "",
        d.livello ? "interessa: " + ETICHETTE.livello[d.livello] : "", d.budget ? "budget: " + d.budget : ""].filter(Boolean).join(" · ")
    ].filter(function (r) { return r.trim(); }).join("\n");
    var righe = d.descrizione.split("\n").map(function (r) { return r.trim(); }).filter(Boolean);
    var coda = "\nDescrizione: " + righe.join(" / ") + (d.scadenze ? "\nScadenze: " + d.scadenze.replace(/\s+/g, " ") : "");
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
      tech_context: { servizio: SERVIZIO, prova: true, richiesta: d },
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
    if (status === 429) return { ok: false, testo: "Sono arrivate troppe richieste da qui: riprova fra un'ora, o scrivi a produzione@stageplot.it." };
    if (status === 400) return { ok: false, testo: "Qualcosa nel modulo non va: controlla i campi e riprova." };
    return { ok: false, testo: "La richiesta non è partita: controlla la connessione e riprova, o scrivi a produzione@stageplot.it." };
  }

  var PR = {
    CAMPI: CAMPI, MSG_MIN: MSG_MIN, MSG_MAX: MSG_MAX, TECH_MAX: TECH_MAX, INTESTAZIONE: INTESTAZIONE, URL_INVIO: URL_INVIO,
    TIPI: TIPI, PERSONE: PERSONE, PRESENTE: PRESENTE, LIVELLI: LIVELLI,
    pulito: pulito, datiPuliti: datiPuliti, emailValida: emailValida, errori: errori, messaggio: messaggio, corpo: corpo,
    esitoInvio: esitoInvio
  };
  root.ProduzioneRichiesta = PR;
  if (typeof module === "object" && module && module.exports) module.exports = PR;

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
          scrivi("Richiesta arrivata, grazie. Ti rispondiamo entro un giorno lavorativo all'indirizzo " +
            d.email + " con due o tre domande e il preventivo: controlla anche lo spam. Se hai una pianta del luogo, un programma o un vecchio rider, allegali rispondendo a quella mail.", "ok");
          esito.focus();
        } else scrivi(e.testo, "ko");
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", avvia);
  else avvia();
})(typeof globalThis !== "undefined" ? globalThis : this);
