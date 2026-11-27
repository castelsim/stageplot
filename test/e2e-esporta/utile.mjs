/* L-B (27/11/2026): «Ti è stato utile?» dopo il primo PDF, nel browser vero. FUORI dalla CI, come le altre prove e2e-esporta.
   Uso: node test/e2e-esporta/utile.mjs [cartella-per-gli-screenshot]  */
import { chromium, pagina, monta, VISTE } from "./comune.mjs";
const out = process.argv[2] || "";
let falliti = 0; const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) falliti++; };
const b = await chromium.launch();
for (const [nome, dark] of [["hd", false], ["iphone", false], ["iphone", true], ["hd", true]]) {
  const { ctx, p } = await pagina(b, VISTE[nome], { dark });
  if (dark) await p.evaluate(() => { try { document.body.classList.add("dark"); } catch (e) {} });
  const inviati = []; let serverOk = true;   /* il banco blocca la rete esterna: qui risponde lo script (200, o errore per D6) */
  await ctx.route("**/functions/v1/submit-feedback", (r) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    return serverOk ? r.fulfill({ status: 200, headers: cors, contentType: "application/json", body: '{"ok":true}' }) : r.fulfill({ status: 429, headers: cors, contentType: "application/json", body: '{"error":"troppi invii"}' });
  });
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
  /* D1/D2 (rilettura 27/11): la scheda non copre MAI la barra in basso del telefono né il box «Scrivici» */
  const sov = await p.evaluate(() => {
    const c = document.getElementById("utilePdf").getBoundingClientRect(), v = [];
    for (const id of ["mDock", "fbHead", "fbBox", "props"]) { const e = document.getElementById(id); if (!e || !e.getClientRects().length) continue; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      const x = Math.max(0, Math.min(c.right, r.right) - Math.max(c.left, r.left)), y = Math.max(0, Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top)); if (x > 1 && y > 1) v.push(id + " " + Math.round(x) + "×" + Math.round(y)); }
    return v; });
  ok(sov.length === 0, et + ": la scheda non copre dock, box «Scrivici» né pannello (sovrapposizioni: " + sov.join(", ") + ")");
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
  /* D3: ignorata due volte, si spegne da sola */
  await p.evaluate(() => { localStorage.setItem("sp_utilePdf", "attivo"); });
  for (let k = 0; k < 3; k++) { await p.evaluate(() => { document.getElementById("utilePdf").hidden = true; window.openPdfExportModal(); }); await p.waitForTimeout(300); await p.click("#pdfCancel"); await p.waitForTimeout(5500); }
  ok(await p.evaluate(() => localStorage.getItem("sp_utilePdf")) === "no" && await p.evaluate(() => document.getElementById("utilePdf").hidden), et + ": ignorata due volte, la terza non compare e lo stato è «no»");
  /* D4: Esc premuto altrove non la spegne */
  await p.evaluate(() => { localStorage.setItem("sp_utilePdf", "attivo"); window.openPdfExportModal(); }); await p.waitForTimeout(300); await p.click("#pdfCancel"); await p.waitForTimeout(5500);
  await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur()); await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !document.getElementById("utilePdf").hidden && localStorage.getItem("sp_utilePdf") === "visto"), et + ": Esc altrove non la spegne (e la comparsa è contata)");
  await p.evaluate(() => document.getElementById("utilePdf").hidden = true);
  /* D6: invio fallito = niente «fatto» né «Grazie» */
  await p.evaluate(() => { localStorage.setItem("sp_utilePdf", "attivo"); window.openPdfExportModal(); }); await p.waitForTimeout(300); await p.click("#pdfCancel"); await p.waitForTimeout(5500);
  serverOk = false; await p.click('[data-ut-voto="si"]'); await p.waitForTimeout(800);   /* il server risponde 429: l'invio fallisce davvero */
  ok(await p.evaluate(() => localStorage.getItem("sp_utilePdf")) === "attivo" && await p.evaluate(() => /Non è partito/.test(document.getElementById("utilePdf").textContent)), et + ": invio fallito → stato com'era, «Non è partito», nessun «Grazie»");
  ok(await p.evaluate(() => !/Grazie/.test(document.querySelector("#utilePdf [data-ut]:not([hidden])").textContent)), et + ": e nessun «Grazie» visibile");
  if (out) await p.screenshot({ path: out + "/utile-errore-" + et + ".png" });
  const errV = p.__err.filter((m) => !/ERR_FAILED/.test(m)); /* la rete esterna è bloccata apposta dal banco */
  ok(errV.length === 0, et + ": nessun errore nella pagina" + (errV.length ? " " + errV.slice(0, 2).join(" | ") : ""));
  await ctx.close();
}
await b.close(); console.log(falliti ? "✗ " + falliti + " falliti" : "✓ tutto ok"); process.exit(falliti ? 1 : 0);
