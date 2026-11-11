/* Rider tecnico completo — il modulo di richiesta (rider-tecnico-completo/richiesta.js, 11/11/2026).
   Parti pure: pulizia dei campi, controlli, riassunto per la mail (≤ 1000 caratteri, contatti mai tagliati), corpo per
   submit-feedback; e la pagina che le usa. Il contratto col server sta in supabase/functions/_shared/rider-richiesta.test.ts.
   node --test test/rider-richiesta.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);
const RR = req(join(root, "rider-tecnico-completo/richiesta.js"));
const leggi = (p) => readFileSync(join(root, p), "utf8");

/* dati finti: il repo è pubblico */
const BASE = {
  band: "Band di prova", genere: "funk", zona: "Nordest", musicisti: "7",
  formazione: "Voce\nChitarra\nBasso\nTastiere e cori\nBatteria\nTromba\nSax",
  ascolti: "misto", palco: "medio", fonico: "nostro", materiali: "https://esempio.it/rider.pdf", rider_vecchio: "on",
  data: "2026-12-20", note: "", nome: "Mario Prova", email: "Prova@Esempio.IT", telefono: "000 000 0000", privacy: "on"
};

test("un modulo compilato bene non ha errori", () => {
  const d = RR.datiPuliti(BASE);
  assert.deepEqual(RR.errori(d), {});
  assert.equal(d.email, "prova@esempio.it");
  assert.equal(d.rider_vecchio, "si"); assert.equal(d.privacy, "si");
});

test("mancano band, numero, formazione, nome, email o consenso: si dice campo per campo", () => {
  const d = RR.datiPuliti({ ...BASE, band: " ", musicisti: "0", formazione: "voce", nome: "", email: "non-una-mail", privacy: "" });
  assert.deepEqual(Object.keys(RR.errori(d)).sort(), ["band", "email", "formazione", "musicisti", "nome", "privacy"]);
  assert.ok(RR.errori(RR.datiPuliti({ ...BASE, musicisti: "120" })).musicisti, "più di 99 non vale");
});

test("solo i campi noti, valori delle scelte solo fra quelli previsti, data solo AAAA-MM-GG", () => {
  const d = RR.datiPuliti({ ...BASE, ascolti: "cuffie<script>", palco: "enorme", fonico: "x", data: "domani", intruso: "x", __proto__: { y: 1 } });
  assert.equal(d.ascolti, ""); assert.equal(d.palco, ""); assert.equal(d.fonico, ""); assert.equal(d.data, "");
  assert.deepEqual(Object.keys(d).sort(), RR.CAMPI.map((c) => c[0]).sort());
});

test("via i caratteri di controllo e di direzione; ogni campo tagliato alla sua misura", () => {
  const d = RR.datiPuliti({ ...BASE, band: "A\u0007B‮C" + "x".repeat(200), note: "riga1\r\nriga2\u0000" });
  assert.equal(d.band.slice(0, 5), "A B C"); assert.equal(d.band.length, 80);
  assert.equal(d.note, "riga1\nriga2");
});

test("il riassunto per la mail sta nei 1000 caratteri e non perde mai band e contatti", () => {
  const d = RR.datiPuliti(BASE);
  const m = RR.messaggio(d);
  assert.ok(m.startsWith(RR.INTESTAZIONE));
  for (const pezzo of ["Band di prova", "prova@esempio.it", "000 000 0000", "Musicisti: 7", "20/12/2026", "Formazione:"]) assert.ok(m.includes(pezzo), pezzo);
  const lungo = RR.datiPuliti({ ...BASE, formazione: "chitarra ".repeat(200), note: "nota ".repeat(400), materiali: "https://esempio.it/" + "a".repeat(900) });
  const ml = RR.messaggio(lungo);
  assert.ok(ml.length <= RR.MSG_MAX, "lunghezza " + ml.length);
  assert.ok(ml.includes("prova@esempio.it") && ml.includes("Band di prova"), "contatti dentro anche se lungo");
  assert.ok(ml.length >= RR.MSG_MIN);
});

test("il corpo per submit-feedback: niente tipo di segnalazione, niente schermata, richiesta intera nel contesto e piccola", () => {
  const d = RR.datiPuliti(BASE);
  const b = RR.corpo(d, { honeypot: "", userAgent: "UA", viewport: "390x844", lingua: "it-IT" });
  assert.equal(b.hint, null); assert.equal(b.screenshot, null);
  assert.equal(b.tech_context.servizio, "rider-tecnico-completo"); assert.equal(b.tech_context.prezzo_eur, 59);
  assert.deepEqual(b.tech_context.richiesta, d);
  assert.equal(b.meta.page_url, "https://stageplot.it/rider-tecnico-completo/");
  /* il caso peggiore (ogni campo al massimo) resta sotto il tetto del server */
  const pieno = Object.fromEntries(RR.CAMPI.map(([k, max]) => [k, "é".repeat(max)]));
  const tc = RR.corpo(RR.datiPuliti(pieno)).tech_context;
  assert.ok(Buffer.byteLength(JSON.stringify(tc)) < RR.TECH_MAX, "tech_context " + Buffer.byteLength(JSON.stringify(tc)));
});

test("le risposte del server diventano frasi", () => {
  assert.deepEqual(RR.esitoInvio(200, { ok: true }), { ok: true });
  for (const s of [0, 400, 429, 500]) { const e = RR.esitoInvio(s, null); assert.equal(e.ok, false); assert.ok(e.testo.length > 10, String(s)); }
  assert.equal(RR.esitoInvio(200, { error: "x" }).ok, false);
});

test("la pagina: un campo per ogni voce di CAMPI, il cestino anti-spam, lo script e la CSP che lascia uscire solo la richiesta", () => {
  const h = leggi("rider-tecnico-completo/index.html");
  for (const [k] of RR.CAMPI) assert.match(h, new RegExp(`name="${k}"`), k);
  assert.match(h, /name="sito"/, "campo trappola");
  assert.match(h, /<script src="richiesta\.js\?v=1"><\/script>/);
  assert.match(h, /connect-src https:\/\/vsodplqkuvnsdiikvmjb\.supabase\.co;/);
  assert.equal(RR.URL_INVIO, "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/submit-feedback");
  /* le scelte del modulo sono le stesse che la pulizia accetta */
  for (const [nome, lista] of [["ascolti", RR.ASCOLTI], ["palco", RR.PALCHI], ["fonico", RR.FONICI]]) {
    const sel = h.match(new RegExp(`<select[^>]*name="${nome}"[^>]*>([\\s\\S]*?)</select>`))[1];
    const valori = [...sel.matchAll(/value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
    assert.deepEqual(valori, lista, nome);
  }
  /* prezzo uguale in pagina, nei dati strutturati e nel riassunto */
  assert.match(h, /"price":"59","priceCurrency":"EUR"/);
  assert.ok(RR.INTESTAZIONE.includes("59 €"));
});
