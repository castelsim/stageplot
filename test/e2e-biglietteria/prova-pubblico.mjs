/* Pagine pubbliche dell'area (task 11) nel browser vero: Chromium e WebKit, telefono 390×844 e computer 1280×800,
   tema chiaro e scuro. Prima: stack locale con le migrazioni fino alla 0076 e una copia del sito:
     WT=<worktree> REF=lavoro DEST=<cartella> ./prepara.sh
     WT=<worktree> SITO=<cartella> OUT=<cartella screenshot> node prova-pubblico.mjs
   Dati inventati (@example.invalid, «Teatro di prova»); rete esterna bloccata. Non serve bgl-prenota: la prenotazione
   di prova la scrive il servizio con la funzione SQL. */
import { chromium, webkit, avviaSito, contesto, http, rpcServizio, utente, TELEFONO, COMPUTER, API, ANON, sorveglia, esito, P } from "./comune.mjs";
import { mkdirSync, readFileSync } from "node:fs";
const E = esito(), errori = [], S = Date.now().toString(36), OUT = process.env.OUT || P + "/out"; mkdirSync(OUT, { recursive: true });
const SITO = process.env.SITO || P + "/sito";
const ORG = "teatro-prova-" + S.slice(-5), ORG2 = "sala-prova-" + S.slice(-5);

/* organizzatore inventato: account, abilitazione (servizio), progetto, pagina, due spettacoli (uno con locandina) */
async function organizzatore(email, nome, slug, contatto) {
  const u = await utente(email);
  await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: u.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
  const rpc = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: u.access_token }).then((r) => r.d);
  const prog = (await http("/rest/v1/stageplot_projects", { user_id: u.user.id, title: "Sala di prova", data: { items: [] } }, { key: ANON, token: u.access_token })).d[0].id;
  const o = await rpc("bgl_organizzatore_salva", { p_dati: { nome, slug, contatto_email: contatto } });
  if (!o.ok) throw new Error("organizzatore: " + JSON.stringify(o));
  return { u, rpc, prog };
}
const posti = []; for (const [i, f] of ["A", "B"].entries()) for (let n = 1; n <= 5; n++) posti.push({ settore: "Platea", fila: f, posto: n, x: 200 + n * 60, y: 1000 + i * 90, w: 50, d: 53, rot: 180 });
const foto = { v: 1, box: [0, 0, 800, 1300], palco: [[[100, 100], [700, 100], [700, 800], [100, 800]]], pedane: [], posti };
const A = await organizzatore("organizzatore-" + S + "@example.invalid", "Teatro di prova", ORG, "info-prova@example.invalid");

/* una locandina vera, fatta da un canvas (verticale, 600×800) */
const b0 = await chromium.launch(), pg0 = await b0.newPage();
const jpeg = Buffer.from((await pg0.evaluate(() => { const c = document.createElement("canvas"); c.width = 600; c.height = 800;
  const g = c.getContext("2d"); const gr = g.createLinearGradient(0, 0, 0, 800); gr.addColorStop(0, "#7c2d12"); gr.addColorStop(1, "#1e1b4b");
  g.fillStyle = gr; g.fillRect(0, 0, 600, 800); g.fillStyle = "#fff"; g.font = "bold 64px sans-serif"; g.fillText("CONCERTO", 110, 330);
  g.font = "40px sans-serif"; g.fillText("di prova", 220, 400); return c.toDataURL("image/jpeg", 0.8); })).split(",")[1], "base64");
await b0.close();
const nome = A.u.user.id + "/" + [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("") + ".jpg";
const up = await fetch(`${API}/storage/v1/object/bgl-locandine/${nome}`, { method: "POST", headers: { apikey: ANON, Authorization: "Bearer " + A.u.access_token, "Content-Type": "image/jpeg" }, body: jpeg });
E.ok(up.ok, "locandina caricata nello spazio locale");
const fra = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const uno = await A.rpc("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: A.prog, titolo: "Concerto di prova", inizio: fra(48), luogo: "Teatro di prova, Città",
  pianta: foto, pubblicato: true, descrizione: "Prima riga.\nSeconda riga.", note: "Porte alle 20:30", locandina_path: nome } });
const due = await A.rpc("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: A.prog, titolo: "Recital senza locandina", inizio: fra(96), luogo: "Sala piccola", pianta: foto, pubblicato: true } });
const bozza = await A.rpc("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: A.prog, titolo: "Bozza che non si vede", inizio: fra(120), luogo: "Sala", pianta: foto } });
E.ok(uno.ok && due.ok && bozza.ok, "due spettacoli pubblicati e una bozza: " + JSON.stringify([uno.errore, due.errore, bozza.errore]));
/* una prenotazione (dal servizio, come farebbe bgl-prenota): 9 posti liberi sul primo */
const pren = await rpcServizio("bgl_prenota", { p_slug: uno.slug, p_posti: ["Platea|A|1"], p_nome: "Mario", p_cognome: "Rossi", p_email: "mario-" + S + "@example.invalid" });
E.ok(pren && pren.ok && pren.token, "prenotazione di prova: " + JSON.stringify(pren && pren.errore));
/* un secondo organizzatore con un solo spettacolo: la scheda grande (specifica §3.1) */
const B = await organizzatore("organizzatore2-" + S + "@example.invalid", "Sala di prova", ORG2, null);
const tre = await B.rpc("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: B.prog, titolo: "Serata unica di prova", inizio: fra(72), luogo: "Sala di prova", pianta: foto, pubblicato: true } });
E.ok(tre.ok, "spettacolo unico");

const sito = await avviaSito(SITO);
/* un'immagine caricata davvero (loading="lazy": si aspetta, non si guarda al volo) */
const caricata = (p, sel) => p.waitForFunction((q) => { const i = document.querySelector(q); return !!i && i.complete && i.naturalWidth > 0; }, sel, { timeout: 8000 }).then(() => true, () => false);
const sfora = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
for (const [nomeM, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) for (const tema of ["chiaro", "scuro"]) {
  const br = await motore.launch(), ctx = await contesto(br, { ...tipo, colorScheme: tema === "scuro" ? "dark" : "light" }), p = await ctx.newPage();
  const chi = `${nomeM} ${t} ${tema}`; sorveglia(p, chi, errori);
  const foto_ = (n) => p.screenshot({ path: `${OUT}/t11-${nomeM}-${t}-${tema}-${n}.png`, fullPage: true });
  await p.goto(sito.url + "/biglietteria/" + ORG.toUpperCase() + "/");                // la scorciatoia, come dal QR (maiuscole e barra: RF3)
  await p.waitForSelector(".carte");
  E.ok((await p.textContent("h1")).trim() === "Teatro di prova", chi + ": pagina dell'organizzatore");
  E.ok(JSON.stringify(await p.$$eval(".carta-titolo", (v) => v.map((x) => x.textContent))) === JSON.stringify(["Concerto di prova", "Recital senza locandina"]), chi + ": in ordine di data, senza la bozza");
  E.ok(await caricata(p, ".carta img.carta-loc"), chi + ": la locandina si vede");
  E.ok(/Recital senza locandina/.test(await p.textContent(".carta:nth-child(2) .riquadro")), chi + ": senza locandina, il riquadro con titolo e data");
  E.ok(/Ultimi 9 posti/.test(await p.textContent(".carte")), chi + ": «Ultimi 9 posti»");
  E.ok(/info-prova@example\.invalid/.test(await p.textContent(".org-contatto")), chi + ": contatto dell'organizzatore");
  E.ok(await sfora(p) <= 0, chi + ": niente scorrimento orizzontale (organizzatore)");
  await foto_("organizzatore");
  await p.click(".carta:first-child a");
  await p.waitForSelector("#bgl-mappa");
  E.ok(p.url().includes("?o=" + ORG + "&s=" + uno.slug_breve), chi + ": scheda all'indirizzo canonico");
  E.ok(await caricata(p, ".ev-locandina"), chi + ": locandina in testa");
  E.ok((await p.$eval(".ev-descrizione", (x) => x.innerText)).includes("Prima riga.\nSeconda riga."), chi + ": descrizione con l'a capo");
  E.ok((await p.textContent(".ev-marchio a")) === "Teatro di prova", chi + ": il nome dell'organizzatore porta alla sua pagina");
  E.ok((await p.getAttribute(".ev-cal a", "href")).startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE"), chi + ": link Google Calendar");
  E.ok(/Domande sullo spettacolo\? info-prova@example\.invalid/.test(await p.textContent(".piede")), chi + ": contatto nel piè di pagina");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#bgl-ics")]);
  const ics = readFileSync(await dl.path(), "utf8");
  E.ok(dl.suggestedFilename() === uno.slug_breve + ".ics" && /BEGIN:VEVENT/.test(ics) && /DTSTART:\d{8}T\d{6}Z/.test(ics) &&
    ics.replace(/\r\n /g, "").includes("URL:" + sito.url + "/biglietteria/" + ORG + "/" + uno.slug_breve), chi + ": file .ics con il link bello");
  E.ok(await sfora(p) <= 0, chi + ": niente scorrimento orizzontale (scheda)");
  await foto_("scheda");
  /* la prenotazione si fa come prima: un posto, avanti, il modulo */
  await p.click('#bgl-mappa g.posto.libero[data-k="Platea|B|3"]', { force: true });
  if (!(await p.$('#bgl-mappa g.posto.scelto'))) await p.click('#bgl-mappa g.posto.libero[data-k="Platea|B|3"]', { force: true });
  E.ok(await p.$('#bgl-mappa g.posto.scelto[data-k="Platea|B|3"]') !== null, chi + ": il posto si sceglie anche dalla scheda nuova");
  await p.click("#bgl-avanti");
  /* dal T19 prima la scelta: «Continua con Google» o «Prenota con nome ed email» */
  await p.waitForSelector("#bgl-mostra"); await p.click("#bgl-mostra");
  await p.waitForSelector("#bgl-form");
  E.ok(await p.$(".ev-cal") === null && await p.$(".ev-locandina") !== null, chi + ": nel modulo niente calendario");
  await p.goto(sito.url + "/biglietteria/?e=" + uno.slug);
  await p.waitForSelector("#bgl-mappa");
  E.ok(await p.$(".ev-locandina") !== null, chi + ": il link ?e= di prima mostra la stessa scheda");
  await p.goto(sito.url + "/biglietteria/?e=" + uno.slug + "&c=" + pren.token);
  await p.waitForSelector(".mia");
  E.ok(await p.$("#bgl-ics") !== null, chi + ": «la tua prenotazione» ha il calendario");
  const [dl2] = await Promise.all([p.waitForEvent("download"), p.click("#bgl-ics")]);
  E.ok(readFileSync(await dl2.path(), "utf8").includes("UID:" + uno.slug + "@stageplot.it"), chi + ": UID dallo slug della pagina");
  if (tema === "chiaro") await foto_("mia");
  await p.goto(sito.url + "/biglietteria/" + ORG + "/indirizzo-vecchio");
  await p.waitForSelector(".centro h1");
  E.ok((await p.textContent(".centro h1")) === "Spettacolo non trovato" && /Vedi gli spettacoli di Teatro di prova/.test(await p.textContent(".centro")), chi + ": RF3, porta all'elenco");
  await p.click(".centro a");
  await p.waitForSelector(".carte");
  E.ok(true, chi + ": e il link porta davvero all'elenco");
  await p.goto(sito.url + "/biglietteria/?o=" + ORG + "&s=" + bozza.slug_breve);
  await p.waitForSelector(".centro h1");
  E.ok((await p.textContent(".centro h1")) === "Spettacolo non trovato", chi + ": la bozza non ha scheda pubblica");
  await p.goto(sito.url + "/biglietteria/?o=nessuno-" + S.slice(-5));
  await p.waitForSelector(".centro h1");
  E.ok((await p.textContent(".centro h1")) === "Pagina non trovata" && /non esiste/.test(await p.textContent(".centro")), chi + ": organizzatore che non c'è");
  await p.goto(sito.url + "/biglietteria/" + ORG2);
  await p.waitForSelector(".carte.una");
  E.ok(await p.$(".carte.una .riquadro") !== null, chi + ": un solo spettacolo, la scheda grande col riquadro");
  E.ok(await sfora(p) <= 0, chi + ": niente scorrimento orizzontale (uno solo)");
  if (tema === "chiaro") await foto_("uno-solo");
  await br.close();
}
sito.chiudi();
E.ok(errori.length === 0, "nessun errore in console: " + errori.slice(0, 3).join(" | "));
E.fine();
