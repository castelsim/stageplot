/* La pianta dei posti è UNA (specifica area §4.2): l'editor e l'area della biglietteria usano lo stesso testo, e dal
   progetto salvato esce la stessa foto che fa l'editor. Se fossero due copie, il confronto «la sala del progetto è
   cambiata» sarebbe falso al primo cambio.   node --test test/bgl-pianta-posti.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadApp, root } from "./sandbox.mjs";

const require = createRequire(import.meta.url);
const PP = require(join(root, "biglietteria/pianta-posti.js"));
const A = loadApp();
const j = (x) => JSON.parse(JSON.stringify(x));   // il sandbox ha un altro Object.prototype: si confrontano i dati
export const FUNZIONI = ["postoTipo", "postoNumerato", "postoSettore", "postoNomeSettore", "postoSanifica", "postoVerso",
  "postiVerso", "hasPts", "blockCorners", "itemCorners", "bglChiave", "bglPostoNome", "bglPostiNomi", "bglSemiPoligono",
  "bglPianta", "bglProblemiPianta", "bglSenzaNumero", "piantaPedana", "piantaSediaMisure", "piantaVarianti",
  "piantaStatoDaDocumento", "piantaDaDocumento"];

/* una platea inventata: 2 file da 6 sedie sotto un palco, una pedana, una sedia senza numero; `gradi` gira tutto */
function scena({ gradi = 0, semi = false } = {}) {
  const th = (gradi * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th), R = (x, y) => [x * c - y * s, x * s + y * c];
  const items = [];
  [["A", 1200], ["B", 1300]].forEach(([f, y]) => { for (let k = 0; k < 6; k++) { const p = R(300 + 60 * k, y);
    items.push({ id: "s" + f + k, type: "sediapubblico", x: p[0], y: p[1], rot: 180 + gradi, w: 50, d: 53, label: "Fila " + f + " · " + (k + 1),
      labelMode: "hidden", fila: f, posto: k + 1, settore: "Platea" }); } });
  const q = R(900, 1250); items.push({ id: "libera", type: "sediapubblico", x: q[0], y: q[1], rot: 180 + gradi, w: 50, d: 53, label: "Sedia" });
  const pe = R(600, 400); items.push({ id: "ped", type: "pedana", x: pe[0], y: pe[1], rot: gradi, w: 300, d: 200, h: 40, label: "Pedana" });
  const blocchi = semi ? [{ x: 100, y: 0, w: 1000, d: 700 }, { shape: "semi", flat: "top", x: 300, y: 700, w: 600, d: 300 }]
    : [{ x: 100, y: 0, w: 1000, d: 800 }];
  return { _v: A.SCHEMA_VERSION, items, inputs: [], outputs: [], stage: { w: 1100, d: 1000, blocks: blocchi } };
}
const documento = (varianti) => ({ _doc: 1, active: varianti[0].id, variants: varianti });

test("biglietteria/pianta-posti.js è la copia generata di src/pianta-posti.js", () => {
  const src = readFileSync(join(root, "src/pianta-posti.js"), "utf8");
  const pub = readFileSync(join(root, "biglietteria/pianta-posti.js"), "utf8");
  assert.ok(pub.endsWith(src), "la copia pubblicata finisce col sorgente intero: node build.mjs");
  assert.match(pub.slice(0, pub.length - src.length), /GENERATO da src\/pianta-posti\.js/);
});

test("le funzioni dell'editor SONO quelle del file: stesso testo, e nel template non ce n'è una seconda copia", () => {
  const tpl = readFileSync(join(root, "index.template.html"), "utf8");
  for (const f of FUNZIONI) {
    assert.equal(typeof A[f], "function", "nell'editor: " + f);
    assert.equal(typeof PP[f], "function", "nel file: " + f);
    assert.equal(A[f].toString(), PP[f].toString(), f + ": l'editor e l'area hanno due versioni diverse");
    assert.doesNotMatch(tpl, new RegExp("\\nfunction " + f + "\\("), f + " è ancora scritta nel template");
  }
  assert.equal(tpl.split("/*__PIANTA_POSTI__*/").length, 2, "un solo marcatore nel template");
});

test("pedane e sedia del pubblico: le stesse del catalogo dell'editor (TYPES)", () => {
  const riser = Object.keys(A.TYPES).filter((k) => A.TYPES[k].riser).sort();
  assert.deepEqual(Object.keys(A.TYPES).filter((k) => PP.piantaPedana(k)).sort(), riser, "un tipo pedana nuovo va aggiunto in piantaPedana");
  assert.deepEqual(PP.piantaSediaMisure(), { w: A.TYPES.sediapubblico.w, d: A.TYPES.sediapubblico.d });
});

test("dal documento salvato la stessa foto dell'editor: varianti, semicerchio, scena girata di 37°", () => {
  const D = documento([{ id: "V1", name: "Platea", state: scena() }, { id: "V2", name: "Girata", state: scena({ gradi: 37, semi: true }) }]);
  A.loadDoc(j(D));
  const salvato = JSON.parse(A.docToJSON());
  for (const v of A.VARIANTS.slice()) {
    A.switchVariant(v.id);
    const editor = j(A.bglPianta(A.state));
    assert.ok(editor && editor.posti.length === 12, v.name + ": 12 posti numerati");
    assert.deepEqual(j(PP.piantaDaDocumento(salvato, v.id)), editor, v.name);
  }
  assert.deepEqual(j(PP.piantaDaDocumento(salvato, null)), j((A.switchVariant("V1"), A.bglPianta(A.state))), "variante nulla = quella attiva");
  assert.deepEqual(PP.piantaVarianti(salvato).map((v) => [v.id, v.nome, v.attiva]), [["V1", "Platea", true], ["V2", "Girata", false]]);
});

test("RF1: un progetto salvato da una versione vecchia (documento piatto, fila minuscola, sedie senza misure) dà la foto dell'editor", () => {
  const vecchio = scena();
  vecchio.items.forEach((it) => { if (it.fila) it.fila = it.fila.toLowerCase(); if (it.type === "sediapubblico") { delete it.w; delete it.d; } });
  vecchio.items.find((it) => it.id === "sA0").posto = "1";        // un numero salvato come testo
  vecchio.items.find((it) => it.id === "sB0").settore = "  Platea ";
  A.loadDoc(j(vecchio));
  assert.deepEqual(j(PP.piantaDaDocumento(j(vecchio), null)), j(A.bglPianta(A.state)));
  assert.deepEqual(PP.piantaVarianti(vecchio), [{ id: null, nome: "Variante 1", attiva: true }]);
});

test("documenti che non servono: variante inesistente, niente posti, spazzatura → null (mai un'eccezione)", () => {
  const D = documento([{ id: "V1", name: "Platea", state: scena() }]);
  assert.equal(PP.piantaDaDocumento(D, "V9"), null, "la variante non c'è più");
  assert.equal(PP.piantaDaDocumento({ items: [] }, null), null, "nessun posto numerato");
  for (const x of [null, 42, "testo", { variants: "no" }, { variants: [null] }]) assert.equal(PP.piantaDaDocumento(x, null), null, JSON.stringify(x));
  assert.equal(PP.piantaDaDocumento(D, null).posti.length, 12, "il documento d'origine non si tocca");
  assert.equal(D.variants[0].state.items[0].fila, "A");
});
