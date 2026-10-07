/* Il viaggio completo (specifica area §9, T22): una sola storia, dall'organizzatore al pubblico e ritorno, su stack locale,
   Google FINTO, rete esterna bloccata, dati inventati (@example.invalid). Prima di tutto uno spettacolo «della prima
   versione» (aperto con bgl_apri, senza indirizzo breve né pagina dell'organizzatore: come le righe nate con 0072/0073).
     1. pubblico: il vecchio ?e= funziona, ci si prenota (nome ed email), il link ?e=&c= della prenotazione funziona
     2. organizzatore: prima volta (contatto precompilato, indirizzo che si blocca) → lo spettacolo vecchio entra da solo
        nell'area, SENZA l'avviso «la sala è cambiata» (D8) → nuovo spettacolo con locandina → apre
     3. pubblico: pagina dell'organizzatore dalla scorciatoia (con maiuscole e barra) → scheda → Google finto → prenota →
        Le mie prenotazioni; e un altro senza Google; il vecchio ?e= e il link ?e=&c= funzionano ancora
     4. organizzatore: vede le prenotazioni → Sposta → la sala cambia nell'editor → avviso → «Aggiorna la pianta»
     5. pubblico: vede la sala nuova; Maria disdice da «Le mie prenotazioni»
     6. organizzatore: elimina lo spettacolo con prenotazioni (nessuna mail, la conferma lo dice); il vecchio resta
   Uso: WT=<worktree> SITO=<copia di prova> OUT=<cartella screenshot> [INVERTI=1] [TEMA=scuro] [SOLO="chromium"] node e2e-viaggio.mjs
   INVERTI=1: pubblico su computer Chromium e organizzatore su telefono WebKit (invece di Chromium computer / WebKit telefono).
   Se un passo fallisce: screenshot di entrambe le schede in OUT (t22-FALLITO-…png) e la storia si ferma lì. */
import { chromium, webkit, avviaSito, contesto, http, rpcServizio, utente, TELEFONO, COMPUTER, sorveglia, esito, P, ANON, API, WT } from "./comune.mjs";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
const PP = createRequire(import.meta.url)(WT + "/biglietteria/pianta-posti.js");
const SITO = process.env.SITO || P + "/sito", OUT = process.env.OUT || P + "/out";
mkdirSync(OUT, { recursive: true });
const E = esito(), errori = [], S = Date.now().toString(36), sito = await avviaSito(SITO);
const inv = process.env.INVERTI === "1", scuro = process.env.TEMA === "scuro", sfx = (inv ? "-inv" : "") + (scuro ? "-scuro" : "");
const [mOrg, tOrg, mPub, tPub] = inv ? [webkit, TELEFONO, chromium, COMPUTER] : [chromium, COMPUTER, webkit, TELEFONO];
const nOrg = (mOrg === chromium ? "chromium " : "webkit ") + (tOrg === TELEFONO ? "telefono" : "computer");
const nPub = (mPub === chromium ? "chromium " : "webkit ") + (tPub === TELEFONO ? "telefono" : "computer");
const colore = scuro ? { colorScheme: "dark" } : {};
const ORG = "teatro-viaggio-" + S;

/* ---------- dati di partenza ---------- */
const org = await utente(`viaggio-org-${S}@example.invalid`);
const maria = await utente(`viaggio-maria-${S}@example.invalid`, { full_name: "Maria Bianchi", name: "Maria Bianchi" });
await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
const tok = { key: ANON, token: org.access_token };
const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, tok).then((r) => r.d);
function stato(righe, { senza = [] } = {}) {
  const items = []; [...righe].forEach((f, r) => { for (let n = 1; n <= 8; n++) { if (senza.includes(f + n)) continue;
    items.push({ id: "s" + f + n, type: "sediapubblico", x: 200 + n * 60, y: 1000 + r * 90, rot: 180, w: 50, d: 53, fila: f, posto: n, settore: "Platea" }); } });
  return { _v: 1, items, inputs: [], outputs: [], stage: { w: 1200, d: 800, blocks: [{ x: 100, y: 0, w: 1000, d: 800 }] } };
}
const doc = (st) => ({ _doc: 1, active: "V1", variants: [{ id: "V1", name: "Platea", state: st }] });
const progetto = (id, d) => http("/rest/v1/stageplot_projects?id=eq." + id, { data: d }, { ...tok, method: "PATCH" });
const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala del viaggio", data: doc(stato("ABCD")) }, tok)).d[0].id;
/* lo spettacolo della prima versione: la sua pianta è quella che l'editor ricava dal progetto (come bgl_apri dal pannello) */
const vecchio = (await http("/rest/v1/rpc/bgl_apri", { p_project_id: prog, p_evento: { titolo: "Prima versione", inizio: new Date(Date.now() + 200 * 3600e3).toISOString(),
  luogo: "Teatro di prova", riservati: [], pianta: PP.piantaDaDocumento(doc(stato("ABCD")), "V1") } }, tok)).d;
E.ok(vecchio && vecchio.ok, "spettacolo della prima versione aperto con bgl_apri " + JSON.stringify(vecchio && vecchio.errore));
const riga0 = (await http(`/rest/v1/bgl_eventi?select=id,slug,slug_breve,pubblicato&slug=eq.${vecchio.slug}`, null, { method: "GET" })).d[0];
E.ok(riga0 && riga0.slug_breve === null && riga0.pubblicato === true, "come le righe di 0072/0073: senza indirizzo breve, aperto (" + JSON.stringify(riga0) + ")");

/* ---------- attrezzi ---------- */
const sfora = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const foto = (p, nome) => p.screenshot({ path: `${OUT}/t22-${nome}${sfx}.png`, fullPage: true });
async function zoom(p, tipo) { if (tipo === TELEFONO && await p.isVisible("#bgl-zoom") && (await p.getAttribute("#bgl-zoom", "aria-pressed")) !== "true") await p.click("#bgl-zoom"); }
async function tocca(p, k) { const g = p.locator(`#bgl-mappa g.posto[data-k="${k}"]`); await g.scrollIntoViewIfNeeded(); await g.click(); }
/* un «indirizzo» tutto suo per i limiti di bgl-prenota (come in prova-google) */
const ip = (ctx, n) => ctx.route("**/functions/v1/**", (r) => r.continue({ headers: { ...r.request().headers(), "cf-connecting-ip": `10.${(S.length * 11) % 250}.${n}.${Math.floor(Math.random() * 250)}` } }));
/* Google finto: una pagina che rimanda (WebKit non accetta il 302 di route.fulfill) */
const googleRimanda = (ctx) => ctx.route("https://accounts.google.com/**", (r) => {
  const u = new URL(r.request().url()), dove = u.searchParams.get("redirect_uri") + "#id_token=finto&state=" + u.searchParams.get("state");
  r.fulfill({ status: 200, contentType: "text/html", body: "<script>location.replace(" + JSON.stringify(dove) + ")</script>" });
});
const jpegGrande = async (p) => Buffer.from(await p.evaluate(async () => { const c = document.createElement("canvas"); c.width = 3000; c.height = 4000; const g = c.getContext("2d");
  g.fillStyle = "#123"; g.fillRect(0, 0, 3000, 4000); g.fillStyle = "#fc0"; g.font = "300px sans-serif"; g.fillText("Viaggio", 500, 2000);
  const b = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.95)); return Array.from(new Uint8Array(await b.arrayBuffer())); }));
let po = null, pp = null, passoCorrente = "";
async function passo(nome, fn) {
  passoCorrente = nome; console.log("— " + nome);
  try { await fn(); } catch (e) {
    E.ok(false, `PASSO FALLITO «${nome}»: ${String(e.message || e).split("\n")[0]}`);
    for (const [p, c] of [[po, "org"], [pp, "pub"]]) if (p) await p.screenshot({ path: `${OUT}/t22-FALLITO-${c}${sfx}.png`, fullPage: true }).catch(() => {});
    await chiudi(); E.fine();
  }
}
const bo = await mOrg.launch(), bp = await mPub.launch();
async function chiudi() { await bo.close().catch(() => {}); await bp.close().catch(() => {}); sito.chiudi(); }
const veri = () => errori.filter((x) => !/frame-ancestors/.test(x));

/* ---------- 1. pubblico: il vecchio ?e= e la prenotazione di sempre ---------- */
let tokenVecchio, ctxPub, ev;
await passo("1. link ?e= della prima versione: pagina, prenotazione con nome ed email, link della prenotazione", async () => {
  ctxPub = await contesto(bp, { ...tPub, ...colore }, { googleCome: maria }); await googleRimanda(ctxPub); await ip(ctxPub, 1);
  pp = await ctxPub.newPage(); sorveglia(pp, nPub, errori);
  await pp.goto(sito.url + "/biglietteria/?e=" + vecchio.slug);
  await pp.waitForSelector("#bgl-mappa");
  E.ok(/Prima versione/.test(await pp.textContent("h1")), nPub + ": il ?e= della prima versione funziona");
  await zoom(pp, tPub); await tocca(pp, "Platea|D|7"); await pp.click("#bgl-avanti");
  await pp.waitForSelector("#bgl-mostra"); await pp.click("#bgl-mostra");
  await pp.waitForSelector("#bgl-form");
  await pp.fill("#bgl-nome", "Anna"); await pp.fill("#bgl-cognome", "Neri"); await pp.fill("#bgl-email", `neri-${S}@example.invalid`);
  await pp.check("#bgl-privacy"); await pp.click("#bgl-prenota");
  await pp.waitForSelector("section.conferma", { timeout: 15000 });
  const r = (await http(`/rest/v1/bgl_prenotazioni?select=user_id&email_norm=eq.neri-${S}@example.invalid`, null, { method: "GET" })).d;
  E.ok(r.length === 1 && r[0].user_id === null, nPub + ": prenotazione senza account (vecchia strada)");
  /* il link della propria prenotazione è quello di «Disdici e libera i posti»: se ne tiene la parte dopo il ? */
  const dis = new URL(await pp.getAttribute(".disdici-riga a", "href"), sito.url);
  E.ok(dis.searchParams.get("e") === vecchio.slug && dis.searchParams.get("c"), nPub + ": la conferma dà il link ?e=&c= della prenotazione");
  tokenVecchio = dis.searchParams.get("c");
  await pp.goto(sito.url + "/biglietteria/?e=" + vecchio.slug + "&c=" + tokenVecchio);
  await pp.waitForSelector(".mia");
  E.ok(await pp.$("#bgl-ics") !== null, nPub + ": il link ?e=&c= della prenotazione mostra «la tua prenotazione»");
  await foto(pp, "01-vecchio-link");
});

/* ---------- 2. organizzatore: prima volta, nuovo spettacolo ---------- */
await passo("2. organizzatore: prima volta, nuovo spettacolo con locandina, apre le prenotazioni", async () => {
  const co = await contesto(bo, { ...tOrg, ...colore }, { sessione: org }); po = await co.newPage(); sorveglia(po, nOrg, errori);
  await po.goto(sito.url + "/biglietteria/gestione/?p=" + prog);
  await po.waitForSelector("#gst-pv");
  E.ok((await po.inputValue("#gst-contatto")) === org.user.email && /info@/.test(await po.textContent("#gst-c-contatto")), nOrg + ": contatto precompilato, con l'aiuto su info@ (decisione 3)");
  E.ok((await po.$("#gst-slug-fisso")) !== null, nOrg + ": con uno spettacolo già aperto l'indirizzo «resta fisso» (decisione 1)");
  await po.fill("#gst-nome", "Teatro del Viaggio");
  await po.fill("#gst-slug", ORG);
  await po.waitForFunction(() => /— libero$/.test(document.getElementById("gst-slug-stato").textContent), null, { timeout: 8000 });
  await foto(po, "02-prima-volta");
  await po.click("#gst-pv button[type=submit]");
  await po.waitForSelector(".gst-elenco", { timeout: 15000 });
  E.ok(/Prima versione/.test(await po.textContent(".gst-righe")) && /aperte/.test(await po.textContent(".gst-righe")), nOrg + ": lo spettacolo della prima versione è entrato nell'area da solo");
  const mio = await rpcO("bgl_organizzatore_mio", {});
  const v = mio.spettacoli.find((s) => s.slug === vecchio.slug);
  E.ok(v && /^prima-versione-\d{1,2}-[a-z]+$/.test(v.slug_breve || ""), nOrg + ": riceve il suo indirizzo breve (" + (v && v.slug_breve) + ")");
  E.ok(await sfora(po) <= 0, nOrg + ": elenco senza scorrimento in orizzontale");
  await foto(po, "03-elenco");
  /* D8: la scheda del vecchio spettacolo non dice «la sala è cambiata» (la foto è uguale al progetto) */
  await po.goto(sito.url + "/biglietteria/gestione/?v=scheda&id=" + v.id);
  await po.waitForSelector(".gst-cont"); await po.waitForTimeout(1500);
  E.ok(!(await po.$(".gst-sala-avviso")), nOrg + ": la scheda del vecchio spettacolo non grida «la sala è cambiata» (D8, RF1)");
  const [qr] = await Promise.all([po.waitForEvent("download"), po.click('.gst-link [data-az="qr"]')]);
  E.ok(readFileSync(await qr.path()).subarray(1, 4).toString() === "PNG", nOrg + ": QR della scheda del vecchio spettacolo");
  E.ok((await po.getAttribute(".gst-link a", "href")).endsWith("/biglietteria/" + ORG + "/" + v.slug_breve), nOrg + ": il link che l'area dà usa la scorciatoia");
  /* nuovo spettacolo */
  await po.goto(sito.url + "/biglietteria/gestione/?v=nuovo&p=" + prog);
  await po.waitForSelector("#gst-mappa svg");
  await po.fill("#gst-titolo", "Concerto del viaggio"); await po.fill("#gst-data", "2027-02-12"); await po.fill("#gst-ora", "21:00"); await po.fill("#gst-luogo", "Teatro di prova, Città");
  await po.fill("#gst-note", "Porte alle 20:30"); await po.fill("#gst-descrizione", "Prima riga.\nSeconda riga.");
  E.ok((await po.inputValue("#gst-slug")) === "concerto-del-viaggio-12-febbraio", nOrg + ": indirizzo proposto da titolo e data");
  await po.locator('#gst-mappa g.posto[data-k="Platea|A|1"]').click(); await po.locator('#gst-mappa g.posto[data-k="Platea|A|2"]').click();
  await po.setInputFiles("#gst-locandina", { name: "locandina.jpg", mimeType: "image/jpeg", buffer: await jpegGrande(po) });
  await po.waitForSelector("img.gst-locandina", { timeout: 20000 });
  E.ok(await sfora(po) <= 0, nOrg + ": modulo senza scorrimento in orizzontale");
  await foto(po, "04-modulo");
  await po.click("text=Apri le prenotazioni");
  await po.waitForSelector(".gst-cont", { timeout: 20000 });
  const link = await po.getAttribute(".gst-link a", "href");
  E.ok(link.endsWith("/biglietteria/" + ORG + "/concerto-del-viaggio-12-febbraio"), nOrg + ": link bello dello spettacolo: " + link);
  ev = (await rpcO("bgl_organizzatore_mio", {})).spettacoli.find((s) => s.titolo === "Concerto del viaggio");
  E.ok(ev && ev.pubblicato && ev.locandina_path, nOrg + ": pubblicato, con locandina");
  const loc = await fetch(`${API}/storage/v1/object/public/bgl-locandine/${ev.locandina_path}`);
  E.ok(loc.ok && (await loc.arrayBuffer()).byteLength <= 400 * 1024, nOrg + ": locandina pubblica e ≤ 400 KB");
  /* D7 / decisione 1: l'indirizzo della pagina non si cambia più */
  const cambio = await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro del Viaggio", slug: ORG + "-nuovo" } });
  E.ok(cambio && cambio.ok === false && /bloccat/.test(cambio.errore || ""), nOrg + ": l'indirizzo della pagina è bloccato (" + JSON.stringify(cambio && cambio.errore) + ")");
  await foto(po, "05-scheda-vuota");
});

/* ---------- 3. pubblico: pagina, scheda, Google, prenota, Le mie prenotazioni; senza Google ---------- */
await passo("3. pubblico: scorciatoia → pagina dell'organizzatore → scheda → Google finto → prenota → Le mie prenotazioni", async () => {
  await pp.goto(sito.url + "/biglietteria/" + ORG.toUpperCase() + "/");                 // maiuscole e barra finale (RF3)
  await pp.waitForSelector(".carte");
  const titoli = await pp.$$eval(".carta-titolo", (v) => v.map((x) => x.textContent));
  E.ok(titoli.length === 2 && titoli[0] === "Prima versione" && titoli[1] === "Concerto del viaggio", nPub + ": pagina dell'organizzatore, in ordine di data: " + titoli.join(" | "));
  E.ok(await sfora(pp) <= 0, nPub + ": pagina dell'organizzatore senza scorrimento in orizzontale");
  await foto(pp, "06-pagina-organizzatore");
  await pp.click("text=Concerto del viaggio"); await pp.waitForSelector("#bgl-mappa");
  E.ok(pp.url().includes("?o=" + ORG + "&s=concerto-del-viaggio-12-febbraio"), nPub + ": scheda all'indirizzo canonico");
  await pp.waitForFunction(() => { const i = document.querySelector(".ev-locandina"); return !!i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
  E.ok(/Porte alle 20:30/.test(await pp.textContent("main")) && (await pp.$eval(".ev-descrizione", (x) => x.innerText)).includes("Prima riga.\nSeconda riga."), nPub + ": locandina, nota e descrizione");
  /* l'ora giusta di Roma nel calendario (RF5: 12/02/2027 21:00 = 20:00 UTC) */
  const cal = await pp.getAttribute(".ev-cal a", "href");
  E.ok(/20270212T200000Z/.test(cal), nPub + ": Google Calendar con l'ora di Roma (" + (cal.match(/dates=[^&]*/) || [""])[0] + ")");
  await foto(pp, "07-scheda-pubblica");
  await zoom(pp, tPub);
  E.ok(await pp.$('#bgl-mappa g.posto.riservato[data-k="Platea|A|1"]') !== null, nPub + ": i posti tenuti da parte non sono prenotabili");
  await tocca(pp, "Platea|B|4"); await tocca(pp, "Platea|B|5");
  await pp.click("#bgl-avanti"); await pp.waitForSelector("#bgl-google");
  await foto(pp, "08-scelta-google");
  await pp.click("#bgl-google");
  await pp.waitForSelector("#bgl-form", { timeout: 15000 });
  E.ok(/Prenoti con Google/.test(await pp.textContent("main")) && (await pp.inputValue("#bgl-email")) === maria.user.email, nPub + ": tornati da Google, email dell'account");
  await pp.check("#bgl-privacy"); await pp.click("#bgl-prenota");
  await pp.waitForSelector("section.conferma", { timeout: 15000 });
  await foto(pp, "09-conferma");
  const r = (await http(`/rest/v1/bgl_prenotazioni?select=user_id,posti&user_id=eq.${maria.user.id}`, null, { method: "GET" })).d;
  E.ok(r.length === 1 && r[0].posti.length === 2, nPub + ": prenotazione legata all'account (2 posti)");
  await pp.goto(sito.url + "/biglietteria/mie/"); await pp.waitForSelector(".mie");
  E.ok(/Concerto del viaggio/.test(await pp.textContent(".mie")), nPub + ": Le mie prenotazioni mostra la prenotazione");
  E.ok(await sfora(pp) <= 0, nPub + ": Le mie prenotazioni senza scorrimento in orizzontale");
  await foto(pp, "10-mie");
  /* senza Google: un altro visitatore, nome ed email */
  const ctx2 = await contesto(bp, { ...tPub, ...colore }, {}); await ip(ctx2, 2);
  const p2 = await ctx2.newPage(); sorveglia(p2, nPub + " senza Google", errori);
  await p2.goto(sito.url + "/biglietteria/" + ORG + "/concerto-del-viaggio-12-febbraio"); await p2.waitForSelector("#bgl-mappa");
  await zoom(p2, tPub); await tocca(p2, "Platea|C|1"); await p2.click("#bgl-avanti"); await p2.click("#bgl-mostra");
  await p2.waitForSelector("#bgl-form");
  await p2.fill("#bgl-nome", "Luca"); await p2.fill("#bgl-cognome", "Verdi"); await p2.fill("#bgl-email", `verdi-${S}@example.invalid`);
  await p2.check("#bgl-privacy"); await p2.click("#bgl-prenota");
  await p2.waitForSelector("section.conferma", { timeout: 15000 });
  E.ok(!/Le mie prenotazioni/.test(await p2.textContent("main")), nPub + ": senza Google niente «Le mie prenotazioni»");
  const sp = await p2.evaluate(() => Object.keys(localStorage).filter((k) => /^sp_/.test(k)));
  E.ok(sp.length === 0, nPub + ": nessuna chiave sp_* dell'editor scritta dalla biglietteria");
  await ctx2.close();
  /* il vecchio ?e= e il suo link ?e=&c= funzionano ancora, anche ora che lo spettacolo ha la sua scheda */
  await pp.goto(sito.url + "/biglietteria/?e=" + vecchio.slug + "&c=" + tokenVecchio); await pp.waitForSelector(".mia");
  E.ok(/Neri/.test(await pp.textContent("main")) || await pp.$("#bgl-ics") !== null, nPub + ": ?e=&c= della vecchia prenotazione ancora valido");
  await pp.goto(sito.url + "/biglietteria/?e=" + vecchio.slug); await pp.waitForSelector("#bgl-mappa");
  E.ok(/Prima versione/.test(await pp.textContent("h1")), nPub + ": ?e= ancora valido dopo l'ingresso nell'area");
});

/* ---------- 4. organizzatore: prenotazioni, Sposta, la sala cambia, aggiorna ---------- */
await passo("4. organizzatore: vede le prenotazioni → Sposta → la sala cambia nell'editor → avviso → «Aggiorna la pianta»", async () => {
  await po.goto(sito.url + "/biglietteria/gestione/?v=scheda&id=" + ev.id);
  await po.waitForSelector("#gst-elenco li", { timeout: 15000 });
  const conti = await po.$$eval(".gst-cont > div", (ds) => ds.map((d) => d.textContent.replace(/\s+/g, " ").trim()).join(" · "));
  E.ok(/^3 prenotati/.test(conti), nOrg + ": contatori (" + conti + ")");
  E.ok(/Bianchi/.test(await po.textContent("#gst-elenco")) && /Verdi/.test(await po.textContent("#gst-elenco")), nOrg + ": vede Maria Bianchi (con Google) e Luca Verdi (senza)");
  await foto(po, "11-scheda");
  await po.click('#gst-elenco li:has-text("Bianchi") >> [data-az="sposta"]'); await po.waitForSelector("#gst-sposta-mappa svg");
  await po.locator('#gst-sposta-mappa g.posto[data-k="Platea|C|4"]').click(); await po.locator('#gst-sposta-mappa g.posto[data-k="Platea|C|5"]').click();
  await foto(po, "12-sposta");
  await po.uncheck("#gst-avvisa");
  await po.click('[data-az="conferma-sposta"]'); await po.waitForSelector(".gst-cont", { timeout: 15000 });
  /* la sala cambia nell'editor: fila E nuova */
  await progetto(prog, doc(stato("ABCDE")));
  await po.goto(sito.url + "/biglietteria/gestione/?v=scheda&id=" + ev.id);
  await po.waitForSelector(".gst-sala-avviso", { timeout: 20000 });
  await po.click("text=Vedi cosa è cambiato"); await po.waitForSelector(".gst-riepilogo");
  E.ok(/fila E/i.test(await po.textContent(".gst-riepilogo")), nOrg + ": riepilogo: " + (await po.textContent(".gst-riepilogo")).replace(/\s+/g, " ").slice(0, 120));
  await foto(po, "13-sala-cambiata");
  await po.click('[data-az="aggiorna-pianta"]'); await po.waitForSelector(".gst-cont", { timeout: 15000 });
  const pub = await http("/rest/v1/rpc/bgl_evento_pubblico", { p_slug: ev.slug }, { key: ANON, token: ANON });
  E.ok(pub.d.pianta.posti.some((q) => q.fila === "E") && [...pub.d.occupati].sort().join() === "Platea|C|1,Platea|C|4,Platea|C|5",
    nOrg + ": pianta pubblicata con la fila E, Maria in C 4 e C 5, Luca in C 1 (" + [...pub.d.occupati].sort().join(" ") + ")");
});

/* ---------- 5. pubblico: la sala nuova; Maria disdice ---------- */
await passo("5. pubblico: vede la sala nuova; Maria disdice da «Le mie prenotazioni»", async () => {
  await pp.goto(sito.url + "/biglietteria/" + ORG + "/concerto-del-viaggio-12-febbraio"); await pp.waitForSelector("#bgl-mappa");
  E.ok(await pp.$('#bgl-mappa g.posto[data-k="Platea|E|1"]') !== null, nPub + ": la sala nuova (fila E) è in pagina");
  await foto(pp, "14-sala-nuova");
  await pp.goto(sito.url + "/biglietteria/mie/"); await pp.waitForSelector('[data-az="disdici"]');
  E.ok(/Fila C, posti 4 e 5/.test(await pp.textContent(".mie")), nPub + ": dopo «Sposta», Le mie prenotazioni dice i posti nuovi (" + (await pp.textContent(".mie .mia")).replace(/\s+/g, " ").slice(0, 110) + ")");
  await pp.click('[data-az="disdici"]'); await pp.click('[data-az="si-disdici"]');
  await pp.waitForFunction(() => /disdetta/.test(document.querySelector(".mie").textContent), null, { timeout: 15000 });
  const lib = await http("/rest/v1/rpc/bgl_evento_pubblico", { p_slug: ev.slug }, { key: ANON, token: ANON });
  E.ok(![...lib.d.occupati].some((k) => /\|C\|(4|5)$/.test(k)), nPub + ": i posti di Maria sono tornati liberi");
});

/* ---------- 6. organizzatore: elimina lo spettacolo con prenotazioni; il vecchio resta ---------- */
await passo("6. organizzatore: elimina lo spettacolo con prenotazioni (nessun avviso); il vecchio resta, il suo ?e= pure", async () => {
  await po.goto(sito.url + "/biglietteria/gestione/?v=scheda&id=" + ev.id); await po.waitForSelector(".gst-cont");
  await po.click("text=Elimina spettacolo");
  E.ok(/nessun avviso/.test(await po.textContent(".gst-dlg")), nOrg + ": la conferma dice che nessuno viene avvisato (decisione 2)");
  await po.click('.gst-dlg [data-r="si"]'); await po.waitForSelector(".gst-elenco", { timeout: 15000 });
  E.ok(!/Concerto del viaggio/.test(await po.textContent(".gst-righe")) && /Prima versione/.test(await po.textContent(".gst-righe")), nOrg + ": eliminato, il vecchio resta");
  await pp.goto(sito.url + "/biglietteria/" + ORG + "/concerto-del-viaggio-12-febbraio"); await pp.waitForSelector(".centro h1");
  E.ok((await pp.textContent(".centro h1")) === "Spettacolo non trovato" && /Vedi gli spettacoli di Teatro del Viaggio/.test(await pp.textContent(".centro")), nPub + ": il link dello spettacolo eliminato porta alla pagina dell'organizzatore");
  await pp.goto(sito.url + "/biglietteria/" + ORG); await pp.waitForSelector(".carte, .carte.una");
  E.ok(/Prima versione/.test(await pp.textContent("main")) && !/Concerto del viaggio/.test(await pp.textContent("main")), nPub + ": la pagina dell'organizzatore ha solo il vecchio");
  await pp.goto(sito.url + "/biglietteria/?e=" + vecchio.slug + "&c=" + tokenVecchio); await pp.waitForSelector(".mia");
  E.ok(true, nPub + ": e il ?e=&c= di sempre funziona ancora");
});
await chiudi();
E.ok(veri().length === 0, "nessun errore in console: " + veri().slice(0, 3).join(" | "));
E.fine();
