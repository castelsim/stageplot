/* «Sposta» (task 17) nel browser vero: Chromium e WebKit, telefono e computer. In locale la mail non parte mai: l'area
   deve dirlo («avvisa tu la persona»). Serve la Edge Function bgl-avvisa servita sullo stack locale. Dati inventati.
   Uso: WT=<worktree> SITO=<copia di prova> OUT=<cartella screenshot> [SOLO="chromium telefono"] node prova-sposta.mjs */
import { chromium, webkit, avviaSito, contesto, http, utente, rpcServizio, TELEFONO, COMPUTER, sorveglia, esito, P, ANON } from "./comune.mjs";
import { mkdirSync } from "node:fs";
const SITO = process.env.SITO || P + "/sito", OUT = process.env.OUT || P + "/out";
mkdirSync(OUT, { recursive: true });
const E = esito(), errori = [], S = Date.now().toString(36), sito = await avviaSito(SITO);
const posti = []; for (const [i, f] of ["A", "B", "C"].entries()) for (let n = 1; n <= 6; n++) posti.push({ settore: "Platea", fila: f, posto: n, x: 200 + n * 60, y: 1000 + i * 90, w: 50, d: 53, rot: 180 });
const foto = { v: 1, box: [0, 0, 900, 1400], palco: [[[100, 100], [800, 100], [800, 800], [100, 800]]], pedane: [], posti };
const toast = (p) => p.$eval("#gst-toast", (x) => x.textContent);
let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) {
  if (process.env.SOLO && process.env.SOLO !== `${nm} ${t}`) continue;
  const chi = `${nm} ${t}`; giro++;
  const org = await utente(`spo-${S}-${giro}@example.invalid`);
  await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
  const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
  await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: "teatro-spo-" + S + "-" + giro } });
  const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala", data: { items: [] } }, { key: ANON, token: org.access_token })).d[0].id;
  const ev = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog, titolo: "Concerto di prova", inizio: new Date(Date.now() + 72 * 3600e3).toISOString(),
    luogo: "Teatro di prova", pianta: foto, pubblicato: true, riservati: ["Platea|C|6"] } });
  const r1 = await rpcServizio("bgl_prenota", { p_slug: ev.slug, p_posti: ["Platea|A|5", "Platea|A|6"], p_nome: "Mario", p_cognome: "Rossi", p_email: `rossi-${S}-${giro}@example.invalid` });
  E.ok(r1.ok, chi + ": prenotazione di partenza");
  await rpcServizio("bgl_prenota", { p_slug: ev.slug, p_posti: ["Platea|C|3"], p_nome: "Zita", p_cognome: "Bianchi", p_email: `bianchi-${S}-${giro}@example.invalid` });
  const br = await motore.launch(), ctx = await contesto(br, tipo, { sessione: org }), p = await ctx.newPage(); sorveglia(p, chi, errori);
  await p.goto(sito.url + "/biglietteria/gestione/?v=scheda&id=" + ev.id);
  await p.waitForSelector("#gst-elenco li", { timeout: 15000 });
  await p.click('#gst-elenco li:has-text("Rossi") >> [data-az="sposta"]');
  await p.waitForSelector("#gst-sposta-mappa svg", { timeout: 15000 });
  E.ok(/v=sposta/.test(p.url()) && /Sposta Rossi Mario/.test(await p.textContent("h1")), chi + ": la vista Sposta");
  E.ok(await p.$eval('[data-az="conferma-sposta"]', (b) => b.disabled), chi + ": «Sposta» spento finché non si sceglie");
  E.ok((await p.$$("#gst-sposta-mappa g.posto.attuale")).length === 2 && (await p.$$("#gst-sposta-mappa g.posto.tenuto")).length === 1, chi + ": posti di adesso e tenuto da parte segnati");
  await p.locator('#gst-sposta-mappa g.posto[data-k="Platea|C|3"]').click();
  E.ok(/un'altra persona/.test(await toast(p)), chi + ": il posto di Bianchi non si prende");
  /* gli stessi posti di adesso non sono uno spostamento */
  await p.locator('#gst-sposta-mappa g.posto[data-k="Platea|A|5"]').click();
  await p.locator('#gst-sposta-mappa g.posto[data-k="Platea|A|6"]').click();
  E.ok(await p.$eval('[data-az="conferma-sposta"]', (b) => b.disabled), chi + ": gli stessi posti di adesso: «Sposta» resta spento");
  await p.locator('#gst-sposta-mappa g.posto[data-k="Platea|A|5"]').click();
  await p.locator('#gst-sposta-mappa g.posto[data-k="Platea|A|6"]').click();
  const y0 = await p.evaluate(() => { window.scrollTo(0, 120); return window.scrollY; });
  await p.locator('#gst-sposta-mappa g.posto[data-k="Platea|C|5"]').click();
  await p.locator('#gst-sposta-mappa g.posto[data-k="Platea|C|6"]').click();     // tenuto da parte: si può dare
  E.ok((await p.evaluate(() => window.scrollY)) > 0 || y0 === 0, chi + ": un tocco non riporta la pagina in cima");
  await p.locator('#gst-sposta-mappa g.posto[data-k="Platea|B|4"]').click();
  E.ok(/Hai già scelto 2 posti/.test(await toast(p)), chi + ": non più posti di adesso");
  E.ok((await p.textContent("#gst-sposta-stato")) === "A 5, A 6 → C 5, C 6", chi + ": la frase");
  E.ok(await p.isChecked("#gst-avvisa"), chi + ": «Avvisa per mail» proposto");
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${OUT}/t17-${nm}-${t}-sposta.png`, fullPage: true });
  await p.click('[data-az="conferma-sposta"]');
  await p.waitForSelector(".gst-cont", { timeout: 15000 });
  const fin = await p.waitForFunction(() => /partita/.test(document.getElementById("gst-toast").textContent), null, { timeout: 30000 }).then(() => true, () => false);
  E.ok(fin && /Spostato: A 5, A 6 → C 5, C 6\. La mail non è partita/.test(await toast(p)), chi + ": spostato, e in locale la mail non parte (lo dice: " + await toast(p) + ")");
  const pub = await http("/rest/v1/rpc/bgl_evento_pubblico", { p_slug: ev.slug }, { key: ANON, token: ANON });
  E.ok(JSON.stringify([...pub.d.occupati].sort()) === JSON.stringify(["Platea|C|3", "Platea|C|5", "Platea|C|6"]) && !pub.d.riservati.includes("Platea|C|6"), chi + ": posti nuovi occupati, C 6 non più tenuto");
  /* senza avviso: nessuna frase sulla mail */
  await p.click('#gst-elenco li:has-text("Bianchi") >> [data-az="sposta"]');
  await p.waitForSelector("#gst-sposta-mappa svg", { timeout: 15000 });
  await p.uncheck("#gst-avvisa");
  await p.locator('#gst-sposta-mappa g.posto[data-k="Platea|B|6"]').click();
  await p.click('[data-az="conferma-sposta"]');
  await p.waitForSelector(".gst-cont", { timeout: 15000 });
  E.ok((await toast(p)) === "Spostato: C 3 → B 6.", chi + ": senza «Avvisa per mail» nessuna frase sulla mail (" + await toast(p) + ")");
  E.ok(/B 6 · codice/.test(await p.textContent('#gst-elenco li:has-text("Bianchi")')), chi + ": la scheda mostra il posto nuovo");
  await br.close();
}
sito.chiudi();
E.ok(errori.length === 0, "nessun errore in console: " + errori.slice(0, 3).join(" | "));
E.fine();
