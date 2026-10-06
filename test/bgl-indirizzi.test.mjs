/* Biglietteria — gli indirizzi (specifica area §1): scorciatoie riconosciute da 404.html, link belli per QR e copie. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const I = createRequire(import.meta.url)(join(root, "biglietteria/indirizzi.js"));

test("RF3: la scorciatoia porta all'indirizzo canonico, anche con maiuscole, barra finale e parametri", () => {
  assert.equal(I.scorciatoia("/biglietteria/teatro-prova"), "/biglietteria/?o=teatro-prova");
  assert.equal(I.scorciatoia("/biglietteria/teatro-prova/concerto-9-ottobre"), "/biglietteria/?o=teatro-prova&s=concerto-9-ottobre");
  assert.equal(I.scorciatoia("/biglietteria/Teatro-Prova/Concerto-9-Ottobre/"), "/biglietteria/?o=teatro-prova&s=concerto-9-ottobre");
  assert.equal(I.scorciatoia("/biglietteria/teatro-prova", "?x=1&o=altro"), "/biglietteria/?o=teatro-prova&x=1", "o/s della scorciatoia vincono");
});

test("non sono scorciatoie: parole riservate, file, formati storti, troppi livelli", () => {
  for (const p of ["/biglietteria/", "/biglietteria/mie", "/biglietteria/gestione/", "/biglietteria/bgl.js", "/biglietteria/ab",
    "/biglietteria/te--atro", "/biglietteria/-teatro", "/biglietteria/a/b/c", "/app/teatro-prova", "/biglietteria/teatro prova",
    "/biglietteria/" + "a".repeat(41), "/biglietteria/teatro-prova/x"]) assert.equal(I.scorciatoia(p), null, p);
});

test("link belli (QR e copie) e canonici; url della locandina solo per nomi validi", () => {
  assert.equal(I.linkOrganizzatore("teatro-prova"), "https://stageplot.it/biglietteria/teatro-prova");
  assert.equal(I.linkSpettacolo("teatro-prova", "concerto-9-ottobre", "http://127.0.0.1:8811"), "http://127.0.0.1:8811/biglietteria/teatro-prova/concerto-9-ottobre");
  assert.equal(I.linkCanonico("teatro-prova", "concerto-9-ottobre"), "/biglietteria/?o=teatro-prova&s=concerto-9-ottobre");
  const p = "0b8d0000-0000-4000-8000-000000000001/" + "a".repeat(32) + ".webp";
  assert.equal(I.urlLocandina("https://x.supabase.co/", p), "https://x.supabase.co/storage/v1/object/public/bgl-locandine/" + p);
  for (const q of ["../x.webp", p.replace(".webp", ".svg"), "a/b/" + "a".repeat(32) + ".webp", null]) assert.equal(I.urlLocandina("https://x", q), "", String(q));
});

test("le parole riservate sono le stesse del database (0074)", (t) => {
  const f = join(root, "supabase/migrations/0074_bgl_area_organizzatori.sql");
  /* La 0074 nasce nel task 3 (altro ramo): finché non è unita il confronto non si può fare. Nel ramo integrato esiste, e il
     test torna a pesare davvero (se manca ma dovrebbe esserci, la suite di integrazione lo vede come «saltato»). */
  if (!existsSync(f)) return t.skip("0074 non ancora presente (task 3): confronto da rifare in integrazione");
  const sql = readFileSync(f, "utf8");
  const m = /p = any \(array\[([^\]]+)\]\)/.exec(sql.replace(/\s+/g, " "));
  assert.ok(m, "la 0074 elenca le parole riservate con «p = any (array[…])»");
  assert.deepEqual(m[1].split(",").map((x) => x.trim().replace(/'/g, "")).sort(), I.RISERVATI.slice().sort());
});

test("404.html carica indirizzi.js e rimanda PRIMA di disegnare la pagina", () => {
  const h = readFileSync(join(root, "404.html"), "utf8");
  const i = h.indexOf('<script src="/biglietteria/indirizzi.js"></script>'), j = h.indexOf("BGLIndirizzi.scorciatoia(location.pathname,location.search)");
  assert.ok(i > 0 && j > i && j < h.indexOf("<body"), "nella <head>, dopo lo script");
  assert.match(h, /location\.replace\(d\+location\.hash\)/);
  assert.match(h, /<meta name="robots" content="noindex">/);
});
