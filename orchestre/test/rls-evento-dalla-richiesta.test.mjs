/* Dalla richiesta accettata all'evento. La richiesta sa già quasi tutto — cosa, dove, quando, chi serve —
   e ricopiarlo a mano in una produzione nuova era lavoro inutile e occasione di errore. Qui si prova che
   il tasto crea la produzione giusta, con un ruolo per posto e lo strumento al suo posto; che non ne crea
   due se lo si preme due volte; e che lo può premere solo la società che ha ricevuto la richiesta.

   Richieste di prova create con la chiave di servizio su organizzazioni di questa suite: niente
   contesa col «servizio acceso» che altre suite spostano. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-evt-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG, REQ, REQ2, PROD;

run("preparazione: la società, un'altra organizzazione, il cliente, due richieste", async () => {
  for (const n of ["societa", "ownerB", "cliente"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  const a = await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Evt A", org_slug: "evt-a-" + stamp, owner_email: mail("societa") });
  assert.ok(a.ok && a.d, JSON.stringify(a.d)); ORG = a.d;
  const b = await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Evt B", org_slug: "evt-b-" + stamp, owner_email: mail("ownerB") });
  assert.ok(b.ok && b.d, JSON.stringify(b.d));
  /* la prima: con i posti chiesti, uno coperto dal cliente */
  const r = await rest(env, admin(env), "orc_client_requests", { method: "POST", body: {
    org_id: ORG, user_id: U.cliente, contact_name: "Anna Cliente", contact_company: "Villa Rossi", contact_email: mail("cliente"),
    event_kind: "matrimonio", event_title: "Nozze in villa", event_when: "20 giugno", event_place: "Villa Rossi, Vicenza",
    repertoire: "classico", budget: "2000 €" } });
  assert.ok(r.ok, JSON.stringify(r.d)); REQ = r.d[0].id;
  const s = await rest(env, admin(env), "orc_client_request_slots", { method: "POST", body: [
    { request_id: REQ, label: "Violino", instrument_code: "violino", qty: 2, covered: false, sort: 1 },
    { request_id: REQ, label: "Pianoforte", instrument_code: "pianoforte", qty: 1, covered: true, sort: 2 },
    { request_id: REQ, label: "Violoncello", instrument_code: "violoncello", qty: 1, covered: false, sort: 3 }] });
  assert.ok(s.ok, JSON.stringify(s.d));
  /* la seconda: «formazione da definire», i posti arrivano dal preventivo */
  const r2 = await rest(env, admin(env), "orc_client_requests", { method: "POST", body: {
    org_id: ORG, user_id: U.cliente, contact_name: "Anna Cliente", contact_email: mail("cliente"),
    event_title: "Inaugurazione", formation_unknown: true } });
  assert.ok(r2.ok, JSON.stringify(r2.d)); REQ2 = r2.d[0].id;
  const q = await rpc(env, T.societa, "orc_quote_save", { request: REQ2, margin: 20, vat: 22, description: "Quartetto d'archi, un'ora",
    notes: "", lines: [{ label: "Archi", qty: 4, fee_cents: 20000 }] });
  assert.ok(q.ok, JSON.stringify(q.d));
  assert.ok((await rpc(env, T.societa, "orc_quote_send", { quote: q.d })).ok);
  assert.ok((await rpc(env, T.cliente, "orc_quote_answer", { quote: q.d, accept: true })).ok);
});

run("l'evento lo crea solo la società che ha ricevuto la richiesta", async () => {
  assert.equal((await rpc(env, T.cliente, "orc_production_from_request", { req: REQ })).ok, false, "il cliente no");
  assert.equal((await rpc(env, T.ownerB, "orc_production_from_request", { req: REQ })).ok, false, "un'altra organizzazione nemmeno");
  const p = await rpc(env, T.societa, "orc_production_from_request", { req: REQ });
  assert.ok(p.ok && p.d, JSON.stringify(p.d)); PROD = p.d;
});

run("la produzione nasce da quello che la richiesta sapeva già", async () => {
  const p = (await rest(env, admin(env), "orc_productions?select=*&id=eq." + PROD)).d[0];
  assert.equal(p.org_id, ORG);
  assert.equal(p.title, "Nozze in villa");
  assert.equal(p.client, "Anna Cliente · Villa Rossi");
  assert.equal(p.kind, "evento", "un matrimonio, per la produzione, è un evento");
  assert.equal(p.venue, "Villa Rossi, Vicenza");
  assert.match(p.notes, /Quando: 20 giugno/);
  assert.match(p.notes, /Budget indicato dal cliente: 2000 €/);
  const req = (await rest(env, admin(env), "orc_client_requests?select=production_id&id=eq." + REQ)).d[0];
  assert.equal(req.production_id, PROD, "e la richiesta resta collegata alla sua produzione");
});

run("un ruolo per posto chiesto, con lo strumento — e i posti coperti dal cliente restano fuori", async () => {
  const ruoli = (await rest(env, admin(env), "orc_staffing_roles?select=name,instrument_code,seats&production_id=eq." + PROD + "&order=sort")).d;
  assert.deepEqual(ruoli.map((r) => [r.name, r.instrument_code, r.seats]), [["Violino", "violino", 2], ["Violoncello", "violoncello", 1]],
    "il pianoforte lo porta il cliente: non si cerca");
  /* i posti veri li genera il trigger dei ruoli, come quando si compone l'organico a mano */
  const posti = (await rest(env, admin(env), "orc_staffing_slots?select=id&production_id=eq." + PROD)).d;
  assert.equal(posti.length, 3, "due violini e un violoncello: tre posti da coprire");
});

run("premuto due volte, non crea due eventi", async () => {
  const di_nuovo = await rpc(env, T.societa, "orc_production_from_request", { req: REQ });
  assert.equal(di_nuovo.d, PROD, "restituisce la stessa produzione");
  const tutte = (await rest(env, admin(env), "orc_productions?select=id&org_id=eq." + ORG + "&title=eq.Nozze in villa")).d;
  assert.equal(tutte.length, 1);
});

run("formazione da definire: i posti arrivano dal preventivo accettato", async () => {
  const p = await rpc(env, T.societa, "orc_production_from_request", { req: REQ2 });
  assert.ok(p.ok && p.d, JSON.stringify(p.d));
  const prod = (await rest(env, admin(env), "orc_productions?select=description,notes&id=eq." + p.d)).d[0];
  assert.equal(prod.description, "Quartetto d'archi, un'ora", "la formazione concordata è quella del preventivo");
  assert.match(prod.notes, /non sapeva che formazione/);
  const ruoli = (await rest(env, admin(env), "orc_staffing_roles?select=name,seats&production_id=eq." + p.d)).d;
  assert.deepEqual(ruoli.map((r) => [r.name, r.seats]), [["Archi", 4]]);
});
