/* Biglietteria — «I tuoi posti» sulla pianta (segnalazione cf7adc04 del 07/10: chi aveva già prenotato vedeva i suoi
   posti con la croce degli altri) e la riga «Entra con Google» sopra la pianta.
   node --test test/bgl-miei.test.mjs */
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

const SLUG = "abcdefgh23";
const RIF_BREVE = { org: "ava-sound", s: "concerto-9-ottobre", slug: SLUG };

test("lo spettacolo della pagina: dall'indirizzo (?o=&s=) o, aperto con ?e=, dalla risposta del server", () => {
  assert.deepEqual(B.rifSpettacolo({ org: "ava-sound", s: "concerto", slug: SLUG }), { org: "ava-sound", s: "concerto", slug: SLUG });
  assert.deepEqual(B.rifSpettacolo({ org: "", s: "", slug: SLUG, r: { organizzatore: { slug: "Ava-Sound" }, evento: { s: "concerto" } } }),
    { org: "ava-sound", s: "concerto", slug: SLUG });
  assert.deepEqual(B.rifSpettacolo({ slug: SLUG, r: { organizzatore: null, evento: {} } }), { org: "", s: "", slug: SLUG });
  assert.deepEqual(B.rifSpettacolo(null), { org: "", s: "", slug: "" });
});

test("il percorso di «Le mie prenotazioni» si confronta con lo spettacolo della pagina", () => {
  const ss = B.stessoSpettacolo;
  assert.equal(ss("ava-sound/concerto-9-ottobre", RIF_BREVE), true);
  assert.equal(ss("?e=" + SLUG, RIF_BREVE), true);
  assert.equal(ss("ava-sound/altro", RIF_BREVE), false, "stesso organizzatore, altro spettacolo");
  assert.equal(ss("altro-org/concerto-9-ottobre", RIF_BREVE), false, "stesso indirizzo breve, altro organizzatore");
  assert.equal(ss("?e=zzzzzzzz23", RIF_BREVE), false);
  assert.equal(ss("?e=" + SLUG.slice(0, 9), { slug: SLUG.slice(0, 9) }), false, "uno slug non valido non vale nulla");
  /* pagina aperta con ?e= di uno spettacolo senza indirizzo breve: org/s vuoti non devono combaciare con niente */
  assert.equal(ss("ava-sound/concerto-9-ottobre", { org: "", s: "", slug: SLUG }), false);
  assert.equal(ss("/", { org: "", s: "", slug: SLUG }), false);
  assert.equal(ss(null, RIF_BREVE), false);
  assert.equal(ss("ava-sound/concerto-9-ottobre", null), false);
  assert.equal(ss("ava-sound/concerto-9-ottobre/x", RIF_BREVE), false);
});

test("dai dati di bgl_mie_prenotazioni: solo le prenotazioni ATTIVE di QUESTO spettacolo", () => {
  const d = { ok: true, prenotazioni: [
    { stato: "attiva", posti: ["Platea|A|1", "Platea|A|2"], evento: { percorso: "ava-sound/concerto-9-ottobre" } },
    { stato: "disdetta", posti: ["Platea|B|1"], evento: { percorso: "ava-sound/concerto-9-ottobre" } },
    { stato: "annullata", posti: ["Platea|B|2"], evento: { percorso: "ava-sound/concerto-9-ottobre" } },
    { stato: "attiva", posti: ["Platea|C|1"], evento: { percorso: "ava-sound/altro" } },
    { stato: "attiva", posti: ["Platea|A|2", "Platea|D|4", 7, null], evento: { percorso: "?e=" + SLUG } },
    { stato: "attiva", posti: "Platea|E|1", evento: { percorso: "ava-sound/concerto-9-ottobre" } },
    { stato: "attiva", posti: ["Platea|F|1"] },
    null
  ] };
  assert.deepEqual(B.mieiDaGoogle(d, RIF_BREVE), ["Platea|A|1", "Platea|A|2", "Platea|D|4"]);
  assert.deepEqual(B.mieiDaGoogle({ ok: false, errore: "non_autenticato" }, RIF_BREVE), []);
  assert.deepEqual(B.mieiDaGoogle(null, RIF_BREVE), []);
  assert.deepEqual(B.mieiDaGoogle({ ok: true, prenotazioni: [] }, RIF_BREVE), []);
});

test("i tuoi posti: unione di ricordo e Google, solo quelli ancora occupati, ordinati, senza doppioni", () => {
  const occ = ["Platea|A|1", "Platea|A|2", "Platea|B|10", "Platea|B|9", "Platea|C|1"];
  assert.deepEqual(B.mieiPosti(["Platea|A|2", "Platea|A|1"], ["Platea|A|2", "Platea|B|10", "Platea|B|9"], occ),
    ["Platea|A|1", "Platea|A|2", "Platea|B|9", "Platea|B|10"]);
  /* disdetta altrove: non è più occupato, non è più tuo */
  assert.deepEqual(B.mieiPosti(["Platea|Z|1"], ["Platea|Z|2"], occ), []);
  assert.deepEqual(B.mieiPosti(null, null, occ), []);
  assert.deepEqual(B.mieiPosti(["Platea|A|1"], undefined, occ), ["Platea|A|1"]);
  assert.deepEqual(B.mieiPosti(undefined, ["Platea|C|1"], occ), ["Platea|C|1"]);
  assert.deepEqual(B.mieiPosti(["Platea|A|1"], [], []), []);
});

test("statoDi: «mio» prima di tutto, poi scelto, occupato, tenuto da parte, libero", () => {
  const s = { miei: ["Platea|A|1"], scelti: ["Platea|A|3"], occupati: ["Platea|A|1", "Platea|A|2"], riservati: ["Platea|A|4"] };
  assert.equal(B.statoDi("Platea|A|1", s), "mio");
  assert.equal(B.statoDi("Platea|A|2", s), "occupato");
  assert.equal(B.statoDi("Platea|A|3", s), "scelto");
  assert.equal(B.statoDi("Platea|A|4", s), "riservato");
  assert.equal(B.statoDi("Platea|A|5", s), "libero");
  /* senza miei (gestione, altre pagine) tutto come prima */
  assert.equal(B.statoDi("Platea|A|1", { occupati: ["Platea|A|1"] }), "occupato");
});

test("un tuo posto non si sceglie: immagine (non bottone), e il lettore di schermo dice «tuo»", () => {
  const p = { settore: "Platea", fila: "A", posto: 5 };
  const a = B.attributiPosto(p, "mio", false, true);
  assert.deepEqual(a, { cls: "posto mio", role: "img", tabindex: null, pressed: null, label: "Fila A, posto 5, tuo" });
  assert.equal(B.attributiPosto({ settore: "Galleria", fila: "B", posto: 2 }, "mio", true, true).label, "Galleria, fila B, posto 2, tuo");
  assert.equal(B.attributiPosto(p, "occupato", false, true).label, "Fila A, posto 5, occupato");
  assert.equal(B.attributiPosto(p, "scelto", false, true).label, "Fila A, posto 5, scelto da te");
});

test("la pianta disegna i tuoi posti con la classe «mio» e la spunta; senza miei, nessun posto «mio»", () => {
  const posti = [1, 2, 3].map((n) => ({ settore: "Platea", fila: "A", posto: n, x: 100 * n, y: 500, w: 50, d: 50, rot: 0 }));
  const pianta = { v: 1, box: [0, 0, 500, 700], palco: [[[0, 0], [500, 0], [500, 200], [0, 200]]], pedane: [], posti };
  const svg = B.svgPianta(pianta, { occupati: ["Platea|A|1", "Platea|A|2"], miei: ["Platea|A|1"], scelti: ["Platea|A|3"], attiva: true });
  assert.match(svg, /<g class="posto mio" data-k="Platea\|A\|1"[^>]*role="img"[^>]*aria-label="Fila A, posto 1, tuo">/);
  assert.match(svg, /<g class="posto occupato" data-k="Platea\|A\|2"/);
  assert.match(svg, /<g class="posto scelto" data-k="Platea\|A\|3"[^>]*role="button"/);
  assert.equal((svg.match(/class="spunta"/g) || []).length, 3, "ogni posto ha la spunta (aggiornaPosti cambia solo la classe)");
  assert.doesNotMatch(B.svgPianta(pianta, { occupati: ["Platea|A|1"], attiva: true }), /posto mio/);
  /* sedie girate verso il palco (rot 180, il caso normale): la spunta resta dritta, fuori dalla rotazione */
  const girata = { ...pianta, posti: posti.map((q) => ({ ...q, rot: 180 })) };
  const sg = B.svgPianta(girata, { occupati: ["Platea|A|1"], miei: ["Platea|A|1"], attiva: true });
  const uno = sg.slice(sg.indexOf('data-k="Platea|A|1"'), sg.indexOf('data-k="Platea|A|2"'));
  assert.match(uno, /<g transform="rotate\(180 100 500\)">(?:(?!<\/g>).)*<\/g><path class="spunta"/);
  /* la punta corta a sinistra, la lunga a destra in alto: una spunta, non un «^» */
  const d = /class="spunta"[^>]* d="M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)"/.exec(uno).slice(1).map(Number);
  assert.ok(d[0] < d[2] && d[2] < d[4] && d[3] > d[1] && d[5] < d[1], d.join(","));
});

test("toccando un tuo posto: dove disdire (il link del ricordo, altrimenti «Le mie prenotazioni»)", () => {
  assert.equal(B.avvisoPosto("Platea|A|5", "mio"), "Il posto A 5 è tuo.");
  assert.deepEqual(B.avvisoMio("Platea|A|5", false, "https://x/?e=a&c=b"),
    { testo: "Il posto A 5 è tuo.", link: { href: "https://x/?e=a&c=b", testo: "Vedi o disdici" } });
  assert.deepEqual(B.avvisoMio("Galleria|A|5", true, null),
    { testo: "Il posto Galleria A 5 è tuo. Per disdire:", link: { href: "/biglietteria/mie/", testo: "Le mie prenotazioni" } });
  assert.equal(B.LINK_MIE, "/biglietteria/mie/");
});

test("la nota «Hai già prenotato»: i posti, «Vedi o disdici» col ricordo, «Le mie prenotazioni» per quelli di Google", () => {
  assert.equal(B.notaMiei([], false, { vedi: "x", mie: true }), "");
  assert.equal(B.notaMiei(null, false, {}), "");
  const solo = B.notaMiei(["Platea|A|1", "Platea|A|2"], false, { vedi: "/biglietteria/?e=a&c=b", mie: false });
  assert.equal(solo, '<p class="nota ok">Hai già prenotato: A 1 e A 2 · <a href="/biglietteria/?e=a&amp;c=b">Vedi o disdici</a></p>');
  const g = B.notaMiei(["Platea|A|1"], false, { vedi: null, mie: true });
  assert.equal(g, '<p class="nota ok">Hai già prenotato: A 1 · <a href="/biglietteria/mie/">Le mie prenotazioni</a></p>');
  const tutte = B.notaMiei(["Platea|A|1"], false, { vedi: "v", mie: true });
  assert.match(tutte, /Vedi o disdici<\/a> · <a href="\/biglietteria\/mie\/">Le mie prenotazioni/);
});

test("la riga dell'accesso sopra la pianta: invito discreto da fuori, chi sei ed «Esci» da dentro", () => {
  assert.equal(B.rigaAccesso({ acc: false, salvata: true, email: "a@b.it" }), "", "senza accesso.js niente riga");
  const fuori = B.rigaAccesso({ acc: true, salvata: false, email: "" });
  assert.match(fuori, /class="accesso-riga fuori"/);
  assert.match(fuori, /Hai già prenotato\? Entra con Google per vedere i tuoi posti/);
  assert.match(fuori, /<button type="button" class="btn piccolo" id="bgl-entra">Entra con Google<\/button>/);
  assert.doesNotMatch(fuori, /bgl-esci-p/);
  const dentro = B.rigaAccesso({ acc: true, salvata: true, email: "maria<x>@example.invalid" });
  assert.match(dentro, /Sei entrato come <b>maria&lt;x&gt;@example\.invalid<\/b> · <button type="button" class="link" id="bgl-esci-p">Esci<\/button>/);
  assert.doesNotMatch(dentro, /bgl-entra/);
  /* sessione salvata ma email non ancora letta (o senza rete): già «dentro», senza email */
  assert.match(B.rigaAccesso({ acc: true, salvata: true }), /Sei entrato con Google · <button[^>]*id="bgl-esci-p"/);
});

test("la pagina: legenda con «I tuoi posti» nascosta finché non ce n'è uno, RPC dopo la pianta, ritorno da Google sulla pianta", () => {
  const js = leggi("biglietteria/bgl.js");
  assert.match(js, /voce\("mio", "I tuoi posti", !S\.miei\.length\)/);
  assert.match(js, /rpcGrezza\(cfg, "bgl_mie_prenotazioni", \{\}\)/);
  /* la chiamata parte dopo la pianta (fine di carica), non prima */
  const c = js.indexOf("function carica(");
  assert.ok(js.indexOf("aggiornaGoogle()", c) > js.indexOf("disegnaPianta();", c));
  assert.match(js, /sessionStorage\.setItem\("bgl-google", "pianta:" \+ S\.slug\)/);
  assert.match(js, /S\.ritornoPianta = !!S\.slug && ritorno === "pianta:" \+ S\.slug/);
  assert.match(B.messaggio("google_annullato_pianta"), /scegliere i posti lo stesso/);
  const css = leggi("biglietteria/bgl.css");
  assert.match(css, /\.posto\.mio \.sedia\{fill:var\(--m-mio\)/);
  assert.match(css, /\.posto\.mio \.spunta\{stroke:#fff\}/);
  assert.match(css, /\.posto\.mio \.n\{display:none\}/);
});
