/* Scenario E (sicurezza), parte del lotto 1: le regole stanno nel DATABASE, non nei bottoni.
   Gira contro un Supabase locale (supabase start + db reset). Senza locale i test si saltano;
   con ORC_RLS=1 il locale è obbligatorio e la sua assenza è un fallimento. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env
  ? test
  : process.env.ORC_RLS
    ? (name) => test(name, () => { throw new Error("Supabase locale spento (ORC_RLS=1 lo pretende)"); })
    : test.skip;
const stamp = Date.now().toString(36);
const mail = (n) => `orc-test-${n}-${stamp}@example.invalid`;

const U = {}; // id per nome
const T = {}; // token per nome
let ORG_A, ORG_B;

run("preparazione: utenti di prova e due organizzazioni via service_role", async () => {
  for (const n of ["ownerA", "adminA", "viewerA", "estraneo", "ownerB"]) {
    U[n] = await mkUser(env, mail(n), undefined, { full_name: "Utente " + n });
    T[n] = await login(env, mail(n));
  }
  const a = await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Org A di prova", org_slug: "org-a-" + stamp, owner_email: mail("ownerA") });
  assert.ok(a.ok, JSON.stringify(a.d)); ORG_A = a.d;
  const b = await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Org B di prova", org_slug: "org-b-" + stamp, owner_email: mail("ownerB") });
  assert.ok(b.ok, JSON.stringify(b.d)); ORG_B = b.d;
  const add1 = await rpc(env, T.ownerA, "orc_add_member_by_email", { org: ORG_A, member_email: mail("adminA"), new_role: "admin" });
  assert.ok(add1.ok, JSON.stringify(add1.d));
  const add2 = await rpc(env, T.ownerA, "orc_add_member_by_email", { org: ORG_A, member_email: mail("viewerA"), new_role: "viewer" });
  assert.ok(add2.ok, JSON.stringify(add2.d));
});

run("orc_ensure_profile crea il profilo dal JWT e non sovrascrive un nome scelto", async () => {
  const p = await rpc(env, T.estraneo, "orc_ensure_profile", {});
  assert.ok(p.ok, JSON.stringify(p.d));
  assert.equal(p.d.display_name, "Utente estraneo");
  const upd = await rest(env, T.estraneo, "orc_profiles?id=eq." + U.estraneo, { method: "PATCH", body: { display_name: "Rinominato" } });
  assert.ok(upd.ok, JSON.stringify(upd.d));
  const again = await rpc(env, T.estraneo, "orc_ensure_profile", {});
  assert.equal(again.d.display_name, "Rinominato");
});

run("E.1 — un utente legge solo il proprio profilo", async () => {
  await rpc(env, T.ownerA, "orc_ensure_profile", {});
  const r = await rest(env, T.estraneo, "orc_profiles?select=id");
  assert.ok(r.ok);
  assert.deepEqual(r.d.map((x) => x.id), [U.estraneo]);
  const altrui = await rest(env, T.estraneo, "orc_profiles?id=eq." + U.ownerA, { method: "PATCH", body: { display_name: "Hackerato" } });
  assert.ok(!altrui.ok || altrui.d.length === 0, "non modifica il profilo di un altro");
});

run("E.4 — nessuno si dà un ruolo da solo: insert e update diretti negati, RPC negata", async () => {
  const ins = await rest(env, T.estraneo, "orc_memberships", { method: "POST", body: { org_id: ORG_A, user_id: U.estraneo, role: "owner" } });
  assert.equal(ins.ok, false, "insert diretto bloccato: " + ins.status);
  const upd = await rest(env, T.viewerA, "orc_memberships?org_id=eq." + ORG_A + "&user_id=eq." + U.viewerA, { method: "PATCH", body: { role: "owner" } });
  assert.ok(!upd.ok || (Array.isArray(upd.d) && upd.d.length === 0), "update diretto: nessuna riga toccata");
  const mine = await rpc(env, T.viewerA, "orc_my_memberships", {});
  assert.equal(mine.d[0].role, "viewer");
  const viaRpc = await rpc(env, T.viewerA, "orc_set_member_role", { org: ORG_A, target: U.viewerA, new_role: "admin" });
  assert.equal(viaRpc.ok, false, "la RPC rifiuta chi non è owner/admin");
  const del = await rest(env, T.viewerA, "orc_memberships?org_id=eq." + ORG_A + "&user_id=eq." + U.ownerA, { method: "DELETE" });
  assert.ok(!del.ok || (Array.isArray(del.d) && del.d.length === 0), "delete diretto: nessuna riga toccata");
});

run("E.3 — chi amministra A non vede B; l'estraneo non vede niente", async () => {
  const orgs = await rest(env, T.ownerA, "orc_organizations?select=id");
  assert.deepEqual(orgs.d.map((x) => x.id), [ORG_A]);
  const memB = await rest(env, T.ownerA, "orc_memberships?org_id=eq." + ORG_B);
  assert.deepEqual(memB.d, []);
  const nulla = await rest(env, T.estraneo, "orc_organizations?select=id");
  assert.deepEqual(nulla.d, []);
  const cross = await rpc(env, T.ownerA, "orc_add_member_by_email", { org: ORG_B, member_email: mail("estraneo"), new_role: "viewer" });
  assert.equal(cross.ok, false, "non si aggiungono membri a un'org estranea");
  const membersB = await rpc(env, T.ownerA, "orc_org_members", { org: ORG_B });
  assert.deepEqual(membersB.d, [], "l'elenco membri di B è vuoto per lo staff di A");
  const ren = await rest(env, T.ownerA, "orc_organizations?id=eq." + ORG_B, { method: "PATCH", body: { name: "Rubata" } });
  assert.ok(!ren.ok || ren.d.length === 0, "non rinomina un'org estranea");
});

run("ruoli: l'admin non tocca l'owner, l'ultimo owner resta, il viewer vede solo se stesso", async () => {
  const demote = await rpc(env, T.adminA, "orc_set_member_role", { org: ORG_A, target: U.ownerA, new_role: "viewer" });
  assert.equal(demote.ok, false, "un admin non degrada l'owner");
  const self = await rpc(env, T.ownerA, "orc_set_member_role", { org: ORG_A, target: U.ownerA, new_role: "admin" });
  assert.equal(self.ok, false, "l'ultimo owner non si degrada");
  const ok = await rpc(env, T.adminA, "orc_set_member_role", { org: ORG_A, target: U.viewerA, new_role: "section" });
  assert.ok(ok.ok, JSON.stringify(ok.d));
  const seen = await rest(env, T.viewerA, "orc_memberships?select=user_id");
  assert.deepEqual(seen.d.map((x) => x.user_id), [U.viewerA], "un non-staff vede solo la propria riga");
  const list = await rpc(env, T.viewerA, "orc_org_members", { org: ORG_A });
  assert.deepEqual(list.d, [], "un non-staff non ha l'elenco membri");
  const staffSees = await rpc(env, T.adminA, "orc_org_members", { org: ORG_A });
  assert.equal(staffSees.d.length, 3);
  assert.ok(staffSees.d.every((m) => typeof m.email === "string" && m.email.includes("@")), "lo staff vede le email");
  assert.equal(staffSees.d.find((m) => m.user_id === U.viewerA).role, "section");
  const audit = await rest(env, T.ownerA, "orc_audit_log?org_id=eq." + ORG_A + "&select=action");
  assert.ok(audit.d.some((x) => x.action === "membership.role"));
  const auditNo = await rest(env, T.viewerA, "orc_audit_log?org_id=eq." + ORG_A);
  assert.deepEqual(auditNo.d, []);
  const auditIns = await rest(env, T.ownerA, "orc_audit_log", { method: "POST", body: { org_id: ORG_A, action: "finta", entity: "x" } });
  assert.equal(auditIns.ok, false, "il registro non si scrive dal client");
});

run("il bootstrap è riservato al service_role; i cataloghi si leggono, non si scrivono", async () => {
  const boot = await rpc(env, T.ownerA, "orc_bootstrap_org", { org_name: "Furba", org_slug: "furba-" + stamp, owner_email: mail("ownerA") });
  assert.equal(boot.ok, false);
  const anon = await rest(env, env.ANON_KEY, "orc_instruments?select=code");
  assert.ok(!anon.ok || anon.d.length === 0, "anon non legge i cataloghi");
  const anonOrg = await rest(env, env.ANON_KEY, "orc_organizations?select=id");
  assert.ok(!anonOrg.ok || anonOrg.d.length === 0, "anon non legge le organizzazioni");
  const inst = await rest(env, T.viewerA, "orc_instruments?select=code&family=eq.archi");
  assert.ok(inst.d.length >= 5, JSON.stringify(inst.d));
  const w = await rest(env, T.ownerA, "orc_instruments", { method: "POST", body: { code: "kazoo", name: "Kazoo", family: "legni" } });
  assert.equal(w.ok, false);
});
