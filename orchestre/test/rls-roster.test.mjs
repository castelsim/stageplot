/* Scenario E per il roster (lotto 2): il pool di un'org lo vede e lo tocca solo il suo staff. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "r" + Date.now().toString(36);
const mail = (n) => `orc-roster-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG_A, ORG_B, MID;

const DUE = [
  { first_name: "Prova", last_name: "Uno", email: "prova.uno@example.invalid", city: "Vicenza", province: "VI",
    instruments: [{ code: "violino", primary: true, level: 5 }, { code: "viola", level: 3, doubling: true }],
    skills: [{ code: "click", level: 2 }], repertoire: [{ kind: "composer", name: "Ennio Morricone", source: "history" }], tags: ["prima parte"] },
  { first_name: "Prova", last_name: "Due", email: "prova.due@example.invalid", instruments: [{ code: "oboe", primary: true }], tags: [] },
];

run("preparazione: due org, staff e un estraneo", async () => {
  for (const n of ["ownerA", "ownerB", "viewerA", "estraneo"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG_A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Roster A", org_slug: "roster-a-" + stamp, owner_email: mail("ownerA") })).d;
  ORG_B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Roster B", org_slug: "roster-b-" + stamp, owner_email: mail("ownerB") })).d;
  assert.ok(ORG_A && ORG_B);
  assert.ok((await rpc(env, T.ownerA, "orc_add_member_by_email", { org: ORG_A, member_email: mail("viewerA"), new_role: "viewer" })).ok);
});

run("l'import passa solo dallo staff dell'org, ed è un upsert per email", async () => {
  const no = await rpc(env, T.viewerA, "orc_import_musicians", { org: ORG_A, rows: DUE });
  assert.equal(no.ok, false, "un viewer non importa");
  const cross = await rpc(env, T.ownerB, "orc_import_musicians", { org: ORG_A, rows: DUE });
  assert.equal(cross.ok, false, "lo staff di B non importa in A");
  const r1 = await rpc(env, T.ownerA, "orc_import_musicians", { org: ORG_A, rows: DUE });
  assert.ok(r1.ok, JSON.stringify(r1.d));
  assert.equal(r1.d.new, 2); assert.equal(r1.d.updated, 0); assert.equal(r1.d.errors, 0);
  const r2 = await rpc(env, T.ownerA, "orc_import_musicians", { org: ORG_A, rows: [{ ...DUE[0], city: "Padova" }] });
  assert.equal(r2.d.updated, 1); assert.equal(r2.d.new, 0);
  const bad = await rpc(env, T.ownerA, "orc_import_musicians", { org: ORG_A, rows: [{ first_name: "", last_name: "X" }, { first_name: "Y", last_name: "Z", instruments: [{ code: "kazoo" }] }] });
  assert.equal(bad.d.errors, 2, JSON.stringify(bad.d));
  assert.equal(bad.d.new, 0, "una riga con strumento sconosciuto non lascia un musicista a metà");
  const list = await rpc(env, T.ownerA, "orc_musicians_list", { org: ORG_A });
  assert.equal(list.d.length, 2);
  const uno = list.d.find((m) => m.last_name === "Uno");
  MID = uno.id;
  assert.equal(uno.city, "Padova");
  assert.equal(uno.primary_instrument, "Violino");
  assert.deepEqual(uno.instruments, ["Violino", "Viola"]);
  assert.deepEqual(uno.tags, ["prima parte"]);
});

run("E.1/E.3 — il pool di A non si vede da B, né da un viewer, né da un estraneo", async () => {
  for (const [who, tok] of [["ownerB", T.ownerB], ["viewerA", T.viewerA], ["estraneo", T.estraneo]]) {
    const direct = await rest(env, tok, "orc_musicians?select=id&org_id=eq." + ORG_A);
    assert.ok(!direct.ok || direct.d.length === 0, who + " non legge orc_musicians di A");
    const child = await rest(env, tok, "orc_musician_tags?select=tag&musician_id=eq." + MID);
    assert.ok(!child.ok || child.d.length === 0, who + " non legge i tag");
    const viaRpc = await rpc(env, tok, "orc_musicians_list", { org: ORG_A });
    assert.deepEqual(viaRpc.d, [], who + " ha la lista vuota dalla RPC");
    const rep = await rest(env, tok, "orc_repertoire?select=name&org_id=eq." + ORG_A);
    assert.ok(!rep.ok || rep.d.length === 0, who + " non legge il repertorio");
  }
  const anon = await rest(env, env.ANON_KEY, "orc_musicians?select=id");
  assert.ok(!anon.ok || anon.d.length === 0, "anon niente");
});

run("scrivere nel pool di un'altra org è negato, anche sulle tabelle figlie", async () => {
  const ins = await rest(env, T.ownerB, "orc_musicians", { method: "POST", body: { org_id: ORG_A, first_name: "Intruso", last_name: "B" } });
  assert.equal(ins.ok, false, "insert in A da B");
  const upd = await rest(env, T.ownerB, "orc_musicians?id=eq." + MID, { method: "PATCH", body: { notes_private: "hack" } });
  assert.ok(!upd.ok || upd.d.length === 0, "update in A da B");
  const tag = await rest(env, T.ownerB, "orc_musician_tags", { method: "POST", body: { musician_id: MID, tag: "hack" } });
  assert.equal(tag.ok, false, "tag su un musicista di A da B");
  const del = await rest(env, T.viewerA, "orc_musicians?id=eq." + MID, { method: "DELETE" });
  assert.ok(!del.ok || del.d.length === 0, "delete da un viewer");
  const mine = await rest(env, T.ownerA, "orc_musicians?id=eq." + MID, { method: "PATCH", body: { notes_private: "nota dello staff" } });
  assert.ok(mine.ok, JSON.stringify(mine.d));
  const still = await rest(env, T.ownerA, "orc_musicians?select=notes_private&id=eq." + MID);
  assert.equal(still.d[0].notes_private, "nota dello staff");
});
