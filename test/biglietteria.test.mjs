/* Biglietteria — pagina pubblica (biglietteria/bgl.js + i file statici intorno).
   node --test test/biglietteria.test.mjs
   Il fuso del processo è spostato apposta in California: le date della pagina devono uscire in ora di Roma
   QUALUNQUE sia il fuso del telefono (un test che gira su un Mac già a Roma non lo direbbe). */
process.env.TZ = "America/Los_Angeles";

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const B = require(join(root, "biglietteria/bgl.js"));
const I = require(join(root, "biglietteria/indirizzi.js"));
const leggi = (p) => readFileSync(join(root, p), "utf8");

/* Pianta di prova: 3 file inventate, numerazione da sinistra. */
function piantaProva(extra) {
  const posti = [];
  ["A", "B", "C"].forEach((f, i) => {
    for (let n = 1; n <= 6; n++) posti.push({ k: "Platea|" + f + "|" + n, settore: "Platea", fila: f, posto: n,
      x: 300 + n * 56, y: 900 + i * 95, w: 50, d: 53, rot: 0, ...(extra || {}) });
  });
  return { v: 1, box: [0, 0, 1000, 1300], palco: [[[100, 100], [900, 100], [900, 600], [100, 600]]],
    pedane: [[[400, 200], [600, 200], [600, 300], [400, 300]]], posti };
}

test("chiave, parti ed etichetta del posto: la stessa regola del server", () => {
  assert.equal(B.chiave("Platea", "A", 5), "Platea|A|5");
  assert.deepEqual(B.parti("Galleria|BB|12"), { settore: "Galleria", fila: "BB", posto: 12 });
  assert.equal(B.etichetta("Platea|A|5"), "A 5");
  assert.equal(B.etichetta("Galleria|A|5", true), "Galleria A 5");
});

test("la scelta si legge come la direbbe una persona: «Fila A: 5, 6 — 2 posti»", () => {
  assert.equal(B.testoScelta(["Platea|A|6", "Platea|A|5"]), "Fila A: 5, 6 — 2 posti");
  assert.equal(B.testoScelta(["Platea|A|5"]), "Fila A: 5 — 1 posto");
  /* ordine numerico, non alfabetico: 9 prima di 10 */
  assert.equal(B.testoScelta(["Platea|A|10", "Platea|A|9"]), "Fila A: 9, 10 — 2 posti");
  assert.equal(B.testoScelta(["Platea|B|3", "Platea|A|6", "Platea|A|5"]), "Fila A: 5, 6 · Fila B: 3 — 3 posti");
  /* Z prima di AA, 9 prima di 10 anche nelle file */
  assert.deepEqual(B.raggruppa(["Platea|AA|1", "Platea|Z|1"]).map((g) => g.fila), ["Z", "AA"]);
  assert.deepEqual(B.raggruppa(["Platea|10|1", "Platea|9|1"]).map((g) => g.fila), ["9", "10"]);
  /* con più settori il settore si dice, e la Platea viene prima */
  assert.equal(B.testoScelta(["Galleria|A|1", "Platea|C|2"], true), "Platea, fila C: 2 · Galleria, fila A: 1 — 2 posti");
  assert.equal(B.testoScelta([]), "");
});

test("frase dei posti per la conferma: «Fila A, posti 5 e 6»", () => {
  assert.equal(B.frasePosti(["Platea|A|6", "Platea|A|5"]), "Fila A, posti 5 e 6");
  assert.equal(B.frasePosti(["Platea|A|5", "Platea|A|6", "Platea|A|7"]), "Fila A, posti 5, 6 e 7");
  assert.equal(B.frasePosti(["Platea|B|3", "Platea|A|5"]), "Fila A, posto 5; fila B, posto 3");
});

test("il settore si nomina solo se serve", () => {
  assert.equal(B.conSettore(piantaProva()), false);
  const p = piantaProva(); p.posti[0].settore = "Galleria";
  assert.equal(B.conSettore(p), true);
  const g = piantaProva({ settore: "Galleria" });
  assert.equal(B.conSettore(g), true, "un solo settore che non è Platea si dice");
});

test("al massimo 4 posti: il quinto tocco non aggiunge e avvisa", () => {
  let s = [];
  for (const k of ["Platea|A|1", "Platea|A|2", "Platea|A|3", "Platea|A|4"]) {
    const r = B.scegli(s, k, 4);
    assert.equal(r.avviso, null);
    s = r.selezione;
  }
  const quinto = B.scegli(s, "Platea|A|5", 4);
  assert.equal(quinto.avviso, "troppi_posti");
  assert.equal(quinto.selezione.length, 4);
  assert.equal(quinto.selezione.indexOf("Platea|A|5"), -1, "il quinto non entra");
  /* toccare un posto scelto lo toglie, e allora se ne può prendere un altro */
  const via = B.scegli(s, "Platea|A|2", 4);
  assert.deepEqual(via.selezione, ["Platea|A|1", "Platea|A|3", "Platea|A|4"]);
  assert.equal(B.scegli(via.selezione, "Platea|A|5", 4).selezione.length, 4);
  /* il tetto viene dal contratto, mai più di 4 qualunque cosa dica la risposta */
  assert.equal(B.maxPosti({ max_per_email: 4 }), 4);
  assert.equal(B.maxPosti({ max_per_email: 9 }), 4);
  assert.equal(B.maxPosti({ max_per_email: 2 }), 2);
  assert.equal(B.maxPosti({}), 4);
  assert.equal(B.MAX_POSTI, 4);
  assert.equal(B.scegli(["a", "b", "c", "d"], "e").avviso, "troppi_posti", "senza max esplicito vale 4");
});

test("posti scelti che intanto sono stati presi o tenuti da parte escono dalla scelta", () => {
  assert.deepEqual(B.daTogliere(["Platea|A|1", "Platea|A|2", "Platea|A|3"], ["Platea|A|2"], ["Platea|A|3"]),
    ["Platea|A|2", "Platea|A|3"]);
  assert.deepEqual(B.daTogliere(["Platea|A|1"], [], []), []);
});

test("ogni codice d'errore ha il suo messaggio (specifica §5)", () => {
  const m = B.messaggio;
  assert.equal(m("evento_inesistente"), "Questa pagina di prenotazione non esiste. Controlla il link che ti hanno mandato.");
  assert.equal(m("prenotazioni_chiuse"), "Le prenotazioni sono chiuse.");
  assert.equal(m("posto_preso", { presi: ["Platea|A|5"] }), "Il posto A 5 è appena stato preso: scegline un altro.");
  assert.equal(m("posto_preso", { presi: ["Platea|A|6", "Platea|A|5"] }), "I posti A 5 e A 6 sono appena stati presi: scegline altri.");
  assert.equal(m("posto_preso", { presi: ["Platea|A|5", "Platea|A|6", "Platea|B|1"] }),
    "I posti A 5, A 6 e B 1 sono appena stati presi: scegline altri.");
  assert.equal(m("posto_riservato", { posti: ["Platea|A|1"] }), "Il posto A 1 non è prenotabile: scegline un altro.");
  assert.equal(m("posto_riservato", { posti: ["Platea|A|1", "Platea|A|2"] }), "I posti A 1 e A 2 non sono prenotabili: scegline altri.");
  assert.equal(m("posto_inesistente"), "La pianta è cambiata: ricarica la pagina e scegli di nuovo.");
  assert.equal(m("limite_email", { gia: 2, max: 4 }), "Con questa email hai già 2 posti: se ne possono prenotare al massimo 4. Per un gruppo più grande scrivi a info@stageplot.it.");
  assert.equal(m("limite_email", { gia: 1, max: 4 }), "Con questa email hai già 1 posto: se ne possono prenotare al massimo 4. Per un gruppo più grande scrivi a info@stageplot.it.");
  assert.equal(m("troppi_posti"), "Puoi prenotare al massimo 4 posti. Per un gruppo più grande scrivi a info@stageplot.it.");
  assert.equal(m("dati_non_validi", { campo: "nome" }), "Scrivi il tuo nome");
  assert.equal(m("dati_non_validi", { campo: "cognome" }), "Scrivi il tuo cognome");
  assert.equal(m("dati_non_validi", { campo: "email" }), "Controlla l'email");
  assert.equal(m("dati_non_validi", { campo: "posti" }), "Scegli almeno un posto");
  assert.equal(m("privacy_mancante"), "Per prenotare devi spuntare l'informativa sulla privacy.");
  assert.equal(m("troppe_richieste"), "Troppi tentativi da questa connessione: riprova fra qualche minuto.");
  for (const e of ["richiesta_troppo_grande", "metodo_non_ammesso", "errore_interno", "rete", undefined]) {
    assert.equal(m(e), "Qualcosa non ha funzionato. Riprova fra un momento.", String(e));
  }
  assert.equal(m("token_non_valido"), "Questo link di disdetta non è valido: aprilo per intero dalla mail. Per un problema scrivi a info@stageplot.it.");
  assert.equal(m("gia_disdetta"), "Questa prenotazione è già stata disdetta.");
  assert.equal(m("evento_concluso"), "L'evento è già iniziato: non si può più disdire.");
  /* con più settori, il settore entra nel nome del posto */
  assert.equal(m("posto_preso", { presi: ["Galleria|A|5"] }, true), "Il posto Galleria A 5 è appena stato preso: scegline un altro.");
});

test("cosa mostra la pagina, dalla risposta del server", () => {
  const ev = (stato, liberi) => ({ ok: true, evento: { stato }, liberi });
  assert.equal(B.statoPagina(null), "caricamento");
  assert.equal(B.statoPagina({ ok: false, errore: "evento_inesistente" }), "inesistente");
  assert.equal(B.statoPagina({ ok: false, errore: "altro" }), "errore");
  assert.equal(B.statoPagina(ev("aperta", 96)), "aperta");
  assert.equal(B.statoPagina(ev("aperta", 0)), "esaurita");
  assert.equal(B.statoPagina(ev("chiusa", 50)), "chiusa");
  assert.equal(B.statoPagina(ev("chiusa", 0)), "chiusa", "chiusa vince su esaurita");
  assert.equal(B.statoPagina(ev("conclusa", 10)), "conclusa");
  assert.equal(B.statoPagina(ev("boh", 10)), "errore");
});

test("date e ore sempre in ora di Roma, anche da un telefono in un altro fuso", () => {
  assert.equal(new Date("2026-10-09T19:00:00Z").getHours(), 12, "il processo è davvero in California");
  assert.equal(B.data("2026-10-09T19:00:00+00:00"), "venerdì 9 ottobre 2026");
  assert.equal(B.ora("2026-10-09T19:00:00+00:00"), "21:00");
  assert.equal(B.dataOra("2026-10-09T19:00:00+00:00"), "venerdì 9 ottobre 2026 · ore 21:00");
  /* ora solare: a dicembre Roma è UTC+1 */
  assert.equal(B.ora("2026-12-01T20:00:00Z"), "21:00");
  /* a mezzanotte di Roma il giorno è già il successivo */
  assert.equal(B.data("2026-10-09T22:30:00Z"), "sabato 10 ottobre 2026");
  assert.equal(B.dataOra("non una data"), "");
});

test("?api= e ?anon= valgono SOLO su localhost: in produzione il server è sempre quello vero", () => {
  const q = "?e=k3m9x2p7qa&api=http://127.0.0.1:54321&anon=chiave.locale";
  const prod = B.configura("stageplot.it", q);
  assert.equal(prod.api, B.API_PROD);
  assert.equal(prod.anon, B.ANON_PROD);
  assert.equal(prod.locale, false);
  for (const h of ["www.stageplot.it", "localhost.example.invalid", "127.0.0.1.example.invalid", "castelsim.github.io"]) {
    assert.equal(B.configura(h, q).api, B.API_PROD, h);
  }
  const loc = B.configura("127.0.0.1", q);
  assert.equal(loc.api, "http://127.0.0.1:54321");
  assert.equal(loc.anon, "chiave.locale");
  assert.equal(B.configura("localhost", q).api, "http://127.0.0.1:54321");
  /* anche in locale niente di strano */
  assert.equal(B.configura("localhost", "?api=javascript:alert(1)").api, B.API_PROD);
  assert.equal(B.configura("localhost", "?api=http://x.invalid/percorso").api, B.API_PROD);
  assert.equal(B.configura("localhost", "?api=http://127.0.0.1:54321/").api, "http://127.0.0.1:54321");
  assert.equal(B.configura("localhost", "").api, B.API_PROD);
  assert.match(B.API_PROD, /^https:\/\/vsodplqkuvnsdiikvmjb\.supabase\.co$/);
});

test("slug e token: solo nel formato del server", () => {
  assert.ok(B.slugValido("k3m9x2p7qa"));
  assert.ok(!B.slugValido("K3M9X2P7QA"));
  assert.ok(!B.slugValido("k3m9x2p7q"));
  assert.ok(!B.slugValido("k3m9x2p7q1"), "niente 0/1 nell'alfabeto");
  assert.ok(B.tokenValido("0123456789abcdef0123456789abcdef"));
  assert.ok(!B.tokenValido("0123456789abcdef"));
});

test("email mascherata e link della propria prenotazione", () => {
  assert.equal(B.mascheraEmail("mario.rossi@example.invalid"), "m…@example.invalid");
  assert.equal(B.mascheraEmail("x"), "");
  const t = "0123456789abcdef0123456789abcdef";
  const prod = B.configura("stageplot.it", "?api=http://127.0.0.1:54321");
  assert.equal(B.linkMio("https://stageplot.it/biglietteria/", "k3m9x2p7qa", t, prod),
    "https://stageplot.it/biglietteria/?e=k3m9x2p7qa&c=" + t);
  const loc = B.configura("127.0.0.1", "?api=http://127.0.0.1:54321&anon=abc");
  assert.equal(B.linkMio("http://127.0.0.1:8995/biglietteria/", "k3m9x2p7qa", t, loc),
    "http://127.0.0.1:8995/biglietteria/?e=k3m9x2p7qa&c=" + t + "&api=http%3A%2F%2F127.0.0.1%3A54321&anon=abc");
});

test("il modulo controlla i campi prima di disturbare il server", () => {
  const ok = { nome: "Mario", cognome: "Rossi", email: "mario.rossi@example.invalid", privacy: true };
  assert.deepEqual(B.controllaModulo(ok), {});
  assert.deepEqual(Object.keys(B.controllaModulo({ ...ok, nome: "  " })), ["nome"]);
  assert.deepEqual(Object.keys(B.controllaModulo({ ...ok, cognome: "x".repeat(61) })), ["cognome"]);
  assert.deepEqual(Object.keys(B.controllaModulo({ ...ok, email: "mario@" })), ["email"]);
  assert.deepEqual(Object.keys(B.controllaModulo({ ...ok, nome: "Ma\u0007rio" })), ["nome"]);
  assert.deepEqual(Object.keys(B.controllaModulo({ ...ok, privacy: false })), ["privacy"]);
  assert.equal(B.controllaModulo({ ...ok, privacy: false }).privacy, "Per prenotare devi spuntare l'informativa sulla privacy.");
});

test("pianta: ogni posto libero è un bottone con un nome che si capisce, gli altri no", () => {
  const p = piantaProva();
  const svg = B.svgPianta(p, { occupati: ["Platea|A|2"], riservati: ["Platea|A|1"], scelti: ["Platea|B|3"], attiva: true });
  const posti = [...svg.matchAll(/<g class="posto ([a-z]+)" data-k="([^"]+)"[^>]*>/g)];
  assert.equal(posti.length, 18);
  const di = (k) => posti.find((m) => m[2] === k)[0];
  assert.match(di("Platea|A|3"), /role="button" tabindex="0" aria-pressed="false" aria-label="Fila A, posto 3, libero"/);
  assert.match(di("Platea|B|3"), /class="posto scelto".*role="button" tabindex="0" aria-pressed="true" aria-label="Fila B, posto 3, scelto da te"/);
  assert.match(di("Platea|A|2"), /class="posto occupato".*role="img" aria-label="Fila A, posto 2, occupato"/);
  assert.doesNotMatch(di("Platea|A|2"), /tabindex/);
  assert.match(di("Platea|A|1"), /class="posto riservato".*role="img" aria-label="Fila A, posto 1, tenuto da parte"/);
  assert.match(svg, /class="palco-t"[^>]*>PALCO</);
  /* lettera della fila ai due capi */
  assert.equal((svg.match(/<text class="fila"[^>]*>A</g) || []).length, 2);
  /* prenotazioni chiuse: nessun posto si può toccare */
  const chiusa = B.svgPianta(p, { occupati: [], riservati: [], scelti: [], attiva: false });
  assert.doesNotMatch(chiusa, /tabindex|role="button"/);
});

test("pianta: si disegnano solo i campi della foto, niente altro arriva sulla pagina", () => {
  const p = piantaProva({ label: "Mario Rossi", email: "mario.rossi@example.invalid", nota: "ospite" });
  p.extra = "Mario Rossi";
  const svg = B.svgPianta(p, { attiva: true });
  assert.doesNotMatch(svg, /Mario|@|ospite/);
  /* e il testo che arriva dal server è sempre escapato */
  const q = piantaProva({ settore: "<b>x</b>", fila: "A\"><script>" });
  const s2 = B.svgPianta(q, { attiva: true });
  assert.doesNotMatch(s2, /<script>|<b>x/);
});

test("pianta: ingrandita, ogni posto è largo almeno 44 px sullo schermo", () => {
  const p = piantaProva();
  const ps = B.passi(p);
  assert.equal(ps.x, 56, "passo nella fila");
  assert.equal(ps.y, 95, "passo fra le file");
  const k = B.scalaDettaglio(p);
  assert.ok(Math.min(ps.x, ps.y) * 0.96 * k >= 44 - 1e-9, "bersaglio " + Math.min(ps.x, ps.y) * 0.96 * k);
  /* il bersaglio invisibile non si sovrappone al vicino */
  const svg = B.svgPianta(p, { attiva: true });
  const hit = svg.match(/<rect class="hit"[^>]*width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(+hit[1] <= 56 && +hit[1] >= 50, "largo quanto il passo: " + hit[1]);
});

test("lettere delle file ai capi, anche per una fila storta", () => {
  const c = B.capiFile(piantaProva());
  assert.equal(c.length, 3);
  assert.ok(c[0].sx < 356 && c[0].dx > 636, "fuori dal primo e dall'ultimo posto");
  assert.equal(c[0].sy, 900);
  /* fila in diagonale: le lettere seguono la fila, oltre il primo e l'ultimo posto */
  const storta = { v: 1, box: [0, 0, 1000, 1000], palco: [], pedane: [], posti: [1, 2, 3].map((n) => (
    { settore: "Platea", fila: "D", posto: n, x: 300 + n * 60, y: 300 + n * 60, w: 50, d: 50, rot: 45 })) };
  const d = B.capiFile(storta)[0];
  assert.ok(d.sx < 360 && d.sy < 360, "prima del primo posto: " + d.sx + "," + d.sy);
  assert.ok(d.dx > 480 && d.dy > 480, "dopo l'ultimo: " + d.dx + "," + d.dy);
});

/* --- i file statici intorno alla pagina --- */

test("la pagina non va su Google, non passa il link ad altri siti, e parla solo col nostro server", () => {
  const h = leggi("biglietteria/index.html");
  assert.match(h, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(h, /<meta name="referrer" content="no-referrer">/);
  const csp = (h.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src https:\/\/vsodplqkuvnsdiikvmjb\.supabase\.co http:\/\/127\.0\.0\.1:54321 http:\/\/localhost:54321;/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(h, /window\.self!==window\.top/, "anti-incorniciamento");
  assert.doesNotMatch(h, /maximum-scale|user-scalable/, "lo zoom della pagina non si spegne");
  assert.match(h, /<script src="bgl\.js\?v=\d+"><\/script>/);
  assert.equal(leggi("sitemap.xml").indexOf("biglietteria"), -1, "fuori dalla sitemap");
  assert.equal(leggi("robots.txt").indexOf("biglietteria"), -1, "robots.txt non si tocca");
  /* nessun indirizzo esterno nel codice oltre al server di produzione */
  const js = leggi("biglietteria/bgl.js");
  /* oltre al server: il calendario di Google (un link che la persona apre, non una chiamata) e stageplot.it stesso
     (l'indirizzo della scheda scritto dentro il file .ics) */
  const host = [...js.matchAll(/https?:\/\/([a-z0-9.\-]+)/gi)].map((m) => m[1])
    .filter((x) => x !== "vsodplqkuvnsdiikvmjb.supabase.co" && x !== "www.w3.org" && x !== "calendar.google.com" && x !== "stageplot.it");
  assert.deepEqual(host, []);
});

test("il service worker dell'editor lascia la biglietteria alla rete", () => {
  const sw = leggi("sw.js");
  const f = sw.slice(sw.indexOf('addEventListener("fetch"'));
  const bypass = f.indexOf('"/biglietteria/"'), respond = f.indexOf("e.respondWith");
  assert.ok(bypass > -1 && bypass < respond, "esce su /biglietteria/ PRIMA di respondWith");
});

test("l'informativa ha la sezione della biglietteria, e la pagina ci porta", () => {
  const p = leggi("privacy/index.html");
  const i = p.indexOf('id="biglietteria"');
  assert.ok(i > -1, "sezione #biglietteria");
  const sez = p.slice(i, p.indexOf("<h2", i + 10));
  assert.match(sez, /30 giorni dopo l'evento/);
  assert.match(sez, /Simone Castellan/);
  assert.match(sez, /7 giorni/, "impronta dell'IP");
  assert.match(sez, /6\.1\.b/);
  assert.match(sez, /organizzator/);
  assert.match(sez, /Continua con Google/, "accesso Google facoltativo");
  assert.match(sez, /nome, email e immagine del profilo/, "cosa si riceve da Google");
  assert.match(sez, /12 mesi dopo l'ultimo accesso/, "pulizia degli account");
  assert.match(sez, /Elimina il mio account/);
  assert.match(sez, /Le mie prenotazioni/);
  assert.match(sez, /locandine[^.]*pubblich/i, "le locandine sono pubbliche");
  assert.match(sez, /email di contatto dell'organizzatore/);
  assert.match(sez, /nessuna mail/i, "eliminando uno spettacolo non parte nessuna mail (decisione del 06/10)");
  assert.match(leggi("biglietteria/bgl.js"), /href="\/privacy\/#biglietteria"/);
});

/* ─────────────────────────────────────────────────────────── revisione del 06/10 */

test("REVISIONE: risposta persa e rete assente hanno due messaggi diversi, e nessuno dei due fa aspettare una mail che non arriverà", () => {
  const m = B.messaggio;
  assert.equal(m("senza_risposta"), "Non sappiamo se la prenotazione è andata a buon fine. Controlla la mail: se ti è arrivato il codice, è tutto a posto. Altrimenti premi di nuovo «Prenota»: non rischi di prenotare due volte.");
  assert.equal(m("offline"), "Sembra che tu non abbia connessione: i tuoi dati sono ancora qui, riprova appena torna la rete.");
  const abort = Object.assign(new Error("x"), { name: "AbortError" });
  assert.equal(B.tipoErroreRete(new TypeError("Failed to fetch"), false), "offline", "il telefono dice che la rete non c'è");
  assert.equal(B.tipoErroreRete(abort, false), "offline");
  assert.equal(B.tipoErroreRete(abort, true), "senza_risposta", "timeout: la richiesta può essere arrivata");
  assert.equal(B.tipoErroreRete(new TypeError("Failed to fetch"), true), "senza_risposta", "connessione caduta a metà: non si sa");
});

test("REVISIONE: lo stesso tentativo riusa il suo codice segreto (risposta persa = stessa prenotazione); cambiando posti o email, codice nuovo", () => {
  const casuale = (() => { let n = 0; return (a) => { for (let i = 0; i < a.length; i++) a[i] = (n++ * 37) & 255; return a; }; })();
  const t1 = B.tentativo(null, "k3m9x2p7qa", ["Platea|F|4", "Platea|F|3"], " Anna@Example.invalid ", casuale);
  assert.match(t1.token, /^[0-9a-f]{32}$/);
  const t2 = B.tentativo(t1, "k3m9x2p7qa", ["Platea|F|3", "Platea|F|4"], "anna@example.invalid", casuale);
  assert.equal(t2, t1, "stessi posti (in altro ordine) e stessa email: stesso tentativo");
  const t3 = B.tentativo(t1, "k3m9x2p7qa", ["Platea|F|3"], "anna@example.invalid", casuale);
  assert.notEqual(t3.token, t1.token, "altri posti: codice nuovo");
  const t4 = B.tentativo(t1, "k3m9x2p7qa", ["Platea|F|3", "Platea|F|4"], "bruno@example.invalid", casuale);
  assert.notEqual(t4.token, t1.token, "altra email: codice nuovo");
  assert.equal(B.tentativo(null, "k3m9x2p7qa", ["Platea|F|3"], "a@b.it", null), null, "senza un generatore sicuro niente codice: decide il server");
});

test("REVISIONE: nome e cognome con la stessa regola del server (solo lettere, spazi, apostrofi, trattini)", () => {
  const ok = { nome: "Mario", cognome: "Rossi", email: "mario.rossi@example.invalid", privacy: true };
  for (const n of ["Anna Maria", "D'Annunzio", "O’Brien", "De Rossi-Bianchi", "Nicolò", "Ζωή"]) {
    assert.deepEqual(B.controllaModulo({ ...ok, nome: n, cognome: n }), {}, n);
  }
  for (const n of ["Hai vinto: https://truffa.example", "Mario2", "a@b", "x.y", "Rossi!"]) {
    const e = B.controllaModulo({ ...ok, nome: n, cognome: n });
    assert.equal(e.nome, "Usa solo lettere: niente numeri, punti o simboli.", n);
    assert.equal(e.cognome, "Usa solo lettere: niente numeri, punti o simboli.", n);
  }
  assert.equal(B.controllaModulo({ ...ok, nome: "" }).nome, "Scrivi il tuo nome");
});

test("REVISIONE: l'email sbagliata dice cosa manca, e un errore di battitura nel dominio si nota", () => {
  const e = (x) => B.erroreEmail(x);
  assert.equal(e(""), "Scrivi la tua email");
  assert.equal(e("anna rossi@gmail.com"), "Togli gli spazi dall'email");
  assert.equal(e("anna.gmail.com"), "Manca la @ (per esempio nome@gmail.com)");
  assert.equal(e("anna@@gmail.com"), "C'è più di una @");
  assert.equal(e("anna@gmailcom"), "Manca il punto dopo la @ (per esempio gmail.com)");
  assert.equal(e("@gmail.com"), "Manca la parte prima della @");
  assert.equal(e("anna@gmail.com"), null);
  const s = B.suggerisciEmail;
  assert.equal(s("bruno.neri@gmail.con"), "bruno.neri@gmail.com");
  assert.equal(s("anna@gmial.com"), "anna@gmail.com");
  assert.equal(s("anna@gmailcom"), "anna@gmail.com");
  assert.equal(s("anna@libero.ti"), "anna@libero.it");
  assert.equal(s("anna@hotmial.it"), "anna@hotmail.it");
  assert.equal(s("anna@gmail.it"), "anna@gmail.com", "Gmail non dà indirizzi @gmail.it (e non è email.it)");
  for (const giusta of ["anna@gmail.com", "anna@tin.it", "anna@mail.com", "anna@email.it", "anna@example.invalid", "anna@studio-rossi.it"]) {
    assert.equal(s(giusta), null, giusta);
  }
  /* nel modulo: il primo «Prenota» con un dominio sospetto si ferma e chiede; il secondo con la stessa email passa */
  const m = { nome: "Bruno", cognome: "Neri", email: "bruno.neri@gmail.con", privacy: true };
  assert.equal(B.controllaModulo(m).email, "Forse intendevi bruno.neri@gmail.com? Se l'indirizzo è giusto, premi di nuovo «Prenota».");
  assert.deepEqual(B.controllaModulo(m, { emailAccettata: "bruno.neri@gmail.con" }), {});
  assert.equal(B.controllaModulo({ ...m, email: "bruno.neri@gmailcom" }).email, "Manca il punto dopo la @ (per esempio gmail.com)");
});

test("REVISIONE: troppi posti dalla stessa connessione ha il suo messaggio, con chi contattare", () => {
  assert.equal(B.messaggio("limite_connessione", { gia: 8, max: 8 }),
    "Da questa connessione sono già stati prenotati 8 posti, il massimo. Per altri posti scrivi a info@stageplot.it.");
});

test("REVISIONE: toccare un posto occupato o tenuto da parte risponde qualcosa", () => {
  assert.equal(B.avvisoPosto("Platea|D|3", "occupato"), "Il posto D 3 è già occupato.");
  assert.equal(B.avvisoPosto("Platea|A|2", "riservato"), "Il posto A 2 è tenuto da parte: non si può prenotare.");
  assert.equal(B.avvisoPosto("Galleria|A|2", "occupato", true), "Il posto Galleria A 2 è già occupato.");
  assert.equal(B.avvisoPosto("Platea|A|2", "libero"), null);
});

test("REVISIONE: sul computer la pagina parla di clic, sul telefono di tocchi", () => {
  const sug = B.suggerimento;
  assert.equal(sug({ aperta: true, zoom: false, serveZoom: true, fine: false }), "Tocca la pianta o allargala con due dita, poi scegli i posti.");
  assert.equal(sug({ aperta: true, zoom: true, serveZoom: true, fine: false }), "Scorri la pianta con il dito, allarga o stringi con due dita. Tocca un posto libero per sceglierlo.");
  assert.equal(sug({ aperta: true, zoom: false, serveZoom: false, fine: false }), "Tocca un posto libero per sceglierlo.");
  for (const z of [true, false]) for (const sz of [true, false]) {
    const t = sug({ aperta: true, zoom: z, serveZoom: sz, fine: true });
    assert.match(t, /^Clicca un posto libero per sceglierlo\./, "col mouse si clicca: " + t);
    assert.doesNotMatch(t, /dito|Tocca/);
  }
  assert.equal(sug({ aperta: false, zoom: false, serveZoom: true, fine: true }), "");
});

test("REVISIONE: la scelta e i dati si ritrovano dopo una ricarica, ma solo i posti ancora liberi", () => {
  const S = { slug: "k3m9x2p7qa", scelti: ["Platea|A|5", "Platea|B|2"], modulo: { nome: "Anna", cognome: "Neri", email: "anna@example.invalid", privacy: true, sito: "" },
    tentativo: { firma: "x", token: "ab".repeat(16) } };
  const v = B.daRicordare(S);
  assert.deepEqual(Object.keys(v).sort(), ["modulo", "scelti", "tentativo"]);
  assert.equal(v.modulo.privacy, undefined, "la spunta dell'informativa si rimette a mano");
  const r = B.daRipristinare(JSON.parse(JSON.stringify(v)), { posti: piantaProva().posti, occupati: ["Platea|B|2"], riservati: [] });
  assert.deepEqual(r.scelti, ["Platea|A|5"], "B 2 intanto è stato preso");
  assert.equal(r.modulo.nome, "Anna");
  assert.deepEqual(r.tentativo, S.tentativo);
  assert.equal(B.daRipristinare({ scelti: ["Platea|Z|1", 5, "x".repeat(300)] }, { posti: piantaProva().posti }).scelti.length, 0, "chiavi che non esistono: via");
  assert.equal(B.daRipristinare(null, { posti: [] }), null);
  assert.equal(B.daRipristinare({ scelti: ["Platea|A|1"], tentativo: { token: "NO" } }, { posti: piantaProva().posti }).tentativo, null, "codice storto: via");
});


/* 06/10, prima prova vera: un teatro disegnato intero (la sala è il «palco» di StagePlot, pedane in alto,
   sedie sotto). La scritta PALCO finiva in fondo alla sala, dietro l'ultima fila. */
function piantaSala() {
  return { v: 1, box: [0, 0, 1300, 2080], palco: [[[100, 100], [1200, 100], [1200, 1980], [100, 1980]]],
    pedane: [[[200, 150], [1000, 150], [1000, 500], [200, 500]]],
    posti: [{ k: "Platea|A|1", settore: "Platea", fila: "A", posto: 1, x: 500, y: 800, w: 50, d: 53, rot: 180 },
            { k: "Platea|B|1", settore: "Platea", fila: "B", posto: 1, x: 500, y: 910, w: 50, d: 53, rot: 180 }] };
}
test("PALCO: se il palco contiene i posti è la sala, e la scritta va sulle pedane sopra la prima fila", () => {
  const d = B.dovePalco(piantaSala());
  assert.equal(d.sala, true);
  assert.ok(d.y > 150 && d.y < 500, "la scritta sta sulle pedane, non in fondo alla sala: y=" + d.y);
  assert.ok(d.x > 200 && d.x < 1000);
  const svg = B.svgPianta(piantaSala(), {});
  assert.match(svg, /class="sala"/, "la sala non è colorata come un palco");
  assert.match(svg, /<polygon class="palco" points="200,150/, "le pedane fanno da palco");
  const y = +svg.match(/class="palco-t"[^>]*y="(\d+)"/)[1];
  assert.ok(y < 800, "PALCO sopra la prima fila: y=" + y);
});
test("PALCO: senza pedane la scritta va nella fascia fra il bordo e la prima fila", () => {
  const p = piantaSala(); p.pedane = [];
  const d = B.dovePalco(p);
  assert.ok(d.sala && d.y > 100 && d.y < 773, "y=" + d.y);
});
test("PALCO: palco separato sopra i posti, come prima: scritta sul bordo verso il pubblico", () => {
  const p = piantaSala(); p.palco = [[[100, 100], [1200, 100], [1200, 600], [100, 600]]];
  const d = B.dovePalco(p);
  assert.equal(d.sala, false);
  assert.ok(d.y > 350 && d.y < 600, "y=" + d.y);
  assert.match(B.svgPianta(p, {}), /<polygon class="palco" points="100,100/);
});

/* 06/10, Simone: «ci dev'essere il pinch zoom». La matematica del gesto, senza DOM. */
test("ZOOM CON DUE DITA: la scala segue le dita dentro i limiti, il punto fra le dita resta fermo", () => {
  const lim = B.limitiZoom(0.3, 0.9);
  assert.equal(lim.min, 0.3, "non si rimpicciolisce sotto la pianta intera");
  assert.ok(lim.max >= 0.9 * 2.5 - 1e-9 && lim.max >= 0.3 * 4 - 1e-9, "si ingrandisce ben oltre il dettaglio: " + lim.max);
  assert.equal(B.scalaPinch(0.5, 100, 200, lim), 1, "dita due volte più lontane: scala doppia");
  assert.equal(B.scalaPinch(0.5, 100, 10, lim), 0.3, "stringendo troppo: si ferma alla pianta intera");
  assert.equal(B.scalaPinch(0.5, 100, 10000, lim), lim.max, "allargando troppo: si ferma al massimo");
  assert.equal(B.scalaPinch(0.5, 0, 200, lim), 0.5, "distanza iniziale nulla: niente salti");
  const sc = B.scrollPerFuoco(400, 300, 2, 150, 100);
  assert.deepEqual(sc, { l: 650, t: 500 }, "il punto (400,300) della pianta resta a (150,100) sullo schermo");
  assert.deepEqual(B.scrollPerFuoco(10, 10, 1, 150, 100), { l: 0, t: 0 }, "mai scorrimenti negativi");
});
test("ZOOM CON DUE DITA: dentro la pianta il gesto è suo (touch-action), la pagina resta ingrandibile", () => {
  const css = readFileSync(join(root, "biglietteria/bgl.css"), "utf8");
  assert.match(css, /\.mappa\{[^}]*touch-action:pan-x pan-y/, "pianta: un dito scorre, due dita restano alla pagina (che le passa allo zoom della pianta)");
  const html = readFileSync(join(root, "biglietteria/index.html"), "utf8");
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?![.\d])/, "lo zoom della pagina non è vietato");
  const js = readFileSync(join(root, "biglietteria/bgl.js"), "utf8");
  for (const ev of ["touchmove", "wheel", "gesturechange"]) assert.match(js, new RegExp('addEventListener\\("' + ev + '"'), ev + " gestito");
});

/* 06/10, Simone: «stageplot.it/biglietteria mi dà pagina non trovata». Senza spettacolo è l'ingresso, non un errore. */
test("SENZA SPETTACOLO: stageplot.it/biglietteria spiega come prenotare, il link storto resta «non trovata»", () => {
  const js = readFileSync(join(root, "biglietteria/bgl.js"), "utf8");
  const avvia = js.slice(js.indexOf("function avvia()"));
  /* prima nessun parametro, poi l'organizzatore, poi lo slug storto */
  assert.ok(avvia.indexOf("if (!S.slug && !S.org) return messaggioPieno(SENZA_EVENTO") >= 0 &&
    avvia.indexOf("if (!S.slug && !S.org)") < avvia.indexOf("if (S.slug && !slugValido(S.slug))"), "prima il caso senza spettacolo, poi lo slug storto");
  assert.match(js, /titolo: "Prenota il tuo posto"/);
});

/* ─────────────────────────────────────────────── area dell'organizzatore: pagina, scheda, calendario (ottobre 2026) */

test("RF5: il file .ics dice l'ora giusta anche la sera del cambio d'ora; testo scappato e righe piegate a 75 byte", () => {
  const ev = { slug: "k3m9x2p7qa", titolo: "Concerto; di prova, «bis»", inizio: "2026-10-25T21:00:00+01:00", luogo: "Teatro di prova, Città",
    note: "Porte alle 20:30" };
  const t = B.icsEvento(ev, "https://stageplot.it/biglietteria/teatro-prova/concerto-25-ottobre", Date.parse("2026-10-06T10:00:00Z"));
  assert.match(t, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(t, /\r\nDTSTART:20261025T200000Z\r\n/, "21:00 a Roma dopo il cambio d'ora = 20:00 UTC");
  assert.match(t, /\r\nDTEND:20261025T220000Z\r\n/, "due ore di durata presunta");
  /* RFC 5545 §3.3.11: «;» e «,» nel testo si scrivono «\;» e «\,» */
  assert.match(t, /\r\nSUMMARY:Concerto\\; di prova\\, «bis»\r\n/);
  assert.match(t, /\r\nLOCATION:Teatro di prova\\, Città\r\n/);
  assert.match(t, /\r\nDTSTAMP:20261006T100000Z\r\n/);
  assert.match(t, /\r\nEND:VCALENDAR\r\n$/, "finisce con CRLF");
  for (const riga of t.split("\r\n")) assert.ok(Buffer.byteLength(riga, "utf8") <= 75, "riga troppo lunga: " + riga);
  assert.ok(t.includes("\r\n "), "la riga lunga si piega, con uno spazio davanti alla continuazione");
  assert.match(t.replace(/\r\n /g, ""), /\r\nDESCRIPTION:Porte alle 20:30\\nhttps:\/\/stageplot\.it\/biglietteria\/teatro-prova\/concerto-25-ottobre\r\n/,
    "ripiegata e riunita, la descrizione è intera");
  assert.equal(B.icsEvento({ titolo: "x" }, "l", 0), "", "senza data niente calendario");
});

test("RF5: mezzanotte e mezza del 1° gennaio a Roma è ancora il 31 dicembre in UTC (e la data breve dice 1 gennaio)", () => {
  const t = B.icsEvento({ slug: "k3m9x2p7qa", titolo: "Capodanno", inizio: "2027-01-01T00:30:00+01:00" }, "l", 0);
  assert.match(t, /\r\nDTSTART:20261231T233000Z\r\n/);
  assert.match(t, /\r\nDTEND:20270101T013000Z\r\n/);
  assert.equal(B.dataBreve("2026-12-31T23:30:00Z"), "ven 1 gennaio");
});

test("piegaIcs: non spezza mai una lettera accentata a metà, e ogni pezzo sta nei 75 byte", () => {
  const riga = "SUMMARY:" + "è".repeat(80);
  const v = B.piegaIcs(riga).split("\r\n");
  assert.ok(v.length > 1);
  for (const r of v) { assert.ok(Buffer.byteLength(r, "utf8") <= 75, r); assert.doesNotMatch(r, /\uFFFD/); }
  assert.equal(v.map((r, i) => (i ? r.slice(1) : r)).join(""), riga, "riunita è identica");
  assert.equal(B.piegaIcs("corta"), "corta");
});

test("RF5: Google Calendar con le stesse ore in UTC", () => {
  const g = B.linkGoogleCalendar({ titolo: "Prova", inizio: "2026-10-25T21:00:00+01:00", luogo: "Teatro" }, "https://stageplot.it/biglietteria/x/y");
  assert.match(g, /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Prova&dates=20261025T200000Z\/20261025T220000Z&/);
  assert.match(g, /&details=https%3A%2F%2Fstageplot\.it%2Fbiglietteria%2Fx%2Fy&/);
  assert.match(g, /&location=Teatro$/);
  assert.equal(B.linkGoogleCalendar({ titolo: "x" }, "l"), "", "senza data niente link");
  assert.equal(B.DURATA_CALENDARIO_MS, 7200000);
});

test("pagina dell'organizzatore: le etichette sulle locandine (ultimi posti, esaurito, chiuse)", () => {
  assert.equal(B.badgeSpettacolo({ stato: "aperta", liberi: 40 }), null);
  assert.equal(B.badgeSpettacolo({ stato: "aperta", liberi: 13 }), null);
  assert.deepEqual(B.badgeSpettacolo({ stato: "aperta", liberi: 12 }), { testo: "Ultimi 12 posti", cls: "ultimi" });
  assert.deepEqual(B.badgeSpettacolo({ stato: "aperta", liberi: 1 }), { testo: "Ultimo posto", cls: "ultimi" });
  assert.deepEqual(B.badgeSpettacolo({ stato: "aperta", liberi: 0 }), { testo: "Esaurito", cls: "esaurito" });
  assert.deepEqual(B.badgeSpettacolo({ stato: "chiusa", liberi: 5 }), { testo: "Prenotazioni chiuse", cls: "chiuso" });
  assert.deepEqual(B.badgeSpettacolo({ stato: "conclusa", liberi: 5 }), { testo: "Concluso", cls: "chiuso" });
  assert.equal(B.badgeSpettacolo({ stato: "aperta" }), null, "senza conteggio nessuna etichetta inventata");
});

test("senza locandina: un riquadro con titolo e data (scappati)", () => {
  const h = B.riquadroLocandina("<b>Prova</b>", "2026-10-09T19:00:00Z");
  assert.match(h, /&lt;b&gt;Prova&lt;\/b&gt;/); assert.match(h, /ven 9 ottobre/); assert.doesNotMatch(h, /<b>/);
  assert.equal(B.dataBreve("non è una data"), "");
});

test("errori nuovi: organizzatore o spettacolo che non ci sono", () => {
  assert.equal(B.statoPagina({ ok: false, errore: "spettacolo_inesistente" }), "inesistente");
  assert.equal(B.statoPagina({ ok: false, errore: "organizzatore_inesistente" }), "inesistente");
  assert.equal(B.statoPagina({ ok: false, errore: "rete" }), "errore");
  assert.match(B.messaggio("spettacolo_inesistente"), /non c'è più/);
  assert.match(B.messaggio("organizzatore_inesistente"), /non esiste/);
});

test("la pagina carica gli indirizzi prima di bgl.js e mostra le locandine dello spazio pubblico", () => {
  const h = leggi("biglietteria/index.html");
  assert.ok(h.indexOf('<script src="indirizzi.js?v=1"></script>') > 0 && h.indexOf('<script src="indirizzi.js') < h.indexOf('<script src="bgl.js'));
  const csp = (h.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  assert.match(csp, /img-src 'self' data: https:\/\/vsodplqkuvnsdiikvmjb\.supabase\.co http:\/\/127\.0\.0\.1:54321 http:\/\/localhost:54321;/);
  assert.match(h, /bgl\.js\?v=7/); assert.match(h, /bgl\.css\?v=6/);
  /* la pagina usa gli stessi indirizzi del resto della biglietteria, non una copia */
  const js = leggi("biglietteria/bgl.js");
  assert.match(js, /BGLI\.linkCanonico\(/); assert.match(js, /BGLI\.urlLocandina\(/);
  assert.equal(typeof I.urlLocandina, "function");
});

/* --- «Continua con Google» nella scheda (task 19, specifica area §3.2, D10) --- */

test("Google: i messaggi nuovi", () => {
  assert.match(B.messaggio("limite_account", { gia: 4, max: 4 }), /Con questo account hai già 4 posti/);
  assert.match(B.messaggio("accesso_scaduto"), /premi di nuovo «Prenota»/);
  assert.match(B.messaggio("email_non_verificata"), /nome ed email/);
  assert.match(B.messaggio("google_annullato"), /nome ed email/);
});

test("Google: la pagina carica l'accesso di StagePlot prima di bgl.js; «Le mie prenotazioni» nel piè di pagina", () => {
  const h = leggi("biglietteria/index.html");
  const pos = ['src="/accedi/google/avvio.js"', 'src="indirizzi.js', 'src="accesso.js', 'src="bgl.js?v=7"'].map((x) => h.indexOf(x));
  assert.ok(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1])), JSON.stringify(pos));
  const js = leggi("biglietteria/bgl.js");
  assert.match(js, /href="\/biglietteria\/mie\/">Le mie prenotazioni</);
  assert.match(js, /id="bgl-google">Continua con Google</);
  assert.match(js, /Prenota con nome ed email/);
});

test("D10: le pagine della biglietteria non scrivono chiavi dell'editor (sp_*) e non portano il pubblico nell'editor", () => {
  for (const f of ["biglietteria/bgl.js", "biglietteria/accesso.js", "biglietteria/mie/mie.js"].filter((x) => { try { leggi(x); return true; } catch { return false; } })) {
    const js = leggi(f);
    assert.doesNotMatch(js, /setItem\(\s*["']sp_/, f + ": nessuna chiave sp_* (benvenuto e onboarding dell'editor restano del dispositivo)");
    assert.doesNotMatch(js, /href="\/app\//, f + ": nessun link all'editor per il pubblico");
  }
});
