/* L-B (27/11/2026): «Ti è stato utile?» dopo il primo PDF, nel browser vero. FUORI dalla CI, come le altre prove e2e-esporta.
   Uso: node test/e2e-esporta/utile.mjs [cartella-per-gli-screenshot]  */
import { chromium, pagina, monta, VISTE } from "./comune.mjs";
const out = process.argv[2] || "";
let falliti = 0; const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) falliti++; };
const b = await chromium.launch();
for (const [nome, dark] of [["hd", false], ["iphone", false], ["iphone", true], ["hd", true]]) {
  const { ctx, p } = await pagina(b, VISTE[nome], { dark });
  if (dark) await p.evaluate(() => { try { document.body.classList.add("dark"); } catch (e) {} });
  const inviati = [];
  p.on("request", (r) => { if (/submit-feedback/.test(r.url()) && r.method() === "POST") inviati.push(JSON.parse(r.postData() || "{}")); });
  const et = nome + (dark ? "-scuro" : "");
  await monta(p, "base");
  ok(await p.evaluate(() => document.getElementById("utilePdf").hidden), et + ": all'apertura dell'Esporta niente scheda");
  await p.click("#pdfGo"); await p.waitForFunction(() => /PDF scaricato/.test(document.getElementById("pdfInfo").textContent), null, { timeout: 30000 });
  ok(await p.evaluate(() => document.getElementById("utilePdf").hidden), et + ": a PDF scaricato, finestra ancora aperta: niente scheda");
  ok(await p.evaluate(() => localStorage.getItem("sp_utilePdf")) === "attivo", et + ": il primo PDF la accende");
  await p.click("#pdfCancel"); await p.waitForTimeout(5500);
  ok(await p.evaluate(() => !document.getElementById("utilePdf").hidden), et + ": alla chiusura della finestra compare");
  const r = await p.evaluate(() => { const e = document.getElementById("utilePdf").getBoundingClientRect(); return { b: e.bottom, w: e.width, h: e.height, iw: innerWidth, ih: innerHeight }; });
  ok(r.b <= r.ih + 1 && r.w <= r.iw && r.h < 170, et + ": sta nello schermo, piccola (" + Math.round(r.w) + "×" + Math.round(r.h) + ")");
  if (out) await p.screenshot({ path: out + "/utile-" + et + ".png" });
  await p.click('[data-ut-voto="cosi"]'); await p.waitForTimeout(600);
  ok(inviati.length === 1 && inviati[0].message === "[Utile dopo il primo PDF · così così]" && inviati[0].hint === null, et + ": il voto parte subito, hint nullo: " + JSON.stringify(inviati[0] && inviati[0].message));
  ok(inviati[0] && !("project_snapshot" in inviati[0]) && !("page_url" in (inviati[0].meta || {})), et + ": niente progetto né pagina nel messaggio");
  ok(await p.evaluate(() => localStorage.getItem("sp_utilePdf")) === "fatto", et + ": risposto = non torna");
  await p.fill("#utileTesto", "manca il sax"); await p.click("#utileInvia"); await p.waitForTimeout(500);
  ok(inviati.length === 2 && /· riga\] manca il sax$/.test(inviati[1].message), et + ": la riga è un secondo messaggio");
  await p.waitForTimeout(2000);
  ok(await p.evaluate(() => document.getElementById("utilePdf").hidden), et + ": si chiude da sola");
  /* secondo PDF, finestra riaperta e chiusa: non torna */
  await p.evaluate(() => window.openPdfExportModal()); await p.waitForTimeout(300); await p.click("#pdfCancel"); await p.waitForTimeout(5500);
  ok(await p.evaluate(() => document.getElementById("utilePdf").hidden), et + ": una volta sola");
  /* «Non ora» */
  await p.evaluate(() => { localStorage.setItem("sp_utilePdf", "attivo"); window.openPdfExportModal(); }); await p.waitForTimeout(300);
  await p.click("#pdfCancel"); await p.waitForTimeout(5500);
  ok(await p.evaluate(() => !document.getElementById("utilePdf").hidden), et + ": (richiamata) compare");
  await p.click("#utileNonOra");
  ok(await p.evaluate(() => localStorage.getItem("sp_utilePdf")) === "no" && await p.evaluate(() => document.getElementById("utilePdf").hidden), et + ": «Non ora» la spegne per sempre");
  const errV = p.__err.filter((m) => !/ERR_FAILED/.test(m)); /* la rete esterna è bloccata apposta dal banco */
  ok(errV.length === 0, et + ": nessun errore nella pagina" + (errV.length ? " " + errV.slice(0, 2).join(" | ") : ""));
  await ctx.close();
}
await b.close(); console.log(falliti ? "✗ " + falliti + " falliti" : "✓ tutto ok"); process.exit(falliti ? 1 : 0);
