/* Inventario (migrazioni 0085, 0091, 0092): il proprietario salva i toggle di Gestione con un update diretto (0092: prima la CHECK
   dello slug chiamava una funzione senza EXECUTE per authenticated → «permission denied»); un estraneo e l'anonimo no.
   Etichette (0091): solo membri tramite inv_etichette_segna, mai con update diretto; l'anonimo non la chiama.
   Dati finti, domini .invalid. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `sp-inv-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let INV = null;
const slug = "prova-" + stamp.slice(0, 20);

run("preparazione: proprietario ed estraneo, un inventario con 2 oggetti", async () => {
  for (const n of ["a", "x"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  const c = await rpc(env, T.a, "inv_crea", { p_nome: "Ente di prova", p_slug: slug });
  assert.ok(c.ok && c.d.ok, JSON.stringify(c.d)); INV = c.d.id;
  assert.ok((await rpc(env, T.a, "inv_tipo_salva", { p_inv: INV, p_prefisso: "TAS", p_singolare: "Tastiera", p_plurale: "tastiere" })).d.ok);
  const ag = await rpc(env, T.a, "inv_aggiungi", { p_inv: INV, p_prefisso: "TAS", p_qta: 2, p_modello: "Modello di prova", p_stato: "in_sede", p_note: "" });
  assert.ok(ag.d.ok, JSON.stringify(ag.d));
});

run("0092: il proprietario spegne e riaccende «Pagina pubblica» e «Mostra stato» (update diretto)", async () => {
  for (const body of [{ pubblico: false }, { mostra_stato: true }, { pubblico: true }, { nome: "Ente di prova 2" }]) {
    const r = await rest(env, T.a, "inv_inventari?id=eq." + INV, { method: "PATCH", body });
    assert.ok(r.ok, JSON.stringify(body) + " → " + JSON.stringify(r.d).slice(0, 200));
    assert.equal(r.d.length, 1, "una riga aggiornata");
  }
  const l = await rest(env, T.a, "inv_inventari?select=pubblico,mostra_stato,nome&id=eq." + INV);
  assert.deepEqual(l.d[0], { pubblico: true, mostra_stato: true, nome: "Ente di prova 2" });
});

run("0092: un estraneo non aggiorna l'inventario altrui (0 righe), l'anonimo nemmeno", async () => {
  const x = await rest(env, T.x, "inv_inventari?id=eq." + INV, { method: "PATCH", body: { pubblico: false } });
  assert.ok(x.ok); assert.equal(x.d.length, 0, "RLS: nessuna riga");
  const an = await rest(env, env.ANON_KEY, "inv_inventari?id=eq." + INV, { method: "PATCH", body: { pubblico: false } });
  assert.ok(!an.ok, "anon non ha update: " + JSON.stringify(an.d).slice(0, 200));
  const l = await rest(env, T.a, "inv_inventari?select=pubblico&id=eq." + INV);
  assert.equal(l.d[0].pubblico, true, "invariato");
});

run("0092: lo slug resta protetto (nessun update diretto dello slug)", async () => {
  const r = await rest(env, T.a, "inv_inventari?id=eq." + INV, { method: "PATCH", body: { slug: "admin" } });
  assert.ok(!r.ok, JSON.stringify(r.d).slice(0, 200));
});

run("0091: etichette solo con la funzione e solo dai membri", async () => {
  const an = await rpc(env, env.ANON_KEY, "inv_etichette_segna", { p_inv: INV, p_codici: ["TAS-001"], p_fatta: true });
  assert.ok(!an.ok, "anon non chiama la funzione");
  const x = await rpc(env, T.x, "inv_etichette_segna", { p_inv: INV, p_codici: ["TAS-001"], p_fatta: true });
  assert.equal(x.d.errore, "non_autorizzato");
  const dir = await rest(env, T.a, "inv_articoli?inventario_id=eq." + INV, { method: "PATCH", body: { etichetta_fatta: "2026-11-18" } });
  assert.ok(!dir.ok, "nessun update diretto della colonna: " + JSON.stringify(dir.d).slice(0, 200));
  const ok = await rpc(env, T.a, "inv_etichette_segna", { p_inv: INV, p_codici: ["tas-001"], p_fatta: true });
  assert.deepEqual(ok.d, { ok: true, n: 1 });
  const l = await rest(env, T.a, "inv_articoli?select=codice,etichetta_fatta&inventario_id=eq." + INV + "&order=codice");
  assert.ok(l.d[0].etichetta_fatta && !l.d[1].etichetta_fatta, JSON.stringify(l.d));
  const via = await rpc(env, T.a, "inv_etichette_segna", { p_inv: INV, p_codici: ["TAS-001"], p_fatta: false });
  assert.deepEqual(via.d, { ok: true, n: 1 });
});
