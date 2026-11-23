/* Banco di prova nel browser dell'Esporta (FUORI dalla CI, come test/e2e-workshop): Playwright da STAGEPLOT/review,
   l'albero del repo servito come se fosse https://stageplot.it (nessun server, nessuna rete, nessun dato vero). */
import { createRequire } from "node:module";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
const require = createRequire((process.env.REVIEW_DIR || homedir() + "/COWORK/STAGEPLOT/review") + "/package.json");
export const { chromium } = require("playwright");
export const ROOT = process.env.SP_ROOT || join(dirname(fileURLToPath(import.meta.url)), "../..");
const T = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
export const VISTE = { iphone: [390, 844, true], hd: [1280, 720, false], pc: [1440, 800, false] };
export async function pagina(b, [w, h, mob], { dark = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1, serviceWorkers: "block", locale: "it-IT", timezoneId: "Europe/Rome", colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript(() => { try { localStorage.setItem("sp_onboarded", "1"); localStorage.setItem("sp_welcome", "1"); } catch (e) {} });
  await ctx.route("**/*", (r) => { const u = new URL(r.request().url()); if (u.hostname !== "stageplot.it") return r.abort(); let f = join(ROOT, decodeURIComponent(u.pathname)); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html"); if (!existsSync(f)) return r.fulfill({ status: 404, body: "" }); r.fulfill({ status: 200, contentType: T[extname(f)] || "application/octet-stream", body: readFileSync(f) }); });
  const p = await ctx.newPage(); p.__err = [];
  p.on("pageerror", (e) => p.__err.push(e.message)); p.on("console", (m) => { if (m.type() === "error") p.__err.push(m.text()); });
  await p.goto("https://stageplot.it/app/", { waitUntil: "load" }); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll(".modal").forEach((m) => (m.hidden = true)));
  return { ctx, p };
}
/* scene: "base" = 3 elementi, nessun avviso · "uno" = 24 elementi fuori dal palco (1 avviso) · "due" = i 24 fuori + due canali «Vox 4» (2 avvisi) */
export async function monta(p, scena, titolo = "") {
  await p.evaluate(([scena, titolo]) => {
    state.titolo = titolo; state.stage = { w: 1400, d: 900, blocks: [{ x: 0, y: 0, w: 1400, d: 900 }] }; recalcStageBBox(); state.items = [];
    const pon = (t, x, y, label) => { const it = addItem(t, { x, y }, true); if (it) { Object.assign(it, { x, y }); if (label) it.label = label; } };
    pon("batteria", 700, 300); pon("cantante", 700, 650); pon("wedge", 700, 760);
    if (scena !== "base") for (let i = 0; i < 24; i++) pon("wedge", 2200 + i * 20, 200);
    if (scena === "due") { pon("cantante", 300, 600, "Vox 4"); pon("cantante", 400, 600, "Vox 4"); }
    fit(); render(); window.openPdfExportModal();
  }, [scena, titolo]);
  await p.waitForTimeout(1000);
}
