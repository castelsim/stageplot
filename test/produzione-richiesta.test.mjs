/* Produzione eventi — il modulo di richiesta e la pagina (produzione-eventi/, 13/11/2026).
   Parti pure di richiesta.js (pulizia dei campi, controlli, riassunto per la mail ≤ 1000 caratteri con i contatti sempre
   dentro, corpo per submit-feedback) e la pagina che le usa: un campo per ogni voce di CAMPI, la CSP che lascia uscire
   solo la richiesta, schema e FAQ coerenti con quanto si vede, prezzi «da» uguali in pagina e nei dati strutturati, nessun
   PDF scaricabile (decisione PE-05), nessun testimonial. Il contratto col server sta in
   supabase/functions/_shared/produzione-richiesta.test.ts.
   node --test test/produzione-richiesta.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);
const PR = req(join(root, "produzione-eventi/richiesta.js"));
const leggi = (p) => readFileSync(join(root, p), "utf8");

/* dati finti: il repo è pubblico */
const BASE = {
  tipo: "festa-azienda", data: "2027-12-10", luogo: "Borgo Salice (inventato)", persone: "100-300", presente: "palco",
  livello: "distanza", budget: "3.000 €", descrizione: "Cena con saluti e una band di sette elementi.\nIl referente non è un tecnico.",
  scadenze: "Preventivi entro novembre", ente: "Azienda di prova", nome: "Mario Prova", email: "Prova@Esempio.IT", telefono: "000 000 0000", privacy: "on"
};

test("un modulo compilato bene non ha errori", () => {
  const d = PR.datiPuliti(BASE);
  assert.deepEqual(PR.errori(d), {});
  assert.equal(d.email, "prova@esempio.it");
  assert.equal(d.privacy, "si");
});

test("mancano tipo, luogo, descrizione, nome, email o consenso: si dice campo per campo", () => {
  const d = PR.datiPuliti({ ...BASE, tipo: "boh", luogo: " ", descrizione: "poco", nome: "", email: "non-una-mail", privacy: "" });
  assert.deepEqual(Object.keys(PR.errori(d)).sort(), ["descrizione", "email", "luogo", "nome", "privacy", "tipo"]);
});

test("solo i campi noti, scelte solo fra quelle previste, data solo AAAA-MM-GG", () => {
  const d = PR.datiPuliti({ ...BASE, persone: "tantissime<script>", presente: "x", livello: "gratis", data: "domani", intruso: "x", __proto__: { y: 1 } });
  assert.equal(d.persone, ""); assert.equal(d.presente, ""); assert.equal(d.livello, ""); assert.equal(d.data, "");
  assert.deepEqual(Object.keys(d).sort(), PR.CAMPI.map((c) => c[0]).sort());
});

test("via i caratteri di controllo e di direzione; ogni campo tagliato alla sua misura; descrizione a capo", () => {
  const d = PR.datiPuliti({ ...BASE, luogo: "A\u0007B‮C" + "x".repeat(200), descrizione: "riga1\r\nriga2\u0000 e altro ancora" });
  assert.equal(d.luogo.slice(0, 5), "A B C"); assert.equal(d.luogo.length, 100);
  assert.equal(d.descrizione, "riga1\nriga2 e altro ancora");
});

test("il riassunto per la mail sta nei 1000 caratteri e non perde mai tipo, luogo e contatti", () => {
  const d = PR.datiPuliti(BASE);
  const m = PR.messaggio(d);
  assert.ok(m.startsWith(PR.INTESTAZIONE) && PR.INTESTAZIONE === "RICHIESTA PRODUZIONE EVENTO");
  for (const pezzo of ["festa aziendale", "Borgo Salice", "10/12/2027", "prova@esempio.it", "000 000 0000", "Azienda di prova", "interessa: coordinamento a distanza (2)", "Descrizione: Cena con saluti"]) assert.ok(m.includes(pezzo), pezzo);
  const lungo = PR.datiPuliti({ ...BASE, descrizione: "palco ".repeat(300), scadenze: "data ".repeat(100), budget: "b".repeat(100) });
  const ml = PR.messaggio(lungo);
  assert.ok(ml.length <= PR.MSG_MAX, "lunghezza " + ml.length);
  assert.ok(ml.includes("prova@esempio.it") && ml.includes("festa aziendale") && ml.includes("Borgo Salice"), "contatti dentro anche se lungo");
  assert.ok(ml.length >= PR.MSG_MIN);
});

test("il corpo per il server: contesto con la richiesta intera, niente schermata, campo trappola portato", () => {
  const b = PR.corpo(PR.datiPuliti(BASE), { honeypot: "x", userAgent: "UA", viewport: "390x844", lingua: "it-IT" });
  assert.equal(b.tech_context.servizio, "produzione-eventi"); assert.equal(b.tech_context.prova, true);
  assert.deepEqual(b.tech_context.richiesta, PR.datiPuliti(BASE));
  assert.equal(b.honeypot, "x"); assert.equal(b.screenshot, null); assert.equal(b.hint, null);
  assert.equal(b.meta.page_url, "https://stageplot.it/produzione-eventi/");
  assert.ok(JSON.stringify(b.tech_context).length < PR.TECH_MAX / 2);
});

test("la risposta del server si dice in parole, con produzione@ come ripiego", () => {
  assert.deepEqual(PR.esitoInvio(200, { ok: true }), { ok: true });
  for (const s of [0, 400, 429, 500]) { const e = PR.esitoInvio(s, null); assert.equal(e.ok, false); assert.ok(e.testo.length > 10); }
  assert.match(PR.esitoInvio(429).testo, /produzione@stageplot\.it/);
});

test("la pagina: un campo per ogni voce di CAMPI, il cestino anti-spam, lo script e la CSP che lascia uscire solo la richiesta", () => {
  const h = leggi("produzione-eventi/index.html");
  for (const [k, max, obbligatorio] of PR.CAMPI) {
    assert.match(h, new RegExp('name="' + k + '"'), "campo " + k);
    const el = h.match(new RegExp('<(?:input|textarea)[^>]*name="' + k + '"[^>]*>'));
    if (el && /maxlength=/.test(el[0]) && k !== "privacy") assert.equal(Number(el[0].match(/maxlength="(\d+)"/)[1]), max, "maxlength di " + k);
    if (obbligatorio) assert.match(h, new RegExp('id="err-' + k + '"'), "riquadro errore " + k);
  }
  assert.match(h, /name="sito"[^>]*tabindex="-1"/, "campo trappola");
  assert.match(h, /<script src="richiesta\.js\?v=1"><\/script>/);
  assert.match(h, /connect-src https:\/\/vsodplqkuvnsdiikvmjb\.supabase\.co;/);
  assert.match(h, /form-action 'none'/);
  for (const v of PR.TIPI) assert.ok(h.includes('<option value="' + v + '">'), "tipo " + v);
  for (const v of PR.PERSONE) assert.ok(h.includes('<option value="' + v + '">'), "persone " + v);
  for (const v of PR.PRESENTE) assert.ok(h.includes('<option value="' + v + '">'), "presente " + v);
  for (const v of PR.LIVELLI) assert.ok(h.includes('<option value="' + v + '">'), "livello " + v);
});

test("schema: Service con i tre livelli «da», FAQPage uguale alle domande che si vedono", () => {
  const h = leggi("produzione-eventi/index.html");
  const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];
  const servizio = ld.find((n) => n["@type"] === "Service");
  const prezzi = servizio.hasOfferCatalog.itemListElement.map((o) => o.priceSpecification.minPrice);
  assert.deepEqual(prezzi, [59, 290, 790]);
  /* i prezzi dei tre livelli stanno anche scritti in pagina come «da N €» */
  for (const p of prezzi) assert.match(h, new RegExp("da <strong>" + p + " €</strong>"), "da " + p + " € nei livelli");
  const faq = ld.find((n) => n["@type"] === "FAQPage").mainEntity;
  const viste = [...h.matchAll(/<details><summary>([^<]*)<\/summary><p>([^<]*)<\/p><\/details>/g)]
    .map((m) => [m[1], m[2]].map((s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<")));
  assert.equal(faq.length, viste.length); assert.ok(faq.length >= 8);
  faq.forEach((q, i) => { assert.equal(q.name, viste[i][0]); assert.equal(q.acceptedAnswer.text, viste[i][1]); });
  assert.equal(servizio.provider["@id"], "https://simonecastellan.com/#person");
  assert.equal(servizio.brand["@id"], "https://stageplot.it/#org");
});

test("meta: titolo ≤ 60, descrizione ≤ 155, canonical e marchio «stageplot.it»", () => {
  const h = leggi("produzione-eventi/index.html");
  assert.ok(h.match(/<title>([^<]*)<\/title>/)[1].length <= 60);
  assert.ok(h.match(/<meta name="description" content="([^"]*)">/)[1].length <= 155);
  assert.match(h, /<link rel="canonical" href="https:\/\/stageplot\.it\/produzione-eventi\/">/);
  assert.match(h, /<meta property="og:site_name" content="stageplot\.it">/);
  assert.match(h, /<h1>[^<]+<\/h1>/); assert.equal((h.match(/<h1>/g) || []).length, 1);
});

test("onestà: in prova, esempi inventati, niente PDF scaricabili né testimonial, i confini dichiarati", () => {
  const h = leggi("produzione-eventi/index.html");
  assert.match(h, /Servizio in prova/); assert.match(h, /nomi, luoghi e cifre inventati/);
  assert.equal(/href="[^"]*\.pdf/i.test(h), false, "nessun link a PDF (PE-05: solo immagini)");
  assert.equal(/\.pdf$/.test(readdirSync(join(root, "produzione-eventi")).join("\n")), false, "nessun PDF nella cartella");
  assert.equal(/testimonial|recension|«[^»]{30,}»\s*[—-]/i.test(h), false, "nessun testimonial");
  for (const frase of [/non firmiamo relazioni di sicurezza/i, /SCIA/, /non prendiamo commissioni/i]) assert.match(h, frase);
  assert.equal(/Diego|AVA Sound|Art Voice/.test(h), false, "nessun nome dei concerti o dei clienti veri");
});

test("le immagini degli esempi esistono, hanno le misure giuste e pesano poco", () => {
  const h = leggi("produzione-eventi/index.html");
  const imgs = [...h.matchAll(/<img src="([^"]+)" width="(\d+)" height="(\d+)"/g)];
  assert.equal(imgs.length, 6, "due immagini per ognuno dei tre esempi");
  for (const [, src] of imgs) {
    const p = join(root, "produzione-eventi", src);
    assert.ok(existsSync(p), src);
    assert.ok(statSync(p).size < 220 * 1024, src + " pesa troppo");
  }
  assert.ok(imgs.every((m) => /alt="[^"]{20,}"/.test(h.slice(h.indexOf(m[0]), h.indexOf(m[0]) + 400))), "alt descrittivo");
});

test("la pagina è raggiungibile: sitemap, llms.txt, allowlist del deploy, link dalle altre pagine", () => {
  assert.match(leggi("sitemap.xml"), /<loc>https:\/\/stageplot\.it\/produzione-eventi\/<\/loc>/);
  assert.match(leggi("llms.txt"), /\(https:\/\/stageplot\.it\/produzione-eventi\/\)/);
  assert.match(leggi(".github/workflows/pages.yml"), /produzione-eventi/);
  for (const f of ["rider-tecnico-completo/index.html", "consulenza/index.html", "guida/rider-tecnico/index.html"]) assert.match(leggi(f), /href="\/produzione-eventi\/"/, f);
});
