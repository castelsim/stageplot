/* Le correzioni del collaudo a tre profili (11/09) che toccano il database.
   · Il consenso alle convocazioni: l'informativa promette che le proposte arrivano solo a chi le ha
     scelte. Chi ha un profilo e ha il consenso spento non si convoca, e il matching lo sa.
   · Il committente legge lo stato vero della sua richiesta e quali posti ha chiesto. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-coll-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG, SI, NO, MANO, PID, ROLE, REQ;

run("preparazione: la società, due musicisti con profilo (uno senza consenso), uno inserito a mano, un cliente", async () => {
  for (const n of ["owner", "si", "no", "cliente"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Coll A", org_slug: "coll-a-" + stamp, owner_email: mail("owner") })).d;
  assert.ok(ORG);
  const imp = await rpc(env, T.owner, "orc_import_musicians", { org: ORG, rows: [
    { first_name: "Sì", last_name: "Consenso", email: mail("si"), instruments: [{ code: "violino", primary: true, level: 4 }] },
    { first_name: "No", last_name: "Consenso", email: mail("no"), instruments: [{ code: "violino", primary: true, level: 4 }] },
    { first_name: "A", last_name: "Mano", email: mail("mano"), instruments: [{ code: "violino", primary: true, level: 4 }] }] });
  assert.ok(imp.ok && imp.d.new === 3, JSON.stringify(imp.d));
  const list = (await rpc(env, T.owner, "orc_musicians_list", { org: ORG })).d;
  SI = list.find((m) => m.first_name === "Sì").id; NO = list.find((m) => m.first_name === "No").id; MANO = list.find((m) => m.last_name === "Mano").id;
  for (const [n, mid, consenso] of [["si", SI, true], ["no", NO, false]]) {
    const pr = await rest(env, admin(env), "orc_musician_profiles", { method: "POST", body: { user_id: U[n], first_name: n, last_name: "Consenso", consent_requests: consenso } });
    assert.ok(pr.ok, JSON.stringify(pr.d));
    assert.ok((await rest(env, admin(env), "orc_musicians?id=eq." + mid, { method: "PATCH", body: { profile_id: pr.d[0].id } })).ok);
  }
  PID = (await rest(env, T.owner, "orc_productions", { method: "POST", body: { org_id: ORG, title: "Collaudo " + stamp, status: "planning" } })).d[0].id;
  ROLE = (await rest(env, T.owner, "orc_staffing_roles", { method: "POST", body: { production_id: PID, instrument_code: "violino", name: "Violini", seats: 3 } })).d[0].id;
});

run("chi ha scelto di non ricevere proposte non si convoca; chi le accetta e chi è inserito a mano sì", async () => {
  const n = await rpc(env, T.owner, "orc_invite", { production: PID, role: ROLE, musicians: [SI, NO, MANO] });
  assert.ok(n.ok, JSON.stringify(n.d));
  assert.equal(n.d, 2, "due convocazioni su tre");
  const chi = (await rest(env, admin(env), "orc_invitations?select=musician_id&role_id=eq." + ROLE)).d.map((r) => r.musician_id).sort();
  assert.deepEqual(chi, [SI, MANO].sort(), "non c'è quella di chi ha detto no alle proposte");
});

run("il matching sa chi non vuole proposte, e il perché arriva al motore", async () => {
  const r = await rpc(env, T.owner, "orc_matching_candidates", { production: PID, role: ROLE });
  assert.ok(r.ok, JSON.stringify(r.d));
  const per = Object.fromEntries(r.d.candidates.map((c) => [c.id, c.no_requests]));
  assert.equal(per[NO], true); assert.equal(per[SI], false); assert.equal(per[MANO], false, "senza profilo vale l'accordo con la società");
});

run("il committente legge lo stato vero e i posti che ha chiesto — e solo le sue richieste", async () => {
  const r = await rest(env, admin(env), "orc_client_requests", { method: "POST", body: {
    org_id: ORG, user_id: U.cliente, contact_name: "Cli", contact_email: mail("cliente"), event_title: "Serata " + stamp } });
  assert.ok(r.ok, JSON.stringify(r.d)); REQ = r.d[0].id;
  assert.ok((await rest(env, admin(env), "orc_client_request_slots", { method: "POST", body: [
    { request_id: REQ, label: "Violino", instrument_code: "violino", qty: 2, covered: false, sort: 1 },
    { request_id: REQ, label: "Pianoforte", instrument_code: "pianoforte", qty: 1, covered: true, sort: 2 },
    { request_id: REQ, label: "Violoncello", instrument_code: "violoncello", qty: 1, covered: false, sort: 3 }] })).ok);
  const prima = (await rpc(env, T.cliente, "orc_my_client_requests", {})).d.find((x) => x.id === REQ);
  assert.equal(prima.status, "ricevuta");
  assert.equal(prima.slots_summary, "Violino ×2, Violoncello", "i posti chiesti, senza quello che copre lui");
  for (const [grezzo, letto] of [["won", "accettata"], ["lost", "non andata"], ["closed", "chiusa"], ["quoted", "in lavorazione"]]) {
    assert.ok((await rest(env, admin(env), "orc_client_requests?id=eq." + REQ, { method: "PATCH", body: { status: grezzo } })).ok);
    const x = (await rpc(env, T.cliente, "orc_my_client_requests", {})).d.find((y) => y.id === REQ);
    assert.equal(x.status, letto, grezzo + " → " + letto);
  }
  assert.deepEqual((await rpc(env, T.si, "orc_my_client_requests", {})).d, [], "un altro utente non vede le richieste altrui");
  assert.equal((await rpc(env, env.ANON_KEY, "orc_my_client_requests", {})).ok, false, "e da anonimo la funzione non si chiama");
});
