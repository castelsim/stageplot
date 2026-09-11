/* Il preventivo. La promessa più importante è di riservatezza: il cliente vede il totale — imponibile,
   IVA, totale e una descrizione — e MAI i cachet dei musicisti, il margine o le note interne. Qui si
   prova che è il database a impedirlo, non la pagina: una colonna nascosta nell'interfaccia si legge
   comunque dalla console.

   La richiesta di prova si crea con la chiave di servizio su un'organizzazione di questa suite: così non
   si tocca «il servizio acceso» (un indice unico che anche rls-client-requests sposta) e le due suite,
   che girano in parallelo, non si contendono niente. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";
import { calcola } from "../src/domain/quote.js";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);   /* nomi suoi, anche se parte insieme a un'altra suite */
const mail = (n) => `orc-quo-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG, ORG_B, REQ, Q1, Q2;

/* tre posti: due violini a 250 €, una viola a 280 € — margine 25%, IVA 22% */
const RIGHE = [{ label: "Violino di fila", qty: 2, fee_cents: 25000 }, { label: "Viola", qty: 1, fee_cents: 28000 }];

run("preparazione: la società, un'altra organizzazione, il cliente, un estraneo, una richiesta", async () => {
  for (const n of ["societa", "ownerB", "cliente", "estraneo"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  const a = await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Quote A", org_slug: "quo-a-" + stamp, owner_email: mail("societa") });
  assert.ok(a.ok && a.d, JSON.stringify(a.d)); ORG = a.d;
  const b = await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Quote B", org_slug: "quo-b-" + stamp, owner_email: mail("ownerB") });
  assert.ok(b.ok && b.d, JSON.stringify(b.d)); ORG_B = b.d;
  const r = await rest(env, admin(env), "orc_client_requests", { method: "POST", body: {
    org_id: ORG, user_id: U.cliente, contact_name: "Anna Cliente", contact_email: mail("cliente"), event_title: "Matrimonio in villa" } });
  assert.ok(r.ok, JSON.stringify(r.d)); REQ = r.d[0].id;
});

run("il preventivo lo prepara solo la società che ha ricevuto la richiesta", async () => {
  const args = { request: REQ, margin: 25, vat: 22, description: "Trio d'archi per la cerimonia", notes: "chiedere a Luca se è libero", lines: RIGHE };
  assert.equal((await rpc(env, T.cliente, "orc_quote_save", args)).ok, false, "il cliente non si fa il preventivo da solo");
  assert.equal((await rpc(env, T.ownerB, "orc_quote_save", args)).ok, false, "un'altra organizzazione nemmeno");
  assert.equal((await rpc(env, T.estraneo, "orc_quote_save", args)).ok, false);
  const s = await rpc(env, T.societa, "orc_quote_save", args);
  assert.ok(s.ok && s.d, JSON.stringify(s.d)); Q1 = s.d;
  /* salvare di nuovo riscrive la bozza, non ne crea una seconda */
  const s2 = await rpc(env, T.societa, "orc_quote_save", { ...args, margin: 30 });
  assert.equal(s2.d, Q1, "una sola bozza per richiesta");
  await rpc(env, T.societa, "orc_quote_save", args);   /* torna al 25% */
});

run("prima dell'invio il cliente non vede niente: la bozza è della società", async () => {
  assert.deepEqual((await rpc(env, T.cliente, "orc_my_quotes", {})).d, [], "una bozza non è ancora un preventivo");
});

run("i conti li fa il database, e sono gli stessi del browser al centesimo", async () => {
  const inviato = await rpc(env, T.societa, "orc_quote_send", { quote: Q1 });
  assert.ok(inviato.ok, JSON.stringify(inviato.d));
  const atteso = calcola(RIGHE, 25, 22);
  assert.equal(Number(inviato.d.net_cents), atteso.imponibile, "imponibile: 78.000 × 1,25 = 97.500");
  assert.equal(Number(inviato.d.vat_cents), atteso.iva);
  assert.equal(Number(inviato.d.total_cents), atteso.totale);
  const req = (await rest(env, admin(env), "orc_client_requests?select=status&id=eq." + REQ)).d[0];
  assert.equal(req.status, "quoted", "la richiesta passa a «preventivo inviato»");
});

run("il cliente vede il totale — e MAI i cachet, il margine o le note interne", async () => {
  const mie = (await rpc(env, T.cliente, "orc_my_quotes", {})).d;
  assert.equal(mie.length, 1);
  const q = mie[0];
  assert.equal(Number(q.total_cents), calcola(RIGHE, 25, 22).totale, "il totale sì");
  assert.equal(q.description, "Trio d'archi per la cerimonia", "e la descrizione");
  for (const vietato of ["margin_pct", "notes_internal", "fee_cents", "lines", "created_by"]) {
    assert.ok(!(vietato in q), "«" + vietato + "» non deve arrivare al cliente");
  }
  assert.doesNotMatch(JSON.stringify(q), /25000|28000|chiedere a Luca/, "nessun cachet e nessuna nota, nemmeno nascosti in un altro campo");
  /* e dalla console: le due tabelle, lette direttamente, non gli restituiscono niente */
  assert.deepEqual((await rest(env, T.cliente, "orc_quotes?select=*")).d, [], "la tabella dei preventivi non è sua");
  assert.deepEqual((await rest(env, T.cliente, "orc_quote_lines?select=*")).d, [], "e le righe coi cachet ancora meno");
});

run("nessun altro vede il preventivo: né un estraneo né un'altra organizzazione", async () => {
  assert.deepEqual((await rpc(env, T.estraneo, "orc_my_quotes", {})).d, []);
  assert.deepEqual((await rest(env, T.ownerB, "orc_quotes?select=id")).d, []);
  assert.deepEqual((await rest(env, T.ownerB, "orc_quote_lines?select=id")).d, []);
  /* la società sì, righe comprese: sono i suoi conti */
  assert.equal((await rest(env, T.societa, "orc_quote_lines?select=fee_cents&quote_id=eq." + Q1)).d.length, 2);
});

run("il preventivo mandato non si modifica: nemmeno con la chiave che scavalca la RLS", async () => {
  const sconto = await rest(env, admin(env), "orc_quotes?id=eq." + Q1, { method: "PATCH", body: { total_cents: 1 } });
  assert.equal(sconto.ok, false, "la cifra che il cliente accetta resta quella");
  assert.match(JSON.stringify(sconto.d), /non si modifica/);
  const riga = await rest(env, admin(env), "orc_quote_lines?quote_id=eq." + Q1, { method: "PATCH", body: { fee_cents: 1 } });
  assert.equal(riga.ok, false, "e nemmeno i cachet sotto");
  assert.equal((await rpc(env, T.societa, "orc_quote_send", { quote: Q1 })).ok, false, "e non si rimanda due volte");
});

run("un preventivo nuovo supera il vecchio: il cliente vede solo l'ultimo", async () => {
  const s = await rpc(env, T.societa, "orc_quote_save", { request: REQ, margin: 20, vat: 22, description: "Trio d'archi, sconto", notes: "", lines: RIGHE });
  assert.ok(s.ok, JSON.stringify(s.d)); Q2 = s.d;
  assert.notEqual(Q2, Q1, "il vecchio è mandato: se ne fa uno nuovo");
  assert.ok((await rpc(env, T.societa, "orc_quote_send", { quote: Q2 })).ok);
  const mie = (await rpc(env, T.cliente, "orc_my_quotes", {})).d;
  assert.equal(mie.length, 1, "il superato non gli si mostra più");
  assert.equal(mie[0].id, Q2);
  const vecchio = (await rest(env, admin(env), "orc_quotes?select=status&id=eq." + Q1)).d[0];
  assert.equal(vecchio.status, "superseded");
});

run("il cliente risponde una volta sola, e solo lui", async () => {
  assert.equal((await rpc(env, T.estraneo, "orc_quote_answer", { quote: Q2, accept: true })).ok, false, "un estraneo non accetta al posto suo");
  assert.equal((await rpc(env, T.cliente, "orc_quote_answer", { quote: Q1, accept: true })).ok, false, "a un preventivo superato non si risponde");
  const si = await rpc(env, T.cliente, "orc_quote_answer", { quote: Q2, accept: true });
  assert.ok(si.ok, JSON.stringify(si.d)); assert.equal(si.d, "accepted");
  assert.equal((await rpc(env, T.cliente, "orc_quote_answer", { quote: Q2, accept: false })).ok, false, "una volta sola");
  const req = (await rest(env, admin(env), "orc_client_requests?select=status&id=eq." + REQ)).d[0];
  assert.equal(req.status, "won", "la richiesta diventa «accettata»");
});

run("un preventivo vuoto non parte", async () => {
  const r = await rest(env, admin(env), "orc_client_requests", { method: "POST", body: {
    org_id: ORG, user_id: U.cliente, contact_name: "Anna Cliente", contact_email: mail("cliente"), event_title: "Senza righe" } });
  const q = await rpc(env, T.societa, "orc_quote_save", { request: r.d[0].id, margin: 25, vat: 22, description: "", notes: "", lines: [] });
  const vuoto = await rpc(env, T.societa, "orc_quote_send", { quote: q.d });
  assert.equal(vuoto.ok, false, "un totale di zero euro non si manda a nessuno");
  assert.match(JSON.stringify(vuoto.d), /vuoto/);
});
