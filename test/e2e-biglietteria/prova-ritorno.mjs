/* L'area resta aperta, il progetto cambia nell'editor (un'altra scheda), si torna sull'area senza ricaricare: l'area
   deve rileggere il progetto (integrazione dell'ondata E/F: A.progettoDati teneva il progetto in memoria per sempre).
   Scheda: compare «La sala del progetto è cambiata». Sala: «Sposta» da lì riporta alla sala, non alla scheda.
   Elenco: l'avviso sulla riga. Nuovo spettacolo: la pianta della sala scelta è quella di adesso.
   Il ritorno sulla scheda si simula con visibilitychange (hidden → visible). Chromium e WebKit, telefono e computer.
   Uso: WT=<worktree> SITO=<copia di prova> OUT=<cartella screenshot> [SOLO="chromium telefono"] node prova-ritorno.mjs */
import { chromium, webkit, avviaSito, contesto, http, utente, rpcServizio, TELEFONO, COMPUTER, sorveglia, esito, P, ANON, WT } from "./comune.mjs";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const PP = createRequire(import.meta.url)(WT + "/biglietteria/pianta-posti.js");
const SITO = process.env.SITO || P + "/sito", OUT = process.env.OUT || P + "/out";
mkdirSync(OUT, { recursive: true });
const E = esito(), errori = [], S = Date.now().toString(36), sito = await avviaSito(SITO);
function stato(file, { senza = [] } = {}) {
  const items = []; [...file].forEach((f, r) => { for (let n = 1; n <= 6; n++) { if (senza.includes(f + n)) continue;
    items.push({ id: "s" + f + n, type: "sediapubblico", x: 200 + n * 60, y: 1000 + r * 90, rot: 180, w: 50, d: 53, fila: f, posto: n, settore: "Platea" }); } });
  return { _v: 1, items, inputs: [], outputs: [], stage: { w: 1200, d: 800, blocks: [{ x: 100, y: 0, w: 1000, d: 800 }] } };
}
const doc = (st) => ({ _doc: 1, active: "V1", variants: [{ id: "V1", name: "Platea", state: st }] });
/* l'organizzatore va nell'editor e torna: la scheda del browser si nasconde e ricompare */
const viaETorna = (p) => p.evaluate(() => {
  const metti = (v) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => v === "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  metti("hidden"); metti("visible");
  delete document.visibilityState; delete document.hidden;   /* poi di nuovo quelli veri (all'uscita la pagina è «hidden») */
});
let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) {
  if (process.env.SOLO && process.env.SOLO !== `${nm} ${t}`) continue;
  const chi = `${nm} ${t}`; giro++;
  const org = await utente(`rit-${S}-${giro}@example.invalid`);
  await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
  const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
  const progetto = (id, d) => http("/rest/v1/stageplot_projects?id=eq." + id, { data: d }, { key: ANON, token: org.access_token, method: "PATCH" });
  await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: "teatro-rit-" + S + "-" + giro } });
  const prima = doc(stato("ABCD"));
  const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala", data: prima }, { key: ANON, token: org.access_token })).d[0].id;
  const ev = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog, variante: "V1", titolo: "Concerto di prova",
    inizio: new Date(Date.now() + 72 * 3600e3).toISOString(), luogo: "Teatro di prova", pianta: PP.piantaDaDocumento(prima, "V1"), pubblicato: true } });
  E.ok(ev.ok, chi + ": spettacolo creato");
  await rpcServizio("bgl_prenota", { p_slug: ev.slug, p_posti: ["Platea|C|3"], p_nome: "Mario", p_cognome: "Rossi", p_email: `rossi-${S}-${giro}@example.invalid` });
  const prog2 = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala piccola", data: doc(stato("AB")) }, { key: ANON, token: org.access_token })).d[0].id;

  const br = await motore.launch(), ctx = await contesto(br, tipo, { sessione: org }), p = await ctx.newPage(); sorveglia(p, chi, errori);
  /* 1. scheda aperta, sala uguale */
  await p.goto(sito.url + "/biglietteria/gestione/?v=scheda&id=" + ev.id);
  await p.waitForSelector(".gst-cont"); await p.waitForTimeout(1500);
  E.ok(!(await p.$(".gst-sala-avviso")), chi + ": sala uguale, nessun avviso");
  /* nell'editor: fila E nuova, C 3 (di Rossi) tolto */
  await progetto(prog, doc(stato("ABCDE", { senza: ["C3"] })));
  await viaETorna(p);
  E.ok(await p.waitForSelector(".gst-sala-avviso", { timeout: 15000 }).then(() => true, () => false), chi + ": tornando sulla scheda l'avviso compare");
  /* 2. dalla sala, «Sposta» e ritorno alla sala */
  await p.click("text=Vedi cosa è cambiato");
  await p.waitForSelector(".gst-bloccanti");
  await p.click('.gst-bloccanti [data-az="sala-sposta"]');
  await p.waitForSelector("#gst-sposta-mappa svg");
  await p.locator('#gst-sposta-mappa g.posto[data-k="Platea|A|6"]').click();
  await p.uncheck("#gst-avvisa");
  await p.click('[data-az="conferma-sposta"]');
  E.ok(await p.waitForSelector(".gst-riepilogo", { timeout: 15000 }).then(() => true, () => false), chi + ": dopo «Sposta» si torna alla sala");
  E.ok(/v=sala/.test(p.url()), chi + ": l'indirizzo dice sala (" + p.url().replace(sito.url, "") + ")");
  await p.waitForFunction(() => { const b = document.querySelector('[data-az="aggiorna-pianta"]'); return b && !b.disabled; }, null, { timeout: 15000 }).catch(() => {});
  E.ok(await p.$eval('[data-az="aggiorna-pianta"]', (b) => !b.disabled).catch(() => false) && !(await p.$(".gst-bloccanti")), chi + ": nessuno da sistemare, «Aggiorna la pianta» acceso");
  /* nella sala, il progetto cambia di nuovo: tornando, si confronta con la sala di adesso (mai pubblicare quella vecchia) */
  await progetto(prog, doc(stato("ABCDEF", { senza: ["C3"] })));
  await viaETorna(p);
  E.ok(await p.waitForFunction(() => /file E e F nuove/.test((document.querySelector(".gst-riepilogo") || {}).textContent || ""), null, { timeout: 15000 }).then(() => true, () => false),
    chi + ": la sala si riconfronta al ritorno (fila F)");
  await p.click('[data-az="aggiorna-pianta"]');
  await p.waitForSelector(".gst-cont", { timeout: 15000 });
  const pub = await http("/rest/v1/rpc/bgl_evento_pubblico", { p_slug: ev.slug }, { key: ANON, token: ANON });
  E.ok(pub.d.pianta.posti.some((q) => q.fila === "F"), chi + ": il pubblico vede la sala di adesso (con la fila F)");
  /* 3. elenco */
  await p.click('[data-az="tutti"]');
  await p.waitForSelector(`[data-id="${ev.id}"].gst-riga`); await p.waitForTimeout(1500);
  E.ok(!(await p.$(`.gst-avvisi[data-avvisi-di="${ev.id}"] .gst-avviso`)), chi + ": elenco, sala uguale, nessun avviso");
  await progetto(prog, doc(stato("ABCDEFG", { senza: ["C3"] })));
  await viaETorna(p);
  E.ok(await p.waitForSelector(`.gst-avvisi[data-avvisi-di="${ev.id}"] .gst-avviso`, { timeout: 15000 }).then(() => true, () => false), chi + ": tornando sull'elenco l'avviso compare sulla riga");
  /* 4. nuovo spettacolo: la pianta della sala scelta */
  await p.goto(sito.url + "/biglietteria/gestione/?v=nuovo&p=" + prog2);
  await p.waitForFunction(() => document.querySelectorAll("#gst-mappa g.posto").length === 12, null, { timeout: 15000 });
  await p.fill("#gst-titolo", "Concerto nuovo");
  await progetto(prog2, doc(stato("ABC")));
  await viaETorna(p);
  E.ok(await p.waitForFunction(() => document.querySelectorAll("#gst-mappa g.posto").length === 18, null, { timeout: 15000 }).then(() => true, () => false),
    chi + ": nel modulo la pianta è quella di adesso (18 posti)");
  E.ok(await p.inputValue("#gst-titolo") === "Concerto nuovo", chi + ": quello che si era scritto resta");
  await p.screenshot({ path: `${OUT}/ritorno-${nm}-${t}.png`, fullPage: true });
  await br.close();
}
sito.chiudi();
E.ok(errori.length === 0, "nessun errore in console: " + errori.slice(0, 3).join(" | "));
E.fine();
