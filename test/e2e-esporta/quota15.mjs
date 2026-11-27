/* Quota 15 mm (Q1, 27/11/2026): nei PDF veri, NESSUNA parola sta a meno di 15 mm dal bordo del foglio, e le quote dimensionali
   del palco (che sotto soglia passano dal disegno) ci sono ancora. FUORI dalla CI, come le altre prove e2e-esporta.
   Serve `pdftotext` (poppler) per le posizioni delle parole. Uso: node test/e2e-esporta/quota15.mjs [cartella-dove-tenere-i-PDF] */
import { chromium, pagina, VISTE } from "./comune.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const tieni = process.argv[2] || ""; if (tieni) mkdirSync(tieni, { recursive: true });
const dir = tieni || mkdtempSync(join(tmpdir(), "quota15-"));
let n = 0, ko = 0; const ok = (c, m) => { n++; console.log((c ? "✓ " : "✗ ") + m); if (!c) ko++; };
const MM = 25.4 / 72, MIN = 15 - 0.05;
/* nome, larghezza cm, profondità cm, carta, scala, orientamento, lingua, modo (pdf|esterni|multi), quote attese nel PDF (regex sul testo) */
const CASI = [
  ["26x6 A2 1:50", 2600, 600, "a2", 50, "landscape", "", "pdf", [/\b6 m\b/]],
  ["26x6 A2 1:50 EN", 2600, 600, "a2", 50, "landscape", "en", "pdf", [/\b6 m\b/]],
  ["8x5 A4 1:50", 800, 500, "a4", 50, "landscape", "", "pdf", [/\b8 m\b/, /\b5 m\b/]],
  ["8x5 A4 1:50 EN", 800, 500, "a4", 50, "landscape", "en", "pdf", [/\b8 m\b/, /\b5 m\b/]],
  ["26x6 A2 1:50, due blocchi", 2600, 600, "a2", 50, "landscape", "", "multi", []],
  ["8x5 A4 1:50, due blocchi", 800, 500, "a4", 50, "landscape", "", "multi", []],
  ["palco per esterni 26x6 A2 1:50", 2600, 600, "a2", 50, "landscape", "", "esterni", [/\b6 m\b/]],
  ["palco per esterni 8x5 A4 1:50", 800, 500, "a4", 50, "landscape", "", "esterni", [/\b8 m\b/, /\b5 m\b/]],
  ["palco per esterni 26x6 A2 1:50 EN", 2600, 600, "a2", 50, "landscape", "en", "esterni", [/\b6 m\b/]],
  /* controlli: casi che NON sono sotto soglia devono restare come sempre (quote fuori dal disegno, scritte da jsPDF) */
  ["14x9 A4 1:100 (invariato)", 1400, 900, "a4", 100, "landscape", "", "pdf", [/\b14 m\b/, /\b9 m\b/]],
  ["14x9 A3 1:50 (invariato)", 1400, 900, "a3", 50, "landscape", "", "pdf", [/\b14 m\b/, /\b9 m\b/]],
];
const b = await chromium.launch(); const { p } = await pagina(b, VISTE.hd);
for (let i = 0; i < CASI.length; i++) {
  const [nome, W, D, carta, N, orient, lingua, modo, attese] = CASI[i];
  const r = await p.evaluate(async ([W, D, carta, N, orient, lingua, modo]) => {
    state.titolo = "Prova quota"; delete state.printFrame;
    const blocks = modo === "multi" ? [{ x: 0, y: 0, w: W, d: D - 200 }, { x: W / 4, y: D - 200, w: W / 2, d: 200 }] : [{ x: 0, y: 0, w: W, d: D }];
    state.stage = { w: W, d: D, blocks }; recalcStageBBox(); state.items = [];
    const pon = (t, x, y, label) => { const it = addItem(t, { x, y }, true); if (it) { Object.assign(it, { x, y }); if (label) it.label = label; } };
    pon("batteria", W / 2, D * 0.4); pon("cantante", W / 2 - 150, D * 0.75, "Voce"); pon("wedge", W / 2 - 150, D * 0.9); pon("bassamp", W / 2 + 200, D * 0.4);
    fit(); render();
    await loadJsPDF(); const L0 = state.docLang; if (lingua) docLinguaImposta(lingua);
    let doc, err = "";
    try { doc = modo === "esterni" ? await buildPdfPalcoEsterni(carta, N, orient) : await buildPdfDoc(carta, N, orient, ""); }
    catch (e) { err = String(e && e.message || e); } finally { if (lingua) { if (L0 == null) delete state.docLang; else state.docLang = L0; } }
    if (!doc) return { err };
    const bytes = new Uint8Array(doc.output("arraybuffer")); let s = ""; for (let k = 0; k < bytes.length; k++) s += String.fromCharCode(bytes[k]);
    return { b64: btoa(s), err };
  }, [W, D, carta, N, orient, lingua, modo]);
  if (!r.b64) { ok(false, nome + ": PDF non prodotto (" + r.err + ")"); continue; }
  const f = join(dir, "q" + i + ".pdf"); writeFileSync(f, Buffer.from(r.b64, "base64"));
  const xml = execFileSync("pdftotext", ["-bbox", f, "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const pagine = xml.split(/<page /).slice(1); let minimo = 1e9, dove = "", testo = "";
  for (const pg of pagine) {
    const [, pw, ph] = pg.match(/width="([\d.]+)" height="([\d.]+)"/).map(Number);
    for (const m of pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
      const [x0, y0, x1, y1] = [m[1], m[2], m[3], m[4]].map(Number), v = Math.min(x0, y0, pw - x1, ph - y1) * MM; testo += " " + m[5];
      if (v < minimo) { minimo = v; dove = m[5]; }
    }
  }
  ok(pagine.length >= 1 && minimo >= MIN, nome + ": nessuna parola a meno di 15 mm dal bordo (la più vicina «" + dove + "» a " + minimo.toFixed(1) + " mm, " + pagine.length + " pag.)");
  for (const re of attese) ok(re.test(testo), nome + ": la quota " + re + " c'è nel PDF");
}
ok(p.__err.length === 0, "console pulita " + p.__err.join(" | "));
await b.close(); if (!tieni) rmSync(dir, { recursive: true, force: true });
console.log("\n" + (ko ? "KO " + ko + " su " + n : "TUTTE VERDI " + n + "/" + n));
process.exit(ko ? 1 : 0);
