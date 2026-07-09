#!/usr/bin/env node
/* Build StagePlot: assembla i moduli sorgente negli artefatti di deploy.
 *
 * Output:
 *   index.html  → shell leggera (HTML + CSS + versione + <script defer src="/app.js"> + <script async src="/icons.js">)
 *   app.js      → tutto il JS dell'app (i blocchi <script data-app> del template, concatenati) — caricato DEFER
 *   (icons.js e' un asset statico a se', non generato qui: libreria icone caricata ASYNC)
 *
 * Perche': local-first + deploy semplice su GitHub Pages, ma per l'LCP la shell HTML deve restare piccola e
 * dipingere PRIMA di eseguire ~1,4 MB di JS. Lo sviluppo resta modulare (template + src/), lo script ricompone.
 *
 * Uso:  node build.mjs        → genera index.html + app.js da index.template.html + src/*
 *       node build.mjs --check → verifica che index.html e app.js siano allineati ai sorgenti (CI/pre-merge)
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

  /* Estrai i blocchi <script data-app> nel bundle app.js (defer). Sono NON contigui nel template
     (in mezzo c'e' HTML: pannello SEO, feedback box) → il PRIMO diventa <script defer src="/app.js">,
     gli altri spariscono, l'HTML in mezzo resta. Ordine di concatenazione = ordine nel documento. */
  const appParts = [];
  out = out.replace(/<script data-app>([\s\S]*?)<\/script>/g, (m, code) => {
    appParts.push(code);
    return appParts.length === 1 ? '<script defer src="/app.js"></script>' : "";
  });
  if (appParts.length === 0) throw new Error("Nessun blocco <script data-app> nel template (marcatura persa?)");
  const appjs = appParts.join("\n;\n");
  return { html: out, appjs };
}

const check = process.argv.includes("--check");
const { html, appjs } = build();
const stripVer = (s) => s.replace(/window\.__APP_VERSION__="[^"]*"/g, 'window.__APP_VERSION__="__VER__"');

if (check) {
  const curHtml = readFileSync(r("index.html"), "utf8");
  let curApp = "__MISSING__";
  try { curApp = readFileSync(r("app.js"), "utf8"); } catch (e) { /* app.js mancante → disallineato */ }
  if (stripVer(curHtml) !== stripVer(html) || stripVer(curApp) !== stripVer(appjs)) {
    console.error("✗ index.html/app.js NON allineati ai sorgenti. Esegui: node build.mjs");
    process.exit(1);
  }
  console.log("✓ index.html + app.js allineati ai sorgenti.");
} else {
  writeFileSync(r("index.html"), html);
  writeFileSync(r("app.js"), appjs);
  console.log("✓ index.html + app.js generati dai sorgenti.");
}
