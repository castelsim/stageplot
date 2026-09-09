/* Scenario E + flusso completo delle convocazioni (lotto 5), contro il Supabase locale.
   Il «worker» e la «porta del musicista» sono simulati chiamando le RPC riservate con la service_role,
   esattamente come fanno le Edge Function. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "i" + Date.now().toString(36);
const mail = (n) => `orc-inv-${n}-${stamp}@example.invalid`;
const sha = (t) => createHash("sha256").update(t).digest("hex");
const U = {}, T = {};
let ORG_A, ORG_B, PID, ROLE, M1, M2, M3, INV1, INV2, TOK1, DATE1, DATE2;

run("preparazione: org, tre violinisti, produzione con due date e un ruolo da 2 posti", async () => {
  for (const n of ["ownerA", "ownerB", "viewerA"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG_A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Inv A", org_slug: "inv-a-" + stamp, owner_email: mail("ownerA") })).d;
  ORG_B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Inv B", org_slug: "inv-b-" + stamp, owner_email: mail("ownerB") })).d;
  assert.ok((await rpc(env, T.ownerA, "orc_add_member_by_email", { org: ORG_A, member_email: mail("viewerA"), new_role: "viewer" })).ok);
  const imp = await rpc(env, T.ownerA, "orc_import_musicians", { org: ORG_A, rows: [1, 2, 3].map((k) => ({ first_name: "Musicista", last_name: "N" + k, email: `m${k}-${stamp}@example.invalid`, instruments: [{ code: "violino", primary: true }] })) });
  assert.equal(imp.d.new, 3);
  const list = (await rpc(env, T.ownerA, "orc_musicians_list", { org: ORG_A })).d;
  [M1, M2, M3] = ["N1", "N2", "N3"].map((n) => list.find((m) => m.last_name === n).id);
  PID = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Convocazione di prova", status: "planning", fee_note: "cachet standard" } })).d[0].id;
  DATE1 = (await rest(env, T.ownerA, "orc_production_dates", { method: "POST", body: { production_id: PID, kind: "rehearsal", starts_at: "2026-11-10T15:00:00+01:00", ends_at: "2026-11-10T19:00:00+01:00" } })).d[0].id;
  DATE2 = (await rest(env, T.ownerA, "orc_production_dates", { method: "POST", body: { production_id: PID, kind: "concert", starts_at: "2026-11-11T21:00:00+01:00" } })).d[0].id;
  ROLE = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: PID, instrument_code: "violino", name: "Violini", seats: 2 } })).d[0].id;
});

run("invitare: solo lo staff; un invito vivo per (ruolo, musicista); il token in chiaro non è leggibile dal client", async () => {
  const v = await rpc(env, T.viewerA, "orc_invite", { production: PID, role: ROLE, musicians: [M1] });
  assert.equal(v.ok, false, "un viewer non invita");
  const b = await rpc(env, T.ownerB, "orc_invite", { production: PID, role: ROLE, musicians: [M1] });
  assert.equal(b.ok, false, "l'altra org non invita");
  const n = await rpc(env, T.ownerA, "orc_invite", { production: PID, role: ROLE, musicians: [M1, M2], deadline: "2030-01-01T00:00:00Z", note: "prove obbligatorie" });
  assert.ok(n.ok, JSON.stringify(n.d)); assert.equal(n.d, 2);
  const again = await rpc(env, T.ownerA, "orc_invite", { production: PID, role: ROLE, musicians: [M1, M3] });
  assert.equal(again.d, 1, "M1 ha già un invito vivo: se ne crea uno solo, per M3");
  const rows = (await rpc(env, T.ownerA, "orc_invitations_list", { production: PID })).d;
  assert.equal(rows.length, 3);
  INV1 = rows.find((r) => r.musician_id === M1); INV2 = rows.find((r) => r.musician_id === M2);
  assert.equal(INV1.status, "draft"); assert.equal(INV1.notification_status, "pending"); assert.equal(Number(INV1.dates_total), 2);
  assert.equal(rows.find((r) => r.musician_id === M3).wave, 2, "la seconda chiamata è la seconda onda");
  const secretsClient = await rest(env, T.ownerA, "orc_invitation_secrets?select=token");
  assert.ok(!secretsClient.ok || secretsClient.d.length === 0, "lo staff non legge i token: " + secretsClient.status);
  const secretsAnon = await rest(env, env.ANON_KEY, "orc_invitation_secrets?select=token");
  assert.ok(!secretsAnon.ok || secretsAnon.d.length === 0, "anon nemmeno");
  const invB = await rest(env, T.ownerB, "orc_invitations?select=id&production_id=eq." + PID);
  assert.ok(!invB.ok || invB.d.length === 0, "B non vede gli inviti di A");
  const direct = await rest(env, T.ownerA, "orc_invitations?id=eq." + INV1.id, { method: "PATCH", body: { status: "available" } });
  assert.ok(!direct.ok || direct.d.length === 0, "lo stato non si scrive a mano");
});

run("il worker (service_role): legge il token, «spedisce», cancella il segreto; l'invito passa a inviato", async () => {
  const sec = await rest(env, admin(env), "orc_invitation_secrets?select=invitation_id,token&invitation_id=eq." + INV1.id);
  assert.ok(sec.ok && sec.d.length === 1, JSON.stringify(sec.d));
  TOK1 = sec.d[0].token;
  assert.match(TOK1, /^[0-9a-f]{48}$/);
  const inv = (await rest(env, admin(env), "orc_invitations?select=token_hash&id=eq." + INV1.id)).d[0];
  assert.equal(inv.token_hash, sha(TOK1), "nel DB c'è lo sha-256 del token");
  /* come fa orc-notify dopo Resend */
  assert.ok((await rest(env, admin(env), "orc_invitations?id=eq." + INV1.id, { method: "PATCH", body: { status: "sent", sent_at: new Date().toISOString(), notification_status: "sent" } })).ok);
  assert.ok((await rest(env, admin(env), "orc_invitation_secrets?invitation_id=eq." + INV1.id, { method: "DELETE" })).ok);
  const gone = await rest(env, admin(env), "orc_invitation_secrets?select=token&invitation_id=eq." + INV1.id);
  assert.deepEqual(gone.d, [], "il segreto sparisce dopo la spedizione");
});

run("il musicista (service_role via orc-respond): apre il link, risponde parziale, poi cambia idea", async () => {
  const open = await rpc(env, admin(env), "orc_invitation_open", { token_hash_in: sha(TOK1) });
  assert.ok(open.ok, JSON.stringify(open.d));
  assert.equal(open.d.mode, "write"); assert.equal(open.d.status, "viewed");
  assert.equal(open.d.production.title, "Convocazione di prova"); assert.equal(open.d.role.name, "Violini");
  assert.equal(open.d.dates.length, 2); assert.equal(open.d.production.fee_note, "cachet standard");
  assert.equal(open.d.note_admin, "prove obbligatorie");
  assert.equal(JSON.stringify(open.d).includes("token"), false, "il pacchetto non contiene token");
  const bad = await rpc(env, admin(env), "orc_invitation_open", { token_hash_in: sha("non-esiste") });
  assert.equal(bad.d.error, "not_found");
  const partial = await rpc(env, admin(env), "orc_respond", { token_hash_in: sha(TOK1), answer: "partial", dates: [{ id: DATE1, available: true }, { id: DATE2, available: false }], note: "solo la prova" });
  assert.equal(partial.d.status, "partial");
  const yes = await rpc(env, admin(env), "orc_respond", { token_hash_in: sha(TOK1), answer: "yes", note: "ci sono" });
  assert.equal(yes.d.status, "available");
  const row = (await rpc(env, T.ownerA, "orc_invitations_list", { production: PID })).d.find((r) => r.id === INV1.id);
  assert.equal(row.status, "available"); assert.equal(Number(row.dates_yes), 2); assert.equal(row.note_musician, "ci sono");
  const ev = (await rest(env, T.ownerA, "orc_invitation_events?select=event,actor&invitation_id=eq." + INV1.id + "&order=at")).d.map((e) => e.event);
  assert.deepEqual(ev, ["created", "viewed", "responded", "responded"]);
  const evEdit = await rest(env, T.ownerA, "orc_invitation_events?invitation_id=eq." + INV1.id, { method: "DELETE" });
  assert.ok(!evEdit.ok || evEdit.d.length === 0, "la storia degli inviti non si cancella");
});

run("lo staff conferma: il posto si assegna con la stessa RPC dei posti; riserva, promemoria, revoca, annulla", async () => {
  const noViewer = await rpc(env, T.viewerA, "orc_invitation_action", { invitation: INV1.id, action: "confirm" });
  assert.equal(noViewer.ok, false);
  const early = await rpc(env, T.ownerA, "orc_invitation_action", { invitation: INV2.id, action: "confirm" });
  assert.equal(early.ok, false, "non si conferma chi non ha risposto");
  const c = await rpc(env, T.ownerA, "orc_invitation_action", { invitation: INV1.id, action: "confirm" });
  assert.ok(c.ok, JSON.stringify(c.d));
  const slots = (await rest(env, T.ownerA, "orc_staffing_slots?select=seat_no,status,musician_id&role_id=eq." + ROLE + "&order=seat_no")).d;
  assert.equal(slots[0].status, "confirmed"); assert.equal(slots[0].musician_id, M1); assert.equal(slots[1].status, "open");
  const evSlot = (await rest(env, T.ownerA, "orc_slot_events?select=event,reason&production_id=eq." + PID)).d;
  assert.ok(evSlot.some((e) => e.event === "confirmed" && /convocazione/.test(e.reason)));
  const row1 = (await rpc(env, T.ownerA, "orc_invitations_list", { production: PID })).d.find((r) => r.id === INV1.id);
  assert.equal(row1.status, "confirmed"); assert.equal(row1.slot_seat, 1);
  const locked = await rpc(env, admin(env), "orc_invitation_open", { token_hash_in: sha(TOK1) });
  assert.equal(locked.d.mode, "locked", "dopo la conferma il musicista non cambia più da solo");
  const noChange = await rpc(env, admin(env), "orc_respond", { token_hash_in: sha(TOK1), answer: "no" });
  assert.equal(noChange.d.error, "locked");
  /* promemoria a chi non ha risposto: nuovo token, il vecchio muore */
  await rest(env, admin(env), "orc_invitations?id=eq." + INV2.id, { method: "PATCH", body: { status: "sent", notification_status: "sent" } });
  const oldHash = (await rest(env, admin(env), "orc_invitations?select=token_hash&id=eq." + INV2.id)).d[0].token_hash;
  const rem = await rpc(env, T.ownerA, "orc_invitation_action", { invitation: INV2.id, action: "remind" });
  assert.ok(rem.ok, JSON.stringify(rem.d));
  const after = (await rest(env, admin(env), "orc_invitations?select=token_hash,notification_kind,notification_status&id=eq." + INV2.id)).d[0];
  assert.notEqual(after.token_hash, oldHash); assert.equal(after.notification_kind, "reminder"); assert.equal(after.notification_status, "pending");
  assert.equal((await rpc(env, admin(env), "orc_invitation_open", { token_hash_in: oldHash })).d.error, "not_found", "il vecchio link non vale più");
  /* revoca della conferma: il posto torna scoperto, la storia resta */
  const rv = await rpc(env, T.ownerA, "orc_invitation_action", { invitation: INV1.id, action: "revoke", reason: "cambio di programma" });
  assert.ok(rv.ok, JSON.stringify(rv.d));
  const slotsAfter = (await rest(env, T.ownerA, "orc_staffing_slots?select=status&role_id=eq." + ROLE + "&order=seat_no")).d;
  assert.deepEqual(slotsAfter.map((s) => s.status), ["open", "open"]);
  const evSlot2 = (await rest(env, T.ownerA, "orc_slot_events?select=event&production_id=eq." + PID + "&order=at")).d.map((e) => e.event);
  assert.deepEqual(evSlot2, ["confirmed", "revoked"]);
  const cancel = await rpc(env, T.ownerA, "orc_invitation_action", { invitation: INV2.id, action: "cancel" });
  assert.ok(cancel.ok);
  assert.deepEqual((await rest(env, admin(env), "orc_invitation_secrets?select=token&invitation_id=eq." + INV2.id)).d, [], "annullare cancella anche il segreto");
});

run("le scadenze: chi non risponde entro la data limite passa a «nessuna risposta»", async () => {
  const n = await rpc(env, T.ownerA, "orc_invite", { production: PID, role: ROLE, musicians: [M2], deadline: "2020-01-01T00:00:00Z" });
  assert.equal(n.d, 1);
  const id = (await rpc(env, T.ownerA, "orc_invitations_list", { production: PID })).d.find((r) => r.musician_id === M2 && r.status === "draft").id;
  await rest(env, admin(env), "orc_invitations?id=eq." + id, { method: "PATCH", body: { status: "sent", notification_status: "sent" } });
  const clientExpire = await rpc(env, T.ownerA, "orc_expire_invitations", {});
  assert.equal(clientExpire.ok, false, "la scadenza la fa solo il worker");
  const x = await rpc(env, admin(env), "orc_expire_invitations", {});
  assert.ok(x.ok); assert.ok(Number(x.d) >= 1);
  const st = (await rpc(env, T.ownerA, "orc_invitations_list", { production: PID })).d.find((r) => r.id === id).status;
  assert.equal(st, "no_reply");
  const tok = (await rest(env, admin(env), "orc_invitation_secrets?select=token&invitation_id=eq." + id)).d[0]?.token;
  if (tok) assert.equal((await rpc(env, admin(env), "orc_invitation_open", { token_hash_in: sha(tok) })).d.mode, "expired");
});
