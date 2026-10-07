/* Biglietteria — area dell'organizzatore: accesso condiviso, immagini, pagina. node --test test/bgl-area.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ACC = require(join(root, "biglietteria/accesso.js"));
const IMG = require(join(root, "biglietteria/gestione/gst-immagine.js"));
const leggi = (p) => readFileSync(join(root, p), "utf8");

test("accesso: la stessa chiave di sessione dell'editor (supabase-js), anche sullo stack locale", () => {
  assert.equal(ACC.chiaveSessione("https://vsodplqkuvnsdiikvmjb.supabase.co"), "sb-vsodplqkuvnsdiikvmjb-auth-token");
  assert.equal(ACC.chiaveSessione("http://127.0.0.1:54321"), "sb-127-auth-token");
  const st = new Map([["sb-127-auth-token", JSON.stringify({ access_token: "x" })]]);
  const storage = { getItem: (k) => st.get(k) ?? null };
  assert.equal(ACC.sessioneSalvata(storage, "http://127.0.0.1:54321"), true);
  assert.equal(ACC.sessioneSalvata(storage, "https://vsodplqkuvnsdiikvmjb.supabase.co"), false);
  assert.equal(ACC.sessioneSalvata({ getItem: () => { throw new Error("bloccato"); } }, "http://127.0.0.1:54321"), false);
});

test("AGENTS §8: sessione nulla con un errore di rete NON vuol dire «uscito»", () => {
  assert.equal(ACC.statoAccesso({ sessione: { access_token: "t" }, errore: null }), "dentro");
  assert.equal(ACC.statoAccesso({ sessione: null, errore: { name: "AuthRetryableFetchError", message: "Failed to fetch" } }), "senza_rete");
  assert.equal(ACC.statoAccesso({ sessione: null, errore: null }), "fuori");
  assert.equal(ACC.statoAccesso({ sessione: null, errore: { name: "AuthApiError", message: "Invalid Refresh Token" } }), "fuori");
});

test("nome e cognome da Google, modificabili", () => {
  assert.deepEqual(ACC.nomeDaGoogle({ given_name: "Maria", family_name: "Bianchi", full_name: "x y" }), { nome: "Maria", cognome: "Bianchi" });
  assert.deepEqual(ACC.nomeDaGoogle({ full_name: "Maria  De Rossi" }), { nome: "Maria", cognome: "De Rossi" });
  assert.deepEqual(ACC.nomeDaGoogle({ name: "Prince" }), { nome: "Prince", cognome: "" });
  assert.deepEqual(ACC.nomeDaGoogle(null), { nome: "", cognome: "" });
});

test("RF4: immagini ridotte a 1200 px sul lato lungo, mai ingrandite", () => {
  assert.deepEqual(IMG.dimensioniRidotte(4032, 3024), { w: 1200, h: 900 });
  assert.deepEqual(IMG.dimensioniRidotte(3024, 4032), { w: 900, h: 1200 });
  assert.deepEqual(IMG.dimensioniRidotte(800, 600), { w: 800, h: 600 });
  assert.equal(IMG.dimensioniRidotte(0, 10), null);
  assert.equal(IMG.LATO, 1200); assert.equal(IMG.MAX_BYTE, 400 * 1024);
});

test("RF4: Safari che dà PNG al posto del WebP → JPEG; troppo pesante a ogni qualità → nessun caricamento", async () => {
  const fintoSafari = (tipo, q) => Promise.resolve(tipo === "image/webp" ? { type: "image/png", size: 100 } : { type: "image/jpeg", size: Math.round(900000 * q) });
  const r = await IMG.cercaFormato(fintoSafari);
  assert.deepEqual([r.tipo, r.est, r.blob.size], ["image/jpeg", "jpg", Math.round(900000 * 0.45)], "il primo JPEG sotto i 400 KB");
  const chrome = (tipo, q) => Promise.resolve({ type: tipo, size: tipo === "image/webp" ? Math.round(500000 * q) : 999999 });
  assert.deepEqual((await IMG.cercaFormato(chrome)).tipo, "image/webp");
  const enorme = (tipo) => Promise.resolve({ type: tipo, size: 5_000_000 });
  assert.equal(await IMG.cercaFormato(enorme), null);
  assert.equal(await IMG.cercaFormato(() => Promise.resolve(null)), null, "toBlob che non dà niente");
});

test("RF4: cosa si accetta (anche HEIC dal telefono), nomi casuali, messaggi in parole", () => {
  assert.equal(IMG.tipoAccettato({ type: "image/jpeg", name: "a.jpg" }), true);
  assert.equal(IMG.tipoAccettato({ type: "", name: "IMG_0001.HEIC" }), true, "iPhone: tipo vuoto ma .heic");
  assert.equal(IMG.tipoAccettato({ type: "application/pdf", name: "locandina.pdf" }), false);
  assert.equal(IMG.sceltaFormato("image/png"), null);
  const hex = IMG.esadecimale(16, (a) => { a.fill(171); return a; });
  assert.equal(hex, "ab".repeat(16));
  assert.match(IMG.nomeFile("0b8d0000-0000-4000-8000-000000000001", hex, "webp"), /^[0-9a-f-]{36}\/[0-9a-f]{32}\.webp$/);
  assert.match(IMG.MESSAGGI.formato, /HEIC/); assert.match(IMG.MESSAGGI.troppo_grande, /pesante/);
});

test("la pagina dell'area: noindex, niente referrer, CSP stretta, script nell'ordine giusto", () => {
  const h = leggi("biglietteria/gestione/index.html");
  assert.match(h, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(h, /<meta name="referrer" content="no-referrer">/);
  const csp = (h.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  assert.match(csp, /default-src 'self'/); assert.match(csp, /object-src 'none'/); assert.match(csp, /form-action 'none'/);
  assert.match(csp, /img-src 'self' data: blob: https:\/\/vsodplqkuvnsdiikvmjb\.supabase\.co http:\/\/127\.0\.0\.1:54321 http:\/\/localhost:54321;/);
  assert.match(h, /window\.self!==window\.top/, "anti-incorniciamento");
  const ordine = ["/accedi/google/avvio.js", "../indirizzi.js", "../bgl.js", "../pianta-posti.js", "../accesso.js", "gst.js", "gst-immagine.js", "gst-app.js"];
  const pos = ordine.map((s) => h.indexOf('src="' + s));
  assert.ok(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1])), "ordine: " + JSON.stringify(pos));
  assert.equal(leggi("sitemap.xml").indexOf("gestione"), -1);
});

test("senza rete la risposta non si fa aspettare 30 secondi: dopo ATTESA_MS vale «senza rete»", async () => {
  assert.ok(ACC.ATTESA_MS >= 5000 && ACC.ATTESA_MS <= 12000, "fra 5 e 12 secondi");
  const mai = new Promise(() => {});
  const r = await ACC.conLimite(mai, 20, { sessione: null, errore: { name: "AuthRetryableFetchError", message: "timeout" } });
  assert.equal(ACC.statoAccesso(r), "senza_rete");
  assert.equal(await ACC.conLimite(Promise.resolve("subito"), 1000, "tardi"), "subito");
  await assert.rejects(ACC.conLimite(Promise.reject(new Error("x")), 1000, "tardi"));
});

test("di ritorno dall'editor l'area rilegge il progetto: niente sala vecchia in memoria (integrazione ondata E/F)", () => {
  /* la prova che discrimina è nel browser (area-prove/prova-ritorno.mjs, con le mutazioni); qui il contratto fra i file */
  const leggi = (f) => readFileSync(join(root, "biglietteria/gestione/" + f), "utf8");
  const app = leggi("gst-app.js");
  assert.match(app, /function mostra\(\) \{[^}]*dimenticaProgetti\(\);/, "a ogni schermata il progetto si rilegge");
  assert.match(app, /addEventListener\("visibilitychange"[\s\S]{0,200}dimenticaProgetti\(\)/, "tornando sulla pagina il progetto si rilegge");
  for (const [f, v] of [["gst-scheda.js", "scheda"], ["gst-sala.js", "sala"], ["gst-modulo.js", "nuovo"]])
    assert.match(leggi(f), new RegExp('A\\.estendi\\("di-nuovo-visibile"[\\s\\S]{0,120}v === "' + v + '"'), f + ": la schermata si aggiorna al ritorno");
  assert.match(leggi("gst-sala.js"), /A\.vai\("sposta", \{[^}]*da: "sala"/, "Sposta dalla sala riporta alla sala");
});

test("revisione T23: le locandine si caricano con una cache breve (un giorno): eliminato lo spettacolo, non restano un anno sul CDN", () => {
  assert.ok(Number(IMG.CACHE) > 0 && Number(IMG.CACHE) <= 86400, "cacheControl: " + IMG.CACHE);
  assert.match(leggi("biglietteria/gestione/gst-immagine.js"), /cacheControl: CACHE\b/);
});
