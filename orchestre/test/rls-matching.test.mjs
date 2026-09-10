/* Scenario E per il matching (lotto 4): i fatti e gli snapshot li vede solo lo staff dell'org; gli
   override vogliono un motivo; i pesi sono versionati. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);   /* il caso serve: due suite avviate nello stesso millisecondo creerebbero la stessa organizzazione */
const mail = (n) => `orc-match-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG_A, ORG_B, PID, PAST, ROLE, M1, M2, RUN;

run("preparazione: org, tre musicisti, una produzione passata con storico, una nuova", async () => {
  for (const n of ["ownerA", "ownerB", "viewerA"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG_A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Match A", org_slug: "match-a-" + stamp, owner_email: mail("ownerA") })).d;
  ORG_B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Match B", org_slug: "match-b-" + stamp, owner_email: mail("ownerB") })).d;
  assert.ok((await rpc(env, T.ownerA, "orc_add_member_by_email", { org: ORG_A, member_email: mail("viewerA"), new_role: "viewer" })).ok);
  const imp = await rpc(env, T.ownerA, "orc_import_musicians", { org: ORG_A, rows: [
    { first_name: "Storico", last_name: "Prova", email: "storico@example.invalid", instruments: [{ code: "violino", primary: true, level: 5 }], repertoire: [{ kind: "composer", name: "Ennio Morricone", source: "history" }] },
    { first_name: "Nuovo", last_name: "Prova", email: "nuovo@example.invalid", instruments: [{ code: "violino", primary: true, level: 3 }] },
    { first_name: "Violista", last_name: "Prova", email: "violista@example.invalid", instruments: [{ code: "viola", primary: true }] },
  ] });
  assert.equal(imp.d.new, 3);
  const list = (await rpc(env, T.ownerA, "orc_musicians_list", { org: ORG_A })).d;
  M1 = list.find((m) => m.first_name === "Storico").id; M2 = list.find((m) => m.first_name === "Nuovo").id;
  /* produzione passata, conclusa, con M1 confermato */
  PAST = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Morricone in concerto", conductor: "M. Prova", status: "done" } })).d[0].id;
  await rest(env, T.ownerA, "orc_production_dates", { method: "POST", body: { production_id: PAST, kind: "concert", starts_at: "2025-06-01T21:00:00+02:00" } });
  const rep = (await rest(env, T.ownerA, "orc_repertoire", { method: "POST", body: { org_id: ORG_A, kind: "composer", name: "Ennio Morricone " + stamp } })).d[0].id;
  await rest(env, T.ownerA, "orc_production_repertoire", { method: "POST", body: { production_id: PAST, repertoire_id: rep } });
  const pr = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: PAST, instrument_code: "violino", name: "Violini", seats: 1 } })).d[0].id;
  const ps = (await rest(env, T.ownerA, "orc_staffing_slots?select=id&role_id=eq." + pr)).d[0].id;
  assert.ok((await rpc(env, T.ownerA, "orc_assign_slot", { slot: ps, musician: M1 })).ok);
  /* la nuova produzione, stesso titolo con l'anno, stesso repertorio e direttore */
  PID = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Morricone in concerto 2026", conductor: "M. Prova", status: "planning" } })).d[0].id;
  await rest(env, T.ownerA, "orc_production_dates", { method: "POST", body: { production_id: PID, kind: "concert", starts_at: "2026-10-17T21:00:00+02:00" } });
  await rest(env, T.ownerA, "orc_production_repertoire", { method: "POST", body: { production_id: PID, repertoire_id: rep } });
  ROLE = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: PID, instrument_code: "violino", name: "Violini", seats: 2 } })).d[0].id;
});

run("i fatti: lo staff li legge, il viewer e l'altra org no; lo storico è contato bene", async () => {
  const no = await rpc(env, T.viewerA, "orc_matching_candidates", { production: PID, role: ROLE });
  assert.equal(no.ok, false, "un viewer non fa matching");
  const cross = await rpc(env, T.ownerB, "orc_matching_candidates", { production: PID, role: ROLE });
  assert.equal(cross.ok, false, "l'altra org nemmeno");
  const r = await rpc(env, T.ownerA, "orc_matching_candidates", { production: PID, role: ROLE });
  assert.ok(r.ok, JSON.stringify(r.d));
  assert.equal(r.d.role.instrument_code, "violino");
  assert.equal(Number(r.d.role.open_slots), 2);
  assert.equal(r.d.production.series, "morricone in concerto");
  const st = r.d.candidates.find((c) => c.id === M1), nu = r.d.candidates.find((c) => c.id === M2);
  assert.equal(Number(st.n_collab), 1); assert.equal(Number(st.n_same_series), 1); assert.equal(Number(st.n_same_repertoire), 1);
  assert.equal(Number(st.n_same_composer_prod), 1); assert.equal(Number(st.n_same_conductor), 1);
  assert.ok(st.last_engagement, "ultimo incarico registrato");
  assert.equal(Number(nu.n_collab), 0); assert.equal(Number(nu.n_same_series), 0);
  assert.equal(r.d.candidates.length, 3, "anche il violista è tra i candidati: sarà il motore a dirlo non idoneo");
});

run("snapshot: si salva via RPC, si legge solo dalla propria org, l'override vuole un motivo", async () => {
  const results = [
    { musician_id: M1, eligible: true, score: 88, rank: 1, reasons: [{ code: "same_series", label: "x", points: 20 }], missing: [], warnings: [] },
    { musician_id: M2, eligible: true, score: 53, rank: 2, reasons: [], missing: [], warnings: ["Nessuno storico"] },
  ];
  const v = await rpc(env, T.viewerA, "orc_matching_save_run", { production: PID, role: ROLE, weights: { same_series: 20 }, results });
  assert.equal(v.ok, false);
  const s = await rpc(env, T.ownerA, "orc_matching_save_run", { production: PID, role: ROLE, weights: { same_series: 20 }, results });
  assert.ok(s.ok, JSON.stringify(s.d)); RUN = s.d;
  const mine = await rest(env, T.ownerA, "orc_matching_results?select=musician_id,score,rank&run_id=eq." + RUN + "&order=rank");
  assert.equal(mine.d.length, 2); assert.equal(mine.d[0].score, 88);
  const theirs = await rest(env, T.ownerB, "orc_matching_results?select=musician_id&run_id=eq." + RUN);
  assert.ok(!theirs.ok || theirs.d.length === 0, "B non legge gli snapshot di A");
  const runsB = await rest(env, T.ownerB, "orc_matching_runs?select=id&org_id=eq." + ORG_A);
  assert.ok(!runsB.ok || runsB.d.length === 0);
  const direct = await rest(env, T.ownerA, "orc_matching_results?run_id=eq." + RUN + "&musician_id=eq." + M2, { method: "PATCH", body: { override_rank: 1 } });
  assert.ok(!direct.ok || direct.d.length === 0, "l'override non si scrive a mano");
  const noReason = await rpc(env, T.ownerA, "orc_matching_override", { run: RUN, musician: M2, new_rank: 1, reason: "" });
  assert.equal(noReason.ok, false, "senza motivo niente override");
  const ok = await rpc(env, T.ownerA, "orc_matching_override", { run: RUN, musician: M2, new_rank: 1, reason: "il direttore lo vuole in prima fila" });
  assert.ok(ok.ok, JSON.stringify(ok.d));
  const after = (await rest(env, T.ownerA, "orc_matching_results?select=override_rank,override_reason&run_id=eq." + RUN + "&musician_id=eq." + M2)).d[0];
  assert.equal(after.override_rank, 1); assert.match(after.override_reason, /direttore/);
  const crossOv = await rpc(env, T.ownerB, "orc_matching_override", { run: RUN, musician: M1, new_rank: 1, reason: "intrusione" });
  assert.equal(crossOv.ok, false);
  const audit = (await rest(env, T.ownerA, "orc_audit_log?select=action&org_id=eq." + ORG_A + "&action=eq.matching.override")).d;
  assert.equal(audit.length, 1);
});

run("i pesi: versionati per org, l'ultimo attivo; il viewer non li cambia", async () => {
  const none = await rest(env, T.ownerA, "orc_matching_rulesets?select=id&org_id=eq." + ORG_A);
  assert.deepEqual(none.d, [], "all'inizio nessuna versione: valgono i default del motore");
  const v1 = await rpc(env, T.ownerA, "orc_save_ruleset", { org: ORG_A, ruleset_name: "prova", weights: { same_series: 30 } });
  assert.ok(v1.ok, JSON.stringify(v1.d)); assert.equal(v1.d.version, 1); assert.equal(v1.d.active, true);
  const v2 = await rpc(env, T.ownerA, "orc_save_ruleset", { org: ORG_A, ruleset_name: "prova 2", weights: { same_series: 25 } });
  assert.equal(v2.d.version, 2);
  const all = (await rest(env, T.ownerA, "orc_matching_rulesets?select=version,active&org_id=eq." + ORG_A + "&order=version")).d;
  assert.deepEqual(all, [{ version: 1, active: false }, { version: 2, active: true }]);
  const bad = await rpc(env, T.viewerA, "orc_save_ruleset", { org: ORG_A, ruleset_name: "x", weights: {} });
  assert.equal(bad.ok, false);
  const s = await rpc(env, T.ownerA, "orc_matching_save_run", { production: PID, role: ROLE, weights: { same_series: 25 }, results: [] });
  const runRow = (await rest(env, T.ownerA, "orc_matching_runs?select=ruleset_version&id=eq." + s.d)).d[0];
  assert.equal(runRow.ruleset_version, 2, "la corsa cita la versione dei pesi");
  const seeB = await rest(env, T.ownerB, "orc_matching_rulesets?select=id&org_id=eq." + ORG_A);
  assert.ok(!seeB.ok || seeB.d.length === 0);
});
