/* «Richiedi musicisti»: chi manda la richiesta è un cliente qualsiasi dell'editor, non un membro di
   un'organizzazione. Qui si prova che vede solo la sua, che non può allegare il palco di un altro, che
   quello che ha mandato non cambia più, e che la società lo legge mentre gli estranei no. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "r" + Date.now().toString(36);
const mail = (n) => `orc-req-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG, ORG_B, PROJ, PROJ_B, REQ, PRIMA = null;

const FIELDS = { contact_name: "Mario Rossi", contact_company: "Eventi srl", contact_email: "mario@example.invalid", contact_phone: "340 000 0000",
  event_kind: "matrimonio", event_title: "Nozze Bianchi", event_when: "fine ottobre", event_place: "Vicenza",
  schedule: "prova alle 17, cerimonia alle 19", repertoire: "classico e pop", budget: "1500 €", notes: "servono leggii" };
const SLOTS = [
  { item_id: "i1", label: "Vl I 1-2", instrument_code: "violino", qty: 2, covered: false },
  { item_id: "i2", label: "Vla", instrument_code: "viola", qty: 1, covered: true },
  { item_id: "i3", label: "Fl", instrument_code: "flauto", qty: 1, covered: false },
];
const SNAP = { _v: 1, titolo: "Nozze", luogo: "Villa", palco: { larghezza_cm: 800, profondita_cm: 500 }, elementi: 4, postazioni: [] };

run("preparazione: la società, un cliente, un estraneo, due progetti", async () => {
  for (const n of ["societa", "cliente", "estraneo", "ownerB"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  ORG = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Servizi " + stamp, org_slug: "serv-" + stamp, owner_email: mail("societa") })).d;
  ORG_B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Altra " + stamp, org_slug: "altra-" + stamp, owner_email: mail("ownerB") })).d;
  /* Una sola organizzazione riceve le richieste: è un indice unico, non una convenzione. Il locale ne ha
     già una accesa (quella dei dati di prova): si annota, si spegne, e alla fine si rimette com'era. */
  const acceso = await rest(env, admin(env), "orc_organizations?select=id&is_service_provider=is.true");
  PRIMA = (acceso.d || [])[0] ? acceso.d[0].id : null;
  if (PRIMA) await rest(env, admin(env), "orc_organizations?id=eq." + PRIMA, { method: "PATCH", body: { is_service_provider: false } });
  const on = await rest(env, admin(env), "orc_organizations?id=eq." + ORG, { method: "PATCH", body: { is_service_provider: true } });
  assert.ok(on.ok, JSON.stringify(on.d));
  const chi = (await rpc(env, T.cliente, "orc_service_org")).d;
  assert.equal(chi.length, 1); assert.equal(chi[0].id, ORG, "il cliente sa a chi sta scrivendo");
  const p = await rest(env, T.cliente, "stageplot_projects", { method: "POST", body: { user_id: U.cliente, title: "Palco del cliente", data: { items: [] } } });
  assert.ok(p.ok, JSON.stringify(p.d)); PROJ = p.d[0].id;
  const pb = await rest(env, T.estraneo, "stageplot_projects", { method: "POST", body: { user_id: U.estraneo, title: "Palco di un altro", data: { items: [] } } });
  assert.ok(pb.ok); PROJ_B = pb.d[0].id;
});

run("il cliente manda la richiesta col suo palco; con quello di un altro no", async () => {
  const altrui = await rpc(env, T.cliente, "orc_client_request_create", { project: PROJ_B, snap: SNAP, fields: FIELDS, slots: SLOTS });
  assert.equal(altrui.ok, false, "non si allega il palco di un altro");
  const ok = await rpc(env, T.cliente, "orc_client_request_create", { project: PROJ, snap: SNAP, fields: FIELDS, slots: SLOTS });
  assert.ok(ok.ok, JSON.stringify(ok.d)); REQ = ok.d;
  assert.ok(REQ);
  /* senza accesso non si manda niente */
  const anon = await rpc(env, env.ANON_KEY, "orc_client_request_create", { project: null, snap: SNAP, fields: FIELDS, slots: SLOTS });
  assert.equal(anon.ok, false, "serve un accesso");
});

run("la copia che arriva non porta i contatti del cliente, e i posti sono quelli spuntati", async () => {
  const sporco = { ...SNAP, contacts: [{ name: "Anna", contact: "anna@example.invalid" }], techContact: "Anna", pdfHeader: "Anna · 340" };
  const r = await rpc(env, T.cliente, "orc_client_request_create", { project: PROJ, snap: sporco, fields: FIELDS, slots: SLOTS });
  assert.ok(r.ok, JSON.stringify(r.d));
  const row = (await rest(env, T.societa, "orc_client_requests?select=snapshot&id=eq." + r.d)).d[0];
  const testo = JSON.stringify(row.snapshot);
  assert.doesNotMatch(testo, /Anna|anna@|techContact|pdfHeader|contacts/, "la rubrica del cliente non entra nel gestionale");
  assert.match(testo, /Villa/, "il resto della copia c'è");
  const slots = (await rest(env, T.societa, "orc_client_request_slots?select=label,qty,covered&request_id=eq." + REQ + "&order=sort")).d;
  assert.deepEqual(slots, [{ label: "Vl I 1-2", qty: 2, covered: false }, { label: "Vla", qty: 1, covered: true }, { label: "Fl", qty: 1, covered: false }]);
});

run("il cliente vede solo la sua richiesta, e non i dati interni; un estraneo non vede niente", async () => {
  const mie = (await rpc(env, T.cliente, "orc_my_client_requests")).d;
  assert.equal(mie.length, 2);
  assert.equal(mie[0].status, "ricevuta", "lo stato che vede è quello buono per lui");
  assert.equal(mie[0].n_needed, 3, "tre musicisti chiesti: la doppia vale due, quello coperto non conta");
  assert.ok(!("taken_by" in mie[0]) && !("notes" in mie[0]), "niente lavorazione interna");
  const suoi = await rest(env, T.cliente, "orc_client_requests?select=id,contact_name");
  assert.equal(suoi.status, 200); assert.equal(suoi.d.length, 2, "legge le proprie righe");
  const altrui = await rest(env, T.estraneo, "orc_client_requests?select=id");
  assert.equal(altrui.status, 200); assert.deepEqual(altrui.d, [], "un altro cliente non vede le richieste");
  assert.deepEqual((await rpc(env, T.estraneo, "orc_my_client_requests")).d, []);
  const slotAltrui = await rest(env, T.estraneo, "orc_client_request_slots?select=id");
  assert.deepEqual(slotAltrui.d, [], "nemmeno i posti");
});

run("la società legge le richieste che le arrivano; un'altra organizzazione no", async () => {
  const l = (await rpc(env, T.societa, "orc_client_requests_list", { org: ORG })).d;
  assert.equal(l.length, 2);
  assert.equal(l[0].contact_name, "Mario Rossi");
  assert.equal(l[0].n_needed, 3, "i posti che chiede davvero, non quelli che copre lui");
  assert.deepEqual((await rpc(env, T.ownerB, "orc_client_requests_list", { org: ORG })).d, [], "un'altra organizzazione non legge");
  const dirette = await rest(env, T.ownerB, "orc_client_requests?select=id,contact_email");
  assert.deepEqual(dirette.d, [], "nemmeno via REST");
});

run("quello che è arrivato non si modifica più: né dal cliente né dalla società", async () => {
  const cliente = await rest(env, T.cliente, "orc_client_requests?id=eq." + REQ, { method: "PATCH", body: { event_title: "Cambiato dopo" } });
  assert.equal(cliente.ok, false, "il cliente non riscrive la richiesta mandata");
  const societa = await rest(env, T.societa, "orc_client_requests?id=eq." + REQ, { method: "PATCH", body: { budget: "500 €" } });
  assert.equal(societa.ok, false, "e nemmeno la società");
  const srv = await rest(env, admin(env), "orc_client_requests?id=eq." + REQ, { method: "PATCH", body: { notes: "riscritto dal servizio" } });
  assert.equal(srv.ok, false, "il trigger vale anche per il servizio: è una prova, non una bozza");
  const slot = await rest(env, admin(env), "orc_client_request_slots?request_id=eq." + REQ, { method: "PATCH", body: { qty: 99 } });
  assert.equal(slot.ok, false, "i posti chiesti restano quelli");
});

run("la lavorazione: solo la società, e solo stato ed evento collegato", async () => {
  assert.equal((await rpc(env, T.cliente, "orc_client_request_set_status", { req: REQ, new_status: "taken" })).ok, false, "il cliente non lavora la propria richiesta");
  assert.equal((await rpc(env, T.ownerB, "orc_client_request_set_status", { req: REQ, new_status: "taken" })).ok, false, "un'altra organizzazione nemmeno");
  assert.equal((await rpc(env, T.societa, "orc_client_request_set_status", { req: REQ, new_status: "inventato" })).ok, false, "stato inventato");
  assert.ok((await rpc(env, T.societa, "orc_client_request_set_status", { req: REQ, new_status: "taken" })).ok);
  const r = (await rest(env, T.societa, "orc_client_requests?select=status,taken_by,taken_at&id=eq." + REQ)).d[0];
  assert.equal(r.status, "taken"); assert.equal(r.taken_by, U.societa); assert.ok(r.taken_at);
  /* una produzione di un'altra organizzazione non si aggancia */
  const pb = await rest(env, T.ownerB, "orc_productions", { method: "POST", body: { org_id: ORG_B, title: "Sua", kind: "concerto" } });
  assert.equal((await rpc(env, T.societa, "orc_client_request_set_status", { req: REQ, new_status: "quoted", production: pb.d[0].id })).ok, false);
  /* il cliente ora vede «in lavorazione», non «taken» */
  assert.equal((await rpc(env, T.cliente, "orc_my_client_requests")).d.find((x) => x.id === REQ).status, "in lavorazione");
  const log = (await rest(env, T.societa, "orc_audit_log?select=action&org_id=eq." + ORG + "&action=eq.client_request.status")).d;
  assert.ok(log.length >= 1, "la lavorazione resta nel registro");
});

run("si rimette com'era: una sola organizzazione riceve le richieste", async () => {
  await rest(env, admin(env), "orc_organizations?id=eq." + ORG, { method: "PATCH", body: { is_service_provider: false } });
  if (PRIMA) await rest(env, admin(env), "orc_organizations?id=eq." + PRIMA, { method: "PATCH", body: { is_service_provider: true } });
  const acceso = await rest(env, admin(env), "orc_organizations?select=id&is_service_provider=is.true");
  assert.ok(acceso.d.length <= 1, "mai due società che ricevono le stesse richieste");
});
