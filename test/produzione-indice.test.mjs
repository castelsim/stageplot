/* Indice «Produzione» (stageplot.it/produzione/, 16/11/2026): una pagina statica che mette in fila, per fase,
   gli strumenti che già esistono (editor, Orchestre, biglietteria, programma, inventario, servizi).
   Qui le regole che la tengono onesta: ogni link porta a una pagina pubblicata, ogni strumento citato «nell'editor»
   esiste davvero nel codice, la pagina resta fuori da Google finché gli strumenti in prova non aprono,
   e l'editor la raggiunge da File → Produzione. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const leggi = (p) => readFileSync(join(root, p), "utf8");
const PAGINA = "produzione/index.html";
const h = leggi(PAGINA);
const senzaCommenti = h.replace(/<!--[\s\S]*?-->/g, "");
const wf = leggi(".github/workflows/pages.yml");
const allowlist = wf.slice(wf.indexOf("rsync -a"), wf.indexOf("./_site/"));

test("pagina statica e chiusa: noindex, niente referrer, nessuno script, nessuno stile o gestore inline", () => {
  assert.match(h, /<meta name="robots" content="noindex, follow">/);
  assert.match(h, /<meta name="referrer" content="no-referrer">/);
  assert.doesNotMatch(senzaCommenti, /<script/i, "nessuno script: è un indice");
  assert.doesNotMatch(senzaCommenti, /<style|\sstyle=|\son[a-z]+=/i, "stile o gestore inline");
  const csp = h.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src 'none'/);
  assert.match(csp, /style-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /connect-src|unsafe-/, "nessuna chiamata al server");
  assert.match(h, /<html lang="it">/);
  assert.match(h, /<title>[^<]*\| stageplot\.it<\/title>/, "titolo col marchio «stageplot.it»");
});

test("fogli di stile: quello delle guide e il suo, entrambi esistenti", () => {
  for (const [href, file] of [["/guida/style.css", "guida/style.css"], ["produzione.css", "produzione/produzione.css"]]) {
    assert.ok(h.includes('href="' + href), href);
    assert.ok(existsSync(join(root, file)), file);
  }
});

test("ogni link interno porta a una pagina che esiste ed è pubblicata dal deploy (senza allowlist: 404)", () => {
  const link = [...senzaCommenti.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]).filter((p) => !/\.(css|svg)$/.test(p));
  assert.ok(link.length >= 10, "l'indice collega almeno dieci pagine");
  for (const p of link) {
    if (p === "/") continue;
    const cartella = p.replace(/^\//, "").replace(/\/$/, "");
    assert.ok(existsSync(join(root, cartella, "index.html")), p + ": pagina inesistente");
    const prima = cartella.split("/")[0];
    assert.ok(new RegExp("(^|\\s)" + prima + "(\\s|$)").test(allowlist), p + ": cartella «" + prima + "» non pubblicata");
  }
});

test("indice delle fasi: ogni voce punta a una sezione, numerate in ordine, nessuna sezione fuori indice", () => {
  const voci = [...senzaCommenti.matchAll(/<li><a href="#([a-z]+)">/g)].map((m) => m[1]);
  const sezioni = [...senzaCommenti.matchAll(/<section id="([a-z]+)" class="pr-fase">/g)].map((m) => m[1]);
  assert.deepEqual(voci, sezioni, "stesse fasi, stesso ordine");
  const numeri = [...senzaCommenti.matchAll(/<h2>(\d+) · /g)].map((m) => +m[1]);
  assert.deepEqual(numeri, sezioni.map((_, i) => i + 1));
});

test("ciò che la pagina dice «nell'editor» esiste nel codice dell'editor", () => {
  const t = leggi("index.template.html");
  const prove = {
    "Palco per esterni": /id="pdfEsterni"/,
    "Provvisorio / Definitivo": /id="pdfStatoDoc"/,
    "Importa l'organico": /function orgImportApri\(/,
    "Richiedi setup al musicista": /id="pReqBtn"[^>]*>[^<]*Richiedi setup al musicista/,
    "Produzione — reparti": /<h2[^>]*>Produzione — reparti<\/h2>/,
    "distinta del palco": /function distintaPalco\(/,
    "monitor list": /function renderMonitorPanel\(/,
    "Link in sola lettura": /id="bShareHdr"/,
    "Biglietteria gratuita con pianta dei posti": /id="bPostoNumera"/,
  };
  for (const [frase, re] of Object.entries(prove)) {
    assert.ok(senzaCommenti.includes(frase), "la pagina non cita più «" + frase + "»: togli anche la prova");
    assert.match(t, re, frase + ": non c'è più nell'editor, la pagina promette una cosa che non esiste");
  }
});

test("l'editor la raggiunge da File → Produzione (anche nella shell generata)", () => {
  for (const f of ["index.template.html", "app/index.html"]) {
    const s = leggi(f);
    const i = s.indexOf('id="prodModal"'), fine = s.indexOf('id="prodClose"', i);
    assert.ok(i > 0 && fine > i, f + ": finestra Produzione");
    assert.match(s.slice(i, fine), /<a href="\/produzione\/" target="_blank" rel="noopener" id="prodIndice"/, f);
  }
  assert.match(leggi("index.template.html"), /data-file="produzione"/, "la voce File → Produzione esiste");
});

test("pubblicazione: nell'allowlist, la CI lancia questo test, fuori da sitemap e llms finché è noindex", () => {
  assert.match(allowlist, /(^|\s)produzione(\s|$)/);
  assert.match(wf, /produzione-indice\.test\.mjs/);
  assert.match(leggi(".github/workflows/pr-controlli.yml"), /produzione-indice\.test\.mjs/);
  assert.doesNotMatch(leggi("sitemap.xml"), /stageplot\.it\/produzione\//, "noindex e sitemap insieme non hanno senso");
  assert.doesNotMatch(leggi("llms.txt"), /stageplot\.it\/produzione\/(?!-)/);
});

test("repo pubblico: nessun dato reale, solo il contatto pubblico di stageplot.it", () => {
  const mail = [...senzaCommenti.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(mail)], ["info@stageplot.it"]);
  assert.doesNotMatch(senzaCommenti, /Diego|Gaia|Mirella|Art ?Voice|AVA Sound|\+39|\b3\d{2}[ .]?\d{6,7}\b/i);
  assert.doesNotMatch(senzaCommenti, /StagePlot/, "il marchio è «stageplot.it»");
});
