import { createRequire } from "node:module";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
const require = createRequire("/Users/simonecastellan/COWORK/STAGEPLOT/review/package.json");
const { chromium } = require("playwright");
const ROOT = process.env.SP_ROOT || process.cwd();
const T = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
const b = await chromium.launch();
for (const [w, h, mob] of [[390, 844, true], [1280, 720, false], [1440, 800, false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, serviceWorkers: "block", locale: "it-IT" });
  await ctx.addInitScript(() => { try { localStorage.setItem("sp_onboarded", "1"); localStorage.setItem("sp_welcome", "1"); } catch (e) {} });
  await ctx.route("**/*", (r) => { const u = new URL(r.request().url()); if (u.hostname !== "stageplot.it") return r.abort(); let f = join(ROOT, decodeURIComponent(u.pathname)); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html"); if (!existsSync(f)) return r.fulfill({ status: 404, body: "" }); r.fulfill({ status: 200, contentType: T[extname(f)] || "application/octet-stream", body: readFileSync(f) }); });
  const p = await ctx.newPage(); await p.goto("https://stageplot.it/app/", { waitUntil: "load" }); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll(".modal").forEach((m) => (m.hidden = true)));
  await p.evaluate(() => { state.stage = { w: 1400, d: 900, blocks: [{ x: 0, y: 0, w: 1400, d: 900 }] }; recalcStageBBox(); state.items = [];
    [["batteria",700,300],["cantante",700,650],["wedge",700,760]].forEach(([t,x,y])=>{ const it=addItem(t,{x,y},true); if(it) Object.assign(it,{x,y}); });
    for (let i=0;i<24;i++){ const it=addItem("wedge",{x:2200+i*20,y:200},true); if(it) Object.assign(it,{x:2200+i*20,y:200}); }
    const a=addItem("cantante",{x:300,y:600},true); a.label="Vox 4"; const c=addItem("cantante",{x:400,y:600},true); c.label="Vox 4"; fit(); render(); window.openPdfExportModal(); });
  if (process.env.SCALA) { await p.selectOption("#pdfScale", process.env.SCALA); await p.waitForTimeout(500); }
  await p.waitForTimeout(1000);
  console.log(w+"x"+h, JSON.stringify(await p.evaluate(() => { const b=document.querySelector("#pdfModal .pdf-exp-body"); const r=id=>{const e=document.getElementById(id); return e&&!e.hidden&&e.offsetParent?Math.round(e.getBoundingClientRect().height):0}; return {scroll:b.scrollHeight+"/"+b.clientHeight, prima:r("pdfPrimaDi"), righeFuori:document.querySelectorAll("#pdfFuoriPalco>div").length, fuori:r("pdfFuoriPalco"), info:r("pdfInfo"), altreTop:Math.round(document.getElementById("pdfAltre").getBoundingClientRect().top), vh:innerHeight, goBottom:Math.round(document.getElementById("pdfGo").getBoundingClientRect().bottom)}; })));
  await p.screenshot({ path: process.env.OUT ? process.env.OUT+"/"+w+".png" : "/dev/null" }).catch(()=>{});
  await ctx.close();
}
await b.close();
