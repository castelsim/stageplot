/* Scenario E per produzioni e organico (lotto 3): isolamento per org, posti che seguono i seats,
   assegnazioni solo via RPC, storia append-only. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "p" + Date.now().toString(36);
const mail = (n) => `orc-prod-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG_A, ORG_B, PID, PID2, ROLE, SLOTS, M1, M2;

run("preparazione", async () => {
  for (const n of ["ownerA", "ownerB", "viewerA"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG_A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Prod A", org_slug: "prod-a-" + stamp, owner_email: mail("ownerA") })).d;
  ORG_B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Prod B", org_slug: "prod-b-" + stamp, owner_email: mail("ownerB") })).d;
  assert.ok((await rpc(env, T.ownerA, "orc_add_member_by_email", { org: ORG_A, member_email: mail("viewerA"), new_role: "viewer" })).ok);
  const imp = await rpc(env, T.ownerA, "orc_import_musicians", { org: ORG_A, rows: [
    { first_name: "Uno", last_name: "Prova", email: "uno@example.invalid", instruments: [{ code: "violino", primary: true }] },
    { first_name: "Due", last_name: "Prova", email: "due@example.invalid", instruments: [{ code: "violino", primary: true }] },
  ] });
  assert.equal(imp.d.new, 2);
  const list = (await rpc(env, T.ownerA, "orc_musicians_list", { org: ORG_A })).d;
  M1 = list.find((m) => m.first_name === "Uno").id; M2 = list.find((m) => m.first_name === "Due").id;
});

run("una produzione si crea nella propria org e non si vede dalle altre", async () => {
  const c = await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Concerto di prova", kind: "concerto" } });
  assert.ok(c.ok, JSON.stringify(c.d)); PID = c.d[0].id;
  const cross = await rest(env, T.ownerB, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Intrusa" } });
  assert.equal(cross.ok, false);
  const seeB = await rest(env, T.ownerB, "orc_productions?select=id&org_id=eq." + ORG_A);
  assert.ok(!seeB.ok || seeB.d.length === 0);
  const seeV = await rest(env, T.viewerA, "orc_productions?select=id");
  assert.ok(!seeV.ok || seeV.d.length === 0, "un viewer non è staff");
  const d = await rest(env, T.ownerA, "orc_production_dates", { method: "POST", body: { production_id: PID, kind: "concert", starts_at: "2026-10-17T21:00:00+02:00", venue: "Teatro di prova" } });
  assert.ok(d.ok, JSON.stringify(d.d));
  const dB = await rest(env, T.ownerB, "orc_production_dates", { method: "POST", body: { production_id: PID, kind: "concert", starts_at: "2026-10-18T21:00:00+02:00" } });
  assert.equal(dB.ok, false, "una data su una produzione altrui");
});

run("i posti seguono i seats del ruolo; non si tolgono i posti occupati", async () => {
  const r = await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: PID, instrument_code: "violino", name: "Violini", seats: 3 } });
  assert.ok(r.ok, JSON.stringify(r.d)); ROLE = r.d[0].id;
  let slots = (await rest(env, T.ownerA, "orc_staffing_slots?select=id,seat_no,status&role_id=eq." + ROLE + "&order=seat_no")).d;
  assert.deepEqual(slots.map((s) => s.seat_no), [1, 2, 3]); SLOTS = slots;
  assert.ok((await rpc(env, T.ownerA, "orc_assign_slot", { slot: SLOTS[0].id, musician: M1 })).ok);
  assert.ok((await rpc(env, T.ownerA, "orc_assign_slot", { slot: SLOTS[1].id, musician: M2 })).ok);
  const shrink = await rest(env, T.ownerA, "orc_staffing_roles?id=eq." + ROLE, { method: "PATCH", body: { seats: 1 } });
  assert.equal(shrink.ok, false, "2 occupati, non si scende a 1: " + JSON.stringify(shrink.d));
  const shrink2 = await rest(env, T.ownerA, "orc_staffing_roles?id=eq." + ROLE, { method: "PATCH", body: { seats: 2 } });
  assert.ok(shrink2.ok, JSON.stringify(shrink2.d));
  slots = (await rest(env, T.ownerA, "orc_staffing_slots?select=id,seat_no,status&role_id=eq." + ROLE + "&order=seat_no")).d;
  assert.deepEqual(slots.map((s) => s.status), ["confirmed", "confirmed"]);
  const grow = await rest(env, T.ownerA, "orc_staffing_roles?id=eq." + ROLE, { method: "PATCH", body: { seats: 4 } });
  assert.ok(grow.ok);
  slots = (await rest(env, T.ownerA, "orc_staffing_slots?select=id,seat_no,status&role_id=eq." + ROLE + "&order=seat_no")).d;
  assert.deepEqual(slots.map((s) => s.seat_no), [1, 2, 3, 4]); SLOTS = slots;
});

run("assegnazioni solo via RPC e solo dallo staff; doppio posto negato; storia append-only", async () => {
  const direct = await rest(env, T.ownerA, "orc_staffing_slots?id=eq." + SLOTS[2].id, { method: "PATCH", body: { musician_id: M1, status: "confirmed" } });
  assert.ok(!direct.ok || direct.d.length === 0, "nessuna policy di update sui posti");
  const dup = await rpc(env, T.ownerA, "orc_assign_slot", { slot: SLOTS[2].id, musician: M1 });
  assert.equal(dup.ok, false, "M1 ha già un posto in questa produzione");
  const v = await rpc(env, T.viewerA, "orc_assign_slot", { slot: SLOTS[2].id, musician: M2 });
  assert.equal(v.ok, false, "un viewer non assegna");
  const b = await rpc(env, T.ownerB, "orc_assign_slot", { slot: SLOTS[2].id, musician: M2 });
  assert.equal(b.ok, false, "lo staff di B non assegna in A");
  const rel = await rpc(env, T.ownerA, "orc_release_slot", { slot: SLOTS[0].id, event: "withdrew", reason: "impegno sopraggiunto" });
  assert.ok(rel.ok, JSON.stringify(rel.d));
  const s0 = (await rest(env, T.ownerA, "orc_staffing_slots?select=status,musician_id&id=eq." + SLOTS[0].id)).d[0];
  assert.equal(s0.status, "open"); assert.equal(s0.musician_id, null);
  const ev = (await rest(env, T.ownerA, "orc_slot_events?select=id,event,musician_id&slot_id=eq." + SLOTS[0].id + "&order=at")).d;
  assert.deepEqual(ev.map((e) => e.event), ["confirmed", "withdrew"]);
  assert.equal(ev[1].musician_id, M1, "la rinuncia ricorda chi ha rinunciato");
  const edit = await rest(env, T.ownerA, "orc_slot_events?id=eq." + ev[0].id, { method: "PATCH", body: { event: "cancelled" } });
  assert.ok(!edit.ok || edit.d.length === 0, "gli eventi non si modificano");
  const del = await rest(env, T.ownerA, "orc_slot_events?id=eq." + ev[0].id, { method: "DELETE" });
  assert.ok(!del.ok || del.d.length === 0, "né si cancellano");
  const again = await rpc(env, T.ownerA, "orc_assign_slot", { slot: SLOTS[2].id, musician: M1 });
  assert.ok(again.ok, "dopo la rinuncia M1 può essere riassegnato altrove");
  const evB = await rest(env, T.ownerB, "orc_slot_events?select=id&production_id=eq." + PID);
  assert.ok(!evB.ok || evB.d.length === 0, "B non legge la storia di A");
});

run("modelli e duplicazione: solo su una produzione vuota, solo nella stessa org; la lista conta", async () => {
  const tpl = [{ section: "Archi", roles: [{ instrument: "viola", name: "Viole", seats: 2 }] }];
  const onFull = await rpc(env, T.ownerA, "orc_apply_staffing_template", { production: PID, template: tpl });
  assert.equal(onFull.ok, false, "la produzione ha già un organico");
  PID2 = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Seconda" } })).d[0].id;
  const t = await rpc(env, T.ownerA, "orc_apply_staffing_template", { production: PID2, template: tpl });
  assert.ok(t.ok, JSON.stringify(t.d)); assert.equal(t.d, 1);
  const st = (await rpc(env, T.ownerA, "orc_staffing", { production: PID2 })).d;
  assert.equal(st.length, 2, "un ruolo da 2 posti = 2 righe");
  const PID3 = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Terza" } })).d[0].id;
  const dupl = await rpc(env, T.ownerA, "orc_duplicate_staffing", { src: PID, dst: PID3 });
  assert.ok(dupl.ok, JSON.stringify(dupl.d)); assert.equal(dupl.d, 1);
  const st3 = (await rpc(env, T.ownerA, "orc_staffing", { production: PID3 })).d;
  assert.equal(st3.length, 4); assert.ok(st3.every((r) => r.slot_status === "open"), "duplicare non porta persone");
  const PIDB = (await rest(env, T.ownerB, "orc_productions", { method: "POST", body: { org_id: ORG_B, title: "Di B" } })).d[0].id;
  const cross = await rpc(env, T.ownerB, "orc_duplicate_staffing", { src: PID, dst: PIDB });
  assert.equal(cross.ok, false, "non si copia da un'altra org");
  const list = (await rpc(env, T.ownerA, "orc_productions_list", { org: ORG_A })).d;
  const p = list.find((x) => x.id === PID);
  assert.equal(Number(p.n_seats), 4); assert.equal(Number(p.n_filled), 2); assert.equal(Number(p.n_open), 2); assert.equal(Number(p.n_dates), 1);
  assert.deepEqual((await rpc(env, T.ownerB, "orc_productions_list", { org: ORG_A })).d, []);
});
