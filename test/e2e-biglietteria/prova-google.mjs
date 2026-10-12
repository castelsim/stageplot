/* «Continua con Google» (task 19) nel browser vero: Chromium e WebKit, telefono e computer. Google è FINTO: nessun
   account vero. Percorsi: Google → stessi posti → prenota (email dell'account, legata all'account) · Google annullato →
   modulo con nome ed email · senza Google, come prima · già collegati: niente scelta, «Le mie prenotazioni» nel piede.
   Prima:  WT=<worktree> REF=lavoro DEST=<cartella> ./prepara.sh
           (dal worktree) supabase functions serve --env-file <questa cartella>/env --no-verify-jwt
   Poi:    SITO=<cartella> OUT=<cartella screenshot> node prova-google.mjs
   Il limite per connessione (8 posti) e quello orario per IP sono veri: ogni giro ha il suo spettacolo e un suo
   «indirizzo» finto (cf-connecting-ip), così la prova non svuota i contatori degli altri. Dati inventati. */
import { chromium, webkit, avviaSito, contesto, http, utente, TELEFONO, COMPUTER, sorveglia, esito, P, ANON } from "./comune.mjs";
import { mkdirSync } from "node:fs";
const E = esito(), errori = [], S = Date.now().toString(36), OUT = process.env.OUT || P + "/out"; mkdirSync(OUT, { recursive: true });
const sito = await avviaSito(process.env.SITO || P + "/sito");
const org = await utente(`gorg-${S}@example.invalid`);
await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
const ORG = "teatro-g-" + S;
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
/* Google finto: WebKit non accetta un 302 da route.fulfill (handoff), quindi una pagina che rimanda */
const google = (ctx, frammento) => ctx.route("https://accounts.google.com/**", (r) => {
  const u = new URL(r.request().url());
  const dove = u.searchParams.get("redirect_uri") + frammento(u);
  r.fulfill({ status: 200, contentType: "text/html", body: "<script>location.replace(" + JSON.stringify(dove) + ")</script>" });
});
/* un «indirizzo» tutto suo per i limiti di bgl-prenota (vedi in testa) */
const ip = (ctx, n) => ctx.route("**/functions/v1/**", (r) => r.continue({ headers: { ...r.request().headers(), "cf-connecting-ip": `10.${(S.length * 7) % 250}.${n}.${Math.floor(Math.random() * 250)}` } }));
/* sul telefono la pianta intera ha i posti troppo piccoli: il primo tocco ingrandirebbe */
async function zoom(p, t) { if (t === "telefono" && await p.isVisible("#bgl-zoom") && (await p.getAttribute("#bgl-zoom", "aria-pressed")) !== "true") await p.click("#bgl-zoom"); }
async function tocca(p, k) { const g = p.locator(`#bgl-mappa g.posto[data-k="${k}"]`); await g.scrollIntoViewIfNeeded(); await g.click(); }
const sfora = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) {
  const chi = `${nm} ${t}`; giro++;
  if (process.env.SOLO && process.env.SOLO !== chi) continue;   /* per le mutazioni: SOLO="chromium computer" */
  const ev = await spettacolo(giro);
  const maria = await utente(`maria-${S}-${giro}@example.invalid`, { full_name: "Maria Bianchi", name: "Maria Bianchi" });
  const br = await motore.launch();
  /* 1. Google: si sceglie, si va da «Google», si torna agli stessi posti, si prenota con l'email dell'account */
  let ctx = await contesto(br, tipo, { googleCome: maria }), p = await ctx.newPage(); sorveglia(p, chi, errori);
  await google(ctx, (u) => "#id_token=finto&state=" + u.searchParams.get("state")); await ip(ctx, giro);
  await p.goto(`${sito.url}/biglietteria/${ORG}/${ev.slug_breve}`);
  await p.waitForSelector("#bgl-mappa");
  E.ok(!(await p.$('.piede a[href="/biglietteria/mie/"]')), chi + ": senza accesso, niente «Le mie prenotazioni» nel piede");
  await zoom(p, t);
  await tocca(p, "Platea|A|1"); await tocca(p, "Platea|A|2");
  await p.click("#bgl-avanti");
  await p.waitForSelector("#bgl-google");
  E.ok(!(await p.$("#bgl-form")) && await p.isHidden("#bgl-prenota") && await p.isVisible("#bgl-mostra"), chi + ": prima la scelta, niente modulo né «Prenota»");
  E.ok((await sfora(p)) <= 0, chi + ": la scelta non sfora in larghezza");
  await p.screenshot({ path: `${OUT}/t19-${nm}-${t}-scelta.png`, fullPage: true });
  await p.click("#bgl-google");
  await p.waitForSelector("#bgl-form", { timeout: 15000 });
  E.ok(/Prenoti con Google/.test(await p.textContent("main")), chi + ": tornati da Google, dentro il modulo");
  E.ok((await p.inputValue("#bgl-nome")) === "Maria" && (await p.inputValue("#bgl-cognome")) === "Bianchi" && await p.$eval("#bgl-email", (x) => x.readOnly)
    && (await p.inputValue("#bgl-email")) === maria.user.email, chi + ": nome e cognome da Google, email dell'account fissa");
  const riep = await p.textContent(".riep-v");
  E.ok(/A/.test(riep) && /1 e 2|1–2|1-2/.test(riep) && /2 posti/.test(await p.textContent("#bgl-prenota")), chi + ": gli stessi posti di prima (" + riep + ")");
  await p.screenshot({ path: `${OUT}/t19-${nm}-${t}-google.png`, fullPage: true });
  await p.fill("#bgl-nome", "Maria Luisa");                          /* il nome si corregge */
  await p.check("#bgl-privacy");
  await p.click("#bgl-prenota");
  await p.waitForSelector("section.conferma", { timeout: 15000 });
  const r = await http(`/rest/v1/bgl_prenotazioni?select=email,user_id,nome&user_id=eq.${maria.user.id}`, null, { method: "GET" });
  E.ok(r.d.length === 1 && r.d[0].email === maria.user.email && r.d[0].nome === "Maria Luisa", chi + ": prenotazione legata all'account, con la sua email e il nome corretto");
  E.ok(/Le mie prenotazioni/.test(await p.textContent("section.conferma")) && !!(await p.$('.piede a[href="/biglietteria/mie/"]')), chi + ": «Le mie prenotazioni» nella conferma e nel piede");
  await p.screenshot({ path: `${OUT}/t19-${nm}-${t}-conferma.png`, fullPage: true });
  /* 1b. già collegati: un'altra prenotazione nella stessa scheda va dritta al modulo con Google; «Esci» torna a nome ed email */
  await p.goto(`${sito.url}/biglietteria/?o=${ORG}&s=${ev.slug_breve}`);
  await p.waitForSelector("#bgl-mappa");
  E.ok(!!(await p.$('.piede a[href="/biglietteria/mie/"]')), chi + ": collegati, «Le mie prenotazioni» nel piede della scheda");
  await zoom(p, t); await tocca(p, "Platea|B|1"); await p.click("#bgl-avanti");
  await p.waitForSelector("#bgl-form");
  E.ok(!(await p.$("#bgl-google")) && /Prenoti con Google/.test(await p.textContent("main")), chi + ": collegati, niente scelta");
  await p.click("#bgl-esci");
  await p.waitForFunction(() => !/Prenoti con Google/.test(document.querySelector("main").textContent));
  E.ok((await p.inputValue("#bgl-email")) === "" && !(await p.$eval("#bgl-email", (x) => x.readOnly)) && await p.isVisible("#bgl-prenota"), chi + ": «Esci» → modulo con nome ed email");
  await ctx.close();
  /* 2. Google annullato: si torna senza sessione → modulo con nome ed email, posti tenuti */
  ctx = await contesto(br, tipo); p = await ctx.newPage(); sorveglia(p, chi, errori);
  await google(ctx, () => "#error=access_denied"); await ip(ctx, giro + 10);
  await ctx.route("**/accedi/google/ritorno.js", (x) => x.fulfill({ contentType: "text/javascript",
    body: "(function(){var s=JSON.parse(sessionStorage.getItem('sp_google_accesso')||'null');sessionStorage.removeItem('sp_google_accesso');location.replace(s&&s.back?s.back:'/');})();" }));
  await p.goto(`${sito.url}/biglietteria/?o=${ORG}&s=${ev.slug_breve}`);
  await p.waitForSelector("#bgl-mappa");
  await zoom(p, t); await tocca(p, "Platea|C|1"); await p.click("#bgl-avanti"); await p.click("#bgl-google");
  await p.waitForSelector("#bgl-form", { timeout: 15000 });
  E.ok(/annullato/.test(await p.textContent("#bgl-barra")) && (await p.inputValue("#bgl-email")) === "" && /C/.test(await p.textContent(".riep-v")),
    chi + ": Google annullato → nome ed email, stesso posto");
  /* 3. senza Google, come prima */
  await p.fill("#bgl-nome", "Luca"); await p.fill("#bgl-cognome", "Verdi"); await p.fill("#bgl-email", `luca-${S}-${giro}@example.invalid`);
  await p.check("#bgl-privacy"); await p.click("#bgl-prenota");
  await p.waitForSelector("section.conferma", { timeout: 15000 });
  const r2 = await http(`/rest/v1/bgl_prenotazioni?select=user_id&email=eq.luca-${S}-${giro}@example.invalid`, null, { method: "GET" });
  E.ok(r2.d.length === 1 && r2.d[0].user_id === null, chi + ": prenotazione con nome ed email, senza account");
  E.ok(!/Le mie prenotazioni/.test(await p.textContent("main")), chi + ": senza Google niente «Le mie prenotazioni»");
  await ctx.close();
  /* 4. «Prenota con nome ed email» dalla scelta, senza passare da Google */
  ctx = await contesto(br, tipo); p = await ctx.newPage(); sorveglia(p, chi, errori); await ip(ctx, giro + 20);
  await p.goto(`${sito.url}/biglietteria/?o=${ORG}&s=${ev.slug_breve}`);
  await p.waitForSelector("#bgl-mappa");
  await zoom(p, t); await tocca(p, "Platea|D|1"); await p.click("#bgl-avanti"); await p.click("#bgl-mostra");
  await p.waitForSelector("#bgl-form");
  E.ok(await p.evaluate(() => document.activeElement && document.activeElement.id === "bgl-nome") && await p.isVisible("#bgl-google") && !(await p.$("#bgl-mostra")),
    chi + ": «Prenota con nome ed email» apre il modulo (fuoco sul nome), Google resta possibile");
  await p.screenshot({ path: `${OUT}/t19-${nm}-${t}-nome-email.png`, fullPage: true });
  /* Indietro e di nuovo Avanti: la scelta fatta resta */
  await p.click("#bgl-indietro"); await p.waitForSelector("#bgl-mappa"); await p.click("#bgl-avanti");
  await p.waitForSelector("#bgl-form");
  E.ok(true, chi + ": tornando dalla pianta il modulo con nome ed email resta scelto");
  /* D10: nessuna chiave sp_* dell'editor scritta dalla biglietteria */
  const sp = await p.evaluate(() => Object.keys(localStorage).filter((k) => /^sp_/.test(k)));
  E.ok(sp.length === 0, chi + ": nessuna chiave sp_* in localStorage: " + sp.join(","));
  await ctx.close();
  /* 5. accesso scaduto (token che il server rifiuta): si riprova UNA volta, poi si prosegue con nome ed email, senza doppioni */
  const scaduta = { ...maria, access_token: "token.finto.scaduto", expires_at: Math.floor(Date.now() / 1000) + 3000 };
  ctx = await contesto(br, tipo, { sessione: scaduta }); p = await ctx.newPage(); sorveglia(p, chi, errori); await ip(ctx, giro + 30);
  let chiamate = 0; p.on("request", (q) => { if (/functions\/v1\/bgl-prenota/.test(q.url()) && q.method() === "POST") chiamate++; });
  await p.goto(`${sito.url}/biglietteria/?o=${ORG}&s=${ev.slug_breve}`);
  await p.waitForSelector("#bgl-mappa");
  await zoom(p, t); await tocca(p, "Platea|D|5"); await p.click("#bgl-avanti");
  await p.waitForSelector("#bgl-form");
  await p.check("#bgl-privacy"); await p.click("#bgl-prenota");
  await p.waitForFunction(() => /scaduto/.test(document.querySelector("#bgl-barra").textContent), null, { timeout: 15000 });
  E.ok(chiamate === 2 && !(await p.$eval("#bgl-email", (x) => x.readOnly)) && (await p.inputValue("#bgl-email")) === maria.user.email,
    chi + ": accesso scaduto → un solo nuovo tentativo, poi il modulo con nome ed email (" + chiamate + " chiamate)");
  await p.fill("#bgl-nome", "Maria"); await p.fill("#bgl-cognome", "Bianchi"); await p.click("#bgl-prenota");
  await p.waitForSelector("section.conferma", { timeout: 15000 });
  const r3 = await http(`/rest/v1/bgl_prenotazioni?select=user_id,posti&evento_id=eq.${ev.id}&email=eq.${encodeURIComponent(maria.user.email)}`, null, { method: "GET" });
  E.ok(r3.d.length === 2 && r3.d.filter((x) => x.user_id === null).length === 1, chi + ": poi prenota con nome ed email (una sola prenotazione in più, senza account)");
  await ctx.close();
  await br.close();
}
sito.chiudi();
/* la pagina di ritorno /accedi/google/ (dell'editor, non della biglietteria) ha frame-ancestors in un <meta>: avviso noto */
const veri = errori.filter((x) => !/frame-ancestors' is ignored/.test(x));
E.ok(veri.length === 0, "nessun errore in console: " + veri.slice(0, 3).join(" | "));
E.fine();
