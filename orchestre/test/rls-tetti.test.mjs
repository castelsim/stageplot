/* Tetti per account (migrazione 0071, verifica di sicurezza 28/09): con un account gratuito non si riempie
   il database. Ogni rifiuto è controllato sul CODICE dell'errore (23514 vincolo, 54000 tetto), non sul
   semplice «non è andata»: un 413 del gateway o un errore di permesso non devono far passare il test.
   Ogni tetto ha il suo controllo positivo appena sotto. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `sp-tetti-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
const codice = (r) => r.d && (r.d.code || (Array.isArray(r.d) ? "" : r.d.code));

run("preparazione: due account", async () => {
  for (const n of ["a", "b"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
});

run("anteprima: 900 KB passa, oltre 1 MB no (vincolo 23514)", async () => {
  const ok = await rest(env, T.a, "stageplot_projects", { method: "POST", body: { user_id: U.a, title: "Anteprima ok", data: { items: [] }, thumbnail: "data:image/jpeg;base64," + "A".repeat(900 * 1024) } });
  assert.ok(ok.ok, JSON.stringify(ok.d).slice(0, 200));
  const no = await rest(env, T.a, "stageplot_projects", { method: "POST", body: { user_id: U.a, title: "Anteprima enorme", data: { items: [] }, thumbnail: "data:image/jpeg;base64," + "A".repeat(1100 * 1024) } });
  assert.ok(!no.ok); assert.equal(codice(no), "23514", JSON.stringify(no.d).slice(0, 200));
});

run("titolo: 500 caratteri sì, 501 no", async () => {
  assert.ok((await rest(env, T.a, "stageplot_projects", { method: "POST", body: { user_id: U.a, title: "t".repeat(500), data: {} } })).ok);
  const no = await rest(env, T.a, "stageplot_projects", { method: "POST", body: { user_id: U.a, title: "t".repeat(501), data: {} } });
  assert.equal(codice(no), "23514", JSON.stringify(no.d).slice(0, 200));
});

run("progetti per account: si arriva a 500, il 501° no; un altro account non ne risente", async () => {
  const gia = (await rest(env, T.a, "stageplot_projects?select=id&deleted_at=is.null")).d.length;
  const molti = Array.from({ length: 500 - gia }, (_, i) => ({ user_id: U.a, title: "P" + i, data: {} }));
  const r = await rest(env, T.a, "stageplot_projects", { method: "POST", body: molti });
  assert.ok(r.ok, "fino a 500 si salva: " + JSON.stringify(r.d).slice(0, 200));
  const no = await rest(env, T.a, "stageplot_projects", { method: "POST", body: { user_id: U.a, title: "Uno di troppo", data: {} } });
  assert.equal(codice(no), "54000", JSON.stringify(no.d).slice(0, 200));
  assert.ok((await rest(env, T.b, "stageplot_projects", { method: "POST", body: { user_id: U.b, title: "Il mio primo", data: {} } })).ok, "l'altro account salva");
  const del = await rest(env, T.a, "stageplot_projects?title=eq.P0&user_id=eq." + U.a, { method: "PATCH", body: { deleted_at: new Date().toISOString() } });
  assert.ok(del.ok, JSON.stringify(del.d).slice(0, 200));
  assert.ok((await rest(env, T.a, "stageplot_projects", { method: "POST", body: { user_id: U.a, title: "Dopo averne eliminato uno", data: {} } })).ok, "eliminandone uno si riparte");
});

run("eventi: 600 in un'ora sì, il 601° no; un altro account non ne risente", async () => {
  const ev = (u, n) => Array.from({ length: n }, () => ({ event: "app_open", user_id: u, props: {} }));
  const r = await rest(env, T.a, "analytics_events", { method: "POST", body: ev(U.a, 600) });
  assert.ok(r.ok, JSON.stringify(r.d).slice(0, 200));
  const no = await rest(env, T.a, "analytics_events", { method: "POST", body: ev(U.a, 1) });
  assert.equal(codice(no), "54000", JSON.stringify(no.d).slice(0, 200));
  assert.ok((await rest(env, T.b, "analytics_events", { method: "POST", body: ev(U.b, 1) })).ok, "l'altro account scrive");
});
