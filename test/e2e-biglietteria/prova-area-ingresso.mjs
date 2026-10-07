/* Area dell'organizzatore, ingresso (task 13): non collegato, non abilitato, prima volta, elenco con link e QR, senza rete.
   Chromium e WebKit, telefono e computer. Dati inventati, stack locale, rete esterna bloccata.
   Prima: stack fino alla 0076 e una copia di prova del sito:
     WT=<worktree> REF=lavoro DEST=<cartella> ./prepara.sh
   Poi: WT=<worktree> SITO=<cartella> OUT=<cartella screenshot> node prova-area-ingresso.mjs */
import { chromium, webkit, avviaSito, contesto, http, utente, TELEFONO, COMPUTER, sorveglia, esito, P, API, ANON } from "./comune.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const SITO = process.env.SITO || P + "/sito", OUT = process.env.OUT || P + "/out";
mkdirSync(OUT, { recursive: true });
const E = esito(), errori = [], S = Date.now().toString(36);
const abilita = (u) => http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: u.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
const foto = () => { const posti = []; ["A", "B"].forEach((f, r) => { for (let n = 1; n <= 4; n++) posti.push({ settore: "Platea", fila: f, posto: n, x: 200 + n * 60, y: 1000 + r * 90, w: 50, d: 53, rot: 180 }); });
  return { v: 1, box: [0, 0, 1400, 1600], palco: [[[100, 100], [1300, 100], [1300, 900], [100, 900]]], pedane: [], posti }; };
/* WebKit non accetta route.fulfill con un 302 (googleFinto di comune.mjs): qui Google «risponde» con una pagina che
   rimanda con location.replace, uguale per i due motori. Registrata dopo, vince su quella di comune.mjs. */
const googleRimanda = (ctx) => ctx.route("https://accounts.google.com/**", (r) => {
  const u = new URL(r.request().url()), dove = u.searchParams.get("redirect_uri") + "#id_token=finto&state=" + u.searchParams.get("state");
  r.fulfill({ status: 200, contentType: "text/html", body: "<script>location.replace(" + JSON.stringify(dove) + ")</script>" });
});
const sito = await avviaSito(SITO);
let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["telefono", TELEFONO], ["computer", COMPUTER]]) {
  if (process.env.SOLO && process.env.SOLO !== `${nm} ${t}`) continue;   /* per le mutazioni: SOLO="chromium computer" */
  const chi = `${nm} ${t}`, br = await motore.launch(); giro++;
  /* 1. non collegato → «Accedi con Google» → Google finto → dentro */
  const email = `org-${S}-${giro}@example.invalid`, org = await utente(email); await abilita(org);
  /* sul computer: uno spettacolo nato nell'editor (pubblicato) prima di entrare nell'area → l'indirizzo si blocca subito */
  const conEditor = t === "computer";
  if (conEditor) {
    const prog = (await http("/rest/v1/stageplot_projects", { user_id: org.user.id, title: "Sala di prova", data: { items: [] } }, { key: ANON, token: org.access_token })).d[0].id;
    const r = await http("/rest/v1/rpc/bgl_apri", { p_project_id: prog, p_evento: { titolo: "Concerto dall'editor", luogo: "Teatro di prova, Città",
      inizio: new Date(Date.now() + 9 * 86400e3).toISOString(), pianta: foto() } }, { key: ANON, token: org.access_token });
    if (!r.d || !r.d.ok) throw new Error("bgl_apri: " + JSON.stringify(r.d));
  }
  let ctx = await contesto(br, tipo, { googleCome: org }), p = await ctx.newPage(); sorveglia(p, chi, errori); await googleRimanda(ctx);
  await p.goto(sito.url + "/biglietteria/gestione/");
  await p.click("text=Accedi con Google");
  await p.waitForSelector("#gst-pv", { timeout: 10000 });
  E.ok(p.url().startsWith(sito.url + "/biglietteria/gestione/"), chi + ": dopo Google si torna all'area");
  /* decisione 3: contatto precompilato con l'email dell'account, modificabile, con l'aiuto su info@ */
  E.ok((await p.inputValue("#gst-contatto")) === email && /info@/.test(await p.textContent("#gst-c-contatto")) &&
    /vuoto, in pagina non compare nessuna email/.test(await p.textContent("#gst-c-contatto")), chi + ": contatto precompilato, aiuto con info@ e regola del vuoto (revisione T23: vuoto = nessuna email)");
  /* D7: con uno spettacolo già pubblicato lo si dice prima di salvare */
  E.ok((await p.$("#gst-slug-fisso")) !== null === conEditor, chi + ": avviso «resta fisso» " + (conEditor ? "presente" : "assente"));
  /* 2. prima volta: indirizzo proposto dal nome e controllato mentre si scrive */
  await p.fill("#gst-nome", "Teatro di Prova " + giro);
  await p.waitForFunction(() => /— libero$/.test(document.getElementById("gst-slug-stato").textContent), null, { timeout: 5000 });
  E.ok((await p.inputValue("#gst-slug")) === "teatro-di-prova-" + giro, chi + ": indirizzo proposto dal nome");
  await p.fill("#gst-slug", "gestione");
  await p.waitForFunction(() => /non si può usare/.test(document.getElementById("gst-slug-stato").textContent));
  E.ok(true, chi + ": parola riservata rifiutata mentre si scrive");
  await p.fill("#gst-slug", "teatro-prova-" + S + "-" + giro);
  /* revisione T23: un'email con segni da pagina web si ferma prima di salvare, con un messaggio che dice cosa fare */
  await p.fill("#gst-contatto", '"><img src=x>@example.invalid');
  await p.click("#gst-pv button[type=submit]");
  await p.waitForSelector("#gst-pv-err:not([hidden])", { timeout: 5000 });
  E.ok(/email per il pubblico non sembra giusta/.test(await p.textContent("#gst-pv-err")) && (await p.$("#gst-pv")) !== null &&
    (await p.evaluate(() => document.activeElement && document.activeElement.id)) === "gst-contatto", chi + ": email sbagliata fermata prima di salvare");
  await p.fill("#gst-contatto", "info@example.invalid");
  E.ok(await p.isHidden("#gst-pv-err"), chi + ": corretta l'email, l'avviso sparisce");
  /* RF4 in piccolo: un logo enorme si riduce prima di partire */
  const grande = await p.evaluate(async () => { const c = document.createElement("canvas"); c.width = 4000; c.height = 3000; const g = c.getContext("2d");
    for (let i = 0; i < 3000; i += 3) { g.fillStyle = `hsl(${i % 360},70%,50%)`; g.fillRect(0, i, 4000, 3); }
    const b = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.98)); return Array.from(new Uint8Array(await b.arrayBuffer())); });
  await p.setInputFiles("#gst-logo", { name: "logo.jpg", mimeType: "image/jpeg", buffer: Buffer.from(grande) });
  await p.waitForSelector("#gst-logo-ant:not([hidden])", { timeout: 15000 });
  await p.screenshot({ path: `${OUT}/t13-${nm}-${t}-prima-volta.png`, fullPage: true });
  await p.click("#gst-pv button[type=submit]");
  await p.waitForSelector(".gst-elenco", { timeout: 10000 });
  E.ok((await p.textContent(".gst-testa h1")).includes("Teatro di Prova " + giro), chi + ": elenco con il nome");
  const mio = (await http("/rest/v1/rpc/bgl_organizzatore_mio", {}, { key: ANON, token: org.access_token })).d, o = mio.organizzatore;
  E.ok(o.contatto_email === "info@example.invalid", chi + ": contatto cambiato salvato");
  const r = await fetch(`${API}/storage/v1/object/public/bgl-locandine/${o.logo_path}`);
  const byte = (await r.arrayBuffer()).byteLength;
  E.ok(r.ok && byte <= 400 * 1024 && /image\/(webp|jpeg)/.test(r.headers.get("content-type")), `${chi}: logo ridotto (${byte} byte, ${r.headers.get("content-type")})`);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("text=Scarica QR")]);
  E.ok(dl.suggestedFilename() === "qr-teatro-prova-" + S + "-" + giro + ".png" && readFileSync(await dl.path()).subarray(1, 4).toString() === "PNG", chi + ": QR in PNG");
  E.ok((await p.textContent(".gst-link a")).endsWith("/biglietteria/teatro-prova-" + S + "-" + giro), chi + ": link bello della pagina");
  if (conEditor) E.ok(/Concerto dall'editor/.test(await p.textContent(".gst-righe")) && /aperte/.test(await p.textContent(".gst-righe")), chi + ": lo spettacolo dell'editor entra nell'area");
  E.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), chi + ": niente scorrimento in orizzontale");
  await p.screenshot({ path: `${OUT}/t13-${nm}-${t}-elenco.png`, fullPage: true });
  await ctx.close();
  /* 3. non abilitato: solo la frase della specifica */
  const no = await utente(`no-${S}-${giro}@example.invalid`);
  ctx = await contesto(br, tipo, { sessione: no }); p = await ctx.newPage(); sorveglia(p, chi, errori);
  await p.goto(sito.url + "/biglietteria/gestione/");
  await p.waitForSelector(".gst-centro p");
  E.ok((await p.textContent(".gst-centro p")).trim() === "La biglietteria è in prova solo su invito. Scrivi a info@stageplot.it" &&
    (await p.$$("#gst-app button")).length === 0, chi + ": non abilitato, niente altro");
  if (giro === 1) await p.screenshot({ path: `${OUT}/t13-${nm}-${t}-non-abilitato.png`, fullPage: true });
  await ctx.close();
  /* 4. senza rete (AGENTS §8): sessione scaduta e server irraggiungibile → «Non riesco a collegarmi», non il login */
  const scaduta = { ...org, expires_at: Math.floor(Date.now() / 1000) - 60 };
  ctx = await contesto(br, tipo, { sessione: scaduta }); await ctx.route("http://127.0.0.1:54321/**", (x) => x.abort()); p = await ctx.newPage();
  await p.goto(sito.url + "/biglietteria/gestione/");
  await p.waitForSelector(".gst-centro h1", { timeout: 15000 });
  E.ok((await p.textContent(".gst-centro h1")) === "Non riesco a collegarmi", chi + ": senza rete non ti butta fuori");
  await ctx.close(); await br.close();
}
sito.chiudi();
/* la pagina di ritorno /accedi/google/ (dell'editor, non di quest'area) ha frame-ancestors in un <meta>: avviso noto */
const veri = errori.filter((x) => !/frame-ancestors/.test(x));
E.ok(veri.length === 0, "nessun errore in console: " + veri.slice(0, 3).join(" | "));
E.fine();
