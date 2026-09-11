/* Le parti che un musicista sa coprire — fila, prima parte, solista. Le dichiara lui nel profilo, passano
   alla scheda quando la candidatura è accettata, lo staff le corregge, e il matching le riceve per avvisare
   quando un posto di prima parte va a chi non l'ha indicata. Solo codici noti: il database rifiuta il resto. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-parti-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG_A, PROF, APP, MID, PID, ROLE;

run("preparazione: la società aperta alle candidature, un musicista, un estraneo", async () => {
  for (const n of ["ownerA", "cand", "altro"]) { U[n] = await mkUser(env, mail(n), undefined, { full_name: "Paola Parti" }); T[n] = await login(env, mail(n)); }
  ORG_A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Parti A", org_slug: "parti-a-" + stamp, owner_email: mail("ownerA") })).d;
  assert.ok(ORG_A);
  assert.ok((await rpc(env, T.ownerA, "orc_set_accepting", { org: ORG_A, accepting: true, intro: "" })).ok);
  const p = await rpc(env, T.cand, "orc_ensure_musician_profile", {});
  assert.ok(p.ok, JSON.stringify(p.d)); PROF = p.d.id;
});

run("il musicista dichiara le sue parti; codici sconosciuti no, e il profilo di un altro nemmeno", async () => {
  const ok = await rest(env, T.cand, "orc_musician_profiles?id=eq." + PROF, { method: "PATCH", body: { parts: ["tutti", "principal"], city: "Padova", phone: "3" } });
  assert.ok(ok.ok, JSON.stringify(ok.d));
  const strano = await rest(env, T.cand, "orc_musician_profiles?id=eq." + PROF, { method: "PATCH", body: { parts: ["spalla"] } });
  assert.equal(strano.ok, false, "«spalla» non è un codice: il vincolo lo rifiuta");
  const hack = await rest(env, T.altro, "orc_musician_profiles?id=eq." + PROF, { method: "PATCH", body: { parts: ["solo"] } });
  assert.ok(!hack.ok || hack.d.length === 0, "l'estraneo non tocca il profilo altrui");
  const letto = (await rest(env, admin(env), "orc_musician_profiles?select=parts&id=eq." + PROF)).d[0];
  assert.deepEqual(letto.parts, ["tutti", "principal"]);
});

run("accettata la candidatura, la scheda nasce con le parti dichiarate", async () => {
  assert.ok((await rest(env, T.cand, "orc_profile_instruments", { method: "POST", body: { profile_id: PROF, instrument_code: "violino", is_primary: true, level: 4 } })).ok);
  assert.ok((await rest(env, T.cand, "orc_consents", { method: "POST", body: { user_id: U.cand, kind: "privacy", version: "2026-09-09" } })).ok);
  assert.ok((await rest(env, T.cand, "orc_musician_profiles?id=eq." + PROF, { method: "PATCH", body: { consent_privacy_version: "2026-09-09", consent_privacy_at: new Date().toISOString() } })).ok);
  const a = await rpc(env, T.cand, "orc_apply", { org: ORG_A });
  assert.ok(a.ok, JSON.stringify(a.d)); APP = a.d.id;
  const sent = await rpc(env, T.cand, "orc_submit_application", { app: APP, msg: "" });
  assert.ok(sent.ok, JSON.stringify(sent.d));
  const acc = await rpc(env, T.ownerA, "orc_application_set_status", { app: APP, new_status: "accepted" });
  assert.ok(acc.ok, JSON.stringify(acc.d));
  MID = (await rest(env, admin(env), "orc_applications?select=musician_id&id=eq." + APP)).d[0].musician_id;
  const m = (await rest(env, T.ownerA, "orc_musicians?select=parts&id=eq." + MID)).d[0];
  assert.deepEqual(m.parts, ["tutti", "principal"], "le parti passano dal profilo alla scheda");
});

run("lo staff le corregge; i codici restano quelli", async () => {
  const ok = await rest(env, T.ownerA, "orc_musicians?id=eq." + MID, { method: "PATCH", body: { parts: ["tutti"] } });
  assert.ok(ok.ok, JSON.stringify(ok.d));
  const strano = await rest(env, T.ownerA, "orc_musicians?id=eq." + MID, { method: "PATCH", body: { parts: ["concertino"] } });
  assert.equal(strano.ok, false, "anche per lo staff solo codici noti");
  const cand = await rest(env, T.cand, "orc_musicians?id=eq." + MID, { method: "PATCH", body: { parts: ["solo"] } });
  assert.ok(!cand.ok || cand.d.length === 0, "il musicista non riscrive la scheda dello staff");
});

run("il matching riceve le parti del candidato e la parte del ruolo", async () => {
  PID = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Concerto con spalla", status: "planning" } })).d[0].id;
  ROLE = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: PID, instrument_code: "violino", name: "Spalla", seats: 1, part: "principal" } })).d[0].id;
  const r = await rpc(env, T.ownerA, "orc_matching_candidates", { production: PID, role: ROLE });
  assert.ok(r.ok, JSON.stringify(r.d));
  assert.equal(r.d.role.part, "principal");
  const c = r.d.candidates.find((x) => x.id === MID);
  assert.ok(c, "il candidato c'è");
  assert.deepEqual(c.parts, ["tutti"], "con le parti corrette dallo staff, non quelle dichiarate");
});
