/* Lotto B (migrazione 0087): link di convocazione copiabili dallo staff e «riserva» chiesta dal musicista.
   Girano solo con Supabase locale (`supabase start`, `supabase db reset`). Dati inventati, @example.invalid.
   · il link nuovo lo fa solo lo staff, solo su inviti partiti e aperti; il vecchio smette di valere e il segreto non resta;
   · «solo se manca qualcuno» lo scrivono solo le funzioni previste, ogni risposta normale lo azzera;
   · ogni «negato» ha il suo controllo positivo col titolare. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-lnk-${n}-${stamp}@example.invalid`;
const U = {}, T = {}, D = {};
const h = (t) => createHash("sha256").update(t).digest("hex");
const open = (tok) => rpc(env, admin(env), "orc_invitation_open", { token_hash_in: h(tok) });
const secret = async () => (await rest(env, admin(env), "orc_invitation_secrets?select=token&invitation_id=eq." + D.INV)).d;
const stato = async () => (await rest(env, admin(env), "orc_invitations?select=status,reserve_only,token_hash&id=eq." + D.INV)).d[0];

run("preparazione: due organizzazioni, un musicista con account, una produzione, un invito", async () => {
  for (const n of ["ownerA", "ownerB", "musicista"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  T.anon = env.ANON_KEY;
  D.A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Lnk A", org_slug: "lnk-a-" + stamp, owner_email: mail("ownerA") })).d;
  D.B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Lnk B", org_slug: "lnk-b-" + stamp, owner_email: mail("ownerB") })).d;
  assert.ok((await rpc(env, T.ownerA, "orc_import_musicians", { org: D.A, rows: [{ first_name: "Mu", last_name: "Sico", email: mail("musicista"), instruments: [{ code: "violino", primary: true }] }] })).ok);
  D.M = (await rpc(env, T.ownerA, "orc_musicians_list", { org: D.A })).d[0].id;
  assert.equal((await rpc(env, T.musicista, "orc_link_my_musician_rows", {})).d, 1);
  D.P = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: D.A, title: "Lnk " + stamp, status: "planning" } })).d[0].id;
  D.R = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: D.P, instrument_code: "violino", name: "Violini", seats: 1 } })).d[0].id;
  await rest(env, T.ownerA, "orc_production_dates", { method: "POST", body: { production_id: D.P, kind: "concert", starts_at: "2027-03-10T20:00:00+01:00" } });
  assert.equal((await rpc(env, T.ownerA, "orc_invite", { production: D.P, role: D.R, musicians: [D.M], deadline: null, note: "", run: null })).d, 1);
  D.INV = (await rest(env, T.ownerA, "orc_invitations?select=id,status&production_id=eq." + D.P)).d[0].id;
  D.T0 = (await secret())[0].token;
});

run("una bozza (email non ancora partita) non si rigenera: il link non servirebbe a niente", async () => {
  const r = await rpc(env, T.ownerA, "orc_invitation_relink", { invitation: D.INV });
  assert.ok(!r.ok, "bozza rifiutata: " + JSON.stringify(r.d));
});

run("invito partito: il titolare ottiene un link nuovo; il vecchio non vale più, il nuovo sì; il segreto non resta", async () => {
  assert.ok((await rest(env, admin(env), "orc_invitations?id=eq." + D.INV, { method: "PATCH", body: { status: "sent" } })).ok);
  assert.equal((await open(D.T0)).d.mode, "write", "controllo positivo: il link di prima funzionava");
  const r = await rpc(env, T.ownerA, "orc_invitation_relink", { invitation: D.INV });
  assert.ok(r.ok && /^[0-9a-f]{48}$/.test(r.d), JSON.stringify(r.d));
  D.T1 = r.d; assert.notEqual(D.T1, D.T0);
  assert.equal((await open(D.T0)).d.error, "not_found", "il vecchio link non vale più");
  assert.equal((await open(D.T1)).d.mode, "write", "il nuovo funziona");
  assert.equal((await secret()).length, 0, "nessun token in chiaro conservato");
  assert.equal((await stato()).token_hash, h(D.T1), "nel database c'è solo l'hash del nuovo");
  const ev = await rest(env, T.ownerA, "orc_invitation_events?select=event,actor&invitation_id=eq." + D.INV + "&event=eq.link_regenerated");
  assert.deepEqual(ev.d, [{ event: "link_regenerated", actor: "staff" }]);
});

run("chi non è staff dell'organizzazione non può: altro titolare, anonimo, musicista", async () => {
  for (const tok of [T.ownerB, T.anon, T.musicista]) {
    const r = await rpc(env, tok, "orc_invitation_relink", { invitation: D.INV });
    assert.ok(!r.ok, "negato: " + JSON.stringify(r.d));
  }
  assert.equal((await open(D.T1)).d.mode, "write", "controllo positivo: il link nuovo è ancora quello");
});

run("«solo se manca qualcuno»: lo accendono solo le funzioni previste; ogni risposta normale lo spegne", async () => {
  assert.ok(!(await rpc(env, T.ownerA, "orc_mark_reserve", { token_hash_in: h(D.T1) })).ok, "il titolare non lo scrive dal client");
  assert.ok(!(await rpc(env, T.anon, "orc_mark_reserve", { token_hash_in: h(D.T1) })).ok, "l'anonimo nemmeno");
  assert.equal((await rpc(env, admin(env), "orc_respond", { token_hash_in: h(D.T1), answer: "yes", dates: {}, note: "" })).d.status, "available");
  assert.equal((await stato()).reserve_only, false);
  assert.equal((await rpc(env, admin(env), "orc_mark_reserve", { token_hash_in: h(D.T1) })).d, true);
  assert.equal((await stato()).reserve_only, true, "la Edge Function (service_role) lo accende");
  assert.equal((await rpc(env, admin(env), "orc_respond", { token_hash_in: h(D.T1), answer: "yes", dates: {}, note: "ho cambiato idea" })).d.status, "available");
  assert.equal((await stato()).reserve_only, false, "una risposta normale lo azzera");
  const vede = await rest(env, T.ownerA, "orc_invitations?select=reserve_only&id=eq." + D.INV);
  assert.deepEqual(vede.d, [{ reserve_only: false }], "controllo positivo: lo staff lo legge");
});

run("il segno «riserva» vale solo per chi ha detto sì: su un invito senza risposta non si accende", async () => {
  assert.ok((await rest(env, admin(env), "orc_invitations?id=eq." + D.INV, { method: "PATCH", body: { status: "sent" } })).ok);
  assert.equal((await rpc(env, admin(env), "orc_mark_reserve", { token_hash_in: h(D.T1) })).d, false);
  assert.equal((await stato()).reserve_only, false);
  assert.ok((await rest(env, admin(env), "orc_invitations?id=eq." + D.INV, { method: "PATCH", body: { status: "available" } })).ok);
});

run("dall'area del musicista: «riserva» accende il segno; solo il proprietario dell'invito; non su un 'no'", async () => {
  const r = await rpc(env, T.musicista, "orc_respond_reserve_mine", { invitation: D.INV, note: "solo se serve" });
  assert.ok(r.ok && r.d.status === "available", JSON.stringify(r.d));
  const s = await stato(); assert.equal(s.reserve_only, true); assert.equal(s.status, "available");
  assert.ok(!(await rpc(env, T.ownerB, "orc_respond_reserve_mine", { invitation: D.INV, note: "" })).ok, "un altro account no");
  assert.ok(!(await rpc(env, T.anon, "orc_respond_reserve_mine", { invitation: D.INV, note: "" })).ok, "l'anonimo no");
  const n = await rpc(env, T.musicista, "orc_respond_mine", { invitation: D.INV, answer: "no", dates: {}, note: "" });
  assert.ok(n.ok); assert.equal((await stato()).reserve_only, false, "dopo un «no» il segno non resta");
});

run("un invito chiuso non si rigenera (annullato): il titolare riceve un errore", async () => {
  assert.ok((await rpc(env, T.ownerA, "orc_invitation_action", { invitation: D.INV, action: "cancel", reason: "prova" })).ok);
  const r = await rpc(env, T.ownerA, "orc_invitation_relink", { invitation: D.INV });
  assert.ok(!r.ok, "annullato rifiutato: " + JSON.stringify(r.d));
});
