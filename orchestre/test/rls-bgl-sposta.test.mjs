/* Biglietteria — «Sposta» (0077, specifica area §4.1). Le gare fra transazioni si fanno con due sessioni vere sul
   Postgres locale (psql nel container): l'organizzatore sposta DENTRO una transazione che resta aperta, intanto il
   pubblico prenota o disdice. Dati inventati. */
import assert from "node:assert/strict";
import { env, run, stamp, errore, rest, rpc, admin, docSala, account, abilita, progetto, paginaOrganizzatore,
  spettacolo, prenota, dbContainer, psql, foto } from "./_bgl.mjs";

const S = stamp(), U = {};
let PROG;
const sposta = (a, id, posti) => rpc(env, a.tok, "bgl_sposta", { p_prenotazione_id: id, p_posti: posti });
const pub = (slug) => rpc(env, env.ANON_KEY, "bgl_evento_pubblico", { p_slug: slug }).then((r) => r.d);
async function nuovo(dati = {}) { return (await spettacolo(U.org, PROG, { pubblicato: true, ...dati })).d; }
function sessione(uid, sql) {
  const claims = JSON.stringify({ sub: uid, role: "authenticated" });
  return psql(`begin;\nset local role authenticated;\nselect set_config('request.jwt.claims', '${claims}', true);\n${sql}\n`);
}

run("preparazione", async () => {
  U.org = await account("sp", S, { abilitato: true });
  U.altro = await account("sp2", S, { abilitato: true });
  PROG = await progetto(U.org, docSala());
  await paginaOrganizzatore(U.org, "teatro-sp-" + S.slice(-6));
});

run("sposta: i posti vecchi tornano liberi, i nuovi sono occupati, l'elenco li mostra", async () => {
  const ev = await nuovo();
  const p = (await prenota(ev.slug, ["Platea|A|5", "Platea|A|6"])).d;
  const r = await sposta(U.org, p.prenotazione_id, ["Platea|C|3", "Platea|C|4"]);
  assert.deepEqual(r.d, { ok: true, prima: ["Platea|A|5", "Platea|A|6"], posti: ["Platea|C|3", "Platea|C|4"] });
  const v = await pub(ev.slug);
  assert.deepEqual(v.occupati, ["Platea|C|3", "Platea|C|4"]);
  const el = (await rpc(env, U.org.tok, "bgl_prenotati", { p_evento_id: ev.id })).d.prenotazioni.find((x) => x.id === p.prenotazione_id);
  assert.deepEqual([el.posti, el.posti_chiesti], [["Platea|C|3", "Platea|C|4"], ["Platea|C|3", "Platea|C|4"]]);
});

run("sposta: rifiuti con il loro codice", async () => {
  const ev = await nuovo();
  const p = (await prenota(ev.slug, ["Platea|A|1", "Platea|A|2"])).d;
  const q = (await prenota(ev.slug, ["Platea|B|1"])).d;
  assert.deepEqual([errore(await sposta(U.org, p.prenotazione_id, ["Platea|C|1"])), (await sposta(U.org, p.prenotazione_id, ["Platea|C|1"])).d.prima], ["numero_diverso", 2]);
  assert.equal(errore(await sposta(U.org, p.prenotazione_id, ["Platea|C|1", "Platea|Z|9"])), "posto_inesistente");
  assert.equal(errore(await sposta(U.org, p.prenotazione_id, ["Platea|C|1", "Platea|B|1"])), "posto_preso");
  assert.deepEqual((await pub(ev.slug)).occupati, ["Platea|A|1", "Platea|A|2", "Platea|B|1"], "un rifiuto non toglie i posti di prima");
  assert.equal(errore(await sposta(U.org, p.prenotazione_id, ["rotto", "Platea|C|1"])), "dati_non_validi");
  assert.equal(errore(await sposta(U.altro, p.prenotazione_id, ["Platea|C|1", "Platea|C|2"])), "non_tuo");
  assert.equal((await rpc(env, env.ANON_KEY, "bgl_sposta", { p_prenotazione_id: p.prenotazione_id, p_posti: ["Platea|C|1", "Platea|C|2"] })).ok, false);
  assert.equal((await rpc(env, U.org.tok, "bgl_annulla", { p_prenotazione_id: q.prenotazione_id })).d.ok, true);
  assert.equal(errore(await sposta(U.org, q.prenotazione_id, ["Platea|C|5"])), "gia_disdetta");
  await abilita(U.org.uid, false);
  assert.equal(errore(await sposta(U.org, p.prenotazione_id, ["Platea|C|1", "Platea|C|2"])), "non_abilitato");
  await abilita(U.org.uid, true);
});

run("D6: si può dare un posto tenuto da parte; esce dai tenuti e dal «per chi»", async () => {
  const ev = await nuovo({ riservati: ["Platea|D|1", "Platea|D|2"], riservati_per: { "Platea|D|1": "Ospite" } });
  const p = (await prenota(ev.slug, ["Platea|A|3"])).d;
  assert.equal((await sposta(U.org, p.prenotazione_id, ["Platea|D|1"])).d.ok, true);
  const e = (await rpc(env, U.org.tok, "bgl_prenotati", { p_evento_id: ev.id })).d.evento;
  assert.deepEqual([e.riservati, e.riservati_per], [["Platea|D|2"], {}]);
});

run("ATOMICITÀ: mentre l'organizzatore sposta su B5, il pubblico che prenota B5 aspetta e trova il posto preso; A5 liberato si prenota", async () => {
  assert.ok(dbContainer(), "serve il container del database locale");
  const ev = await nuovo();
  const p = (await prenota(ev.slug, ["Platea|A|5"])).d;
  const lenta = sessione(U.org.uid, `select public.bgl_sposta('${p.prenotazione_id}'::uuid, array['Platea|B|5']);\nselect pg_sleep(3);\ncommit;`);
  await new Promise((r) => setTimeout(r, 1200));
  const [b5, a5] = await Promise.all([prenota(ev.slug, ["Platea|B|5"]), prenota(ev.slug, ["Platea|A|5"])]);
  const m = await lenta;
  assert.equal(m.code, 0, m.err);
  assert.match(m.out, /"ok": true/);
  assert.equal(errore(b5), "posto_preso", "ha aspettato lo spostamento e ha visto B5 occupato: " + JSON.stringify(b5.d));
  assert.equal(a5.d.ok, true, "A5, liberato dallo spostamento, si prenota: " + JSON.stringify(a5.d));
  const righe = (await rest(env, admin(env), "bgl_posti?select=posto,prenotazione_id&evento_id=eq." + ev.id)).d;
  assert.equal(new Set(righe.map((x) => x.posto)).size, righe.length, "nessun posto due volte");
});

run("ATOMICITÀ: mentre l'organizzatore toglie la fila C dalla pianta, «Sposta» su C3 aspetta e la trova sparita", async () => {
  /* lo spettacolo si blocca IN TESTA: senza, «Sposta» leggerebbe la pianta vecchia e metterebbe la persona in un posto
     che, a modifica finita, non esiste più (la modifica non lo vede occupato perché lo spostamento non è ancora scritto) */
  const ev = await nuovo();
  const p = (await prenota(ev.slug, ["Platea|A|1"])).d;
  const pianta = JSON.stringify({ pianta: foto({ file: "AB" }) }).replace(/'/g, "''");
  const lenta = sessione(U.org.uid, `select public.bgl_spettacolo_salva('${ev.id}'::uuid, '${pianta}'::jsonb);\nselect pg_sleep(2);\ncommit;`);
  await new Promise((r) => setTimeout(r, 900));
  const r = await sposta(U.org, p.prenotazione_id, ["Platea|C|3"]);
  const m = await lenta;
  assert.equal(m.code, 0, m.err);
  assert.match(m.out, /"ok": true/);
  assert.equal(errore(r), "posto_inesistente", JSON.stringify(r.d));
  assert.deepEqual((await pub(ev.slug)).occupati, ["Platea|A|1"]);
});

run("ATOMICITÀ: uno spostamento annullato a metà (rollback) non lascia niente a metà", async () => {
  const ev = await nuovo();
  const p = (await prenota(ev.slug, ["Platea|A|4", "Platea|A|5"])).d;
  const r = await psql(`begin;\nset local role authenticated;\nselect set_config('request.jwt.claims', '${JSON.stringify({ sub: U.org.uid, role: "authenticated" })}', true);\nselect public.bgl_sposta('${p.prenotazione_id}'::uuid, array['Platea|C|4','Platea|C|5']);\nrollback;\n`);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual((await pub(ev.slug)).occupati, ["Platea|A|4", "Platea|A|5"]);
});

run("ATOMICITÀ: la disdetta dal link della mail durante uno spostamento aspetta, poi libera TUTTI i posti (anche i nuovi)", async () => {
  const ev = await nuovo();
  const p = (await prenota(ev.slug, ["Platea|A|2"])).d;
  const lenta = sessione(U.org.uid, `select public.bgl_sposta('${p.prenotazione_id}'::uuid, array['Platea|D|6']);\nselect pg_sleep(2);\ncommit;`);
  await new Promise((r) => setTimeout(r, 900));
  const d = await rpc(env, env.ANON_KEY, "bgl_disdici", { p_slug: ev.slug, p_token: p.token });
  assert.equal((await lenta).code, 0);
  assert.deepEqual([d.d.ok, d.d.liberati], [true, 1], JSON.stringify(d.d));
  assert.deepEqual((await pub(ev.slug)).occupati, [], "niente resta occupato");
});

run("avviso per mail: solo il servizio, solo il proprietario, solo subito dopo uno spostamento, al massimo 3 volte", async () => {
  const ev = await nuovo();
  const p = (await prenota(ev.slug, ["Platea|A|1"])).d;
  const avv = (uid) => rpc(env, admin(env), "bgl_avviso_spostamento", { p_uid: uid, p_prenotazione_id: p.prenotazione_id });
  assert.equal(errore(await avv(U.org.uid)), "non_spostata");
  await sposta(U.org, p.prenotazione_id, ["Platea|B|1"]);
  const a = await avv(U.org.uid);
  assert.deepEqual([a.d.ok, a.d.posti, a.d.codice, a.d.email.endsWith("@example.invalid"), a.d.evento.percorso],
    [true, ["Platea|B|1"], p.codice, true, "teatro-sp-" + S.slice(-6) + "/" + ev.slug_breve]);
  assert.equal(errore(await avv(U.altro.uid)), "non_tuo");
  await avv(U.org.uid); await avv(U.org.uid);
  assert.equal(errore(await avv(U.org.uid)), "troppi_avvisi");
  assert.equal((await rpc(env, U.org.tok, "bgl_avviso_spostamento", { p_uid: U.org.uid, p_prenotazione_id: p.prenotazione_id })).ok, false, "non dall'account");
});
