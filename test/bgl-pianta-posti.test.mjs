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
  "piantaStatoDaDocumento", "piantaDaDocumento", "piantaTolleranze", "piantaAllinea", "piantaPorta", "piantaConfronta",
  "piantaRiassunto"];

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

/* ---- confronto foto / progetto (specifica area §4) ---- */
const PALCO = [[[100, 100], [1300, 100], [1300, 900], [100, 900]]];
function sala(lettere, perFila, { y0 = 1100, passo = 90, spostaFila = null, dx = 60, palco = PALCO, pedane = [] } = {}) {
  const posti = [];
  [...lettere].forEach((f, r) => { for (let n = 1; n <= perFila; n++) posti.push({ k: "Platea|" + f + "|" + n, settore: "Platea",
    fila: f, posto: n, x: 200 + n * 60 + (f === spostaFila ? dx : 0), y: y0 + r * passo, w: 50, d: 53, rot: 180 }); });
  return { v: 1, box: [0, 0, 3000, 3000], palco, pedane, posti };
}
/* tutta la pianta traslata e girata attorno a (0,0): è quello che succede alla foto quando si aggiunge una sedia
   all'estrema sinistra (il riquadro riparte da lì) o quando il verso medio delle sedie cambia di un soffio */
function muovi(p, dx, dy, gradi = 0) {
  const a = (gradi * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), T = ([x, y]) => [Math.round(x * c - y * s + dx), Math.round(x * s + y * c + dy)];
  return { ...p, palco: p.palco.map((q) => q.map(T)), pedane: p.pedane.map((q) => q.map(T)),
    posti: p.posti.map((q) => { const [x, y] = T([q.x, q.y]); return { ...q, x, y, rot: q.rot + gradi }; }) };
}

test("confronto: la stessa sala → nessuna differenza", () => {
  const c = PP.piantaConfronta(sala("AB", 6), sala("AB", 6), []);
  assert.equal(c.uguale, true);
  assert.equal(PP.piantaRiassunto(c), "Nessuna differenza");
});

test("confronto: tutta la foto spostata e girata di 0,4° + una sedia in più a sinistra → solo «1 posto in più»", () => {
  const foto = sala("AB", 6), nuova = muovi(sala("AB", 6), 300, 120, 0.4);
  nuova.posti.push({ k: "Platea|A|7", settore: "Platea", fila: "A", posto: 7, x: 40, y: nuova.posti[0].y, w: 50, d: 53, rot: 180.4 });
  const c = PP.piantaConfronta(foto, nuova, ["Platea|A|1"]);
  assert.deepEqual([c.spostati, c.aggiunti, c.tolti, c.palcoCambiato], [[], ["Platea|A|7"], [], false]);
  assert.equal(PP.piantaRiassunto(c), "1 posto in più · nessun posto prenotato coinvolto");
});

test("confronto: l'esempio della specifica — «12 posti spostati · 2 posti in più · fila J nuova · nessun posto prenotato coinvolto»", () => {
  const foto = sala("ABCDEFGH", 12);
  const nuova = sala("ABCDEFGH", 12, { spostaFila: "B", dx: 60 });
  nuova.posti.push({ k: "Platea|J|1", settore: "Platea", fila: "J", posto: 1, x: 260, y: 1900, w: 50, d: 53, rot: 180 },
    { k: "Platea|J|2", settore: "Platea", fila: "J", posto: 2, x: 320, y: 1900, w: 50, d: 53, rot: 180 });
  const c = PP.piantaConfronta(foto, nuova, ["Platea|A|5", "Platea|C|5"]);
  assert.equal(c.spostati.length, 12);
  assert.ok(c.spostati.every((k) => k.startsWith("Platea|B|")));
  assert.equal(PP.piantaRiassunto(c), "12 posti spostati · 2 posti in più · fila J nuova · nessun posto prenotato coinvolto");
});

test("confronto: un posto prenotato che sparisce BLOCCA; uno che si è solo mosso no", () => {
  const foto = sala("AB", 6);
  const senza = sala("AB", 6); senza.posti = senza.posti.filter((q) => q.k !== "Platea|B|6" && q.k !== "Platea|B|5");
  const c = PP.piantaConfronta(foto, senza, ["Platea|B|6", "Platea|A|1"]);
  assert.deepEqual(c.bloccanti, [{ k: "Platea|B|6", motivo: "tolto" }], "B5 sparisce ma non è prenotato: non blocca");
  assert.equal(PP.piantaRiassunto(c), "2 posti in meno · 1 posto prenotato coinvolto");
  const mossa = sala("AB", 6, { spostaFila: "B", dx: 30 });
  const m = PP.piantaConfronta(foto, mossa, ["Platea|B|2"]);
  assert.deepEqual([m.bloccanti, m.prenotatiSpostati], [[], ["Platea|B|2"]]);
  assert.match(PP.piantaRiassunto(m), /1 posto prenotato solo spostato$/);
});

test("confronto: la fila B rinominata C (stesse sedie) = posti con un numero nuovo; un prenotato in B blocca", () => {
  const foto = sala("AB", 6);
  const nuova = sala("AB", 6); nuova.posti.forEach((q) => { if (q.fila === "B") { q.fila = "C"; q.k = "Platea|C|" + q.posto; } });
  const c = PP.piantaConfronta(foto, nuova, ["Platea|B|5"]);
  assert.equal(c.rinumerati.length, 6);
  assert.deepEqual(c.rinumerati.find((r) => r.da === "Platea|B|5"), { da: "Platea|B|5", a: "Platea|C|5" });
  assert.deepEqual([c.tolti, c.aggiunti], [[], []]);
  assert.deepEqual(c.bloccanti, [{ k: "Platea|B|5", motivo: "rinumerato", a: "Platea|C|5" }]);
  assert.deepEqual([c.fileNuove, c.fileTolte], [[{ settore: "Platea", fila: "C" }], [{ settore: "Platea", fila: "B" }]]);
  assert.equal(PP.piantaRiassunto(c), "6 posti con un numero nuovo · fila C nuova · fila B tolta · 1 posto prenotato coinvolto");
});

test("confronto: palco più grande → «palco o pedane cambiati», e i posti si allineano lo stesso", () => {
  const foto = sala("AB", 6), nuova = sala("AB", 6, { palco: [[[100, 100], [1500, 100], [1500, 900], [100, 900]]] });
  const c = PP.piantaConfronta(foto, nuova, []);
  assert.deepEqual([c.palcoCambiato, c.spostati.length, c.uguale], [true, 0, false]);
  assert.equal(PP.piantaRiassunto(c), "palco o pedane cambiati · nessun posto prenotato coinvolto");
});

test("confronto: due pedane uguali in ordine diverso non sono un cambiamento (l'ordine viene dal «porta davanti»)", () => {
  const p1 = [[500, 200], [700, 200], [700, 300], [500, 300]], p2 = [[800, 200], [900, 200], [900, 300], [800, 300]];
  const c = PP.piantaConfronta(sala("A", 4, { pedane: [p1, p2] }), sala("A", 4, { pedane: [p2, p1] }), []);
  assert.equal(c.uguale, true);
});

test("confronto: niente foto o niente sala non lanciano", () => {
  const c = PP.piantaConfronta(null, sala("A", 2), []);
  assert.deepEqual([c.uguale, c.aggiunti.length], [false, 2]);
  assert.equal(PP.piantaConfronta(sala("A", 2), null, []).tolti.length, 2);
  assert.equal(PP.piantaRiassunto(null), "");
});

test("confronto sulle foto vere di bglPianta: una sedia numerata in più, lontana a sinistra e un po' storta → solo «1 posto in più»", () => {
  /* oltre al test con la foto mossa a mano: qui il riquadro riparte dalla sedia nuova e il verso medio cambia davvero
     (la sedia è girata di 12°), come succede nell'editor. Il palco è lo stesso: l'allineamento lo usa. */
  for (const gradi of [0, 37]) {
    const prima = scena({ gradi }), dopo = scena({ gradi });
    const th = (gradi * Math.PI) / 180;
    dopo.items.push({ id: "sA6", type: "sediapubblico", x: -200 * Math.cos(th) - 1200 * Math.sin(th), y: -200 * Math.sin(th) + 1200 * Math.cos(th),
      rot: 192 + gradi, w: 50, d: 53, fila: "A", posto: 7, settore: "Platea" });
    const foto = PP.bglPianta(prima), nuova = PP.bglPianta(dopo);
    assert.notDeepEqual(nuova.posti[0], foto.posti[0], gradi + "°: le coordinate cambiano davvero");
    const c = PP.piantaConfronta(foto, nuova, ["Platea|A|1"]);
    assert.equal(PP.piantaRiassunto(c), "1 posto in più · nessun posto prenotato coinvolto", gradi + "°");
  }
});
