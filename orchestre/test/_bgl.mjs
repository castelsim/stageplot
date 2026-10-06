/* Biglietteria, area dell'organizzatore (0074–0078): attrezzi comuni alle prove sul Postgres LOCALE.
   Dati inventati: utenti @example.invalid, «Teatro di prova», «Concerto di prova». Nessun id o nome vero. */
import test from "node:test";
import { execFileSync, spawn } from "node:child_process";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

export const env = localEnv();
export const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
export const stamp = () => "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const fra = (ore) => new Date(Date.now() + ore * 3_600_000).toISOString();
export const errore = (r) => r && r.d && r.d.errore;
export { rest, rpc, admin };

/* le sedie come le salva l'editor: file A.. da `perFila` posti, che guardano il palco (in alto) */
export function postiSala({ file = "ABCD", perFila = 6, settore = "Platea" } = {}) {
  const items = [];
  [...file].forEach((f, r) => { for (let n = 1; n <= perFila; n++) items.push({ id: "s" + f + n, type: "sediapubblico",
    x: 200 + n * 60, y: 1000 + r * 90, rot: 180, w: 50, d: 53, fila: f, posto: n, settore, label: "Fila " + f + " · " + n, labelMode: "hidden" }); });
  return items;
}
/* il documento di un progetto con varianti; `vuote` = id delle varianti senza sedie numerate */
export function docSala({ file = "ABCD", perFila = 6, varianti = [{ id: "V1", nome: "Sala" }], vuote = [] } = {}) {
  const stato = (vuota) => ({ _v: 1, items: vuota ? [] : postiSala({ file, perFila }), inputs: [], outputs: [],
    stage: { w: 1200, d: 800, blocks: [{ x: 100, y: 0, w: 1000, d: 800 }] } });
  return { _doc: 1, active: varianti[0].id, variants: varianti.map((v) => ({ id: v.id, name: v.nome, state: stato(vuote.includes(v.id)) })) };
}
/* la foto (pianta v1) come la manda il browser */
export function foto({ file = "ABCD", perFila = 6, settore = "Platea" } = {}) {
  const posti = [];
  [...file].forEach((f, r) => { for (let n = 1; n <= perFila; n++) posti.push({ settore, fila: f, posto: n, x: 200 + n * 60, y: 1000 + r * 90, w: 50, d: 53, rot: 180 }); });
  return { v: 1, box: [0, 0, 1400, 1600], palco: [[[100, 100], [1300, 100], [1300, 900], [100, 900]]], pedane: [], posti };
}
export async function abilita(uid, si) {
  const r = await rest(env, admin(env), "bgl_organizzatori?on_conflict=user_id", { method: "POST", body: { user_id: uid, abilitato: si },
    prefer: "resolution=merge-duplicates,return=representation" });
  if (!r.ok) throw new Error("abilita: " + JSON.stringify(r.d));
}
export async function account(nome, s, { abilitato = false } = {}) {
  const email = `sp-bgl-${nome}-${s}@example.invalid`;
  const uid = await mkUser(env, email);
  const tok = await login(env, email);
  if (abilitato) await abilita(uid, true);
  return { uid, tok, email };
}
export async function progetto(a, data, titolo = "Sala di prova") {
  const p = await rest(env, a.tok, "stageplot_projects", { method: "POST", body: { user_id: a.uid, title: titolo, data } });
  if (!p.ok) throw new Error("progetto: " + JSON.stringify(p.d));
  return p.d[0].id;
}
export async function paginaOrganizzatore(a, slug, nome = "Teatro di prova") {
  const r = await rpc(env, a.tok, "bgl_organizzatore_salva", { p_dati: { nome, slug } });
  if (!r.d || r.d.ok !== true) throw new Error("organizzatore: " + JSON.stringify(r.d));
  return r.d.organizzatore;
}
export function spettacolo(a, prog, dati = {}) {
  return rpc(env, a.tok, "bgl_spettacolo_salva", { p_id: null, p_dati: { project_id: prog, titolo: "Concerto di prova",
    inizio: fra(72), luogo: "Teatro di prova, Città", pianta: foto(), ...dati } });
}
let n = 0;
export function prenota(slug, posti, extra = {}) {
  n++;
  return rpc(env, admin(env), "bgl_prenota", { p_slug: slug, p_posti: posti, p_nome: "Mario",
    p_cognome: "Rossi " + "abcdefghij"[n % 10], p_email: `pubblico-${n}-${Date.now()}@example.invalid`, ...extra });
}
export function dbContainer() {
  try { return execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" }).split("\n").find((x) => /^supabase_db_/.test(x)) || null; }
  catch { return null; }
}
/* una sessione psql vera nel container (per le gare fra transazioni e per spostare le date) */
export function psql(sql) {
  return new Promise((ok) => {
    const p = spawn("docker", ["exec", "-i", dbContainer(), "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"]);
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => ok({ code, out, err }));
    p.stdin.end(sql);
  });
}
