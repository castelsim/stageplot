/* La pagina del workshop (stageplot.it/workshop/): bacheca delle domande + regia.
   Qui i controlli che non hanno bisogno di un browser: le parti comuni (comune.js) e le regole di pubblicazione.
   Il comportamento nel browser si prova con test/e2e-workshop/ (fuori dalla CI). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const leggi = (p) => readFileSync(join(root, p), "utf8");
const C = createRequire(import.meta.url)(join(root, "workshop/comune.js"));
const senzaCommenti = (js) => js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const HOST = "https://cbsxooaacnwtxnbwwomm.supabase.co";

/* ------------------------------------------------------------------ pubblicazione */
test("le due pagine: noindex, niente referrer, CSP stretta sul solo server delle domande, niente script o stili inline", () => {
  for (const p of ["workshop/index.html", "workshop/regia/index.html"]) {
    const h = leggi(p);
    assert.match(h, /<meta name="robots" content="noindex, nofollow">/, p);
    assert.match(h, /<meta name="referrer" content="no-referrer">/, p);
    assert.doesNotMatch(h, /unsafe-inline|unsafe-eval/, p);
    assert.doesNotMatch(h, /<script(?![^>]*\bsrc=)/, p + ": script inline");
    assert.doesNotMatch(h, /<style|\sstyle=|\son[a-z]+=/i, p + ": stile o gestore inline");
    const csp = h.match(/Content-Security-Policy" content="([^"]+)"/)[1];
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /style-src 'self'(;|$)/);
    assert.match(csp, new RegExp("connect-src " + HOST.replace(/\./g, "\\.") + "(;|$)"), "parla solo col progetto delle domande");
    assert.doesNotMatch(csp, /vsodplqkuvnsdiikvmjb/, "nessun legame con il backend di StagePlot");
  }
});

test("i file citati dalle pagine esistono (e nell'ordine giusto: comune prima della pagina)", () => {
  const h = leggi("workshop/index.html"), r = leggi("workshop/regia/index.html");
  for (const f of ["ws.css", "comune.js", "domande.js"]) { assert.ok(h.includes(f), f); assert.ok(existsSync(join(root, "workshop", f)), f); }
  assert.ok(h.indexOf("comune.js") < h.indexOf("domande.js"));
  assert.ok(r.includes('href="../ws.css'), "la regia usa lo stesso foglio di stile"); assert.ok(existsSync(join(root, "workshop/regia/regia.js")));
  assert.ok(r.indexOf("../comune.js") > 0 && r.indexOf("../comune.js") < r.indexOf("regia.js"));
});

test("il codice delle pagine: niente innerHTML (le domande le scrivono gli utenti), nessuna statistica, nessun terzo, nessun codice di regia scritto", () => {
  for (const p of ["workshop/comune.js", "workshop/domande.js", "workshop/regia/regia.js"]) {
    const js = senzaCommenti(leggi(p));
    assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, p);
    assert.doesNotMatch(js, /gtag|analytics|plausible|sendBeacon|document\.cookie/i, p);
    assert.doesNotMatch(js, /https?:\/\/(?!cbsxooaacnwtxnbwwomm\.supabase\.co)/, p + ": solo il server delle domande");
  }
  const reg = senzaCommenti(leggi("workshop/regia/regia.js"));
  assert.match(reg, /sessionStorage/, "il codice resta nella scheda");
  assert.doesNotMatch(reg, /location\.(search|hash)[^;]*codice|[?&]codice=/i, "il codice non passa dall'indirizzo");
});

test("pubblicazione: nell'allowlist del deploy, bypassa il service worker, la CI lancia questi test, fuori da sitemap/llms/robots", () => {
  const wf = leggi(".github/workflows/pages.yml");
  assert.match(wf.slice(wf.indexOf("rsync -a"), wf.indexOf("./_site/")), /\bworkshop\b/, "senza l'allowlist la cartella dà 404");
  assert.match(wf, /workshop\.test\.mjs/);
  assert.match(leggi(".github/workflows/pr-controlli.yml"), /workshop\.test\.mjs/);
  assert.match(leggi("sw.js"), /indexOf\("\/workshop\/"\) === 0\) return;/, "le domande cambiano ogni secondo: mai da una copia");
  for (const f of ["sitemap.xml", "llms.txt", "robots.txt"]) assert.doesNotMatch(leggi(f), /workshop/i, f + ": la pagina si raggiunge solo dal QR");
});

test("la pagina si presenta come workshop di Simone Castellan, non come una funzione di StagePlot", () => {
  const h = leggi("workshop/index.html");
  assert.match(h, /Workshop di Simone Castellan/);
  assert.doesNotMatch(h.replace(/<!--[\s\S]*?-->/g, ""), /stage ?plot/i);
});

/* ------------------------------------------------------------------ parti comuni */
test("sessioneDa: ?s= sceglie la bacheca, tagliata a 60; senza o vuota c'è quella del workshop", () => {
  assert.equal(C.sessioneDa(""), C.SESSIONE_PREDEFINITA);
  assert.equal(C.sessioneDa("?x=1"), C.SESSIONE_PREDEFINITA);
  assert.equal(C.sessioneDa("?s="), C.SESSIONE_PREDEFINITA);
  assert.equal(C.sessioneDa("?s=%20%20"), C.SESSIONE_PREDEFINITA);
  assert.equal(C.sessioneDa("?s=prova-1"), "prova-1");
  assert.equal(C.sessioneDa("?s=" + "a".repeat(100)).length, 60);
  assert.equal(C.sessioneDa(undefined), C.SESSIONE_PREDEFINITA);
});

test("argomenti e destinatari: i codici sono quelli già nel database; i testi sconosciuti non rompono", () => {
  assert.deepEqual(C.ARGOMENTI.map((a) => a[0]), ["presa-diretta", "pulizia", "montaggio", "foley", "manipolare", "musica", "mix", "programmi", "lavoro", "altro"]);
  assert.deepEqual(C.PER_CHI.map((a) => a[0]), ["simone", "marco", "entrambi", "non-so"]);
  assert.equal(C.nomeArgomento("foley"), "Effetti e Foley");
  assert.equal(C.nomeArgomento("boh"), "boh");
  assert.equal(C.nomeArgomento(null), "");
  assert.equal(C.frasePerChi("marco"), "per Marco");
  assert.equal(C.frasePerChi("non-so"), "");
  assert.equal(C.frasePerChi("constructor"), "", "niente proprietà ereditate");
  assert.equal(C.frasePerChi(undefined), "");
});

test("numeroDispositivo: lo ricorda se il browser lo permette, altrimenti ne dà uno nuovo senza lanciare", () => {
  const m = new Map();
  const dep = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
  const a = C.numeroDispositivo(dep, null);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "un uuid v4, come vuole la funzione vota");
  assert.equal(C.numeroDispositivo(dep, null), a, "lo stesso telefono, lo stesso numero");
  const rotto = { getItem() { throw new Error("blocco"); }, setItem() { throw new Error("blocco"); } };
  assert.match(C.numeroDispositivo(rotto, null), /^[0-9a-f-]{36}$/);
  assert.match(C.numeroDispositivo(null, { randomUUID: () => "11111111-1111-4111-8111-111111111111" }), /^11111111-/);
});

test("chiama: risposta ok, errore del server col suo messaggio, errore senza JSON, rete assente", async () => {
  const rete = (ok, corpo) => async () => ({ ok, text: async () => corpo });
  assert.deepEqual(await C.chiama("bacheca", { a: 1 }, rete(true, '[{"id":"x"}]')), [{ id: "x" }]);
  assert.equal(await C.chiama("vota", {}, rete(true, "")), null, "corpo vuoto = null");
  await assert.rejects(C.chiama("invia_domanda", {}, rete(false, '{"message":"La domanda è troppo corta."}')), /La domanda è troppo corta\./);
  await assert.rejects(C.chiama("bacheca", {}, rete(false, "<html>521</html>")), /Il servizio non risponde/);
  await assert.rejects(C.chiama("bacheca", {}, rete(false, '{"message":42}')), /Il servizio non risponde/, "messaggio non testuale = generico");
  await assert.rejects(C.chiama("bacheca", {}, async () => { throw new TypeError("Failed to fetch"); }), /Niente rete/);
});

test("chiama: URL, chiave pubblica e corpo giusti", async () => {
  let visto;
  await C.chiama("regia_elenco", { p_codice: "x", p_sessione: "s" }, async (url, o) => { visto = { url, o }; return { ok: true, text: async () => "[]" }; });
  assert.equal(visto.url, HOST + "/rest/v1/rpc/regia_elenco");
  assert.equal(visto.o.method, "POST");
  assert.equal(visto.o.headers.apikey, C.CHIAVE);
  assert.match(C.CHIAVE, /^sb_publishable_/, "solo la chiave pubblica, mai una chiave di servizio");
  assert.deepEqual(JSON.parse(visto.o.body), { p_codice: "x", p_sessione: "s" });
});
