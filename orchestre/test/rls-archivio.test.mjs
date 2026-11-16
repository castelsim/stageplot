/* Lotto C (migrazione 0088): archivio dei musicisti — elenco, ripristino, cancellazione definitiva (solo proprietario).
   Girano solo con Supabase locale (`supabase start`, `supabase db reset`). Dati inventati, @example.invalid.
   · l'elenco degli archiviati e il ripristino sono dello staff; la cancellazione definitiva solo del proprietario;
   · si cancella solo un archiviato e solo scrivendo il nome esatto; la cascata porta via i dati della persona;
   · il registro dice cosa è successo e chi, senza nome né email; ogni «negato» ha il suo controllo positivo. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-arc-${n}-${stamp}@example.invalid`;
const U = {}, T = {}, D = {};

run("preparazione: due organizzazioni, un'amministratrice, tre musicisti, una produzione con un invito", async () => {
  for (const n of ["owner", "admin", "ownerB", "mus"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  T.anon = env.ANON_KEY;
  D.A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Arc A", org_slug: "arc-a-" + stamp, owner_email: mail("owner") })).d;
  D.B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Arc B", org_slug: "arc-b-" + stamp, owner_email: mail("ownerB") })).d;
  const add = await rest(env, admin(env), "orc_memberships", { method: "POST", body: { org_id: D.A, user_id: U.admin, role: "admin" } });
  assert.ok(add.ok, JSON.stringify(add.d));
  const rows = [["Rossi", "Anna"], ["Verdi", "Eva"], ["Neri", "Gino"]].map(([l, f]) => ({ first_name: f, last_name: l, email: `${f}.${l}.${stamp}@example.invalid`.toLowerCase(), instruments: [{ code: "violino", primary: true }] }));
  assert.ok((await rpc(env, T.owner, "orc_import_musicians", { org: D.A, rows })).ok);
  const l = (await rpc(env, T.owner, "orc_musicians_list", { org: D.A })).d;
  D.rossi = l.find((x) => x.last_name === "Rossi").id; D.verdi = l.find((x) => x.last_name === "Verdi").id; D.neri = l.find((x) => x.last_name === "Neri").id;
  D.P = (await rest(env, T.owner, "orc_productions", { method: "POST", body: { org_id: D.A, title: "Arc " + stamp, status: "planning" } })).d[0].id;
  D.R = (await rest(env, T.owner, "orc_staffing_roles", { method: "POST", body: { production_id: D.P, instrument_code: "violino", name: "Violini", seats: 1 } })).d[0].id;
  assert.equal((await rpc(env, T.owner, "orc_invite", { production: D.P, role: D.R, musicians: [D.rossi], deadline: null, note: "", run: null })).d, 1);
});

run("archiviare: sparisce dal pool ma compare fra gli archiviati (solo allo staff)", async () => {
  assert.ok((await rest(env, T.owner, "orc_musicians?id=eq." + D.rossi, { method: "PATCH", body: { deleted_at: new Date().toISOString() } })).ok);
  assert.ok(!(await rpc(env, T.owner, "orc_musicians_list", { org: D.A })).d.some((x) => x.id === D.rossi), "fuori dal pool");
  const arc = await rpc(env, T.owner, "orc_musicians_archived", { org: D.A });
  assert.deepEqual(arc.d.map((x) => x.last_name), ["Rossi"]);
  for (const tok of [T.ownerB, T.anon, T.mus]) {
    const r = await rpc(env, tok, "orc_musicians_archived", { org: D.A });
    assert.ok(!r.ok || r.d.length === 0, "l'elenco degli archiviati non è di tutti: " + JSON.stringify(r.d));
  }
});

run("ripristino: lo staff (anche l'amministratrice) lo rimette nel pool; altri no; vale solo per un archiviato", async () => {
  for (const tok of [T.ownerB, T.anon, T.mus]) assert.ok(!(await rpc(env, tok, "orc_musician_restore", { musician: D.rossi })).ok, "negato");
  assert.ok(!(await rpc(env, T.owner, "orc_musician_restore", { musician: D.verdi })).ok, "un musicista non archiviato non si ripristina");
  const r = await rpc(env, T.admin, "orc_musician_restore", { musician: D.rossi });
  assert.ok(r.ok, JSON.stringify(r.d));
  assert.ok((await rpc(env, T.owner, "orc_musicians_list", { org: D.A })).d.some((x) => x.id === D.rossi), "di nuovo nel pool");
  assert.equal((await rpc(env, T.owner, "orc_musicians_archived", { org: D.A })).d.length, 0);
  const log = await rest(env, T.owner, "orc_audit_log?select=action,actor_id&entity_id=eq." + D.rossi + "&action=eq.musician.restore");
  assert.deepEqual(log.d, [{ action: "musician.restore", actor_id: U.admin }], "nel registro, con chi l'ha fatto");
});

run("cancellazione definitiva: non per l'amministratrice, non per altri, non su un non archiviato, non col nome sbagliato", async () => {
  assert.ok((await rest(env, T.owner, "orc_musicians?id=eq." + D.rossi, { method: "PATCH", body: { deleted_at: new Date().toISOString() } })).ok);
  const nome = "Rossi Anna";
  for (const [tok, chi] of [[T.admin, "amministratrice"], [T.ownerB, "altro titolare"], [T.anon, "anonimo"], [T.mus, "musicista"]]) {
    assert.ok(!(await rpc(env, tok, "orc_musician_purge", { musician: D.rossi, confirm_name: nome })).ok, chi + " non può");
  }
  assert.ok(!(await rpc(env, T.owner, "orc_musician_purge", { musician: D.verdi, confirm_name: "Verdi Eva" })).ok, "non archiviato: no");
  assert.ok(!(await rpc(env, T.owner, "orc_musician_purge", { musician: D.rossi, confirm_name: "Rossi" })).ok, "nome incompleto: no");
  assert.ok(!(await rpc(env, T.owner, "orc_musician_purge", { musician: D.rossi, confirm_name: "" })).ok, "senza nome: no");
  assert.equal((await rpc(env, T.owner, "orc_musicians_archived", { org: D.A })).d.length, 1, "controllo positivo: è ancora lì, intatto");
});

run("il proprietario cancella per sempre: la persona e i suoi inviti spariscono, il registro resta senza dati personali", async () => {
  assert.equal((await rest(env, admin(env), "orc_invitations?select=id&musician_id=eq." + D.rossi)).d.length, 1, "prima: un invito");
  const r = await rpc(env, T.owner, "orc_musician_purge", { musician: D.rossi, confirm_name: "  rossi ANNA " });
  assert.ok(r.ok && r.d.ok === true && r.d.invitations === 1, JSON.stringify(r) );
  assert.equal((await rest(env, admin(env), "orc_musicians?select=id&id=eq." + D.rossi)).d.length, 0, "la persona non c'è più");
  assert.equal((await rest(env, admin(env), "orc_invitations?select=id&musician_id=eq." + D.rossi)).d.length, 0, "né i suoi inviti");
  const log = await rest(env, T.owner, "orc_audit_log?select=action,actor_id,payload&entity_id=eq." + D.rossi + "&action=eq.musician.purge");
  assert.equal(log.d.length, 1); assert.equal(log.d[0].actor_id, U.owner);
  const txt = JSON.stringify(log.d); assert.ok(!/rossi|anna|example\.invalid/i.test(txt), "il registro non tiene nome né email: " + txt);
  assert.ok((await rpc(env, T.owner, "orc_musicians_list", { org: D.A })).d.some((x) => x.id === D.verdi), "controllo positivo: gli altri sono intatti");
});

run("le storie restano append-only fuori dalla cancellazione: il flag non si imposta dal client e nessuno cancella eventi a mano", async () => {
  for (const tok of [T.owner, T.anon]) assert.ok(!(await rpc(env, tok, "set_config", { setting_name: "orc.purge_musician", new_value: "on", is_local: false })).ok, "set_config non è raggiungibile dal client");
  const ev = await rest(env, admin(env), "orc_invitation_events?select=id&limit=1");
  assert.ok(ev.ok, "controllo positivo: gli eventi esistono nel database");
  const del = await rest(env, admin(env), "orc_slot_events?id=gt.0", { method: "DELETE" });
  assert.ok(!del.ok, "nemmeno il service role cancella eventi dei posti fuori dalla cancellazione di un musicista: " + JSON.stringify(del.d));
});
