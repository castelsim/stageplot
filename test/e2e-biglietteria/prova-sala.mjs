/* «La sala del progetto è cambiata» (task 16) nel browser vero. La foto pubblicata si calcola con la STESSA
   biglietteria/pianta-posti.js del worktree; poi si cambia il progetto (fila E nuova, fila B spostata, C3 tolto con una
   prenotazione sopra) e si guarda cosa dice l'area. In più D8: uno spettacolo «dell'editor» (variante nulla) in un
   progetto con due varianti, una uguale → nessun avviso e variante adottata; e RF2: progetto eliminato. Chromium e
   WebKit, telefono e computer. Dati inventati.
   Uso: WT=<worktree> SITO=<copia di prova> OUT=<cartella screenshot> [SOLO="chromium telefono"] node prova-sala.mjs */
import { chromium, webkit, avviaSito, contesto, http, utente, rpcServizio, TELEFONO, COMPUTER, sorveglia, esito, P, ANON, WT } from "./comune.mjs";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const PP = createRequire(import.meta.url)(WT + "/biglietteria/pianta-posti.js");
const SITO = process.env.SITO || P + "/sito", OUT = process.env.OUT || P + "/out";
mkdirSync(OUT, { recursive: true });
const E = esito(), errori = [], S = Date.now().toString(36), sito = await avviaSito(SITO);
function stato(file, { sposta = null, senza = [] } = {}) {
  const items = []; [...file].forEach((f, r) => { for (let n = 1; n <= 6; n++) { if (senza.includes(f + n)) continue;
    items.push({ id: "s" + f + n, type: "sediapubblico", x: 200 + n * 60 + (f === sposta ? 60 : 0), y: 1000 + r * 90, rot: 180, w: 50, d: 53, fila: f, posto: n, settore: "Platea" }); } });
  return { _v: 1, items, inputs: [], outputs: [], stage: { w: 1200, d: 800, blocks: [{ x: 100, y: 0, w: 1000, d: 800 }] } };
}
let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) {
  if (process.env.SOLO && process.env.SOLO !== `${nm} ${t}`) continue;
  const chi = `${nm} ${t}`; giro++;
  const org = await utente(`sala-${S}-${giro}@example.invalid`);
  await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
  const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
  await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: "teatro-sala-" + S + "-" + giro } });
  const prima = { _doc: 1, active: "V1", variants: [{ id: "V1", name: "Platea", state: stato("ABCD") }] };
  const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala", data: prima }, { key: ANON, token: org.access_token })).d[0].id;
  const ev = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog, variante: "V1", titolo: "Concerto di prova",
    inizio: new Date(Date.now() + 72 * 3600e3).toISOString(), luogo: "Teatro di prova", pianta: PP.piantaDaDocumento(prima, "V1"), pubblicato: true,
    riservati: ["Platea|C|5", "Platea|A|1"] } });
  E.ok(ev.ok, chi + ": spettacolo creato");
  await rpcServizio("bgl_prenota", { p_slug: ev.slug, p_posti: ["Platea|C|3"], p_nome: "Mario", p_cognome: "Rossi", p_email: `rossi-${S}-${giro}@example.invalid` });
  /* D8: spettacolo «dell'editor» (variante nulla) pubblicato quando era attiva la V2; ora il progetto ha due varianti e l'attiva è la V1 */
  const due = { _doc: 1, active: "V1", variants: [{ id: "V1", name: "Piccola", state: stato("AB") }, { id: "V2", name: "Grande", state: stato("ABCD") }] };
  const prog2 = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Due varianti", data: due }, { key: ANON, token: org.access_token })).d[0].id;
  const vecchio = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog2, titolo: "Dall'editor", inizio: new Date(Date.now() + 96 * 3600e3).toISOString(),
    luogo: "Teatro di prova", pianta: PP.piantaDaDocumento(due, "V2"), pubblicato: true } });
  /* RF2: un terzo spettacolo il cui progetto viene eliminato (cestino) */
  const prog3 = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Da buttare", data: prima }, { key: ANON, token: org.access_token })).d[0].id;
  const orfano = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog3, variante: "V1", titolo: "Senza progetto", inizio: new Date(Date.now() + 120 * 3600e3).toISOString(),
    luogo: "Teatro di prova", pianta: PP.piantaDaDocumento(prima, "V1"), pubblicato: true } });
  await http("/rest/v1/stageplot_projects?id=eq." + prog3, { deleted_at: new Date().toISOString() }, { key: ANON, token: org.access_token, method: "PATCH" });
  /* il progetto cambia nell'editor */
  const dopo = { _doc: 1, active: "V1", variants: [{ id: "V1", name: "Platea", state: stato("ABCDE", { sposta: "B", senza: ["C3", "C5"] }) }] };
  await http("/rest/v1/stageplot_projects?id=eq." + prog, { data: dopo }, { key: ANON, token: org.access_token, method: "PATCH" });
  const br = await motore.launch(), ctx = await contesto(br, tipo, { sessione: org }), p = await ctx.newPage(); sorveglia(p, chi, errori);
  await p.goto(sito.url + "/biglietteria/gestione/");
  await p.waitForSelector(`.gst-avvisi[data-avvisi-di="${ev.id}"] .gst-avviso`, { timeout: 15000 });
  E.ok(true, chi + ": «La sala del progetto è cambiata» sulla riga");
  await p.waitForTimeout(1500);
  E.ok(!(await p.$(`.gst-avvisi[data-avvisi-di="${vecchio.id}"] .gst-avviso`)), chi + ": D8, lo spettacolo dell'editor non ha l'avviso");
  E.ok(!(await p.$(`.gst-avvisi[data-avvisi-di="${orfano.id}"] .gst-avviso`)), chi + ": RF2, progetto eliminato: nessun «cambiata» sulla riga");
  const v2 = (await rpcO("bgl_organizzatore_mio", {})).spettacoli.find((e) => e.id === vecchio.id).variante;
  E.ok(v2 === "V2", chi + ": D8, la variante uguale è stata adottata (" + v2 + ")");
  await p.click(`[data-id="${orfano.id}"].gst-riga`);
  await p.waitForSelector(`.gst-avvisi-scheda .nota`, { timeout: 15000 });
  E.ok(/progetto della sala non c'è più/.test(await p.textContent(".gst-avvisi-scheda")) && (await p.$$("#gst-pianta g.posto")).length === 24, chi + ": RF2, lo dice e la pianta pubblicata resta");
  await p.goBack(); await p.waitForSelector(`[data-id="${ev.id}"].gst-riga`, { timeout: 15000 });
  await p.click(`[data-id="${ev.id}"].gst-riga`);
  await p.waitForSelector(".gst-sala-avviso", { timeout: 15000 });
  await p.click("text=Vedi cosa è cambiato");
  await p.waitForSelector(".gst-riepilogo");
  const riep = await p.textContent(".gst-riepilogo");
  E.ok(riep === "6 posti spostati · 6 posti in più · 2 posti in meno · fila E nuova · 1 posto prenotato coinvolto", chi + ": riepilogo in parole (" + riep + ")");
  E.ok(/Rossi Mario — C 3: questo posto non c'è più/.test(await p.textContent(".gst-bloccanti")) && await p.$eval('[data-az="aggiorna-pianta"]', (b) => b.disabled), chi + ": prima si sistema Rossi");
  E.ok(/Tenuti da parte che non ci saranno più: C 5/.test(await p.textContent(".gst-sala")), chi + ": il tenuto da parte C 5 che sparisce si dice");
  E.ok((await p.$$("#gst-nuova g.posto.cambio-nuovo")).length === 6 && (await p.$$("#gst-foto g.posto.cambio-tolto")).length === 2, chi + ": posti evidenziati");
  const inVista = await p.$eval("#gst-nuova", (m) => { const a = m.getBoundingClientRect(), b = m.querySelector('g.posto[data-k="Platea|A|3"]').getBoundingClientRect();
    return b.top >= a.top && b.bottom <= a.bottom; });
  E.ok(inVista, chi + ": nelle piante i posti sono in vista");
  E.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), chi + ": niente scorrimento orizzontale");
  await p.screenshot({ path: `${OUT}/t16-${nm}-${t}-sala.png`, fullPage: true });
  await p.click('.gst-bloccanti [data-az="sala-disdici"]'); await p.click('.gst-dlg [data-r="si"]');
  await p.waitForFunction(() => { const b = document.querySelector('[data-az="aggiorna-pianta"]'); return b && !b.disabled; }, null, { timeout: 15000 });
  E.ok(!(await p.$(".gst-bloccanti")), chi + ": dopo la disdetta niente persone da sistemare");
  await p.click('[data-az="aggiorna-pianta"]');
  await p.waitForSelector(".gst-cont", { timeout: 15000 });
  const pub = await http("/rest/v1/rpc/bgl_evento_pubblico", { p_slug: ev.slug }, { key: ANON, token: ANON });
  E.ok(pub.d.pianta.posti.some((q) => q.fila === "E") && !pub.d.pianta.posti.some((q) => q.k === "Platea|C|3"), chi + ": il pubblico vede la sala nuova");
  E.ok(JSON.stringify(pub.d.riservati) === JSON.stringify(["Platea|A|1"]), chi + ": resta tenuto da parte solo A 1 (" + JSON.stringify(pub.d.riservati) + ")");
  await p.waitForTimeout(1500);
  E.ok(!(await p.$(".gst-sala-avviso")), chi + ": dopo l'aggiornamento niente avviso");
  await br.close();
}
sito.chiudi();
E.ok(errori.length === 0, "nessun errore in console: " + errori.slice(0, 3).join(" | "));
E.fine();
