/* Biglietteria — il pubblico con l'account Google (0078, specifica area §3.3, §3.4, §6). Sul Postgres LOCALE.
   Gli account «del pubblico» qui sono utenti con password dello stack locale: per il database un accesso Google è
   uguale (stesso auth.users). Dati inventati. */
import assert from "node:assert/strict";
import { env, run, stamp, fra, errore, rest, rpc, admin, docSala, account, progetto, paginaOrganizzatore,
  spettacolo, psql } from "./_bgl.mjs";

const S = stamp(), U = {};
let EV, BOZZA, PROG;
const prenotaCon = (slug, posti, uid, email, extra = {}) => rpc(env, admin(env), "bgl_prenota", { p_slug: slug, p_posti: posti,
  p_nome: "Maria", p_cognome: "Bianchi", p_email: email, p_user_id: uid, ...extra });

run("preparazione: un organizzatore, uno spettacolo pubblicato e una bozza, due persone del pubblico", async () => {
  U.org = await account("gorg", S, { abilitato: true });
  PROG = await progetto(U.org, docSala());
  await paginaOrganizzatore(U.org, "teatro-g-" + S.slice(-6));
  EV = (await spettacolo(U.org, PROG, { pubblicato: true })).d;
  BOZZA = (await spettacolo(U.org, PROG, { titolo: "Bozza" })).d;
  U.maria = await account("maria", S);
  U.luca = await account("luca", S);
});

run("con l'account: la prenotazione è legata a lui e l'account diventa «del pubblico»; senza, come prima", async () => {
  const r = await prenotaCon(EV.slug, ["Platea|A|1"], U.maria.uid, U.maria.email);
  assert.equal(r.d.ok, true, JSON.stringify(r.d));
  assert.deepEqual(Object.keys(r.d).sort(), ["codice", "cognome", "email", "evento", "mail", "nome", "ok", "posti", "prenotazione_id", "ripetuta", "token"]);
  const riga = (await rest(env, admin(env), "bgl_prenotazioni?select=user_id&id=eq." + r.d.prenotazione_id)).d[0];
  assert.equal(riga.user_id, U.maria.uid);
  assert.equal((await rest(env, admin(env), "bgl_pubblico?select=user_id&user_id=eq." + U.maria.uid)).d.length, 1);
  const vecchia = await rpc(env, admin(env), "bgl_prenota", { p_slug: EV.slug, p_posti: ["Platea|A|2"], p_nome: "Mario", p_cognome: "Rossi",
    p_email: "mario." + S + "@example.invalid" });
  assert.equal(vecchia.d.ok, true, "la chiamata di prima (7 argomenti) funziona uguale");
});

run("chi ha già un progetto non diventa «del pubblico»", async () => {
  const c = await account("editore", S);
  await progetto(c, docSala());
  assert.equal((await prenotaCon(EV.slug, ["Platea|A|3"], c.uid, c.email)).d.ok, true);
  assert.equal((await rest(env, admin(env), "bgl_pubblico?select=user_id&user_id=eq." + c.uid)).d.length, 0);
});

run("tetto per ACCOUNT: 4 posti anche cambiando email, e anche in parallelo", async () => {
  const r1 = await prenotaCon(EV.slug, ["Platea|B|1", "Platea|B|2"], U.luca.uid, "luca1." + S + "@example.invalid");
  const r2 = await prenotaCon(EV.slug, ["Platea|B|3", "Platea|B|4"], U.luca.uid, "luca2." + S + "@example.invalid");
  assert.ok(r1.d.ok && r2.d.ok);
  const r3 = await prenotaCon(EV.slug, ["Platea|B|5"], U.luca.uid, "luca3." + S + "@example.invalid");
  assert.deepEqual([errore(r3), r3.d.gia, r3.d.max], ["limite_account", 4, 4]);
  const c = await account("gara", S);
  const tre = await Promise.all([1, 2, 3].map((i) => prenotaCon(EV.slug, ["Platea|C|" + (2 * i - 1), "Platea|C|" + 2 * i], c.uid, `gara${i}.${S}@example.invalid`)));
  assert.equal(tre.filter((r) => r.d.ok).length, 2, "due da 2 posti passano, la terza no: " + JSON.stringify(tre.map((r) => r.d.errore || "ok")));
  assert.equal(tre.filter((r) => errore(r) === "limite_account").length, 1);
});

run("le bozze non si prenotano nemmeno dal servizio", async () => {
  assert.equal(errore(await prenotaCon(BOZZA.slug, ["Platea|A|1"], U.maria.uid, U.maria.email)), "evento_inesistente");
});

run("Le mie prenotazioni: solo le proprie, con il percorso della scheda; disdire le proprie e basta", async () => {
  const m = await rpc(env, U.maria.tok, "bgl_mie_prenotazioni", {});
  assert.equal(m.d.ok, true);
  assert.equal(m.d.prenotazioni.length, 1);
  const p = m.d.prenotazioni[0];
  assert.deepEqual([p.posti, p.stato, p.disdicibile, p.evento.percorso], [["Platea|A|1"], "attiva", true, "teatro-g-" + S.slice(-6) + "/" + EV.slug_breve]);
  assert.doesNotMatch(JSON.stringify(m.d), /Bianchi|@/, "niente nomi né email: li conosce già");
  assert.equal((await rpc(env, env.ANON_KEY, "bgl_mie_prenotazioni", {})).ok, false, "l'anonimo no");
  assert.equal(errore(await rpc(env, U.luca.tok, "bgl_disdici_mia", { p_prenotazione_id: p.id })), "non_tuo");
  const d = await rpc(env, U.maria.tok, "bgl_disdici_mia", { p_prenotazione_id: p.id });
  assert.deepEqual(d.d, { ok: true, liberati: 1 });
  assert.equal(errore(await rpc(env, U.maria.tok, "bgl_disdici_mia", { p_prenotazione_id: p.id })), "gia_disdetta");
});

run("D9: «Elimina il mio account» prepara: future disdette, nomi ed email via; un account che usa StagePlot no", async () => {
  const c = await account("via", S);
  const f = await prenotaCon(EV.slug, ["Platea|D|1"], c.uid, c.email);
  assert.equal((await rpc(env, c.tok, "bgl_account_stato", {})).d.solo_biglietteria, true);
  const r = await rpc(env, admin(env), "bgl_account_prepara_eliminazione", { p_uid: c.uid });
  assert.deepEqual(r.d, { ok: true, disdette: 1, anonimizzate: 1 });
  const riga = (await rest(env, admin(env), "bgl_prenotazioni?select=stato,nome,email&id=eq." + f.d.prenotazione_id)).d[0];
  assert.deepEqual(riga, { stato: "disdetta", nome: null, email: null });
  assert.equal(errore(await rpc(env, admin(env), "bgl_account_prepara_eliminazione", { p_uid: U.org.uid })), "account_in_uso", "organizzatore");
  /* un organizzatore abilitato che non ha ancora né progetti né spettacoli, e ha prenotato da pubblico: resta suo */
  const nuovoOrg = await account("orgnuovo", S, { abilitato: true });
  assert.equal((await prenotaCon(EV.slug, ["Platea|D|3"], nuovoOrg.uid, nuovoOrg.email)).d.ok, true);
  assert.equal(errore(await rpc(env, admin(env), "bgl_account_prepara_eliminazione", { p_uid: nuovoOrg.uid })), "account_in_uso", "organizzatore senza spettacoli");
  assert.equal((await rpc(env, U.maria.tok, "bgl_account_prepara_eliminazione", { p_uid: U.maria.uid })).ok, false, "solo il servizio");
});

run("D9: «Elimina il mio account» durante uno «Sposta» dell'organizzatore aspetta, poi libera anche i posti nuovi", async () => {
  const ev = (await spettacolo(U.org, PROG, { pubblicato: true })).d;
  const c = await account("gara-sposta", S);
  const p = (await prenotaCon(ev.slug, ["Platea|A|1"], c.uid, c.email)).d;
  const claims = JSON.stringify({ sub: U.org.uid, role: "authenticated" });
  const lenta = psql(`begin;\nset local role authenticated;\nselect set_config('request.jwt.claims', '${claims}', true);\nselect public.bgl_sposta('${p.prenotazione_id}'::uuid, array['Platea|B|2']);\nselect pg_sleep(2);\ncommit;\n`);
  await new Promise((r) => setTimeout(r, 900));
  const r = await rpc(env, admin(env), "bgl_account_prepara_eliminazione", { p_uid: c.uid });
  const m = await lenta;
  assert.equal(m.code, 0, m.err);
  assert.match(m.out, /"ok": true/);
  assert.deepEqual(r.d, { ok: true, disdette: 1, anonimizzate: 1 });
  const v = (await rpc(env, env.ANON_KEY, "bgl_evento_pubblico", { p_slug: ev.slug })).d;
  assert.deepEqual(v.occupati, [], "nessun posto resta a una prenotazione disdetta");
});

run("D9: anche un account con dati di Orchestre (che la cancellazione porterebbe via) non è «solo biglietteria»", async () => {
  const c = await account("orc", S);
  assert.equal((await prenotaCon(EV.slug, ["Platea|D|2"], c.uid, c.email)).d.ok, true);
  assert.equal((await rpc(env, c.tok, "bgl_account_stato", {})).d.solo_biglietteria, true);
  assert.equal((await psql(`insert into public.orc_consents (user_id, kind, version) values ('${c.uid}', 'privacy', 'prova');`)).code, 0);
  assert.equal((await rpc(env, c.tok, "bgl_account_stato", {})).d.solo_biglietteria, false);
  assert.equal(errore(await rpc(env, admin(env), "bgl_account_prepara_eliminazione", { p_uid: c.uid })), "account_in_uso");
  assert.equal((await rest(env, admin(env), "bgl_prenotazioni?select=stato&user_id=eq." + c.uid)).d[0].stato, "attiva", "niente toccato");
});

run("pulizia: «del pubblico», senza progetti né prenotazioni future, fermo da 12 mesi → da cancellare; 11 mesi no", async () => {
  const vecchio = await account("vecchio", S), giovane = await account("giovane", S), futuro = await account("futuro", S);
  /* la sala di prova ha le file A–D: i posti D4–D6 non li usa nessun'altra prova */
  for (const [i, a] of [vecchio, giovane, futuro].entries()) {
    const r = await prenotaCon(EV.slug, ["Platea|D|" + (i + 4)], a.uid, a.email);
    assert.equal(r.d.ok, true, JSON.stringify(r.d));
  }
  const indietro = (a, mesi) => psql(`update auth.users set last_sign_in_at = now() - interval '${mesi} months', created_at = now() - interval '${mesi + 1} months' where id = '${a.uid}';
update public.bgl_pubblico set ultimo_il = now() - interval '${mesi} months' where user_id = '${a.uid}';`);
  for (const [a, m] of [[vecchio, 13], [giovane, 11], [futuro, 13]]) assert.equal((await indietro(a, m)).code, 0);
  /* «vecchio» e «giovane» hanno disdetto la loro (nessuna prenotazione futura: li separa solo l'età); «futuro» ce l'ha ancora */
  for (const a of [vecchio, giovane]) {
    const pv = (await rest(env, admin(env), "bgl_prenotazioni?select=id&user_id=eq." + a.uid)).d[0].id;
    assert.equal((await rpc(env, a.tok, "bgl_disdici_mia", { p_prenotazione_id: pv })).d.ok, true);
  }
  const lista = (await rpc(env, admin(env), "bgl_account_da_pulire", { p_limite: 1000 })).d;
  assert.ok(lista.includes(vecchio.uid), "13 mesi, niente in arrivo");
  assert.ok(!lista.includes(giovane.uid), "11 mesi");
  assert.ok(!lista.includes(futuro.uid), "ha una prenotazione futura");
  assert.ok(!lista.includes(U.org.uid), "l'organizzatore mai");
  assert.equal((await rest(env, U.maria.tok, "bgl_pubblico?select=*")).ok, false, "la tabella non si legge da fuori");
});
