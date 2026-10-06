/* Biglietteria — «La sala del progetto è cambiata» (specifica area §4): quando dirlo e quando no. RF2 e D8.
   node --test test/bgl-sala.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const PP = require(join(root, "biglietteria/pianta-posti.js"));
const SALA = require(join(root, "biglietteria/gestione/gst-sala.js"));

function stato(file = "ABCD", sposta = null) {
  const items = [];
  [...file].forEach((f, r) => { for (let n = 1; n <= 6; n++) items.push({ id: "s" + f + n, type: "sediapubblico", x: 200 + n * 60 + (f === sposta ? 60 : 0),
    y: 1000 + r * 90, rot: 180, w: 50, d: 53, fila: f, posto: n, settore: "Platea" }); });
  return { items, stage: { w: 1200, d: 800, blocks: [{ x: 100, y: 0, w: 1000, d: 800 }] } };
}
const doc = (...varianti) => ({ _doc: 1, active: varianti.find((v) => v.attiva)?.id || varianti[0].id, variants: varianti.map((v) => ({ id: v.id, name: v.id, state: v.state })) });

test("uguale: la foto pubblicata è la sala di adesso → niente avviso", () => {
  const D = doc({ id: "V1", state: stato() });
  const ev = { variante: "V1", pianta: PP.piantaDaDocumento(D, "V1") };
  assert.equal(SALA.statoSala(ev, D, []).stato, "uguale");
});

test("cambiata: riepilogo in parole e posti prenotati coinvolti (le disdette non contano)", () => {
  const foto = PP.piantaDaDocumento(doc({ id: "V1", state: stato() }), "V1");
  const D = doc({ id: "V1", state: stato("ABCE", "B") });   // fila B spostata, D tolta, E nuova
  const s = SALA.statoSala({ variante: "V1", pianta: foto }, D, ["Platea|D|3", "Platea|B|1"]);
  assert.equal(s.stato, "cambiata");
  assert.equal(PP.piantaRiassunto(s.confronto), "6 posti spostati · 6 posti con un numero nuovo · fila E nuova · fila D tolta · 1 posto prenotato coinvolto");
  const righe = SALA.righeBloccanti(s.confronto, [
    { id: "p0", nome: "Luca", cognome: "Verdi", stato: "annullata", posti: ["Platea|D|3"] },
    { id: "p1", nome: "Mario", cognome: "Rossi", stato: "attiva", posti: ["Platea|D|3"] }]);
  assert.deepEqual(righe, [{ pid: "p1", chi: "Rossi Mario", posto: "D 3", testo: "Rossi Mario — D 3: ha un numero nuovo (E 3)" }]);
});

test("i posti tenuti da parte che spariscono o cambiano numero si dicono (tornano liberi con l'aggiornamento)", () => {
  const c = { tolti: ["Platea|D|1"], rinumerati: [{ da: "Platea|C|1", a: "Platea|F|1" }] };
  assert.deepEqual(SALA.tenutiPersi(c, ["Platea|A|1", "Platea|D|1", "Platea|C|1"]), ["Platea|D|1", "Platea|C|1"]);
  assert.deepEqual(SALA.tenutiPersi(c, []), []);
});

test("RF2: progetto eliminato, variante tolta, variante senza posti → si dice, niente confronto", () => {
  const foto = PP.piantaDaDocumento(doc({ id: "V1", state: stato() }), "V1");
  assert.equal(SALA.statoSala({ variante: "V1", pianta: foto }, null, []).stato, "progetto_mancante");
  assert.equal(SALA.statoSala({ variante: "V9", pianta: foto }, doc({ id: "V1", state: stato() }), []).stato, "variante_mancante");
  assert.equal(SALA.statoSala({ variante: "V2", pianta: foto }, doc({ id: "V1", state: stato() }, { id: "V2", state: { items: [] } }), []).stato, "senza_posti");
  assert.equal(SALA.statoSala({ variante: "V1", pianta: null }, doc({ id: "V1", state: stato() }), []).stato, "sconosciuto");
});

test("D8: spettacolo nato nell'editor (variante nulla) in un progetto con più varianti: si trova quella uguale, niente avviso", () => {
  const D = doc({ id: "V1", state: stato("AB"), attiva: true }, { id: "V2", state: stato() });
  const foto = PP.piantaDaDocumento(D, "V2");   // pubblicato quando era attiva la V2
  const s = SALA.statoSala({ variante: null, pianta: foto }, D, []);
  assert.deepEqual([s.stato, s.varianteTrovata], ["uguale", "V2"]);
  const nessuna = SALA.statoSala({ variante: null, pianta: PP.piantaDaDocumento(doc({ id: "X", state: stato("A") }), "X") }, D, []);
  assert.deepEqual([nessuna.stato, nessuna.variante], ["cambiata", "V1"], "nessuna uguale: si confronta con l'attiva");
});

test("evidenze per le due piante: tolti e cambiati nella foto, nuovi e cambiati nella sala di adesso", () => {
  const c = { spostati: ["Platea|B|1"], aggiunti: ["Platea|E|1"], tolti: ["Platea|D|1"], rinumerati: [{ da: "Platea|C|1", a: "Platea|F|1" }] };
  assert.deepEqual(SALA.evidenze(c), {
    foto: { "Platea|B|1": "cambio-spostato", "Platea|D|1": "cambio-tolto", "Platea|C|1": "cambio-numero" },
    nuova: { "Platea|B|1": "cambio-spostato", "Platea|E|1": "cambio-nuovo", "Platea|F|1": "cambio-numero" } });
  assert.equal(SALA.TESTO, "La sala del progetto è cambiata");
});

test("la pagina dell'area carica la sala dopo la scheda", () => {
  const h = readFileSync(join(root, "biglietteria/gestione/index.html"), "utf8");
  assert.ok(h.indexOf('src="gst-sala.js') > h.indexOf('src="gst-scheda.js') && h.indexOf('src="gst-scheda.js') > 0);
});
