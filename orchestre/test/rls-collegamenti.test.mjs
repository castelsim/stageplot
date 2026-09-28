/* Il collegamento scheda → musicista non si scrive a mano (migrazione 0070, verifica di sicurezza 28/09).
   Lo staff poteva mettere su una sua scheda il profilo di un musicista qualsiasi (e ricevere da lì telefono,
   città e bio), toglierlo per saltare il consenso, o collegare la scheda all'account di un altro. Ogni
   «negato» ha il suo controllo positivo: la stessa richiesta su un campo normale DEVE riuscire, e i
   collegamenti legittimi (email verificata, service role) continuano a funzionare. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-coll-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG, MIO, ALTRO, PROF_ALTRO;

run("preparazione: una società, una sua scheda senza account, e un musicista con profilo che con lei non c'entra", async () => {
  for (const n of ["owner", "mio", "altro"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Coll A", org_slug: "coll-a-" + stamp, owner_email: mail("owner") })).d;
  assert.ok(ORG);
  assert.ok((await rpc(env, T.owner, "orc_import_musicians", { org: ORG, rows: [
    { first_name: "Mi", last_name: "O", email: mail("mio"), instruments: [{ code: "violino", primary: true, level: 4 }] }] })).ok);
  MIO = (await rpc(env, T.owner, "orc_musicians_list", { org: ORG })).d[0].id;
  const pr = await rest(env, admin(env), "orc_musician_profiles", { method: "POST", body: { user_id: U.altro, first_name: "Al", last_name: "Tro", phone: "999", consent_requests: true } });
  assert.ok(pr.ok, JSON.stringify(pr.d)); PROF_ALTRO = pr.d[0].id;
  ALTRO = U.altro;
});

run("lo staff modifica i campi normali della sua scheda (controllo positivo)", async () => {
  const r = await rest(env, T.owner, "orc_musicians?id=eq." + MIO, { method: "PATCH", body: { city: "Vicenza", notes_private: "ok " + stamp } });
  assert.ok(r.ok, JSON.stringify(r.d));
});

run("lo staff NON mette sulla sua scheda il profilo di un altro musicista", async () => {
  const r = await rest(env, T.owner, "orc_musicians?id=eq." + MIO, { method: "PATCH", body: { profile_id: PROF_ALTRO } });
  assert.ok(!r.ok, "doveva essere rifiutato: " + JSON.stringify(r.d));
  const v = await rest(env, admin(env), "orc_musicians?select=profile_id&id=eq." + MIO);
  assert.equal(v.d[0].profile_id, null, "e la scheda resta senza profilo");
});

run("lo staff NON collega la sua scheda all'account di un altro", async () => {
  const r = await rest(env, T.owner, "orc_musicians?id=eq." + MIO, { method: "PATCH", body: { user_id: ALTRO } });
  assert.ok(!r.ok, "doveva essere rifiutato: " + JSON.stringify(r.d));
});

run("lo staff NON crea una scheda già collegata a un account o a un profilo", async () => {
  const base = { org_id: ORG, first_name: "Nu", last_name: "Ovo", email: "nuovo-" + stamp + "@example.invalid", source: "manual" };
  assert.ok(!(await rest(env, T.owner, "orc_musicians", { method: "POST", body: { ...base, user_id: ALTRO } })).ok, "con user_id: rifiutato");
  assert.ok(!(await rest(env, T.owner, "orc_musicians", { method: "POST", body: { ...base, profile_id: PROF_ALTRO } })).ok, "con profile_id: rifiutato");
  assert.ok((await rest(env, T.owner, "orc_musicians", { method: "POST", body: base })).ok, "senza: riesce (controllo positivo)");
});

run("i collegamenti legittimi funzionano ancora: l'email verificata e il service role", async () => {
  assert.equal((await rpc(env, T.mio, "orc_link_my_musician_rows", {})).d, 1, "il musicista si collega con la sua email");
  const v = await rest(env, admin(env), "orc_musicians?select=user_id&id=eq." + MIO);
  assert.equal(v.d[0].user_id, U.mio);
  assert.ok((await rest(env, admin(env), "orc_musicians?id=eq." + MIO, { method: "PATCH", body: { profile_id: PROF_ALTRO } })).ok, "il service role può");
  assert.ok((await rest(env, admin(env), "orc_musicians?id=eq." + MIO, { method: "PATCH", body: { profile_id: null } })).ok);
});

run("una volta collegata, lo staff non stacca la scheda dal musicista", async () => {
  const r = await rest(env, T.owner, "orc_musicians?id=eq." + MIO, { method: "PATCH", body: { user_id: null } });
  assert.ok(!r.ok, "doveva essere rifiutato: " + JSON.stringify(r.d));
});
