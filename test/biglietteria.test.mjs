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
  assert.equal(m("limite_email", { gia: 2, max: 4 }), "Con questa email hai già 2 posti: se ne possono prenotare al massimo 4.");
  assert.equal(m("limite_email", { gia: 1, max: 4 }), "Con questa email hai già 1 posto: se ne possono prenotare al massimo 4.");
  assert.equal(m("troppi_posti"), "Puoi prenotare al massimo 4 posti.");
  assert.equal(m("dati_non_validi", { campo: "nome" }), "Scrivi il tuo nome");
  assert.equal(m("dati_non_validi", { campo: "cognome" }), "Scrivi il tuo cognome");
  assert.equal(m("dati_non_validi", { campo: "email" }), "Controlla l'email");
  assert.equal(m("dati_non_validi", { campo: "posti" }), "Scegli almeno un posto");
  assert.equal(m("privacy_mancante"), "Per prenotare devi spuntare l'informativa sulla privacy.");
  assert.equal(m("troppe_richieste"), "Troppi tentativi da questa connessione: riprova fra qualche minuto.");
  for (const e of ["richiesta_troppo_grande", "metodo_non_ammesso", "errore_interno", "rete", undefined]) {
    assert.equal(m(e), "Qualcosa non ha funzionato. Riprova fra un momento.", String(e));
  }
  assert.equal(m("token_non_valido"), "Questo link di disdetta non è valido.");
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
  const host = [...js.matchAll(/https?:\/\/([a-z0-9.\-]+)/gi)].map((m) => m[1]).filter((x) => x !== "vsodplqkuvnsdiikvmjb.supabase.co" && x !== "www.w3.org");
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
  assert.match(leggi("biglietteria/bgl.js"), /href="\/privacy\/#biglietteria"/);
});
