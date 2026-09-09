/* Dal documento dell'editor alle postazioni: puro, senza rete. */
import test from "node:test";
import assert from "node:assert/strict";
import { typeMapFrom, docVariants, extractPositions, proposeRoles, diffProposal, importSummary, staleLinks, isUuid, seatsOf } from "../src/domain/stageplot-import.js";

const INSTR = [
  { code: "violino", name: "Violino", family: "archi", sort: 1, stageplot_types: ["vlnpost", "vln1x2", "vln2x2"] },
  { code: "viola", name: "Viola", family: "archi", sort: 2, stageplot_types: ["violapost", "violax2"] },
  { code: "flauto", name: "Flauto", family: "legni", sort: 10, stageplot_types: ["flauto"] },
  { code: "direttore", name: "Direttore", family: "direzione", sort: 90, stageplot_types: ["direttore"] },
  { code: "pianoforte", name: "Pianoforte", family: "tastiere", sort: 40, stageplot_types: ["grancoda", "mezzacoda"] },
];
const MAP = typeMapFrom(INSTR);
const DOC = {
  _doc: 1, active: "b",
  variants: [
    { id: "a", name: "Prove", state: { items: [{ id: "i1", type: "vlnpost", label: "Vl 1" }] } },
    { id: "b", name: "Concerto", state: { items: [
      { id: "i1", type: "vln1x2", label: "Vl I 1-2" },
      { id: "i2", type: "vlnpost", label: "Vl I 3", doppia: true },
      { id: "i3", type: "violapost", label: "Vla" },
      { id: "i4", type: "flauto", label: "Fl" },
      { id: "i5", type: "direttore", label: "Dir" },
      { id: "i6", type: "wedge", label: "Monitor" },
      { id: "i7", type: "grancoda", label: "Pf" },
      { id: "i7", type: "grancoda", label: "doppione" },
      { type: "flauto", label: "senza id" },
    ] } },
  ],
};

test("la mappa tipo → strumento viene dal catalogo, il primo che dichiara un tipo vince", () => {
  assert.equal(MAP.vln1x2, "violino"); assert.equal(MAP.grancoda, "pianoforte");
  assert.equal(typeMapFrom([{ code: "a", stageplot_types: ["x"] }, { code: "b", stageplot_types: ["x"] }]).x, "a");
  assert.deepEqual(typeMapFrom(null), {});
});

test("le varianti: attiva marcata, documento piatto = una sola", () => {
  assert.deepEqual(docVariants(DOC), [{ id: "a", name: "Prove", active: false }, { id: "b", name: "Concerto", active: true }]);
  assert.deepEqual(docVariants({ items: [] }), [{ id: "legacy", name: "Progetto", active: true }]);
  assert.deepEqual(docVariants(null), []);
});

test("le postazioni: doppie = 2 posti, tipi sconosciuti a parte, doppioni e senza id ignorati", () => {
  const { positions, unmapped, empty } = extractPositions(DOC, "b", MAP);
  assert.equal(empty, false);
  assert.deepEqual(positions.map((p) => [p.item_id, p.instrument_code, p.seats]), [["i1", "violino", 2], ["i2", "violino", 2], ["i3", "viola", 1], ["i4", "flauto", 1], ["i5", "direttore", 1], ["i7", "pianoforte", 1]]);
  assert.deepEqual(unmapped, [{ item_id: "i6", item_type: "wedge", label: "Monitor" }]);
  assert.equal(seatsOf({ type: "cbx2" }), 2); assert.equal(seatsOf({ type: "flauto" }), 1);
});

test("senza variante si legge quella attiva; una variante inesistente è vuota; il documento piatto si legge", () => {
  assert.equal(extractPositions(DOC, "", MAP).positions.length, 6);
  assert.equal(extractPositions(DOC, "a", MAP).positions.length, 1);
  assert.equal(extractPositions(DOC, "zzz", MAP).empty, true);
  assert.equal(extractPositions({ items: [{ id: "x", type: "flauto" }] }, "legacy", MAP).positions[0].instrument_code, "flauto");
});

test("la proposta raggruppa per strumento nell'ordine delle famiglie", () => {
  const prop = proposeRoles(extractPositions(DOC, "b", MAP).positions, INSTR);
  assert.deepEqual(prop.map((g) => [g.name, g.seats, g.family]), [["Violino", 4, "archi"], ["Viola", 1, "archi"], ["Flauto", 1, "legni"], ["Pianoforte", 1, "tastiere"], ["Direttore", 1, "direzione"]]);
  assert.deepEqual(prop[0].items, ["i1", "i2"]);
});

test("il confronto con l'organico: nuovo, allargato, già coperto; i posti non si tolgono mai", () => {
  const prop = proposeRoles(extractPositions(DOC, "b", MAP).positions, INSTR);
  const roles = [{ instrument_code: "violino", seats: 2 }, { instrument_code: "violino", seats: 1 }, { instrument_code: "viola", seats: 6 }, { instrument_code: null, seats: 3 }];
  const d = diffProposal(prop, roles);
  assert.deepEqual(d.map((x) => [x.instrument_code, x.action, x.current, x.add]), [["violino", "grow", 3, 1], ["viola", "ok", 6, 0], ["flauto", "new", 0, 1], ["pianoforte", "new", 0, 1], ["direttore", "new", 0, 1]]);
  assert.equal(importSummary(d, [{ item_id: "i6" }]), "3 ruoli nuovi, 1 ruolo allargato, 4 posti in più, 1 elemento senza strumento in catalogo.");
  assert.equal(importSummary(diffProposal(prop, prop.map((g) => ({ instrument_code: g.instrument_code, seats: g.seats }))), []), "l'organico copre già il palco.");
  assert.equal(importSummary([], []), "nessuna postazione riconosciuta.");
});

test("i collegamenti a postazioni sparite dal palco sono stale", () => {
  assert.deepEqual(staleLinks([{ item_id: "i1" }, { item_id: "gone" }], [{ item_id: "i1" }]), ["gone"]);
});

test("uuid", () => {
  assert.equal(isUuid("0f0e0d0c-1b1a-4c3d-8e2f-a1b2c3d4e5f6"), true);
  assert.equal(isUuid("0f0e0d0c-1b1a-4c3d-8e2f-a1b2c3d4e5f"), false);
  assert.equal(isUuid("' or 1=1"), false); assert.equal(isUuid(null), false);
});
