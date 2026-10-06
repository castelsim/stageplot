/* Biglietteria — lo spazio delle locandine (0076, specifica area §5). Sul Postgres e lo Storage LOCALI.
   Ogni rifiuto si verifica anche guardando che il file NON ci sia (il codice d'errore dello Storage cambia fra versioni). */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { env, run, stamp, errore, rpc, admin, docSala, account, progetto, paginaOrganizzatore, spettacolo } from "./_bgl.mjs";

const S = stamp(), U = {};
const hex = () => randomBytes(16).toString("hex");
const nomeDi = (a, est = "webp") => `${a.uid}/${hex()}.${est}`;
function carica(tok, path, { tipo = "image/webp", byte = 10_000, upsert = false } = {}) {
  return fetch(`${env.API_URL}/storage/v1/object/bgl-locandine/${path}`, { method: "POST",
    headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + tok, "Content-Type": tipo, "x-upsert": String(upsert) },
    body: Buffer.alloc(byte, 7) }).then(async (r) => ({ ok: r.ok, status: r.status, testo: await r.text() }));
}
const pubblica = (path) => fetch(`${env.API_URL}/storage/v1/object/public/bgl-locandine/${path}`).then((r) => r.status);
const elenco = (tok, prefix) => fetch(`${env.API_URL}/storage/v1/object/list/bgl-locandine`, { method: "POST",
  headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + tok, "Content-Type": "application/json" },
  body: JSON.stringify({ prefix, limit: 100 }) }).then(async (r) => (r.ok ? r.json() : []));
const togli = (tok, path) => fetch(`${env.API_URL}/storage/v1/object/bgl-locandine`, { method: "DELETE",
  headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + tok, "Content-Type": "application/json" },
  body: JSON.stringify({ prefixes: [path] }) }).then((r) => r.json().catch(() => []));

run("preparazione", async () => {
  U.org = await account("loc", S, { abilitato: true });
  U.altro = await account("loc2", S, { abilitato: true });
  U.no = await account("loc3", S);
});

run("un account abilitato carica nella SUA cartella col nome casuale; chiunque la legge dall'indirizzo pubblico", async () => {
  const p = nomeDi(U.org);
  const r = await carica(U.org.tok, p);
  assert.ok(r.ok, r.status + " " + r.testo);
  assert.equal(await pubblica(p), 200);
  const j = nomeDi(U.org, "jpg");
  assert.ok((await carica(U.org.tok, j, { tipo: "image/jpeg" })).ok, "anche JPEG");
});

run("rifiutati: cartella d'altri, nome non casuale, sottocartelle, tipi non immagine o SVG, oltre 1 MB, non abilitato, anonimo, sovrascrittura", async () => {
  const casi = [
    ["cartella d'altri", U.org.tok, nomeDi(U.altro), {}],
    ["nome scelto", U.org.tok, `${U.org.uid}/locandina.webp`, {}],
    ["sottocartella", U.org.tok, `${U.org.uid}/sotto/${hex()}.webp`, {}],
    ["estensione png", U.org.tok, `${U.org.uid}/${hex()}.png`, { tipo: "image/png" }],
    ["svg", U.org.tok, `${U.org.uid}/${hex()}.webp`, { tipo: "image/svg+xml" }],
    ["html", U.org.tok, `${U.org.uid}/${hex()}.webp`, { tipo: "text/html" }],
    ["oltre 1 MB", U.org.tok, nomeDi(U.org), { byte: 1_048_577 }],
    ["non abilitato", U.no.tok, nomeDi(U.no), {}],
    ["anonimo", env.ANON_KEY, nomeDi(U.org), {}],
  ];
  for (const [chi, tok, path, o] of casi) {
    const r = await carica(tok, path, o);
    assert.equal(r.ok, false, chi + ": " + r.status + " " + r.testo);
    assert.notEqual(await pubblica(path), 200, chi + ": il file non deve esserci");
  }
  assert.ok((await carica(U.org.tok, nomeDi(U.org), { byte: 1_000_000 })).ok, "poco meno di 1 MB passa (il browser manda ≤ 400 KB)");
  const p = nomeDi(U.org);
  assert.ok((await carica(U.org.tok, p)).ok);
  assert.equal((await carica(U.org.tok, p, { upsert: true, byte: 20 })).ok, false, "un file pubblicato non si sovrascrive");
});

run("elenco e cancellazione: solo i propri file", async () => {
  const p = nomeDi(U.org);
  assert.ok((await carica(U.org.tok, p)).ok);
  assert.deepEqual(await elenco(U.altro.tok, U.org.uid + "/"), [], "un altro account non vede i nomi (non indovinabili prima della pubblicazione)");
  assert.deepEqual(await elenco(env.ANON_KEY, U.org.uid + "/"), [], "l'anonimo nemmeno");
  await togli(U.altro.tok, p);
  assert.equal(await pubblica(p), 200, "un altro account non la cancella");
  await togli(U.org.tok, p);
  assert.notEqual(await pubblica(p), 200, "il proprietario sì");
});

run("lo spettacolo accetta solo una locandina propria e che esiste; le orfane sono quelle che nessuno cita, dopo 24 ore", async () => {
  const prog = await progetto(U.org, docSala());
  await paginaOrganizzatore(U.org, "teatro-loc-" + S.slice(-6));
  const mia = nomeDi(U.org), dAltri = nomeDi(U.altro), orfana = nomeDi(U.org);
  for (const [a, p] of [[U.org, mia], [U.altro, dAltri], [U.org, orfana]]) assert.ok((await carica(a.tok, p)).ok);
  const r = await spettacolo(U.org, prog, { locandina_path: mia });
  assert.equal(r.d.ok, true, JSON.stringify(r.d));
  assert.equal(errore(await spettacolo(U.org, prog, { locandina_path: dAltri })), "dati_non_validi", "il file di un altro account");
  /* «più vecchie di p_prima»: con p_prima fra un minuto tutti i file contano come vecchi, con p_prima 24 ore fa nessuno */
  const orfane = async (ms) => (await rpc(env, admin(env), "bgl_locandine_orfane", { p_prima: new Date(Date.now() + ms).toISOString() })).d;
  const o = await orfane(60_000);
  assert.ok(o.includes(orfana) && o.includes(dAltri), "le non usate");
  assert.ok(!o.includes(mia), "quella dello spettacolo no");
  assert.ok(!(await orfane(-86_400_000)).includes(orfana), "appena caricata: aspetta 24 ore (il modulo potrebbe non essere ancora salvato)");
  assert.equal((await rpc(env, U.org.tok, "bgl_locandine_orfane", { p_prima: new Date().toISOString() })).ok, false, "solo il servizio");
  const el = await rpc(env, U.org.tok, "bgl_elimina", { p_evento_id: r.d.id });
  assert.equal(el.d.locandina, mia, "eliminando lo spettacolo si sa quale file togliere");
});

run("una locandina usata anche altrove (altro spettacolo, logo) non si dichiara «da togliere»", async () => {
  const c = await account("loc4", S, { abilitato: true });
  const prog = await progetto(c, docSala());
  await paginaOrganizzatore(c, "teatro-loc4-" + S.slice(-6));
  const comune = nomeDi(c), nuova = nomeDi(c), sola = nomeDi(c);
  for (const p of [comune, nuova, sola]) assert.ok((await carica(c.tok, p)).ok);
  const a = (await spettacolo(c, prog, { locandina_path: comune })).d, b = (await spettacolo(c, prog, { locandina_path: comune })).d;
  const cambio = await rpc(env, c.tok, "bgl_spettacolo_salva", { p_id: a.id, p_dati: { locandina_path: nuova } });
  assert.deepEqual([cambio.d.ok, cambio.d.locandina_vecchia], [true, null], "la vecchia la usa ancora l'altro spettacolo");
  const logo = await rpc(env, c.tok, "bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: "teatro-loc4-" + S.slice(-6), logo_path: comune } });
  assert.equal(logo.d.ok, true, JSON.stringify(logo.d));
  assert.equal((await rpc(env, c.tok, "bgl_elimina", { p_evento_id: b.id })).d.locandina, null, "è anche il logo");
  const via = await rpc(env, c.tok, "bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: "teatro-loc4-" + S.slice(-6), logo_path: sola } });
  assert.equal(via.d.logo_vecchio, comune, "ora non la cita più nessuno: si toglie");
  const ultimo = await rpc(env, c.tok, "bgl_spettacolo_salva", { p_id: a.id, p_dati: { locandina_path: null } });
  assert.equal(ultimo.d.locandina_vecchia, nuova, "senza altri che la citano, la vecchia si toglie");
});
