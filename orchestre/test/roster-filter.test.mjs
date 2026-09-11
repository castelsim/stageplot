/* I filtri dell'elenco musicisti, senza browser e senza database. */
import test from "node:test";
import assert from "node:assert/strict";
import { filtra, opzioni, zone, vuoti, altriAttivi, daIndirizzo, aIndirizzo, norm } from "../src/domain/roster-filter.js";

const POOL = [
  { id: "1", first_name: "Carla", last_name: "Completa", city: "Schio", province: "vi", area: "Veneto", status: "active", primary_family: "archi",
    instruments: ["Violino"], tags: ["Prima parte"], genres: ["pop", "sacra"], reading: 3, experiences: ["esp_pop", "esp_live"] },
  { id: "2", first_name: "Luca", last_name: "Leggero", city: "Padova", province: "PD", area: "", status: "active", primary_family: "archi",
    instruments: ["Violoncello"], tags: [], genres: ["classica"], reading: 1, experiences: ["esp_orchestrale"] },
  { id: "3", first_name: "Sara", last_name: "Scarna", city: "", province: "", area: "Nord-Est", status: "paused", primary_family: "legni",
    instruments: ["Oboe"], tags: ["prima parte"], genres: [], reading: 0, experiences: [] },
];
const ids = (F) => filtra(POOL, { ...vuoti(), ...F }).map((m) => m.id);

test("senza filtri restano tutti", () => {
  assert.deepEqual(ids({}), ["1", "2", "3"]);
});

test("genere: uno che il musicista ha, senza badare a maiuscole", () => {
  assert.deepEqual(ids({ genre: "Pop" }), ["1"]);
  assert.deepEqual(ids({ genre: "classica" }), ["2"]);
});

test("lettura a prima vista: è una soglia, «almeno»", () => {
  assert.deepEqual(ids({ reading: "1" }), ["1", "2"]);
  assert.deepEqual(ids({ reading: "3" }), ["1"]);
  assert.deepEqual(ids({ reading: "" }), ["1", "2", "3"], "vuoto è «qualsiasi», anche chi è a zero");
});

test("esperienza: il codice dell'esperienza", () => {
  assert.deepEqual(ids({ exp: "esp_orchestrale" }), ["2"]);
  assert.deepEqual(ids({ exp: "esp_live" }), ["1"]);
});

test("zona: la sigla della provincia, scritta come capita, oppure l'area", () => {
  assert.deepEqual(zone(POOL[0]), ["VI", "Veneto"]);
  assert.deepEqual(ids({ zone: "VI" }), ["1"], "la provincia salvata in minuscolo si trova lo stesso");
  assert.deepEqual(ids({ zone: "Nord-Est" }), ["3"]);
});

test("tag: lo stesso tag scritto in due modi è uno solo", () => {
  assert.deepEqual(ids({ tag: "prima parte" }), ["1", "3"]);
  assert.deepEqual(opzioni(POOL).tag, ["Prima parte"]);
});

test("i filtri si sommano, e la ricerca libera guarda anche generi e area", () => {
  assert.deepEqual(ids({ family: "archi", reading: "2" }), ["1"]);
  assert.deepEqual(ids({ q: "sacra" }), ["1"]);
  assert.deepEqual(ids({ q: "nord" }), ["3"]);
  assert.deepEqual(ids({ genre: "pop", exp: "esp_orchestrale" }), [], "nessuno fa tutte e due");
});

test("i menu offrono solo quello che c'è nel pool", () => {
  const o = opzioni(POOL);
  assert.deepEqual(o.generi, ["classica", "pop", "sacra"]);
  assert.deepEqual(o.zone, ["PD", "VI", "Nord-Est", "Veneto"], "prima le province, poi le aree");
});

test("righe senza i campi nuovi non rompono niente", () => {
  const vecchia = [{ id: "x", first_name: "A", last_name: "B", status: "active" }];
  assert.deepEqual(filtra(vecchia, vuoti()).length, 1);
  assert.deepEqual(filtra(vecchia, { ...vuoti(), genre: "pop" }).length, 0);
  assert.deepEqual(opzioni(vecchia), { generi: [], zone: [], tag: [] });
});

test("i filtri vanno e tornano dall'indirizzo, e si contano quelli nascosti", () => {
  const F = { ...vuoti(), q: "carla", genre: "pop", reading: "2", zone: "VI" };
  const s = aIndirizzo(F);
  assert.equal(s, "q=carla&gen=pop&let=2&zona=VI");
  assert.deepEqual(daIndirizzo("?" + s), F);
  assert.equal(altriAttivi(F), 3, "genere, lettura e zona; la ricerca è sempre visibile");
  assert.equal(norm(" Àrea "), "area");
});
