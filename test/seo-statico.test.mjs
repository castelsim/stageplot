/* Controllo tecnico SEO/GEO delle pagine statiche indicizzabili (09/11/2026).
   Nasce da un controllo sul sito pubblicato: le guide nuove erano raggiungibili da una o due pagine sole,
   il loro Article non diceva chi pubblica, 34 pagine su 35 non avevano og:site_name e le anteprime
   social chiedevano tre versioni diverse della stessa immagine. Qui le regole che lo impediscono.
   L'elenco delle pagine viene dalla sitemap: una pagina nuova entra nei controlli da sola. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const leggi = (p) => readFileSync(join(root, p), "utf8");
const sitemap = leggi("sitemap.xml");
const pagine = [...sitemap.matchAll(/<loc>https:\/\/stageplot\.it\/([^<]*)<\/loc>/g)].map((m) => m[1]);
const file = (rel) => (rel || "") + "index.html";
const html = Object.fromEntries(pagine.map((rel) => [rel, leggi(file(rel))]));

/* Privacy e termini: pagine legali, senza anteprima social di proposito (nessuno le condivide). */
const SENZA_OG = new Set(["privacy/", "termini/"]);

function nodiLd(h) {
  const out = [];
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const j = JSON.parse(m[1]);
    const radice = Array.isArray(j) ? j : j["@graph"] || [j];
    for (const n of radice) out.push(n);
  }
  return out;
}

function linkInterni(h) {
  const out = new Set();
  for (const m of h.matchAll(/<a\s[^>]*href="([^"#?]+)/g)) {
    let u = m[1];
    if (u.startsWith("https://stageplot.it")) u = u.slice("https://stageplot.it".length);
    if (u.startsWith("/")) out.add(u.slice(1));
  }
  return out;
}

test("la sitemap elenca le pagine e ognuna ha il suo file", () => {
  assert.ok(pagine.length >= 30, "pagine in sitemap: " + pagine.length);
  for (const rel of pagine) assert.ok(existsSync(join(root, file(rel))), file(rel));
});

test("ogni pagina condivisibile dice il nome del sito, «stageplot.it», una volta sola", () => {
  /* Il marchio è «stageplot.it» col .it (decisione del 07/11/2026): è il nome che i social mostrano
     sopra il titolo dell'anteprima. */
  for (const rel of pagine) {
    if (SENZA_OG.has(rel)) continue;
    const m = [...html[rel].matchAll(/<meta property="og:site_name" content="([^"]*)">/g)];
    assert.equal(m.length, 1, (rel || "/") + ": og:site_name presente una volta");
    assert.equal(m[0][1], "stageplot.it", (rel || "/") + ": og:site_name");
  }
});

test("le anteprime social chiedono tutte la stessa versione dell'immagine", () => {
  /* Il ?v= serve a far riscaricare l'immagine a Facebook e LinkedIn: con versioni diverse una pagina
     resta con l'anteprima vecchia in cache. */
  const home = html[""].match(/<meta property="og:image" content="([^"]+)">/)[1];
  for (const rel of pagine) {
    if (SENZA_OG.has(rel)) continue;
    const h = html[rel];
    for (const m of h.matchAll(/<meta (?:property|name)="(?:og:image|twitter:image)" content="([^"]+)">/g)) {
      if (/\/preview\.png/.test(m[1])) assert.equal(m[1], home, (rel || "/") + ": " + m[1]);
    }
  }
});

test("ogni Article dice chi scrive e chi pubblica, collegati alle entità della home e del sito personale", () => {
  /* Senza publisher e senza @id dell'autore, per chi legge i dati strutturati (Google, motori AI)
     la guida è di uno sconosciuto: l'entità «Simone Castellan, sound engineer» non si collega. */
  let articoli = 0;
  for (const rel of pagine) {
    for (const n of nodiLd(html[rel])) {
      if (n["@type"] !== "Article") continue;
      articoli++;
      const dove = (rel || "/") + ": ";
      assert.ok(n.headline && n.headline.length <= 110, dove + "headline");
      assert.ok(n.image, dove + "image");
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(n.datePublished || ""), dove + "datePublished");
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(n.dateModified || ""), dove + "dateModified");
      assert.equal(n.mainEntityOfPage, "https://stageplot.it/" + rel, dove + "mainEntityOfPage");
      assert.equal(n.author && n.author["@id"], "https://simonecastellan.com/#person", dove + "author @id");
      assert.ok(n.author && n.author.jobTitle, dove + "author jobTitle");
      assert.equal(n.publisher && n.publisher["@id"], "https://stageplot.it/#org", dove + "publisher @id");
      assert.ok(n.publisher && n.publisher.logo && n.publisher.logo.url, dove + "publisher logo");
    }
  }
  assert.ok(articoli >= 25, "Article trovati: " + articoli);
});

test("nessuna pagina indicizzabile è quasi orfana: almeno 3 altre pagine della sitemap la linkano", () => {
  /* Il 09/11 le guide «scheda tecnica di un convegno» e «disposizione del coro» erano linkate solo
     dall'indice delle guide (e una dalla landing del coro): Google le trova tardi e le pesa poco. */
  const entrata = Object.fromEntries(pagine.map((rel) => [rel, new Set()]));
  for (const da of pagine) {
    for (const a of linkInterni(html[da])) if (a !== da && entrata[a]) entrata[a].add(da);
  }
  const poche = pagine.filter((rel) => rel && entrata[rel].size < 3).map((rel) => rel + " (" + entrata[rel].size + ")");
  assert.deepEqual(poche, [], "pagine con meno di 3 link in entrata");
});

test("llms.txt elenca ogni pagina della sitemap", () => {
  /* llms.txt è l'indice che leggono i motori AI: una guida nuova che manca lì per loro non esiste. */
  const l = leggi("llms.txt");
  const manca = pagine.filter((rel) => l.indexOf("(https://stageplot.it/" + rel + ")") === -1);
  assert.deepEqual(manca, [], "pagine della sitemap assenti da llms.txt");
});

test("le miniature del PDF d'esempio in home hanno la versione WebP leggera, col JPG come ripiego", () => {
  /* Erano quattro JPG da 120-300 KB (circa 880 KB) per figure larghe al massimo ~280 px. */
  const h = html[""];
  const figure = [...h.matchAll(/<img src="\/img\/(esemplare-tributo-(?:palco|rider|channel-list|elettrico))\.jpg"/g)].map((m) => m[1]);
  assert.equal(figure.length, 4, "quattro miniature");
  for (const n of figure) {
    const webp = "img/" + n + "-640.webp";
    assert.ok(existsSync(join(root, webp)), webp + " esiste");
    const re = new RegExp('<picture><source type="image/webp" srcset="/' + webp.replace(/\./g, "\\.") + ' 640w" sizes="[^"]+"><img src="/img/' + n + '\\.jpg"');
    assert.match(h, re, n + ": <picture> con WebP prima del JPG");
    assert.ok(statSync(join(root, webp)).size * 2 < statSync(join(root, "img/" + n + ".jpg")).size, n + ": la WebP pesa meno della metà");
  }
  assert.match(h, /\.pagine picture\{display:block\}/, "il <picture> non cambia l'impaginazione delle miniature");
});
