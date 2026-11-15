/* V1/d — condizioni versionate e riconferma (migrazione 0084). Girano solo con Supabase locale (`supabase start`,
   migrazioni applicate con `supabase db reset`). Utenti e dati: tutti inventati, @example.invalid.
   Cosa si prova, direttamente sull'API come farebbe un attaccante:
   · le versioni le legge solo lo staff dell'organizzazione (musicista con account, anonimo, titolare di un'altra org: niente);
   · nessuno scrive o modifica le versioni dal client (nemmeno il titolare: lo fanno i trigger);
   · «chi manca» e «chiedi la riconferma» sono dello staff;
   · il giro: invito → risposta → condizione cambiata → da riconfermare → richiesta → riconferma dal link;
   · lo snapshot non contiene le note interne.
   Ogni «negato» ha il suo controllo positivo col titolare: un rifiuto dovuto a una chiamata sbagliata non vale niente. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-cond-${n}-${stamp}@example.invalid`;
const U = {}, T = {}, D = {};
const impronta = (t) => createHash("sha256").update(t).digest("hex");
const nienteLetto = (r) => !r.ok || (Array.isArray(r.d) && r.d.length === 0);

run("preparazione: due organizzazioni, un musicista con account, una produzione con un ruolo e una data", async () => {
  for (const n of ["ownerA", "ownerB", "musicista"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  T.anon = env.ANON_KEY;
  D.A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Cond A", org_slug: "cond-a-" + stamp, owner_email: mail("ownerA") })).d;
  D.B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Cond B", org_slug: "cond-b-" + stamp, owner_email: mail("ownerB") })).d;
  assert.ok(D.A && D.B);
  assert.ok((await rpc(env, T.ownerA, "orc_import_musicians", { org: D.A, rows: [{ first_name: "Mu", last_name: "Sico", email: mail("musicista"), instruments: [{ code: "violino", primary: true, level: 4 }] }] })).ok);
  D.M = (await rpc(env, T.ownerA, "orc_musicians_list", { org: D.A })).d[0].id;
  assert.equal((await rpc(env, T.musicista, "orc_link_my_musician_rows", {})).d, 1);
  const p = await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: D.A, title: "Cond " + stamp, status: "planning", fee_note: "100 € a persona", notes: "NOTA-INTERNA-" + stamp } });
  assert.ok(p.ok, JSON.stringify(p.d)); D.P = p.d[0].id;
  D.R = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: D.P, instrument_code: "violino", name: "Violini", seats: 2 } })).d[0].id;
  D.D1 = (await rest(env, T.ownerA, "orc_production_dates", { method: "POST", body: { production_id: D.P, kind: "concert", starts_at: "2027-03-10T20:00:00+01:00" } })).d[0].id;
});

run("senza inviti le modifiche non scrivono versioni; il primo invito scrive la fotografia iniziale (v0, senza note interne)", async () => {
  assert.ok((await rest(env, T.ownerA, "orc_productions?id=eq." + D.P, { method: "PATCH", body: { fee_note: "110 € a persona" } })).ok);
  const prima = await rest(env, T.ownerA, "orc_condition_versions?select=version&production_id=eq." + D.P);
  assert.ok(prima.ok && prima.d.length === 0, "nessun invito → nessuna versione: " + JSON.stringify(prima.d));
  const n = await rpc(env, T.ownerA, "orc_invite", { production: D.P, role: D.R, musicians: [D.M], deadline: null, note: "", run: null });
  assert.ok(n.ok && n.d === 1, JSON.stringify(n.d));
  const v = await rest(env, T.ownerA, "orc_condition_versions?select=version,role_id,snapshot&production_id=eq." + D.P + "&order=role_id.nullsfirst");
  assert.ok(v.ok && v.d.length === 2 && v.d.every((r) => r.version === 0), JSON.stringify(v.d));
  const snap = v.d.find((r) => r.role_id === null).snapshot;
  assert.equal(snap.fee_note, "110 € a persona");
  assert.deepEqual(Object.keys(snap).sort(), ["address", "conditions", "dates", "dress_code", "fee_note", "venue"], "solo i campi che il musicista vede");
  assert.ok(!JSON.stringify(v.d).includes("NOTA-INTERNA"), "le note interne non finiscono nelle versioni");
  D.INV = (await rest(env, T.ownerA, "orc_invitations?select=id&production_id=eq." + D.P)).d[0].id;
});

run("cambi: compenso e luogo = importante; abbigliamento = non importante; lo stesso valore non scrive niente", async () => {
  const patch = (body) => rest(env, T.ownerA, "orc_productions?id=eq." + D.P, { method: "PATCH", body });
  assert.ok((await patch({ fee_note: "110 € a persona" })).ok);
  assert.ok((await patch({ fee_note: "130 € a persona" })).ok);
  assert.ok((await patch({ dress_code: "abito scuro" })).ok);
  assert.ok((await patch({ title: "Titolo nuovo " + stamp })).ok);
  const v = await rest(env, T.ownerA, "orc_condition_versions?select=version,material,changed&production_id=eq." + D.P + "&version=gt.0&order=version");
  assert.deepEqual(v.d.map((r) => [r.version, r.material, r.changed]), [[1, true, ["fee_note"]], [2, false, ["dress_code"]]]);
});

for (const chi of ["anon", "musicista", "ownerB"]) {
  run("le versioni non si leggono — " + chi + " (il titolare sì)", async () => {
    assert.ok((await rest(env, T.ownerA, "orc_condition_versions?select=id&production_id=eq." + D.P)).d.length > 0, "controllo positivo");
    assert.ok(nienteLetto(await rest(env, T[chi], "orc_condition_versions?select=id&production_id=eq." + D.P)));
    assert.ok(nienteLetto(await rpc(env, T[chi], "orc_conditions_history", { production: D.P })));
    assert.ok(nienteLetto(await rpc(env, T[chi], "orc_reconfirm_needed", { production: D.P })));
  });
}

run("nessuno scrive le versioni dal client, nemmeno il titolare (scrivono i trigger)", async () => {
  const ins = await rest(env, T.ownerA, "orc_condition_versions", { method: "POST", body: { org_id: D.A, production_id: D.P, version: 9, snapshot: {} } });
  assert.ok(!ins.ok, "insert rifiutato");
  const upd = await rest(env, T.ownerA, "orc_condition_versions?production_id=eq." + D.P, { method: "PATCH", body: { snapshot: {} } });
  assert.ok(!upd.ok || (Array.isArray(upd.d) && upd.d.length === 0), "update rifiutato o a vuoto");
  const del = await rest(env, T.ownerA, "orc_condition_versions?production_id=eq." + D.P, { method: "DELETE" });
  assert.ok(!del.ok || (Array.isArray(del.d) && del.d.length === 0), "delete rifiutato o a vuoto");
  assert.ok((await rest(env, T.ownerA, "orc_condition_versions?select=id&production_id=eq." + D.P)).d.length >= 3, "le versioni sono tutte ancora lì");
  /* il motivo: lo scrive lo staff una volta sola; chi non è staff no */
  const id1 = (await rest(env, T.ownerA, "orc_condition_versions?select=id&production_id=eq." + D.P + "&version=eq.1")).d[0].id;
  assert.ok(!(await rpc(env, T.ownerB, "orc_conditions_set_reason", { version_id: id1, reason: "x" })).ok, "altra org: no");
  assert.ok(!(await rpc(env, T.musicista, "orc_conditions_set_reason", { version_id: id1, reason: "x" })).ok, "musicista: no");
  assert.ok((await rpc(env, T.ownerA, "orc_conditions_set_reason", { version_id: id1, reason: "adeguamento tariffe" })).ok, "titolare: sì");
  assert.ok(!(await rpc(env, T.ownerA, "orc_conditions_set_reason", { version_id: id1, reason: "altro" })).ok, "una volta sola");
});

run("il giro: risposta, condizione cambiata, da riconfermare, richiesta, riconferma dal link", async () => {
  const tok = randomBytes(24).toString("hex");
  /* invio simulato: token noto, stato «spedito» (lo farebbe il worker) */
  assert.ok((await rest(env, admin(env), "orc_invitations?id=eq." + D.INV, { method: "PATCH", body: { token_hash: impronta(tok), status: "sent", notification_status: "sent" } })).ok);
  const open0 = await rpc(env, admin(env), "orc_invitation_open", { token_hash_in: impronta(tok) });
  assert.equal(open0.d.versions.stale, false);
  const r = await rpc(env, admin(env), "orc_respond", { token_hash_in: impronta(tok), answer: "yes", dates: [], note: "" });
  assert.equal(r.d.status, "available");
  const acc = (await rest(env, T.ownerA, "orc_invitations?select=accepted_version,seen_version&id=eq." + D.INV)).d[0];
  assert.equal(acc.accepted_version, acc.seen_version, "ha accettato la versione che ha visto");

  /* le condizioni cambiano dopo la risposta */
  assert.ok((await rest(env, T.ownerA, "orc_productions?id=eq." + D.P, { method: "PATCH", body: { fee_note: "150 € a persona", venue: "Teatro di prova" } })).ok);
  const need = await rpc(env, T.ownerA, "orc_reconfirm_needed", { production: D.P });
  assert.ok(need.ok && need.d.length === 1 && need.d[0].material === true && need.d[0].changed.includes("fee_note") && need.d[0].changed.includes("venue"), JSON.stringify(need.d));
  const lista = await rpc(env, T.ownerA, "orc_invitations_list", { production: D.P });
  assert.equal(lista.d[0].stale, true);

  /* solo lo staff chiede la riconferma */
  for (const chi of ["anon", "musicista", "ownerB"]) assert.ok(!(await rpc(env, T[chi], "orc_reconfirm_request", { production: D.P, invitation_ids: [D.INV], note: "" })).ok, chi + " non può");
  assert.equal((await rpc(env, T.ownerA, "orc_reconfirm_request", { production: D.P, invitation_ids: [D.INV], note: "Cambiati luogo e compenso" })).d, 1);
  const inv = (await rest(env, T.ownerA, "orc_invitations?select=notification_kind,notification_status,reconfirm_requested_at&id=eq." + D.INV)).d[0];
  assert.deepEqual([inv.notification_kind, inv.notification_status, !!inv.reconfirm_requested_at], ["reconfirm", "pending", true]);
  assert.equal((await rpc(env, T.ownerA, "orc_reconfirm_request", { production: D.P, invitation_ids: [D.INV], note: "" })).d, 0, "con l'email già in coda non si rimanda");

  /* il link nuovo (token dal segreto, solo service_role) */
  const sec = await rest(env, admin(env), "orc_invitation_secrets?select=token&invitation_id=eq." + D.INV);
  const tok2 = sec.d[0].token;
  assert.equal((await rpc(env, admin(env), "orc_invitation_open", { token_hash_in: impronta(tok) })).d.error, "not_found", "il link vecchio non vale più");
  const open1 = (await rpc(env, admin(env), "orc_invitation_open", { token_hash_in: impronta(tok2) })).d;
  assert.equal(open1.versions.stale, true);
  assert.ok(open1.versions.changed.includes("fee_note") && open1.versions.before.fee_note !== open1.versions.after.fee_note);
  const rr = await rpc(env, admin(env), "orc_respond", { token_hash_in: impronta(tok2), answer: "yes", dates: [], note: "" });
  assert.equal(rr.d.status, "available");
  assert.equal((await rpc(env, T.ownerA, "orc_reconfirm_needed", { production: D.P })).d.length, 0, "dopo la risposta non manca più");
});

run("orc_invitation_open / orc_respond / orc_invitation_changes: solo service_role (chi ha il link passa dalla Edge Function)", async () => {
  for (const chi of ["anon", "musicista", "ownerA"]) {
    assert.ok(!(await rpc(env, T[chi], "orc_invitation_open", { token_hash_in: "0".repeat(64) })).ok, chi + ": open");
    assert.ok(!(await rpc(env, T[chi], "orc_respond", { token_hash_in: "0".repeat(64), answer: "yes", dates: [], note: "" })).ok, chi + ": respond");
    assert.ok(!(await rpc(env, T[chi], "orc_invitation_changes", { invitation: D.INV })).ok, chi + ": changes");
  }
});
