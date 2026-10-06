/* Biglietteria gratuita di StagePlot — pagina pubblica (stageplot.it/biglietteria/?e=<slug>).
   Nessuna libreria: fetch nudo verso le RPC pubbliche e verso l'Edge Function bgl-prenota.
   Il file ha due metà:
   1. funzioni PURE (nessun DOM, nessuna rete), esportate su globalThis.BGL e, in Node, su module.exports:
      le prova test/biglietteria.test.mjs;
   2. la pagina vera, che parte solo se nel documento c'è #bgl-app.
   Il pubblico vede solo libero/occupato: nomi ed email non arrivano mai a questa pagina (il server non li manda). */
(function (root) {
  "use strict";

  /* ================================================================== 1. FUNZIONI PURE */

  var API_PROD = "https://vsodplqkuvnsdiikvmjb.supabase.co";
  /* La stessa anon key dell'editor: è pubblica per costruzione (la RLS e i grant decidono cosa si può fare). */
  var ANON_PROD = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzb2RwbHFrdXZuc2RpaWt2bWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTkyNjksImV4cCI6MjA5ODE5NTI2OX0.rZmZSvOnrNY3cC2JQ8XnbMTKIfjP5WmtbCtQ6l8zPrc";
  var MAX_POSTI = 4;            /* tetto del contratto: mai più di 4, qualunque cosa dica la risposta */
  var BERSAGLIO_PX = 44;        /* un posto, ingrandito, è largo almeno così sullo schermo */
  var TOCCO_DIRETTO_PX = 30;    /* col dito: sotto questa misura il primo tocco ingrandisce invece di scegliere */
  var CLIC_DIRETTO_PX = 16;     /* col mouse basta molto meno */
  var CONTATTO = "info@stageplot.it";   /* a chi scrivere: gruppi più grandi, link rotti, problemi (lo stesso della mail) */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Dove sta il server. In produzione SEMPRE quello vero: ?api= e ?anon= valgono solo aprendo la pagina
     da localhost/127.0.0.1 (prove sullo stack locale). Altrimenti un link confezionato potrebbe mandare
     nome ed email di chi prenota a un server qualunque. */
  function configura(hostname, search) {
    var cfg = { api: API_PROD, anon: ANON_PROD, locale: false };
    if (hostname !== "localhost" && hostname !== "127.0.0.1") return cfg;
    cfg.locale = true;
    var q = new URLSearchParams(search || "");
    var api = (q.get("api") || "").replace(/\/+$/, "");
    if (/^https?:\/\/[A-Za-z0-9.\-]+(:\d{1,5})?$/.test(api)) cfg.api = api;
    var anon = q.get("anon") || "";
    if (/^[A-Za-z0-9._\-]{1,2000}$/.test(anon)) cfg.anon = anon;
    return cfg;
  }

  function slugValido(s) { return typeof s === "string" && /^[a-z2-9]{10}$/.test(s); }
  function tokenValido(s) { return typeof s === "string" && /^[0-9a-f]{32}$/.test(s); }

  /* Chiave del posto, identica a quella del server: settore|fila|posto («Platea|A|5»). */
  function chiave(settore, fila, posto) { return String(settore) + "|" + String(fila) + "|" + String(posto); }
  function parti(k) {
    var p = String(k).split("|");
    return { settore: p[0] || "", fila: p[1] || "", posto: parseInt(p[2], 10) || 0 };
  }

  /* Ordine delle file: prima le più corte (Z prima di AA, 9 prima di 10), poi l'alfabeto. */
  function cmpFila(a, b) {
    a = String(a); b = String(b);
    return (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);
  }
  function cmpSettore(a, b) {
    if (a === b) return 0;
    if (a === "Platea") return -1;
    if (b === "Platea") return 1;
    return String(a).localeCompare(String(b), "it", { sensitivity: "base" });
  }

  /* Il settore si nomina solo se serve: più settori nella pianta, o uno solo che non è «Platea». */
  function conSettore(pianta) {
    var visti = {};
    ((pianta && pianta.posti) || []).forEach(function (p) { visti[p.settore] = 1; });
    var nomi = Object.keys(visti);
    return nomi.length > 1 || (nomi.length === 1 && nomi[0] !== "Platea");
  }

  /* «A 5» (o «Galleria A 5» se i settori contano). */
  function etichetta(k, settore) {
    var p = parti(k);
    return (settore ? p.settore + " " : "") + p.fila + " " + p.posto;
  }

  function elencoE(v) {
    if (v.length <= 1) return v.join("");
    return v.slice(0, -1).join(", ") + " e " + v[v.length - 1];
  }
  function elencoPosti(keys, settore) {
    return elencoE(ordina(keys).map(function (k) { return etichetta(k, settore); }));
  }

  function ordina(keys) {
    return (keys || []).slice().sort(function (a, b) {
      var x = parti(a), y = parti(b);
      return cmpSettore(x.settore, y.settore) || cmpFila(x.fila, y.fila) || (x.posto - y.posto);
    });
  }

  /* Raggruppa per settore e fila: [{settore, fila, posti:[5,6]}], in ordine. */
  function raggruppa(keys) {
    var out = [], idx = {};
    ordina(keys).forEach(function (k) {
      var p = parti(k), g = p.settore + "|" + p.fila;
      if (!(g in idx)) { idx[g] = out.length; out.push({ settore: p.settore, fila: p.fila, posti: [] }); }
      out[idx[g]].posti.push(p.posto);
    });
    return out;
  }

  function nPosti(n) { return n + (n === 1 ? " posto" : " posti"); }

  /* Barra della scelta: «Fila A: 5, 6 — 2 posti» · più file: «Fila A: 5, 6 · Fila B: 3 — 3 posti». */
  function testoScelta(keys, settore) {
    if (!keys || !keys.length) return "";
    var g = raggruppa(keys).map(function (r) {
      return (settore ? r.settore + ", fila " : "Fila ") + r.fila + ": " + r.posti.join(", ");
    });
    return g.join(" · ") + " — " + nPosti(keys.length);
  }

  /* Conferma e mail: «Fila A, posti 5 e 6» · «Fila A, posto 5; fila B, posto 3». */
  function frasePosti(keys, settore) {
    var g = raggruppa(keys).map(function (r, i) {
      var f = (settore ? r.settore + ", fila " : (i === 0 ? "Fila " : "fila ")) + r.fila;
      return f + ", " + (r.posti.length === 1 ? "posto " : "posti ") + elencoE(r.posti.map(String));
    });
    return g.join("; ");
  }

  function maxPosti(evento) {
    var m = evento && evento.max_per_email;
    return (typeof m === "number" && m >= 1 && m <= MAX_POSTI) ? Math.floor(m) : MAX_POSTI;
  }

  /* Tocca un posto: se c'è lo toglie, se non c'è lo aggiunge — ma mai oltre il massimo (il quinto non entra). */
  function scegli(selezione, k, max) {
    var s = (selezione || []).slice(), i = s.indexOf(k);
    if (i >= 0) { s.splice(i, 1); return { selezione: s, avviso: null }; }
    if (s.length >= (max || MAX_POSTI)) return { selezione: s, avviso: "troppi_posti" };
    s.push(k);
    return { selezione: s, avviso: null };
  }

  /* I posti scelti che nel frattempo sono stati presi o tenuti da parte (aggiornamento ogni 20 s). */
  function daTogliere(selezione, occupati, riservati) {
    var o = {}, r = {};
    (occupati || []).forEach(function (k) { o[k] = 1; });
    (riservati || []).forEach(function (k) { r[k] = 1; });
    return (selezione || []).filter(function (k) { return o[k] || r[k]; });
  }

  /* Un messaggio in italiano per ogni codice d'errore (specifica §5). */
  function messaggio(errore, d, settore) {
    d = d || {};
    var max = d.max || MAX_POSTI, v;
    switch (errore) {
      case "evento_inesistente": return "Questa pagina di prenotazione non esiste. Controlla il link che ti hanno mandato.";
      case "prenotazioni_chiuse": return "Le prenotazioni sono chiuse.";
      case "posto_preso":
        v = d.presi || d.posti || [];
        if (v.length > 1) return "I posti " + elencoPosti(v, settore) + " sono appena stati presi: scegline altri.";
        if (v.length === 1) return "Il posto " + elencoPosti(v, settore) + " è appena stato preso: scegline un altro.";
        return "Uno dei posti che avevi scelto è appena stato preso: scegline un altro.";
      case "posto_riservato":
        v = d.posti || [];
        if (v.length > 1) return "I posti " + elencoPosti(v, settore) + " non sono prenotabili: scegline altri.";
        if (v.length === 1) return "Il posto " + elencoPosti(v, settore) + " non è prenotabile: scegline un altro.";
        return "Uno dei posti che avevi scelto non è prenotabile: scegline un altro.";
      case "posto_inesistente": return "La pianta è cambiata: ricarica la pagina e scegli di nuovo.";
      case "limite_email":
        return "Con questa email hai già " + nPosti(typeof d.gia === "number" ? d.gia : max) +
          ": se ne possono prenotare al massimo " + max + ". Per un gruppo più grande scrivi a " + CONTATTO + ".";
      case "limite_connessione":
        return "Da questa connessione sono già stati prenotati " + nPosti(typeof d.gia === "number" ? d.gia : (d.max || 8)) +
          ", il massimo. Per altri posti scrivi a " + CONTATTO + ".";
      case "troppi_posti": return "Puoi prenotare al massimo " + max + " posti. Per un gruppo più grande scrivi a " + CONTATTO + ".";
      case "dati_non_validi":
        return ({
          nome: "Scrivi il tuo nome",
          cognome: "Scrivi il tuo cognome",
          email: "Controlla l'email",
          posti: "Scegli almeno un posto"
        })[d.campo] || "Qualcosa non ha funzionato. Riprova fra un momento.";
      case "privacy_mancante": return "Per prenotare devi spuntare l'informativa sulla privacy.";
      case "troppe_richieste": return "Troppi tentativi da questa connessione: riprova fra qualche minuto.";
      case "token_non_valido": return "Questo link di disdetta non è valido: aprilo per intero dalla mail. Per un problema scrivi a " + CONTATTO + ".";
      case "gia_disdetta": return "Questa prenotazione è già stata disdetta.";
      case "evento_concluso": return "L'evento è già iniziato: non si può più disdire.";
      /* la richiesta è partita ma la risposta non è arrivata: la prenotazione può esserci. Riprovare è sicuro
         (stesso codice segreto: il server risponde con la stessa prenotazione, non con «posti presi») */
      case "senza_risposta":
        return "Non sappiamo se la prenotazione è andata a buon fine. Controlla la mail: se ti è arrivato il codice, è tutto a posto. " +
          "Altrimenti premi di nuovo «Prenota»: non rischi di prenotare due volte.";
      /* la richiesta non è proprio partita */
      case "offline": return "Sembra che tu non abbia connessione: i tuoi dati sono ancora qui, riprova appena torna la rete.";
      default: return "Qualcosa non ha funzionato. Riprova fra un momento.";
    }
  }

  /* Cosa mostra la pagina, dalla risposta di bgl_evento_pubblico. */
  function statoPagina(r) {
    if (r == null) return "caricamento";
    if (r.ok === false) return r.errore === "evento_inesistente" ? "inesistente" : "errore";
    if (!r.ok || !r.evento) return "errore";
    var s = r.evento.stato;
    if (s === "conclusa") return "conclusa";
    if (s === "chiusa") return "chiusa";
    if (s !== "aperta") return "errore";
    return (typeof r.liberi === "number" && r.liberi <= 0) ? "esaurita" : "aperta";
  }

  /* Date sempre nel fuso di Roma, qualunque sia il fuso del telefono. */
  function data(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric",
      month: "long", year: "numeric" }).format(d);
  }
  function ora(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit",
      hourCycle: "h23" }).format(d);
  }
  function dataOra(iso) { var g = data(iso); return g ? g + " · ore " + ora(iso) : ""; }

  /* «m…@example.invalid»: basta per riconoscerla, non la ripete per intero sullo schermo. */
  function mascheraEmail(e) {
    var s = String(e || ""), at = s.lastIndexOf("@");
    if (at < 1) return "";
    return s.charAt(0) + "…" + s.slice(at);
  }

  /* Il link della propria prenotazione (vedere, disdire). In locale porta con sé ?api= e ?anon=. */
  function linkMio(base, slug, token, cfg) {
    var u = base + "?e=" + encodeURIComponent(slug) + "&c=" + encodeURIComponent(token);
    if (cfg && cfg.locale) {
      if (cfg.api !== API_PROD) u += "&api=" + encodeURIComponent(cfg.api);
      if (cfg.anon !== ANON_PROD) u += "&anon=" + encodeURIComponent(cfg.anon);
    }
    return u;
  }
  function linkPianta(base, slug, cfg) {
    var u = base + "?e=" + encodeURIComponent(slug);
    if (cfg && cfg.locale) {
      if (cfg.api !== API_PROD) u += "&api=" + encodeURIComponent(cfg.api);
      if (cfg.anon !== ANON_PROD) u += "&anon=" + encodeURIComponent(cfg.anon);
    }
    return u;
  }

  /* Nome e cognome: la regola del server (bgl-validazione.ts, NOME_RE). Parole di sole lettere separate da
     spazi, un apostrofo o un trattino: niente cifre né «:/.@», così un nome non porta un indirizzo web. */
  var NOME_RE = null;
  try { NOME_RE = new RegExp("^[\\p{L}\\p{M}]+(?:(?: +|['\u2019]|-)[\\p{L}\\p{M}]+)*$", "u"); } catch (e) { NOME_RE = null; }
  function nomeValido(s) { return NOME_RE ? NOME_RE.test(s) : !/[0-9:/.@<>_!?#&=+;,()[\]{}"*%$|\\~^`]/.test(s); }

  /* Cosa manca nell'email, detto in parole. null = il formato va. */
  function erroreEmail(x) {
    var e = String(x == null ? "" : x).trim();
    if (!e) return "Scrivi la tua email";
    if (/\s/.test(e)) return "Togli gli spazi dall'email";
    var at = e.split("@").length - 1;
    if (at === 0) return "Manca la @ (per esempio nome@gmail.com)";
    if (at > 1) return "C'è più di una @";
    if (e.indexOf("@") === 0) return "Manca la parte prima della @";
    var dom = e.slice(e.indexOf("@") + 1);
    if (!/^[^.]+(\.[^.]+)+$/.test(dom)) return "Manca il punto dopo la @ (per esempio gmail.com)";
    if (e.length > 254) return "Controlla l'email";
    return null;
  }
  /* Domini che si scrivono spesso: a un errore di battitura (gmail.con, gmial.com, libero.ti, gmailcom) si
     propone quello giusto. Distanza 1 (una lettera in più, in meno, cambiata o due scambiate), oppure lo
     stesso dominio senza il punto. I domini veri vicini a questi (tin.it, mail.com…) sono nell'elenco. */
  var DOMINI = ["gmail.com", "googlemail.com", "hotmail.com", "hotmail.it", "libero.it", "yahoo.com", "yahoo.it", "icloud.com",
    "me.com", "outlook.com", "outlook.it", "live.com", "live.it", "alice.it", "virgilio.it", "tiscali.it", "tin.it", "tim.it",
    "fastwebnet.it", "email.it", "inwind.it", "mail.com", "gmx.com", "gmx.it", "aruba.it", "pec.it", "msn.com"];
  function distanza1(a, b) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return 2;
    var i = 0;
    while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) {
      if (a.slice(i + 1) === b.slice(i + 1)) return 1;                                     /* una cambiata */
      if (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return 1;   /* due scambiate */
      return 2;
    }
    return (la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)) ? 1 : 2;   /* una in più o in meno */
  }
  function suggerisciEmail(x) {
    var e = String(x == null ? "" : x).trim(), at = e.lastIndexOf("@");
    if (at < 1) return null;
    var dom = e.slice(at + 1).toLowerCase();
    if (!dom || DOMINI.indexOf(dom) >= 0) return null;
    if (dom === "gmail.it") return e.slice(0, at + 1) + "gmail.com";   /* Gmail non dà indirizzi @gmail.it: l'errore più comune */
    for (var i = 0; i < DOMINI.length; i++) {
      var d = DOMINI[i];
      if (dom.replace(/\./g, "") === d.replace(/\./g, "") || distanza1(dom, d) === 1) return e.slice(0, at + 1) + d;
    }
    return null;
  }

  /* Controlli del modulo prima di chiamare il server (il server li rifà comunque).
     o.emailAccettata: l'email che la persona ha confermato dopo il «Forse intendevi…?» */
  function controllaModulo(m, o) {
    var err = {};
    var nome = String(m.nome || "").trim(), cognome = String(m.cognome || "").trim(),
      email = String(m.email || "").trim();
    var ctrl = /[\u0000-\u001f\u007f]/, simboli = "Usa solo lettere: niente numeri, punti o simboli.";
    if (!nome || nome.length > 60 || ctrl.test(nome)) err.nome = messaggio("dati_non_validi", { campo: "nome" });
    else if (!nomeValido(nome)) err.nome = simboli;
    if (!cognome || cognome.length > 60 || ctrl.test(cognome)) err.cognome = messaggio("dati_non_validi", { campo: "cognome" });
    else if (!nomeValido(cognome)) err.cognome = simboli;
    var fe = erroreEmail(email);
    if (fe) err.email = fe;
    else {
      var sug = suggerisciEmail(email);
      if (sug && !(o && o.emailAccettata === email)) err.email = "Forse intendevi " + sug + "? Se l'indirizzo è giusto, premi di nuovo «Prenota».";
    }
    if (m.privacy !== true) err.privacy = messaggio("privacy_mancante");
    return err;
  }

  /* Perché fetch non ha avuto risposta: senza rete la richiesta non è partita; altrimenti (timeout, connessione
     caduta a metà) può essere arrivata al server. */
  function tipoErroreRete(err, online) {
    if (online === false) return "offline";
    return "senza_risposta";
  }

  /* Il codice segreto della prenotazione lo sceglie la pagina, uno per TENTATIVO (stesso evento, stessi posti,
     stessa email): se la risposta si perde e la persona ripreme «Prenota», il server riconosce la richiesta e
     risponde con la stessa prenotazione. casuale = crypto.getRandomValues (senza: niente codice, lo fa il server). */
  function firmaTentativo(slug, posti, email) {
    return slug + "|" + (posti || []).slice().sort().join(",") + "|" + String(email || "").trim().toLowerCase();
  }
  function tentativo(prima, slug, posti, email, casuale) {
    var f = firmaTentativo(slug, posti, email);
    if (prima && prima.firma === f && tokenValido(prima.token)) return prima;
    if (typeof casuale !== "function") return null;
    var b = casuale(new Uint8Array(16)), t = "";
    for (var i = 0; i < 16; i++) t += (b[i] < 16 ? "0" : "") + b[i].toString(16);
    return { firma: f, token: t };
  }

  /* Cosa si ricorda la scheda (sessionStorage) per una ricarica: posti, dati scritti, tentativo. Non la spunta
     dell'informativa, che si rimette a mano. */
  function daRicordare(S) {
    var m = S.modulo || {};
    return { scelti: (S.scelti || []).slice(0, MAX_POSTI),
      modulo: { nome: String(m.nome || "").slice(0, 60), cognome: String(m.cognome || "").slice(0, 60), email: String(m.email || "").slice(0, 254) },
      tentativo: S.tentativo && tokenValido(S.tentativo.token) ? { firma: String(S.tentativo.firma || ""), token: S.tentativo.token } : null };
  }
  function daRipristinare(v, ctx) {
    if (!v || typeof v !== "object") return null;
    var esiste = {}, via = {};
    ((ctx && ctx.posti) || []).forEach(function (p) { esiste[chiave(p.settore, p.fila, p.posto)] = 1; });
    ((ctx && ctx.occupati) || []).concat((ctx && ctx.riservati) || []).forEach(function (k) { via[k] = 1; });
    var scelti = (Array.isArray(v.scelti) ? v.scelti : []).filter(function (k) {
      return typeof k === "string" && k.length < 100 && esiste[k] && !via[k];
    }).slice(0, MAX_POSTI);
    var m = v.modulo && typeof v.modulo === "object" ? v.modulo : {};
    var t = v.tentativo && typeof v.tentativo === "object" && tokenValido(v.tentativo.token) && typeof v.tentativo.firma === "string"
      ? { firma: v.tentativo.firma, token: v.tentativo.token } : null;
    var testo = function (x, n) { return typeof x === "string" ? x.slice(0, n) : ""; };
    return { scelti: scelti, modulo: { nome: testo(m.nome, 60), cognome: testo(m.cognome, 60), email: testo(m.email, 254) }, tentativo: t };
  }

  /* Un posto che non si può scegliere, toccato: lo si dice invece di non rispondere. */
  function avvisoPosto(k, stato, settore) {
    if (stato === "occupato") return "Il posto " + etichetta(k, settore) + " è già occupato.";
    if (stato === "riservato") return "Il posto " + etichetta(k, settore) + " è tenuto da parte: non si può prenotare.";
    return null;
  }

  /* La riga d'aiuto sopra la pianta. fine = mouse (o penna): si clicca, non si tocca col dito. */
  function suggerimento(o) {
    if (!o.aperta) return "";
    if (o.fine) {
      return o.zoom ? "Clicca un posto libero per sceglierlo. Scorri la pianta con la rotellina o le barre."
        : "Clicca un posto libero per sceglierlo." + (o.serveZoom ? " «Ingrandisci» li mostra più grandi." : "");
    }
    if (!o.zoom && o.serveZoom) return "Tocca la pianta o allargala con due dita, poi scegli i posti.";
    if (o.zoom) return "Scorri la pianta con il dito, allarga o stringi con due dita. Tocca un posto libero per sceglierlo.";
    return "Tocca un posto libero per sceglierlo.";
  }

  /* --- geometria della pianta (cm) --- */

  function distanza(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function mediana(v) {
    if (!v.length) return 0;
    var s = v.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  /* Passo dei posti: la distanza tipica fra un posto e il vicino della stessa fila (e fra due file).
     Serve a dare a ogni posto un bersaglio grande quanto il suo spazio, senza sovrapporsi ai vicini. */
  function passi(pianta) {
    var posti = (pianta && pianta.posti) || [], file = {};
    posti.forEach(function (p) { (file[p.settore + "|" + p.fila] = file[p.settore + "|" + p.fila] || []).push(p); });
    var inFila = [], fraFile = [];
    posti.forEach(function (p) {
      var g = file[p.settore + "|" + p.fila], best = Infinity, altro = Infinity;
      g.forEach(function (q) { if (q !== p) best = Math.min(best, distanza(p, q)); });
      if (posti.length <= 400) {
        posti.forEach(function (q) {
          if (q.settore + "|" + q.fila !== p.settore + "|" + p.fila) altro = Math.min(altro, distanza(p, q));
        });
      }
      if (isFinite(best)) inFila.push(best);
      if (isFinite(altro)) fraFile.push(altro);
    });
    var w = mediana(posti.map(function (p) { return p.w; })) || 50,
      d = mediana(posti.map(function (p) { return p.d; })) || 50;
    var px = mediana(inFila) || w * 1.1, py = mediana(fraFile) || Math.max(d * 1.6, px);
    return { x: Math.max(w, px), y: Math.max(d, py), w: w, d: d };
  }

  /* Pixel per cm per vedere ogni posto almeno largo BERSAGLIO_PX. */
  function scalaDettaglio(pianta) {
    var p = passi(pianta);
    var lato = Math.min(p.x * 0.96, p.y * 0.96);
    return Math.min(4, BERSAGLIO_PX / Math.max(1, lato));
  }

  /* ZOOM CON DUE DITA (06/10, Simone: «ci dev'essere il pinch zoom»). Funzioni pure, provate in Node.
     limitiZoom: da «tutta la pianta» (min) a posti ben più grandi del dito (max).
     scalaPinch: la scala nuova dal rapporto fra le distanze delle dita, dentro i limiti.
     scrollPerFuoco: lo scorrimento che tiene il punto (cx,cy) della pianta sotto il punto (mx,my) dello schermo. */
  function limitiZoom(intera, dettaglio) {
    var min = intera, max = Math.max(dettaglio * 2.5, intera * 4);
    return { min: min, max: Math.max(min, max) };
  }
  function scalaPinch(k0, d0, d, lim) {
    if (!(d0 > 0) || !(d > 0) || !(k0 > 0)) return k0;
    return Math.min(lim.max, Math.max(lim.min, k0 * d / d0));
  }
  function scrollPerFuoco(cx, cy, k, mx, my) {
    return { l: Math.max(0, cx * k - mx), t: Math.max(0, cy * k - my) };
  }

  /* Dove scrivere la lettera della fila: ai due capi, un passo oltre il primo e l'ultimo posto. */
  function capiFile(pianta) {
    var posti = (pianta && pianta.posti) || [], file = {}, ordineFile = [];
    posti.forEach(function (p) {
      var g = p.settore + "|" + p.fila;
      if (!file[g]) { file[g] = []; ordineFile.push(g); }
      file[g].push(p);
    });
    return ordineFile.map(function (g) {
      var v = file[g].slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
      var a = v[0], b = v[v.length - 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy);
      var ux = l ? dx / l : 1, uy = l ? dy / l : 0, off = Math.max(a.w, 40) * 0.95;
      return { settore: a.settore, fila: a.fila,
        sx: Math.round(a.x - ux * off), sy: Math.round(a.y - uy * off),
        dx: Math.round(b.x + ux * off), dy: Math.round(b.y + uy * off),
        corpo: Math.round(Math.max(18, Math.min(a.d, a.w) * 0.62)) };
    });
  }

  function puntiPoligono(pp) {
    return (pp || []).map(function (q) { return (+q[0]) + "," + (+q[1]); }).join(" ");
  }
  function riquadro(pp) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    (pp || []).forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /* DOVE SI SCRIVE «PALCO» (06/10, prima prova vera). In StagePlot il «palco» è la superficie disegnata:
     in un teatro con la platea dentro il progetto (sala intera come palco, pedane in alto, sedie sotto)
     il palco CONTIENE i posti. Allora è la sala: niente colore da palco e la scritta va sulle pedane
     (o, senza pedane, nella fascia sopra la prima fila). Altrimenti, come prima, sul bordo del palco
     verso il pubblico. Ritorna {sala, x, y, corpo} oppure null se non c'è niente da scrivere. */
  function dovePalco(pianta) {
    var palchi = (pianta && pianta.palco) || [], posti = (pianta && pianta.posti) || [];
    if (!palchi.length) return null;
    var big = palchi.map(riquadro).sort(function (a, b) { return b.w * b.h - a.w * a.h; })[0];
    var dentro = posti.some(function (p) {
      return +p.x > big.x && +p.x < big.x + big.w && +p.y > big.y && +p.y < big.y + big.h;
    });
    if (!dentro) {
      var corpo = Math.max(30, Math.min(big.h * 0.22, big.w * 0.09, 140));
      return { sala: false, x: big.x + big.w / 2, y: big.y + big.h - Math.min(corpo * 0.9, big.h / 2), corpo: corpo };
    }
    var primaY = Infinity;
    posti.forEach(function (p) { primaY = Math.min(primaY, +p.y - (+p.d || 50) / 2); });
    var ped = ((pianta && pianta.pedane) || []).map(riquadro).filter(function (r) { return r.y + r.h <= primaY; });
    var area;
    if (ped.length) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      ped.forEach(function (r) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
      area = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    } else {
      area = { x: big.x, y: big.y, w: big.w, h: Math.max(0, primaY - big.y) };
    }
    if (area.h <= 0 || area.w <= 0) return { sala: true, x: big.x + big.w / 2, y: big.y + 40, corpo: 30 };
    var c = Math.max(30, Math.min(area.h * 0.3, area.w * 0.09, 140));
    return { sala: true, x: area.x + area.w / 2, y: area.y + area.h / 2, corpo: c };
  }

  var STATI_POSTO = { libero: "libero", scelto: "scelto da te", occupato: "occupato", riservato: "tenuto da parte" };

  function nomePosto(p, settore) {
    return (settore ? p.settore + ", fila " : "Fila ") + p.fila + ", posto " + p.posto;
  }

  /* Attributi di un posto per il suo stato: un posto libero o scelto è un bottone; gli altri solo un'immagine. */
  function attributiPosto(p, stato, settore, attiva) {
    var nome = nomePosto(p, settore) + ", " + STATI_POSTO[stato];
    var toccabile = attiva && (stato === "libero" || stato === "scelto");
    return {
      cls: "posto " + stato,
      role: toccabile ? "button" : "img",
      tabindex: toccabile ? "0" : null,
      pressed: toccabile ? (stato === "scelto" ? "true" : "false") : null,
      label: nome
    };
  }

  function statoDi(k, s) {
    if (s.scelti && s.scelti.indexOf(k) >= 0) return "scelto";
    if (s.occupati && s.occupati.indexOf(k) >= 0) return "occupato";
    if (s.riservati && s.riservati.indexOf(k) >= 0) return "riservato";
    return "libero";
  }

  /* La pianta in SVG (stringa). Coordinate già girate col palco in alto: si disegna e basta.
     s = {occupati:[k], riservati:[k], scelti:[k], attiva:bool}. Solo i campi della foto v1: niente altro. */
  function svgPianta(pianta, s) {
    s = s || {};
    var box = (pianta && pianta.box) || [0, 0, 1000, 1000], W = box[2], H = box[3];
    var settore = conSettore(pianta), ps = passi(pianta);
    var hx = Math.max(ps.w, ps.x * 0.96), hy = Math.max(ps.d, ps.y * 0.96);
    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" class="pianta-svg" role="group" ' +
      'aria-label="Pianta della sala: il palco è in alto, i posti sotto">');
    out.push('<defs><pattern id="bgl-tratt" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="14" height="14" class="tratt-fondo"/><line x1="0" y1="0" x2="0" y2="14" class="tratt-riga"/></pattern></defs>');
    out.push('<rect class="foglio" x="0" y="0" width="' + W + '" height="' + H + '"/>');
    var dp = dovePalco(pianta);
    ((pianta && pianta.palco) || []).forEach(function (pp) {
      out.push('<polygon class="' + (dp && dp.sala ? "sala" : "palco") + '" points="' + puntiPoligono(pp) + '"/>');
    });
    ((pianta && pianta.pedane) || []).forEach(function (pp) {
      out.push('<polygon class="' + (dp && dp.sala ? "palco" : "pedana") + '" points="' + puntiPoligono(pp) + '"/>');
    });
    if (dp) {
      out.push('<text class="palco-t" aria-hidden="true" x="' + Math.round(dp.x) + '" y="' + Math.round(dp.y) +
        '" font-size="' + Math.round(dp.corpo) + '">PALCO</text>');
    }
    capiFile(pianta).forEach(function (c) {
      var t = esc(c.fila);
      out.push('<text class="fila" aria-hidden="true" font-size="' + c.corpo + '" x="' + c.sx + '" y="' + c.sy + '">' + t + "</text>");
      out.push('<text class="fila" aria-hidden="true" font-size="' + c.corpo + '" x="' + c.dx + '" y="' + c.dy + '">' + t + "</text>");
    });
    ((pianta && pianta.posti) || []).forEach(function (p) {
      var k = chiave(p.settore, p.fila, p.posto), st = statoDi(k, s), a = attributiPosto(p, st, settore, !!s.attiva);
      var x = +p.x, y = +p.y, w = +p.w, d = +p.d, r = +p.rot || 0, rx = Math.round(Math.min(w, d) * 0.2);
      out.push('<g class="' + a.cls + '" data-k="' + esc(k) + '" data-x="' + x + '" data-y="' + y + '" role="' + a.role + '"' +
        (a.tabindex != null ? ' tabindex="' + a.tabindex + '"' : "") +
        (a.pressed != null ? ' aria-pressed="' + a.pressed + '"' : "") +
        ' aria-label="' + esc(a.label) + '">');
      out.push('<g transform="rotate(' + r + " " + x + " " + y + ')">');
      out.push('<rect class="hit" x="' + (x - hx / 2) + '" y="' + (y - hy / 2) + '" width="' + hx + '" height="' + hy + '"/>');
      out.push('<rect class="sedia" x="' + (x - w / 2) + '" y="' + (y - d / 2) + '" width="' + w + '" height="' + d + '" rx="' + rx + '"/>');
      out.push('<path class="croce" d="M' + (x - w * 0.22) + " " + (y - d * 0.22) + "L" + (x + w * 0.22) + " " + (y + d * 0.22) +
        "M" + (x + w * 0.22) + " " + (y - d * 0.22) + "L" + (x - w * 0.22) + " " + (y + d * 0.22) + '"/>');
      out.push("</g>");
      out.push('<text class="n" aria-hidden="true" x="' + x + '" y="' + y + '" font-size="' +
        Math.round(Math.min(w, d) * 0.46) + '"><tspan class="nf">' + esc(p.fila) + "</tspan>" + esc(p.posto) + "</text>");
      out.push("</g>");
    });
    out.push("</svg>");
    return out.join("");
  }

  var BGL = {
    API_PROD: API_PROD, ANON_PROD: ANON_PROD, MAX_POSTI: MAX_POSTI, BERSAGLIO_PX: BERSAGLIO_PX,
    esc: esc, configura: configura, slugValido: slugValido, tokenValido: tokenValido,
    chiave: chiave, parti: parti, etichetta: etichetta, ordina: ordina, raggruppa: raggruppa,
    conSettore: conSettore, testoScelta: testoScelta, frasePosti: frasePosti, elencoPosti: elencoPosti,
    maxPosti: maxPosti, scegli: scegli, daTogliere: daTogliere, messaggio: messaggio, statoPagina: statoPagina,
    data: data, ora: ora, dataOra: dataOra, mascheraEmail: mascheraEmail, linkMio: linkMio, linkPianta: linkPianta,
    controllaModulo: controllaModulo, passi: passi, scalaDettaglio: scalaDettaglio, limitiZoom: limitiZoom, scalaPinch: scalaPinch, scrollPerFuoco: scrollPerFuoco, capiFile: capiFile,
    attributiPosto: attributiPosto, svgPianta: svgPianta, dovePalco: dovePalco, nPosti: nPosti, CONTATTO: CONTATTO,
    nomeValido: nomeValido, erroreEmail: erroreEmail, suggerisciEmail: suggerisciEmail, tipoErroreRete: tipoErroreRete,
    tentativo: tentativo, daRicordare: daRicordare, daRipristinare: daRipristinare, avvisoPosto: avvisoPosto,
    suggerimento: suggerimento
  };
  root.BGL = BGL;
  if (typeof module === "object" && module && module.exports) module.exports = BGL;

  /* ================================================================== 2. LA PAGINA */

  if (typeof document === "undefined" || !document.getElementById("bgl-app")) return;

  var app = document.getElementById("bgl-app");
  var barra = document.getElementById("bgl-barra");
  var q = new URLSearchParams(location.search);
  var cfg = configura(location.hostname, location.search);
  var BASE = location.origin + location.pathname;
  var S = {
    slug: q.get("e") || "", token: q.get("c") || "",
    r: null, stato: "caricamento", occupati: [], riservati: [], scelti: [], pianta: null, piantaJson: "",
    schermata: "caricamento", avviso: null, avvisoTipo: "err", zoom: false, modulo: { nome: "", cognome: "", email: "", privacy: false },
    inviando: false, conferma: null, tentativo: null, emailAccettata: null, ripristinato: false
  };
  var TIMEOUT_MS = 20000;

  /* --- rete --- */
  function conTimeout(url, opt) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    if (ctrl) opt.signal = ctrl.signal;
    return fetch(url, opt).finally(function () { clearTimeout(t); });
  }
  function rpc(fn, args) {
    return conTimeout(cfg.api + "/rest/v1/rpc/" + fn, {
      method: "POST", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "apikey": cfg.anon, "Authorization": "Bearer " + cfg.anon, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    }).then(function (res) {
      if (!res.ok) throw new Error("http " + res.status);
      return res.json();
    });
  }
  function prenotaRete(corpo) {
    return conTimeout(cfg.api + "/functions/v1/bgl-prenota", {
      method: "POST", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
    }).then(function (res) {
      return res.json().then(function (d) { return { status: res.status, d: d }; },
        function () { return { status: res.status, d: { ok: false, errore: "errore_interno" } }; });
    });
  }

  /* --- memoria del telefono (solo comodità: la pagina funziona identica senza) --- */
  function ricordo() {
    try { var v = JSON.parse(localStorage.getItem("bgl:" + S.slug) || "null"); return v && tokenValido(v.token) ? v : null; }
    catch (e) { return null; }
  }
  function ricorda(v) { try { localStorage.setItem("bgl:" + S.slug, JSON.stringify(v)); } catch (e) { /* niente */ } }
  function dimentica() { try { localStorage.removeItem("bgl:" + S.slug); } catch (e) { /* niente */ } }
  /* La scheda ricorda posti scelti, dati scritti e tentativo (sessionStorage: sparisce chiudendo la scheda):
     una ricarica a metà, o il telefono che ricarica la pagina tornandoci, non fa ripartire da zero. */
  function salvaSessione() {
    try { sessionStorage.setItem("bgl-sessione:" + S.slug, JSON.stringify(daRicordare(S))); } catch (e) { /* niente */ }
  }
  function leggiSessione() {
    try { return JSON.parse(sessionStorage.getItem("bgl-sessione:" + S.slug) || "null"); } catch (e) { return null; }
  }
  function chiudiSessione() { try { sessionStorage.removeItem("bgl-sessione:" + S.slug); } catch (e) { /* niente */ } }

  /* --- cronologia: il tasto Indietro (o il gesto) dal modulo torna alla pianta, non esce dalla pagina --- */
  function statoStoria() { try { return (history.state && history.state.bgl) || null; } catch (e) { return null; } }
  function spingiStoria(v) { try { history.pushState({ bgl: v }, "", location.href); } catch (e) { /* niente */ } }
  function sostituisciStoria(v) { try { history.replaceState(v ? { bgl: v } : null, "", location.href); } catch (e) { /* niente */ } }
  function puntatoreFine() {
    try { return window.matchMedia("(pointer: fine)").matches; } catch (e) { return false; }
  }

  /* --- pezzi comuni --- */
  function intestazione(ev, conBadge) {
    var luogo = ev.luogo ? '<p class="ev-luogo">' + esc(ev.luogo) + "</p>" : "";
    var chiusura = "";
    if (ev.chiusura && ev.inizio && ev.chiusura !== ev.inizio && S.stato === "aperta") {
      chiusura = '<p class="ev-chiusura">Si prenota fino a ' + esc(data(ev.chiusura)) + ", ore " + esc(ora(ev.chiusura)) + "</p>";
    }
    return '<header class="ev">' +
      '<p class="ev-marchio">Prenotazione posti</p>' +
      '<h1 class="ev-titolo" tabindex="-1">' + esc(ev.titolo || "") + "</h1>" +
      '<p class="ev-quando">' + esc(dataOra(ev.inizio)) + "</p>" + luogo +
      (conBadge ? '<p class="ev-badge">Ingresso gratuito con prenotazione</p>' : "") + chiusura +
      (ev.note ? '<p class="ev-note">' + esc(ev.note) + "</p>" : "") +
      "</header>";
  }
  function legenda() {
    function voce(cls, t) {
      return '<li class="leg-' + cls + '"><svg viewBox="0 0 60 60" aria-hidden="true" class="leg-svg"><g class="posto ' + cls + '">' +
        '<rect class="sedia" x="6" y="6" width="48" height="48" rx="10"/>' +
        '<path class="croce" d="M19 19L41 41M41 19L19 41"/></g></svg>' + t + "</li>";
    }
    return '<ul class="legenda' + (S.stato === "aperta" ? "" : " sola-lettura") + '" aria-label="Legenda">' + voce("libero", "Libero") + voce("scelto", "Scelto da te") +
      voce("occupato", "Occupato") + voce("riservato", "Tenuto da parte") + "</ul>";
  }
  function piedino() {
    return '<footer class="piede"><a href="/privacy/#biglietteria" target="_blank" rel="noopener">Privacy</a>' +
      '<span>Problemi? <a href="mailto:' + CONTATTO + '">' + CONTATTO + "</a></span>" +
      "<span>Prenotazioni con StagePlot</span></footer>";
  }
  function messaggioPieno(titolo, testo, bottone, link) {
    S.schermata = "messaggio";
    app.innerHTML = '<div class="centro"><h1 tabindex="-1">' + esc(titolo) + "</h1>" + (testo ? "<p>" + esc(testo) + "</p>" : "") +
      (bottone ? '<button type="button" class="btn primario" id="bgl-riprova">' + esc(bottone) + "</button>" : "") +
      (link ? '<p class="disdici-riga"><a href="' + esc(link) + '">Vai alla pianta dei posti</a></p>' : "") + "</div>" + piedino();
    barra.hidden = true;
    var b = document.getElementById("bgl-riprova");
    if (b) b.addEventListener("click", function () { location.reload(); });
    fuoco();
  }
  function fuoco() {
    var h = app.querySelector("h1, h2");
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
  }

  /* --- schermata: la pianta --- */
  function settoreOn() { return conSettore(S.pianta); }

  /* Lo scorrimento della pianta ingrandita si ricorda: tornando dal modulo si riparte da dove si era. */
  function salvaScroll() {
    var m = document.getElementById("bgl-mappa");
    if (m) S.scroll = { l: m.scrollLeft, t: m.scrollTop };
  }
  function centraSu(k) {
    var m = document.getElementById("bgl-mappa"), g = m && m.querySelector('g.posto[data-k="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]');
    /* centra il posto nella pianta E nello schermo (sopra la barra in basso) */
    if (g && g.scrollIntoView) g.scrollIntoView({ block: "center", inline: "center" });
  }

  function disegnaPianta() {
    salvaScroll();
    S.schermata = "pianta";
    var r = S.r, ev = r.evento, st = S.stato, attiva = st === "aperta";
    var testa = "";
    if (st === "chiusa") testa = '<p class="nota forte" role="status">Le prenotazioni sono chiuse.</p>';
    else if (st === "esaurita") testa = '<p class="nota forte" role="status">Posti esauriti.</p>';
    var mio = ricordo(), giaMio = "";
    if (mio && mio.posti && mio.posti.some(function (k) { return S.occupati.indexOf(k) >= 0; })) {
      giaMio = '<p class="nota ok">Hai già prenotato: ' + esc(elencoPosti(mio.posti, settoreOn())) +
        ' · <a href="' + esc(linkMio(BASE, S.slug, mio.token, cfg)) + '">Vedi o disdici</a></p>';
    } else if (mio) { dimentica(); }
    var liberi = typeof r.liberi === "number" ? r.liberi : 0;
    app.innerHTML = intestazione(ev, true) +
      '<div class="corpo">' +
      '<section class="col-pianta" aria-labelledby="bgl-h-posti">' +
      giaMio + testa +
      '<div class="riga-posti"><h2 id="bgl-h-posti" class="conta" tabindex="-1">' +
        (liberi === 1 ? "1 posto libero" : liberi + " posti liberi") + "</h2>" +
        (attiva ? '<p class="sottotitolo">Scegli fino a ' + maxPosti(ev) + " posti</p>" : "") + "</div>" +
      legenda() +
      '<div class="attrezzi"><p class="suggerimento" id="bgl-sugg"></p>' +
        '<button type="button" class="btn piccolo" id="bgl-zoom" aria-pressed="false">Ingrandisci</button></div>' +
      (attiva ? '<a class="salta" href="#bgl-barra">Salta la pianta</a>' : "") +
      '<div class="mappa" id="bgl-mappa">' + svgPianta(S.pianta, { occupati: S.occupati, riservati: S.riservati,
        scelti: S.scelti, attiva: attiva }) + "</div>" +
      "</section>" +
      "</div>" + piedino();
    var mappa = document.getElementById("bgl-mappa");
    mappa.addEventListener("click", tocco);
    mappa.addEventListener("keydown", tasti);
    attivaPinch(mappa);
    document.getElementById("bgl-zoom").addEventListener("click", function () { impostaZoom(!S.zoom); });
    var salta = app.querySelector(".salta");
    if (salta) salta.addEventListener("click", function (e) {
      e.preventDefault();
      var a = document.getElementById("bgl-avanti");
      if (a) a.focus();
    });
    adatta();
    if (S.centraK) { centraSu(S.centraK); S.centraK = null; }
    else if (S.zoom && S.scroll) { mappa.scrollLeft = S.scroll.l; mappa.scrollTop = S.scroll.t; }
    disegnaBarra();
  }

  /* Due misure: la pianta intera (adatta allo schermo) e l'ingrandimento (ogni posto ≥ 44 px). Su un
     telefono la pianta intera ha i posti troppo piccoli per il dito: lì il primo tocco ingrandisce. */
  var scale = { intera: 1, dettaglio: 1 };
  function adatta() {
    var mappa = document.getElementById("bgl-mappa");
    if (!mappa || !S.pianta) return;
    var svg = mappa.querySelector("svg"), W = S.pianta.box[2], H = S.pianta.box[3];
    var maxH = parseFloat(getComputedStyle(mappa).maxHeight);
    var largo = mappa.clientWidth, alto = Math.max(260, isFinite(maxH) ? maxH - 2 : Math.min(window.innerHeight * 0.72, 760));
    scale.intera = Math.min(largo / W, alto / H);
    scale.dettaglio = Math.max(scale.intera, scalaDettaglio(S.pianta));
    var lim = limitiZoom(scale.intera, scale.dettaglio);
    /* S.kLibero: la scala scelta con le dita (o il trackpad); altrimenti le due misure fisse */
    if (S.kLibero != null) S.kLibero = Math.min(lim.max, Math.max(lim.min, S.kLibero));
    var k = S.kLibero != null ? S.kLibero : (S.zoom ? scale.dettaglio : scale.intera);
    scale.k = k;
    /* per eccesso: arrotondare per difetto farebbe un bersaglio da 43,9 px */
    svg.setAttribute("width", Math.ceil(W * k));
    svg.setAttribute("height", Math.ceil(H * k));
    var ps = passi(S.pianta);
    svg.classList.toggle("piccola", ps.w * k < 18);
    var serveZoom = Math.min(ps.x, ps.y) * 0.96 * scale.intera < sogliaTocco();
    mappa.classList.toggle("ingrandita", S.zoom);
    var z = document.getElementById("bgl-zoom");
    z.textContent = S.zoom ? "Vista intera" : "Ingrandisci";
    z.setAttribute("aria-pressed", S.zoom ? "true" : "false");
    z.hidden = !S.zoom && !serveZoom && scale.dettaglio <= scale.intera * 1.05;
    var sug = document.getElementById("bgl-sugg");
    sug.textContent = suggerimento({ aperta: S.stato === "aperta", zoom: S.zoom, serveZoom: serveZoom, fine: puntatoreFine() });
  }
  function sogliaTocco() {
    return puntatoreFine() ? CLIC_DIRETTO_PX : TOCCO_DIRETTO_PX;
  }
  function piccolaPerIlDito() {
    var ps = passi(S.pianta);
    return Math.min(ps.x, ps.y) * 0.96 * kAttuale() < sogliaTocco();
  }
  function kAttuale() { return scale.k || (S.zoom ? scale.dettaglio : scale.intera); }
  function impostaZoom(on, cx, cy) {
    var mappa = document.getElementById("bgl-mappa");
    if (!mappa) return;
    var prima = kAttuale();
    /* il punto da tenere al centro: quello toccato, o il centro di ciò che si vede adesso */
    if (cx == null) {
      cx = (mappa.scrollLeft + mappa.clientWidth / 2) / prima;
      cy = (mappa.scrollTop + mappa.clientHeight / 2) / prima;
    }
    S.zoom = on;
    S.kLibero = null;
    adatta();
    var k = kAttuale();
    mappa.scrollLeft = Math.max(0, cx * k - mappa.clientWidth / 2);
    mappa.scrollTop = Math.max(0, cy * k - mappa.clientHeight / 2);
  }

  /* Lo zoom con due dita (telefono) e col pizzico del trackpad o Ctrl+rotellina (computer): la scala
     cambia con continuità e il punto fra le dita resta sotto le dita. Il resto della pagina non si
     ingrandisce: dentro la pianta il gesto è suo (touch-action nel CSS). */
  var pinch = { attivo: false, d0: 0, k0: 1, cx: 0, cy: 0, fine: 0 };
  function applicaScala(k, cx, cy, mx, my) {
    var mappa = document.getElementById("bgl-mappa");
    if (!mappa) return;
    S.kLibero = k;
    S.zoom = k > scale.intera * 1.05;
    adatta();
    var sc = scrollPerFuoco(cx, cy, kAttuale(), mx, my);
    mappa.scrollLeft = sc.l; mappa.scrollTop = sc.t;
  }
  function puntoInMappa(mappa, x, y) {
    var r = mappa.getBoundingClientRect();
    return { mx: x - r.left, my: y - r.top };
  }
  function attivaPinch(mappa) {
    function due(e) {
      var a = e.touches[0], b = e.touches[1];
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    }
    mappa.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 2) return;
      var g = due(e), p = puntoInMappa(mappa, g.x, g.y), k = kAttuale();
      pinch.attivo = true; pinch.d0 = g.d; pinch.k0 = k;
      pinch.cx = (mappa.scrollLeft + p.mx) / k; pinch.cy = (mappa.scrollTop + p.my) / k;
    }, { passive: true });
    mappa.addEventListener("touchmove", function (e) {
      if (!pinch.attivo || e.touches.length !== 2) return;
      e.preventDefault();
      var g = due(e), p = puntoInMappa(mappa, g.x, g.y);
      var k = scalaPinch(pinch.k0, pinch.d0, g.d, limitiZoom(scale.intera, scale.dettaglio));
      applicaScala(k, pinch.cx, pinch.cy, p.mx, p.my);
    }, { passive: false });
    function stop(e) {
      if (!pinch.attivo || e.touches.length >= 2) return;
      pinch.attivo = false; pinch.fine = Date.now(); salvaScroll();
    }
    mappa.addEventListener("touchend", stop);
    mappa.addEventListener("touchcancel", stop);
    /* trackpad (Chrome, Firefox, Edge: pizzico = rotellina con Ctrl) e Ctrl+rotellina del mouse */
    mappa.addEventListener("wheel", function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      var p = puntoInMappa(mappa, e.clientX, e.clientY), k0 = kAttuale();
      var cx = (mappa.scrollLeft + p.mx) / k0, cy = (mappa.scrollTop + p.my) / k0;
      var k = Math.min(limitiZoom(scale.intera, scale.dettaglio).max,
        Math.max(scale.intera, k0 * Math.exp(-e.deltaY * 0.01)));
      applicaScala(k, cx, cy, p.mx, p.my);
    }, { passive: false });
    /* Safari sul Mac: il pizzico arriva come gesture* */
    var gs = null;
    mappa.addEventListener("gesturestart", function (e) {
      e.preventDefault();
      var p = puntoInMappa(mappa, e.clientX, e.clientY), k = kAttuale();
      gs = { k0: k, cx: (mappa.scrollLeft + p.mx) / k, cy: (mappa.scrollTop + p.my) / k };
    });
    mappa.addEventListener("gesturechange", function (e) {
      if (!gs) return;
      e.preventDefault();
      var p = puntoInMappa(mappa, e.clientX, e.clientY);
      applicaScala(scalaPinch(gs.k0, 1, e.scale, limitiZoom(scale.intera, scale.dettaglio)), gs.cx, gs.cy, p.mx, p.my);
    });
    mappa.addEventListener("gestureend", function () { gs = null; pinch.fine = Date.now(); salvaScroll(); });
  }

  function tocco(ev) {
    if (Date.now() - pinch.fine < 400) return;   /* il dito che si alza dopo lo zoom non è una scelta */
    if (S.stato !== "aperta") return;
    var g = ev.target.closest ? ev.target.closest("g.posto") : null;
    var bottone = g && g.getAttribute("role") === "button";
    /* detail === 0: clic da tastiera o da lettore di schermo — sceglie sempre, senza passare dallo zoom */
    if (ev.detail !== 0 && piccolaPerIlDito()) {
      var svg = document.querySelector("#bgl-mappa svg"), r = svg.getBoundingClientRect();
      var k0 = kAttuale();
      impostaZoom(true, (ev.clientX - r.left) / k0, (ev.clientY - r.top) / k0);
      /* col mouse il clic è preciso: il posto cliccato si sceglie anche mentre la pianta si ingrandisce */
      if (bottone && puntatoreFine()) toccaPosto(g.getAttribute("data-k"));
      return;
    }
    if (!g) return;
    if (!bottone) {
      /* occupato o tenuto da parte: si dice, invece di non rispondere */
      var k = g.getAttribute("data-k"), t = avvisoPosto(k, statoDi(k, S), settoreOn());
      if (t) { avviso(t, "info"); disegnaBarra(); }
      return;
    }
    toccaPosto(g.getAttribute("data-k"));
  }
  function toccaPosto(k) {
    var r = scegli(S.scelti, k, maxPosti(S.r.evento));
    S.scelti = r.selezione;
    avviso(r.avviso ? messaggio("troppi_posti", { max: maxPosti(S.r.evento) }) : null);
    aggiornaPosti();
    disegnaBarra();
    salvaSessione();
  }
  /* Tastiera: Invio/Spazio sceglie, le frecce si spostano sul posto libero più vicino in quella direzione. */
  function tasti(ev) {
    var g = ev.target.closest ? ev.target.closest("g.posto") : null;
    if (!g) return;
    if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
      ev.preventDefault();
      if (g.getAttribute("role") === "button") toccaPosto(g.getAttribute("data-k"));
      return;
    }
    var dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (!dir) return;
    ev.preventDefault();
    var x = +g.getAttribute("data-x"), y = +g.getAttribute("data-y"), best = null, bd = Infinity;
    app.querySelectorAll('#bgl-mappa g.posto[tabindex="0"]').forEach(function (h) {
      if (h === g) return;
      var dx = +h.getAttribute("data-x") - x, dy = +h.getAttribute("data-y") - y;
      var lungo = dx * dir[0] + dy * dir[1], lato = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
      if (lungo <= 0) return;
      var d = lungo + lato * 2.5;
      if (d < bd) { bd = d; best = h; }
    });
    if (best) best.focus();
  }

  /* Aggiorna i posti già disegnati senza rifare lo SVG: zoom, scorrimento e fuoco restano dove sono. */
  function aggiornaPosti() {
    var settore = settoreOn(), attiva = S.stato === "aperta", perK = {};
    (S.pianta.posti || []).forEach(function (p) { perK[chiave(p.settore, p.fila, p.posto)] = p; });
    app.querySelectorAll("#bgl-mappa g.posto").forEach(function (g) {
      var k = g.getAttribute("data-k"), p = perK[k];
      if (!p) return;
      var a = attributiPosto(p, statoDi(k, S), settore, attiva);
      g.setAttribute("class", a.cls);
      g.setAttribute("role", a.role);
      g.setAttribute("aria-label", a.label);
      if (a.tabindex != null) g.setAttribute("tabindex", a.tabindex); else g.removeAttribute("tabindex");
      if (a.pressed != null) g.setAttribute("aria-pressed", a.pressed); else g.removeAttribute("aria-pressed");
    });
  }

  function avviso(testo, tipo) { S.avviso = testo || null; S.avvisoTipo = tipo || "err"; }

  /* La barra in basso (sul computer: la colonna a destra). Cambia con la schermata. */
  /* La struttura si costruisce una volta per schermata; dopo si cambiano solo i testi, così le regioni
     «live» esistono già quando cambiano (il lettore di schermo le annuncia) e il fuoco non salta. */
  function disegnaBarra() {
    var modo = (S.schermata === "pianta" && S.stato === "aperta") ? "pianta" : (S.schermata === "modulo" ? "modulo" : "");
    if (!modo) { barra.hidden = true; barra.setAttribute("data-modo", ""); document.body.classList.remove("con-barra"); return; }
    barra.hidden = false;
    document.body.classList.add("con-barra");
    if (!document.getElementById("bgl-avviso")) {
      barra.innerHTML = '<div class="barra-dentro"><div id="bgl-avviso" class="avviso-slot" role="alert"></div>' +
        '<div id="bgl-barra-riga" class="barra-riga"></div></div>';
    }
    var riga = document.getElementById("bgl-barra-riga");
    if (barra.getAttribute("data-modo") !== modo) {
      barra.setAttribute("data-modo", modo);
      if (modo === "pianta") {
        riga.innerHTML = '<p class="barra-testo" id="bgl-scelta" aria-live="polite"></p>' +
          '<button type="button" class="btn primario" id="bgl-avanti">Avanti</button>';
        document.getElementById("bgl-avanti").addEventListener("click", function () {
          if (!S.scelti.length) { avviso(messaggio("dati_non_validi", { campo: "posti" })); disegnaBarra(); return; }
          avviso(null);
          spingiStoria("modulo");   /* Indietro, da qui, torna alla pianta */
          disegnaModulo();
        });
      } else {
        riga.innerHTML = '<button type="button" class="btn" id="bgl-indietro">Cambia posti</button>' +
          '<button type="submit" form="bgl-form" class="btn primario" id="bgl-prenota"></button>';
        document.getElementById("bgl-indietro").addEventListener("click", function () {
          if (S.inviando) return;
          /* lo stesso del tasto Indietro: se il modulo ha la sua voce nella cronologia, si torna indietro di una */
          if (statoStoria() === "modulo") { history.back(); return; }
          tornaAllaPianta();
        });
      }
    }
    var av = document.getElementById("bgl-avviso");
    av.textContent = S.avviso || "";
    av.className = "avviso-slot" + (S.avviso ? " avviso " + S.avvisoTipo : "");
    var n = S.scelti.length;
    if (modo === "pianta") {
      document.getElementById("bgl-scelta").textContent = n ? testoScelta(S.scelti, settoreOn()) : "Scegli i posti sulla pianta";
      var a = document.getElementById("bgl-avanti");
      if (n) a.removeAttribute("aria-disabled"); else a.setAttribute("aria-disabled", "true");
    } else {
      var b = document.getElementById("bgl-prenota");
      b.disabled = !!S.inviando;
      b.textContent = S.inviando ? "Prenoto…" : "Prenota " + (n === 1 ? "1 posto" : n + " posti");
    }
  }

  function tornaAllaPianta() {
    leggiModulo(); salvaSessione(); avviso(null); disegnaPianta(); fuoco();
  }

  /* --- schermata: il modulo --- */
  function disegnaModulo(errori) {
    salvaScroll();
    S.schermata = "modulo";
    errori = errori || {};
    var m = S.modulo, settore = settoreOn();
    function campo(id, etich, tipo, ac, extra) {
      var e = errori[id];
      var usa = (id === "email" && errori.emailSug)
        ? '<button type="button" class="btn piccolo" id="bgl-usa-email" data-email="' + esc(errori.emailSug) + '">Usa ' + esc(errori.emailSug) + "</button>" : "";
      return '<div class="campo' + (e ? " ha-errore" : "") + '"><label for="bgl-' + id + '">' + etich + "</label>" +
        '<input id="bgl-' + id + '" name="' + id + '" type="' + tipo + '" autocomplete="' + ac + '" maxlength="' +
        (id === "email" ? 254 : 60) + '" value="' + esc(m[id]) + '"' + (extra || "") +
        (e ? ' aria-invalid="true" aria-describedby="bgl-err-' + id + '"' : "") + ">" +
        (e ? '<p class="err" id="bgl-err-' + id + '">' + esc(e) + "</p>" + usa : "") + "</div>";
    }
    var ep = errori.privacy;
    app.innerHTML = intestazione(S.r.evento, false) +
      '<section class="modulo">' +
      '<h2 tabindex="-1">I tuoi dati</h2>' +
      '<div class="riepilogo"><p class="riep-k">I tuoi posti</p><p class="riep-v">' + esc(frasePosti(S.scelti, settore)) + "</p></div>" +
      '<form id="bgl-form" novalidate>' +
      campo("nome", "Nome", "text", "given-name", ' autocapitalize="words"') +
      campo("cognome", "Cognome", "text", "family-name", ' autocapitalize="words"') +
      campo("email", "Email", "email", "email", ' inputmode="email" autocapitalize="off" spellcheck="false"') +
      '<p class="aiuto">Ti mandiamo qui il codice della prenotazione e il link per disdire.</p>' +
      /* trappola per i programmi automatici: una persona non la vede e non la riempie */
      '<div class="trappola" aria-hidden="true"><label for="bgl-sito">Sito web</label>' +
        '<input id="bgl-sito" name="sito" type="text" tabindex="-1" autocomplete="off"></div>' +
      '<div class="campo spunta' + (ep ? " ha-errore" : "") + '"><input id="bgl-privacy" type="checkbox"' + (m.privacy ? " checked" : "") +
        (ep ? ' aria-invalid="true" aria-describedby="bgl-err-privacy"' : "") + ">" +
        '<label for="bgl-privacy">Ho letto l\'<a href="/privacy/#biglietteria" target="_blank" rel="noopener">informativa sulla privacy</a>: ' +
        "nome ed email servono solo per questa prenotazione e si cancellano 30 giorni dopo l'evento.</label>" +
        (ep ? '<p class="err" id="bgl-err-privacy">' + esc(ep) + "</p>" : "") + "</div>" +
      "</form></section>" + piedino();
    var form = document.getElementById("bgl-form");
    form.addEventListener("submit", function (e) { e.preventDefault(); invia(); });
    /* l'errore di un campo sparisce appena lo si corregge */
    function pulisci(ev) {
      var c = ev.target.closest(".campo");
      if (!c || !c.classList.contains("ha-errore")) return;
      c.classList.remove("ha-errore");
      ev.target.removeAttribute("aria-invalid");
      ev.target.removeAttribute("aria-describedby");
      var er = c.querySelector(".err"); if (er) er.remove();
    }
    form.addEventListener("input", pulisci);
    form.addEventListener("change", pulisci);
    form.addEventListener("input", function () { leggiModulo(); salvaSessione(); });
    var usa = document.getElementById("bgl-usa-email");
    if (usa) usa.addEventListener("click", function () {
      var i = document.getElementById("bgl-email");
      i.value = usa.getAttribute("data-email");
      leggiModulo(); salvaSessione();
      var c = i.closest(".campo"); c.classList.remove("ha-errore"); i.removeAttribute("aria-invalid"); i.removeAttribute("aria-describedby");
      var er = c.querySelector(".err"); if (er) er.remove(); usa.remove();
      i.focus();
    });
    disegnaBarra();
    var primo = app.querySelector('[aria-invalid="true"]');
    if (primo) primo.focus(); else fuoco();
    window.scrollTo(0, 0);
  }
  function leggiModulo() {
    var f = function (id) { var n = document.getElementById("bgl-" + id); return n ? n : null; };
    if (!f("nome")) return;
    S.modulo = { nome: f("nome").value, cognome: f("cognome").value, email: f("email").value, privacy: f("privacy").checked,
      sito: f("sito").value };
  }

  function casualeSicuro() {
    var c = root.crypto;
    return c && typeof c.getRandomValues === "function" ? function (a) { return c.getRandomValues(a); } : null;
  }

  function invia() {
    if (S.inviando) return;
    leggiModulo();
    var email = String(S.modulo.email || "").trim();
    var err = controllaModulo(S.modulo, { emailAccettata: S.emailAccettata });
    if (err.email && !erroreEmail(email) && suggerisciEmail(email)) {
      /* «Forse intendevi…?»: il secondo «Prenota» con la stessa email passa */
      S.emailAccettata = email; err.emailSug = suggerisciEmail(email);
    }
    if (Object.keys(err).length) { avviso(null); disegnaModulo(err); return; }
    S.tentativo = tentativo(S.tentativo, S.slug, S.scelti, email, casualeSicuro());
    salvaSessione();
    S.inviando = true; avviso(null); disegnaBarra();
    var m = S.modulo, corpo = { e: S.slug, posti: S.scelti.slice(), nome: m.nome.trim(), cognome: m.cognome.trim(),
      email: email, privacy: true, sito: m.sito || "" };
    if (S.tentativo) corpo.token = S.tentativo.token;
    prenotaRete(corpo)
      .then(function (res) { S.inviando = false; esito(res.d || {}); },
        function (e) {
          S.inviando = false;
          avviso(messaggio(tipoErroreRete(e, typeof navigator === "object" ? navigator.onLine : true)));
          disegnaBarra();
        });
  }

  function esito(d) {
    var settore = settoreOn(), max = maxPosti(S.r.evento);
    if (d.ok) {
      S.conferma = d;
      ricorda({ codice: d.codice, token: d.token, posti: d.posti });
      S.scelti = []; S.tentativo = null; S.emailAccettata = null;
      chiudiSessione();
      /* la conferma prende il posto del modulo nella cronologia: Indietro porta alla pianta */
      sostituisciStoria("conferma");
      return disegnaConferma();
    }
    var e = d.errore;
    if (e === "dati_non_validi" && d.campo === "token") S.tentativo = null;   /* un codice già usato: al prossimo giro uno nuovo */
    if (e === "posto_preso" || e === "posto_riservato") {
      var v = (e === "posto_preso" ? d.presi : d.posti) || [];
      v.forEach(function (k) {
        var lista = e === "posto_preso" ? S.occupati : S.riservati;
        if (lista.indexOf(k) < 0) lista.push(k);
      });
      S.scelti = S.scelti.filter(function (k) { return v.indexOf(k) < 0; });
      S.centraK = v[0] || null;
      avviso(messaggio(e, d, settore));
      disegnaPianta(); fuoco();
      return carica(true);
    }
    if (e === "posto_inesistente" || e === "troppi_posti" || (e === "dati_non_validi" && d.campo === "posti")) {
      if (e === "posto_inesistente") S.scelti = [];
      avviso(messaggio(e, { max: max, campo: d.campo }, settore));
      disegnaPianta(); fuoco();
      return carica(true);
    }
    if (e === "prenotazioni_chiuse") { avviso(messaggio(e)); return carica(true); }
    if (e === "evento_inesistente") return messaggioPieno("Pagina non trovata", messaggio(e));
    if (e === "dati_non_validi" && (d.campo === "nome" || d.campo === "cognome" || d.campo === "email")) {
      var x = {}; x[d.campo] = messaggio(e, d); return disegnaModulo(x);
    }
    if (e === "privacy_mancante") return disegnaModulo({ privacy: messaggio(e) });
    avviso(messaggio(e, { gia: d.gia, max: d.max || max }, settore));
    disegnaBarra();
  }

  /* --- schermata: conferma --- */
  function disegnaConferma() {
    S.schermata = "conferma";
    var d = S.conferma, settore = settoreOn(), ev = S.r.evento;
    var link = linkMio(BASE, S.slug, d.token, cfg);
    app.innerHTML = '<section class="conferma">' +
      '<p class="spunta-ok" aria-hidden="true">✓</p>' +
      '<h1 tabindex="-1">Prenotato!</h1>' +
      '<div class="biglietto">' +
        '<p class="big-k">Il tuo codice</p><p class="codice">' + esc(d.codice) + "</p>" +
        '<p class="big-posti">' + esc(frasePosti(d.posti || [], settore)) + "</p>" +
        '<p class="big-ev"><strong>' + esc(ev.titolo) + "</strong><br>" + esc(dataOra(ev.inizio)) + "<br>" + esc(ev.luogo || "") + "</p>" +
      "</div>" +
      '<p class="nota ok"><strong>All\'ingresso</strong> di\' il tuo cognome o mostra questo codice. L\'ingresso è gratuito.</p>' +
      (d.ripetuta
        ? '<p class="nota">La prenotazione era già registrata: la prima risposta si era persa per strada. Se non trovi la mail con il codice, fai uno screenshot di questa pagina.</p>'
        : d.mail === false
        ? '<p class="nota forte">La mail non è partita: fai uno screenshot di questa pagina.</p>'
        /* l'indirizzo intero: un errore di battitura (gmail.con) si vede qui, e non solo quando la mail non arriva */
        : '<p class="nota">Ti abbiamo mandato una mail a <strong class="email-intera">' + esc(String(S.modulo.email || "").trim()) +
          "</strong> con il codice e il link per disdire. Se l'indirizzo è sbagliato, fai uno screenshot di questa pagina.</p>") +
      '<p class="disdici-riga">Non puoi più venire? <a href="' + esc(link) + '">Disdici e libera i posti per altri</a></p>' +
      "</section>" + piedino();
    disegnaBarra();
    window.scrollTo(0, 0);
    fuoco();
  }

  /* --- schermata: la mia prenotazione (?c=) --- */
  function disegnaMia(r, fase, msg) {
    S.schermata = "mia";
    barra.hidden = true; document.body.classList.remove("con-barra");
    var ev = r.evento || {}, settore = r.posti && r.posti.some(function (k) { return parti(k).settore !== "Platea"; });
    var iniziato = new Date(ev.inizio).getTime() <= Date.now();
    var stato = r.stato, azioni = "", nota = "";
    if (fase === "disdetta") {
      nota = '<p class="nota ok" role="status">Prenotazione disdetta. I posti sono di nuovo liberi per altri.</p>';
    } else if (stato === "disdetta") {
      nota = '<p class="nota">' + esc(messaggio("gia_disdetta")) + "</p>";
    } else if (stato === "annullata") {
      nota = '<p class="nota">Questa prenotazione è stata annullata dall\'organizzatore.</p>';
    } else if (ev.stato === "conclusa") {
      nota = '<p class="nota">L\'evento si è già svolto.</p>';
    } else if (iniziato) {
      nota = '<p class="nota">' + esc(messaggio("evento_concluso")) + "</p>";
    } else if (fase === "conferma") {
      azioni = '<div class="chiedi" role="group" aria-labelledby="bgl-sicuro"><p id="bgl-sicuro"><strong>Sicuro?</strong> I posti tornano liberi per altri.</p>' +
        '<div class="azioni"><button type="button" class="btn pericolo" id="bgl-si">Sì, disdici</button>' +
        '<button type="button" class="btn" id="bgl-no">No, tengo i posti</button></div></div>';
    } else {
      azioni = '<div class="azioni"><button type="button" class="btn" id="bgl-disdici">Disdici la prenotazione</button></div>';
    }
    var errore = msg ? '<p class="avviso err" role="alert">' + esc(msg) + "</p>" : "";
    var posti = (r.posti && r.posti.length && fase !== "disdetta" && stato === "attiva")
      ? '<p class="big-posti">' + esc(frasePosti(r.posti, settore)) + "</p>" : "";
    app.innerHTML = intestazione(ev, false) +
      '<section class="mia"><h2 tabindex="-1">La tua prenotazione</h2>' +
      '<div class="biglietto"><p class="big-k">Codice</p><p class="codice' + (stato === "attiva" && fase !== "disdetta" ? "" : " spento") + '">' +
        esc(r.codice || "") + "</p>" + posti + "</div>" +
      errore + nota + azioni +
      '<p class="disdici-riga"><a href="' + esc(linkPianta(BASE, S.slug, cfg)) + '">Vai alla pianta dei posti</a></p>' +
      "</section>" + piedino();
    var b = document.getElementById("bgl-disdici");
    if (b) b.addEventListener("click", function () { disegnaMia(r, "conferma"); var s = document.getElementById("bgl-si"); if (s) s.focus(); });
    var no = document.getElementById("bgl-no");
    if (no) no.addEventListener("click", function () { disegnaMia(r); });
    var si = document.getElementById("bgl-si");
    if (si) si.addEventListener("click", function () {
      si.disabled = true; si.textContent = "Disdico…";
      rpc("bgl_disdici", { p_slug: S.slug, p_token: S.token }).then(function (d) {
        if (d && d.ok) {
          var mio = ricordo(); if (mio && mio.token === S.token) dimentica();
          return disegnaMia(r, "disdetta");
        }
        var e = d && d.errore;
        if (e === "gia_disdetta") { r.stato = "disdetta"; return disegnaMia(r); }
        disegnaMia(r, null, messaggio(e));
      }, function () { disegnaMia(r, null, messaggio("rete")); });
    });
    if (fase !== "conferma") fuoco();
  }

  /* --- caricamento e aggiornamento ogni 20 s --- */
  function applica(r) {
    S.r = r;
    S.stato = statoPagina(r);
    S.occupati = (r.occupati || []).slice();
    S.riservati = (r.riservati || []).slice();
    var nuova = JSON.stringify(r.pianta || null), cambiata = nuova !== S.piantaJson;
    S.pianta = r.pianta; S.piantaJson = nuova;
    if (r.evento && r.evento.titolo) document.title = r.evento.titolo + " — Prenota il posto";
    return cambiata;
  }

  function carica(silenzioso) {
    return rpc("bgl_evento_pubblico", { p_slug: S.slug }).then(function (r) {
      var statoPrima = S.stato, prima = S.schermata;
      var st = statoPagina(r);
      if (st === "inesistente") return messaggioPieno("Pagina non trovata", messaggio("evento_inesistente"));
      if (st === "errore") { if (!silenzioso) messaggioPieno("Qualcosa non ha funzionato", messaggio("rete"), "Riprova"); return; }
      var cambiata = applica(r);
      if (!S.ripristinato) {
        S.ripristinato = true;
        var v = daRipristinare(leggiSessione(), { posti: (S.pianta && S.pianta.posti) || [], occupati: S.occupati, riservati: S.riservati });
        if (v) { S.scelti = v.scelti; S.modulo.nome = v.modulo.nome; S.modulo.cognome = v.modulo.cognome; S.modulo.email = v.modulo.email; S.tentativo = v.tentativo; }
      }
      if (st === "conclusa") {
        S.schermata = "messaggio"; barra.hidden = true; document.body.classList.remove("con-barra");
        app.innerHTML = intestazione(r.evento, false) + '<div class="centro"><p class="nota">L\'evento si è già svolto.</p></div>' + piedino();
        return;
      }
      /* posti scelti che intanto sono stati presi */
      var via = daTogliere(S.scelti, S.occupati, S.riservati);
      if (via.length) {
        S.scelti = S.scelti.filter(function (k) { return via.indexOf(k) < 0; });
        avviso(messaggio("posto_preso", { presi: via }, settoreOn()));
      }
      if (st !== "aperta") S.scelti = [];
      if (prima === "conferma" || prima === "mia") return;
      /* sul modulo non si ridisegna niente mentre la persona scrive: si aggiornano solo riepilogo e barra */
      if (prima === "modulo" && st === "aperta" && S.scelti.length && !cambiata) {
        if (via.length) {
          var rv = app.querySelector(".riep-v");
          if (rv) rv.textContent = frasePosti(S.scelti, settoreOn());
          disegnaBarra();
        }
        return;
      }
      if (prima === "pianta" && st === statoPrima && !cambiata) {
        aggiornaPosti(); aggiornaConta();
        if (via.length) disegnaBarra();
        return;
      }
      if (prima === "modulo") leggiModulo();
      disegnaPianta();
      /* ricaricata a metà del modulo: si torna lì, con posti e dati */
      if (prima === "caricamento" && statoStoria() === "modulo") {
        if (st === "aperta" && S.scelti.length) { disegnaModulo(); return; }
        sostituisciStoria(null);
      }
      if (!silenzioso || prima !== "pianta") fuoco();
    }, function () {
      if (!silenzioso) messaggioPieno("Non riesco a caricare i posti", "Controlla la connessione e riprova.", "Riprova");
    });
  }
  function aggiornaConta() {
    var h = document.getElementById("bgl-h-posti"), l = S.r.liberi;
    if (h) h.textContent = l === 1 ? "1 posto libero" : l + " posti liberi";
  }

  function avvia() {
    if (!slugValido(S.slug)) return messaggioPieno("Pagina non trovata", messaggio("evento_inesistente"));
    if (S.token) {
      if (!tokenValido(S.token)) return messaggioPieno("Link non valido", messaggio("token_non_valido"), null, linkPianta(BASE, S.slug, cfg));
      rpc("bgl_mia_prenotazione", { p_slug: S.slug, p_token: S.token }).then(function (r) {
        if (!r || !r.ok) return messaggioPieno("Link non valido", messaggio(r && r.errore === "token_non_valido" ? "token_non_valido" : (r && r.errore) || "rete"),
          null, linkPianta(BASE, S.slug, cfg));
        disegnaMia(r);
      }, function () { messaggioPieno("Non riesco a caricare la prenotazione", "Controlla la connessione e riprova.", "Riprova"); });
      return;
    }
    window.addEventListener("popstate", function () {
      var dove = statoStoria();
      if (S.schermata === "modulo" && dove !== "modulo") {
        if (S.inviando) { spingiStoria("modulo"); return; }   /* mentre si prenota si resta qui */
        tornaAllaPianta();
      } else if (S.schermata === "conferma" && dove !== "conferma") {
        S.conferma = null; S.schermata = "caricamento"; carica(false);
      } else if (S.schermata === "pianta" && dove === "modulo") {
        if (S.stato === "aperta" && S.scelti.length) { avviso(null); disegnaModulo(); } else sostituisciStoria(null);
      }
    });
    carica(false);
    setInterval(function () {
      if (document.visibilityState === "visible" && !S.inviando && (S.schermata === "pianta" || S.schermata === "modulo")) carica(true);
    }, 20000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && !S.inviando && (S.schermata === "pianta" || S.schermata === "modulo")) carica(true);
    });
    var rt = null;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (S.schermata === "pianta") adatta(); }, 120);
    });
  }

  avvia();
})(typeof globalThis !== "undefined" ? globalThis : this);
