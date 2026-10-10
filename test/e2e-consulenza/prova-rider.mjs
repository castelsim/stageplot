/* «Rider pronto» senza progetto: la catena intera sullo stack Supabase LOCALE, mai produzione.
   pagina /consulenza/ (copia di prova FUORI dal repo, Payment Link FINTO solo lì) → create-consultation → file nel bucket
   privato col link firmato → «Stripe» finto (si legge solo l'indirizzo) → stripe-webhook con un evento firmato come Stripe →
   mail a Simone (intercettata: niente Resend) → link firmati che scaricano proprio quei file → pulizia degli allegati.
   Chromium e WebKit, telefono e computer. Le Edge Function girano con Deno su porte di questo Mac (funzione.ts), non
   nell'edge runtime condiviso. Accesso Google finto (sessione dello stack locale iniettata), utenti @example.invalid.
   Uso: node test/e2e-consulenza/prova-rider.mjs   (OUT = cartella di copia e screenshot, fuori dal repo;
   SOLO="webkit-computer" un giro solo; PULIZIA_VERA=1 anche retention-purge vera, solo su uno stack non condiviso)
   Prima: stack locale acceso con la migrazione 0081 applicata. */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, cpSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, webkit, API, ANON, SERV, TELEFONO, COMPUTER, utente, contesto, avviaSito, sorveglia, esito, http } from "../e2e-biglietteria/comune.mjs";

const WT = new URL("../..", import.meta.url).pathname;
const OUT = process.env.OUT || join(tmpdir(), "rider-senza-progetto");
const SITO = join(OUT, "sito"), POSTA = join(OUT, "posta.jsonl"), SHOT = join(OUT, "shot");
const PAY_FINTO = "https://buy.stripe.com/test_rider_pronto_FINTO";   /* SOLO nella copia di prova, mai nel repo */
const WHSEC = "whsec_prova_locale_finto", WORKER = "segreto-worker-di-prova";
const PROD_URL = "https://vsodplqkuvnsdiikvmjb.supabase.co";
const e = esito();
const errori = [];

/* ───────────── la copia di prova del sito */
rmSync(SITO, { recursive: true, force: true }); mkdirSync(SITO, { recursive: true }); mkdirSync(SHOT, { recursive: true });
for (const d of ["consulenza", "vendor", "accedi", "privacy", "favicon.svg", "404.html"]) if (existsSync(join(WT, d))) cpSync(join(WT, d), join(SITO, d), { recursive: true });
{
  const f = join(SITO, "consulenza/index.html");
  let h = readFileSync(f, "utf8");
  const prodAnon = /var SB_ANON = "([^"]+)"/.exec(h)[1];
  h = h.split(PROD_URL).join(API).split(prodAnon).join(ANON);
  if (!h.includes('"rider-pronto": "",')) throw new Error("nel repo PAY[rider-pronto] non è vuoto");
  h = h.replace('"rider-pronto": "",', `"rider-pronto": "${PAY_FINTO}",`);
  if (h.includes(PROD_URL)) throw new Error("resta la produzione nella copia");
  writeFileSync(f, h);
}

/* ───────────── le Edge Function su porte di questo Mac */
const ENV = { ...process.env, SUPABASE_URL: API, SUPABASE_SERVICE_ROLE_KEY: SERV, STRIPE_SECRET_KEY: "sk_test_finto",
  STRIPE_WEBHOOK_SECRET: WHSEC, RESEND_API_KEY: "re_finto", NOTIFY_EMAIL: "simone-prova@example.invalid", CONSULTATION_WORKER_SECRET: WORKER };
rmSync(POSTA, { force: true });
const figli = [];
async function funzione(nome) {
  const porta = 8700 + Math.floor(Math.random() * 90);
  const p = spawn("deno", ["run", "-A", "--lock=deno.lock", "--frozen", "test/e2e-consulenza/funzione.ts", `supabase/functions/${nome}/index.ts`, String(porta), POSTA],
    { cwd: WT, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  figli.push(p);
  let log = ""; p.stdout.on("data", (d) => { log += d; }); p.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 200 && !log.includes("pronta su"); i++) await new Promise((r) => setTimeout(r, 100));
  if (!log.includes("pronta su")) throw new Error(nome + " non parte: " + log);
  return { url: "http://127.0.0.1:" + porta, log: () => log };
}
const fine = () => { for (const p of figli) p.kill(); };
process.on("exit", fine);

const FN = {
  crea: await funzione("create-consultation"),
  webhook: await funzione("stripe-webhook"),
  pulizia: await funzione("retention-purge"),
};

const leggiRichiesta = (id) => http(`/rest/v1/consultation_requests?id=eq.${id}&select=*`, null, { method: "GET" }).then((r) => r.d[0]);
const scaricaServizio = (path) => fetch(`${API}/storage/v1/object/authenticated/consultation-uploads/${path}`, { headers: { apikey: SERV, Authorization: "Bearer " + SERV } })
  .then(async (r) => ({ status: r.status, buf: Buffer.from(await r.arrayBuffer()) }));
const posta = () => (existsSync(POSTA) ? readFileSync(POSTA, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

function eventoFirmato(sessione) {
  const ev = { id: "evt_test_" + randomUUID().replace(/-/g, ""), object: "event", type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000), data: { object: sessione } };
  const corpo = JSON.stringify(ev), t = Math.floor(Date.now() / 1000);
  const firma = createHmac("sha256", WHSEC).update(`${t}.${corpo}`).digest("hex");
  return fetch(FN.webhook.url, { method: "POST", headers: { "stripe-signature": `t=${t},v1=${firma}`, "Content-Type": "application/json" }, body: corpo })
    .then(async (r) => ({ status: r.status, d: await r.json().catch(() => null) }));
}
const sessioneStripe = (requestId, { amount = 5900, email = "cliente@example.invalid" } = {}) => ({
  id: "cs_test_" + randomUUID().replace(/-/g, ""), object: "checkout.session", client_reference_id: requestId,
  payment_intent: "pi_test_" + randomUUID().replace(/-/g, ""), payment_status: "paid", amount_total: amount, currency: "eur",
  customer_details: { email }, metadata: {} });

/* file di prova (contenuto inventato) */
const PDF = Buffer.from("%PDF-1.4\n% rider di prova inventato\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const DOCX = Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(3000, 65)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000, 7), Buffer.from([0xff, 0xd9])]);

/* ───────────── 1. la funzione, senza browser: cosa accetta e cosa no */
const A = await utente(`rider-a-${Date.now()}@example.invalid`, { full_name: "Mario Prova" });
const B = await utente(`rider-b-${Date.now()}@example.invalid`, { full_name: "Altro Prova" });
const progB = await http("/rest/v1/stageplot_projects", { user_id: B.user.id, title: "Progetto di B", data: { _v: 1, items: [] } }, { key: ANON, token: B.access_token });
const crea = (tok, body) => fetch(FN.crea.url, { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, d: await r.json().catch(() => null) }));
const riderBase = { nome: "Mario Prova", email: "mario@example.invalid", descrizione: "Trio di prova" };
{
  e.ok((await crea(A.access_token, { product: "pro-review" })).status === 400, "funzione: Consulenza Tecnica senza progetto → 400");
  e.ok((await crea(A.access_token, { product: "production-pack", rider: riderBase })).status === 400, "funzione: Produzione completa col modulo del rider → 400");
  e.ok((await crea(A.access_token, { product: "rider-pronto", rider: { nome: "M", email: "m@example.invalid" } })).status === 400, "funzione: rider senza file né descrizione → 400");
  e.ok((await crea(A.access_token, { product: "rider-pronto", rider: { ...riderBase, files: [{ name: "x.exe", type: "application/x-msdownload", size: 10 }] } })).status === 400, "funzione: .exe → 400");
  e.ok((await crea(A.access_token, { product: "rider-pronto", rider: { ...riderBase, files: [{ name: "x.pdf", type: "application/pdf", size: 10_485_761 }] } })).status === 400, "funzione: oltre 10 MB → 400");
  e.ok((await crea(A.access_token, { product: "rider-pronto", rider: { ...riderBase, files: Array.from({ length: 9 }, (_, i) => ({ name: i + ".pdf", type: "application/pdf", size: 9 })) } })).status === 400, "funzione: 9 file → 400");
  e.ok((await crea(A.access_token, { product: "rider-pronto", project_id: progB.d[0].id, rider: riderBase })).status === 403, "funzione: il progetto di un altro account → 403");
  e.ok((await crea(ANON, { product: "rider-pronto", rider: riderBase })).status === 401, "funzione: senza accesso → 401");
  const solo = await crea(A.access_token, { product: "rider-pronto", rider: riderBase });
  e.ok(solo.status === 200 && solo.d.request_id && Array.isArray(solo.d.uploads) && solo.d.uploads.length === 0, "funzione: basta la descrizione (nessun file)");
  const r = await leggiRichiesta(solo.d.request_id);
  e.ok(r.senza_progetto === true && r.project_id === null && r.notes === "Trio di prova" && r.paid === false && r.status === "new", "la richiesta nasce senza progetto, non pagata");
  /* integrità: un pagamento con l'importo di un altro pacchetto non evade la richiesta */
  const w = await eventoFirmato(sessioneStripe(solo.d.request_id, { amount: 2900 }));
  const dopo = await leggiRichiesta(solo.d.request_id);
  e.ok(w.status === 200 && w.d.fulfilled === false && dopo.paid === false && dopo.status === "payment_mismatch", "webhook: 29 € su un Rider pronto → non pagata, payment_mismatch");
  const finto = await fetch(FN.webhook.url, { method: "POST", headers: { "stripe-signature": "t=1,v1=00" }, body: "{}" });
  e.ok(finto.status === 400, "webhook: firma sbagliata → 400");
}

/* ───────────── 2. nel browser: telefono e computer, Chromium e WebKit */
const giri = [["chromium", chromium, "telefono", TELEFONO], ["chromium", chromium, "computer", COMPUTER], ["webkit", webkit, "telefono", TELEFONO], ["webkit", webkit, "computer", COMPUTER]]
  .filter((g) => !process.env.SOLO || process.env.SOLO.split(" ").includes(g[0] + "-" + g[2]));   /* SOLO="chromium-telefono" = un giro */
const sito = await avviaSito(SITO);
for (const [motore, tipoBrowser, disp, device] of giri) {
  const chi = `${motore}-${disp}`;
  const conProgetto = chi === "webkit-computer";
  const U = await utente(`rider-${chi}-${Date.now()}@example.invalid`, { full_name: "Cliente Prova " + chi });
  let progId = null;
  if (conProgetto) progId = (await http("/rest/v1/stageplot_projects", { user_id: U.user.id, title: "Il mio palco di prova", data: { _v: 1, items: [] } }, { key: ANON, token: U.access_token })).d[0].id;
  const browser = await tipoBrowser.launch();
  const ctx = await contesto(browser, device, { sessione: U });
  /* la funzione vera, sulla sua porta; il browser crede di parlare con /functions/v1 (CORS di stageplot.it riscritto per l'origine di prova) */
  await ctx.route("**/functions/v1/create-consultation", async (route) => {
    const req = route.request();
    const cors = { "access-control-allow-origin": sito.url, "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: cors, body: "ok" });
    const r = await fetch(FN.crea.url, { method: "POST", headers: { Authorization: req.headers()["authorization"] || "", "Content-Type": "application/json" }, body: req.postData() });
    return route.fulfill({ status: r.status, headers: { ...cors, "content-type": "application/json" }, body: await r.text() });
  });
  let pagamento = null;
  await ctx.route("https://buy.stripe.com/**", (route) => { pagamento = route.request().url(); route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Stripe finto</h1>" }); });
  const page = await ctx.newPage();
  sorveglia(page, chi, errori);
  await page.goto(sito.url + "/consulenza/#offerte");
  await page.waitForSelector("#cardRiderPronto:not([hidden])", { timeout: 10000 });
  await page.click('[data-product="rider-pronto"]');
  await page.waitForSelector("#odRider:not([hidden])", { timeout: 10000 });
  e.ok(await page.isHidden("#odProjectSec"), chi + ": niente «Per quale Stage Plot?» obbligatorio");
  await page.waitForFunction(() => document.getElementById("odNome").value && document.getElementById("odEmail").value);
  e.ok((await page.inputValue("#odNome")) === "Cliente Prova " + chi && (await page.inputValue("#odEmail")) === U.user.email, chi + ": nome ed email dall'account, modificabili");
  if (conProgetto) await page.waitForSelector("#odRiderProjWrap:not([hidden])", { timeout: 5000 });
  e.ok((await page.isVisible("#odRiderProjWrap")) === conProgetto, chi + (conProgetto ? ": chi ha progetti può sceglierne uno" : ": senza progetti niente scelta"));
  await page.screenshot({ path: join(SHOT, `${chi}-1-modulo.png`), fullPage: false });

  /* niente materiale → messaggio, nessuna richiesta */
  await page.click("#odPay");
  await page.waitForFunction(() => /Allega almeno un file/.test(document.getElementById("odMsg").textContent));
  e.ok(pagamento === null, chi + ": senza materiale non si va al pagamento");

  /* file: uno non ammesso e uno troppo grande vengono scartati con un messaggio, gli altri restano in lista */
  await page.setInputFiles("#odFiles", [
    { name: "rider vecchio.pdf", mimeType: "application/pdf", buffer: PDF },
    { name: "lista canali.docx", mimeType: "", buffer: DOCX },
    { name: "palco.jpg", mimeType: "image/jpeg", buffer: JPG },
    { name: "programma.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") },
  ]);
  await page.setInputFiles("#odFiles", [{ name: "enorme.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(10_485_761, 1) }]);
  const lista = await page.$$eval("#odFileList .fn", (xs) => xs.map((x) => x.textContent));
  e.ok(JSON.stringify(lista) === JSON.stringify(["rider vecchio.pdf", "lista canali.docx", "palco.jpg"]), chi + ": in lista i 3 file ammessi (" + lista.join(", ") + ")");
  e.ok(/supera 10 MB/.test(await page.textContent("#odMsg")), chi + ": il file oltre 10 MB è spiegato");
  /* togli e rimetti */
  await page.setInputFiles("#odFiles", [{ name: "da togliere.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) }]);
  await page.click('#odFileList [aria-label="Togli da togliere.png"]');
  e.ok((await page.$$("#odFileList li")).length === 3, chi + ": «Togli» toglie il file");
  const box = await page.$eval('#odFileList button', (b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  e.ok(box.w >= 44 && box.h >= 36, chi + `: «Togli» si tocca col dito (${Math.round(box.w)}×${Math.round(box.h)})`);
  await page.fill("#odDesc", "Quintetto di prova: voce, due chitarre, basso, batteria.");
  await page.fill("#odPer", "I Prova " + chi);
  await page.fill("#odData", "2026-11-13");
  await page.fill("#odEmail", `consegna-${chi}@example.invalid`);
  if (conProgetto) await page.selectOption("#odRiderProject", progId);
  const larghezza = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  e.ok(larghezza, chi + ": niente scorrimento di lato");
  await page.screenshot({ path: join(SHOT, `${chi}-2-compilato.png`), fullPage: false });
  await page.$eval("#orderDrawer", (d) => { d.scrollTop = d.scrollHeight; });
  await page.screenshot({ path: join(SHOT, `${chi}-3-fondo.png`), fullPage: false });

  /* il secondo file non parte (rete che cade): niente pagamento, messaggio chiaro, il bottone torna attivo */
  let caricamenti = 0;
  const rompi = (route) => (++caricamenti === 2 ? route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"giù"}' }) : route.continue());
  await page.route("**/storage/v1/object/upload/sign/**", rompi);
  await page.click("#odPay");
  await page.waitForFunction(() => /non è partito/.test(document.getElementById("odMsg").textContent), null, { timeout: 15000 }).catch(() => {});
  const msgRotto = await page.textContent("#odMsg", { timeout: 2000 }).catch(() => "(pagina cambiata)");
  e.ok(/«lista canali\.docx» non è partito/.test(msgRotto) && pagamento === null && !(await page.isDisabled("#odPay", { timeout: 2000 }).catch(() => true)),
    chi + ": un file che non parte ferma il pagamento e lo dice");
  await page.unroute("**/storage/v1/object/upload/sign/**", rompi);
  pagamento = null;
  await page.click("#odPay", { timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 100 && !pagamento; i++) await page.waitForTimeout(100);
  e.ok(!!pagamento && pagamento.startsWith(PAY_FINTO + "?client_reference_id="), chi + ": dopo il caricamento si va al Payment Link (finto)");
  if (!pagamento) { await page.screenshot({ path: join(SHOT, `${chi}-ERRORE.png`) }); console.log("   msg:", await page.textContent("#odMsg").catch(() => "")); await browser.close(); continue; }
  const u = new URL(pagamento), rid = u.searchParams.get("client_reference_id");
  e.ok(u.searchParams.get("prefilled_email") === `consegna-${chi}@example.invalid`, chi + ": email della consegna precompilata su Stripe");
  const row = await leggiRichiesta(rid);
  e.ok(row && row.user_id === U.user.id && row.product === "rider-pronto" && row.senza_progetto === !conProgetto && row.project_id === (conProgetto ? progId : null),
    chi + (conProgetto ? ": richiesta col progetto scelto" : ": richiesta senza progetto"));
  e.ok(row.rider_per === "I Prova " + chi && row.event_date === "2026-11-13" && /Quintetto/.test(row.notes) && row.email === `consegna-${chi}@example.invalid`, chi + ": per chi, data, descrizione, email salvati");
  e.ok(row.attachments.length === 3 && row.attachments.every((a) => a.path.startsWith(`rider/${rid}/`)), chi + ": 3 allegati nella cartella della richiesta");
  const tipi = row.attachments.map((a) => a.type).join(",");
  e.ok(tipi === "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg", chi + ": tipi dall'estensione (anche col tipo vuoto del browser)");
  const contenuti = await Promise.all(row.attachments.map((a) => scaricaServizio(a.path)));
  e.ok(contenuti.every((c) => c.status === 200) && contenuti[0].buf.equals(PDF) && contenuti[1].buf.equals(DOCX) && contenuti[2].buf.equals(JPG), chi + ": nel bucket ci sono proprio quei file");
  /* privacy: chi li ha caricati e un altro account non li leggono */
  for (const [nome, tok] of [["chi li ha caricati", U.access_token], ["un altro account", B.access_token], ["l'anonimo", ANON]]) {
    const st = await fetch(`${API}/storage/v1/object/authenticated/consultation-uploads/${row.attachments[0].path}`, { headers: { apikey: ANON, Authorization: "Bearer " + tok } }).then((r) => r.status);
    e.ok(st !== 200, `${chi}: ${nome} non scarica il file (${st})`);
  }
  await browser.close();

  /* «Stripe» paga: evento firmato → webhook → mail a Simone con i link firmati */
  const prima = posta().length;
  const w = await eventoFirmato(sessioneStripe(rid));
  e.ok(w.status === 200 && w.d.fulfilled === true, chi + ": webhook → richiesta evasa " + JSON.stringify(w.d));
  const pagata = await leggiRichiesta(rid);
  e.ok(pagata.paid === true && pagata.status === "paid" && pagata.notification_status === "sent", chi + ": pagata e notificata");
  const mail = posta().slice(prima)[0];
  e.ok(!!mail && mail.to[0] === "simone-prova@example.invalid" && /Rider pronto/.test(mail.subject), chi + ": una mail a Simone");
  if (mail) {
    e.ok(conProgetto ? /\?view=/.test(mail.html) : !/\?view=/.test(mail.html) && /Senza progetto StagePlot/.test(mail.html), chi + (conProgetto ? ": col progetto la mail ha il link vivo" : ": senza progetto niente link vivo"));
    e.ok(/rider vecchio\.pdf/.test(mail.html) && /lista canali\.docx/.test(mail.html) && /palco\.jpg/.test(mail.html) && /I Prova/.test(mail.html) && /13\/11\/2026/.test(mail.html), chi + ": nella mail file, per chi e data");
    const link = [...mail.html.matchAll(/href="([^"]+\/object\/sign\/consultation-uploads\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const giu = await Promise.all(link.map((l) => fetch(l).then(async (r) => ({ s: r.status, b: Buffer.from(await r.arrayBuffer()) }))));
    e.ok(link.length === 3 && giu.every((g) => g.s === 200) && giu[0].b.equals(PDF), chi + ": i link firmati della mail scaricano i file");
    writeFileSync(join(SHOT, `${chi}-4-mail.html`), mail.html);
  }
  /* lo stesso evento ripetuto non manda una seconda mail */
  const n = posta().length;
  await eventoFirmato(sessioneStripe(rid));
  e.ok(posta().length === n, chi + ": un secondo pagamento sulla stessa richiesta non manda un'altra mail (doppio pagamento segnalato)");
}
sito.chiudi();

/* ───────────── 3. la pulizia: allegati scaduti tolti dal bucket, poi dimenticati */
if (process.env.PULIZIA_VERA === "1") {
  const v = await crea(A.access_token, { product: "rider-pronto", rider: { ...riderBase, files: [{ name: "vecchio.pdf", type: "application/pdf", size: PDF.length }] } });
  const up = v.d.uploads[0];
  await fetch(`${API}/storage/v1/object/upload/sign/consultation-uploads/${up.path}?token=${encodeURIComponent(up.token)}`, { method: "PUT", headers: { apikey: ANON, "Content-Type": "application/pdf" }, body: PDF });
  e.ok((await scaricaServizio(up.path)).status === 200, "pulizia: il file c'è");
  const DB = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" }).split("\n").find((x) => /^supabase_db_/.test(x));
  execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-qc", `update public.consultation_requests set created_at = now() - interval '8 days' where id = '${v.d.request_id}'`]);
  const p = await fetch(FN.pulizia.url, { method: "POST", headers: { "x-stageplot-worker-secret": WORKER } }).then(async (r) => ({ s: r.status, d: await r.json() }));
  e.ok(p.s === 200 && p.d.allegati_rider_tolti >= 1, "pulizia: retention-purge toglie gli allegati scaduti " + JSON.stringify(p.d));
  e.ok((await scaricaServizio(up.path)).status !== 200, "pulizia: il file non c'è più");
  const r = await leggiRichiesta(v.d.request_id);
  e.ok(r.attachments.length === 0 && !!r.allegati_rimossi_at, "pulizia: la richiesta non lo cita più");
} else console.log("  (pulizia vera saltata: PULIZIA_VERA=1 solo su uno stack non condiviso — retention-purge pulisce anche dati di altri)");

e.ok(errori.length === 0, "nessun errore in console: " + errori.join(" | "));
fine();
e.fine();
