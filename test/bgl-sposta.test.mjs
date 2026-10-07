/* Biglietteria — «Sposta»: la scelta dei posti nuovi. node --test test/bgl-sposta.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SP = createRequire(import.meta.url)(join(root, "biglietteria/gestione/gst-sposta.js"));

test("si scelgono tanti posti quanti ne ha adesso la prenotazione (D6), mai un posto d'altri", () => {
  let r = SP.spostaScelta([], "Platea|C|3", 2, []); assert.deepEqual(r, { scelti: ["Platea|C|3"], avviso: null });
  r = SP.spostaScelta(r.scelti, "Platea|C|4", 2, []); assert.equal(SP.spostaPronto(r.scelti, 2), true);
  assert.deepEqual(SP.spostaScelta(r.scelti, "Platea|C|5", 2, []), { scelti: ["Platea|C|3", "Platea|C|4"], avviso: "pieno" });
  assert.deepEqual(SP.spostaScelta(r.scelti, "Platea|C|3", 2, []).scelti, ["Platea|C|4"], "ritoccare toglie");
  assert.deepEqual(SP.spostaScelta([], "Platea|B|1", 2, ["Platea|B|1"]), { scelti: [], avviso: "occupato" });
  assert.equal(SP.spostaPronto(["Platea|C|3"], 2), false);
  assert.equal(SP.spostaPronto(["Platea|C|3", "Platea|C|4", "Platea|C|5"], 2), false, "mai più posti di adesso");
});

test("gli stessi posti di adesso non sono uno spostamento", () => {
  assert.equal(SP.spostaPronto(["Platea|A|6", "Platea|A|5"], 2, ["Platea|A|5", "Platea|A|6"]), false);
  assert.equal(SP.spostaPronto(["Platea|A|6", "Platea|C|1"], 2, ["Platea|A|5", "Platea|A|6"]), true, "uno solo cambiato: sì");
});

test("la frase per la conferma", () => {
  assert.equal(SP.frase(["Platea|A|5", "Platea|A|6"], ["Platea|C|3", "Platea|C|4"]), "A 5, A 6 → C 3, C 4");
});

test("la pagina dell'area carica Sposta dopo la scheda", () => {
  const h = readFileSync(join(root, "biglietteria/gestione/index.html"), "utf8");
  assert.ok(h.indexOf('src="gst-sposta.js') > h.indexOf('src="gst-scheda.js') && h.indexOf('src="gst-scheda.js') > 0);
});
