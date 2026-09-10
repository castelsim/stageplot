/* Scenario E per il collegamento a StagePlot (lotti 8-9): il progetto è di chi lo possiede, l'importazione
   lega ogni postazione a un POSTO FISICO, allarga l'organico senza mai restringerlo, tiene i posti con le
   persone sopra; i collegamenti e la vista per l'editor sono dello staff e basta. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "s" + Date.now().toString(36);
const mail = (n) => `orc-sp-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG_A, ORG_B, PID, PROJ, M1;

const DOC = { _doc: 1, active: "b", variants: [
  { id: "a", name: "Prove", state: { items: [{ id: "i1", type: "vlnpost", label: "Vl" }] } },
  { id: "b", name: "Concerto", state: { items: [
    { id: "i1", type: "vln1x2", label: "Vl I 1-2" }, { id: "i2", type: "vln1x2", label: "Vl I 3-4" },
    { id: "i3", type: "violapost", label: "Vla" }, { id: "i4", type: "flauto", label: "Fl" }, { id: "i5", type: "wedge", label: "Monitor" },
  ] } },
] };
const P = (item_id, item_type, label, seats) => ({ item_id, item_type, label, seats });
const GROUPS = [
  { instrument_code: "violino", role_id: null, role_name: "Violini primi", positions: [P("i1", "vln1x2", "Vl I 1-2", 2), P("i2", "vln1x2", "Vl I 3-4", 2)] },
  { instrument_code: "viola", role_id: null, role_name: "Viole", positions: [P("i3", "violapost", "Vla", 1)] },
  { instrument_code: "flauto", role_id: null, role_name: "Flauti", positions: [P("i4", "flauto", "Fl", 1)] },
];
const staffing = async (t) => (await rpc(env, t, "orc_staffing", { production: PID })).d;
const links = async (t, extra = "") => (await rest(env, t, "orc_stageplot_links?select=id,item_id,seat_index,status,role_id,slot_id&production_id=eq." + PID + "&order=item_id,seat_index" + extra)).d;

run("preparazione", async () => {
  for (const n of ["ownerA", "ownerB", "viewerA"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG_A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "SP A", org_slug: "sp-a-" + stamp, owner_email: mail("ownerA") })).d;
  ORG_B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "SP B", org_slug: "sp-b-" + stamp, owner_email: mail("ownerB") })).d;
  assert.ok((await rpc(env, T.ownerA, "orc_add_member_by_email", { org: ORG_A, member_email: mail("viewerA"), new_role: "viewer" })).ok);
  const c = await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Concerto col palco", kind: "concerto" } });
  assert.ok(c.ok, JSON.stringify(c.d)); PID = c.d[0].id;
  const imp = await rpc(env, T.ownerA, "orc_import_musicians", { org: ORG_A, rows: [{ first_name: "Uno", last_name: "Prova", email: "uno@example.invalid", instruments: [{ code: "violino", primary: true }] }] });
  assert.equal(imp.d.new, 1);
  M1 = (await rpc(env, T.ownerA, "orc_musicians_list", { org: ORG_A })).d[0].id;
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

run("importare crea ruoli per parte e lega ogni postazione a un posto (una doppia a due); i collegamenti solo allo staff", async () => {
  const r = await rpc(env, T.ownerA, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", groups: GROUPS });
  assert.ok(r.ok, JSON.stringify(r.d));
  assert.deepEqual(r.d, { roles_created: 3, roles_grown: 0, seats_added: 6, linked: 6, stale: 0 });
  const st = await staffing(T.ownerA);
  const vl = st.filter((x) => x.instrument_code === "violino");
  assert.equal(vl.length, 4, "quattro posti di violini primi"); assert.equal(vl[0].role_name, "Violini primi"); assert.equal(vl[0].seats, 4);
  assert.deepEqual(vl.map((x) => [x.seat_no, x.item_id]), [[1, "i1"], [2, "i1"], [3, "i2"], [4, "i2"]], "ogni posto sa la sua postazione");
  assert.deepEqual([...new Set(st.map((x) => x.section_name))].sort(), ["Archi", "Legni"]);
  const lk = await links(T.ownerA);
  assert.equal(lk.length, 6); assert.ok(lk.every((l) => l.status === "linked" && l.slot_id && l.role_id));
  assert.deepEqual(lk.filter((l) => l.item_id === "i1").map((l) => l.seat_index), [1, 2]);
  const p = (await rest(env, T.ownerA, "orc_productions?select=stageplot_project_id,stageplot_variant_id&id=eq." + PID)).d[0];
  assert.equal(p.stageplot_project_id, PROJ); assert.equal(p.stageplot_variant_id, "b");
  const lkB = await rest(env, T.ownerB, "orc_stageplot_links?select=id&production_id=eq." + PID);
  assert.ok(!lkB.ok || lkB.d.length === 0, "un'altra org non vede i collegamenti");
  const lkV = await rest(env, T.viewerA, "orc_stageplot_links?select=id&production_id=eq." + PID);
  assert.ok(!lkV.ok || lkV.d.length === 0, "un viewer non è staff");
  const ins = await rest(env, T.ownerA, "orc_stageplot_links", { method: "POST", body: { org_id: ORG_A, production_id: PID, project_id: PROJ, item_id: "x" } });
  assert.equal(ins.ok, false, "i collegamenti si scrivono solo via RPC");
});

run("la vista per l'editor: nome e stato per postazione, solo per lo staff dell'org", async () => {
  /* una persona confermata sul posto 1 (postazione i1, seat 1) */
  const slot1 = (await staffing(T.ownerA)).find((x) => x.instrument_code === "violino" && x.seat_no === 1).slot_id;
  assert.ok((await rpc(env, T.ownerA, "orc_assign_slot", { slot: slot1, musician: M1, reason: "prova" })).ok);
  const v = (await rpc(env, T.ownerA, "orc_stage_view", { project: PROJ })).d;
  assert.equal(v.length, 6);
  const i1 = v.filter((x) => x.item_id === "i1").sort((a, b) => a.seat_index - b.seat_index);
  assert.deepEqual(i1.map((x) => [x.seat_index, x.seat_no, x.slot_status, x.musician_name, x.role_name]), [[1, 1, "confirmed", "Uno Prova", "Violini primi"], [2, 2, "open", null, "Violini primi"]]);
  assert.equal(i1[0].production_title, "Concerto col palco");
  assert.deepEqual((await rpc(env, T.ownerB, "orc_stage_view", { project: PROJ })).d, [], "un'altra org non vede nulla");
  assert.deepEqual((await rpc(env, T.viewerA, "orc_stage_view", { project: PROJ })).d, [], "un viewer non vede nulla");
  const keys = Object.keys(v[0]);
  for (const k of ["notes", "fee", "private_note", "score"]) assert.ok(!keys.includes(k), "niente dati riservati: " + k);
});

run("reimportare tiene i posti (e la persona sopra), non restringe, marca stale ciò che sparisce; ricollegare rimette il posto su un'altra postazione", async () => {
  /* i2 sparisce dal palco, arriva i9 (singola) */
  const g2 = [{ ...GROUPS[0], role_id: null, positions: [P("i1", "vln1x2", "Vl I 1-2", 2), P("i9", "vlnpost", "Vl I 5", 1)] }, GROUPS[1], GROUPS[2]];
  const r = await rpc(env, T.ownerA, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", groups: g2 });
  assert.ok(r.ok, JSON.stringify(r.d));
  assert.deepEqual(r.d, { roles_created: 0, roles_grown: 0, seats_added: 0, linked: 5, stale: 2 });
  const st = await staffing(T.ownerA);
  const vl = st.filter((x) => x.instrument_code === "violino");
  assert.equal(vl.length, 4, "i posti restano quattro");
  assert.deepEqual(vl.map((x) => [x.seat_no, x.item_id, x.musician_name]), [[1, "i1", "Prova Uno"], [2, "i1", null], [3, "i9", null], [4, null, null]], "i1 tiene i suoi posti e la persona; i9 prende il primo libero");
  const lk = await links(T.ownerA);
  assert.deepEqual(lk.map((l) => [l.item_id, l.seat_index, l.status, !!l.slot_id]), [["i1", 1, "linked", true], ["i1", 2, "linked", true], ["i2", 1, "stale", false], ["i2", 2, "stale", false], ["i3", 1, "linked", true], ["i4", 1, "linked", true], ["i9", 1, "linked", true]]);
  /* ricollega: il legame stale di i2 (seat 1) va su i10 → torna linked ma SENZA posto: il posto lo riprende al prossimo import */
  const stale = lk.find((l) => l.item_id === "i2" && l.seat_index === 1);
  assert.ok((await rpc(env, T.ownerA, "orc_stageplot_relink", { link: stale.id, new_item_id: "i10", new_item_type: "vlnpost", new_label: "Vl I 6" })).ok);
  const after = (await links(T.ownerA)).find((l) => l.id === stale.id);
  assert.equal(after.item_id, "i10"); assert.equal(after.status, "linked");
  assert.equal((await rpc(env, T.ownerB, "orc_stageplot_relink", { link: stale.id, new_item_id: "zzz" })).ok, false, "un'altra org non ricollega");
  /* una doppia che diventa singola: il secondo posto si libera */
  const g3 = [{ ...GROUPS[0], positions: [P("i1", "vlnpost", "Vl I 1", 1), P("i9", "vlnpost", "Vl I 5", 1), P("i10", "vlnpost", "Vl I 6", 1)] }, GROUPS[1], GROUPS[2]];
  const r3 = await rpc(env, T.ownerA, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", groups: g3 });
  assert.deepEqual(r3.d, { roles_created: 0, roles_grown: 0, seats_added: 0, linked: 5, stale: 1 });
  const vl3 = (await staffing(T.ownerA)).filter((x) => x.instrument_code === "violino");
  assert.deepEqual(vl3.map((x) => [x.seat_no, x.item_id]), [[1, "i1"], [2, "i10"], [3, "i9"], [4, null]]);
  /* uno strumento fuori catalogo non crea nulla; un ruolo di un'altra produzione non si usa */
  const bad = await rpc(env, T.ownerA, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", groups: [{ instrument_code: "strumento_inesistente", role_id: null, role_name: "X", positions: [P("z", "x", "z", 1)] }] });
  assert.ok(bad.ok); assert.equal(bad.d.linked, 0);
});

run("le produzioni collegate a un progetto le vede il suo staff; un'altra org non importa, non scollega, non le vede", async () => {
  const forA = (await rpc(env, T.ownerA, "orc_productions_for_project", { project: PROJ })).d;
  assert.deepEqual(forA.map((x) => x.id), [PID]);
  assert.deepEqual((await rpc(env, T.ownerB, "orc_productions_for_project", { project: PROJ })).d, []);
  assert.equal((await rpc(env, T.ownerB, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", groups: GROUPS })).ok, false);
  assert.equal((await rpc(env, T.viewerA, "orc_stageplot_import", { production: PID, project: PROJ, variant: "b", groups: GROUPS })).ok, false);
  assert.equal((await rpc(env, T.ownerB, "orc_stageplot_unlink", { production: PID })).ok, false);
});

run("scollegare toglie il puntatore e i collegamenti; l'organico e le persone restano", async () => {
  assert.ok((await rpc(env, T.ownerA, "orc_stageplot_unlink", { production: PID })).ok);
  const p = (await rest(env, T.ownerA, "orc_productions?select=stageplot_project_id,stageplot_synced_at&id=eq." + PID)).d[0];
  assert.equal(p.stageplot_project_id, null); assert.equal(p.stageplot_synced_at, null);
  assert.equal((await links(T.ownerA)).length, 0);
  const vl = (await staffing(T.ownerA)).filter((x) => x.instrument_code === "violino");
  assert.equal(vl.length, 4); assert.equal(vl[0].musician_name, "Prova Uno");
  assert.deepEqual((await rpc(env, T.ownerA, "orc_stage_view", { project: PROJ })).d, []);
  const log = (await rest(env, T.ownerA, "orc_audit_log?select=action&org_id=eq." + ORG_A + "&action=like.stageplot.*&order=at")).d;
  assert.deepEqual(log.map((x) => x.action), ["stageplot.import", "stageplot.import", "stageplot.relink", "stageplot.import", "stageplot.import", "stageplot.unlink"]);
});

/* Collaudo 10/09: il difetto peggiore trovato dalla revisione di correttezza. Una persona confermata
   veniva SPOSTATA su un'altra sedia quando la sua postazione spariva dal disegno, mentre l'interfaccia
   prometteva «il suo posto e la persona restano». Rimettendo il vecchio comportamento (azzerare slot_id
   sui legami che lasciano il palco) questo test torna rosso. */
run("una persona confermata non cambia sedia quando la sua postazione sparisce dal disegno", async () => {
  const c = await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Sedie", kind: "concerto" } });
  const P2 = c.d[0].id;
  const G = (pos) => [{ instrument_code: "violino", role_id: null, role_name: "Violini primi", positions: pos }];
  const pos = (i, l) => ({ item_id: i, item_type: "vlnpost", label: l, seats: 1 });
  const staff2 = async () => (await rpc(env, T.ownerA, "orc_staffing", { production: P2 })).d;
  assert.ok((await rpc(env, T.ownerA, "orc_stageplot_import", { production: P2, project: PROJ, variant: "v", groups: G([pos("a1", "Vl I 1"), pos("a2", "Vl I 2"), pos("a3", "Vl I 3")]) })).ok);
  const mid = (await staff2()).find((x) => x.item_id === "a2").slot_id;
  assert.ok((await rpc(env, T.ownerA, "orc_assign_slot", { slot: mid, musician: M1, reason: "prova" })).ok);
  /* la postazione di mezzo sparisce dal disegno, ne arriva una nuova */
  assert.ok((await rpc(env, T.ownerA, "orc_stageplot_import", { production: P2, project: PROJ, variant: "v", groups: G([pos("a1", "Vl I 1"), pos("a3", "Vl I 3"), pos("a9", "Vl I 4")]) })).ok);
  const st = await staff2();
  const suo = st.find((x) => x.slot_id === mid);
  assert.equal(suo.musician_name, "Prova Uno", "la persona è ancora sul suo posto");
  assert.equal(suo.item_id, null, "e nessun'altra postazione si è presa la sua sedia");
  assert.ok(!st.some((x) => x.item_id === "a9" && x.slot_id === mid), "la postazione nuova ha un posto suo");
  const lk = (await rest(env, T.ownerA, "orc_stageplot_links?select=item_id,status,slot_id&production_id=eq." + P2)).d;
  const uscito = lk.find((l) => l.item_id === "a2");
  assert.equal(uscito.status, "stale"); assert.equal(uscito.slot_id, mid, "tiene il posto della persona, così «Ricollega» la recupera");
});

run("un posto annullato non viene mai dato a una postazione", async () => {
  const c = await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Annullati", kind: "concerto" } });
  const P3 = c.d[0].id;
  const G = (pos) => [{ instrument_code: "flauto", role_id: null, role_name: "Flauti", positions: pos }];
  const pos = (i) => ({ item_id: i, item_type: "flauto", label: i, seats: 1 });
  assert.ok((await rpc(env, T.ownerA, "orc_stageplot_import", { production: P3, project: PROJ, variant: "v", groups: G([pos("f1"), pos("f2")]) })).ok);
  const st = (await rpc(env, T.ownerA, "orc_staffing", { production: P3 })).d;
  const del = await rest(env, admin(env), "orc_stageplot_links?production_id=eq." + P3, { method: "DELETE" });
  assert.ok(del.ok, JSON.stringify(del.d));
  for (const sl of st) await rest(env, admin(env), "orc_staffing_slots?id=eq." + sl.slot_id, { method: "PATCH", body: { status: "cancelled" } });
  assert.ok((await rpc(env, T.ownerA, "orc_stageplot_import", { production: P3, project: PROJ, variant: "v", groups: G([pos("f9")]) })).ok);
  const dopo = (await rpc(env, T.ownerA, "orc_staffing", { production: P3 })).d;
  const legata = dopo.find((x) => x.item_id === "f9");
  assert.ok(legata, "la postazione ha un posto");
  assert.notEqual(legata.slot_status, "cancelled", "e non è uno di quelli annullati");
});
