/* Lotto 6: feedback post-produzione, indicatori con campione, storico; il matching legge affidabilità. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);   /* il caso serve: due suite avviate nello stesso millisecondo creerebbero la stessa organizzazione */
const mail = (n) => `orc-fb-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG_A, ORG_B, PAST, NEW, ROLE_NEW, M1, M2;

run("preparazione: una produzione conclusa con due confermati, una nuova", async () => {
  for (const n of ["ownerA", "ownerB", "viewerA"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG_A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Fb A", org_slug: "fb-a-" + stamp, owner_email: mail("ownerA") })).d;
  ORG_B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Fb B", org_slug: "fb-b-" + stamp, owner_email: mail("ownerB") })).d;
  await rpc(env, T.ownerA, "orc_add_member_by_email", { org: ORG_A, member_email: mail("viewerA"), new_role: "viewer" });
  const imp = await rpc(env, T.ownerA, "orc_import_musicians", { org: ORG_A, rows: [
    { first_name: "Bravo", last_name: "Prova", email: "bravo@example.invalid", instruments: [{ code: "violino", primary: true }] },
    { first_name: "Assente", last_name: "Prova", email: "assente@example.invalid", instruments: [{ code: "violino", primary: true }] },
  ] });
  assert.equal(imp.d.new, 2);
  const list = (await rpc(env, T.ownerA, "orc_musicians_list", { org: ORG_A })).d;
  M1 = list.find((m) => m.first_name === "Bravo").id; M2 = list.find((m) => m.first_name === "Assente").id;
  PAST = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Concerto passato", status: "done" } })).d[0].id;
  await rest(env, T.ownerA, "orc_production_dates", { method: "POST", body: { production_id: PAST, kind: "concert", starts_at: "2026-03-01T21:00:00+01:00" } });
  const role = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: PAST, instrument_code: "violino", name: "Violini", seats: 2 } })).d[0].id;
  const slots = (await rest(env, T.ownerA, "orc_staffing_slots?select=id&role_id=eq." + role + "&order=seat_no")).d;
  await rpc(env, T.ownerA, "orc_assign_slot", { slot: slots[0].id, musician: M1 });
  await rpc(env, T.ownerA, "orc_assign_slot", { slot: slots[1].id, musician: M2 });
  NEW = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Concerto nuovo", status: "planning" } })).d[0].id;
  ROLE_NEW = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: NEW, instrument_code: "violino", name: "Violini", seats: 1 } })).d[0].id;
});

run("il feedback: uno per (produzione, musicista), solo staff, solo nella propria org, punteggi 1-5", async () => {
  const roster = (await rpc(env, T.ownerA, "orc_production_roster", { production: PAST })).d;
  assert.equal(roster.length, 2); assert.equal(roster[0].feedback_id, null);
  const v = await rest(env, T.viewerA, "orc_performance_feedback", { method: "POST", body: { org_id: ORG_A, production_id: PAST, musician_id: M1, overall: 5 } });
  assert.equal(v.ok, false, "un viewer non scrive feedback");
  const b = await rest(env, T.ownerB, "orc_performance_feedback", { method: "POST", body: { org_id: ORG_A, production_id: PAST, musician_id: M1, overall: 1 } });
  assert.equal(b.ok, false, "l'altra org nemmeno");
  const bad = await rest(env, T.ownerA, "orc_performance_feedback", { method: "POST", body: { org_id: ORG_A, production_id: PAST, musician_id: M1, overall: 9 } });
  assert.equal(bad.ok, false, "9/5 non esiste");
  const f1 = await rest(env, T.ownerA, "orc_performance_feedback", { method: "POST", body: { org_id: ORG_A, production_id: PAST, musician_id: M1, attended: true, punctuality: 5, professionalism: 5, overall: 5, rehire: true } });
  assert.ok(f1.ok, JSON.stringify(f1.d));
  const f2 = await rest(env, T.ownerA, "orc_performance_feedback", { method: "POST", body: { org_id: ORG_A, production_id: PAST, musician_id: M2, attended: false, overall: 1, rehire: false, issues: "non si è presentato" } });
  assert.ok(f2.ok, JSON.stringify(f2.d));
  const dup = await rest(env, T.ownerA, "orc_performance_feedback", { method: "POST", body: { org_id: ORG_A, production_id: PAST, musician_id: M1, overall: 3 } });
  assert.equal(dup.ok, false, "un secondo feedback per la stessa coppia non entra: si aggiorna il primo");
  const seeB = await rest(env, T.ownerB, "orc_performance_feedback?select=id&org_id=eq." + ORG_A);
  assert.ok(!seeB.ok || seeB.d.length === 0);
  const rosterB = await rpc(env, T.ownerB, "orc_production_roster", { production: PAST });
  assert.deepEqual(rosterB.d, []);
});

run("gli indicatori portano il campione; lo storico del musicista racconta i fatti", async () => {
  const st = (await rpc(env, T.ownerA, "orc_musician_stats", { org: ORG_A })).d;
  const s1 = st.find((x) => x.musician_id === M1), s2 = st.find((x) => x.musician_id === M2);
  assert.equal(Number(s1.n_collab), 1); assert.equal(Number(s1.n_feedback), 1); assert.equal(Number(s1.avg_overall), 5); assert.equal(Number(s1.n_absent), 0);
  assert.equal(Number(s2.n_absent), 1); assert.equal(Number(s2.n_rehire_no), 1); assert.equal(Number(s2.avg_overall), 1);
  assert.equal(s1.reply_rate, null, "senza inviti il tasso di risposta non esiste: non è zero");
  assert.deepEqual((await rpc(env, T.ownerB, "orc_musician_stats", { org: ORG_A })).d, []);
  const h = (await rpc(env, T.ownerA, "orc_musician_history", { musician: M2 })).d;
  assert.equal(h.length, 1); assert.equal(h[0].title, "Concerto passato"); assert.equal(h[0].feedback_attended, false); assert.equal(h[0].feedback_issues, "non si è presentato");
  assert.deepEqual((await rpc(env, T.ownerB, "orc_musician_history", { musician: M2 })).d, [], "B non legge lo storico di un musicista di A");
});

run("il matching riceve valutazione, assenze e tasso di risposta", async () => {
  await rpc(env, T.ownerA, "orc_invite", { production: NEW, role: ROLE_NEW, musicians: [M1, M2], deadline: "2030-01-01T00:00:00Z" });
  const rows = (await rpc(env, T.ownerA, "orc_invitations_list", { production: NEW })).d;
  for (const r of rows) await rest(env, admin(env), "orc_invitations?id=eq." + r.id, { method: "PATCH", body: { status: "sent", notification_status: "sent" } });
  const secM1 = rows.find((r) => r.musician_id === M1).id;
  await rest(env, admin(env), "orc_invitations?id=eq." + secM1, { method: "PATCH", body: { status: "available", responded_at: new Date().toISOString() } });
  const secM2 = rows.find((r) => r.musician_id === M2).id;
  await rest(env, admin(env), "orc_invitations?id=eq." + secM2, { method: "PATCH", body: { status: "no_reply" } });
  const c = (await rpc(env, T.ownerA, "orc_matching_candidates", { production: NEW, role: ROLE_NEW })).d;
  const c1 = c.candidates.find((x) => x.id === M1), c2 = c.candidates.find((x) => x.id === M2);
  assert.equal(Number(c1.avg_overall), 5); assert.equal(Number(c1.n_feedback), 1); assert.equal(Number(c1.n_invites), 1); assert.equal(Number(c1.n_replies), 1); assert.equal(Number(c1.reply_rate), 1);
  assert.equal(Number(c2.n_absent), 1); assert.equal(Number(c2.n_no_reply), 1); assert.equal(Number(c2.reply_rate), 0);
  assert.equal(c1.invited_here, true); assert.equal(c2.declined_here, true);
});
