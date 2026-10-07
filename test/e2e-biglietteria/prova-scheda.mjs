/* Scheda di gestione (task 15): contatori, elenco e ricerca, disdetta per conto di, chiudi/riapri, PDF, CSV, QR,
   modifica, elimina (con la locandina). Chromium e WebKit, telefono e computer. Dati inventati.
   Uso: WT=<worktree> SITO=<copia di prova> OUT=<cartella screenshot> [SOLO="chromium telefono"] node prova-scheda.mjs */
import { chromium, webkit, avviaSito, contesto, http, utente, rpcServizio, TELEFONO, COMPUTER, sorveglia, esito, P, ANON, API } from "./comune.mjs";
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const SITO = process.env.SITO || P + "/sito", OUT = process.env.OUT || P + "/out";
mkdirSync(OUT, { recursive: true });
const E = esito(), errori = [], S = Date.now().toString(36), sito = await avviaSito(SITO);
const posti = []; for (const [i, f] of ["A", "B", "C"].entries()) for (let n = 1; n <= 6; n++) posti.push({ settore: "Platea", fila: f, posto: n, x: 200 + n * 60, y: 1000 + i * 90, w: 50, d: 53, rot: 180 });
const foto = { v: 1, box: [0, 0, 900, 1400], palco: [[[100, 100], [800, 100], [800, 800], [100, 800]]], pedane: [], posti };
const testoDi = (p, sel) => p.$eval(sel, (x) => x.textContent.replace(/\s+/g, " ").trim());
let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) {
  if (process.env.SOLO && process.env.SOLO !== `${nm} ${t}`) continue;
  const chi = `${nm} ${t}`; giro++;
  const org = await utente(`sch-${S}-${giro}@example.invalid`);
  await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
  const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
  await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: "teatro-sch-" + S + "-" + giro } });
  const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala", data: { items: [] } }, { key: ANON, token: org.access_token })).d[0].id;
  /* una locandina qualunque (lo spazio non guarda il contenuto): deve sparire quando si elimina lo spettacolo (D4) */
  const nomeLoc = org.user.id + "/" + "c".repeat(31) + giro + ".jpg";
  const up = await fetch(`${API}/storage/v1/object/bgl-locandine/${nomeLoc}`, { method: "POST",
    headers: { apikey: ANON, Authorization: "Bearer " + org.access_token, "Content-Type": "image/jpeg" }, body: Buffer.alloc(2048, 255) });
  E.ok(up.ok, chi + ": locandina caricata");
  const ev = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog, titolo: "Concerto di prova", inizio: new Date(Date.now() + 72 * 3600e3).toISOString(),
    luogo: "Teatro di prova", pianta: foto, pubblicato: true, riservati: ["Platea|A|1"], riservati_per: { "Platea|A|1": "Ospite" }, locandina_path: nomeLoc } });
  E.ok(ev.ok, chi + ": spettacolo creato " + (ev.ok ? "" : JSON.stringify(ev)));
  for (const [n, c, ps] of [["Mario", "Rossi", ["Platea|B|1", "Platea|B|2"]], ["Álvaro", "Àlvarez", ["Platea|C|3"]], ["Zita", "Bianchi", ["Platea|A|5"]]])
    await rpcServizio("bgl_prenota", { p_slug: ev.slug, p_posti: ps, p_nome: n, p_cognome: c, p_email: `${c.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}-${S}@example.invalid` });
  const br = await motore.launch(), ctx = await contesto(br, tipo, { sessione: org }), p = await ctx.newPage(); sorveglia(p, chi, errori);
  await p.goto(sito.url + "/biglietteria/gestione/?v=scheda&id=" + ev.id);
  await p.waitForSelector(".gst-cont", { timeout: 15000 });
  const conti = await p.$$eval(".gst-cont > div", (ds) => ds.map((d) => d.textContent.replace(/\s+/g, " ").trim()).join(" · "));
  E.ok(conti === "4 prenotati · 13 liberi · 1 tenuti da parte · 18 posti in tutto", chi + ": contatori (" + conti + ")");
  const inVista = await p.$eval("#gst-pianta", (m) => { const a = m.getBoundingClientRect(), b = m.querySelector('g.posto[data-k="Platea|B|3"]').getBoundingClientRect();
    return b.top >= a.top && b.bottom <= a.bottom && b.left >= a.left && b.right <= a.right; });
  E.ok(inVista, chi + ": i posti sono già in vista nella pianta (non solo il palco)");
  E.ok((await p.$$("#gst-elenco li")).length === 3, chi + ": tre prenotazioni nell'elenco");
  await p.fill("#gst-filtro", "alvarez");
  E.ok((await p.$$("#gst-elenco li")).length === 1, chi + ": ricerca senza accenti");
  await p.fill("#gst-filtro", "b 2");
  E.ok((await p.$$("#gst-elenco li")).length === 1 && /Rossi/.test(await testoDi(p, "#gst-elenco")), chi + ": ricerca per posto («b 2»)");
  await p.fill("#gst-filtro", "");
  E.ok(await p.$eval('#gst-pianta g.posto[data-k="Platea|A|1"] title', (x) => x.textContent) === "A 1: Tenuto da parte — Ospite", chi + ": il «per chi» sulla pianta");
  await p.locator('#gst-pianta g.posto[data-k="Platea|B|2"]').click();
  E.ok((await testoDi(p, "#gst-toast")) === "B 2: Rossi Mario", chi + ": toccando un posto si vede di chi è");
  const [csv] = await Promise.all([p.waitForEvent("download"), p.click("text=Elenco (CSV)")]);
  E.ok(/Rossi;Mario;.*;B;1;/.test(readFileSync(await csv.path(), "utf8")), chi + ": CSV");
  const [pdf] = await Promise.all([p.waitForEvent("download"), p.click("text=Lista per l'ingresso (PDF)")]);
  const testoPdf = execFileSync("pdftotext", [await pdf.path(), "-"], { encoding: "utf8" });
  E.ok(/Rossi Mario/.test(testoPdf) && /Tenuto da parte - Ospite|Tenuto da parte — Ospite/.test(testoPdf), chi + ": PDF per cognome e per fila, con il «per chi»");
  const [qr] = await Promise.all([p.waitForEvent("download"), p.click('.gst-link [data-az="qr"]')]);
  E.ok(/^qr-concerto-di-prova-.*\.png$/.test(qr.suggestedFilename()), chi + ": QR dello spettacolo (" + qr.suggestedFilename() + ")");
  E.ok(/\/biglietteria\/teatro-sch-.*\/concerto-di-prova-/.test(await p.getAttribute(".gst-link a", "href")), chi + ": link bello dello spettacolo");
  await p.click('#gst-elenco li:has-text("Bianchi") >> text=Disdici per conto suo');
  E.ok(/nessun avviso/.test(await p.textContent(".gst-dlg")), chi + ": la disdetta dice che non parte nessun avviso");
  await p.click('.gst-dlg [data-r="si"]');
  await p.waitForFunction(() => /^3 prenotati/.test(document.querySelector(".gst-cont").textContent.replace(/\s+/g, " ").trim()), null, { timeout: 15000 });
  E.ok(/Disdetta da te/.test(await testoDi(p, "#gst-elenco")), chi + ": disdetta per conto di, contatori aggiornati, «Disdetta da te» nell'elenco");
  await p.click("text=Chiudi le prenotazioni");
  await p.waitForSelector("text=Riapri le prenotazioni", { timeout: 15000 });
  const pub = await http("/rest/v1/rpc/bgl_evento_pubblico", { p_slug: ev.slug }, { key: ANON, token: ANON });
  E.ok(pub.d.evento.stato === "chiusa", chi + ": il pubblico vede «chiuse»");
  await p.click("text=Riapri le prenotazioni"); await p.waitForSelector("text=Chiudi le prenotazioni", { timeout: 15000 });
  E.ok((await http("/rest/v1/rpc/bgl_evento_pubblico", { p_slug: ev.slug }, { key: ANON, token: ANON })).d.evento.stato === "aperta", chi + ": riaperte");
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${OUT}/t15-${nm}-${t}-scheda.png`, fullPage: true });
  const largo = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  E.ok(largo, chi + ": niente scorrimento orizzontale della pagina");
  await p.click("text=Modifica");
  await p.waitForSelector("#gst-form", { timeout: 15000 });
  E.ok(/v=modifica/.test(p.url()) && (await p.inputValue("#gst-titolo")) === "Concerto di prova", chi + ": Modifica apre il modulo");
  await p.goBack(); await p.waitForSelector(".gst-cont", { timeout: 15000 });
  await p.click("text=Elimina spettacolo");
  const dlg = await p.textContent(".gst-dlg");
  E.ok(/nessun avviso/.test(dlg) && /3 prenotazioni/.test(dlg), chi + ": la conferma dice che nessuno viene avvisato (3 prenotazioni, anche la disdetta)");
  await p.click('.gst-dlg [data-r="si"]');
  await p.waitForSelector(".gst-elenco", { timeout: 15000 });
  E.ok(!/Concerto di prova/.test(await p.textContent(".gst-elenco")), chi + ": eliminato");
  E.ok((await fetch(`${API}/storage/v1/object/public/bgl-locandine/${nomeLoc}`)).status !== 200, chi + ": la locandina è sparita dallo spazio (D4)");
  await br.close();
}
/* bozza: «Apri le prenotazioni» dalla scheda */
{
  const org = await utente(`sch-b-${S}@example.invalid`);
  await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
  const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
  await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: "teatro-sch-b-" + S } });
  const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala", data: { items: [] } }, { key: ANON, token: org.access_token })).d[0].id;
  const ev = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog, titolo: "Bozza di prova", inizio: new Date(Date.now() + 72 * 3600e3).toISOString(),
    luogo: "Teatro di prova", pianta: foto } });
  const br = await chromium.launch(), ctx = await contesto(br, TELEFONO, { sessione: org }), p = await ctx.newPage(); sorveglia(p, "bozza", errori);
  await p.goto(sito.url + "/biglietteria/gestione/?v=scheda&id=" + ev.id);
  await p.waitForSelector(".gst-bozza", { timeout: 15000 });
  E.ok(!(await p.$(".gst-riga-stato")), "bozza: niente chiudi/riapri");
  await p.click('.gst-bozza [data-az="pubblica"]');
  await p.waitForSelector("text=Chiudi le prenotazioni", { timeout: 15000 });
  E.ok(!(await p.$(".gst-bozza")) && (await http("/rest/v1/rpc/bgl_evento_pubblico", { p_slug: ev.slug }, { key: ANON, token: ANON })).d.evento.stato === "aperta", "bozza: «Apri le prenotazioni» la pubblica");
  /* spettacolo di un altro: un messaggio, non una pagina rotta */
  await p.goto(sito.url + "/biglietteria/gestione/?v=scheda&id=00000000-0000-4000-8000-000000000000");
  await p.waitForSelector(".gst-centro", { timeout: 15000 });
  E.ok(/non è tuo, o non esiste più/.test(await p.textContent(".gst-centro")), "spettacolo che non c'è: lo dice");
  await br.close();
}
sito.chiudi();
E.ok(errori.length === 0, "nessun errore in console: " + errori.slice(0, 3).join(" | "));
E.fine();
