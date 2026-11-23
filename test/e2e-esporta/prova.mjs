/* Prove di COMPORTAMENTO dell'Esporta in browser headless (le prove di engines.test.mjs leggono il sorgente; queste usano la finestra vera).
   Uso: node test/e2e-esporta/prova.mjs   (SP_ROOT=<albero> per provare un altro albero; SCHERMI=<cartella> per salvare le schermate) */
import { chromium, pagina, monta, VISTE } from "./comune.mjs";
import { mkdirSync } from "node:fs";
const SCHERMI = process.env.SCHERMI || ""; if (SCHERMI) mkdirSync(SCHERMI, { recursive: true });
let n = 0, ko = 0; const ok = (c, m) => { n++; if (!c) ko++; console.log((c ? "  ok  " : "  KO  ") + m); };
const b = await chromium.launch();
const foto = (p, nome) => SCHERMI ? p.screenshot({ path: SCHERMI + "/" + nome + ".png" }) : null;
const st = (p) => p.evaluate(() => ({
  menuAperto: !document.getElementById("pdfAltriMenu").hidden, exp: document.getElementById("pdfAltriBtn").getAttribute("aria-expanded"),
  finestraAperta: !document.getElementById("pdfModal").hidden, fuoco: (document.activeElement && (document.activeElement.id || document.activeElement.tagName)) || "" }));

for (const [nome, vista] of Object.entries(VISTE).filter(([k]) => !process.env.VISTA || process.env.VISTA === k)) {
  console.log("== " + nome + " " + vista.slice(0, 2).join("×"));
  // ---------- menu «Altri file» e tastiera
  { const { ctx, p } = await pagina(b, vista); await monta(p, "base");
    const apri = vista[2] ? () => p.tap("#pdfAltriBtn") : () => p.click("#pdfAltriBtn");
    let s = await st(p); ok(!s.menuAperto && s.exp === "false", "menu chiuso di serie, aria-expanded=false");
    await apri(); s = await st(p); ok(s.menuAperto && s.exp === "true", "il bottone apre il menu (aria-expanded=true)");
    ok(await p.evaluate(() => document.activeElement && document.activeElement.closest("#pdfAltriMenu") !== null), "il fuoco entra nel menu (prima voce: " + s.fuoco + ")");
    const voci = await p.evaluate(() => [...document.querySelectorAll("#pdfAltriMenu button")].filter((e) => e.offsetParent).map((e) => e.id));
    ok(voci.length >= 4 && voci[0] === "pdfEsterni", "voci visibili in ordine, «Palco per esterni» per prima: " + voci.join(","));
    if (!vista[2]) { // tastiera vera solo con il computer
      const giro = []; for (let i = 0; i < voci.length - 1; i++) { await p.keyboard.press("Tab"); giro.push((await st(p)).fuoco); }
      ok(JSON.stringify(giro) === JSON.stringify(voci.slice(1)), "Tab percorre le voci nell'ordine: " + giro.join(" > "));
      await p.keyboard.press("Shift+Tab"); ok((await st(p)).fuoco === voci[voci.length - 2], "Maiusc+Tab torna indietro");
    }
    await p.keyboard.press("Escape"); s = await st(p);
    ok(!s.menuAperto && s.exp === "false" && s.finestraAperta, "Esc chiude il menu e lascia APERTA la finestra");
    ok(s.fuoco === "pdfAltriBtn", "dopo Esc il fuoco torna al bottone «Altri file» (" + s.fuoco + ")");
    await apri(); await p.click("#pdfModal h2", { force: true }); s = await st(p); ok(!s.menuAperto && s.finestraAperta, "un clic fuori chiude il menu, non la finestra");
    await apri(); { const dl = p.waitForEvent("download", { timeout: 20000 }); await (vista[2] ? p.tap("#pdfAltPng") : p.click("#pdfAltPng")); const d = await dl; ok(/\.png$/i.test(d.suggestedFilename()), "la voce «Immagine PNG» scarica un .png (" + d.suggestedFilename() + ")"); await p.waitForTimeout(100); s = await st(p); ok(!s.menuAperto && s.exp === "false", "dopo la scelta di una voce il menu si chiude"); }
    await apri(); await p.keyboard.press("Escape"); await p.keyboard.press("Escape"); s = await st(p); ok(!s.finestraAperta, "un secondo Esc chiude la finestra");
    await p.evaluate(() => window.openPdfExportModal()); await p.waitForTimeout(400); s = await st(p); ok(s.finestraAperta && !s.menuAperto, "riaprendo l'Esporta il menu parte chiuso");
    ok(await p.evaluate(() => !document.getElementById("pdfAltriBtn").hasAttribute("aria-haspopup")), "niente aria-haspopup sul bottone");
    ok(p.__err.length === 0, "console pulita " + p.__err.join(" | ")); await ctx.close(); }
  // ---------- chip del formato: cambiano il foglio
  { const { ctx, p } = await pagina(b, vista); await monta(p, "base");
    const cartiglio = () => p.evaluate(() => { const h = document.getElementById("pdfPreview"); const r = h.__ombra && h.__ombra.__root; return r ? [...r.querySelectorAll("text")].map((t) => t.textContent).join("|") : ""; });
    const vb = () => p.evaluate(() => { const h = document.getElementById("pdfPreview"); const r = h.__ombra && h.__ombra.__root; const sv = r && r.querySelector("svg"); return sv ? sv.getAttribute("viewBox") : ""; });
    const a4 = await cartiglio(), vb4 = await vb();
    ok(/A4/.test(a4), "di serie il foglio è A4 (cartiglio)");
    await (vista[2] ? p.tap('[data-chips="pdfPaper"] button[data-v="a3"]') : p.click('[data-chips="pdfPaper"] button[data-v="a3"]')); await p.waitForTimeout(500);
    const a3 = await cartiglio(), vb3 = await vb();
    ok(await p.evaluate(() => document.querySelector('[data-chips="pdfPaper"] button[data-v="a3"]').classList.contains("on") && !document.querySelector('[data-chips="pdfPaper"] button[data-v="a4"]').classList.contains("on")), "il chip A3 si accende, A4 si spegne");
    ok(/A3/.test(a3) && !/A4/.test(a3), "l'anteprima passa ad A3 (cartiglio: " + (a3.match(/A\d[^|]*/) || [""])[0] + ")");
    ok(vb3 !== vb4, "e cambia il foglio disegnato (viewBox " + vb4 + " → " + vb3 + ")");
    ok(await p.evaluate(() => /A3/.test(document.getElementById("pdfRiga").textContent)), "la riga in alto dice A3");
    await p.click('[data-chips="pdfPaper"] button[data-v="a4"]'); await p.waitForTimeout(400);
    ok(/A4/.test(await cartiglio()), "tornando su A4 l'anteprima torna ad A4");
    ok(p.__err.length === 0, "console pulita " + p.__err.join(" | ")); await ctx.close(); }
  // ---------- avvisi: uno solo = per intero; due = compatti, con Dettagli, tutto raggiungibile e niente scroll
  { const { ctx, p } = await pagina(b, vista); await monta(p, "uno");
    const q = () => p.evaluate(() => { const b = document.querySelector("#pdfModal .pdf-exp-body"), d = (id) => { const e = document.getElementById(id); return !!(e && !e.hidden && e.offsetParent); };
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; };
      return { compatti: document.querySelector("#pdfModal .pdf-export").classList.contains("px-compatti"), scroll: b.scrollHeight - b.clientHeight, fuori: d("pdfFuoriPalco"), prima: d("pdfPrimaDi"),
        testoFuori: document.getElementById("pdfFuoriPalco").innerText, dettagli: [...document.querySelectorAll("#pdfFuoriPalco .px-det-b")].filter((e) => e.offsetParent).length,
        go: vis(document.getElementById("pdfGo")), altri: vis(document.getElementById("pdfAltriBtn")), prev: vis(document.getElementById("pdfPreview")),
        altreRiassunto: (() => { const s = document.querySelector("#pdfAltre>summary").getBoundingClientRect(), c = b.getBoundingClientRect(); return s.top >= c.top && s.bottom <= c.bottom + 1; })() }; });
    let r = await q();
    ok(r.fuori && !r.prima && !r.compatti && r.dettagli === 0, "1 avviso: per intero, niente «Dettagli»");
    ok(/forse è il palco a essere sbagliato/.test(r.testoFuori), "1 avviso: il testo completo è letto (anche «forse è il palco a essere sbagliato»)");
    await p.close(); await ctx.close();
    const c2 = await pagina(b, vista); const p2 = c2.p; await monta(p2, "due");
    const q2 = () => p2.evaluate(() => { const b = document.querySelector("#pdfModal .pdf-exp-body"), d = (id) => { const e = document.getElementById(id); return !!(e && !e.hidden && e.offsetParent); };
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; };
      return { compatti: document.querySelector("#pdfModal .pdf-export").classList.contains("px-compatti"), scroll: b.scrollHeight - b.clientHeight, fuori: d("pdfFuoriPalco"), prima: d("pdfPrimaDi"),
        titoloFuori: document.querySelector("#pdfFuoriPalco b") && document.querySelector("#pdfFuoriPalco b").innerText, bottoneRimedio: d("pdfFuoriFix"),
        testoFuori: document.getElementById("pdfFuoriPalco").innerText, testoPrima: document.getElementById("pdfPrimaDi").innerText,
        go: vis(document.getElementById("pdfGo")), altri: vis(document.getElementById("pdfAltriBtn")), prev: vis(document.getElementById("pdfPreview")),
        altreRiassunto: (() => { const s = document.querySelector("#pdfAltre>summary").getBoundingClientRect(), c = b.getBoundingClientRect(); return s.top >= c.top && s.bottom <= c.bottom + 1; })() }; });
    r = await q2(); await foto(p2, nome + "_due_avvisi");
    ok(r.fuori && r.prima && r.compatti, "2 avvisi: la finestra passa al modo compatto");
    ok(r.scroll <= 1, "2 avvisi: il corpo della finestra NON scorre (eccedenza " + r.scroll + " px)");
    ok(r.go && r.altri && r.prev && r.altreRiassunto, "2 avvisi: «Scarica PDF», «Altri file», anteprima e «Altre opzioni» restano in vista");
    ok(/24 elementi su 2\d sono fuori dal palco/.test(r.titoloFuori) && r.bottoneRimedio, "2 avvisi: il titolo (con i numeri) e «Adatta il palco» restano in vista");
    ok(/Prima di esportare: 1 cosa da guardare/.test(r.testoPrima), "2 avvisi: «Prima di esportare» dice quante cose (" + r.testoPrima.split("\n")[0].trim() + ")");
    ok(!/forse è il palco a essere sbagliato/.test(r.testoFuori) && !/«Vox 4»/.test(r.testoPrima), "2 avvisi: il resto del testo è dietro «Dettagli»");
    // Dettagli: apre, aria-expanded, il testo completo c'è
    const bt = '#pdfFuoriPalco .px-det-b'; ok((await p2.getAttribute(bt, "aria-expanded")) === "false", "«Dettagli» parte chiuso (aria-expanded=false)");
    await (vista[2] ? p2.tap(bt) : p2.click(bt)); await p2.waitForTimeout(150);
    ok((await p2.getAttribute(bt, "aria-expanded")) === "true" && /forse è il palco a essere sbagliato/.test(await p2.evaluate(() => document.getElementById("pdfFuoriPalco").innerText)), "«Dettagli» apre il testo completo, aria-expanded=true");
    await (vista[2] ? p2.tap(bt) : p2.click(bt)); await p2.waitForTimeout(150);
    ok(!/forse è il palco a essere sbagliato/.test(await p2.evaluate(() => document.getElementById("pdfFuoriPalco").innerText)), "e si richiude");
    const bp = '#pdfPrimaDi .px-det-b'; await (vista[2] ? p2.tap(bp) : p2.click(bp)); await p2.waitForTimeout(150);
    ok(/«Vox 4» è scritto su 2 canali/.test(await p2.evaluate(() => document.getElementById("pdfPrimaDi").innerText)), "«Prima di esportare» → Dettagli mostra la riga: «Vox 4» è scritto su 2 canali");
    if (!vista[2]) { await p2.focus(bt); await p2.keyboard.press("Enter"); await p2.waitForTimeout(150); ok((await p2.getAttribute(bt, "aria-expanded")) === "true", "«Dettagli» si apre anche da tastiera (Invio)"); }
    // il rimedio lavora: Adatta il palco → gli avvisi spariscono, il modo compatto si spegne
    await p2.click("#pdfFuoriFix"); await p2.waitForTimeout(600);
    r = await q2(); ok(!r.fuori || !r.compatti, "dopo «Adatta il palco» l'avviso dei fuori sparisce e il modo compatto si spegne");
    // il piè: separatore
    ok(p2.__err.length === 0, "console pulita " + p2.__err.join(" | ")); await c2.ctx.close(); }
  // ---------- piè dell'anteprima: «· comprende…» solo se c'è la prima parte
  { const { ctx, p } = await pagina(b, vista); await monta(p, "uno");
    const t = await p.evaluate(() => { const e = document.querySelector("#pdfInfo .px-fuori"); return e ? { sep: getComputedStyle(e, "::before").content, riga: document.getElementById("pdfInfo").innerText, scalaVisibile: !!(document.querySelector("#pdfInfo .px-scala") && document.querySelector("#pdfInfo .px-scala").offsetParent) } : null; });
    ok(!!t, "il piè dice «comprende chi sta fuori dal palco»");
    if (t) { if (vista[2]) ok(!t.scalaVisibile && /^Comprende chi sta fuori/.test(t.riga.trim()), "iPhone: «Scala risultante…» nascosta e la frase parte da sola, senza «·» (" + t.riga.trim().slice(0, 40) + "…)");
      else ok(t.scalaVisibile && /Scala risultante/.test(t.riga) && /comprende chi sta fuori/.test(t.riga) && /·/.test(t.sep), "computer: «Scala risultante … · comprende chi sta fuori» col separatore (generato dallo stile: " + t.sep + ")"); }
    ok(p.__err.length === 0, "console pulita " + p.__err.join(" | ")); await ctx.close(); }
}
await b.close();
console.log("\n" + (ko ? "KO " + ko + " su " + n : "TUTTE VERDI " + n + "/" + n));
process.exit(ko ? 1 : 0);
