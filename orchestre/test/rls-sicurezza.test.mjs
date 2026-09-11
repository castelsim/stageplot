/* Le sei cose che l'audit di sicurezza del 10/09 ha trovato aperte (migrazione 0056).
   Ognuna qui ha la prova che nessun test faceva: il caso ostile, non quello legittimo. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";
import { createHash, randomBytes } from "node:crypto";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-sec-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG, VIOLINISTA;
const impronta = (t) => createHash("sha256").update(t).digest("hex");

async function compila(token, uid, nome, email) {
  const p = (await rpc(env, token, "orc_ensure_musician_profile", {})).d;
  const body = { first_name: nome, last_name: "Prova", phone: "340 000 0000", city: "Vicenza", province: "vi", bio: "Vent'anni di palco.",
    consent_privacy_version: "2026-09-09", consent_privacy_at: new Date().toISOString() };
  if (email) body.email = email;   /* il campo lo scrive l'utente: è il punto di tutta la prova */
  assert.ok((await rest(env, token, "orc_musician_profiles?id=eq." + p.id, { method: "PATCH", body })).ok);
  assert.ok((await rest(env, token, "orc_profile_instruments", { method: "POST", body: { profile_id: p.id, instrument_code: "violino", is_primary: true, level: 4 } })).ok);
  assert.ok((await rest(env, token, "orc_consents", { method: "POST", body: { user_id: uid, kind: "privacy", version: "2026-09-09" } })).ok);
  return p.id;
}

run("preparazione: la società, un violinista già in rubrica, e un estraneo", async () => {
  U.societa = await mkUser(env, mail("societa")); T.societa = await login(env, mail("societa"));
  U.furbo = await mkUser(env, mail("furbo")); T.furbo = await login(env, mail("furbo"));
  U.altro = await mkUser(env, mail("altro")); T.altro = await login(env, mail("altro"));
  const o = await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Sec " + stamp, org_slug: "sec-" + stamp, owner_email: mail("societa") });
  assert.ok(o.ok && o.d, JSON.stringify(o.d)); ORG = o.d;
  assert.ok((await rpc(env, T.societa, "orc_set_accepting", { org: ORG, accepting: true, intro: "" })).ok);
  /* come un import da CSV: la riga esiste, l'indirizzo c'è, ma nessun account l'ha ancora rivendicata */
  const m = await rest(env, admin(env), "orc_musicians", { method: "POST", body: {
    org_id: ORG, first_name: "Giulia", last_name: "Verdi", email: mail("giulia"), status: "active", source: "import" } });
  assert.ok(m.ok, JSON.stringify(m.d)); VIOLINISTA = m.d[0].id;
  assert.equal(m.d[0].user_id, null, "una riga importata non ha padrone");
});

run("1. l'identità non si dichiara: l'email scritta a mano non prende la riga di un altro", async () => {
  /* Il difetto: `orc_musician_profiles.email` è un campo di testo che l'utente scrive da sé, e
     `orc_application_accept` ci confrontava `orc_musicians.email` per poi scriverci dentro user_id.
     Con un invito la candidatura si accetta da sola, senza revisione umana: bastava dichiarare
     l'indirizzo giusto per ereditare convocazioni, note dello staff e compensi di quella persona. */
  const tok = randomBytes(32).toString("hex");
  assert.ok((await rpc(env, T.societa, "orc_musician_invite_create", { org: ORG, hash: impronta(tok), label: "chiunque" })).ok);
  assert.equal((await rpc(env, T.furbo, "orc_musician_invite_claim", { hash: impronta(tok) })).d[0].ok, true);
  await compila(T.furbo, U.furbo, "Furbo", mail("giulia"));   /* dichiara l'email di Giulia */
  const app = await rpc(env, T.furbo, "orc_apply", { org: ORG });
  const inviata = await rpc(env, T.furbo, "orc_submit_application", { app: app.d.id, msg: "eccomi" });
  assert.equal(inviata.ok, false, "la candidatura non passa: l'indirizzo è di un'altra scheda");
  assert.match(String(inviata.d.message || ""), /già in elenco/, "e lo dice a parole, non col 23505 nudo: " + JSON.stringify(inviata.d));
  const giulia = (await rest(env, T.societa, "orc_musicians?select=user_id,first_name&id=eq." + VIOLINISTA)).d[0];
  assert.equal(giulia.user_id, null, "la riga di Giulia non ha cambiato padrone");
  /* e di riflesso: nessuna convocazione di Giulia gli arriva */
  assert.deepEqual((await rpc(env, T.furbo, "orc_my_invitations", {})).d, []);

  /* il caso legittimo continua a funzionare: chi dichiara il proprio indirizzo entra, e chi è in
     rubrica con la stessa email con cui accede si collega alla propria riga */
  const t2 = randomBytes(32).toString("hex");
  assert.ok((await rpc(env, T.societa, "orc_musician_invite_create", { org: ORG, hash: impronta(t2), label: "altro" })).ok);
  assert.equal((await rpc(env, T.altro, "orc_musician_invite_claim", { hash: impronta(t2) })).d[0].ok, true);
  await compila(T.altro, U.altro, "Altro", null);
  const app2 = await rpc(env, T.altro, "orc_apply", { org: ORG });
  const ok2 = await rpc(env, T.altro, "orc_submit_application", { app: app2.d.id, msg: "eccomi" });
  assert.ok(ok2.ok, "chi non dichiara l'indirizzo di un altro entra: " + JSON.stringify(ok2.d));
  assert.equal(ok2.d.status, "accepted");
});

run("2. la purga di retention non è di chiunque passi di lì", async () => {
  /* security definer senza revoke: restava l'EXECUTE di default a PUBLIC, e la anon key è pubblica. */
  const anonimo = await rpc(env, env.ANON_KEY, "stageplot_purge_expired", {});
  assert.equal(anonimo.ok, false, "con la sola anon key non si cancella niente: " + JSON.stringify(anonimo.d));
  /* lo status dell'anonimo dipende da come il gateway locale tratta la chiave: quello che discrimina
     è la riga sotto, un utente vero e autenticato che riceve 404 perché il permesso non c'è più. */
  const loggato = await rpc(env, T.altro, "stageplot_purge_expired", {});
  assert.equal(loggato.ok, false, "e nemmeno con un account qualsiasi");
  /* Sul 403 non ci si può fermare: se il permesso c'è, la funzione GIRA e fallisce lo stesso con un
     42501, perché il Postgres locale ha un trigger che rifiuta le DELETE dirette sulle tabelle di
     storage. Due 403 con lo stesso codice e significati opposti — quello che discrimina è il
     messaggio. (Trovato con la mutazione: rimettendo il grant, il test restava verde.) */
  assert.equal(loggato.status, 403, JSON.stringify(loggato.d));
  assert.match(String(loggato.d.message || ""), /permission denied for function/, "il permesso non c'è, non è un errore qualunque: " + JSON.stringify(loggato.d));
  /* Che il cron continui a girare non si prova da qui: gira come `postgres`, che non passa da questi
     grant. Si prova che la funzione c'è ancora e che per il servizio è raggiungibile — la risposta
     può essere un errore del DB locale (i trigger di storage rifiutano le DELETE dirette), quello
     che conta è che NON sia il 404 di «non hai il permesso di vederla». */
  const servizio = await rpc(env, admin(env), "stageplot_purge_expired", {});
  assert.notEqual(servizio.status, 404, "per il servizio la funzione esiste: " + JSON.stringify(servizio.d));
});

run("la purga di retention CANCELLA davvero: quello scaduto sparisce, quello recente resta", async () => {
  /* Il test che mancava da luglio. Fino all'11/09 la funzione esisteva, i permessi erano giusti, e nessuno
     aveva mai provato che togliesse qualcosa: in produzione non era mai partita (pg_cron assente), e
     chiamata a mano falliva sul DELETE diretto in storage.objects, annullando anche gli analytics.
     Il record più vecchio aveva 55 giorni contro i 30 promessi. */
  const giorni = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
  const sid = "purga-" + stamp;
  const ins = await rest(env, admin(env), "analytics_events", { method: "POST", body: [
    { event: "prova_purga", session_id: sid, created_at: giorni(40), props: { quale: "vecchio" } },
    { event: "prova_purga", session_id: sid, created_at: giorni(10), props: { quale: "recente" } },
  ] });
  assert.ok(ins.ok, JSON.stringify(ins.d));
  const r = await rpc(env, admin(env), "stageplot_purge_expired", {});
  assert.ok(r.ok, "la purga gira, e non cade su nessun trigger: " + JSON.stringify(r.d));
  assert.ok(r.d && r.d.analytics_events >= 1, "e dice quante righe ha tolto: " + JSON.stringify(r.d));
  const rimasti = (await rest(env, admin(env), "analytics_events?select=props&session_id=eq." + sid)).d;
  assert.deepEqual(rimasti.map((x) => x.props.quale), ["recente"], "il vecchio è sparito, il recente è rimasto");
  await rest(env, admin(env), "analytics_events?session_id=eq." + sid, { method: "DELETE" });
});

run("i riferimenti alle schermate si tolgono fino a un giorno vero, e solo dal servizio", async () => {
  /* Il secondo passo della retention delle schermate (0061): la Edge Function toglie i file con la
     Storage API e poi chiama questa, con l'ultimo giorno scaduto. È security definer e riceve un
     confine: se accettasse qualsiasi stringa, o chiunque, sarebbe una cancellazione a comando. */
  const forget = (tok, d) => rpc(env, tok, "stageplot_forget_screenshots", { until_day: d });
  const a = await forget(env.ANON_KEY, "2026-08-11");
  assert.equal(a.ok, false, "l'anonimo no");
  const u = await forget(T.altro, "2026-08-11");
  assert.equal(u.status, 403, "un account qualsiasi no: " + JSON.stringify(u.d));
  assert.match(String(u.d.message || ""), /permission denied for function/);
  for (const storto of ["%", "2026-02-31", "2026-8-1", "", "2026-08-11' or '1'='1", "2026-08-11/%"]) {
    const r = await forget(admin(env), storto);
    assert.equal(r.ok, false, "«" + storto + "» non è un giorno: " + JSON.stringify(r.d));
  }
  const tag = "confine-" + stamp;
  const righe = [["2026-06-01/a.jpg", "vecchia"], ["2026-08-11/b.jpg", "sul confine"], ["2026-08-12/c.jpg", "il giorno dopo"], ["1999-strano/d.jpg", "percorso strano"]];
  const ins = await rest(env, admin(env), "feedback", { method: "POST", body: righe.map(([p, q]) => ({ message: tag + " " + q, screenshot_path: p })) });
  assert.ok(ins.ok, JSON.stringify(ins.d));
  const r = await forget(admin(env), "2026-08-11");
  assert.ok(r.ok, JSON.stringify(r.d));
  const dopo = (await rest(env, admin(env), "feedback?select=message,screenshot_path&message=like." + encodeURIComponent(tag + "%") + "&order=message")).d;
  const come = Object.fromEntries(dopo.map((x) => [x.message.slice(tag.length + 1), x.screenshot_path]));
  assert.equal(come["vecchia"], null, "il giorno scaduto perde il riferimento");
  assert.equal(come["sul confine"], null, "anche quello sul confine: è scaduto per intero");
  assert.equal(come["il giorno dopo"], "2026-08-12/c.jpg", "il giorno dopo il confine resta");
  /* «1999-strano» viene PRIMA del confine in ordine alfabetico: senza il filtro sulla forma del percorso
     verrebbe toccato. Con «non-una-data/» il test passava anche senza filtro — trovato con la mutazione. */
  assert.equal(come["percorso strano"], "1999-strano/d.jpg", "un percorso che non è una cartella-giorno non si tocca");
  await rest(env, admin(env), "feedback?message=like." + encodeURIComponent(tag + "%"), { method: "DELETE" });
});

run("4. la revoca del consenso funziona, e non si può retrodatare", async () => {
  /* Regressione del collaudo di ieri: tolto l'UPDATE, il pulsante «Non ricevere più richieste»
     rispondeva 403 — il diritto di revoca c'era nell'interfaccia e non funzionava. */
  assert.ok((await rest(env, T.altro, "orc_consents", { method: "POST", body: { user_id: U.altro, kind: "requests", version: "2026-09-09" } })).ok);
  const diretto = await rest(env, T.altro, "orc_consents?user_id=eq." + U.altro + "&kind=eq.requests", { method: "PATCH", body: { revoked_at: "2020-01-01T00:00:00Z" } });
  assert.equal(diretto.ok, false, "a mano no: sarebbe una data scelta dall'interessato");
  const r = await rpc(env, T.altro, "orc_consent_revoke", { kind_in: "requests" });
  assert.ok(r.ok, JSON.stringify(r.d)); assert.equal(r.d, 1, "una riga revocata");
  const riga = (await rest(env, T.altro, "orc_consents?select=revoked_at&user_id=eq." + U.altro + "&kind=eq.requests")).d[0];
  assert.ok(riga.revoked_at, "la revoca è scritta");
  assert.ok(new Date(riga.revoked_at) > new Date("2025-01-01"), "con l'ora del database, non con quella del client");
  assert.equal((await rpc(env, T.altro, "orc_consent_revoke", { kind_in: "requests" })).d, 0, "due volte non fa danni");
  const cancella = await rest(env, T.altro, "orc_consents?user_id=eq." + U.altro, { method: "DELETE" });
  assert.equal(cancella.ok, false, "e il consenso resta una prova: non si cancella");
});

run("5. chi riceve le richieste dei clienti non se lo sceglie da solo", async () => {
  /* is_service_provider decide quale organizzazione riceve nome, email, telefono, evento e palco
     di TUTTI i clienti. accepting_applications ha una RPC con controllo del ruolo; questo no. */
  const owner = await rest(env, T.societa, "orc_organizations?id=eq." + ORG, { method: "PATCH", body: { is_service_provider: true } });
  assert.equal(owner.ok, false, "nemmeno il proprietario, e nemmeno sulla propria");
  /* ⚠️ Sul solo fallimento non ci si può fermare: finché un'altra organizzazione ha il flag acceso,
     il PATCH cade sull'indice unico (23505) e il test passerebbe anche senza nessun divieto. È così
     che il primo tentativo di correzione — un revoke sulla singola colonna, che in Postgres non
     morde quando il grant è sull'intera tabella — era sembrato funzionare. Qui si pretende il
     messaggio del divieto. */
  assert.match(String(owner.d.message || ""), /si decide da chi amministra/, "e cade sul divieto, non su un vincolo di unicità: " + JSON.stringify(owner.d));
  const stato = (await rest(env, admin(env), "orc_organizations?select=is_service_provider&id=eq." + ORG)).d[0];
  assert.equal(stato.is_service_provider, false, "il flag è rimasto giù");
  /* Chi amministra il progetto non incontra il divieto. Che poi ci riesca dipende dall'indice unico
     parziale — se un'altra organizzazione ha già il flag acceso, il 23505 è il comportamento voluto:
     quello che conta qui è che non sia il trigger a fermarlo. */
  const srv = await rest(env, admin(env), "orc_organizations?id=eq." + ORG, { method: "PATCH", body: { is_service_provider: true } });
  assert.doesNotMatch(String(srv.d && srv.d.message || ""), /si decide da chi amministra/, "il servizio passa dal divieto: " + JSON.stringify(srv.d));
  if (srv.ok) assert.ok((await rest(env, admin(env), "orc_organizations?id=eq." + ORG, { method: "PATCH", body: { is_service_provider: false } })).ok, "e lo rispegne");
  /* quello che l'organizzazione può cambiare da sé continua a funzionare */
  assert.ok((await rest(env, T.societa, "orc_organizations?id=eq." + ORG, { method: "PATCH", body: { name: "Sec rinominata" } })).ok);
});

run("6. il palco importato dev'essere di chi lo importa", async () => {
  const prog = await rest(env, admin(env), "stageplot_projects", { method: "POST", body: {
    user_id: U.altro, title: "Palco di un estraneo", data: { items: [] } } });
  assert.ok(prog.ok, JSON.stringify(prog.d));
  const PROJ = prog.d[0].id;
  const p = await rest(env, T.societa, "orc_productions", { method: "POST", body: { org_id: ORG, title: "Prova import", created_by: U.societa } });
  assert.ok(p.ok, JSON.stringify(p.d));
  const imp = await rpc(env, T.societa, "orc_stageplot_import", { production: p.d[0].id, project: PROJ, variant: "", groups: [] });
  assert.equal(imp.ok, false, "un uuid qualsiasi non basta più: " + JSON.stringify(imp.d));
  const legami = (await rest(env, admin(env), "orc_stageplot_links?select=id&production_id=eq." + p.d[0].id)).d;
  assert.deepEqual(legami, [], "e non è rimasto nessun legame al progetto altrui");
});

run("7. la valutazione legata al solo musicista torna scrivibile", async () => {
  /* Non è sicurezza: la with check di 0051 pretendeva org_id = orc_application_org(application_id),
     e con application_id nullo — caso previsto dal vincolo — l'espressione vale NULL e l'insert cade. */
  const e = await rest(env, T.societa, "orc_evaluations", { method: "POST", body: {
    org_id: ORG, musician_id: VIOLINISTA, kind: "general", technical: 4, private_note: "sentita in prova" } });
  assert.ok(e.ok, "valutazione sul solo musicista: " + JSON.stringify(e.d));
  const altrove = await rest(env, T.societa, "orc_evaluations", { method: "POST", body: {
    org_id: ORG, musician_id: VIOLINISTA, kind: "general", technical: 4 } });
  assert.ok(altrove.ok, "e resta scrivibile");
});
