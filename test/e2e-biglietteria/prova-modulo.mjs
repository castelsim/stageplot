/* «Nuovo spettacolo» e «Modifica» (task 14) nel browser vero: Chromium e WebKit, telefono e computer. Dati inventati.
   Uso: WT=<worktree> SITO=<copia di prova> OUT=<cartella screenshot> [SOLO="chromium telefono"] node prova-modulo.mjs */
import { chromium, webkit, avviaSito, contesto, http, utente, TELEFONO, COMPUTER, sorveglia, esito, P, ANON, API } from "./comune.mjs";
import { mkdirSync } from "node:fs";
const SITO = process.env.SITO || P + "/sito", OUT = process.env.OUT || P + "/out";
mkdirSync(OUT, { recursive: true });
const E = esito(), errori = [], S = Date.now().toString(36), sito = await avviaSito(SITO);
function doc() {
  const sedie = (file) => { const items = []; [...file].forEach((f, r) => { for (let n = 1; n <= 6; n++) items.push({ id: "s" + f + n, type: "sediapubblico", x: 200 + n * 60,
    y: 1000 + r * 90, rot: 180, w: 50, d: 53, fila: f, posto: n, settore: "Platea" }); }); return items; };
  const stato = (it) => ({ _v: 1, items: it, inputs: [], outputs: [], stage: { w: 1200, d: 800, blocks: [{ x: 100, y: 0, w: 1000, d: 800 }] } });
  return { _doc: 1, active: "V1", variants: [{ id: "V1", name: "Platea", state: stato(sedie("ABCD")) }, { id: "V2", name: "Ridotta", state: stato(sedie("AB")) },
    { id: "V3", name: "Vuota", state: stato([]) }] };
}
const abilita = (u) => http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: u.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) {
  if (process.env.SOLO && process.env.SOLO !== `${nm} ${t}`) continue;
  const chi = `${nm} ${t}`; giro++;
  const org = await utente(`mod-${S}-${giro}@example.invalid`); await abilita(org);
  const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
  const ORG = "teatro-mod-" + S + "-" + giro;
  await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: ORG } });
  const br = await motore.launch();
  /* nessun progetto con posti numerati: una cosa sola da fare, aprire l'editor */
  let ctx = await contesto(br, tipo, { sessione: org }), p = await ctx.newPage(); sorveglia(p, chi, errori);
  await p.goto(sito.url + "/biglietteria/gestione/?v=nuovo");
  await p.waitForSelector(".gst-modulo .nota", { timeout: 10000 });
  E.ok(/Numera i posti/.test(await p.textContent(".gst-modulo .nota")) && (await p.$("#gst-form")) === null &&
    (await p.getAttribute(".gst-modulo a.btn", "href")) === "/app/", chi + ": senza sale numerate solo «Apri l'editor»");
  await ctx.close();
  const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala grande", data: doc() }, { key: ANON, token: org.access_token })).d[0].id;
  await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Senza posti", data: { items: [] } }, { key: ANON, token: org.access_token });
  ctx = await contesto(br, tipo, { sessione: org }); p = await ctx.newPage(); sorveglia(p, chi, errori);
  /* dall'editor: «Vai alla biglietteria» con ?p= di un progetto senza spettacoli → Nuovo spettacolo con la sala già scelta */
  await p.goto(sito.url + "/biglietteria/gestione/?p=" + prog);
  await p.waitForSelector("#gst-mappa svg", { timeout: 10000 });
  E.ok((await p.inputValue("#gst-progetto")) === prog && /24 posti, file A–D/.test(await p.textContent("#gst-sala")), chi + ": sala già scelta, «24 posti, file A–D»");
  E.ok((await p.$$("#gst-progetto option")).length === 2, chi + ": solo i progetti con posti numerati");
  E.ok((await p.inputValue("#gst-variante")) === "V1" && (await p.$$("#gst-variante option")).length === 2, chi + ": variante attiva scelta, solo quelle con posti");
  const svgW = await p.$eval("#gst-mappa svg", (s) => s.getBoundingClientRect().width);
  E.ok(svgW > 200, chi + ": la pianta occupa la larghezza (" + Math.round(svgW) + " px)");
  const sedia = await p.$eval('#gst-mappa g.posto[data-k="Platea|A|1"] .sedia', (r) => r.getBoundingClientRect().width);
  const inVista = await p.$eval('#gst-mappa', (m) => { const a = m.getBoundingClientRect(), b = m.querySelector('g.posto[data-k="Platea|A|1"]').getBoundingClientRect();
    return b.top >= a.top && b.bottom <= a.bottom; });
  E.ok(sedia >= 26 && inVista, `${chi}: posti toccabili col dito (${Math.round(sedia)} px) e già in vista`);
  await p.fill("#gst-titolo", "Concerto di prova");
  /* Invio nel titolo NON apre le prenotazioni */
  await p.press("#gst-titolo", "Enter"); await p.waitForTimeout(400);
  E.ok(/v=nuovo|p=/.test(p.url()) && (await p.$("#gst-form")) !== null, chi + ": Invio nel titolo non pubblica");
  await p.fill("#gst-data", "2027-03-12"); await p.fill("#gst-ora", "21:00"); await p.fill("#gst-luogo", "Teatro di prova, Città");
  E.ok((await p.inputValue("#gst-slug")) === "concerto-di-prova-12-marzo", chi + ": indirizzo proposto da titolo e data");
  await p.fill("#gst-descrizione", "x".repeat(700));
  E.ok((await p.inputValue("#gst-descrizione")).length === 600 && (await p.textContent("#gst-cont-descrizione")) === "600", chi + ": la descrizione si ferma a 600");
  await p.fill("#gst-descrizione", "Prima riga.\nSeconda riga.");
  await p.locator('#gst-mappa g.posto[data-k="Platea|A|1"]').click(); await p.locator('#gst-mappa g.posto[data-k="Platea|A|2"]').click();
  E.ok((await p.$$("[data-per]")).length === 2, chi + ": due tocchi, due posti tenuti da parte");
  await p.fill('[data-per="Platea|A|1"]', "Ospite");
  await p.fill("#gst-scrivi", "B5-6, Z9"); await p.press("#gst-scrivi", "Enter");
  E.ok((await p.$$("[data-per]")).length === 4 && /v=nuovo|p=/.test(p.url()), chi + ": «B5-6» scritto + Invio = aggiunti, senza pubblicare");
  await p.locator('#gst-mappa g.posto[data-k="Platea|B|6"]').click();
  E.ok((await p.$$("[data-per]")).length === 3, chi + ": un altro tocco toglie il posto");
  const img = await p.evaluate(async () => { const c = document.createElement("canvas"); c.width = 3000; c.height = 4000; const g = c.getContext("2d");
    g.fillStyle = "#123"; g.fillRect(0, 0, 3000, 4000); g.fillStyle = "#fc0"; g.font = "300px sans-serif"; g.fillText("Prova", 600, 2000);
    const b = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.95)); return Array.from(new Uint8Array(await b.arrayBuffer())); });
  const yPrima = await p.evaluate(() => { document.getElementById("gst-locandina").scrollIntoView({ block: "center" }); return window.scrollY; });
  await p.setInputFiles("#gst-locandina", { name: "locandina.jpg", mimeType: "image/jpeg", buffer: Buffer.from(img) });
  await p.waitForSelector("img.gst-locandina", { timeout: 15000 });
  const yDopo = await p.evaluate(() => window.scrollY);
  E.ok(yPrima > 100 && Math.abs(yDopo - yPrima) < 60, `${chi}: l'anteprima della locandina non riporta in cima (${Math.round(yPrima)} → ${Math.round(yDopo)})`);
  E.ok(await p.$eval('[data-per="Platea|A|1"]', (x) => x.value) === "Ospite", chi + ": il «per chi» resta dopo l'anteprima della locandina");
  E.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), chi + ": niente scorrimento in orizzontale");
  await p.screenshot({ path: `${OUT}/t14-${nm}-${t}-modulo.png`, fullPage: true });
  await p.click("text=Apri le prenotazioni");
  await p.waitForFunction(() => !/v=nuovo|p=/.test(location.search), null, { timeout: 15000 });
  let mio = await rpcO("bgl_organizzatore_mio", {});
  const ev = mio.spettacoli[0], pr = await rpcO("bgl_prenotati", { p_evento_id: ev.id });
  E.ok(ev && ev.pubblicato && ev.slug_breve === "concerto-di-prova-12-marzo" && ev.variante === "V1" && ev.descrizione === "Prima riga.\nSeconda riga.", chi + ": spettacolo pubblicato con la variante e la descrizione");
  E.ok(JSON.stringify([...pr.evento.riservati].sort()) === JSON.stringify(["Platea|A|1", "Platea|A|2", "Platea|B|5"]) && pr.evento.riservati_per["Platea|A|1"] === "Ospite", chi + ": tenuti da parte e «per chi»");
  E.ok(ev.inizio && new Date(ev.inizio).toISOString() === "2027-03-12T20:00:00.000Z" && ev.chiusura === ev.inizio, chi + ": 21:00 di Roma, chiusura all'inizio");
  const loc = await fetch(`${API}/storage/v1/object/public/bgl-locandine/${ev.locandina_path}`);
  E.ok(loc.ok && (await loc.arrayBuffer()).byteLength <= 400 * 1024, chi + ": locandina pubblica e ≤ 400 KB");
  /* Modifica: la foto del server (senza chiavi) non dà falsi «posti doppi»; il titolo cambia, il resto resta */
  await p.goto(sito.url + "/biglietteria/gestione/?v=modifica&id=" + ev.id);
  await p.waitForSelector("#gst-mappa svg", { timeout: 10000 });
  E.ok((await p.$$("#gst-sala .gst-errore")).length === 0 && (await p.$$("[data-per]")).length === 3 && (await p.$("img.gst-locandina")) !== null,
    chi + ": Modifica apre con tenuti, «per chi» e locandina, senza errori sulla sala");
  await p.fill("#gst-titolo", "Concerto di prova (replica)");
  E.ok((await p.inputValue("#gst-slug")) === "concerto-di-prova-12-marzo", chi + ": in Modifica l'indirizzo non si riscrive da solo");
  await p.click("text=Salva le modifiche");
  await p.waitForFunction(() => !/v=modifica/.test(location.search), null, { timeout: 15000 });
  mio = await rpcO("bgl_organizzatore_mio", {});
  const ev2 = mio.spettacoli[0];
  E.ok(ev2.titolo === "Concerto di prova (replica)" && ev2.locandina_path === ev.locandina_path && ev2.variante === "V1" && ev2.pubblicato, chi + ": modifica salvata, resto invariato");
  /* la bozza non compare nella pagina pubblica (lettura pubblica della 0075: la pagina è del task 11) */
  await p.goto(sito.url + "/biglietteria/gestione/?v=nuovo");
  await p.waitForSelector("#gst-progetto");
  await p.selectOption("#gst-progetto", prog); await p.waitForSelector("#gst-mappa svg");
  await p.fill("#gst-titolo", "Bozza segreta"); await p.fill("#gst-data", "2027-04-01"); await p.fill("#gst-ora", "20:00");
  /* errore in parole: titolo vuoto → il campo è segnato e la pagina non parte */
  await p.fill("#gst-titolo", ""); await p.click("text=Salva come bozza");
  await p.waitForSelector(".ha-errore #gst-titolo");
  E.ok(/Scrivi il titolo/.test(await p.textContent(".gst-modulo")) && /Controlla i campi/.test(await p.textContent("#gst-form-err")), chi + ": titolo vuoto detto in parole");
  await p.fill("#gst-titolo", "Bozza segreta");
  await p.click("text=Salva come bozza");
  await p.waitForFunction(() => !/v=nuovo/.test(location.search), null, { timeout: 15000 });
  const pub = (await http("/rest/v1/rpc/bgl_organizzatore_pubblico", { p_slug: ORG }, { key: ANON })).d;
  const titoli = pub.spettacoli.map((s) => s.titolo);
  E.ok(pub.ok && titoli.includes("Concerto di prova (replica)") && !titoli.includes("Bozza segreta"), chi + ": la bozza non si vede in pagina");
  mio = await rpcO("bgl_organizzatore_mio", {});
  E.ok(mio.spettacoli.some((s) => s.titolo === "Bozza segreta" && s.pubblicato === false), chi + ": la bozza c'è, non pubblicata");
  await p.screenshot({ path: `${OUT}/t14-${nm}-${t}-elenco.png`, fullPage: true });
  await br.close();
}
sito.chiudi();
E.ok(errori.length === 0, "nessun errore in console: " + errori.slice(0, 3).join(" | "));
E.fine();
