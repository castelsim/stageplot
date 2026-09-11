/* I filtri dell'elenco musicisti leggono genere, lettura, esperienze e zona dalla lista che restituisce
   `orc_musicians_list`. Qui si prova che la lista li porta — i generi del profilo del musicista uniti a
   quelli del repertorio, senza doppioni — e che continua a darli solo allo staff della sua organizzazione. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-filtri-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG_A, CON, SENZA;

run("preparazione: la società, un'altra, un viewer, un musicista col suo profilo", async () => {
  for (const n of ["ownerA", "ownerB", "viewerA", "musicista"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG_A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Filtri A", org_slug: "filtri-a-" + stamp, owner_email: mail("ownerA") })).d;
  assert.ok(ORG_A);
  assert.ok((await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Filtri B", org_slug: "filtri-b-" + stamp, owner_email: mail("ownerB") })).d);
  assert.ok((await rpc(env, T.ownerA, "orc_add_member_by_email", { org: ORG_A, member_email: mail("viewerA"), new_role: "viewer" })).ok);
  const imp = await rpc(env, T.ownerA, "orc_import_musicians", { org: ORG_A, rows: [
    { first_name: "Carla", last_name: "Completa", email: mail("carla"), city: "Schio", province: "VI",
      instruments: [{ code: "violino", primary: true, level: 4 }],
      skills: [{ code: "lettura_prima_vista", level: 3 }, { code: "esp_pop", level: 2 }, { code: "esp_live", level: 0 }],
      repertoire: [{ kind: "genre", name: "Pop", source: "declared" }], tags: ["prima parte"] },
    { first_name: "Sara", last_name: "Scarna", email: mail("sara"), instruments: [{ code: "oboe", primary: true }], tags: [] }] });
  assert.ok(imp.ok && imp.d.new === 2, JSON.stringify(imp.d));
  const list = (await rpc(env, T.ownerA, "orc_musicians_list", { org: ORG_A })).d;
  CON = list.find((m) => m.last_name === "Completa").id; SENZA = list.find((m) => m.last_name === "Scarna").id;
  /* il profilo che il musicista ha compilato da sé, collegato alla sua scheda come fa l'accettazione */
  const pr = await rest(env, admin(env), "orc_musician_profiles", { method: "POST", body: { user_id: U.musicista, first_name: "Carla", last_name: "Completa", genres: ["pop", " Sacra ", ""] } });
  assert.ok(pr.ok, JSON.stringify(pr.d));
  const up = await rest(env, admin(env), "orc_musicians?id=eq." + CON, { method: "PATCH", body: { profile_id: pr.d[0].id, area: "Veneto", has_car: true, tour_ok: true } });
  assert.ok(up.ok, JSON.stringify(up.d));
});

run("la lista porta genere, lettura, esperienze e zona", async () => {
  const list = (await rpc(env, T.ownerA, "orc_musicians_list", { org: ORG_A })).d;
  const c = list.find((m) => m.id === CON);
  assert.deepEqual(c.genres, ["pop", "sacra"], "i generi del profilo e del repertorio, in minuscolo e senza doppioni né vuoti");
  assert.equal(c.reading, 3, "la lettura a prima vista viene dalle competenze");
  assert.deepEqual(c.experiences, ["esp_pop"], "solo le esperienze con un livello: «live» a zero non conta");
  assert.equal(c.province, "VI"); assert.equal(c.area, "Veneto");
  assert.equal(c.has_car, true); assert.equal(c.tour_ok, true);
  const s = list.find((m) => m.id === SENZA);
  assert.deepEqual([s.genres, s.reading, s.experiences, s.area], [[], 0, [], ""], "chi non ha dati ha liste vuote, non null");
});

run("e continua a darli solo allo staff della società", async () => {
  for (const n of ["viewerA", "ownerB", "musicista"]) {
    const r = await rpc(env, T[n], "orc_musicians_list", { org: ORG_A });
    assert.deepEqual(r.d, [], n + " non vede nessuno");
  }
  const anon = await rpc(env, env.ANON_KEY, "orc_musicians_list", { org: ORG_A });
  assert.equal(anon.ok, false, "da anonimo la funzione non si chiama nemmeno");
});
