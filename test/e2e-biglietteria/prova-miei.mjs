/* «I tuoi posti» sulla pianta (segnalazione cf7adc04 del 07/10) e «Entra con Google» sopra la pianta, nel browser vero:
   Chromium e WebKit, telefono e computer. Stack Supabase LOCALE, Google finto, dati inventati.
   1. senza niente: nessun posto «tuo», nessuna voce in legenda, l'invito «Entra con Google», nessuna chiamata a Google;
   2. con il ricordo del dispositivo (?e=): i posti tuoi con la spunta, la nota «Vedi o disdici», il tocco dice dove disdire;
   3. con la sessione Google (+ il ricordo): la pianta compare PRIMA della risposta di bgl_mie_prenotazioni, poi si colora
      senza ridisegnare; i posti di un altro spettacolo no; «Sei entrato come … · Esci»; tema scuro; «Esci» li toglie;
   4. non collegato → sceglie un posto → «Entra con Google» → torna sulla pianta con la scelta e i suoi posti segnati;
      «Avanti» va dritto al modulo con Google.
   Prima:  WT=<worktree> REF=lavoro DEST=<cartella> ./prepara.sh
   Poi:    SITO=<cartella> OUT=<cartella screenshot> [SOLO="chromium telefono"] node prova-miei.mjs */
import { chromium, webkit, avviaSito, contesto, http, utente, rpcServizio, TELEFONO, COMPUTER, sorveglia, esito, P, ANON } from "./comune.mjs";
import { mkdirSync } from "node:fs";
const E = esito(), errori = [], S = Date.now().toString(36), OUT = process.env.OUT || P + "/out"; mkdirSync(OUT, { recursive: true });
const sito = await avviaSito(process.env.SITO || P + "/sito");
const org = await utente(`morg-${S}@example.invalid`);
await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
const ORG = "teatro-m-" + S;
const o = await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: ORG } });
E.ok(o && o.ok, "organizzatore di prova: " + JSON.stringify(o && o.errore));
const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala", data: { items: [] } }, { key: ANON, token: org.access_token })).d[0].id;
const posti = []; for (const [i, f] of ["A", "B", "C", "D"].entries()) for (let n = 1; n <= 8; n++) posti.push({ settore: "Platea", fila: f, posto: n, x: 200 + n * 60, y: 1000 + i * 90, w: 50, d: 53, rot: 180 });
const pianta = { v: 1, box: [0, 0, 900, 1500], palco: [[[100, 100], [800, 100], [800, 800], [100, 800]]], pedane: [], posti };
async function spettacolo(n) {
  const ev = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog, titolo: "Concerto di prova " + n,
    inizio: new Date(Date.now() + (72 + n) * 3600e3).toISOString(), luogo: "Teatro di prova", pianta, pubblicato: true } });
  if (!ev || !ev.ok) throw new Error("spettacolo: " + JSON.stringify(ev));
  return ev;
}
const prenota = (ev, p, email, uid) => rpcServizio("bgl_prenota", { p_slug: ev.slug, p_posti: p, p_nome: "Prova", p_cognome: "Prova", p_email: email,
  ...(uid ? { p_user_id: uid } : {}) });
async function zoom(p, t) { if (t === "telefono" && await p.isVisible("#bgl-zoom") && (await p.getAttribute("#bgl-zoom", "aria-pressed")) !== "true") await p.click("#bgl-zoom"); }
async function tocca(p, k) { const g = p.locator(`#bgl-mappa g.posto[data-k="${k}"]`); await g.scrollIntoViewIfNeeded(); await g.click(); }
const cls = (p, k) => p.getAttribute(`#bgl-mappa g.posto[data-k="${k}"]`, "class");
const miei = (p) => p.$$eval("#bgl-mappa g.posto.mio", (v) => v.map((g) => g.getAttribute("data-k")).sort());
const sfora = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const legMio = (p) => p.isVisible(".legenda .leg-mio");
/* conta le chiamate a bgl_mie_prenotazioni (e le può rallentare) */
function spiaMie(ctx, ritardo = 0) {
  const v = { n: 0 };
  ctx.route("**/rest/v1/rpc/bgl_mie_prenotazioni", async (r) => { v.n++; if (ritardo) await new Promise((x) => setTimeout(x, ritardo)); r.continue(); });
  return v;
}

let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) {
  const chi = `${nm} ${t}`; giro++;
  if (process.env.SOLO && process.env.SOLO !== chi) continue;
  const ev = await spettacolo(giro), altro = await spettacolo(giro + 10);
  const maria = await utente(`mmaria-${S}-${giro}@example.invalid`, { full_name: "Maria Bianchi", name: "Maria Bianchi" });
  /* gli altri: A 1 di Rossi; il ricordo: A 3, A 4; Google (Maria): B 1, B 2 qui, C 1 in un ALTRO spettacolo, B 5 disdetta */
  await prenota(ev, ["Platea|A|1"], `rossi-${S}-${giro}@example.invalid`);
  const ric = await prenota(ev, ["Platea|A|3", "Platea|A|4"], `luca-${S}-${giro}@example.invalid`);
  E.ok(ric && ric.ok && ric.token, chi + ": prenotazione del ricordo");
  const pm = await prenota(ev, ["Platea|B|1", "Platea|B|2"], maria.user.email, maria.user.id);
  await prenota(altro, ["Platea|C|1"], maria.user.email, maria.user.id);
  const dis = await prenota(ev, ["Platea|B|5"], maria.user.email, maria.user.id);
  E.ok(pm.ok && dis.ok, chi + ": prenotazioni di Maria");
  const d5 = await rpcServizio("bgl_disdici", { p_slug: ev.slug, p_token: dis.token });
  E.ok(d5 && d5.ok, chi + ": B 5 disdetta");
  const ricordo = JSON.stringify({ codice: ric.codice, token: ric.token, posti: ric.posti });
  const scheda = `${sito.url}/biglietteria/?o=${ORG}&s=${ev.slug_breve}`;
  const br = await motore.launch();

  /* 1. senza niente */
  let ctx = await contesto(br, tipo), p = await ctx.newPage(); sorveglia(p, chi, errori);
  let spia = spiaMie(ctx);
  await p.goto(scheda); await p.waitForSelector("#bgl-mappa svg");
  await p.waitForTimeout(800);
  E.ok((await miei(p)).length === 0 && !(await legMio(p)) && !(await p.$("#bgl-miei .nota")), chi + ": senza niente, nessun posto tuo, niente voce in legenda né nota");
  E.ok(/posto occupato/.test(await cls(p, "Platea|A|3")) && /posto occupato/.test(await cls(p, "Platea|B|1")), chi + ": i posti prenotati sono occupati per tutti");
  E.ok(await p.isVisible("#bgl-entra") && /Hai già prenotato\? Entra con Google/.test(await p.textContent("#bgl-accesso")), chi + ": l'invito «Entra con Google» sopra la pianta");
  const hEntra = await p.$eval("#bgl-entra", (b) => b.getBoundingClientRect().height);
  E.ok(hEntra >= 44, chi + ": «Entra con Google» alto almeno 44 px (" + hEntra + ")");
  E.ok(spia.n === 0 && !(await p.evaluate(() => !!(window.supabase && window.supabase.createClient))), chi + ": senza sessione nessuna chiamata e niente supabase-js");
  E.ok((await sfora(p)) <= 0, chi + ": non sfora in larghezza");
  await p.screenshot({ path: `${OUT}/miei-${nm}-${t}-1-niente.png`, fullPage: true });
  await ctx.close();

  /* 2. con il ricordo del dispositivo, aperta con ?e= */
  ctx = await contesto(br, tipo); p = await ctx.newPage(); sorveglia(p, chi, errori);
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) { /* niente */ } }, ["bgl:" + ev.slug, ricordo]);
  await p.goto(`${sito.url}/biglietteria/?e=${ev.slug}`); await p.waitForSelector("#bgl-mappa svg");
  await p.waitForSelector("#bgl-mappa g.posto.mio");
  E.ok(JSON.stringify(await miei(p)) === JSON.stringify(["Platea|A|3", "Platea|A|4"]), chi + ": col ricordo, A 3 e A 4 sono tuoi (" + (await miei(p)) + ")");
  E.ok(/posto occupato/.test(await cls(p, "Platea|A|1")) && /posto occupato/.test(await cls(p, "Platea|B|1")), chi + ": quelli degli altri restano occupati");
  E.ok(await legMio(p), chi + ": «I tuoi posti» in legenda");
  const nota = await p.textContent("#bgl-miei");
  E.ok(/Hai già prenotato: A 3 e A 4/.test(nota) && !!(await p.$(`#bgl-miei a[href*="c=${ric.token}"]`)) && !/Le mie prenotazioni/.test(nota), chi + ": nota con «Vedi o disdici» (" + nota.trim() + ")");
  E.ok(/Fila A, posto 3, tuo/.test(await p.getAttribute('#bgl-mappa g.posto[data-k="Platea|A|3"]', "aria-label"))
    && (await p.getAttribute('#bgl-mappa g.posto[data-k="Platea|A|3"]', "role")) === "img", chi + ": il lettore di schermo dice «tuo», non è un bottone");
  await zoom(p, t);
  await tocca(p, "Platea|A|3");
  await p.waitForFunction(() => /è tuo/.test(document.querySelector("#bgl-avviso").textContent));
  E.ok(/Il posto A 3 è tuo\./.test(await p.textContent("#bgl-avviso")) && !!(await p.$(`#bgl-avviso a[href*="c=${ric.token}"]`)), chi + ": toccandolo, «è tuo» + «Vedi o disdici»");
  E.ok(/posto mio/.test(await cls(p, "Platea|A|3")) && /Scegli i posti/.test(await p.textContent("#bgl-scelta")), chi + ": e non si sceglie");
  E.ok((await sfora(p)) <= 0, chi + ": non sfora in larghezza");
  await p.screenshot({ path: `${OUT}/miei-${nm}-${t}-2-ricordo.png`, fullPage: false });
  await ctx.close();

  /* 3. con la sessione Google (e il ricordo): la pianta prima, poi i colori */
  ctx = await contesto(br, tipo, { sessione: maria }); p = await ctx.newPage(); sorveglia(p, chi, errori);
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) { /* niente */ } }, ["bgl:" + ev.slug, ricordo]);
  spia = spiaMie(ctx, 2500);
  await p.goto(scheda); await p.waitForSelector("#bgl-mappa svg");
  E.ok(JSON.stringify(await miei(p)) === JSON.stringify(["Platea|A|3", "Platea|A|4"]) && /posto occupato/.test(await cls(p, "Platea|B|1")),
    chi + ": la pianta compare senza aspettare Google (prima solo il ricordo)");
  await p.evaluate(() => { window.__svg = document.querySelector("#bgl-mappa svg"); });
  await p.waitForSelector('#bgl-mappa g.posto.mio[data-k="Platea|B|1"]', { timeout: 15000 });
  E.ok(JSON.stringify(await miei(p)) === JSON.stringify(["Platea|A|3", "Platea|A|4", "Platea|B|1", "Platea|B|2"]), chi + ": con Google anche B 1 e B 2 (" + (await miei(p)) + ")");
  E.ok(await p.evaluate(() => window.__svg === document.querySelector("#bgl-mappa svg")), chi + ": colorata senza ridisegnare la pianta");
  E.ok(!/mio/.test(await cls(p, "Platea|C|1")) && !/mio/.test(await cls(p, "Platea|B|5")), chi + ": né l'altro spettacolo (C 1) né la disdetta (B 5)");
  const nota3 = await p.textContent("#bgl-miei");
  E.ok(/Hai già prenotato: A 3, A 4, B 1 e B 2/.test(nota3) && /Vedi o disdici/.test(nota3) && !!(await p.$('#bgl-miei a[href="/biglietteria/mie/"]')), chi + ": nota con i due link (" + nota3.trim() + ")");
  E.ok(new RegExp("Sei entrato come " + maria.user.email.replace(/[.]/g, "\\.")).test(await p.textContent("#bgl-accesso")) && !(await p.$("#bgl-entra")), chi + ": «Sei entrato come …» al posto dell'invito");
  await zoom(p, t);
  await tocca(p, "Platea|B|2");
  await p.waitForFunction(() => /è tuo/.test(document.querySelector("#bgl-avviso").textContent));
  E.ok(/Il posto B 2 è tuo\. Per disdire:/.test(await p.textContent("#bgl-avviso")) && !!(await p.$('#bgl-avviso a[href="/biglietteria/mie/"]')), chi + ": un posto di Google rimanda a «Le mie prenotazioni»");
  E.ok((await sfora(p)) <= 0, chi + ": non sfora in larghezza");
  await p.screenshot({ path: `${OUT}/miei-${nm}-${t}-3-google.png`, fullPage: false });
  await p.emulateMedia({ colorScheme: "dark" });
  await p.screenshot({ path: `${OUT}/miei-${nm}-${t}-3-google-scuro.png`, fullPage: false });
  await p.emulateMedia({ colorScheme: "light" });
  if (chi === "chromium computer") {
    /* il giro dei 20 s rilegge anche i tuoi posti (solo con la sessione) */
    const n0 = spia.n;
    await p.waitForTimeout(23500);
    E.ok(spia.n > n0, chi + ": il giro dei 20 s rilegge i tuoi posti (" + n0 + " → " + spia.n + ")");
  }
  /* «Esci»: i posti di Google tornano «occupati», resta il ricordo */
  await p.click("#bgl-esci-p");
  await p.waitForSelector("#bgl-entra", { timeout: 15000 });
  E.ok(JSON.stringify(await miei(p)) === JSON.stringify(["Platea|A|3", "Platea|A|4"]) && /posto occupato/.test(await cls(p, "Platea|B|1"))
    && !/Le mie prenotazioni/.test(await p.textContent("#bgl-miei")), chi + ": «Esci» → solo i posti del ricordo, torna l'invito");
  E.ok(await p.evaluate(() => document.activeElement && document.activeElement.id === "bgl-entra"), chi + ": il fuoco va su «Entra con Google»");
  await p.screenshot({ path: `${OUT}/miei-${nm}-${t}-3b-uscito.png`, fullPage: false });
  await ctx.close();

  /* 4. non collegato → sceglie → «Entra con Google» → torna sulla pianta con la scelta e i suoi posti */
  ctx = await contesto(br, tipo, { googleCome: maria }); p = await ctx.newPage(); sorveglia(p, chi, errori);
  /* WebKit non accetta un 302 da route.fulfill (come in prova-google): una pagina che rimanda */
  await ctx.route("https://accounts.google.com/**", (r) => {
    const u = new URL(r.request().url());
    const dove = u.searchParams.get("redirect_uri") + "#id_token=finto&state=" + u.searchParams.get("state");
    r.fulfill({ status: 200, contentType: "text/html", body: "<script>location.replace(" + JSON.stringify(dove) + ")</script>" });
  });
  await p.goto(scheda); await p.waitForSelector("#bgl-mappa svg");
  await zoom(p, t); await tocca(p, "Platea|D|1");
  E.ok(/posto scelto/.test(await cls(p, "Platea|D|1")), chi + ": D 1 scelto prima di entrare");
  await p.click("#bgl-entra");
  await p.waitForURL((u) => u.toString().startsWith(scheda), { timeout: 15000 });
  await p.waitForSelector('#bgl-mappa g.posto.mio[data-k="Platea|B|1"]', { timeout: 15000 });
  E.ok(!(await p.$("#bgl-form")) && /posto scelto/.test(await cls(p, "Platea|D|1")) && /D/.test(await p.textContent("#bgl-scelta")),
    chi + ": tornati da Google sulla pianta, con la scelta (" + (await p.textContent("#bgl-scelta")) + ")");
  E.ok(JSON.stringify(await miei(p)) === JSON.stringify(["Platea|B|1", "Platea|B|2"]) && /Sei entrato come/.test(await p.textContent("#bgl-accesso")), chi + ": e i tuoi posti segnati");
  E.ok(!!(await p.$('.piede a[href="/biglietteria/mie/"]')), chi + ": «Le mie prenotazioni» nel piede");
  await p.screenshot({ path: `${OUT}/miei-${nm}-${t}-4-entrato.png`, fullPage: false });
  await p.click("#bgl-avanti");
  await p.waitForSelector("#bgl-form");
  E.ok(!(await p.$("#bgl-google")) && /Prenoti con Google/.test(await p.textContent("main")), chi + ": «Avanti» → modulo con Google, niente scelta");
  await ctx.close();
  await br.close();
}
sito.chiudi();
const veri = errori.filter((x) => !/frame-ancestors' is ignored/.test(x));
E.ok(veri.length === 0, "nessun errore in console: " + veri.slice(0, 3).join(" | "));
E.fine();
