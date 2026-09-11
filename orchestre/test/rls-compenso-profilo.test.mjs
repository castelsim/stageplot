/* Due decisioni del collaudo a tre profili (11/09).
   · Il compenso per ruolo: la violinista leggeva anche il cachet del violoncello, perché il compenso era un
     campo solo per tutta la produzione. Ora ognuno legge quello del SUO ruolo (e quello comune solo se il
     ruolo non ne ha uno), e creando l'evento da una richiesta il compenso arriva dal preventivo.
   · Il profilo che arriva alla scheda: quello che il musicista cambia lo vede anche la società — solo i
     campi che ha cambiato lui, e mai nome ed email. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-comp-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG, VL, VC, PID, R_VL, R_VC, PROF_VL;

run("preparazione: la società, una violinista e un violoncellista con account e profilo, una produzione a due ruoli", async () => {
  for (const n of ["owner", "vl", "vc", "cliente"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Comp A", org_slug: "comp-a-" + stamp, owner_email: mail("owner") })).d;
  assert.ok(ORG);
  assert.ok((await rpc(env, T.owner, "orc_import_musicians", { org: ORG, rows: [
    { first_name: "Vi", last_name: "Olino", email: mail("vl"), city: "Vicenza", phone: "111", instruments: [{ code: "violino", primary: true, level: 4 }] },
    { first_name: "Vio", last_name: "Loncello", email: mail("vc"), instruments: [{ code: "violoncello", primary: true, level: 4 }] }] })).ok);
  const list = (await rpc(env, T.owner, "orc_musicians_list", { org: ORG })).d;
  VL = list.find((m) => m.last_name === "Olino").id; VC = list.find((m) => m.last_name === "Loncello").id;
  for (const [n, mid] of [["vl", VL], ["vc", VC]]) {
    const pr = await rest(env, admin(env), "orc_musician_profiles", { method: "POST", body: { user_id: U[n], first_name: "P" + n, last_name: "Profilo", city: "Vicenza", phone: "111", consent_requests: true } });
    assert.ok(pr.ok, JSON.stringify(pr.d));
    if (n === "vl") PROF_VL = pr.d[0].id;
    assert.ok((await rest(env, admin(env), "orc_musicians?id=eq." + mid, { method: "PATCH", body: { profile_id: pr.d[0].id } })).ok);
    assert.equal((await rpc(env, T[n], "orc_link_my_musician_rows", {})).d, 1);
  }
  PID = (await rest(env, T.owner, "orc_productions", { method: "POST", body: { org_id: ORG, title: "Comp " + stamp, status: "planning", fee_note: "rimborso viaggio per tutti" } })).d[0].id;
  R_VL = (await rest(env, T.owner, "orc_staffing_roles", { method: "POST", body: { production_id: PID, instrument_code: "violino", name: "Violino", seats: 1, fee_note: "250 € a persona" } })).d[0].id;
  R_VC = (await rest(env, T.owner, "orc_staffing_roles", { method: "POST", body: { production_id: PID, instrument_code: "violoncello", name: "Violoncello", seats: 1 } })).d[0].id;
  for (const [r, m] of [[R_VL, VL], [R_VC, VC]]) assert.equal((await rpc(env, T.owner, "orc_invite", { production: PID, role: r, musicians: [m] })).d, 1);
  await rest(env, admin(env), "orc_invitations?production_id=eq." + PID, { method: "PATCH", body: { status: "sent" } });
});

run("ognuno legge il compenso del suo ruolo, mai quello degli altri — nell'area e dal link", async () => {
  const vl = (await rpc(env, T.vl, "orc_my_invitations", {})).d;
  const vc = (await rpc(env, T.vc, "orc_my_invitations", {})).d;
  assert.equal(vl[0].fee_note, "250 € a persona", "la violinista legge il compenso del violino");
  assert.equal(vc[0].fee_note, "rimborso viaggio per tutti", "il violoncello non ha un compenso suo: legge quello comune");
  assert.equal(JSON.stringify(vc).includes("250"), false, "e non vede quello del violino");
  /* la pagina del link: la funzione la chiama solo il servizio, con l'impronta del token */
  for (const [r, atteso] of [[R_VL, "250 € a persona"], [R_VC, "rimborso viaggio per tutti"]]) {
    const inv = (await rest(env, admin(env), "orc_invitations?select=id&role_id=eq." + r)).d[0].id;
    const tok = (await rest(env, admin(env), "orc_invitation_secrets?select=token&invitation_id=eq." + inv)).d[0].token;
    const h = createHash("sha256").update(tok).digest("hex");
    const o = await rpc(env, admin(env), "orc_invitation_open", { token_hash_in: h });
    assert.ok(o.ok, JSON.stringify(o.d));
    assert.equal(o.d.production.fee_note, atteso, "dal link: " + JSON.stringify(o.d.production));
  }
});

run("creando l'evento da una richiesta, il compenso di ogni ruolo arriva dal preventivo", async () => {
  const req = (await rest(env, admin(env), "orc_client_requests", { method: "POST", body: { org_id: ORG, user_id: U.cliente, contact_name: "Cli", contact_email: mail("cliente"), event_title: "Serata " + stamp } })).d[0].id;
  assert.ok((await rest(env, admin(env), "orc_client_request_slots", { method: "POST", body: [
    { request_id: req, label: "Violino", instrument_code: "violino", qty: 2, covered: false, sort: 1 },
    { request_id: req, label: "Violoncello", instrument_code: "violoncello", qty: 1, covered: false, sort: 2 }] })).ok);
  const q = await rpc(env, T.owner, "orc_quote_save", { request: req, margin: 20, vat: 22, description: "Trio", notes: "",
    lines: [{ label: "Violino", qty: 2, fee_cents: 25000 }, { label: "Violoncello", qty: 1, fee_cents: 28050 }] });
  assert.ok(q.ok, JSON.stringify(q.d));
  assert.ok((await rpc(env, T.owner, "orc_quote_send", { quote: q.d })).ok);
  assert.ok((await rpc(env, T.cliente, "orc_quote_answer", { quote: q.d, accept: true })).ok);
  const p = await rpc(env, T.owner, "orc_production_from_request", { req });
  assert.ok(p.ok, JSON.stringify(p.d));
  const ruoli = (await rest(env, admin(env), "orc_staffing_roles?select=name,fee_note&production_id=eq." + p.d + "&order=sort")).d;
  assert.deepEqual(ruoli.map((r) => [r.name, r.fee_note]), [["Violino", "250,00 € a persona"], ["Violoncello", "280,50 € a persona"]]);
});

run("formazione da definire: i ruoli nascono dalle righe del preventivo, ognuno col suo cachet", async () => {
  const req = (await rest(env, admin(env), "orc_client_requests", { method: "POST", body: { org_id: ORG, user_id: U.cliente, contact_name: "Cli", contact_email: mail("cliente"), event_title: "Libera " + stamp, formation_unknown: true } })).d[0].id;
  const q = await rpc(env, T.owner, "orc_quote_save", { request: req, margin: 20, vat: 22, description: "Quartetto", notes: "",
    lines: [{ label: "Archi", qty: 4, fee_cents: 20000 }, { label: "Direzione", qty: 1, fee_cents: 0 }] });
  assert.ok(q.ok, JSON.stringify(q.d));
  assert.ok((await rpc(env, T.owner, "orc_quote_send", { quote: q.d })).ok);
  assert.ok((await rpc(env, T.cliente, "orc_quote_answer", { quote: q.d, accept: true })).ok);
  const p = await rpc(env, T.owner, "orc_production_from_request", { req });
  assert.ok(p.ok, JSON.stringify(p.d));
  const ruoli = (await rest(env, admin(env), "orc_staffing_roles?select=name,fee_note&production_id=eq." + p.d + "&order=sort")).d;
  assert.deepEqual(ruoli.map((r) => [r.name, r.fee_note]), [["Archi", "200,00 € a persona"], ["Direzione", ""]], "senza cachet nella riga, niente compenso inventato");
});

run("quello che il musicista cambia arriva alla scheda: solo i campi cambiati, mai nome ed email", async () => {
  /* lo staff corregge il telefono nella sua scheda */
  assert.ok((await rest(env, T.owner, "orc_musicians?id=eq." + VL, { method: "PATCH", body: { phone: "999 staff" } })).ok);
  /* la violinista cambia città e parti, e prova anche a cambiare nome ed email nel suo profilo */
  const up = await rest(env, T.vl, "orc_musician_profiles?id=eq." + PROF_VL, { method: "PATCH", body: { city: "Bergamo", province: "BG", parts: ["tutti", "solo"], first_name: "Altro", email: "altra@example.invalid" } });
  assert.ok(up.ok, JSON.stringify(up.d));
  const m = (await rest(env, T.owner, "orc_musicians?select=city,province,parts,phone,first_name,email&id=eq." + VL)).d[0];
  assert.equal(m.city, "Bergamo"); assert.equal(m.province, "BG"); assert.deepEqual(m.parts, ["tutti", "solo"]);
  assert.equal(m.phone, "999 staff", "il telefono non l'ha toccato lei: resta la correzione dello staff");
  assert.equal(m.first_name, "Vi", "il nome non passa: lo tiene lo staff");
  assert.equal(m.email, mail("vl"), "l'email nemmeno: è il collegamento all'account");
  /* e l'altro musicista non cambia */
  const altro = (await rest(env, T.owner, "orc_musicians?select=city&id=eq." + VC)).d[0];
  assert.notEqual(altro.city, "Bergamo");
});

run("il trigger non si chiama da fuori, e un profilo non tocca la scheda di un altro", async () => {
  assert.equal((await rpc(env, T.vl, "orc_profile_to_musicians", {})).ok, false);
  const hack = await rest(env, T.vc, "orc_musician_profiles?id=eq." + PROF_VL, { method: "PATCH", body: { city: "Hackerville" } });
  assert.ok(!hack.ok || hack.d.length === 0);
  const m = (await rest(env, T.owner, "orc_musicians?select=city&id=eq." + VL)).d[0];
  assert.equal(m.city, "Bergamo", "la scheda della violinista resta sua");
});
