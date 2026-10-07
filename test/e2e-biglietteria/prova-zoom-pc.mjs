/* La pianta sul COMPUTER (07/10, Simone: «la lente promette una cosa che il clic non fa»), nel browser vero: Chromium e
   WebKit. Stack Supabase LOCALE, dati inventati. Una sala grande (posti piccoli alla vista intera: prima il clic ingrandiva).
   Computer 1280x800:
   1. niente lente; manina sui posti liberi, freccia sugli occupati; niente «Ingrandisci» vecchio, ci sono «+ − Vista intera»;
   2. il clic sceglie e toglie SENZA ingrandire; sull'occupato l'avviso;
   3. doppio clic: ingrandisce ×1,6 lì dove si è cliccato, il posto resta com'era;
   4. «+», «−», «Vista intera» (anche da tastiera), spenti ai limiti, sempre in vista anche scorrendo dentro la pianta;
   5. trascinare sposta la pianta (manina «afferra») e NON sceglie il posto del rilascio; un clic che trema resta un clic;
   6. rotellina senza Ctrl: scorre la pagina, lo zoom non cambia; Ctrl+rotellina: ingrandisce.
   Telefono 390x844 (come prima): «Ingrandisci» c'è, i comandi del computer no, il primo tocco ingrandisce senza scegliere,
   poi il tocco sceglie, due dita ingrandiscono.
   Prima:  WT=<worktree> REF=lavoro DEST=<cartella> ./prepara.sh
   Poi:    SITO=<cartella> OUT=<cartella screenshot> [SOLO="chromium computer"] node prova-zoom-pc.mjs */
import { chromium, webkit, avviaSito, contesto, http, utente, rpcServizio, TELEFONO, COMPUTER, sorveglia, esito, P, ANON } from "./comune.mjs";
import { mkdirSync } from "node:fs";
const E = esito(), errori = [], S = Date.now().toString(36), OUT = process.env.OUT || P + "/out"; mkdirSync(OUT, { recursive: true });
const sito = await avviaSito(process.env.SITO || P + "/sito");
const org = await utente(`zorg-${S}@example.invalid`);
await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
const ORG = "teatro-z-" + S;
const o = await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: ORG } });
E.ok(o && o.ok, "organizzatore di prova: " + JSON.stringify(o && o.errore));
const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala grande", data: { items: [] } }, { key: ANON, token: org.access_token })).d[0].id;
/* 12 file × 22 posti, passo 55 cm: alla vista intera del computer un posto è largo ~13 px (sotto la vecchia soglia di 16) */
const FILE = "ABCDEFGHIJKL".split(""), posti = [];
for (const [i, f] of FILE.entries()) for (let n = 1; n <= 22; n++) posti.push({ settore: "Platea", fila: f, posto: n, x: 140 + n * 55, y: 900 + i * 85, w: 48, d: 50, rot: 180 });
const pianta = { v: 1, box: [0, 0, 1500, 2000], palco: [[[100, 100], [1400, 100], [1400, 700], [100, 700]]], pedane: [], posti };
async function spettacolo(n) {
  const ev = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog, titolo: "Concerto grande " + n,
    inizio: new Date(Date.now() + (72 + n) * 3600e3).toISOString(), luogo: "Teatro di prova", pianta, pubblicato: true } });
  if (!ev || !ev.ok) throw new Error("spettacolo: " + JSON.stringify(ev));
  return ev;
}
const sel = (k) => `#bgl-mappa g.posto[data-k="${k}"]`;
const cls = (p, k) => p.getAttribute(sel(k), "class");
const larg = (p) => p.$eval("#bgl-mappa svg", (s) => s.getBoundingClientRect().width);
const centro = (p, k) => p.$eval(sel(k), (g) => { const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
const cursore = (p, q) => p.$eval(q, (e) => getComputedStyle(e).cursor);
const scorri = (p) => p.$eval("#bgl-mappa", (m) => ({ l: m.scrollLeft, t: m.scrollTop }));
const spento = (p, id) => p.getAttribute("#" + id, "aria-disabled").then((v) => v === "true");
const vicino = (a, b, tol) => Math.abs(a - b) <= tol;

let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) {
  giro++;
  const ev = await spettacolo(giro);
  await rpcServizio("bgl_prenota", { p_slug: ev.slug, p_posti: ["Platea|A|1", "Platea|C|11"], p_nome: "Prova", p_cognome: "Prova", p_email: `zr-${S}-${giro}@example.invalid` });
  const scheda = `${sito.url}/biglietteria/?o=${ORG}&s=${ev.slug_breve}`;
  const br = await motore.launch();

  /* ============ COMPUTER ============ */
  let chi = `${nm} computer`;
  if (!process.env.SOLO || process.env.SOLO === chi) {
    const ctx = await contesto(br, COMPUTER), p = await ctx.newPage(); sorveglia(p, chi, errori);
    await p.goto(scheda); await p.waitForSelector("#bgl-mappa svg");
    await p.waitForTimeout(300);
    E.ok(await p.evaluate(() => matchMedia(BGL.MEDIA_MOUSE).matches), chi + ": il browser è «computer col mouse»");
    /* 1. aspetto */
    E.ok(!(await p.$("#bgl-zoom")) && await p.isVisible(".zoom-pc"), chi + ": niente «Ingrandisci» vecchio, ci sono i comandi sulla pianta");
    const etich = await p.$$eval(".zoom-pc button", (v) => v.map((b) => b.getAttribute("aria-label") || b.textContent));
    E.ok(JSON.stringify(etich) === JSON.stringify(["Ingrandisci", "Rimpicciolisci", "Vista intera"]), chi + ": etichette " + etich.join(", "));
    const alt = await p.$$eval(".zoom-pc button", (v) => v.map((b) => Math.round(b.getBoundingClientRect().height)));
    E.ok(alt.every((h) => h >= 32), chi + ": comandi alti almeno 32 px (" + alt + ")");
    E.ok(await spento(p, "bgl-meno") && await spento(p, "bgl-intera") && !(await spento(p, "bgl-piu")), chi + ": alla pianta intera «−» e «Vista intera» spenti, «+» acceso");
    E.ok((await cursore(p, "#bgl-mappa")) !== "zoom-in" && (await cursore(p, "#bgl-mappa")) !== "grab", chi + ": sulla pianta intera niente lente né manina (" + (await cursore(p, "#bgl-mappa")) + ")");
    E.ok((await cursore(p, sel("Platea|B|5"))) === "pointer", chi + ": manina sul posto libero");
    E.ok((await cursore(p, sel("Platea|A|1"))) === "default", chi + ": freccia sul posto occupato");
    E.ok((await p.textContent("#bgl-sugg")) === "Clicca un posto libero per sceglierlo. Per ingrandire: doppio clic o «+».", chi + ": suggerimento «" + (await p.textContent("#bgl-sugg")) + "»");
    const w0 = await larg(p), c0 = await centro(p, "Platea|B|5");
    E.ok(c0.w < 16, chi + ": alla vista intera i posti sono piccoli (" + c0.w.toFixed(1) + " px): prima qui il clic ingrandiva");
    await p.screenshot({ path: `${OUT}/zoompc-${nm}-1-intera.png` });

    /* 2. il clic sceglie e basta */
    await p.mouse.click(c0.x, c0.y);
    await p.waitForTimeout(200);
    E.ok(/posto scelto/.test(await cls(p, "Platea|B|5")) && vicino(await larg(p), w0, 1) && !(await p.$(".mappa.ingrandita")),
      chi + ": il clic su B 5 lo sceglie senza ingrandire (" + w0.toFixed(0) + " → " + (await larg(p)).toFixed(0) + ")");
    await p.waitForTimeout(500);   /* oltre il tempo del doppio clic */
    await p.mouse.click(c0.x, c0.y);
    await p.waitForTimeout(200);
    E.ok(/posto libero/.test(await cls(p, "Platea|B|5")) && vicino(await larg(p), w0, 1), chi + ": il secondo clic lo toglie, sempre senza zoom");
    await p.waitForTimeout(500);
    const cOcc = await centro(p, "Platea|C|11");
    await p.mouse.click(cOcc.x, cOcc.y);
    await p.waitForTimeout(200);
    E.ok(/C 11 è già occupato/.test(await p.textContent("#bgl-avviso")) && vicino(await larg(p), w0, 1), chi + ": clic sull'occupato → avviso, niente zoom");
    await p.waitForTimeout(500);

    /* 3. doppio clic: ×1,6 lì */
    const cD = await centro(p, "Platea|F|17");
    await p.mouse.dblclick(cD.x, cD.y);
    await p.waitForTimeout(250);
    const w1 = await larg(p), cD1 = await centro(p, "Platea|F|17");
    E.ok(vicino(w1 / w0, 1.6, 0.03), chi + ": doppio clic ingrandisce ×1,6 (" + (w1 / w0).toFixed(3) + ")");
    /* ×1,6 la pianta è ancora più stretta del riquadro: resta al centro, e in verticale il punto resta sotto il mouse */
    const box1 = await p.$eval("#bgl-mappa", (m) => { const s = m.querySelector("svg").getBoundingClientRect(), r = m.getBoundingClientRect();
      return { sx: s.left + s.width / 2, mx: r.left + m.clientLeft + m.clientWidth / 2, stretta: s.width < m.clientWidth }; });
    E.ok(box1.stretta && vicino(box1.sx, box1.mx, 2), chi + ": ingrandita ma più stretta del riquadro: resta al centro");
    E.ok(vicino(cD1.y, cD.y, 4), chi + ": il punto cliccato resta all'altezza del mouse (" + Math.round(cD.y) + " → " + Math.round(cD1.y) + ")");
    /* secondo doppio clic: ora più larga del riquadro, il punto resta esattamente sotto il mouse */
    await p.waitForTimeout(500);
    await p.mouse.dblclick(cD1.x, cD1.y);
    await p.waitForTimeout(250);
    const cD2 = await centro(p, "Platea|F|17");
    E.ok(vicino((await larg(p)) / w1, 1.6, 0.03) && vicino(cD2.x, cD1.x, 3) && vicino(cD2.y, cD1.y, 3),
      chi + ": secondo doppio clic, il punto resta sotto il mouse (" + [cD1.x, cD1.y].map(Math.round) + " → " + [cD2.x, cD2.y].map(Math.round) + ")");
    E.ok(/posto libero/.test(await cls(p, "Platea|F|17")), chi + ": e il posto resta libero");
    await p.waitForTimeout(500);
    await p.click("#bgl-meno"); await p.waitForTimeout(150);
    E.ok(vicino(await larg(p), w1, 2), chi + ": «−» torna a ×1,6");
    E.ok(/posto libero/.test(await cls(p, "Platea|F|17")), chi + ": il doppio clic non lascia il posto scelto");
    E.ok(!(await spento(p, "bgl-meno")) && !(await spento(p, "bgl-intera")), chi + ": ingranditi, «−» e «Vista intera» accesi");
    E.ok((await p.textContent("#bgl-sugg")) === "Clicca un posto libero per sceglierlo. Trascina la pianta per spostarti.", chi + ": suggerimento da ingranditi");
    await p.waitForTimeout(500);

    /* 4. «+», «−», «Vista intera» */
    await p.click("#bgl-piu"); await p.waitForTimeout(150);
    const w2 = await larg(p);
    E.ok(vicino(w2 / w1, 1.6, 0.03), chi + ": «+» ×1,6 (" + (w2 / w1).toFixed(3) + ")");
    /* il centro visibile resta al centro */
    const centroVisto = () => p.$eval("#bgl-mappa", (m) => {
      const s = m.querySelector("svg").getBoundingClientRect(), r = m.getBoundingClientRect();
      return { x: (r.left + m.clientLeft + m.clientWidth / 2 - s.left) / s.width, y: (r.top + m.clientTop + m.clientHeight / 2 - s.top) / s.height };
    });
    const v0 = await centroVisto();
    await p.click("#bgl-piu"); await p.waitForTimeout(150);
    const v1 = await centroVisto();
    E.ok(vicino(v0.x, v1.x, 0.01) && vicino(v0.y, v1.y, 0.01), chi + ": «+» ingrandisce attorno al centro di ciò che si vede");
    await p.click("#bgl-meno"); await p.waitForTimeout(150);
    E.ok(vicino(await larg(p), w2, 2), chi + ": «−» torna indietro di un passo");
    await p.screenshot({ path: `${OUT}/zoompc-${nm}-2-ingrandita.png` });
    /* sempre in vista anche scorrendo dentro la pianta */
    await p.$eval("#bgl-mappa", (m) => { m.scrollLeft = m.scrollWidth; m.scrollTop = m.scrollHeight; });
    await p.waitForTimeout(100);
    const inVista = await p.evaluate(() => ["bgl-piu", "bgl-meno", "bgl-intera"].every((id) => {
      const b = document.getElementById(id), r = b.getBoundingClientRect(), m = document.getElementById("bgl-mappa").getBoundingClientRect();
      return r.top >= m.top && r.right <= m.right && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b;
    }));
    E.ok(inVista, chi + ": scorrendo fino in fondo i comandi restano sulla pianta e si possono cliccare");
    const sb = await p.$eval("#bgl-mappa", (m) => m.offsetWidth - m.clientWidth - 2);
    const scost = await p.evaluate(() => { const r = document.getElementById("bgl-intera").getBoundingClientRect(), m = document.getElementById("bgl-mappa"), mr = m.getBoundingClientRect(); return mr.left + m.clientLeft + m.clientWidth - r.right; });
    E.ok(scost >= 7, chi + ": i comandi non coprono la barra di scorrimento (barra " + sb + " px, margine " + scost.toFixed(0) + ")");
    await p.screenshot({ path: `${OUT}/zoompc-${nm}-3-in-fondo.png` });
    /* fino al massimo: «+» si spegne */
    for (let i = 0; i < 12 && !(await spento(p, "bgl-piu")); i++) { await p.click("#bgl-piu"); await p.waitForTimeout(60); }
    E.ok(await spento(p, "bgl-piu"), chi + ": al massimo «+» è spento");
    const wMax = await larg(p); await p.click("#bgl-piu", { force: true }); await p.waitForTimeout(100);
    E.ok(vicino(await larg(p), wMax, 1), chi + ": e non ingrandisce oltre");
    /* «Vista intera» da tastiera */
    await p.focus("#bgl-intera"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    E.ok(vicino(await larg(p), w0, 1) && await spento(p, "bgl-meno") && !(await p.$(".mappa.ingrandita")), chi + ": «Vista intera» (Invio) torna alla pianta intera");
    await p.focus("#bgl-piu"); await p.keyboard.press("Space"); await p.waitForTimeout(150);
    E.ok(vicino((await larg(p)) / w0, 1.6, 0.03), chi + ": «+» con la barra spaziatrice");
    E.ok(await p.evaluate(() => document.activeElement && document.activeElement.id === "bgl-piu"), chi + ": il fuoco resta sul comando");
    await p.click("#bgl-piu"); await p.waitForTimeout(150);

    /* 5. trascinare */
    E.ok((await cursore(p, "#bgl-mappa")) === "grab", chi + ": ingranditi, sulla pianta la manina «afferra»");
    await p.$eval("#bgl-mappa", (m) => { m.scrollLeft = 40; m.scrollTop = 450; });
    await p.waitForTimeout(80);
    /* un posto libero ben dentro la parte visibile */
    const kT = await p.evaluate(() => {
      const m = document.getElementById("bgl-mappa").getBoundingClientRect();
      const g = [...document.querySelectorAll('#bgl-mappa g.posto.libero[role="button"]')].find((g) => {
        const r = g.getBoundingClientRect(); return r.left > m.left + 250 && r.right < m.right - 250 && r.top > m.top + 150 && r.bottom < m.bottom - 150;
      });
      return g && g.getAttribute("data-k");
    });
    E.ok(!!kT, chi + ": un posto libero in mezzo alla vista (" + kT + ")");
    const cT = await centro(p, kT), s0 = await scorri(p);
    await p.mouse.move(cT.x, cT.y); await p.mouse.down();
    await p.mouse.move(cT.x - 40, cT.y - 30, { steps: 4 });
    const cDurante = await cursore(p, "#bgl-mappa");
    await p.mouse.move(cT.x - 120, cT.y - 80, { steps: 6 });
    const sopra = await p.evaluate(({ x, y }) => { const g = document.elementFromPoint(x, y); const h = g && g.closest && g.closest("g.posto"); return h && h.getAttribute("data-k"); }, { x: cT.x - 120, y: cT.y - 80 });
    /* rilascio su un altro posto */
    await p.mouse.up();
    await p.waitForTimeout(150);
    const s1 = await scorri(p);
    E.ok(vicino(s1.l - s0.l, 120, 3) && vicino(s1.t - s0.t, 80, 3), chi + ": il trascinamento sposta la pianta (" + (s1.l - s0.l) + ", " + (s1.t - s0.t) + ")");
    E.ok(cDurante === "grabbing", chi + ": durante il trascinamento la manina chiusa (" + cDurante + ")");
    const scelti = await p.$$eval("#bgl-mappa g.posto.scelto", (v) => v.length);
    E.ok(scelti === 0 && !!sopra, chi + ": il trascinamento non sceglie né il posto di partenza né quello del rilascio (" + sopra + ")");
    E.ok((await cursore(p, "#bgl-mappa")) === "grab", chi + ": dopo, di nuovo «afferra»");
    await p.waitForTimeout(500);
    /* un clic che trema (3 px) resta un clic */
    const cT2 = await centro(p, kT);
    await p.mouse.move(cT2.x, cT2.y); await p.mouse.down(); await p.mouse.move(cT2.x + 2, cT2.y + 2); await p.mouse.up();
    await p.waitForTimeout(150);
    E.ok(/posto scelto/.test(await cls(p, kT)), chi + ": un clic con il mouse che trema (3 px) sceglie il posto");
    const s2 = await scorri(p);
    E.ok(s2.l === s1.l && s2.t === s1.t, chi + ": e la pianta non si sposta");
    await p.screenshot({ path: `${OUT}/zoompc-${nm}-4-trascinata.png` });
    await p.waitForTimeout(500);

    /* 6. rotellina */
    await p.click("#bgl-intera"); await p.waitForTimeout(150);
    await p.evaluate(() => window.scrollTo(0, 0));
    const cM = await centro(p, "Platea|F|10");
    await p.mouse.move(cM.x, cM.y);
    const y0 = await p.evaluate(() => window.scrollY);
    await p.mouse.wheel(0, 300); await p.waitForTimeout(400);
    const y1 = await p.evaluate(() => window.scrollY);
    E.ok(y1 > y0 + 50 && vicino(await larg(p), w0, 1), chi + ": rotellina senza Ctrl sulla pianta intera: scorre la pagina (" + y0 + " → " + y1 + "), zoom uguale");
    /* ingranditi e con la pianta già in fondo: la rotellina passa alla pagina */
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.click("#bgl-piu"); await p.waitForTimeout(150);
    await p.$eval("#bgl-mappa", (m) => { m.scrollTop = m.scrollHeight; });
    const cM2 = await p.$eval("#bgl-mappa", (m) => { const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.move(cM2.x, cM2.y);
    const wz = await larg(p), y2 = await p.evaluate(() => window.scrollY);
    for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 200); await p.waitForTimeout(250); }
    const y3 = await p.evaluate(() => window.scrollY);
    E.ok(y3 > y2 + 50 && vicino(await larg(p), wz, 1), chi + ": ingranditi, pianta in fondo: la rotellina scorre la pagina, non resta intrappolata (" + y2 + " → " + y3 + ")");
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.click("#bgl-intera"); await p.waitForTimeout(150);
    const cM3 = await centro(p, "Platea|F|10");
    await p.mouse.move(cM3.x, cM3.y);
    await p.keyboard.down("Control"); await p.mouse.wheel(0, -100); await p.keyboard.up("Control");
    await p.waitForTimeout(300);
    const wc = await larg(p);
    E.ok(wc > w0 * 1.3, chi + ": Ctrl+rotellina ingrandisce (" + w0.toFixed(0) + " → " + wc.toFixed(0) + ")");
    const cM4 = await centro(p, "Platea|F|10");
    E.ok(vicino(cM4.x, cM3.x, 6) && vicino(cM4.y, cM3.y, 6), chi + ": attorno al punto sotto il mouse");
    /* nessuno sfora in larghezza */
    E.ok((await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, chi + ": la pagina non sfora in larghezza");
    await ctx.close();
  }

  /* ============ TELEFONO (come prima) ============ */
  chi = `${nm} telefono`;
  if (!process.env.SOLO || process.env.SOLO === chi) {
    const ctx = await contesto(br, TELEFONO), p = await ctx.newPage(); sorveglia(p, chi, errori);
    await p.goto(scheda); await p.waitForSelector("#bgl-mappa svg");
    await p.waitForTimeout(300);
    E.ok(!(await p.evaluate(() => matchMedia(BGL.MEDIA_MOUSE).matches)), chi + ": il browser NON è «computer col mouse»");
    E.ok(await p.isVisible("#bgl-zoom") && !(await p.$(".zoom-pc")) && !(await p.$(".mappa.mouse")), chi + ": «Ingrandisci» come prima, niente comandi del computer");
    E.ok((await p.textContent("#bgl-sugg")) === "Tocca la pianta o allargala con due dita, poi scegli i posti.", chi + ": suggerimento del telefono invariato");
    await p.screenshot({ path: `${OUT}/zoompc-${nm}-5-telefono.png` });
    const w0 = await larg(p);
    /* il posto a metà schermo: in fondo c'è la barra fissa, che prenderebbe il tocco */
    const metà = (k) => p.$eval(sel(k), (g) => g.scrollIntoView({ block: "center", inline: "center" }));
    await metà("Platea|D|10"); await p.waitForTimeout(150);
    const c = await centro(p, "Platea|D|10");
    await p.touchscreen.tap(c.x, c.y); await p.waitForTimeout(300);
    const w1 = await larg(p);
    E.ok(w1 > w0 * 1.5 && /posto libero/.test(await cls(p, "Platea|D|10")) && !!(await p.$(".mappa.ingrandita")),
      chi + ": il primo tocco ingrandisce e non sceglie (" + w0.toFixed(0) + " → " + w1.toFixed(0) + ")");
    await p.waitForTimeout(500);
    await metà("Platea|D|10"); await p.waitForTimeout(150);
    const c2 = await centro(p, "Platea|D|10");
    await p.touchscreen.tap(c2.x, c2.y); await p.waitForTimeout(300);
    E.ok(/posto scelto/.test(await cls(p, "Platea|D|10")), chi + ": da ingranditi il tocco sceglie");
    await p.waitForTimeout(500);
    await p.click("#bgl-zoom"); await p.waitForTimeout(200);
    E.ok(vicino(await larg(p), w0, 1), chi + ": «Vista intera» torna alla pianta intera");
    /* due dita (eventi touch sintetici: i gestori leggono solo touches[i].clientX/Y) */
    const r = await p.$eval("#bgl-mappa", (m) => { const b = m.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + 150 }; });
    await p.evaluate(({ x, y }) => {
      const m = document.getElementById("bgl-mappa");
      const ev = (tipo, d) => {
        const e = new Event(tipo, { bubbles: true, cancelable: true });
        const t = d == null ? [] : [{ clientX: x - d, clientY: y }, { clientX: x + d, clientY: y }];
        Object.defineProperty(e, "touches", { value: t });
        m.dispatchEvent(e);
      };
      ev("touchstart", 30);
      for (let d = 34; d <= 90; d += 8) ev("touchmove", d);
      ev("touchend", null);
    }, r);
    await p.waitForTimeout(200);
    const w2 = await larg(p);
    E.ok(vicino(w2 / w0, 3, 0.1), chi + ": allargando due dita da 60 a 180 px la pianta si ingrandisce ×3 (" + (w2 / w0).toFixed(2) + ")");
    E.ok((await p.$$eval("#bgl-mappa g.posto.scelto", (v) => v.length)) === 1, chi + ": le due dita non scelgono niente");
    await p.screenshot({ path: `${OUT}/zoompc-${nm}-6-telefono-dita.png` });
    E.ok((await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, chi + ": la pagina non sfora in larghezza");
    await ctx.close();
  }
  await br.close();
}
sito.chiudi();
const veri = errori.filter((x) => !/frame-ancestors' is ignored/.test(x));
E.ok(veri.length === 0, "nessun errore in console: " + veri.slice(0, 3).join(" | "));
E.fine();
