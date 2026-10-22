/* Programma di sala — prove pure (nessuna rete, nessun browser): indirizzo, validazione del documento, costruzione del DOM.
   Dati inventati («Orchestra di prova», «Concerto d'esempio»). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);
const I = req(join(root, "programma/indirizzo.js"));
const P = req(join(root, "programma/prg.js"));

/* un DOM minimo: abbastanza per vedere COSA viene creato (tag, testo, attributi) */
class Nodo {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.className = ""; this.testo = null; }
  appendChild(n) { this.children.push(n); return n; }
  setAttribute(k, v) { this.attrs[k] = v; }
  get textContent() { return this.testo !== null ? this.testo : this.children.map((c) => c.textContent).join(""); }
}
const doc = { createElement: (t) => new Nodo(t.toUpperCase()), createTextNode: (s) => { const n = new Nodo("#text"); n.testo = String(s); return n; } };
const tutti = (n, f = []) => { f.push(n); n.children.forEach((c) => tutti(c, f)); return f; };
const tag = (n, t) => tutti(n).filter((x) => x.tagName === t.toUpperCase());

const ESEMPIO = {
  v: 1,
  intestazione: { sopratitolo: "Stagione di prova", titolo: "Concerto", titolo_corsivo: "d'esempio", righe: ["Orchestra di prova", "Direttore: Nome Inventato"], quando: "Sabato, ore 21" },
  sezioni: [
    { tipo: "interpreti", etichetta: "In scena", titolo: "Gli interpreti", persone: [{ nome: "Prima Persona", ruolo: "voce" }, { nome: "Seconda Persona", ruolo: "pianoforte" }], nota: "Una nota." },
    { tipo: "brani", etichetta: "Programma", titolo: "I brani", voci: [{ titolo: "Primo brano", dettaglio: "per orchestra" }, { titolo: "Secondo brano", brani: "a) uno\nb) due", nota: "Dalla suite" }] },
    { tipo: "testo", etichetta: "Note", titolo: "Due parole", paragrafi: ["Primo paragrafo.", "Secondo paragrafo."] },
    { tipo: "sconosciuto", titolo: "Non deve comparire" },
  ],
  link: [{ testo: "Il sito", url: "https://example.invalid/sito" }],
};

/* ------------------------------------------------------------------ indirizzo */
test("slug dall'indirizzo: forma canonica ?p= e scorciatoia /programma/<slug>, minuscole, barra finale", () => {
  assert.equal(I.slugDaIndirizzo("/programma/", "?p=orchestra-prova"), "orchestra-prova");
  assert.equal(I.slugDaIndirizzo("/programma/", "?x=1&p=Orchestra-Prova"), "orchestra-prova");
  assert.equal(I.slugDaIndirizzo("/programma/orchestra-prova", ""), "orchestra-prova");
  assert.equal(I.slugDaIndirizzo("/programma/Orchestra-Prova/", ""), "orchestra-prova");
  assert.equal(I.slugDaIndirizzo("/programma/", "?p=%6Frchestra-prova"), "orchestra-prova", "percent-encoding");
});

test("slug non validi: riservati, formato storto, troppo lungo, livelli in più, nessuno", () => {
  for (const [p, s] of [["/programma/", ""], ["/programma/", "?p="], ["/programma/", "?p=ab--cd"], ["/programma/", "?p=-abc"], ["/programma/", "?p=a"],
    ["/programma/", "?p=" + "a".repeat(41)], ["/programma/", "?p=index"], ["/programma/", "?p=programma"], ["/programma/", "?p=admin"],
    ["/programma/", "?p=%E0%A4%A"], ["/programma/a/b", ""], ["/altro/orchestra-prova", ""], ["/programma/", "?p=orchestra prova"], ["/programma/", "?p=<img>"]])
    assert.equal(I.slugDaIndirizzo(p, s), null, p + s);
  assert.ok(I.slugDaIndirizzo("/programma/", "?p=" + "a".repeat(40)), "40 caratteri vanno");
});

test("scorciatoia per 404.html: porta a /programma/?p=…, tiene gli altri parametri, scarta ciò che non è uno slug", () => {
  assert.equal(I.scorciatoia("/programma/orchestra-prova"), "/programma/?p=orchestra-prova");
  assert.equal(I.scorciatoia("/programma/Orchestra-Prova/", "?x=1&p=altro"), "/programma/?p=orchestra-prova&x=1");
  for (const p of ["/programma/", "/programma/index", "/programma/prg.js", "/programma/a/b", "/biglietteria/orchestra-prova"]) assert.equal(I.scorciatoia(p), null, p);
});

test("le parole riservate dell'indirizzo sono quelle della 0082 (bgl_slug_riservato + le pagine sotto /programma/)", () => {
  const bgl = readFileSync(join(root, "supabase/migrations/0074_bgl_area_organizzatori.sql"), "utf8").replace(/\s+/g, " ");
  const base = /p = any \(array\[([^\]]+)\]\)/.exec(bgl)[1].split(",").map((x) => x.trim().replace(/'/g, ""));
  const prg = readFileSync(join(root, "supabase/migrations/0082_programmi_di_sala.sql"), "utf8").replace(/\s+/g, " ");
  const extra = /or p = any \(array\[([^\]]+)\]\)/.exec(prg)[1].split(",").map((x) => x.trim().replace(/'/g, ""));
  assert.deepEqual(I.RISERVATI.slice().sort(), [...base, ...extra].sort());
});

test("404.html rimanda la scorciatoia PRIMA di disegnare la pagina; il deploy e il service worker conoscono /programma", () => {
  const h = readFileSync(join(root, "404.html"), "utf8");
  const i = h.indexOf('<script src="/programma/indirizzo.js"></script>'), j = h.indexOf("PRGIndirizzo.scorciatoia(location.pathname,location.search)");
  assert.ok(i > 0 && j > i && j < h.indexOf("<body"));
  const wf = readFileSync(join(root, ".github/workflows/pages.yml"), "utf8");
  assert.match(wf.slice(wf.indexOf("rsync -a"), wf.indexOf("./_site/")), /\bprogramma\b/, "senza l'allowlist la cartella dà 404");
  assert.match(wf, /programma-di-sala\.test\.mjs/, "la CI lancia questi test");
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  assert.match(sw, /indexOf\("\/programma\/"\) === 0\) return;/);
});

test("la pagina: noindex, nessuno script inline, CSP senza 'unsafe-inline', link al sito in fondo, niente innerHTML nel codice", () => {
  const h = readFileSync(join(root, "programma/index.html"), "utf8");
  assert.match(h, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(h, /<script(?![^>]*\bsrc=)/);
  assert.doesNotMatch(h, /unsafe-inline/);
  const js = readFileSync(join(root, "programma/prg.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(js, /Programma di sala realizzato con /);
  assert.match(js, /https:\/\/stageplot\.it/);
});

/* ------------------------------------------------------------------ configurazione */
test("configura: in produzione sempre il server vero; ?api= solo da localhost", () => {
  assert.equal(P.configura("stageplot.it", "?api=https://evil.example").api, P.API_PROD);
  assert.equal(P.configura("localhost", "?api=http://127.0.0.1:54321&anon=abc.def").api, "http://127.0.0.1:54321");
  assert.equal(P.configura("localhost", "?api=javascript:x").api, P.API_PROD);
});

/* ------------------------------------------------------------------ validazione */
test("validaDati: solo documenti v1; il resto è null e non lancia", () => {
  for (const x of [null, undefined, 1, "x", [], {}, { v: 2 }, { v: "1" }, { v: 1.5 }]) assert.equal(P.validaDati(x), null, JSON.stringify(x));
  assert.deepEqual(P.validaDati({ v: 1 }), { v: 1, intestazione: null, sezioni: [], link: [] }, "tutto facoltativo tranne v");
});

test("validaDati: tipi sconosciuti ignorati, campi del tipo sbagliato svuotati, stringhe tagliate, a capo tolti dai titoli", () => {
  const v = P.validaDati(ESEMPIO);
  assert.deepEqual(v.sezioni.map((s) => s.tipo), ["interpreti", "brani", "testo"]);
  const sporco = P.validaDati({ v: 1, intestazione: { titolo: 12, righe: "no", quando: ["x"] },
    sezioni: [null, 5, { tipo: "testo", paragrafi: [1, null, "ok", "  "] }, { tipo: "interpreti", persone: [{ nome: 3 }, "x", { nome: "A" }] }, { tipo: "brani", voci: {} }] });
  assert.deepEqual(sporco.intestazione, { sopratitolo: "", titolo: "", titolo_corsivo: "", righe: [], quando: "" });
  assert.deepEqual(sporco.sezioni[0].paragrafi, ["ok"]);
  assert.deepEqual(sporco.sezioni[1].persone, [{ nome: "A", ruolo: "" }]);
  assert.deepEqual(sporco.sezioni[2].voci, []);
  assert.equal(P.validaDati({ v: 1, intestazione: { titolo: "a\nb\u0000c" } }).intestazione.titolo, "a bc");
  assert.equal(P.validaDati({ v: 1, intestazione: { titolo: "x".repeat(5000) } }).intestazione.titolo.length, 200);
  assert.equal(P.validaDati({ v: 1, sezioni: Array.from({ length: 500 }, () => ({ tipo: "testo", paragrafi: ["a"] })) }).sezioni.length, 40);
});

test("link: solo https:, senza credenziali; il resto è scartato", () => {
  const url = (u) => P.validaDati({ v: 1, link: [{ testo: "x", url: u }] }).link.length;
  assert.equal(url("https://example.invalid/a?b=1"), 1);
  for (const u of ["http://example.invalid", "javascript:alert(1)", "data:text/html,x", "//example.invalid", "ftp://example.invalid", "mailto:a@example.invalid",
    "https://utente:pw@example.invalid", "https://", "esempio.invalid", " javascript:alert(1)", 5, null, {}]) assert.equal(url(u), 0, String(u));
  assert.equal(P.validaDati({ v: 1, link: [{ url: "https://example.invalid/" }] }).link[0].testo, "https://example.invalid/", "senza testo: l'indirizzo");
});

/* ------------------------------------------------------------------ DOM */
test("costruisci: intestazione, sezioni, numerazione, corsivi, link e niente tipi sconosciuti", () => {
  const r = P.costruisci(ESEMPIO, doc);
  const h1 = tag(r, "h1")[0];
  assert.equal(h1.textContent, "Concerto d'esempio");
  assert.equal(tag(h1, "em")[0].textContent, "d'esempio", "il titolo corsivo è in <em>");
  assert.deepEqual(tag(r, "h2").map((x) => x.textContent), ["Gli interpreti", "I brani", "Due parole"]);
  assert.ok(!r.textContent.includes("Non deve comparire"));
  const ol = tag(r, "ol")[0];
  assert.equal(ol.children.length, 2, "voci numerate: <ol> con una <li> per voce (1, 2, …)");
  assert.deepEqual(tag(ol, "em").map((x) => x.textContent), ["Primo brano", "Secondo brano"], "titolo delle voci in corsivo");
  assert.equal(tag(r, "li").filter((li) => li.children.some((c) => c.className === "prg-nome")).length, 2);
  const a = tag(r, "a")[0];
  assert.deepEqual([a.attrs.href, a.attrs.target, a.attrs.rel], ["https://example.invalid/sito", "_blank", "noopener noreferrer"]);
  assert.equal(P.costruisci({ v: 9 }, doc), null);
});

test("ESCAPING: un <img onerror> nei dati resta testo, in ogni campo; nessun elemento che non sia nostro", () => {
  const X = '<img src=x onerror="alert(1)">';
  const sporco = { v: 1, intestazione: { sopratitolo: X, titolo: X, titolo_corsivo: X, righe: [X], quando: X },
    sezioni: [{ tipo: "interpreti", etichetta: X, titolo: X, persone: [{ nome: X, ruolo: X }], nota: X },
      { tipo: "brani", etichetta: X, titolo: X, voci: [{ titolo: X, dettaglio: X, brani: X, nota: X }] },
      { tipo: "testo", etichetta: X, titolo: X, paragrafi: [X] }], link: [{ testo: X, url: "https://example.invalid/" }] };
  const r = P.costruisci(sporco, doc);
  const ammessi = new Set(["DIV", "HEADER", "P", "H1", "H2", "EM", "SECTION", "UL", "OL", "LI", "SPAN", "NAV", "A", "#text"]);
  const nodi = tutti(r);
  assert.ok(nodi.every((n) => ammessi.has(n.tagName)), "nessun IMG, SCRIPT, ecc.: " + [...new Set(nodi.map((n) => n.tagName))]);
  assert.equal(tag(r, "img").length, 0);
  assert.ok(nodi.filter((n) => n.tagName === "#text" && n.testo.includes(X)).length >= 18, "il markup è finito come testo, ovunque (18 campi)");
  assert.ok(nodi.every((n) => !Object.keys(n.attrs).some((k) => /^on/i.test(k))), "nessun attributo on…");
  assert.ok(nodi.every((n) => Object.keys(n.attrs).every((k) => ["href", "rel", "target"].includes(k))));
});

test("titoloPagina: dal titolo ripulito; senza titolo il nome della pagina", () => {
  assert.equal(P.titoloPagina(ESEMPIO), "Concerto d'esempio — Programma di sala");
  assert.equal(P.titoloPagina({ v: 1 }), "Programma di sala");
  assert.equal(P.titoloPagina(null), "Programma di sala");
});
