/* La matrice degli attacchi (audit dell'11/09). Ogni ruolo prova, direttamente sull'API come farebbe un
   attaccante, a leggere o fare quello che non gli spetta: l'anonimo, un musicista dell'organizzazione, un
   cliente, un «visualizzatore», il titolare di un'altra organizzazione. Per ogni azione il titolare
   dell'organizzazione fa la stessa cosa e DEVE riuscirci: un «negato» che dipende da una chiamata sbagliata
   non vale niente (test che discriminano). */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-att-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
const D = {};

/* vuoto o rifiutato: per una lettura va bene tutti e due, purché non torni niente */
const nienteLetto = (r) => !r.ok || (Array.isArray(r.d) && r.d.length === 0);

run("preparazione: due organizzazioni, un musicista con account, un cliente, un visualizzatore", async () => {
  for (const n of ["ownerA", "viewerA", "ownerB", "musicista", "cliente", "altroCliente"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  T.anon = env.ANON_KEY;
  D.A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Att A", org_slug: "att-a-" + stamp, owner_email: mail("ownerA") })).d;
  D.B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Att B", org_slug: "att-b-" + stamp, owner_email: mail("ownerB") })).d;
  assert.ok(D.A && D.B);
  assert.ok((await rpc(env, T.ownerA, "orc_add_member_by_email", { org: D.A, member_email: mail("viewerA"), new_role: "viewer" })).ok);
  /* il musicista: una riga in rubrica collegata al suo account, con note private dello staff */
  assert.ok((await rpc(env, T.ownerA, "orc_import_musicians", { org: D.A, rows: [{ first_name: "Mu", last_name: "Sico", email: mail("musicista"), instruments: [{ code: "violino", primary: true, level: 4 }] }] })).ok);
  D.M = (await rpc(env, T.ownerA, "orc_musicians_list", { org: D.A })).d[0].id;
  assert.ok((await rest(env, T.ownerA, "orc_musicians?id=eq." + D.M, { method: "PATCH", body: { notes_private: "segreto dello staff " + stamp } })).ok);
  assert.equal((await rpc(env, T.musicista, "orc_link_my_musician_rows", {})).d, 1, "il musicista si collega con l'email verificata");
  assert.ok((await rest(env, T.ownerA, "orc_evaluations", { method: "POST", body: { org_id: D.A, musician_id: D.M, kind: "interview", outcome: "ok", private_note: "valutazione riservata" } })).ok);
  /* una produzione, un ruolo, un posto */
  D.P = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: D.A, title: "Att " + stamp, status: "planning", fee_note: "250 €" } })).d[0].id;
  D.R = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: D.P, instrument_code: "violino", name: "Violini", seats: 2 } })).d[0].id;
  D.S = (await rest(env, T.ownerA, "orc_staffing_slots?select=id&role_id=eq." + D.R)).d[0].id;
  /* una richiesta del cliente ad A, con preventivo mandato */
  D.Q_REQ = (await rest(env, admin(env), "orc_client_requests", { method: "POST", body: { org_id: D.A, user_id: U.cliente, contact_name: "Cli", contact_email: mail("cliente"), event_title: "Serata " + stamp } })).d[0].id;
  const q = await rpc(env, T.ownerA, "orc_quote_save", { request: D.Q_REQ, margin: 20, vat: 22, description: "Duo", notes: "nota interna " + stamp, lines: [{ label: "Violino", qty: 2, fee_cents: 25000 }] });
  assert.ok(q.ok, JSON.stringify(q.d)); D.Q = q.d;
  assert.ok((await rpc(env, T.ownerA, "orc_quote_send", { quote: D.Q })).ok);
});

/* le letture: cosa ciascuno NON deve vedere; il titolare di A deve vederlo */
const LETTURE = [
  ["le note private sui musicisti", () => "orc_musicians?select=notes_private&id=eq." + D.M],
  ["le valutazioni interne", () => "orc_evaluations?select=private_note&musician_id=eq." + D.M],
  ["i cachet del preventivo", () => "orc_quote_lines?select=fee_cents&quote_id=eq." + D.Q],
  ["margine e note interne del preventivo", () => "orc_quotes?select=margin_pct,notes_internal&id=eq." + D.Q],
  ["le richieste dei clienti", () => "orc_client_requests?select=contact_email&id=eq." + D.Q_REQ],
  ["il compenso della produzione", () => "orc_productions?select=fee_note&id=eq." + D.P],
  ["i posti dell'organico", () => "orc_staffing_slots?select=id&id=eq." + D.S],
  ["il registro delle attività", () => "orc_audit_log?select=action&org_id=eq." + D.A],
  ["chi fa parte dell'organizzazione", () => "orc_memberships?select=role&org_id=eq." + D.A],
];
for (const [cosa, path] of LETTURE) {
  run("lettura — " + cosa + ": il titolare sì, gli altri no", async () => {
    const t = await rest(env, T.ownerA, path());
    assert.ok(t.ok && t.d.length > 0, "controllo positivo: il titolare la legge (" + JSON.stringify(t.d).slice(0, 80) + ")");
    for (const chi of ["anon", "musicista", "cliente", "viewerA", "ownerB"]) {
      if (cosa === "chi fa parte dell'organizzazione" && chi === "viewerA") continue;   /* la propria appartenenza la vede */
      const r = await rest(env, T[chi], path());
      assert.ok(nienteLetto(r), chi + " legge " + cosa + ": " + JSON.stringify(r.d).slice(0, 120));
    }
  });
}

run("il segreto delle convocazioni non lo legge nessuno, nemmeno il titolare", async () => {
  for (const chi of ["anon", "musicista", "cliente", "viewerA", "ownerB", "ownerA"]) {
    const r = await rest(env, T[chi], "orc_invitation_secrets?select=token&limit=1");
    assert.ok(nienteLetto(r), chi + " legge i token: " + JSON.stringify(r.d).slice(0, 80));
  }
});

/* le azioni: lo staff di A può, gli altri no. Ogni azione ha il suo controllo positivo in fondo. */
const AZIONI = [
  ["convocare", () => ["orc_invite", { production: D.P, role: D.R, musicians: [D.M] }]],
  ["assegnare un posto", () => ["orc_assign_slot", { slot: D.S, musician: D.M, reason: "" }]],
  ["preparare un preventivo", () => ["orc_quote_save", { request: D.Q_REQ, margin: 99, vat: 22, description: "x", notes: "", lines: [] }]],
  ["creare l'evento da una richiesta", () => ["orc_production_from_request", { req: D.Q_REQ }]],
  ["leggere i candidati del matching", () => ["orc_matching_candidates", { production: D.P, role: D.R }]],
  ["cambiare lo stato di una richiesta", () => ["orc_client_request_set_status", { req: D.Q_REQ, new_status: "closed", production: null }]],
  ["aprire le candidature", () => ["orc_set_accepting", { org: D.A, accepting: true, intro: "" }]],
  ["aggiungere un membro", () => ["orc_add_member_by_email", { org: D.A, member_email: mail("altroCliente"), new_role: "admin" }]],
];
for (const [cosa, fn] of AZIONI) {
  run("azione — " + cosa + ": nessun estraneo ci riesce", async () => {
    const [f, args] = fn();
    for (const chi of ["anon", "musicista", "cliente", "viewerA", "ownerB"]) {
      const r = await rpc(env, T[chi], f, args);
      const riuscita = r.ok && r.d !== null && !(Array.isArray(r.d) && r.d.length === 0) && r.d !== 0;
      assert.ok(!riuscita, chi + " riesce a " + cosa + ": " + JSON.stringify(r.d).slice(0, 120));
    }
  });
}
run("controllo positivo: le stesse azioni al titolare riescono", async () => {
  for (const [cosa, fn] of AZIONI) {
    const [f, args] = fn();
    const r = await rpc(env, T.ownerA, f, args);
    assert.ok(r.ok, "il titolare non riesce a " + cosa + ": " + JSON.stringify(r.d).slice(0, 160));
  }
});

run("il musicista non si scrive da solo: né la sua scheda, né una valutazione, né un posto", async () => {
  const s = await rest(env, T.musicista, "orc_musicians?id=eq." + D.M, { method: "PATCH", body: { notes_private: "scritto da me", status: "active" } });
  assert.ok(nienteLetto(s), "la scheda dello staff: " + JSON.stringify(s.d).slice(0, 80));
  const e = await rest(env, T.musicista, "orc_evaluations", { method: "POST", body: { org_id: D.A, musician_id: D.M, kind: "interview", outcome: "ottimo", private_note: "mi valuto io" } });
  assert.equal(e.ok, false, "una valutazione su di sé");
  const p = await rest(env, T.musicista, "orc_staffing_slots?id=eq." + D.S, { method: "PATCH", body: { musician_id: D.M, status: "confirmed" } });
  assert.ok(nienteLetto(p), "un posto: " + JSON.stringify(p.d).slice(0, 80));
});

run("promuoversi: nessuno diventa titolare o fornitore del servizio da solo", async () => {
  const self = await rpc(env, T.viewerA, "orc_set_member_role", { org: D.A, target: U.viewerA, new_role: "owner" });
  assert.equal(self.ok, false, "il visualizzatore si fa titolare: " + JSON.stringify(self.d));
  const b = await rpc(env, T.ownerB, "orc_set_member_role", { org: D.A, target: U.ownerB, new_role: "owner" });
  assert.equal(b.ok, false, "il titolare di B entra in A");
  for (const chi of ["viewerA", "ownerA", "ownerB"]) {
    const r = await rest(env, T[chi], "orc_organizations?id=eq." + D.A, { method: "PATCH", body: { is_service_provider: true } });
    const ora = (await rest(env, admin(env), "orc_organizations?select=is_service_provider&id=eq." + D.A)).d[0];
    assert.equal(ora.is_service_provider, false, chi + " accende «riceve le richieste di tutti i clienti»: " + JSON.stringify(r.d).slice(0, 80));
  }
  assert.equal((await rpc(env, T.musicista, "orc_bootstrap_org", { org_name: "Mia", org_slug: "mia-" + stamp, owner_email: mail("musicista") })).ok, false, "nessuno si crea un'organizzazione da solo");
});

run("il cliente vede solo i suoi preventivi, e non risponde a quelli degli altri", async () => {
  const mio = (await rpc(env, T.cliente, "orc_my_quotes", {})).d;
  assert.equal(mio.length, 1, "controllo positivo: il suo c'è");
  assert.equal(JSON.stringify(mio).includes("25000") || JSON.stringify(mio).includes("margin") || JSON.stringify(mio).includes("nota interna"), false, "senza cachet, margine o note");
  assert.deepEqual((await rpc(env, T.altroCliente, "orc_my_quotes", {})).d, [], "un altro cliente non lo vede");
  assert.equal((await rpc(env, T.altroCliente, "orc_quote_answer", { quote: D.Q, accept: true })).ok, false, "e non lo accetta al posto suo");
  assert.equal((await rpc(env, T.ownerA, "orc_quote_answer", { quote: D.Q, accept: true })).ok, false, "nemmeno la società lo accetta al posto del cliente");
});
