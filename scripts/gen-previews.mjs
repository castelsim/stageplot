/* Genera anteprime SVG leggere dei modelli (mappa del palco: rettangolo + pallini etichettati)
 * da formationData(key).out — dato puro, niente icone/CSS. Riproducibile: node scripts/gen-previews.mjs
 * Output: stage-plot/previews/<slug>.svg  (referenziati nelle landing SEO). */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appjs = readFileSync(join(root, "app.js"), "utf8");

/* sandbox DOM-stub (stessa tecnica di test/engines.test.mjs) */
function loadApp() {
  const mkU = () => { const f = function () { return U; }; const U = new Proxy(f, {
    get: (t, k) => { if (k === Symbol.toPrimitive) return () => 0; if (k === "length") return 0; return U; },
    apply: () => U, construct: () => U, set: () => true, has: () => true }); return U; };
  const U = mkU();
  const ctx = {
    console, navigator: { userAgent: "node" },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    Event: function () {}, CustomEvent: function () {}, fetch: () => Promise.reject(new Error("no net")),
    location: { search: "", href: "http://localhost/", pathname: "/" }, performance: { now: () => 0 },
    atob: (s) => s, btoa: (s) => s, URL, URLSearchParams, XMLSerializer: function () { this.serializeToString = () => ""; },
  };
  ctx.document = new Proxy({}, { get: () => U });
  ctx.window = new Proxy(ctx, { get: (t, k) => (k in t ? t[k] : U), set: (t, k, v) => { t[k] = v; return true; } });
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(appjs, ctx, { timeout: 20000 }); } catch (e) {}
  if (typeof ctx.formationData !== "function" || typeof ctx.TYPES !== "object") throw new Error("sandbox non caricato");
  return ctx;
}
const A = loadApp();

/* landing slug -> chiave formazione */
const SLUGS = { band: "band", orchestra: "camera", coro: "coro", chiesa: "coro", festival: "band",
  matrimonio: "matrimonio", dj: "dj", tributo: "tributo", acustica: "acoustic", jazz: "jazzcombo", bigband: "bigband" };

/* categoria -> colore (per leggere il palco a colpo d'occhio) */
function colorOf(type) {
  if (/^(wedge|sidefill|iem|iemant|hearback|monmix)/.test(type)) return "#3b82f6";      // monitor
  if (/^(bassamp|stack|comboamp|keysamp|leslie)/.test(type)) return "#6b665f";           // ampli
  if (/^(corrente|ciabatta|quadro|distro)/.test(type)) return "#dc2626";                 // corrente
  if (/^(stagebox|splitter|multicore|foh)/.test(type)) return "#1c1a17";                 // tecnica
  return "#0d9488";                                                                       // sorgenti (accento)
}
const RISER = /^(pedana|tappeto|pedanacoro)$/;
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function svgFor(key) {
  const fd = A.formationData(key); if (!fd || !fd.out) return null;
  const out = fd.out;
  const box = (it) => { const T = A.TYPES[it.type] || {}; const w = it.w || T.w || 40, d = it.d || T.d || 40; return { hw: w / 2, hh: d / 2 }; };
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  out.forEach((it) => { const b = box(it); minX = Math.min(minX, it.x - b.hw); maxX = Math.max(maxX, it.x + b.hw); minY = Math.min(minY, it.y - b.hh); maxY = Math.max(maxY, it.y + b.hh); });
  const pad = 70;
  const vx = Math.round(minX - pad), vy = Math.round(minY - pad), vw = Math.round(maxX - minX + 2 * pad), vh = Math.round(maxY - minY + 2 * pad);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" role="img" aria-label="Anteprima stage plot ${esc(A.FORM_TITLES[key] || key)}" font-family="-apple-system,Segoe UI,Roboto,sans-serif">`;
  s += `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#f4f1ea"/>`;
  s += `<rect x="${Math.round(minX - 30)}" y="${Math.round(minY - 30)}" width="${Math.round(maxX - minX + 60)}" height="${Math.round(maxY - minY + 60)}" rx="16" fill="#fffdfa" stroke="#e6e1d8" stroke-width="3"/>`;
  s += `<text x="${Math.round((minX + maxX) / 2)}" y="${Math.round(minY - 42)}" text-anchor="middle" fill="#9a948b" font-size="26" letter-spacing="2">FONDO PALCO</text>`;
  s += `<text x="${Math.round((minX + maxX) / 2)}" y="${Math.round(maxY + 58)}" text-anchor="middle" fill="#9a948b" font-size="26" letter-spacing="2">PUBBLICO</text>`;
  // riser/pedane come sfondo
  out.forEach((it) => { if (!RISER.test(it.type)) return; const b = box(it); s += `<rect x="${Math.round(it.x - b.hw)}" y="${Math.round(it.y - b.hh)}" width="${Math.round(b.hw * 2)}" height="${Math.round(b.hh * 2)}" rx="10" fill="#efece6" stroke="#e0dace" stroke-width="2"/>`; });
  // pallini + etichette
  out.forEach((it) => { if (RISER.test(it.type)) return; const c = colorOf(it.type);
    s += `<circle cx="${Math.round(it.x)}" cy="${Math.round(it.y)}" r="15" fill="${c}"/>`;
    const label = it.label || (A.TYPES[it.type] && A.TYPES[it.type].defLabel) || "";
    if (label) s += `<text x="${Math.round(it.x)}" y="${Math.round(it.y + 34)}" text-anchor="middle" fill="#3a352f" font-size="20">${esc(label)}</text>`;
  });
  s += `</svg>`;
  return s;
}

mkdirSync(join(root, "stage-plot", "previews"), { recursive: true });
let n = 0;
for (const slug of Object.keys(SLUGS)) {
  const svg = svgFor(SLUGS[slug]);
  if (!svg) { console.log("  ✗ " + slug + " (formazione mancante)"); continue; }
  const p = join(root, "stage-plot", "previews", slug + ".svg");
  writeFileSync(p, svg);
  console.log("  ✓ " + slug + ".svg (" + Math.round(svg.length / 1024) + " KB)");
  n++;
}
console.log(n + " anteprime generate in stage-plot/previews/");
