/* Scenario E per il collegamento a StagePlot (lotto 8): il progetto è di chi lo possiede, l'importazione
   allarga l'organico senza mai restringerlo, i collegamenti sono dello staff e basta. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "s" + Date.now().toString(36);
const mail = (n) => `orc-sp-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG_A, ORG_B, PID, PROJ;

const DOC = { _doc: 1, active: "b", variants: [
  { id: "a", name: "Prove", state: { items: [{ id: "i1", type: "vlnpost", label: "Vl" }] } },
  { id: "b", name: "Concerto", state: { items: [
    { id: "i1", type: "vln1x2", label: "Vl I 1-2" }, { id: "i2", type: "vln1x2", label: "Vl I 3-4" },
    { id: "i3", type: "violapost", label: "Vla" }, { id: "i4", type: "flauto", label: "Fl" }, { id: "i5", type: "wedge", label: "Monitor" },
  ] } },
] };
const POS = [
  { item_id: "i1", item_type: "vln1x2", label: "Vl I 1-2", instrument_code: "violino", seats: 2 },
  { item_id: "i2", item_type: "vln1x2", label: "Vl I 3-4", instrument_code: "violino", seats: 2 },
  { item_id: "i3", item_type: "violapost", label: "Vla", instrument_code: "viola", seats: 1 },
  { item_id: "i4", item_type: "flauto", label: "Fl", instrument_code: "flauto", seats: 1 },
];

run("preparazione", async () => {
  for (const n of ["ownerA", "ownerB", "viewerA"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG_A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "SP A", org_slug: "sp-a-" + stamp, owner_email: mail("ownerA") })).d;
  ORG_B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "SP B", org_slug: "sp-b-" + stamp, owner_email: mail("ownerB") })).d;
  assert.ok((await rpc(env, T.ownerA, "orc_add_member_by_email", { org: ORG_A, member_email: mail("viewerA"), new_role: "viewer" })).ok);
  const c = await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Concerto col palco", kind: "concerto" } });
  assert.ok(c.ok, JSON.stringify(c.d)); PID = c.d[0].id;
  /* il progetto dell'editor: l'amministratore lo salva con le SUE policy own-rows */
  const pr = await rest(env, T.ownerA, "stageplot_projects", { method: "POST", body: { user_id: U.ownerA, title: "Palco di prova", data: DOC } });
  assert.ok(pr.ok, JSON.stringify(pr.d)); PROJ = pr.d[0].id;
});

run("il progetto lo legge solo chi lo possiede: lo staff di un'altra org (o un viewer) non lo vede", async () => {
  const mine = await rest(env, T.ownerA, "stageplot_projects?select=id,title,data&id=eq." + PROJ);
  assert.equal(mine.d.length, 1); assert.equal(mine.d[0].data.active, "b");
  const other = await rest(env, T.ownerB, "stageplot_projects?select=id&id=eq." + PROJ);
  assert.ok(!other.ok || other.d.length === 0);
  const viewer = await rest(env, T.viewerA, "stageplot_projects?select=id&id=eq." + PROJ);
  assert.ok(!viewer.ok || viewer.d.length === 0);
});

run("importare crea sezioni e ruoli per famiglia, i posti seguono, i collegamenti si vedono solo dallo staff", async () => {
  const r = await rpc(env, T.ownerA, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", positions: POS });
  assert.ok(r.ok, JSON.stringify(r.d));
  assert.deepEqual(r.d, { roles_created: 3, roles_grown: 0, seats_added: 6, linked: 4, stale: 0 });
  const st = (await rpc(env, T.ownerA, "orc_staffing", { production: PID })).d;
  const vl = st.filter((x) => x.instrument_code === "violino");
  assert.equal(vl[0].seats, 4); assert.equal(vl.length, 4, "quattro posti di violino");
  assert.deepEqual([...new Set(st.map((x) => x.section_name))].sort(), ["Archi", "Legni"]);
  assert.equal(st.find((x) => x.instrument_code === "flauto").section_name, "Legni");
  const p = (await rest(env, T.ownerA, "orc_productions?select=stageplot_project_id,stageplot_variant_id,stageplot_synced_at&id=eq." + PID)).d[0];
  assert.equal(p.stageplot_project_id, PROJ); assert.equal(p.stageplot_variant_id, "b"); assert.ok(p.stageplot_synced_at);
  const lk = await rest(env, T.ownerA, "orc_stageplot_links?select=item_id,status,role_id,seats&production_id=eq." + PID + "&order=item_id");
  assert.equal(lk.d.length, 4); assert.ok(lk.d.every((l) => l.status === "linked" && l.role_id));
  assert.equal(lk.d[0].seats, 2);
  const lkB = await rest(env, T.ownerB, "orc_stageplot_links?select=id&production_id=eq." + PID);
  assert.ok(!lkB.ok || lkB.d.length === 0, "un'altra org non vede i collegamenti");
  const lkV = await rest(env, T.viewerA, "orc_stageplot_links?select=id&production_id=eq." + PID);
  assert.ok(!lkV.ok || lkV.d.length === 0, "un viewer non è staff");
  const ins = await rest(env, T.ownerA, "orc_stageplot_links", { method: "POST", body: { org_id: ORG_A, production_id: PID, project_id: PROJ, item_id: "x" } });
  assert.equal(ins.ok, false, "i collegamenti si scrivono solo via RPC");
});

run("reimportare con meno postazioni non restringe l'organico; ciò che è sparito dal palco diventa stale", async () => {
  const r = await rpc(env, T.ownerA, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", positions: POS.filter((x) => x.item_id !== "i2") });
  assert.ok(r.ok, JSON.stringify(r.d));
  assert.deepEqual(r.d, { roles_created: 0, roles_grown: 0, seats_added: 0, linked: 3, stale: 1 });
  const st = (await rpc(env, T.ownerA, "orc_staffing", { production: PID })).d;
  assert.equal(st.filter((x) => x.instrument_code === "violino").length, 4, "i posti restano");
  const lk = (await rest(env, T.ownerA, "orc_stageplot_links?select=item_id,status&production_id=eq." + PID + "&order=item_id")).d;
  assert.deepEqual(lk.map((l) => [l.item_id, l.status]), [["i1", "linked"], ["i2", "stale"], ["i3", "linked"], ["i4", "linked"]]);
  /* il palco cresce: solo la differenza si aggiunge */
  const more = [...POS, { item_id: "i9", item_type: "vlnpost", label: "Vl I 5", instrument_code: "violino", seats: 1 }, { item_id: "i10", item_type: "tromba", label: "Tr", instrument_code: "tromba", seats: 1 }];
  const r2 = await rpc(env, T.ownerA, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", positions: more });
  assert.deepEqual(r2.d, { roles_created: 1, roles_grown: 1, seats_added: 2, linked: 6, stale: 0 });
  const st2 = (await rpc(env, T.ownerA, "orc_staffing", { production: PID })).d;
  assert.equal(st2.filter((x) => x.instrument_code === "violino").length, 5);
  assert.equal(st2.find((x) => x.instrument_code === "tromba").section_name, "Ottoni");
  const bad = await rpc(env, T.ownerA, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", positions: [{ item_id: "z", instrument_code: "strumento_inesistente", seats: 1 }] });
  assert.ok(bad.ok); assert.equal(bad.d.linked, 0, "uno strumento fuori catalogo non crea nulla");
});

run("le produzioni collegate a un progetto le vede il suo staff; un'altra org non importa, non scollega, non le vede", async () => {
  const forA = (await rpc(env, T.ownerA, "orc_productions_for_project", { project: PROJ })).d;
  assert.deepEqual(forA.map((x) => x.id), [PID]);
  const forB = (await rpc(env, T.ownerB, "orc_productions_for_project", { project: PROJ })).d;
  assert.deepEqual(forB, []);
  const imp = await rpc(env, T.ownerB, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", positions: POS });
  assert.equal(imp.ok, false);
  const impV = await rpc(env, T.viewerA, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", positions: POS });
  assert.equal(impV.ok, false);
  const un = await rpc(env, T.ownerB, "orc_stageplot_unlink", { production: PID });
  assert.equal(un.ok, false);
});

run("scollegare toglie il puntatore e i collegamenti; l'organico resta", async () => {
  assert.ok((await rpc(env, T.ownerA, "orc_stageplot_unlink", { production: PID })).ok);
  const p = (await rest(env, T.ownerA, "orc_productions?select=stageplot_project_id,stageplot_synced_at&id=eq." + PID)).d[0];
  assert.equal(p.stageplot_project_id, null); assert.equal(p.stageplot_synced_at, null);
  assert.equal((await rest(env, T.ownerA, "orc_stageplot_links?select=id&production_id=eq." + PID)).d.length, 0);
  assert.equal((await rpc(env, T.ownerA, "orc_staffing", { production: PID })).d.filter((x) => x.instrument_code === "violino").length, 5);
  const log = (await rest(env, T.ownerA, "orc_audit_log?select=action&org_id=eq." + ORG_A + "&action=like.stageplot.*&order=at")).d;
  assert.deepEqual(log.map((x) => x.action), ["stageplot.import", "stageplot.import", "stageplot.import", "stageplot.import", "stageplot.unlink"]);
});
