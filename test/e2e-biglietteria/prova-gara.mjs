/* Gara per lo stesso posto (T22): due persone, una con Google e una con nome ed email, scelgono gli stessi posti e premono
   «Prenota» nello stesso istante. Una sola vince; l'altra torna alla pianta con un messaggio, i posti persi segnati
   «occupato», e può finire con altri posti. Nessun doppione nel database. Chromium e WebKit, telefono e computer.
   Uso: WT=<worktree> SITO=<copia di prova> OUT=<cartella screenshot> [SOLO="chromium telefono"] node prova-gara.mjs */
import { chromium, webkit, avviaSito, contesto, http, utente, TELEFONO, COMPUTER, sorveglia, esito, P, ANON, WT } from "./comune.mjs";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const PP = createRequire(import.meta.url)(WT + "/biglietteria/pianta-posti.js");
const SITO = process.env.SITO || P + "/sito", OUT = process.env.OUT || P + "/out";
mkdirSync(OUT, { recursive: true });
const E = esito(), errori = [], S = Date.now().toString(36), sito = await avviaSito(SITO);
const items = []; ["A", "B"].forEach((f, r) => { for (let n = 1; n <= 6; n++) items.push({ id: "s" + f + n, type: "sediapubblico", x: 200 + n * 60, y: 1000 + r * 90, rot: 180, w: 50, d: 53, fila: f, posto: n, settore: "Platea" }); });
const doc = { _doc: 1, active: "V1", variants: [{ id: "V1", name: "Platea", state: { _v: 1, items, inputs: [], outputs: [], stage: { w: 1200, d: 800, blocks: [{ x: 100, y: 0, w: 1000, d: 800 }] } } }] };
const googleRimanda = (ctx) => ctx.route("https://accounts.google.com/**", (r) => {
  const u = new URL(r.request().url()), dove = u.searchParams.get("redirect_uri") + "#id_token=finto&state=" + u.searchParams.get("state");
  r.fulfill({ status: 200, contentType: "text/html", body: "<script>location.replace(" + JSON.stringify(dove) + ")</script>" });
});
const ip = (ctx, n) => ctx.route("**/functions/v1/**", (r) => r.continue({ headers: { ...r.request().headers(), "cf-connecting-ip": `10.${(S.length * 13) % 250}.${n}.${Math.floor(Math.random() * 250)}` } }));
async function zoom(p, tipo) { if (tipo === TELEFONO && await p.isVisible("#bgl-zoom") && (await p.getAttribute("#bgl-zoom", "aria-pressed")) !== "true") await p.click("#bgl-zoom"); }
async function tocca(p, k) { const g = p.locator(`#bgl-mappa g.posto[data-k="${k}"]`); await g.scrollIntoViewIfNeeded(); await g.click(); }
let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) {
  const chi = `${nm} ${t}`; if (process.env.SOLO && process.env.SOLO !== chi) continue; giro++;
  const org = await utente(`gara-org-${S}-${giro}@example.invalid`);
  await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
  const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
  const ORG = "teatro-gara-" + S + "-" + giro;
  await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: ORG } });
  const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala", data: doc }, { key: ANON, token: org.access_token })).d[0].id;
  const ev = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog, variante: "V1", titolo: "Concerto della gara", inizio: new Date(Date.now() + 72 * 3600e3).toISOString(),
    luogo: "Teatro di prova", pianta: PP.piantaDaDocumento(doc, "V1"), pubblicato: true } });
  E.ok(ev && ev.ok, chi + ": spettacolo creato " + JSON.stringify(ev && ev.errore));
  const maria = await utente(`gara-maria-${S}-${giro}@example.invalid`, { full_name: "Maria Bianchi" });
  const br = await motore.launch();
  const cG = await contesto(br, tipo, { googleCome: maria }); await googleRimanda(cG); await ip(cG, giro);
  const cN = await contesto(br, tipo, {}); await ip(cN, giro + 50);
  const pG = await cG.newPage(), pN = await cN.newPage(); sorveglia(pG, chi + " Google", errori); sorveglia(pN, chi + " nome", errori);
  const url = `${sito.url}/biglietteria/${ORG}/${ev.slug_breve}`;
  for (const [p, via] of [[pG, "google"], [pN, "nome"]]) {
    await p.goto(url); await p.waitForSelector("#bgl-mappa"); await zoom(p, tipo);
    await tocca(p, "Platea|A|1"); await tocca(p, "Platea|A|2"); await p.click("#bgl-avanti");
    if (via === "google") { await p.waitForSelector("#bgl-google"); await p.click("#bgl-google"); await p.waitForSelector("#bgl-form", { timeout: 15000 }); }
    else { await p.waitForSelector("#bgl-mostra"); await p.click("#bgl-mostra"); await p.waitForSelector("#bgl-form"); await p.fill("#bgl-nome", "Luca"); await p.fill("#bgl-cognome", "Verdi"); await p.fill("#bgl-email", `gara-${S}-${giro}@example.invalid`); }
    await p.check("#bgl-privacy");
  }
  await Promise.all([pG.click("#bgl-prenota"), pN.click("#bgl-prenota")]);
  const esiti = await Promise.all([pG, pN].map((p) => p.waitForFunction(() => document.querySelector("section.conferma") || (document.querySelector("#bgl-mappa") && document.querySelector("#bgl-barra") && !document.querySelector("#bgl-barra").hidden && /occupat|pres[oi]|già/i.test(document.querySelector("#bgl-barra").textContent)), null, { timeout: 20000 })
    .then(async () => ((await p.$("section.conferma")) ? "conferma" : "perso"), () => "niente")));
  for (const [i, p] of [pG, pN].entries()) if (esiti[i] === "niente") await p.screenshot({ path: `${OUT}/t22-gara-${nm}-${t}-niente-${i ? "nome" : "google"}.png`, fullPage: true });
  E.ok(esiti.filter((x) => x === "conferma").length === 1 && esiti.filter((x) => x === "perso").length === 1, chi + ": una vince, l'altra perde con un messaggio (" + esiti.join(", ") + ")");
  const att = (await http(`/rest/v1/bgl_prenotazioni?select=posti,stato&evento_id=eq.${ev.id}&stato=eq.attiva`, null, { method: "GET" })).d;
  E.ok(att.length === 1 && att[0].posti.length === 2, chi + ": nel database UNA prenotazione attiva, nessun doppione (" + att.length + ")");
  const [pV, pP] = esiti[0] === "perso" ? [pN, pG] : [pG, pN];            /* vinto, perso */
  if (esiti.includes("perso")) {
    await pP.screenshot({ path: `${OUT}/t22-gara-${nm}-${t}-perso.png`, fullPage: true });
    const occ = await pP.$$eval('#bgl-mappa g.posto.occupato', (g) => g.map((x) => x.getAttribute("data-k")).sort().join());
    E.ok(occ === "Platea|A|1,Platea|A|2", chi + ": chi ha perso vede i due posti «occupato» (" + occ + ")");
    E.ok(await pP.$$eval("#bgl-mappa g.posto.scelto", (g) => g.length) === 0, chi + ": e nessun posto resta scelto");
    /* può riprovare con altri posti, nello stesso punto */
    await zoom(pP, tipo); await tocca(pP, "Platea|A|5"); await pP.click("#bgl-avanti");
    await pP.waitForSelector("#bgl-form, #bgl-google, #bgl-mostra", { timeout: 15000 });
    if (await pP.$("#bgl-form") === null) { if (await pP.$("#bgl-google") && esiti[0] === "conferma" && pP === pN) { await pP.click("#bgl-mostra"); await pP.waitForSelector("#bgl-form"); } else if (await pP.$("#bgl-google") && pP === pG) { await pP.click("#bgl-google"); await pP.waitForSelector("#bgl-form", { timeout: 15000 }); } }
    await pP.check("#bgl-privacy"); await pP.click("#bgl-prenota");
    await pP.waitForSelector("section.conferma", { timeout: 15000 });
    const tutte = (await http(`/rest/v1/bgl_prenotazioni?select=posti&evento_id=eq.${ev.id}&stato=eq.attiva`, null, { method: "GET" })).d;
    E.ok(tutte.length === 2, chi + ": chi ha perso prenota altri posti e ci riesce");
  }
  await br.close();
}
sito.chiudi();
const veri = errori.filter((x) => !/frame-ancestors/.test(x));
E.ok(veri.length === 0, "nessun errore in console: " + veri.slice(0, 3).join(" | "));
E.fine();
