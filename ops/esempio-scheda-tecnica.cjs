#!/usr/bin/env node
/**
 * IL MODELLO DI SCHEDA TECNICA della guida /guida/scheda-tecnica-band/ — rigenerato dall'editor vero.
 *
 * Una band rock di 5 elementi inventata (batteria, basso, due chitarre, tastiere; canta la chitarra 1,
 * cori basso e tastiere) costruita con la stessa strada della finestra «Chi sale sul palco?» del
 * modello Tributo, poi esportata con l'Esporta dell'app (A4, scala automatica) con rider, channel
 * list, monitor, carichi e backline. Nessun dato di utenti: solo il codice dell'app.
 *
 * È l'export dell'app così com'è: dal 13/10 il piè di pagina dice «1 di N» su ogni pagina (pdfCredit).
 *
 * Uso (rete esterna bloccata dallo script):
 *   python3 -m http.server <porta nuova> --bind 127.0.0.1      # dalla radice del repo
 *   PLAYWRIGHT=/percorso/node_modules/playwright node ops/esempio-scheda-tecnica.cjs <porta> dinN
 *   → /tmp/stb/out/dinN.pdf ; con «probe» stampa solo palco e canali, con «plain» il piè dell'app.
 *   Poi: cp in guida/scheda-tecnica-band/esempio-scheda-tecnica-band-rock.pdf e
 *   pdftoppm -jpeg -jpegopt quality=82 -r 100 -f 1 -l 1 per l'anteprima .jpg.
 */
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const PORT = process.argv[2], MODE = process.argv[3] || "probe";
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, locale: "it-IT", timezoneId: "Europe/Rome" });
  await ctx.route("**/*", (r) => { const u = new URL(r.request().url()); return (u.hostname === "localhost" || u.hostname === "127.0.0.1") ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof startFromTemplate === "function" && typeof exportPdf === "function");
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    startFromTemplate("tributo", { formazione: { voce: 0, cori: 0, chitarra: 2, basso: 1, batteria: 1, tastiere: 1, fiati: 0 }, skipConfirm: true, senzaIpotesi: true });
    const byLabel = (l) => state.items.find((i) => i.label === l);
    byLabel("Chitarra 1").headMic = "asta";
    // chi canta la voce solista sta al centro, davanti alla batteria
    {
      const dr = state.items.find((i) => i.type === "batteria");
      const g2 = state.items.find((i) => i.type === "gtstand" && i.label === "Chitarra 2");
      const w2 = state.items.find((i) => i.type === "wedge" && i.label === "Chitarra 2");
      state.items.filter((i) => i.label === "Chitarra 1").forEach((i) => { i.x = dr.x; i.y = (i.type === "wedge" ? w2.y : g2.y) + 90; });
    }
    byLabel("Basso").headMic = "asta";
    byLabel("Tastiere").headMic = "asta";
    state.titolo = "Band rock 5 elementi — scheda tecnica di esempio";
    state.luogo = "";
    state.contacts = [{ role: "Referente tecnico", name: "Nome Cognome", contact: "telefono · email", note: "" }];
    state.rider = Object.assign({}, state.rider || {}, { note: "Esempio di stageplot.it: sostituite nomi, contatti e dotazione con quelli della vostra band. La batteria la chiediamo al locale (portiamo rullante, piatti e pedale); tutto il resto lo porta la band." });
    salvaERidisegna();
    if (typeof setEventInputs === "function") setEventInputs();
    return {
      items: state.items.map((i) => i.type + ":" + (i.label || "") + (i.headMic ? "[" + i.headMic + "]" : "")),
      patch: patchList().rows.map((r) => [r.n, r.name, r.mic, r.box || ""].join(" / ")),
      backline: backlineList().rows.map((r) => r.qty + "× " + r.name + " (" + (r.by || "-") + ")"),
      stage: [state.stage.w, state.stage.d],
    };
  });
  console.log(JSON.stringify(info, null, 1));
  if (MODE === "probe") { await browser.close(); return; }
  // forniture: batteria e ampli chitarra 2 al locale (Service), il resto Band
  await page.evaluate(() => {
    state.items.forEach((it) => { if (!isBackline(it)) return; it.by = it.type === "batteria" ? "Service" : "Band"; });
    // ordine del banco: strumenti, poi le voci (voce solista prima dei cori), come si trascina a mano in channel list
    const rows = patchList().rows;
    const voci = ["Chitarra 1 voce", "Basso voce", "Tastiere voce"];
    const strum = rows.filter((r) => voci.indexOf(r.name) < 0).map((r) => r.key);
    const v = voci.map((nm) => rows.find((r) => r.name === nm).key);
    state.cab = state.cab || {}; state.cab.order = strum.concat(v);
    salvaERidisegna();
    return 0;
  });
  console.log(JSON.stringify(await page.evaluate(() => ({ patch: patchList().rows.map((r) => r.n + " " + r.name + " " + r.mic), backline: backlineList().rows.map((r) => r.qty + "x " + r.name + " " + r.by) }))));
  // dal 13/10 il piè «i di N» su ogni pagina è dell'app (pdfCredit): niente più sostituzioni qui
  const dl = page.waitForEvent("download", { timeout: 60000 });
  await page.evaluate(() => {
    window.__pdfPages = { rider: true, inputlist: true, monitorlist: true, backline: true, loadlist: true };
    var h = "Referente tecnico: Nome Cognome · telefono";
    var o = pdfBestOrient("a4", "auto", h);
    return exportPdf("a4", "auto", o, h);
  });
  const d = await dl;
  const dir = process.env.OUT_DIR || "/tmp/stb/out"; require("fs").mkdirSync(dir, { recursive: true });
  const out = dir + "/" + MODE + ".pdf";
  await d.saveAs(out);
  console.log("salvato", out, d.suggestedFilename());
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
