/* Programma di sala, spazio delle immagini (0083) — sul Postgres e lo Storage LOCALI (senza stack: «SALTATO», come gli altri rls-*).
   Ogni rifiuto si verifica anche guardando che il file NON ci sia (il codice d'errore dello Storage cambia fra versioni). */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { env, run, stamp, account, abilita } from "./_bgl.mjs";

const S = stamp(), U = {};
const BUCKET = "prg-immagini";
const hex = () => randomBytes(16).toString("hex");
const nomeDi = (a, est = "webp") => `${a.uid}/${hex()}.${est}`;
const TIPO = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };
function carica(tok, path, { tipo = "image/webp", byte = 10_000, upsert = false } = {}) {
  return fetch(`${env.API_URL}/storage/v1/object/${BUCKET}/${path}`, { method: "POST",
    headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + tok, "Content-Type": tipo, "x-upsert": String(upsert) },
    body: Buffer.alloc(byte, 7) }).then(async (r) => ({ ok: r.ok, status: r.status, testo: await r.text() }));
}
const pubblica = (path) => fetch(`${env.API_URL}/storage/v1/object/public/${BUCKET}/${path}`).then((r) => r.status);
const elenco = (tok, prefix) => fetch(`${env.API_URL}/storage/v1/object/list/${BUCKET}`, { method: "POST",
  headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + tok, "Content-Type": "application/json" },
  body: JSON.stringify({ prefix, limit: 100 }) }).then(async (r) => (r.ok ? r.json() : []));
const togli = (tok, path) => fetch(`${env.API_URL}/storage/v1/object/${BUCKET}`, { method: "DELETE",
  headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + tok, "Content-Type": "application/json" },
  body: JSON.stringify({ prefixes: [path] }) }).then((r) => r.json().catch(() => []));

run("preparazione: due account abilitati e uno no", async () => {
  U.a = await account("pimg-a", S, { abilitato: true });
  U.b = await account("pimg-b", S, { abilitato: true });
  U.x = await account("pimg-x", S);
});

run("un abilitato carica webp, jpg e png nella SUA cartella col nome casuale; chiunque li legge dall'indirizzo pubblico", async () => {
  for (const est of ["webp", "jpg", "png"]) {
    const p = nomeDi(U.a, est);
    const r = await carica(U.a.tok, p, { tipo: TIPO[est] });
    assert.ok(r.ok, est + ": " + r.status + " " + r.testo);
    assert.equal(await pubblica(p), 200, est + ": lettura pubblica senza accesso");
  }
});

run("rifiutati: cartella d'altri, nome non casuale, sottocartelle, estensione o tipo non ammessi (SVG, gif, html), oltre 3 MB, non abilitato, anonimo", async () => {
  const casi = [
    ["cartella d'altri", U.a.tok, nomeDi(U.b), {}],
    ["nome scelto", U.a.tok, `${U.a.uid}/copertina.webp`, {}],
    ["sottocartella", U.a.tok, `${U.a.uid}/sotto/${hex()}.webp`, {}],
    ["estensione svg", U.a.tok, `${U.a.uid}/${hex()}.svg`, { tipo: "image/svg+xml" }],
    ["estensione gif", U.a.tok, `${U.a.uid}/${hex()}.gif`, { tipo: "image/gif" }],
    ["svg dietro estensione png", U.a.tok, `${U.a.uid}/${hex()}.png`, { tipo: "image/svg+xml" }],
    ["html", U.a.tok, `${U.a.uid}/${hex()}.webp`, { tipo: "text/html" }],
    ["oltre 3 MB", U.a.tok, nomeDi(U.a), { byte: 3_145_729 }],
    ["non abilitato", U.x.tok, nomeDi(U.x), {}],
    ["anonimo", env.ANON_KEY, nomeDi(U.a), {}],
  ];
  for (const [chi, tok, path, o] of casi) {
    const r = await carica(tok, path, o);
    assert.equal(r.ok, false, chi + ": " + r.status + " " + r.testo);
    assert.notEqual(await pubblica(path), 200, chi + ": il file non deve esserci");
  }
  assert.ok((await carica(U.a.tok, nomeDi(U.a, "png"), { tipo: "image/png", byte: 3_000_000 })).ok, "poco meno di 3 MB passa");
});

run("un abilitato che perde l'abilitazione non carica più; il file già caricato resta leggibile", async () => {
  const c = await account("pimg-c", S, { abilitato: true });
  const prima = nomeDi(c);
  assert.ok((await carica(c.tok, prima)).ok);
  await abilita(c.uid, false);
  const dopo = nomeDi(c);
  assert.equal((await carica(c.tok, dopo)).ok, false);
  assert.notEqual(await pubblica(dopo), 200);
  assert.equal(await pubblica(prima), 200);
});

run("niente sovrascrittura: un file pubblicato non si cambia, nemmeno con upsert; si carica un nome nuovo", async () => {
  const p = nomeDi(U.a);
  assert.ok((await carica(U.a.tok, p, { byte: 5_000 })).ok);
  assert.equal((await carica(U.a.tok, p, { upsert: true, byte: 20 })).ok, false, "upsert rifiutato");
  assert.equal((await carica(U.a.tok, p, { byte: 20 })).ok, false, "secondo caricamento sullo stesso nome rifiutato");
  const r = await fetch(`${env.API_URL}/storage/v1/object/public/${BUCKET}/${p}`);
  assert.equal((await r.arrayBuffer()).byteLength, 5_000, "il contenuto è ancora quello di prima");
});

run("elenco e cancellazione: solo i propri file, solo da abilitati", async () => {
  const p = nomeDi(U.a);
  assert.ok((await carica(U.a.tok, p)).ok);
  assert.deepEqual(await elenco(U.b.tok, U.a.uid + "/"), [], "un altro account non vede i nomi");
  assert.deepEqual(await elenco(env.ANON_KEY, U.a.uid + "/"), [], "l'anonimo nemmeno");
  assert.ok((await elenco(U.a.tok, U.a.uid + "/")).some((f) => p.endsWith(f.name)), "il proprietario sì");
  await togli(env.ANON_KEY, p);
  await togli(U.b.tok, p);
  assert.equal(await pubblica(p), 200, "né l'anonimo né un altro account la cancellano");
  await togli(U.a.tok, p);
  assert.notEqual(await pubblica(p), 200, "il proprietario sì (Storage API, mai DELETE in SQL)");
});
