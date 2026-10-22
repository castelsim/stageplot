/* Programma di sala (0082) — sul Postgres LOCALE (senza stack: «SALTATO», come gli altri rls-*).
   Contratto: la tabella è chiusa ai client; si scrive solo con prg_salva (account abilitato alla biglietteria); chiunque legge,
   ma solo i pubblicati, e mai email o user_id. Dati inventati («Orchestra di prova», «Concerto d'esempio»). */
import assert from "node:assert/strict";
import { env, run, stamp, errore, rest, rpc, admin, account, abilita } from "./_bgl.mjs";

const S = stamp(), U = {};
const anon = (fn, a) => rpc(env, env.ANON_KEY, fn, a);
const doc = (titolo = "Concerto d'esempio") => ({ v: 1, intestazione: { sopratitolo: "Orchestra di prova", titolo, righe: ["Riga di prova"] },
  sezioni: [{ tipo: "testo", titolo: "Note", paragrafi: ["Testo di prova."] }], link: [{ testo: "Sito", url: "https://example.invalid/" }] });
const SLUG = (n) => "prg-" + n + "-" + S.slice(-8);

run("preparazione: un organizzatore abilitato, un altro abilitato, un utente non abilitato", async () => {
  U.a = await account("prg-a", S, { abilitato: true });
  U.b = await account("prg-b", S, { abilitato: true });
  U.x = await account("prg-x", S);
});

run("abilitato: salva un programma nuovo; la risposta ha solo slug e aggiornato", async () => {
  const r = await rpc(env, U.a.tok, "prg_salva", { p_slug: SLUG("uno").toUpperCase(), p_dati: doc(), p_pubblicato: false });
  assert.equal(r.d.ok, true, JSON.stringify(r.d));
  assert.deepEqual(Object.keys(r.d).sort(), ["aggiornato", "ok", "slug"]);
  assert.equal(r.d.slug, SLUG("uno"), "slug in minuscolo");
});

run("anon: un programma non pubblicato è null; pubblicato restituisce solo {dati, aggiornato}", async () => {
  assert.equal((await anon("prg_programma_pubblico", { p_slug: SLUG("uno") })).d, null);
  assert.equal((await anon("prg_programma_pubblico", { p_slug: SLUG("inesistente") })).d, null);
  assert.equal((await rpc(env, U.a.tok, "prg_salva", { p_slug: SLUG("uno"), p_dati: doc("Primo"), p_pubblicato: true })).d.ok, true);
  const r = await anon("prg_programma_pubblico", { p_slug: SLUG("uno").toUpperCase() });
  assert.deepEqual(Object.keys(r.d).sort(), ["aggiornato", "dati"]);
  assert.equal(r.d.dati.intestazione.titolo, "Primo", "l'aggiornamento ha sostituito il contenuto");
  const t = JSON.stringify(r.d);
  assert.ok(!t.includes(U.a.uid) && !t.includes(U.a.email) && !/user_id|email/.test(t), "mai email o user_id in uscita");
});

run("lo stesso indirizzo, un altro contenuto: il QR stampato resta valido (aggiornamenti, anche togliere la pubblicazione)", async () => {
  assert.equal((await rpc(env, U.a.tok, "prg_salva", { p_slug: SLUG("uno"), p_dati: doc("Secondo"), p_pubblicato: true })).d.ok, true);
  assert.equal((await anon("prg_programma_pubblico", { p_slug: SLUG("uno") })).d.dati.intestazione.titolo, "Secondo");
  assert.equal((await rpc(env, U.a.tok, "prg_salva", { p_slug: SLUG("uno"), p_dati: doc("Secondo"), p_pubblicato: false })).d.ok, true);
  assert.equal((await anon("prg_programma_pubblico", { p_slug: SLUG("uno") })).d, null, "ritirato = non disponibile");
});

run("anon e utente non abilitato non possono salvare", async () => {
  const a = await anon("prg_salva", { p_slug: SLUG("anon"), p_dati: doc(), p_pubblicato: true });
  assert.equal(a.ok, false, "anon: nessun permesso sulla funzione");
  assert.equal(errore(await rpc(env, U.x.tok, "prg_salva", { p_slug: SLUG("x"), p_dati: doc(), p_pubblicato: true })), "non_abilitato");
  assert.equal((await rest(env, admin(env), "prg_programmi?slug=eq." + SLUG("x"))).d.length, 0);
  await abilita(U.x.uid, false);
  assert.equal(errore(await rpc(env, U.x.tok, "prg_salva", { p_slug: SLUG("x"), p_dati: doc(), p_pubblicato: true })), "non_abilitato", "riga presente ma abilitato = false");
});

run("un abilitato non tocca il programma di un altro; il proprietario resta lui", async () => {
  assert.equal(errore(await rpc(env, U.b.tok, "prg_salva", { p_slug: SLUG("uno"), p_dati: doc("Rubato"), p_pubblicato: true })), "slug_occupato");
  const riga = (await rest(env, admin(env), "prg_programmi?select=user_id,dati&slug=eq." + SLUG("uno"))).d[0];
  assert.equal(riga.user_id, U.a.uid);
  assert.equal(riga.dati.intestazione.titolo, "Secondo");
});

run("dati e indirizzo non validi sono rifiutati (forma, versione, tetto di 100 KB, parole riservate)", async () => {
  const salva = (slug, dati, pub = true) => rpc(env, U.a.tok, "prg_salva", { p_slug: slug, p_dati: dati, p_pubblicato: pub });
  for (const d of [null, [], "x", 5, {}, { v: 2 }, { v: "1" }, { v: 1.5 }, { dati: 1 }])
    assert.deepEqual([errore(await salva(SLUG("ko"), d)), (await salva(SLUG("ko"), d)).d.campo], ["dati_non_validi", "dati"], JSON.stringify(d));
  const grande = { v: 1, sezioni: [{ tipo: "testo", paragrafi: ["x".repeat(110_000)] }] };
  assert.equal((await salva(SLUG("ko"), grande)).d.campo, "dati", "oltre 100 KB");
  assert.equal((await salva(SLUG("ok"), { v: 1, sezioni: [{ tipo: "testo", paragrafi: ["x".repeat(90_000)] }] })).d.ok, true, "sotto il tetto passa");
  for (const s of ["a", "ab--cd", "-abcd", "abcd-", "con spazio", "a".repeat(41), "Ü-ber", "mie", "programma", "index", "admin", "biglietteria", "", null])
    assert.equal((await salva(s, doc())).d.campo, "slug", String(s));
  assert.equal((await salva(SLUG("pub"), doc(), null)).d.campo, "pubblicato");
  assert.equal((await rest(env, admin(env), "prg_programmi?slug=eq." + SLUG("ko"))).d.length, 0, "niente di scritto");
});

run("nessun accesso diretto alla tabella: anon niente; l'utente legge solo i suoi e non scrive", async () => {
  const anonLegge = await rest(env, env.ANON_KEY, "prg_programmi?select=slug");
  assert.ok(!anonLegge.ok || (anonLegge.d || []).length === 0, "anon non legge la tabella");
  const mie = await rest(env, U.a.tok, "prg_programmi?select=slug,pubblicato");
  assert.equal(mie.ok, true);
  assert.ok(mie.d.some((x) => x.slug === SLUG("uno")) && mie.d.every((x) => x.slug.endsWith(S.slice(-8))), "solo i suoi");
  const altrui = await rest(env, U.b.tok, "prg_programmi?select=slug&slug=eq." + SLUG("uno"));
  assert.deepEqual(altrui.d, [], "un altro utente non vede nemmeno il non pubblicato");
  const riga = { slug: SLUG("dir"), user_id: U.a.uid, dati: doc(), pubblicato: true };
  assert.equal((await rest(env, U.a.tok, "prg_programmi", { method: "POST", body: riga })).ok, false, "insert diretto vietato");
  assert.equal((await rest(env, env.ANON_KEY, "prg_programmi", { method: "POST", body: riga })).ok, false, "insert anon vietato");
  const upd = await rest(env, U.a.tok, "prg_programmi?slug=eq." + SLUG("uno"), { method: "PATCH", body: { pubblicato: true } });
  assert.ok(!upd.ok || (upd.d || []).length === 0, "update diretto vietato");
  const del = await rest(env, U.a.tok, "prg_programmi?slug=eq." + SLUG("uno"), { method: "DELETE" });
  assert.ok(!del.ok || (del.d || []).length === 0, "delete diretto vietato");
  assert.equal((await rest(env, admin(env), "prg_programmi?slug=eq." + SLUG("uno"))).d.length, 1, "la riga c'è ancora");
});

run("pulizia account: chi ha un programma non è «solo biglietteria» e non si cancella; il programma segue l'account (cascade)", async () => {
  const c = await account("prg-c", S);
  assert.equal((await rpc(env, c.tok, "bgl_pubblico_registra", {})).d.pubblico, true);
  assert.equal((await rest(env, admin(env), "prg_programmi", { method: "POST", body: { slug: SLUG("cc"), user_id: c.uid, dati: doc(), pubblicato: true } })).ok, true);
  assert.equal(errore(await rpc(env, admin(env), "bgl_account_prepara_eliminazione", { p_uid: c.uid })), "account_in_uso");
  const cancella = await fetch(env.API_URL + "/auth/v1/admin/users/" + c.uid, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY } });
  assert.ok(cancella.ok);
  assert.equal((await rest(env, admin(env), "prg_programmi?slug=eq." + SLUG("cc"))).d.length, 0, "senza account niente programma staccato");
});
