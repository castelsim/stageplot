/* Biglietteria — la pianta sul COMPUTER (07/10/2026, Simone: «la lente promette una cosa che il clic non fa»).
   Col mouse: il clic sceglie SEMPRE e non ingrandisce mai; «+ − Vista intera» sulla pianta, doppio clic che ingrandisce
   lì, trascinamento per spostarsi (oltre una soglia, così un clic resta un clic). Col dito non cambia niente.
   node --test test/bgl-zoom-pc.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);
const B = req(join(root, "biglietteria/bgl.js"));
const SG = req(join(root, "biglietteria/segnala.js"));
const leggi = (p) => readFileSync(join(root, p), "utf8");

test("col mouse il clic sceglie sempre e non ingrandisce mai, nemmeno sui posti piccoli", () => {
  for (const piccola of [true, false]) for (const fine of [true, false]) {
    const o = { mouse: true, tastiera: false, piccola, fine };
    assert.equal(B.azioneClic({ ...o, bottone: true, posto: true }), "scegli", "posto libero o scelto, piccola=" + piccola);
    assert.equal(B.azioneClic({ ...o, bottone: false, posto: true }), "avviso", "occupato, tuo o tenuto da parte: si dice");
    assert.equal(B.azioneClic({ ...o, bottone: false, posto: false }), "niente", "sul vuoto della pianta non succede niente");
  }
});
test("col dito resta com'era: sui posti piccoli il primo tocco ingrandisce, sui grandi sceglie", () => {
  const dito = { mouse: false, tastiera: false, fine: false };
  assert.equal(B.azioneClic({ ...dito, piccola: true, bottone: true, posto: true }), "zoom");
  assert.equal(B.azioneClic({ ...dito, piccola: true, bottone: false, posto: false }), "zoom");
  assert.equal(B.azioneClic({ ...dito, piccola: false, bottone: true, posto: true }), "scegli");
  assert.equal(B.azioneClic({ ...dito, piccola: false, bottone: false, posto: true }), "avviso");
  assert.equal(B.azioneClic({ ...dito, piccola: false, bottone: false, posto: false }), "niente");
  /* puntatore preciso senza «hover» (penna): come prima, ingrandisce e sceglie insieme */
  assert.equal(B.azioneClic({ mouse: false, tastiera: false, fine: true, piccola: true, bottone: true, posto: true }), "zoom+scegli");
  /* tastiera e lettore di schermo: sempre la scelta */
  assert.equal(B.azioneClic({ mouse: false, tastiera: true, fine: false, piccola: true, bottone: true, posto: true }), "scegli");
});

test("«+», «−» e doppio clic: un passo fisso, dentro i limiti; a un soffio dalla pianta intera ci si ferma lì", () => {
  const lim = B.limitiZoom(0.4, 1);
  assert.equal(B.PASSO_ZOOM, 1.6);
  assert.ok(Math.abs(B.passoZoom(0.4, 1, lim) - 0.64) < 1e-9, "+ da intera: ×1,6");
  assert.ok(Math.abs(B.passoZoom(1, -1, lim) - 0.625) < 1e-9, "−: ÷1,6");
  assert.equal(B.passoZoom(lim.max / 1.2, 1, lim), lim.max, "oltre il massimo: si ferma al massimo");
  assert.equal(B.passoZoom(lim.max, 1, lim), lim.max, "al massimo «+» non fa niente");
  assert.equal(B.passoZoom(0.5, -1, lim), 0.4, "sotto l'intera: si ferma all'intera");
  assert.equal(B.passoZoom(0.41 * 1.6, -1, lim), 0.4, "a meno del 5 % dall'intera: intera, non «quasi intera»");
  assert.equal(B.passoZoom(0.4, -1, lim), 0.4, "alla pianta intera «−» non fa niente");
  assert.equal(B.passoZoom(0, 1, lim), 0.4, "scala sconosciuta: pianta intera");
  /* due «+» e due «−» tornano al punto di partenza */
  const k = B.passoZoom(B.passoZoom(0.64, 1, lim), 1, lim);
  assert.ok(Math.abs(B.passoZoom(B.passoZoom(k, -1, lim), -1, lim) - 0.64) < 1e-9);
});

test("trascinamento: sotto la soglia è un clic (sceglie), oltre sposta la pianta (e non sceglie)", () => {
  assert.equal(B.SOGLIA_TRASCINA_PX, 6);
  assert.equal(B.eTrascinamento(0, 0), false);
  assert.equal(B.eTrascinamento(3, 3), false, "il mouse che trema durante il clic");
  assert.equal(B.eTrascinamento(6, 0), false, "esattamente sulla soglia: ancora un clic");
  assert.equal(B.eTrascinamento(0, -7), true);
  assert.equal(B.eTrascinamento(5, 5), true, "in diagonale conta la distanza, non il singolo asse");
});

test("una regola sola per «computer col mouse»: la stessa stringa in bgl.js e bgl.css, parte di quella di segnala.js", () => {
  assert.equal(B.MEDIA_MOUSE, "(hover: hover) and (pointer: fine)");
  assert.ok(SG.MEDIA_COMPUTER.endsWith(B.MEDIA_MOUSE), "segnala aggiunge solo la larghezza: " + SG.MEDIA_COMPUTER);
  const css = leggi("biglietteria/bgl.css");
  const m = css.match(/@media ([^{]+)\{\s*\.mappa\.mouse \.posto\{cursor:default\}/);
  assert.ok(m, "le regole dei cursori vivono sotto la media query del mouse");
  assert.equal(m[1].trim(), B.MEDIA_MOUSE);
  const js = leggi("biglietteria/bgl.js");
  assert.match(js, /matchMedia\(MEDIA_MOUSE\)/);
});

test("cursori: niente lente da nessuna parte, manina sui posti che si scelgono, freccia sugli altri, «afferra» per spostarsi", () => {
  const css = leggi("biglietteria/bgl.css");
  assert.doesNotMatch(css, /zoom-in/, "la lente promette uno zoom che il clic non fa");
  const sotto = css.slice(css.indexOf("@media " + B.MEDIA_MOUSE));
  assert.match(sotto, /\.mappa\.mouse \.posto\{cursor:default\}/);
  assert.match(sotto, /\.mappa\.mouse \.posto\[role=button\]\{cursor:pointer\}/);
  assert.match(sotto, /\.mappa\.mouse\.si-sposta\{cursor:grab\}/);
  assert.match(sotto, /\.mappa\.mouse\.trascina,\.mappa\.mouse\.trascina \.posto\{cursor:grabbing\}/);
});

test("i comandi «+ − Vista intera» stanno sulla pianta, fuori dalla parte che scorre, con un'etichetta e almeno 36 px", () => {
  const js = leggi("biglietteria/bgl.js"), css = leggi("biglietteria/bgl.css");
  assert.match(js, /<div class="mappa-box">' \+[\s\S]{0,200}\(mouse \? '<div class="zoom-pc" role="group" aria-label="Ingrandimento della pianta">/,
    "i comandi sono fratelli della pianta, non dentro: non scorrono con lei");
  assert.match(js, /id="bgl-piu" aria-label="Ingrandisci"/);
  assert.match(js, /id="bgl-meno" aria-label="Rimpicciolisci"/);
  assert.match(js, /id="bgl-intera">Vista intera</);
  assert.match(js, /\(mouse \? "" : '<button type="button" class="btn piccolo" id="bgl-zoom"/, "sul computer il vecchio «Ingrandisci» non c'è; sul telefono resta");
  assert.match(css, /\.mappa-box\{position:relative\}/);
  assert.match(css, /\.zoom-pc\{position:absolute;[^}]*right:calc\(8px \+ var\(--barra-v,0px\)\)/);
  const b = css.match(/\.zoom-b\{([^}]*)\}/)[1];
  assert.ok(+b.match(/min-width:(\d+)px/)[1] >= 36 && +b.match(/height:(\d+)px/)[1] >= 36, "bersaglio del mouse: " + b);
});

test("la rotellina senza Ctrl resta alla pagina; il doppio clic e il trascinamento ci sono", () => {
  const js = leggi("biglietteria/bgl.js");
  assert.match(js, /addEventListener\("wheel", function \(e\) \{\n\s*if \(!e\.ctrlKey\) return;/, "senza Ctrl nessun preventDefault");
  assert.match(js, /addEventListener\("dblclick"/);
  assert.match(js, /addEventListener\("pointermove"/);
  assert.match(js, /if \(trascinato\) \{ trascinato = false; if \(ev\.detail !== 0\) return; \}/, "il clic dopo un trascinamento non sceglie");
});
