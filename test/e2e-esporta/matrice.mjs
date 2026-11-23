/* Matrice di aspetto: 5 viste × 7 scene, console pulita, «Scarica PDF» in vista, scroll del corpo misurato. Uso: node test/e2e-esporta/matrice.mjs [cartella-schermate] */
import { chromium, pagina } from "./comune.mjs";
import { mkdirSync } from "node:fs";
const SCH = process.argv[2] || ""; if (SCH) mkdirSync(SCH, { recursive: true });
const VISTE = { "1440x800": [1440, 800, false], "1280x720": [1280, 720, false], "1024x768": [1024, 768, false], "768x1024": [768, 1024, false], "390x844": [390, 844, true] };
const SC = {
  band: [["batteria", 700, 300], ["bassamp", 450, 320], ["cantante", 700, 650], ["cantante", 500, 620], ["wedge", 700, 760], ["wedge", 500, 740], ["stagebox", 700, 150]],
  orchestra: [["podio", 700, 700], ...[...Array(8)].map((_, i) => ["violino", 400 + i * 40, 620 - (i % 2) * 40]), ...[...Array(4)].map((_, i) => ["violoncello", 820 + i * 60, 520]), ["contrabbasso", 1100, 450], ["flauto", 600, 420], ["timpani", 700, 220], ["arpa", 300, 450]],
  luci: [["truss", 700, 110, { w: 900, d: 30 }], ...[250, 450, 650, 850, 1050].map((x) => ["parluci", x, 112]), ["batteria", 700, 430], ["cantante", 700, 650], ["mixer", 700, 840]],
};
const scene = [["band", {}], ["orchestra", {}], ["luci", {}], ["en-titolo-lungo", { base: "band", en: true, titolo: "Concerto di prova con un titolo davvero molto molto lungo per vedere come si comporta il cartiglio" }], ["scuro", { base: "orchestra", dark: true }], ["due-avvisi", { base: "band", fuori: 24, dup: true }], ["progetto-grande", { base: "grande" }]];
const b = await chromium.launch(); let ko = 0, n = 0; const righe = [];
for (const [vn, vista] of Object.entries(VISTE)) for (const [sn, o] of scene) {
  const { ctx, p } = await pagina(b, vista, { dark: !!o.dark });
  await p.evaluate(([base, o, SC]) => {
    if (o.dark) document.body.classList.add("dark");
    state.titolo = o.titolo || ""; state.stage = { w: 1400, d: 900, blocks: [{ x: 0, y: 0, w: 1400, d: 900 }] }; recalcStageBBox(); state.items = [];
    const pon = (t, x, y, ex, label) => { try { const it = addItem(t, { x, y }, true); if (it) { Object.assign(it, { x, y }, ex || {}); if (label) it.label = label; } } catch (e) {} };
    if (base === "grande") { const tipi = ["violino", "viola", "violoncello", "wedge", "cantante", "parluci"]; for (let i = 0; i < 158; i++) pon(tipi[i % 6], 60 + (i % 24) * 55, 60 + Math.floor(i / 24) * 120); }
    else (SC[base || ""] || []).forEach(([t, x, y, ex]) => pon(t, x, y, ex));
    for (let i = 0; i < (o.fuori || 0); i++) pon("wedge", 2200 + i * 20, 200);
    if (o.dup) { pon("cantante", 300, 600, {}, "Vox 4"); pon("cantante", 400, 600, {}, "Vox 4"); }
    if (o.en) { const e = document.getElementById("pdfDocLingua"); if (e) { e.value = "en"; e.dispatchEvent(new Event("change", { bubbles: true })); } }
    fit(); render(); window.openPdfExportModal();
  }, [o.base || sn, o, SC]);
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => { const bd = document.querySelector("#pdfModal .pdf-exp-body"), g = document.getElementById("pdfGo").getBoundingClientRect(), pv = document.getElementById("pdfPreview").getBoundingClientRect();
    return { scroll: bd.scrollHeight - bd.clientHeight, go: g.top >= 0 && g.bottom <= innerHeight, prev: pv.height > 40, compatti: document.querySelector("#pdfModal .pdf-export").classList.contains("px-compatti"), orizz: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  const okk = r.go && r.prev && r.orizz && p.__err.length === 0; n++; if (!okk) ko++;
  righe.push((okk ? "ok " : "KO ") + vn + " · " + sn + " · scroll corpo " + r.scroll + " px" + (r.compatti ? " · compatti" : "") + (p.__err.length ? " · ERR " + p.__err[0] : ""));
  if (SCH) await p.screenshot({ path: SCH + "/" + vn + "_" + sn + ".png" });
  await ctx.close();
}
await b.close(); console.log(righe.join("\n")); console.log("\n" + (ko ? "KO " + ko : "TUTTE VERDI") + " su " + n); process.exit(ko ? 1 : 0);
