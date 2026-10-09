/* Biglietteria — lettura pubblica dell'area (0075): pagina dell'organizzatore e scheda. Il CONTRATTO DI PRIVACY:
   da qui escono solo dati dello spettacolo e dell'organizzatore, mai di chi prenota. Dati inventati. */
import assert from "node:assert/strict";
import { env, run, stamp, fra, errore, rest, rpc, admin, docSala, foto, account, abilita, progetto,
  paginaOrganizzatore, spettacolo } from "./_bgl.mjs";

const S = stamp(), U = {};
let PROG, ORG, A1, A2, BOZZA, PASSATO;
const anon = (fn, a) => rpc(env, env.ANON_KEY, fn, a);

run("preparazione: un organizzatore con due spettacoli pubblicati, una bozza, uno passato; una prenotazione riconoscibile", async () => {
  U.org = await account("pub", S, { abilitato: true });
  PROG = await progetto(U.org, docSala());
  ORG = "teatro-pub-" + S.slice(-6);
  await paginaOrganizzatore(U.org, ORG);
  A2 = (await spettacolo(U.org, PROG, { titolo: "Secondo", inizio: fra(96), pubblicato: true, descrizione: "Due righe\ndi prova" })).d;
  A1 = (await spettacolo(U.org, PROG, { titolo: "Primo", inizio: fra(48), pubblicato: true })).d;
  BOZZA = (await spettacolo(U.org, PROG, { titolo: "Bozza", inizio: fra(60) })).d;
  PASSATO = (await spettacolo(U.org, PROG, { titolo: "Passato", inizio: fra(72), pubblicato: true })).d;
  assert.ok((await rest(env, admin(env), "bgl_eventi?id=eq." + PASSATO.id, { method: "PATCH", body: { inizio: fra(-13), chiusura: fra(-13) } })).ok);
  const p = await rpc(env, admin(env), "bgl_prenota", { p_slug: A1.slug, p_posti: ["Platea|A|1"], p_nome: "Zeffirino", p_cognome: "Pubblicotest",
    p_email: "zeffirino." + S + "@example.invalid" });
  assert.equal(p.d.ok, true, JSON.stringify(p.d));
});

run("pagina dell'organizzatore: nome, contatto (solo quello scritto dall'organizzatore), solo pubblicati in arrivo, in ordine", async () => {
  const r = await anon("bgl_organizzatore_pubblico", { p_slug: ORG.toUpperCase() });
  assert.equal(r.d.ok, true, JSON.stringify(r.d));
  /* revisione T23: nessun ripiego sull'email dell'account (spesso quella personale). Il «predefinito = account» della
     specifica lo fa la «prima volta», precompilando il campo: in pagina va solo ciò che l'organizzatore ha visto e salvato */
  assert.deepEqual(r.d.organizzatore, { slug: ORG, nome: "Teatro di prova", contatto: null, logo: null });
  assert.deepEqual(r.d.spettacoli.map((x) => x.titolo), ["Primo", "Secondo"], "niente bozza, niente passato da più di 12 ore");
  assert.deepEqual(Object.keys(r.d.spettacoli[0]).sort(), ["inizio", "liberi", "locandina", "luogo", "posti_totali", "s", "stato", "titolo"]);
  assert.deepEqual([r.d.spettacoli[0].liberi, r.d.spettacoli[0].posti_totali, r.d.spettacoli[0].stato], [23, 24, "aperta"]);
  await rpc(env, U.org.tok, "bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: ORG, contatto_email: "biglietteria@example.invalid" } });
  assert.equal((await anon("bgl_organizzatore_pubblico", { p_slug: ORG })).d.organizzatore.contatto, "biglietteria@example.invalid");
});

run("contatto: svuotato non si vede da nessuna porta (pagina, scheda, vecchio ?e=), e mai l'email dell'account", async () => {
  const salva = (c) => rpc(env, U.org.tok, "bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: ORG, contatto_email: c } });
  assert.equal((await salva("biglietteria@example.invalid")).d.ok, true);
  assert.equal((await anon("bgl_evento_pubblico", { p_slug: A1.slug })).d.organizzatore.contatto, "biglietteria@example.invalid", "anche dal ?e=");
  for (const vuoto of ["", "   ", null]) {
    assert.equal((await salva(vuoto)).d.ok, true, JSON.stringify(vuoto));
    for (const r of [await anon("bgl_organizzatore_pubblico", { p_slug: ORG }), await anon("bgl_spettacolo_pubblico", { p_org: ORG, p_slug: A1.slug_breve }),
      await anon("bgl_evento_pubblico", { p_slug: A1.slug })]) {
      assert.equal(r.d.organizzatore.contatto, null, "svuotato = nessuna email in pagina: " + JSON.stringify(vuoto));
      assert.ok(!JSON.stringify(r.d).includes(U.org.email), "l'email dell'account non esce mai");
    }
  }
});

run("contatto: il formato è quello di un'email, senza segni da pagina web (< > \" ' `)", async () => {
  const salva = (c) => rpc(env, U.org.tok, "bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: ORG, contatto_email: c } });
  for (const c of ['"><img/src=x/onerror=alert(1)>@x.it', "a<b@example.invalid", "a@exa>mple.invalid", "o'brien@example.invalid", "a`b@example.invalid",
    "senza-chiocciola.example.invalid", "a@b", "due@@example.invalid"]) {
    assert.deepEqual([errore(await salva(c)), (await salva(c)).d.campo], ["dati_non_validi", "contatto_email"], c);
  }
  assert.equal((await salva("info@teatro-prova.example.invalid")).d.ok, true, "un indirizzo normale passa");
  assert.equal((await anon("bgl_organizzatore_pubblico", { p_slug: ORG })).d.organizzatore.contatto, "info@teatro-prova.example.invalid");
});

run("PRIVACY: né la pagina dell'organizzatore né la scheda dicono chi ha prenotato", async () => {
  for (const r of [await anon("bgl_organizzatore_pubblico", { p_slug: ORG }), await anon("bgl_spettacolo_pubblico", { p_org: ORG, p_slug: A1.slug_breve })]) {
    const t = JSON.stringify(r.d);
    assert.doesNotMatch(t, /Zeffirino|Pubblicotest|zeffirino\./i, "nessun nome o email di chi prenota");
    assert.doesNotMatch(t, /"codice"|"prenotazion|"user_id"|"email"|"token/, "nessun codice, id di prenotazione o account");
    assert.ok(!t.includes(A1.id), "nemmeno l'id interno dello spettacolo");
  }
});

run("scheda: dall'indirizzo breve la stessa risposta del link ?e=, con descrizione, indirizzo breve e organizzatore", async () => {
  const s = await anon("bgl_spettacolo_pubblico", { p_org: ORG, p_slug: A2.slug_breve });
  const e = await anon("bgl_evento_pubblico", { p_slug: A2.slug });
  const senzaOra = (d) => ({ ...d, ora: null });
  assert.deepEqual(senzaOra(s.d), senzaOra(e.d), "una sola regola di privacy: la scheda È la lettura pubblica");
  assert.deepEqual([s.d.evento.descrizione, s.d.evento.s, s.d.evento.locandina, s.d.organizzatore.slug], ["Due righe\ndi prova", A2.slug_breve, null, ORG]);
});

run("bozze: invisibili da ogni porta (scheda, ?e=, contatore delle prenotazioni)", async () => {
  assert.equal(errore(await anon("bgl_spettacolo_pubblico", { p_org: ORG, p_slug: BOZZA.slug_breve })), "spettacolo_inesistente");
  assert.equal(errore(await anon("bgl_evento_pubblico", { p_slug: BOZZA.slug })), "evento_inesistente");
  assert.equal((await rpc(env, admin(env), "bgl_globale_hit", { p_slug: BOZZA.slug })).d.errore, "evento_inesistente");
});

run("RF3: spettacolo che non c'è più → «spettacolo_inesistente» CON l'organizzatore (la pagina porta all'elenco); organizzatore che non c'è → l'altro errore", async () => {
  const r = await anon("bgl_spettacolo_pubblico", { p_org: ORG, p_slug: "vecchio-indirizzo" });
  assert.deepEqual([r.d.ok, r.d.errore, r.d.organizzatore.slug], [false, "spettacolo_inesistente", ORG]);
  assert.equal(errore(await anon("bgl_spettacolo_pubblico", { p_org: "nessuno-" + S, p_slug: "x-y-z" })), "organizzatore_inesistente");
  assert.equal(errore(await anon("bgl_organizzatore_pubblico", { p_slug: "a" })), "organizzatore_inesistente", "formato storto");
});

run("organizzatore non più abilitato: pagina e schede spariscono; il link ?e= già stampato funziona ancora", async () => {
  const c = await account("spento", S, { abilitato: true });
  const prog = await progetto(c, docSala());
  const org = "teatro-spento-" + S.slice(-5);
  await paginaOrganizzatore(c, org);
  const sp = (await spettacolo(c, prog, { pubblicato: true })).d;
  await abilita(c.uid, false);
  assert.equal(errore(await anon("bgl_organizzatore_pubblico", { p_slug: org })), "organizzatore_inesistente");
  assert.equal(errore(await anon("bgl_spettacolo_pubblico", { p_org: org, p_slug: sp.slug_breve })), "organizzatore_inesistente");
  const e = await anon("bgl_evento_pubblico", { p_slug: sp.slug });
  assert.deepEqual([e.d.ok, e.d.organizzatore, e.d.evento.s], [true, null, null]);
});
