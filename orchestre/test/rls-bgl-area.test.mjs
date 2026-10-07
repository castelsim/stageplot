/* Biglietteria, area dell'organizzatore — migrazione 0074 (specifica area §2, §6). Sul Postgres LOCALE.
   Ogni rifiuto si controlla sul CODICE dell'errore. Dati inventati. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { env, run, stamp, fra, errore, rest, rpc, admin, docSala, foto, account, abilita, progetto,
  paginaOrganizzatore, spettacolo, prenota, psql } from "./_bgl.mjs";

const S = stamp(), U = {};
let PROG, PROG_B, SLUG_ORG;
const radice = fileURLToPath(new URL("../../", import.meta.url));

run("preparazione: due organizzatori abilitati, uno no, un progetto con due varianti", async () => {
  U.org = await account("org", S, { abilitato: true });
  U.b = await account("b", S, { abilitato: true });
  U.no = await account("no", S);
  PROG = await progetto(U.org, docSala({ varianti: [{ id: "V1", nome: "Sala" }, { id: "V2", nome: "Ridotta" }], vuote: ["V2"] }));
  PROG_B = await progetto(U.b, docSala());
  SLUG_ORG = "teatro-prova-" + S.slice(-6);
});

run("non abilitato: tutte le funzioni nuove dicono non_abilitato; l'anonimo non le chiama nemmeno", async () => {
  const q = await progetto(U.no, docSala());
  for (const [fn, a] of [["bgl_organizzatore_mio", {}], ["bgl_slug_libero", { p_slug: "teatro-x" }],
    ["bgl_organizzatore_salva", { p_dati: { nome: "X", slug: "teatro-x-" + S } }], ["bgl_progetti_sala", {}],
    ["bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: q, titolo: "T", inizio: fra(5), luogo: "L", pianta: foto() } }]]) {
    assert.equal(errore(await rpc(env, U.no.tok, fn, a)), "non_abilitato", fn);
    const anon = await rpc(env, env.ANON_KEY, fn, a);
    assert.equal(anon.ok, false, fn + ": l'anonimo non ha l'execute");
  }
});

run("prima volta: niente organizzatore, l'email dell'account; poi nome e indirizzo", async () => {
  const r = await rpc(env, U.org.tok, "bgl_organizzatore_mio", {});
  assert.deepEqual([r.d.ok, r.d.organizzatore, r.d.email_account], [true, null, U.org.email]);
  assert.equal(errore(await spettacolo(U.org, PROG)), "organizzatore_mancante", "prima si sceglie la pagina");
  const o = await paginaOrganizzatore(U.org, SLUG_ORG);
  assert.deepEqual(o, { slug: SLUG_ORG, nome: "Teatro di prova", contatto_email: null, logo_path: null });
});

run("RF3: indirizzo della pagina — formato, parole riservate, occupato, libero per sé", async () => {
  const libero = (s) => rpc(env, U.b.tok, "bgl_slug_libero", { p_slug: s }).then((r) => r.d);
  for (const s of ["ab", "a".repeat(41), "-teatro", "teatro-", "tea--tro", "Teatro_AVA", "teatro ava", ""])
    assert.deepEqual(await libero(s), { ok: true, libero: false, motivo: "formato" }, JSON.stringify(s));
  for (const s of ["mie", "gestione", "api", "biglietteria"]) assert.equal((await libero(s)).motivo, "riservato", s);
  assert.deepEqual(await libero(SLUG_ORG), { ok: true, libero: false, motivo: "occupato" }, "lo usa l'altro organizzatore");
  assert.deepEqual(await libero("TEATRO-B-" + S.slice(-6)), { ok: true, libero: true, motivo: null }, "maiuscole: si legge in minuscolo");
  assert.equal(errore(await rpc(env, U.b.tok, "bgl_organizzatore_salva", { p_dati: { nome: "B", slug: SLUG_ORG } })), "slug_occupato");
  assert.equal(errore(await rpc(env, U.b.tok, "bgl_organizzatore_salva", { p_dati: { nome: "B", slug: "gestione" } })), "dati_non_validi");
  assert.equal((await rpc(env, U.org.tok, "bgl_slug_libero", { p_slug: SLUG_ORG })).d.libero, true, "il proprio è libero per sé");
});

run("progetti per la sala: solo i propri, solo le varianti con posti numerati, niente progetti eliminati", async () => {
  const vuoto = await progetto(U.org, { _doc: 1, active: "V1", variants: [{ id: "V1", name: "Vuota", state: { items: [] } }] }, "Senza posti");
  const via = await progetto(U.org, docSala(), "Eliminato");
  assert.ok((await rest(env, U.org.tok, "stageplot_projects?id=eq." + via, { method: "PATCH", body: { deleted_at: new Date().toISOString() } })).ok);
  const r = await rpc(env, U.org.tok, "bgl_progetti_sala", {});
  const ids = r.d.progetti.map((p) => p.id);
  assert.ok(ids.includes(PROG) && !ids.includes(vuoto) && !ids.includes(via) && !ids.includes(PROG_B), JSON.stringify(ids));
  assert.deepEqual(r.d.progetti.find((p) => p.id === PROG).varianti, [{ id: "V1", nome: "Sala", posti: 24, attiva: true }]);
});

run("nuovo spettacolo: bozza per partenza, slug proposto da titolo e data di Roma, campi controllati", async () => {
  const r = await spettacolo(U.org, PROG, { titolo: "Così fan tutte — prima", inizio: "2026-12-31T23:30:00Z", chiusura: null,
    descrizione: "Riga uno\nRiga due", note: "Porte alle 20:30", variante: "V1", riservati: ["Platea|A|1", "Platea|A|2", "Platea|Z|9"],
    riservati_per: { "Platea|A|1": "Sindaco", "Platea|B|1": "non tenuto" } });
  assert.equal(r.d.ok, true, JSON.stringify(r.d));
  assert.equal(r.d.slug_breve, "cosi-fan-tutte-prima-1-gennaio", "RF5: 23:30 UTC del 31/12 è il 1° gennaio a Roma");
  assert.equal(r.d.link, "https://stageplot.it/biglietteria/" + SLUG_ORG + "/cosi-fan-tutte-prima-1-gennaio");
  const d = (await rpc(env, U.org.tok, "bgl_prenotati", { p_evento_id: r.d.id })).d;
  assert.deepEqual([d.evento.pubblicato, d.evento.descrizione, d.evento.note, d.evento.variante, d.evento.chiusura === d.evento.inizio],
    [false, "Riga uno\nRiga due", "Porte alle 20:30", "V1", true]);
  assert.deepEqual(d.evento.riservati, ["Platea|A|1", "Platea|A|2"], "Z9 non esiste");
  assert.deepEqual(d.evento.riservati_per, { "Platea|A|1": "Sindaco" }, "«per chi» solo sui posti tenuti da parte");
  const salvato = (await rest(env, admin(env), "bgl_eventi?select=riservati_per&id=eq." + r.d.id)).d[0].riservati_per;
  assert.deepEqual(salvato, { "Platea|A|1": "Sindaco" }, "anche nel database, non solo nella risposta");
  const no = async (dati, campo) => assert.deepEqual([errore(await spettacolo(U.org, PROG, dati)), (await spettacolo(U.org, PROG, dati)).d.campo], ["dati_non_validi", campo], campo);
  await no({ descrizione: "x".repeat(601) }, "descrizione");
  await no({ descrizione: "campanello\u0007" }, "descrizione");
  await no({ note: "y".repeat(201) }, "note");
  await no({ titolo: "t".repeat(121) }, "titolo");
  await no({ variante: "v".repeat(81) }, "variante");
  await no({ chiusura: fra(100), inizio: fra(72) }, "chiusura");
  await no({ slug_breve: "A_B" }, "slug_breve");
  await no({ locandina_path: U.org.uid + "/" + "a".repeat(32) + ".webp" }, "locandina_path");
  assert.equal(errore(await spettacolo(U.org, PROG_B)), "non_tuo", "il progetto d'altri");
  assert.equal(errore(await spettacolo(U.org, PROG, { pianta: { v: 2 } })), "pianta_non_valida");
  const doppio = await spettacolo(U.org, PROG, { slug_breve: "cosi-fan-tutte-prima-1-gennaio" });
  assert.equal(errore(doppio), "slug_occupato");
  const auto = await spettacolo(U.org, PROG, { titolo: "Così fan tutte — prima", inizio: "2026-12-31T23:30:00Z" });
  assert.equal(auto.d.slug_breve, "cosi-fan-tutte-prima-1-gennaio-2", "proposto, ma già usato: -2");
});

run("RF3: lo spettacolo cambia indirizzo finché nessuno ha prenotato; la pagina finché nessuno spettacolo è pubblicato", async () => {
  const r = await spettacolo(U.org, PROG, { titolo: "Recital", pubblicato: true });
  assert.equal((await rpc(env, U.org.tok, "bgl_spettacolo_salva", { p_id: r.d.id, p_dati: { slug_breve: "recital-nuovo-" + S.slice(-4) } })).d.ok, true);
  assert.equal(errore(await rpc(env, U.org.tok, "bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: SLUG_ORG + "-due" } })),
    "slug_bloccato", "c'è uno spettacolo pubblicato: QR già in giro");
  assert.equal((await prenota(r.d.slug, ["Platea|B|2"])).d.ok, true);
  assert.equal(errore(await rpc(env, U.org.tok, "bgl_spettacolo_salva", { p_id: r.d.id, p_dati: { slug_breve: "altro-" + S.slice(-4) } })), "slug_bloccato");
  assert.equal(errore(await rpc(env, U.org.tok, "bgl_spettacolo_salva", { p_id: r.d.id, p_dati: { pubblicato: false } })), "ha_prenotazioni");
  const tolto = foto({ file: "A" });
  assert.deepEqual([errore(await rpc(env, U.org.tok, "bgl_spettacolo_salva", { p_id: r.d.id, p_dati: { pianta: tolto } }))], ["posto_prenotato"]);
});

run("un organizzatore non tocca gli spettacoli dell'altro e non li vede", async () => {
  const r = await spettacolo(U.org, PROG, { titolo: "Solo mio" });
  /* B ha la sua pagina: il rifiuto viene dalla proprietà dello spettacolo, non da «organizzatore_mancante» */
  await paginaOrganizzatore(U.b, "teatro-b-" + S.slice(-6), "Teatro B");
  assert.equal(errore(await rpc(env, U.b.tok, "bgl_spettacolo_salva", { p_id: r.d.id, p_dati: { titolo: "Preso" } })), "non_tuo");
  const mio = (await rpc(env, U.b.tok, "bgl_organizzatore_mio", {})).d;
  assert.ok(!mio.spettacoli.some((e) => e.id === r.d.id));
  assert.equal(errore(await rpc(env, U.b.tok, "bgl_prenotati", { p_evento_id: r.d.id })), "non_tuo");
});

run("gli spettacoli nati nell'editor (bgl_apri) entrano nell'area da soli, con il loro indirizzo breve", async () => {
  const c = await account("editor", S, { abilitato: true });
  const prog = await progetto(c, docSala());
  const vecchio = await rpc(env, c.tok, "bgl_apri", { p_project_id: prog, p_evento: { titolo: "Concerto di prova", inizio: "2026-10-09T19:00:00Z",
    luogo: "Teatro di prova", riservati: [], pianta: foto() } });
  assert.equal(vecchio.d.ok, true);
  await paginaOrganizzatore(c, "teatro-c-" + S.slice(-6));
  const mio = (await rpc(env, c.tok, "bgl_organizzatore_mio", {})).d;
  const e = mio.spettacoli.find((x) => x.id === vecchio.d.id);
  assert.deepEqual([e.slug_breve, e.pubblicato, e.slug], ["concerto-di-prova-9-ottobre", true, vecchio.d.slug], "il link ?e= resta lo stesso");
});

run("D5: tolta l'abilitazione, si legge, si disdice e si elimina ancora; non si modifica e non si crea", async () => {
  const c = await account("revoca", S, { abilitato: true });
  const prog = await progetto(c, docSala());
  await paginaOrganizzatore(c, "teatro-d-" + S.slice(-6));
  const r = await spettacolo(c, prog, { pubblicato: true });
  const p = await prenota(r.d.slug, ["Platea|C|3"]);
  await abilita(c.uid, false);
  assert.equal(errore(await rpc(env, c.tok, "bgl_modifica", { p_evento_id: r.d.id, p_campi: { stato: "chiusa" } })), "non_abilitato");
  assert.equal(errore(await rpc(env, c.tok, "bgl_spettacolo_salva", { p_id: r.d.id, p_dati: { titolo: "Altro" } })), "non_abilitato");
  assert.equal((await rpc(env, c.tok, "bgl_prenotati", { p_evento_id: r.d.id })).d.ok, true, "legge");
  assert.equal((await rpc(env, c.tok, "bgl_annulla", { p_prenotazione_id: p.d.prenotazione_id })).d.ok, true, "disdice");
  const el = await rpc(env, c.tok, "bgl_elimina", { p_evento_id: r.d.id });
  assert.deepEqual([el.d.ok, el.d.locandina], [true, null], "elimina, e dice quale locandina togliere");
});

run("50 spettacoli per account, anche dall'area; due salvataggi insieme con lo stesso indirizzo: uno solo vince", async () => {
  const c = await account("tetto", S, { abilitato: true });
  const prog = await progetto(c, docSala({ file: "A", perFila: 2 }));
  await paginaOrganizzatore(c, "teatro-e-" + S.slice(-6));
  const due = await Promise.all([spettacolo(c, prog, { slug_breve: "gara" }), spettacolo(c, prog, { slug_breve: "gara" })]);
  assert.deepEqual(due.map((r) => r.d.ok === true ? "ok" : errore(r)).sort(), ["ok", "slug_occupato"]);
  for (let i = 1; i < 50; i++) assert.equal((await spettacolo(c, prog, { titolo: "Prova " + i, pianta: foto({ file: "A", perFila: 2 }) })).d.ok, true, "n. " + i);
  assert.equal(errore(await spettacolo(c, prog, { pianta: foto({ file: "A", perFila: 2 }) })), "troppi_eventi");
});

run("RF5 e slug: la proposta SQL è la stessa di gst.js (tabella condivisa con test/bgl-gestione.test.mjs)", async () => {
  const casi = [["Concerto di prova", "2026-10-09T19:00:00Z", "concerto-di-prova-9-ottobre"],
    ["Così fan tutte — prima", "2026-12-31T23:30:00Z", "cosi-fan-tutte-prima-1-gennaio"],
    ["!!!", "2026-10-25T20:00:00Z", "spettacolo-25-ottobre"],
    ["Àlvarez & Perché: una serata lunghissima di musica da camera", "2026-03-29T10:00:00Z", "alvarez-perche-una-serata-lungh-29-marzo"]];
  for (const [t, i, atteso] of casi) assert.equal((await rpc(env, admin(env), "bgl_slug_proposto", { p_titolo: t, p_inizio: i })).d, atteso, t);
  /* con gli argomenti giusti: il rifiuto deve venire dal permesso, non da una firma che non esiste */
  for (const [fn, a] of [["bgl_slug_proposto", { p_titolo: "x", p_inizio: "2026-10-09T19:00:00Z" }],
    ["bgl_locandina_ok", { p_uid: U.org.uid, p_path: "x" }], ["bgl_collega_eventi", { p_uid: U.org.uid }]]) {
    const r = await rpc(env, U.org.tok, fn, a);
    assert.equal(r.ok, false, fn + " non è per gli account");
    assert.match(JSON.stringify(r.d), /permission denied/i, fn + ": rifiutata per il permesso");
  }
});

run("ops/bgl-abilita.mjs: senza --si non scrive; con --si abilita e --no disabilita; fuori dal locale si rifiuta", async () => {
  const c = await account("ops", S);
  const lancia = (...a) => spawnSync(process.execPath, ["ops/bgl-abilita.mjs", ...a], { cwd: radice, encoding: "utf8",
    env: { ...process.env, SUPABASE_URL: env.API_URL, SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY } });
  const ab = () => rpc(env, c.tok, "bgl_abilitato", {}).then((r) => r.d);
  assert.match(lancia(c.email).stdout, /Farei/); assert.equal(await ab(), false);
  assert.equal(lancia(c.email, "--si").status, 0); assert.equal(await ab(), true);
  assert.equal(lancia(c.email, "--no", "--si").status, 0); assert.equal(await ab(), false);
  const fuori = spawnSync(process.execPath, ["ops/bgl-abilita.mjs", c.email, "--si"], { cwd: radice, encoding: "utf8",
    env: { ...process.env, SUPABASE_URL: "https://esempio.invalid", SUPABASE_SERVICE_ROLE_KEY: "x" } });
  assert.equal(fuori.status, 1); assert.match(fuori.stderr, /--produzione/);
});

run("D7 (decisione del 06/10): l'indirizzo della pagina resta bloccato anche dopo aver eliminato lo spettacolo pubblicato", async () => {
  const c = await account("blocco", S, { abilitato: true });
  const prog = await progetto(c, docSala());
  const org = "teatro-f-" + S.slice(-6);
  await paginaOrganizzatore(c, org);
  const bozza = await spettacolo(c, prog, { titolo: "Solo bozza" });
  assert.equal((await rpc(env, c.tok, "bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: org + "-x" } })).d.ok, true,
    "con le sole bozze l'indirizzo si cambia ancora");
  const pub = await rpc(env, c.tok, "bgl_spettacolo_salva", { p_id: bozza.d.id, p_dati: { pubblicato: true } });
  assert.equal(pub.d.ok, true);
  assert.equal((await rpc(env, c.tok, "bgl_elimina", { p_evento_id: bozza.d.id })).d.ok, true);
  assert.equal(errore(await rpc(env, c.tok, "bgl_organizzatore_salva", { p_dati: { nome: "Teatro di prova", slug: org } })),
    "slug_bloccato", "il QR della pagina può essere già stampato");
  const stesso = await rpc(env, c.tok, "bgl_organizzatore_salva", { p_dati: { nome: "Teatro nuovo", slug: org + "-x" } });
  assert.deepEqual([stesso.d.ok, stesso.d.organizzatore.nome], [true, "Teatro nuovo"], "il nome si cambia sempre");
});

run("revisione T23: la vecchia bgl_modifica segue le regole della nota dell'area (200 caratteri, niente \\r da solo)", async () => {
  const c = await account("modnota", S, { abilitato: true });
  const prog = await progetto(c, docSala());
  await paginaOrganizzatore(c, "teatro-mn-" + S.slice(-6));
  const r = (await spettacolo(c, prog, { pubblicato: true })).d;
  const mod = (note) => rpc(env, c.tok, "bgl_modifica", { p_evento_id: r.id, p_campi: { note } });
  const iniezione = "Porte alle 20:30\rBEGIN:VALARM\rTRIGGER:-PT5M\rACTION:DISPLAY\rEND:VALARM";
  /* la stessa nota che bgl_spettacolo_salva rifiuta */
  assert.equal(errore(await rpc(env, c.tok, "bgl_spettacolo_salva", { p_id: r.id, p_dati: { note: iniezione } })), "dati_non_validi");
  assert.deepEqual([errore(await mod(iniezione)), (await mod(iniezione)).d.campo], ["dati_non_validi", "note"], "\\r da solo");
  assert.equal(errore(await mod("n".repeat(201))), "dati_non_validi", "oltre 200 caratteri");
  assert.equal((await mod("Porte alle 20:30\r\nIngresso dal cortile")).d.ok, true, "\\r\\n è un a capo normale");
  const v = (await rpc(env, env.ANON_KEY, "bgl_evento_pubblico", { p_slug: r.slug })).d.evento.note;
  assert.equal(v, "Porte alle 20:30\nIngresso dal cortile", "salvata come nell'area");
  assert.equal((await mod("")).d.ok, true);
  assert.equal((await rpc(env, env.ANON_KEY, "bgl_evento_pubblico", { p_slug: r.slug })).d.evento.note, null, "vuota = nessuna nota");
});
