#!/usr/bin/env node
/* Build StagePlot: assembla i moduli sorgente in un singolo index.html (deploy single-file).
 *
 * Perché single-file: il tool è local-first (funziona offline, condivisibile come un file,
 * deploy = un file su GitHub Pages). Lo sviluppo però è modulare (src/), così agenti diversi
 * lavorano su file diversi senza conflitti. Questo script ricompone il single-file.
 *
 * Uso:  node build.mjs        → genera index.html da index.template.html + src/*
 *       node build.mjs --check → verifica che index.html sia allineato ai sorgenti (CI/pre-merge)
 *
 * Modularizzazione incrementale: per ora estrae il CSS. I prossimi moduli (JS canvas/objects/
 * data/export, asset) si aggiungono qui con nuovi marcatori, senza cambiare il workflow.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const r = (p) => join(root, p);

/* marcatore -> file sorgente da iniettare (inline). Aggiungere qui i moduli futuri. */
const INJECTIONS = [
  { marker: "/*__STAGEPLOT_STYLES__*/", file: "src/styles.css" },
];

function build() {
  let out = readFileSync(r("index.template.html"), "utf8");
  for (const { marker, file } of INJECTIONS) {
    if (!out.includes(marker)) throw new Error(`Marcatore mancante nel template: ${marker}`);
    const content = readFileSync(r(file), "utf8");
    out = out.replace(marker, () => content); // replacer fn: nessun carattere speciale ($&, $1) interpretato
  }
  const version = new Date().toISOString().slice(0, 10).replace(/-/g, "."); // YYYY.MM.DD
  if (!out.includes("/*__APP_VERSION__*/")) throw new Error("Marcatore mancante: /*__APP_VERSION__*/");
  out = out.replaceAll("/*__APP_VERSION__*/", version);
  return out;
}

const check = process.argv.includes("--check");
const built = build();

if (check) {
  const current = readFileSync(r("index.html"), "utf8");
  const stripVer = (s) => s.replace(/window\.__APP_VERSION__="[^"]*"/g, 'window.__APP_VERSION__="__VER__"');
  if (stripVer(current) !== stripVer(built)) {
    console.error("✗ index.html NON allineato ai sorgenti. Esegui: node build.mjs");
    process.exit(1);
  }
  console.log("✓ index.html allineato ai sorgenti.");
} else {
  writeFileSync(r("index.html"), built);
  console.log("✓ index.html generato dai sorgenti.");
}
