/* RF5 nel browser vero (T22): ora legale e fuso del dispositivo. Il telefono dell'organizzatore e quello del pubblico
   possono essere in un fuso qualunque: date e ore restano SEMPRE quelle di Roma (specifica area, vincoli globali).
   Casi: la sera del cambio d'ora (25/10/2026 21:00, inizio 20:00 UTC) e mezzanotte e mezza del 1° gennaio
   (01/01/2027 00:30 Roma = 31/12/2026 23:30 UTC: l'indirizzo proposto deve finire in «-1-gennaio», non «-31-dicembre»).
   Dispositivo a Los Angeles (Chromium computer) e a Tokyo (WebKit telefono). Dati inventati, Google non serve.
   Uso: WT=<worktree> SITO=<copia di prova> OUT=<cartella screenshot> [SOLO="America/Los_Angeles"] node prova-fuso.mjs */
import { chromium, webkit, avviaSito, contesto, http, utente, TELEFONO, COMPUTER, sorveglia, esito, P, ANON } from "./comune.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const SITO = process.env.SITO || P + "/sito", OUT = process.env.OUT || P + "/out";
mkdirSync(OUT, { recursive: true });
const E = esito(), errori = [], S = Date.now().toString(36), sito = await avviaSito(SITO);
const doc = (() => { const items = []; ["A", "B"].forEach((f, r) => { for (let n = 1; n <= 6; n++) items.push({ id: "s" + f + n, type: "sediapubblico", x: 200 + n * 60, y: 1000 + r * 90, rot: 180, w: 50, d: 53, fila: f, posto: n, settore: "Platea" }); });
  return { _doc: 1, active: "V1", variants: [{ id: "V1", name: "Platea", state: { _v: 1, items, inputs: [], outputs: [], stage: { w: 1200, d: 800, blocks: [{ x: 100, y: 0, w: 1000, d: 800 }] } } }] }; })();
const casi = [
  { titolo: "Serata del cambio d'ora", data: "2026-10-25", ora: "21:00", utc: "2026-10-25T20:00:00.000Z", slug: "serata-del-cambio-d-ora-25-ottobre", giorno: /25 ottobre/, ics: "20261025T200000Z" },
  { titolo: "Capodanno lungo", data: "2027-01-01", ora: "00:30", utc: "2026-12-31T23:30:00.000Z", slug: "capodanno-lungo-1-gennaio", giorno: /1 gennaio/, ics: "20261231T233000Z" },
];
let giro = 0;
for (const [nm, motore, t, tipo, fuso] of [["chromium", chromium, "computer", COMPUTER, "America/Los_Angeles"], ["webkit", webkit, "telefono", TELEFONO, "Asia/Tokyo"]]) {
  if (process.env.SOLO && process.env.SOLO !== fuso) continue;
  const chi = `${nm} ${t} (${fuso})`; giro++;
  const org = await utente(`fuso-${S}-${giro}@example.invalid`);
  await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
  const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
  const ORG = "teatro-fuso-" + S + "-" + giro;
  await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: ORG } });
  const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala", data: doc }, { key: ANON, token: org.access_token })).d[0].id;
  const br = await motore.launch();
  const dev = { ...tipo, timezoneId: fuso };                                    /* il fuso del dispositivo, non quello di Roma */
  const ctx = await contesto(br, dev, { sessione: org }), p = await ctx.newPage(); sorveglia(p, chi, errori);
  E.ok(await p.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone) === fuso, chi + ": il dispositivo è davvero in quel fuso");
  for (const c of casi) {
    await p.goto(sito.url + "/biglietteria/gestione/?v=nuovo&p=" + prog);
    await p.waitForSelector("#gst-mappa svg");
    await p.fill("#gst-titolo", c.titolo); await p.fill("#gst-data", c.data); await p.fill("#gst-ora", c.ora); await p.fill("#gst-luogo", "Teatro di prova");
    E.ok((await p.inputValue("#gst-slug")) === c.slug, `${chi}: indirizzo proposto «${await p.inputValue("#gst-slug")}» (atteso ${c.slug})`);
    await p.click("text=Apri le prenotazioni");
    await p.waitForSelector(".gst-cont", { timeout: 20000 });
    const mio = await rpcO("bgl_organizzatore_mio", {}), ev = mio.spettacoli.find((s) => s.titolo === c.titolo);
    E.ok(ev && new Date(ev.inizio).toISOString() === c.utc, `${chi}: ${c.data} ${c.ora} di Roma salvato come ${ev && new Date(ev.inizio).toISOString()} (atteso ${c.utc})`);
    E.ok(ev && new Date(ev.chiusura).toISOString() === c.utc, chi + ": chiusura predefinita = inizio");
    /* la scheda di gestione e il modulo di modifica dicono ancora l'ora di Roma */
    const testa = await p.textContent(".gst-testa, main");
    E.ok(c.giorno.test(testa) && new RegExp(c.ora.replace(":", "[:.]")).test(testa), `${chi}: scheda di gestione con ${c.ora} e il giorno giusto`);
    await p.goto(sito.url + "/biglietteria/gestione/?v=modifica&id=" + ev.id); await p.waitForSelector("#gst-form");
    E.ok((await p.inputValue("#gst-data")) === c.data && (await p.inputValue("#gst-ora")) === c.ora, `${chi}: Modifica riapre con ${c.data} ${c.ora} (${await p.inputValue("#gst-data")} ${await p.inputValue("#gst-ora")})`);
    /* il pubblico, sempre dal dispositivo in quel fuso */
    const cp = await contesto(br, dev, {}), pp = await cp.newPage(); sorveglia(pp, chi + " pubblico", errori);
    await pp.goto(sito.url + "/biglietteria/" + ORG + "/" + ev.slug_breve); await pp.waitForSelector("#bgl-mappa");
    const pag = await pp.textContent("main");
    E.ok(c.giorno.test(pag) && new RegExp(c.ora.replace(":", "[:.]")).test(pag), `${chi}: la scheda pubblica dice ${c.ora} e il giorno di Roma`);
    const cal = await pp.getAttribute(".ev-cal a", "href");
    E.ok(cal.includes("dates=" + c.ics + "/"), `${chi}: Google Calendar ${(cal.match(/dates=[^&]*/) || [""])[0]}`);
    const [dl] = await Promise.all([pp.waitForEvent("download"), pp.click("#bgl-ics")]);
    E.ok(readFileSync(await dl.path(), "utf8").includes("DTSTART:" + c.ics), chi + ": .ics con DTSTART " + c.ics);
    await pp.screenshot({ path: `${OUT}/t22-fuso-${nm}-${t}-${c.slug}.png`, fullPage: true });
    await cp.close();
  }
  await p.goto(sito.url + "/biglietteria/gestione/"); await p.waitForSelector(".gst-righe");
  const el = await p.textContent(".gst-righe");
  E.ok(/21:00/.test(el) && /00:30|0:30/.test(el), chi + ": nell'elenco 21:00 e 00:30");
  await br.close();
}
sito.chiudi();
E.ok(errori.length === 0, "nessun errore in console: " + errori.slice(0, 3).join(" | "));
E.fine();
