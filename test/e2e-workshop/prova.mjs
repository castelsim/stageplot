/* Prova nel browser della pagina del workshop (FUORI dalla CI). Playwright da STAGEPLOT/review.
   Parla col progetto DEDICATO «workshop-domande» (mai col backend di StagePlot), in una bacheca di prova
   (?s=<SESSIONE>) che poi si cancella. Il codice di regia si legge da un file (CODICE_FILE) e non si stampa mai.
   Uso: BASE=http://localhost:PORTA SESSIONE=prova-ws-... CODICE_FILE=... [SCHERMI=cartella] node prova.mjs
   Con BASE=https://stageplot.it prova la pubblicazione vera. */
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
const require = createRequire((process.env.REVIEW_DIR || homedir() + "/COWORK/STAGEPLOT/review") + "/package.json");
const { chromium, webkit } = require("playwright");
const BASE = process.env.BASE, SESS = process.env.SESSIONE, SCHERMI = process.env.SCHERMI || "";
if (!BASE || !SESS || !process.env.CODICE_FILE) throw new Error("servono BASE, SESSIONE, CODICE_FILE");
const CODICE = readFileSync(process.env.CODICE_FILE, "utf8").trim();
if (SCHERMI) mkdirSync(SCHERMI, { recursive: true });
let tipoWebkit = false;
const TELEFONO = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
let esiti = 0, falliti = 0;
const ok = (c, m) => { esiti++; if (!c) { falliti++; console.log("  KO  " + m); } else console.log("  ok  " + m); };
let S = SESS;
const url = (p) => BASE + p + "?s=" + S;
const foto = async (pg, nome) => { if (SCHERMI) await pg.screenshot({ path: SCHERMI + "/" + nome + ".png", fullPage: false }); };

async function nuovo(browser, opz) {
  const ctx = await browser.newContext(opz);
  const pg = await ctx.newPage();
  const problemi = [];
  /* Si ignorano: i 400 che il browser registra per i rifiuti ATTESI del server (doppione, codice sbagliato) e, in WebKit,
     lo stile che Playwright stesso inserisce per fare gli screenshot (nascondere il cursore). Il resto è un problema. */
  pg.on("console", (m) => {
    const t = m.text();
    if (/status of 400/.test(t)) return;
    if (SCHERMI && /Refused to apply a stylesheet/.test(t) && tipoWebkit) return;
    if (m.type() === "error" || /Content Security Policy|Refused to/i.test(t)) problemi.push(t);
  });
  pg.on("pageerror", (e) => problemi.push("pageerror: " + e.message));
  return { ctx, pg, problemi };
}

for (const [nome, tipo] of [["chromium", chromium], ["webkit", webkit]]) {
  console.log("== " + nome);
  S = SESS + "-" + nome;   // una bacheca per browser
  tipoWebkit = nome === "webkit";
  const b = await tipo.launch();
  const A = await nuovo(b, { ...TELEFONO, colorScheme: "light" });   // telefono di chi scrive
  const B = await nuovo(b, { ...TELEFONO, colorScheme: "dark" });    // secondo telefono: vota
  const R = await nuovo(b, { viewport: { width: 1280, height: 800 } }); // regia sul portatile
  const T = "Come si toglie il rumore del vento dalla voce? (" + nome + ")";

  // 1 · bacheca vuota
  await A.pg.goto(url("/workshop/"));
  await A.pg.waitForFunction(() => /Ancora nessuna domanda/.test(document.getElementById("elenco").textContent));
  ok(true, "bacheca vuota all'inizio");
  ok(/Workshop di Simone Castellan/.test(await A.pg.textContent("body")), "si presenta come workshop di Simone Castellan");
  await foto(A.pg, nome + "-1-vuota-chiaro");

  // 2 · invio senza compilare: avvisi
  await A.pg.click("#tab-nuova");
  await A.pg.click("#invia");
  ok(/punto 1/.test(await A.pg.textContent("#avviso")), "senza argomento: avviso al punto 1");
  await A.pg.check('input[name="argomento"][value="pulizia"]', { force: true }).catch(async () => A.pg.click('label:has(input[value="pulizia"]) span'));
  await A.pg.click("#invia");
  ok(/punto 3/.test(await A.pg.textContent("#avviso")), "senza testo: avviso al punto 3");

  // 3 · invio vero
  await A.pg.click('label:has(input[name="perchi"][value="simone"]) span');
  await A.pg.fill("#testo", T);
  ok((await A.pg.textContent("#conta")) === String(T.length), "contatore dei caratteri");
  await foto(A.pg, nome + "-2-modulo-chiaro");
  await A.pg.click("#invia");
  await A.pg.waitForFunction(() => /Inviata|Ricevuta/.test(document.getElementById("avviso").textContent));
  ok(/Inviata, grazie/.test(await A.pg.textContent("#avviso")), "domanda inviata");
  ok((await A.pg.inputValue("#testo")) === "" && (await A.pg.textContent("#conta")) === "0", "modulo svuotato");

  // 4 · doppione
  await A.pg.fill("#testo", T); await A.pg.click('label:has(input[name="argomento"][value="altro"]) span'); await A.pg.click("#invia");
  await A.pg.waitForFunction(() => document.getElementById("avviso").className.includes("errore"));
  ok(/c.è già/.test(await A.pg.textContent("#avviso")), "doppione rifiutato col messaggio del server");

  // 5 · bacheca: la mia domanda
  await A.pg.click("#tab-bacheca");
  await A.pg.waitForFunction(() => /la tua/.test(document.getElementById("elenco").textContent));
  const meta = await A.pg.textContent(".ws-domanda .ws-meta");
  ok(/Pulizia e restauro/.test(meta) && /per Simone/.test(meta) && /la tua/.test(meta), "etichette: argomento, per chi, «la tua»");

  // 6 · secondo telefono vota (tema scuro)
  await B.pg.goto(url("/workshop/"));
  await B.pg.waitForSelector(".ws-voto");
  ok((await B.pg.textContent(".ws-voto")).trim().endsWith("0"), "il secondo telefono vede la domanda a 0 voti");
  await B.pg.click(".ws-voto");
  await B.pg.waitForFunction(() => document.querySelector(".ws-voto").getAttribute("aria-pressed") === "true");
  ok((await B.pg.textContent(".ws-voto")).trim().endsWith("1"), "+1 registrato, pulsante premuto");
  await foto(B.pg, nome + "-3-bacheca-scuro");
  await B.pg.click(".ws-voto");
  await B.pg.waitForFunction(() => document.querySelector(".ws-voto").getAttribute("aria-pressed") === "false");
  ok((await B.pg.textContent(".ws-voto")).trim().endsWith("0"), "secondo tocco toglie il +1");
  await B.pg.click(".ws-voto");
  await B.pg.waitForFunction(() => document.querySelector(".ws-voto").getAttribute("aria-pressed") === "true");

  // 7 · regia: codice sbagliato, poi giusto
  await R.pg.goto(url("/workshop/regia/"));
  await R.pg.fill("#codice", "sbagliato-apposta"); await R.pg.click("#accesso button");
  await R.pg.waitForFunction(() => !document.getElementById("errore").hidden);
  ok(/codice/i.test(await R.pg.textContent("#errore")) && (await R.pg.isVisible("#accesso")), "codice sbagliato: errore e si resta fuori");
  await R.pg.fill("#codice", CODICE); await R.pg.click("#accesso button");
  await R.pg.waitForSelector(".ws-d");
  ok(await R.pg.isHidden("#accesso") && (await R.pg.textContent(".ws-conti")).includes("1"), "codice giusto: elenco e conteggi");
  ok(/^1/.test((await R.pg.textContent(".ws-d .ws-v")).trim()), "la regia vede 1 voto");
  ok(!R.pg.url().includes(encodeURIComponent(CODICE)), "il codice non è nell'indirizzo");
  await foto(R.pg, nome + "-4-regia");

  // 8 · risposta data, nascondi, vista grande
  await R.pg.click('.ws-az button:has-text("Risposta")');
  await R.pg.waitForSelector(".ws-d.fatta");
  await A.pg.reload(); await A.pg.waitForSelector(".ws-domanda.fatta");
  ok(/risposta data/.test(await A.pg.textContent(".ws-domanda .ws-meta")), "il telefono vede «risposta data»");
  await R.pg.click('.ws-az button:has-text("Riapri")'); await R.pg.waitForSelector(".ws-d:not(.fatta)");
  await R.pg.click("#grande");
  ok(await R.pg.isHidden(".ws-conti") && await R.pg.isHidden(".ws-az") && await R.pg.isVisible(".ws-esci"), "vista grande: via comandi e conteggi");
  ok(/Le domande del gruppo/.test(await R.pg.textContent("h1")) && await R.pg.isHidden(".ws-sopra"), "vista grande: titolo per i ragazzi");
  await foto(R.pg, nome + "-5-vista-grande");
  await R.pg.keyboard.press("Escape");
  ok(await R.pg.isVisible(".ws-conti"), "Esc esce dalla vista grande");
  await R.pg.click('.ws-az button:has-text("Nascondi")'); await R.pg.waitForSelector(".ws-d.nascosta");
  /* chi l'ha scritta continua a vederla, segnata «la vedi solo tu» (scelta del database); gli altri no */
  await B.pg.reload();
  await B.pg.waitForFunction(() => /Ancora nessuna domanda/.test(document.getElementById("elenco").textContent));
  ok(true, "domanda nascosta: sparisce dal telefono degli altri");
  await A.pg.reload();
  await A.pg.waitForFunction(() => /la vedi solo tu/.test(document.getElementById("elenco").textContent));
  ok((await A.pg.locator(".ws-voto:disabled").count()) === 1, "domanda nascosta: all'autore resta, segnata, senza voto");
  await R.pg.click('.ws-az button:has-text("Mostra")'); await R.pg.waitForSelector(".ws-d:not(.nascosta)");

  // 9 · testo ostile: appare come testo, mai come HTML
  await A.pg.click("#tab-nuova");
  const SPORCO = '<img src=x onerror="window.__x=1"> <b>grassetto</b> ' + nome;
  await A.pg.click('label:has(input[name="argomento"][value="altro"]) span');
  await A.pg.fill("#testo", SPORCO); await A.pg.click("#invia");
  await A.pg.waitForFunction(() => /Inviata|Ricevuta/.test(document.getElementById("avviso").textContent));
  await A.pg.click("#tab-bacheca");
  await A.pg.waitForFunction(() => document.getElementById("elenco").textContent.includes("<img src=x"));
  ok((await A.pg.locator(".ws-domanda img, .ws-domanda b").count()) === 0 && !(await A.pg.evaluate(() => window.__x)), "HTML nelle domande: resta testo");
  ok((await A.pg.textContent("#elenco")).includes("<img src=x"), "il testo ostile si legge com'è");

  // 10 · niente errori in console, niente violazioni CSP
  for (const [n, x] of [["telefono A", A], ["telefono B", B], ["regia", R]]) ok(x.problemi.length === 0, n + ": console pulita" + (x.problemi.length ? " → " + x.problemi.join(" | ") : ""));
  await b.close();
}
console.log("\n" + (esiti - falliti) + "/" + esiti + " ok" + (falliti ? ", " + falliti + " FALLITI" : ""));
process.exit(falliti ? 1 : 0);
