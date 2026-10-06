/* Biglietteria — il modulo «Nuovo spettacolo / modifica»: le scelte pure. node --test test/bgl-modulo.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOD = createRequire(import.meta.url)(join(root, "biglietteria/gestione/gst-modulo.js"));

test("la variante: quella chiesta, altrimenti quella attiva nel progetto, altrimenti la prima", () => {
  const pr = { varianti: [{ id: "V1", nome: "Piena", attiva: false }, { id: "V2", nome: "Ridotta", attiva: true }] };
  assert.equal(MOD.varianteScelta(pr, "V1").id, "V1");
  assert.equal(MOD.varianteScelta(pr, null).id, "V2");
  assert.equal(MOD.varianteScelta(pr, "V9").id, "V2", "una variante che non c'è più: l'attiva");
  assert.equal(MOD.varianteScelta({ varianti: [{ id: null, nome: "Variante 1", attiva: true }] }, null).id, null, "documento piatto");
  assert.equal(MOD.varianteScelta(null, null), null);
});

test("tenuti da parte sulla pianta: tocco = metti/togli; un posto prenotato non si tiene da parte", () => {
  assert.deepEqual(MOD.toggleTenuto([], "Platea|A|1", []), ["Platea|A|1"]);
  assert.deepEqual(MOD.toggleTenuto(["Platea|A|1", "Platea|A|2"], "Platea|A|1", []), ["Platea|A|2"]);
  assert.deepEqual(MOD.toggleTenuto(["Platea|A|2"], "Platea|B|5", ["Platea|B|5"]), ["Platea|A|2"]);
});

test("la pagina dell'area carica il modulo dopo gst-app.js", () => {
  const h = readFileSync(join(root, "biglietteria/gestione/index.html"), "utf8");
  assert.ok(h.indexOf('src="gst-modulo.js') > h.indexOf('src="gst-app.js'));
});

test("Modifica: la foto salvata sul server non ha le chiavi dei posti; senza, ogni posto sembrerebbe «doppio»", () => {
  const PP = createRequire(import.meta.url)(join(root, "biglietteria/pianta-posti.js"));
  const foto = { v: 1, box: [0, 0, 1400, 1600], palco: [], pedane: [], posti: [
    { settore: "Platea", fila: "A", posto: 1, x: 260, y: 1000, w: 50, d: 53, rot: 180 },
    { settore: "Platea", fila: "A", posto: 2, x: 320, y: 1000, w: 50, d: 53, rot: 180 },
    { settore: "Galleria", fila: "A", posto: 1, x: 260, y: 1200, w: 50, d: 53, rot: 180 }] };
  assert.ok(PP.bglProblemiPianta(foto).length > 0, "così com'è, la foto del server dà un falso «posti doppi»");
  const c = MOD.conChiavi(foto);
  assert.deepEqual(c.posti.map((q) => q.k), ["Platea|A|1", "Platea|A|2", "Galleria|A|1"]);
  assert.deepEqual(PP.bglProblemiPianta(c), []);
  assert.equal(foto.posti[0].k, undefined, "la foto originale non si tocca");
  assert.deepEqual(MOD.chiaviPianta(c), ["Platea|A|1", "Platea|A|2", "Galleria|A|1"]);
  assert.equal(MOD.conChiavi(null), null);
  assert.deepEqual(MOD.chiaviPianta(null), []);
});

test("la pianta nel modulo: sul telefono i posti restano toccabili (si scorre dentro), sul computer sta tutta", () => {
  /* box 1400 cm; dettaglio = la scala a cui un posto è grande come il dito (BGL.scalaDettaglio) */
  assert.equal(MOD.scalaMappa(1400, 356, 0.73), 0.73 * 0.75, "telefono: posti grandi, la pianta va oltre lo schermo");
  assert.equal(MOD.scalaMappa(1400, 1400, 0.73), 1, "computer largo: tutta la pianta");
  assert.equal(MOD.scalaMappa(0, 356, 0.73), null);
  /* si parte con i posti in vista, non col palco */
  const pianta = { posti: [{ x: 260, y: 1000 }, { x: 560, y: 1000 }, { x: 260, y: 1270 }] };
  assert.deepEqual(MOD.inizioMappa(pianta, 0.5, 300, 400), { l: Math.round(205 - 150), t: Math.round(500 - 40) });
  assert.deepEqual(MOD.inizioMappa({ posti: [] }, 0.5, 300, 400), { l: 0, t: 0 });
});
