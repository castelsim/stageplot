/* La casella delle segnalazioni (segnala.js, 07/10/2026) su tutte le pagine della biglietteria: scheda (?o=&s=), link storico
   (?e=), disdetta (?e=&c=), pagina dell'organizzatore, «Le mie prenotazioni», area dell'organizzatore.
   submit-feedback è INTERCETTATA (route): si guarda il corpo che partirebbe, non parte niente. Si prova: apertura e chiusura
   (✕, Esc, fuoco), invio e conferma, errore 429, rete assente, indirizzo senza ?c=, token della sessione quando c'è.
   Telefono: niente di fisso, la voce nel piè di pagina apre il pannello dal basso. Computer: il riquadro, che non copre la
   barra «Avanti» né l'ultimo pulsante in fondo. E la regola computer/telefono ai bordi. Chromium e WebKit.
   Prima:  WT=<worktree> REF=lavoro DEST=<cartella> ./prepara.sh
   Poi:    SITO=<cartella> OUT=<cartella screenshot> node prova-segnala.mjs        (SOLO="chromium telefono" per un giro) */
import { chromium, webkit, avviaSito, contesto, http, utente, rpcServizio, TELEFONO, COMPUTER, sorveglia, esito, ANON, P } from "./comune.mjs";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const MEDIA = createRequire(import.meta.url)("../../biglietteria/segnala.js").MEDIA_COMPUTER;
const E = esito(), errori = [], S = Date.now().toString(36), OUT = process.env.OUT || P + "/out"; mkdirSync(OUT, { recursive: true });
const sito = await avviaSito(process.env.SITO || P + "/sito");
const ORG = "teatro-sg-" + S;
const org = await utente(`sgorg-${S}@example.invalid`);
await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: ORG } });
const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala", data: { items: [] } }, { key: ANON, token: org.access_token })).d[0].id;
/* sala lunga: sul telefono la pagina scorre e in fondo c'è il piè di pagina */
const posti = []; ["A", "B", "C", "D", "E", "F"].forEach((f, r) => { for (let n = 1; n <= 10; n++) posti.push({ settore: "Platea", fila: f, posto: n, x: 150 + n * 60, y: 1000 + r * 80, w: 50, d: 53, rot: 180 }); });
const pianta = { v: 1, box: [0, 0, 900, 1600], palco: [[[100, 100], [800, 100], [800, 800], [100, 800]]], pedane: [], posti };
const ev = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog, titolo: "Concerto di prova", inizio: new Date(Date.now() + 72 * 3600e3).toISOString(), luogo: "Teatro di prova", pianta, pubblicato: true } });
if (!ev || !ev.ok) throw new Error("spettacolo: " + JSON.stringify(ev));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQYV2NkYGD4z8DAwMgABXAGNgYGBgYGAA0hAQFm2dnFAAAAAElFTkSuQmCC", "base64");

/* submit-feedback finta: registra corpo e intestazioni, risponde come si chiede */
function finta(ctx) {
  const st = { corpi: [], auth: [], risposta: { status: 200, body: { ok: true, id: "prova" } } };
  ctx.route("**/functions/v1/submit-feedback", (r) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type" } });
    st.corpi.push(JSON.parse(r.request().postData() || "null")); st.auth.push(r.request().headers()["authorization"] || null);
    if (st.risposta === "rete") return r.abort();
    return r.fulfill({ status: st.risposta.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(st.risposta.body) });
  });
  return st;
}
const rett = (p, sel) => p.$eval(sel, (x) => { const r = x.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
const tocca = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const sfora = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const aperto = (p) => p.$eval("#sg-pannello", (x) => !x.hidden);
/* il comando che apre la casella: sul computer il pulsante del riquadro, altrimenti la voce nel piè di pagina */
const comando = (p) => p.evaluate((m) => matchMedia(m).matches, MEDIA).then((c) => c ? "#sg-tasto" : ".sg-voce >> visible=true");
async function apriCasella(p) {
  const sel = await comando(p);
  await p.locator(sel).first().scrollIntoViewIfNeeded();
  await p.locator(sel).first().click();
  await p.waitForSelector("#sg-pannello:not([hidden])");
}
async function scrivi(p, testo, tipo) {
  if (!(await aperto(p))) await apriCasella(p);
  await p.fill("#sg-msg", testo);
  if (tipo) await p.click(`.sg-tipo[data-hint="${tipo}"]`);
}
/* gli elementi FISSI della casella visibili a pannello chiuso (sul telefono: nessuno) */
const fissiVisibili = (p) => p.evaluate(() => [...document.querySelectorAll("#sg-tasto, #sg-pannello, .sg-velo, .sg-voce, .sg-piede")]
  .filter((x) => getComputedStyle(x).position === "fixed" && x.getClientRects().length && getComputedStyle(x).display !== "none").map((x) => x.id || x.className));
async function manda(p, st, n) {
  await p.click("#sg-invia");
  await p.waitForFunction((k) => !document.getElementById("sg-grazie").hidden || !document.getElementById("sg-esito").hidden, null, { timeout: 10000 });
  return st.corpi.length === n;
}

for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) {
  const chi = `${nm} ${t}`;
  if (process.env.SOLO && process.env.SOLO !== chi) continue;
  const br = await motore.launch(), tel = t === "telefono";
  /* ---------- 1. scheda dello spettacolo (?o=&s=) ---------- */
  let ctx = await contesto(br, tipo), st = finta(ctx), p = await ctx.newPage(); sorveglia(p, chi, errori);
  await p.goto(`${sito.url}/biglietteria/?o=${ORG}&s=${ev.slug_breve}`);
  await p.waitForSelector("#bgl-avanti");
  await p.waitForTimeout(300);
  const comp = await p.evaluate((m) => matchMedia(m).matches, MEDIA);
  E.ok(comp === !tel, chi + ": la regola computer/telefono dice " + (comp ? "computer" : "telefono"));
  if (tel) {
    E.ok((await fissiVisibili(p)).length === 0, chi + ": sul telefono niente di fisso della casella: " + JSON.stringify(await fissiVisibili(p)));
    const vv = p.locator("#bgl-app footer.piede .sg-voce");
    E.ok((await vv.count()) === 1 && (await vv.textContent()) === "Un problema? Scrivici", chi + ": la voce «Un problema? Scrivici» è nel piè di pagina");
    E.ok(await p.evaluate(() => { const v = document.querySelector("#bgl-app footer.piede .sg-voce"), a = v && v.previousElementSibling; return !!a && /^\/privacy\//.test(a.getAttribute("href") || ""); }), chi + ": subito dopo «Privacy»");
    await vv.scrollIntoViewIfNeeded();
    const vr = await rett(p, "#bgl-app footer.piede .sg-voce"), b0 = await rett(p, "#bgl-barra");
    E.ok(vr.h >= 44 && vr.b <= b0.t, chi + `: la voce si tocca (${vr.h} px) e in fondo alla pagina non finisce sotto la barra`);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: `${OUT}/segnala-${nm}-telefono-scheda-chiuso.png` });
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${OUT}/segnala-${nm}-telefono-scheda-piede.png` });
  } else {
    E.ok(/Un problema\? Scrivici/.test(await p.textContent("#sg-tasto")), chi + ": scheda, «Un problema? Scrivici» sul riquadro");
    E.ok((await p.locator(".sg-voce >> visible=true").count()) === 0, chi + ": sul computer la voce nel piè di pagina non si vede");
    const tb = await rett(p, "#sg-tasto"), barra = await rett(p, "#bgl-barra"), av = await rett(p, "#bgl-avanti");
    E.ok(tb.b <= barra.t - 4 && !tocca(tb, av), chi + `: il riquadro sta sopra la barra (fondo ${tb.b} ≤ barra ${barra.t}) e non copre «Avanti»`);
    await p.click(".posto.libero[role=button]");
    await p.waitForTimeout(250);
    const tb2 = await rett(p, "#sg-tasto"), b2 = await rett(p, "#bgl-barra");
    E.ok(tb2.b <= b2.t - 4, chi + ": con un posto scelto resta sopra la barra");
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(250);
    const copre = await p.evaluate(() => {
      const t = document.getElementById("sg-tasto").getBoundingClientRect(), bar = document.getElementById("bgl-barra");
      return [...document.querySelectorAll("#bgl-app a[href], #bgl-app button, #bgl-app .posto[role=button]")].filter((x) => {
        const r = x.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) return false;
        const sopraBarra = bar && !bar.hidden ? r.top < bar.getBoundingClientRect().top : true;
        return sopraBarra && r.left < t.right && t.left < r.right && r.top < t.bottom && t.top < r.bottom;
      }).map((x) => x.textContent.trim().slice(0, 30) || x.getAttribute("aria-label"));
    });
    E.ok(copre.length === 0, chi + ": a fine pagina il riquadro non copre niente: " + JSON.stringify(copre));
    await p.evaluate(() => window.scrollTo(0, 0));
  }
  E.ok((await sfora(p)) <= 0, chi + ": niente scorrimento in larghezza");
  /* apertura: pannello, fuoco nel messaggio; Esc chiude e il fuoco torna a chi l'ha aperto */
  const cmd = await comando(p);
  await apriCasella(p);
  await p.waitForTimeout(80);
  E.ok(await p.evaluate(() => document.activeElement && document.activeElement.id === "sg-msg"), chi + ": aperto, il fuoco è nel messaggio");
  E.ok((await p.locator(cmd).first().getAttribute("aria-expanded")) === "true", chi + ": aria-expanded");
  if (tel) {
    const pr = await rett(p, "#sg-pannello"), vw = tipo.viewport;
    E.ok(Math.abs(pr.b - vw.height) < 2 && pr.l === 0 && Math.abs(pr.r - vw.width) < 1, chi + ": sul telefono il pannello sale dal basso, largo quanto lo schermo");
    E.ok((await p.getAttribute("#sg-pannello", "aria-modal")) === "true", chi + ": modale sul telefono");
    const x = await rett(p, "#sg-chiudi"); E.ok(x.w >= 44 && x.h >= 44, chi + ": la ✕ ≥ 44 px");
    const tipi = await p.$$eval(".sg-tipo", (a) => a.map((b) => b.getBoundingClientRect().height)); E.ok(tipi.every((h) => h >= 44), chi + ": i tipi ≥ 44 px " + tipi);
  } else {
    const pr = await rett(p, "#sg-pannello"), tb3 = await rett(p, "#sg-tasto");
    E.ok(pr.b <= tb3.t && pr.r <= tipo.viewport.width && pr.w <= 380, chi + ": sul computer il riquadro sta in basso a destra, sopra il pulsante");
    E.ok((await p.getAttribute("#sg-pannello", "aria-modal")) === "false", chi + ": sul computer non è modale");
  }
  await p.keyboard.press("Escape");
  E.ok(!(await aperto(p)) && (await p.evaluate((t) => document.activeElement && document.activeElement.matches(t), tel ? ".sg-voce" : "#sg-tasto")), chi + ": Esc chiude, il fuoco torna a chi l'ha aperto");
  /* scrivi, tipo, immagine scelta da file; troppo corto → errore senza invio */
  await scrivi(p, "ciao");
  await p.click("#sg-invia");
  E.ok(/almeno 5/.test(await p.textContent("#sg-esito")) && st.corpi.length === 0, chi + ": 4 caratteri, non parte");
  await p.fill("#sg-msg", "Il posto A3 non si seleziona dal telefono");
  E.ok((await p.textContent("#sg-n")) === "41", chi + ": contatore " + (await p.textContent("#sg-n")));
  await p.click('.sg-tipo[data-hint="bug"]');
  await p.setInputFiles("#sg-file", { name: "schermata.png", mimeType: "image/png", buffer: PNG });
  await p.waitForSelector(".sg-shot.pieno img");
  E.ok(/Togli/.test(await p.textContent("#sg-shot")) && /schermata allegata/.test(await p.textContent("#sg-nota")), chi + ": immagine allegata, la nota lo dice");
  if (tel) await p.screenshot({ path: `${OUT}/segnala-${nm}-telefono-scheda-aperto.png` });
  E.ok(await manda(p, st, 1), chi + ": un invio");
  const c1 = st.corpi[0] || {};
  E.ok(/Grazie, l'abbiamo ricevuto/.test(await p.textContent("#sg-grazie")) && !(await p.$eval("#sg-grazie", (x) => x.hidden)), chi + ": conferma");
  E.ok(c1.message === "Il posto A3 non si seleziona dal telefono" && c1.hint === "bug" && c1.honeypot === "", chi + ": messaggio e tipo");
  E.ok(c1.meta && c1.meta.page_url === `${sito.url}/biglietteria/?o=${ORG}&s=${ev.slug_breve}` && c1.meta.app_version === "biglietteria/scheda", chi + ": indirizzo " + (c1.meta && c1.meta.page_url));
  E.ok(JSON.stringify(c1.tech_context) === JSON.stringify({ origine: "biglietteria", pagina: "scheda", org: ORG, spettacolo: ev.slug_breve, schermata: "pianta" }), chi + ": contesto " + JSON.stringify(c1.tech_context));
  E.ok(/^data:image\/jpeg;base64,/.test(c1.screenshot || "") && c1.screenshot.length < 2800000, chi + ": schermata ridotta in JPEG");
  E.ok(!("project_snapshot" in c1) && !("project_id" in c1) && st.auth[0] === null, chi + ": niente progetto, niente token senza sessione");
  await p.click("#sg-ok");
  E.ok(!(await aperto(p)), chi + ": «Chiudi» chiude");
  await apriCasella(p);
  E.ok((await p.inputValue("#sg-msg")) === "" && !(await p.$(".sg-shot.pieno")) && (await p.$$('.sg-tipo[aria-pressed="true"]')).length === 0, chi + ": riaperta, la casella è vuota");
  /* 429 e rete */
  st.risposta = { status: 429, body: { error: "troppi invii, riprova più tardi" } };
  await p.fill("#sg-msg", "Seconda segnalazione di prova");
  await manda(p, st, 2);
  E.ok((await p.textContent("#sg-esito")) === "Hai già scritto da poco, riprova più tardi." && (await p.inputValue("#sg-msg")) === "Seconda segnalazione di prova", chi + ": 429, il testo resta");
  st.risposta = "rete";
  await p.click("#sg-invia");
  await p.waitForFunction(() => /connessione/.test(document.getElementById("sg-esito").textContent), null, { timeout: 10000 });
  E.ok(!(await p.$eval("#sg-invia", (b) => b.disabled)), chi + ": senza rete si può riprovare");
  await p.click("#sg-chiudi");
  E.ok(!(await aperto(p)), chi + ": la ✕ chiude");
  /* incolla un'immagine (solo Chromium: WebKit non costruisce un DataTransfer con file) */
  if (nm === "chromium") {
    await apriCasella(p);
    await p.evaluate((b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), dt = new DataTransfer();
      dt.items.add(new File([bin], "x.png", { type: "image/png" }));
      document.getElementById("sg-msg").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, PNG.toString("base64"));
    await p.waitForSelector(".sg-shot.pieno img", { timeout: 5000 }).catch(() => null);
    E.ok(!!(await p.$(".sg-shot.pieno img")), chi + ": incollata un'immagine, si allega");
    await p.click("#sg-chiudi");
  }
  await ctx.close();

  /* ---------- 2. disdetta (?e=&c=): il codice non esce ---------- */
  const pren = await rpcServizio("bgl_prenota", { p_slug: ev.slug, p_posti: ["Platea|F|" + (nm === "chromium" ? (tel ? 1 : 2) : (tel ? 3 : 4))], p_nome: "Mario", p_cognome: "Rossi", p_email: `sg-${S}-${chi.replace(" ", "")}@example.invalid` });
  if (!pren || !pren.ok) throw new Error("prenotazione: " + JSON.stringify(pren));
  ctx = await contesto(br, tipo); st = finta(ctx); p = await ctx.newPage(); sorveglia(p, chi, errori);
  await p.goto(`${sito.url}/biglietteria/?e=${ev.slug}&c=${pren.token}`);
  await p.waitForSelector(".codice", { timeout: 10000 });
  await scrivi(p, "Non trovo come cambiare i posti", "missing");
  await manda(p, st, 1);
  const c2 = st.corpi[0] || {};
  E.ok(c2.meta && c2.meta.page_url === `${sito.url}/biglietteria/?e=${ev.slug}` && c2.meta.app_version === "biglietteria/disdetta", chi + ": disdetta, indirizzo senza c= " + (c2.meta && c2.meta.page_url));
  E.ok(JSON.stringify(c2).indexOf(pren.token) < 0 && JSON.stringify(c2).indexOf(pren.codice) < 0 && JSON.stringify(c2).indexOf("Rossi") < 0, chi + ": né il codice di disdetta né quello di prenotazione né il nome nel corpo");
  E.ok(c2.tech_context && c2.tech_context.pagina === "disdetta" && c2.tech_context.slug === ev.slug && c2.hint === "missing", chi + ": contesto della disdetta");
  await ctx.close();

  /* ---------- 3. pagina dell'organizzatore e link storico ?e= ---------- */
  ctx = await contesto(br, tipo); st = finta(ctx); p = await ctx.newPage(); sorveglia(p, chi, errori);
  await p.goto(`${sito.url}/biglietteria/?o=${ORG}`);
  await p.waitForSelector(".carte");
  await scrivi(p, "La locandina non si vede bene");
  await manda(p, st, 1);
  E.ok(st.corpi[0] && st.corpi[0].tech_context.pagina === "organizzatore" && st.corpi[0].meta.page_url === `${sito.url}/biglietteria/?o=${ORG}` && st.corpi[0].hint === null, chi + ": pagina dell'organizzatore");
  await p.goto(`${sito.url}/biglietteria/?e=${ev.slug}`);
  await p.waitForSelector("#bgl-avanti");
  await scrivi(p, "Prova dal link vecchio", "idea");
  await manda(p, st, 2);
  E.ok(st.corpi[1] && st.corpi[1].tech_context.pagina === "scheda" && st.corpi[1].tech_context.slug === ev.slug && st.corpi[1].meta.page_url === `${sito.url}/biglietteria/?e=${ev.slug}`, chi + ": link storico ?e=");
  await ctx.close();

  /* ---------- 4. «Le mie prenotazioni» con la sessione Google: il token va al server ---------- */
  const u = await utente(`sgpub-${S}-${chi.replace(" ", "")}@example.invalid`, { full_name: "Maria Bianchi" });
  ctx = await contesto(br, tipo, { sessione: u }); st = finta(ctx); p = await ctx.newPage(); sorveglia(p, chi, errori);
  await p.goto(`${sito.url}/biglietteria/mie/`);
  await p.waitForSelector(".mie-account, .mie, [data-az=accedi]", { timeout: 15000 });
  E.ok(/Un problema\? Scrivici/.test(await p.textContent("#sg-titolo")), chi + ": «Le mie prenotazioni» ha la casella");
  await scrivi(p, "Vorrei vedere anche quelle vecchie");
  await manda(p, st, 1);
  E.ok(st.auth[0] === "Bearer " + u.access_token, chi + ": con la sessione parte il token della persona");
  E.ok(st.corpi[0] && JSON.stringify(st.corpi[0].tech_context) === JSON.stringify({ origine: "biglietteria", pagina: "mie" }) && st.corpi[0].meta.page_url === `${sito.url}/biglietteria/mie/` &&
    JSON.stringify(st.corpi[0]).indexOf(u.user.email) < 0, chi + ": niente email nel corpo");
  await ctx.close();

  /* ---------- 5. area dell'organizzatore ---------- */
  ctx = await contesto(br, tipo, { sessione: org }); st = finta(ctx); p = await ctx.newPage(); sorveglia(p, chi, errori);
  await p.goto(`${sito.url}/biglietteria/gestione/`);
  await p.waitForSelector(".gst-righe", { timeout: 15000 });
  E.ok((await p.textContent("#sg-titolo")) === "Cosa manca? Bug? Idea?", chi + ": nell'area, «Cosa manca? Bug? Idea?»");
  if (tel) {
    E.ok((await fissiVisibili(p)).length === 0, chi + ": area, sul telefono niente di fisso");
    E.ok((await p.locator(".sg-piede:not([hidden]) .sg-voce").textContent()) === "Cosa manca? Bug? Idea?", chi + ": area, la voce nel piè di pagina tutto suo");
  }
  if (!tel) E.ok(/Cosa manca\? Bug\? Idea\?/.test(await p.textContent("#sg-tasto")), chi + ": sul computer il titolo si legge sul pulsante");
  await p.click(".gst-riga");
  await p.waitForFunction(() => /v=scheda/.test(location.search), null, { timeout: 10000 });
  await p.waitForTimeout(400);
  await scrivi(p, "Mi servirebbe esportare l'elenco in Excel", "idea");
  if (!tel) await p.screenshot({ path: `${OUT}/segnala-${nm}-computer-gestione-aperto.png` });
  E.ok((await sfora(p)) <= 0, chi + ": area, niente scorrimento in larghezza");
  await manda(p, st, 1);
  const c5 = st.corpi[0] || {};
  E.ok(st.auth[0] === "Bearer " + org.access_token, chi + ": area, token dell'organizzatore");
  E.ok(c5.tech_context && c5.tech_context.pagina === "gestione" && c5.tech_context.org === ORG && c5.tech_context.vista === "scheda" &&
    c5.tech_context.spettacolo === ev.slug_breve && c5.tech_context.slug === ev.slug, chi + ": contesto dell'area " + JSON.stringify(c5.tech_context));
  E.ok(c5.meta && c5.meta.page_url === `${sito.url}/biglietteria/gestione/`, chi + ": area, l'indirizzo senza ?v=&id= " + (c5.meta && c5.meta.page_url));
  /* tema scuro: la casella usa i colori della pagina */
  await p.emulateMedia({ colorScheme: "dark" });
  await p.click("#sg-ok"); await apriCasella(p);
  const fondo = await p.$eval("#sg-pannello", (x) => getComputedStyle(x).backgroundColor);
  E.ok(fondo === "rgb(27, 35, 39)", chi + ": tema scuro, fondo " + fondo);
  if (!tel && nm === "chromium") await p.screenshot({ path: `${OUT}/segnala-${nm}-computer-gestione-scuro.png` });
  await ctx.close();
  await br.close();
}

/* ---------- la regola computer/telefono ai bordi: finestra stretta col mouse, tablet largo col dito ---------- */
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) {
  if (process.env.SOLO) break;
  const br = await motore.launch();
  for (const [t, tipo, atteso] of [["finestra stretta col mouse", { viewport: { width: 600, height: 800 } }, false],
    ["tablet col dito", { viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true }, false],
    ["computer stretto (700)", { viewport: { width: 700, height: 800 } }, true]]) {
    const ctx = await contesto(br, tipo), st = finta(ctx), p = await ctx.newPage(); sorveglia(p, nm + " " + t, errori);
    await p.goto(`${sito.url}/biglietteria/?o=${ORG}`);
    await p.waitForSelector(".carte");
    const comp = await p.evaluate((m) => matchMedia(m).matches, MEDIA);
    const tastoVisibile = await p.locator("#sg-tasto").isVisible(), voceVisibile = (await p.locator(".sg-voce >> visible=true").count()) === 1;
    E.ok(comp === atteso && tastoVisibile === atteso && voceVisibile === !atteso, `${nm} ${t}: ${atteso ? "riquadro" : "voce nel piè di pagina"} (regola ${comp}, riquadro ${tastoVisibile}, voce ${voceVisibile})`);
    await scrivi(p, "Prova ai bordi della regola");
    await manda(p, st, 1);
    E.ok(st.corpi.length === 1 && st.corpi[0].tech_context.pagina === "organizzatore", `${nm} ${t}: si apre e si manda`);
    await ctx.close();
  }
  await br.close();
}
E.ok(errori.length === 0, "nessun errore nella console: " + errori.slice(0, 5).join(" | "));
sito.chiudi();
E.fine();
