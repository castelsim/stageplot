/* Le email al cliente partivano verso un indirizzo che sceglieva lui: chiunque con un account faceva
   arrivare dal nostro dominio un testo suo a una persona qualsiasi. Qui si prova che l'indirizzo a cui si
   spedisce lo scrive il database dall'account verificato, che dal modulo non si falsifica, che dopo non
   si cambia, e che le richieste hanno un limite. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-mail-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let REQ;

const campi = (extra = {}) => ({ contact_name: "Vera Vittima", contact_email: "vittima-" + stamp + "@example.invalid",
  event_title: "Clicca qui: https://esempio.invalid/truffa", notes: "testo scritto da chi manda", ...extra });

run("preparazione: il servizio acceso, un cliente", async () => {
  U.cli = await mkUser(env, mail("cliente")); T.cli = await login(env, mail("cliente"));
  const s = await rpc(env, T.cli, "orc_service_org", {});
  assert.ok(s.ok && s.d && s.d.length, "serve un'organizzazione con il servizio acceso: " + JSON.stringify(s.d));
});

run("la conferma va all'indirizzo dell'account, non a quello scritto nel modulo — e non si falsifica", async () => {
  const r = await rpc(env, T.cli, "orc_client_request_create", { project: null, snap: {}, slots: [],
    fields: campi({ account_email: "altro-" + stamp + "@example.invalid" }) });
  assert.ok(r.ok, JSON.stringify(r.d)); REQ = r.d;
  const row = (await rest(env, admin(env), "orc_client_requests?select=account_email,contact_email&id=eq." + REQ)).d[0];
  assert.equal(row.account_email, mail("cliente"), "l'indirizzo del login, preso dal database");
  assert.equal(row.contact_email, "vittima-" + stamp + "@example.invalid", "quello del modulo resta, come informazione per lo staff");
});

run("una richiesta ricevuta non cambia destinatario, nemmeno con la chiave di servizio", async () => {
  const x = await rest(env, admin(env), "orc_client_requests?id=eq." + REQ, { method: "PATCH", body: { account_email: "altro@example.invalid" } });
  assert.equal(x.ok, false, "la guardia della richiesta vale anche per l'indirizzo: " + JSON.stringify(x.d));
});

run("cinque richieste al giorno per account, poi il database dice di no", async () => {
  /* ne ha già mandata una: altre quattro passano, la sesta no */
  for (let i = 0; i < 4; i++) assert.ok((await rpc(env, T.cli, "orc_client_request_create", { project: null, snap: {}, slots: [], fields: campi() })).ok, "la richiesta " + (i + 2));
  const sesta = await rpc(env, T.cli, "orc_client_request_create", { project: null, snap: {}, slots: [], fields: campi() });
  assert.equal(sesta.ok, false);
  assert.match(JSON.stringify(sesta.d), /cinque richieste/);
});
