/* Lotto E (migrazione 0086): versioni dell'organico per le stampe. Girano solo con Supabase locale (`supabase start`,
   `supabase db reset`). Dati inventati, @example.invalid. Si prova direttamente sull'API:
   · stesso organico = stessa versione; organico cambiato = versione successiva, con la precedente accanto;
   · lo snapshot lo costruisce il server (nessun parametro dal client);
   · solo lo staff dell'organizzazione stampa e legge le versioni; altri titolari, anonimo, musicista: niente;
   · le versioni non si scrivono né si modificano dal client. Ogni «negato» ha il suo controllo positivo col titolare. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-ver-${n}-${stamp}@example.invalid`;
const U = {}, T = {}, D = {};

run("preparazione: due organizzazioni, un musicista, una produzione con un ruolo da 2 posti", async () => {
  for (const n of ["ownerA", "ownerB", "musicista"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  T.anon = env.ANON_KEY;
  D.A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Ver A", org_slug: "ver-a-" + stamp, owner_email: mail("ownerA") })).d;
  D.B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Ver B", org_slug: "ver-b-" + stamp, owner_email: mail("ownerB") })).d;
  assert.ok((await rpc(env, T.ownerA, "orc_import_musicians", { org: D.A, rows: [{ first_name: "Anna", last_name: "Prova", email: mail("musicista"), instruments: [{ code: "violino", primary: true }] }] })).ok);
  D.M = (await rpc(env, T.ownerA, "orc_musicians_list", { org: D.A })).d[0].id;
  const p = await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: D.A, title: "Ver " + stamp, status: "planning" } });
  assert.ok(p.ok, JSON.stringify(p.d)); D.P = p.d[0].id;
  const r = await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: D.P, instrument_code: "violino", name: "Violini", seats: 2 } });
  assert.ok(r.ok, JSON.stringify(r.d)); D.R = r.d[0].id;
  D.slots = (await rest(env, T.ownerA, "orc_staffing_slots?select=id,seat_no&production_id=eq." + D.P + "&order=seat_no")).d;
  assert.equal(D.slots.length, 2);
});

run("prima stampa: v1 senza precedente; ristampa dello stesso organico: ancora v1, nessuna riga nuova", async () => {
  const a = await rpc(env, T.ownerA, "orc_staffing_stamp", { production: D.P });
  assert.ok(a.ok, JSON.stringify(a.d));
  assert.equal(a.d.version, 1); assert.equal(a.d.created, true); assert.equal(a.d.previous, null);
  assert.equal(a.d.snapshot.length, 2); assert.equal(a.d.snapshot[0].status, "open");
  const b = await rpc(env, T.ownerA, "orc_staffing_stamp", { production: D.P });
  assert.equal(b.d.version, 1); assert.equal(b.d.created, false);
  const n = await rest(env, T.ownerA, "orc_staffing_versions?select=version&production_id=eq." + D.P);
  assert.equal(n.d.length, 1);
});

run("organico cambiato: v2 con la v1 accanto; ristampa = v2; il nome della persona sta nello snapshot", async () => {
  const as = await rpc(env, T.ownerA, "orc_assign_slot", { slot: D.slots[0].id, musician: D.M, reason: "prova" });
  assert.ok(as.ok, JSON.stringify(as.d));
  const a = await rpc(env, T.ownerA, "orc_staffing_stamp", { production: D.P });
  assert.equal(a.d.version, 2); assert.equal(a.d.created, true);
  assert.equal(a.d.previous.version, 1); assert.equal(a.d.previous.snapshot[0].musician, null);
  assert.equal(a.d.snapshot[0].musician, "Prova Anna"); assert.equal(a.d.snapshot[0].status, "confirmed");
  const b = await rpc(env, T.ownerA, "orc_staffing_stamp", { production: D.P });
  assert.equal(b.d.version, 2); assert.equal(b.d.created, false); assert.equal(b.d.previous.version, 1);
});

run("torna uguale a prima: nasce comunque una versione nuova (v3), mai due fogli diversi con la stessa versione", async () => {
  assert.ok((await rpc(env, T.ownerA, "orc_release_slot", { slot: D.slots[0].id, event: "withdrew", reason: "prova" })).ok);
  const a = await rpc(env, T.ownerA, "orc_staffing_stamp", { production: D.P });
  assert.equal(a.d.version, 3); assert.equal(a.d.previous.version, 2);
});

run("chi non è staff non stampa e non legge: altro titolare, anonimo, musicista", async () => {
  for (const tok of [T.ownerB, T.anon, T.musicista]) {
    const s = await rpc(env, tok, "orc_staffing_stamp", { production: D.P });
    assert.ok(!s.ok, "stampa negata: " + JSON.stringify(s.d));
    const l = await rest(env, tok, "orc_staffing_versions?select=version&production_id=eq." + D.P);
    assert.ok(!l.ok || (Array.isArray(l.d) && l.d.length === 0), "lettura negata: " + JSON.stringify(l.d));
  }
  const ok = await rest(env, T.ownerA, "orc_staffing_versions?select=version&production_id=eq." + D.P);
  assert.equal(ok.d.length, 3, "controllo positivo: il titolare le vede tutte");
});

run("dal client le versioni non si scrivono, non si cambiano, non si cancellano (nemmeno il titolare)", async () => {
  const ins = await rest(env, T.ownerA, "orc_staffing_versions", { method: "POST", body: { org_id: D.A, production_id: D.P, version: 99, fingerprint: "x", snapshot: [] } });
  assert.ok(!ins.ok, "insert negato");
  const upd = await rest(env, T.ownerA, "orc_staffing_versions?production_id=eq." + D.P, { method: "PATCH", body: { snapshot: [] } });
  assert.ok(!upd.ok || (Array.isArray(upd.d) && upd.d.length === 0), "update negato");
  const del = await rest(env, T.ownerA, "orc_staffing_versions?production_id=eq." + D.P, { method: "DELETE" });
  assert.ok(!del.ok || (Array.isArray(del.d) && del.d.length === 0), "delete negato");
  const sr = await rest(env, admin(env), "orc_staffing_versions?production_id=eq." + D.P + "&version=eq.1", { method: "PATCH", body: { fingerprint: "y" } });
  assert.ok(!sr.ok, "append-only anche per il service role: " + JSON.stringify(sr.d));
  assert.equal((await rest(env, T.ownerA, "orc_staffing_versions?select=version&production_id=eq." + D.P)).d.length, 3, "controllo positivo: sono ancora 3");
});
