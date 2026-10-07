/* «Le mie prenotazioni» (task 20): accesso, elenco, disdetta, «Elimina il mio account»; un account che usa StagePlot non si
   elimina da qui; chi è entrato con Google senza mai prenotare si sente dire di scrivere (non «usa StagePlot»).
   Chromium e WebKit, telefono e computer. Dati inventati, Google finto, rete esterna bloccata.
   Prima:  WT=<worktree> REF=lavoro DEST=<cartella> ./prepara.sh
           (dal worktree) supabase functions serve --env-file <questa cartella>/env --no-verify-jwt
   Poi:    SITO=<cartella> OUT=<cartella screenshot> node prova-mie.mjs        (SOLO="chromium computer" per un giro) */
import { chromium, webkit, avviaSito, contesto, http, utente, rpcServizio, TELEFONO, COMPUTER, sorveglia, esito, ANON, SERV, API, P } from "./comune.mjs";
import { mkdirSync } from "node:fs";
const E = esito(), errori = [], S = Date.now().toString(36), OUT = process.env.OUT || P + "/out"; mkdirSync(OUT, { recursive: true });
const sito = await avviaSito(process.env.SITO || P + "/sito");
const org = await utente(`morg-${S}@example.invalid`);
await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
const rpcO = (fn, a) => http("/rest/v1/rpc/" + fn, a, { key: ANON, token: org.access_token }).then((r) => r.d);
await rpcO("bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: "teatro-m-" + S } });
const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala", data: { items: [] } }, { key: ANON, token: org.access_token })).d[0].id;
const posti = []; for (let n = 1; n <= 30; n++) posti.push({ settore: "Platea", fila: "A", posto: n, x: 150 + n * 55, y: 1000, w: 50, d: 53, rot: 180 });
const pianta = { v: 1, box: [0, 0, 1900, 1300], palco: [[[100, 100], [1800, 100], [1800, 800], [100, 800]]], pedane: [], posti };
const nuovo = async (titolo, ore) => {
  const ev = await rpcO("bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog, titolo, inizio: new Date(Date.now() + ore * 3600e3).toISOString(), luogo: "Teatro di prova", pianta, pubblicato: true } });
  if (!ev || !ev.ok) throw new Error("spettacolo: " + JSON.stringify(ev));
  return ev;
};
const ev = await nuovo("Concerto di prova", 72), ev2 = await nuovo("Recital di prova", 200);
/* Google finto che rimanda con una pagina (WebKit non accetta il 302 di route.fulfill) */
const google = (ctx) => ctx.route("https://accounts.google.com/**", (r) => {
  const u = new URL(r.request().url());
  r.fulfill({ status: 200, contentType: "text/html", body: "<script>location.replace(" + JSON.stringify(u.searchParams.get("redirect_uri") + "#id_token=finto&state=" + u.searchParams.get("state")) + ")</script>" });
});
const sfora = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const prenotazioni = (uid) => http(`/rest/v1/bgl_prenotazioni?select=stato,nome,email,evento_id&user_id=eq.${uid}`, null, { method: "GET" }).then((r) => r.d);
let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) {
  const chi = `${nm} ${t}`; giro++;
  if (process.env.SOLO && process.env.SOLO !== chi) continue;
  const u = await utente(`pub-${S}-${giro}@example.invalid`, { full_name: "Maria Bianchi" });
  const codici = [];
  for (const [e, k] of [[ev, 3 * giro], [ev, 3 * giro + 1], [ev2, giro]]) {
    const r = await rpcServizio("bgl_prenota", { p_slug: e.slug, p_posti: ["Platea|A|" + k], p_nome: "Maria", p_cognome: "Bianchi", p_email: u.user.email, p_user_id: u.user.id });
    if (!r || !r.ok) throw new Error("prenotazione di prova: " + JSON.stringify(r));
    codici.push(r.codice);
  }
  const br = await motore.launch();
  /* 1. non collegati: «Accedi con Google» → Google finto → l'elenco */
  const ctx = await contesto(br, tipo, { googleCome: u }); await google(ctx);
  const p = await ctx.newPage(); sorveglia(p, chi, errori);
  await p.goto(sito.url + "/biglietteria/mie/");
  await p.waitForSelector('[data-az="accedi"]');
  E.ok(/stesso account Google/.test(await p.textContent("main")), chi + ": non collegati, si chiede di accedere");
  await p.screenshot({ path: `${OUT}/t20-${nm}-${t}-accedi.png`, fullPage: true });
  await p.click('[data-az="accedi"]');
  await p.waitForSelector(".mie", { timeout: 15000 });
  E.ok(p.url() === sito.url + "/biglietteria/mie/", chi + ": dopo Google si torna a «Le mie prenotazioni»");
  E.ok((await p.$$(".mie .mia")).length === 3 && /Concerto di prova/.test(await p.textContent(".mie")), chi + ": le tre prenotazioni");
  const titoli = await p.$$eval(".mie .mia-titolo", (a) => a.map((x) => x.textContent));
  E.ok(titoli.join("|") === "Concerto di prova|Concerto di prova|Recital di prova", chi + ": dalla più vicina: " + titoli.join("|"));
  const href = await p.getAttribute(".mie .mia-titolo", "href");
  E.ok(href === `/biglietteria/teatro-m-${S}/${ev.slug_breve}`, chi + ": il titolo porta alla scheda (indirizzo bello): " + href);
  E.ok((await sfora(p)) <= 0, chi + ": niente scorrimento in larghezza");
  await p.screenshot({ path: `${OUT}/t20-${nm}-${t}-elenco.png`, fullPage: true });
  /* 2. disdetta di una */
  await p.click('.mia:first-child [data-az="disdici"]');
  await p.click('[data-az="no"]');
  await p.waitForSelector('.mia:first-child [data-az="disdici"]');
  E.ok((await prenotazioni(u.user.id)).every((x) => x.stato === "attiva"), chi + ": «No, tengo i posti» non disdice");
  await p.click('.mia:first-child [data-az="disdici"]'); await p.click('[data-az="si-disdici"]');
  await p.waitForFunction(() => /disdetta/.test(document.querySelector(".mie").textContent));
  E.ok((await prenotazioni(u.user.id)).filter((x) => x.stato === "disdetta").length === 1 && /di nuovo liberi/.test(await p.textContent("main")), chi + ": disdetta dall'account");
  /* 3. Elimina il mio account: dice quante future vengono disdette, poi l'account non c'è più */
  await p.click('[data-az="elimina"]');
  E.ok(/le tue 2 prenotazioni future vengono disdette/.test(await p.textContent(".mie-account")), chi + ": dice cosa succede (2 future ancora attive)");
  await p.screenshot({ path: `${OUT}/t20-${nm}-${t}-elimina.png`, fullPage: true });
  await p.click('.mie-account [data-az="no"]');
  await p.waitForSelector('[data-az="elimina"]');
  E.ok(true, chi + ": «Annulla» non elimina");
  await p.click('[data-az="elimina"]'); await p.click('[data-az="si-elimina"]');
  await p.waitForSelector("text=Account eliminato", { timeout: 15000 });
  const g = await fetch(`${API}/auth/v1/admin/users/${u.user.id}`, { headers: { apikey: SERV, Authorization: "Bearer " + SERV } });
  E.ok(g.status === 404, chi + ": l'account non c'è più");
  const resto = (await http(`/rest/v1/bgl_prenotazioni?select=stato,nome,email,user_id&evento_id=in.(${ev.id},${ev2.id})&codice=in.(${codici.join(",")})`, null, { method: "GET" })).d;
  const libero = await rpcServizio("bgl_evento_pubblico", { p_slug: ev2.slug });
  E.ok(!(libero.occupati || []).includes("Platea|A|" + giro), chi + ": il posto della prenotazione futura è tornato libero");
  E.ok(resto.length === 3 && resto.every((x) => x.stato === "disdetta" && x.nome === null && x.email === null && x.user_id === null),
    chi + ": le prenotazioni restano solo come numeri: disdette, senza nome, email né account");
  await p.screenshot({ path: `${OUT}/t20-${nm}-${t}-eliminato.png`, fullPage: true });
  await p.goto(sito.url + "/biglietteria/mie/");
  await p.waitForSelector('[data-az="accedi"]');
  E.ok(true, chi + ": dopo l'eliminazione si è fuori");
  await br.close();
}
/* un account che usa StagePlot (ha un progetto) non si elimina da qui */
const editore = await utente(`ed-${S}@example.invalid`);
await rpcServizio("bgl_prenota", { p_slug: ev.slug, p_posti: ["Platea|A|29"], p_nome: "Mario", p_cognome: "Rossi", p_email: editore.user.email, p_user_id: editore.user.id });
await http("/rest/v1/stageplot_projects", { user_id: editore.user.id, title: "Suo", data: { items: [] } }, { key: ANON, token: editore.access_token });
let br = await chromium.launch(), ctx = await contesto(br, COMPUTER, { sessione: editore }), p = await ctx.newPage(); sorveglia(p, "editore", errori);
await p.goto(sito.url + "/biglietteria/mie/"); await p.waitForSelector(".mie-account");
E.ok(!(await p.$('[data-az="elimina"]')) && /usa anche StagePlot/.test(await p.textContent(".mie-account")), "account dell'editor: niente «Elimina», si scrive a info@");
await br.close();
/* entrato con Google senza mai prenotare: niente «Elimina» (il database non lo conta «solo biglietteria») e niente «usa StagePlot» */
const vuoto = await utente(`vuoto-${S}@example.invalid`);
br = await webkit.launch(); ctx = await contesto(br, TELEFONO, { sessione: vuoto }); p = await ctx.newPage(); sorveglia(p, "vuoto", errori);
await p.goto(sito.url + "/biglietteria/mie/"); await p.waitForSelector(".mie-account");
const tv = await p.textContent("main");
E.ok(/Nessuna prenotazione in arrivo/.test(tv) && !(await p.$('[data-az="elimina"]')) && !/usa anche StagePlot/.test(tv) && /Per eliminare questo account scrivi/.test(tv), "senza prenotazioni: nessuna in arrivo, si scrive a info@");
await p.screenshot({ path: `${OUT}/t20-webkit-telefono-vuoto.png`, fullPage: true });
await br.close();
sito.chiudi();
const veri = errori.filter((x) => !/frame-ancestors' is ignored/.test(x));   /* pagina di ritorno /accedi/google/ dell'editor: avviso noto */
E.ok(veri.length === 0, "nessun errore in console: " + veri.slice(0, 3).join(" | "));
E.fine();
