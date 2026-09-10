/* Dal documento dell'editor alle postazioni: puro, senza rete. */
import test from "node:test";
import assert from "node:assert/strict";
import { typeMapFrom, docVariants, extractPositions, proposeRoles, diffProposal, importSummary, staleLinks, isUuid, seatsOf, partFromLabel, importGroups } from "../src/domain/stageplot-import.js";

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

test("la parte si legge dall'etichetta, solo per gli strumenti che si dividono", () => {
  for (const l of ["Vl I 3", "Vl 1", "Vln I", "Violini I", "V1", "Violini primi", "vl.I", "Vl 1°"]) assert.equal(partFromLabel(l, "violino"), "Violini primi", l);
  for (const l of ["Vl II 3", "Vl 2", "Vln II", "Violini secondi", "V2"]) assert.equal(partFromLabel(l, "violino"), "Violini secondi", l);
  assert.equal(partFromLabel("Vl", "violino"), null); assert.equal(partFromLabel("Archi", "violino"), null); assert.equal(partFromLabel("", "violino"), null);
  assert.equal(partFromLabel("Vla 1", "viola"), null, "le viole non si dividono");
  assert.equal(partFromLabel("Vl III", "violino"), null, "una terza parte non esiste");
});

test("la proposta raggruppa per strumento E parte, nell'ordine delle famiglie", () => {
  const prop = proposeRoles(extractPositions(DOC, "b", MAP).positions, INSTR);
  assert.deepEqual(prop.map((g) => [g.name, g.seats, g.family]), [["Violini primi", 4, "archi"], ["Viola", 1, "archi"], ["Flauto", 1, "legni"], ["Pianoforte", 1, "tastiere"], ["Direttore", 1, "direzione"]]);
  assert.deepEqual(prop[0].items, ["i1", "i2"]); assert.equal(prop[0].part, "Violini primi"); assert.equal(prop[1].part, null);
  const two = proposeRoles([{ item_id: "a", instrument_code: "violino", label: "Vl I 1", seats: 1 }, { item_id: "b", instrument_code: "violino", label: "Vl II 1", seats: 1 }, { item_id: "c", instrument_code: "violino", label: "Vl", seats: 1 }], INSTR);
  assert.deepEqual(two.map((g) => [g.name, g.seats]), [["Violini primi", 1], ["Violini secondi", 1], ["Violino", 1]]);
});

test("il confronto con l'organico: ruolo per parte, posti liberi o già di queste postazioni, mai in meno", () => {
  const prop = proposeRoles(extractPositions(DOC, "b", MAP).positions, INSTR);
  const roles = [
    { id: "r1", name: "Violini primi", instrument_code: "violino", seats: 3, slots: [{ item_id: "i1" }, { item_id: "zz" }, { item_id: null }] },
    { id: "r2", name: "Violini secondi", instrument_code: "violino", seats: 2, slots: [{ item_id: null }, { item_id: null }] },
    { id: "r3", name: "Viole", instrument_code: "viola", seats: 6, slots: Array.from({ length: 6 }, () => ({ item_id: null })) },
    { id: "r4", name: "Altro", instrument_code: null, seats: 3, slots: [] },
  ];
  const d = diffProposal(prop, roles);
  assert.deepEqual(d.map((x) => [x.name, x.role_id, x.action, x.current, x.add]), [["Violini primi", "r1", "grow", 3, 2], ["Viola", "r3", "ok", 6, 0], ["Flauto", null, "new", 0, 1], ["Pianoforte", null, "new", 0, 1], ["Direttore", null, "new", 0, 1]]);
  assert.equal(d[0].options.length, 2, "i ruoli dello stesso strumento sono le opzioni");
  assert.equal(importSummary(d, [{ item_id: "i6" }]), "3 ruoli nuovi, 1 ruolo allargato, 5 posti in più, 1 elemento senza strumento in catalogo.");
  /* parte non dedotta e due ruoli di violino: ambiguo, l'anteprima chiede */
  const amb = diffProposal(proposeRoles([{ item_id: "c", instrument_code: "violino", label: "Vl", seats: 1 }], INSTR), roles);
  assert.equal(amb[0].ambiguous, true); assert.equal(amb[0].role_id, null);
  assert.equal(importSummary(amb, []), "1 ruolo nuovo, 1 posto in più, 1 gruppo da assegnare a un ruolo.");
  /* parte non dedotta e UN solo ruolo: quello */
  const one = diffProposal(proposeRoles([{ item_id: "c", instrument_code: "violino", label: "Vl", seats: 1 }], INSTR), [roles[1]]);
  assert.equal(one[0].role_id, "r2"); assert.equal(one[0].action, "ok");
  const g = importGroups(d);
  assert.deepEqual(g[0], { instrument_code: "violino", role_id: "r1", role_name: "Violini primi", positions: [{ item_id: "i1", item_type: "vln1x2", label: "Vl I 1-2", seats: 2 }, { item_id: "i2", item_type: "vlnpost", label: "Vl I 3", seats: 2 }] });
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
