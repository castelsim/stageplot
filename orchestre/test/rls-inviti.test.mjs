/* L'invito personale a un musicista: chi lo crea, chi lo può usare, e cosa succede quando manda il profilo.
   La promessa è «chi arriva dal mio link entra diretto»: qui si prova che vale solo per lui, solo una volta,
   e solo finché l'invito è vivo. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";
import { createHash, randomBytes } from "node:crypto";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "i" + Date.now().toString(36);
const mail = (n) => `orc-inv-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG, ORG_B, INV, TOKEN, APP_BRUNO;

const nuovoToken = () => randomBytes(32).toString("hex");
const impronta = (t) => createHash("sha256").update(t).digest("hex");

/* Il profilo minimo che serve per poter mandare la candidatura: i campi obbligatori, uno strumento e il
   consenso privacy versionato (senza, `orc_submit_application` rifiuta — ed è giusto così). */
async function compila(token, uid, nome) {
  const r = await rpc(env, token, "orc_ensure_musician_profile", {});
  assert.ok(r.ok && r.d && r.d.id, "il profilo nasce al primo accesso: " + JSON.stringify(r.d));
  const p = r.d;
  const u = await rest(env, token, "orc_musician_profiles?id=eq." + p.id, { method: "PATCH", body: { first_name: nome, last_name: "Prova", phone: "340 000 0000", city: "Vicenza", province: "vi", bio: "Violinista da vent'anni." } });
  assert.ok(u.ok, JSON.stringify(u.d));
  const i = await rest(env, token, "orc_profile_instruments", { method: "POST", body: { profile_id: p.id, instrument_code: "violino", is_primary: true, level: 4 } });
  assert.ok(i.ok, JSON.stringify(i.d));
  const c = await rest(env, token, "orc_consents", { method: "POST", body: { user_id: uid, kind: "privacy", version: "2026-09-09" } });
  assert.ok(c.ok, JSON.stringify(c.d));
  const cp = await rest(env, token, "orc_musician_profiles?id=eq." + p.id, { method: "PATCH", body: { consent_privacy_version: "2026-09-09", consent_privacy_at: new Date().toISOString() } });
  assert.ok(cp.ok, JSON.stringify(cp.d));
  return p.id;
}

run("preparazione: la società, un'altra org, due musicisti", async () => {
  /* Anna ha il nome completo, Bruno no: un account Google scarno non deve impedire di compilare il profilo */
  U.societa = await mkUser(env, mail("societa")); T.societa = await login(env, mail("societa"));
  U.altraOrg = await mkUser(env, mail("altraOrg")); T.altraOrg = await login(env, mail("altraOrg"));
  U.anna = await mkUser(env, mail("anna"), undefined, { full_name: "Anna Bianchi" }); T.anna = await login(env, mail("anna"));
  U.bruno = await mkUser(env, mail("bruno")); T.bruno = await login(env, mail("bruno"));
  const a = await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Inv A", org_slug: "inv-a-" + stamp, owner_email: mail("societa") });
  assert.ok(a.ok && a.d, "org A: " + JSON.stringify(a.d)); ORG = a.d;
  const b = await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Inv B", org_slug: "inv-b-" + stamp, owner_email: mail("altraOrg") });
  assert.ok(b.ok && b.d, "org B: " + JSON.stringify(b.d)); ORG_B = b.d;
  const acc = await rpc(env, T.societa, "orc_set_accepting", { org: ORG, accepting: true, intro: "" });
  assert.ok(acc.ok, "accensione candidature: " + JSON.stringify(acc.d));
});

run("il profilo nasce anche senza nome e cognome nell'account", async () => {
  const r = await rpc(env, T.bruno, "orc_ensure_musician_profile", {});
  assert.ok(r.ok && r.d && r.d.id, "un account Google senza nome completo non deve bloccare tutto: " + JSON.stringify(r.d));
  assert.equal(r.d.last_name, "", "il cognome si chiede dopo, nel primo passo");
  assert.equal(r.d.email, mail("bruno"));
});

run("l'invito lo crea solo lo staff, e il segreto non finisce nel database", async () => {
  TOKEN = nuovoToken();
  const h = impronta(TOKEN);
  assert.equal((await rpc(env, T.anna, "orc_musician_invite_create", { org: ORG, hash: h })).ok, false, "un musicista non invita se stesso");
  assert.equal((await rpc(env, T.altraOrg, "orc_musician_invite_create", { org: ORG, hash: h })).ok, false, "un'altra organizzazione nemmeno");
  assert.equal((await rpc(env, T.societa, "orc_musician_invite_create", { org: ORG, hash: "corto" })).ok, false, "un'impronta storta si rifiuta");
  const c = await rpc(env, T.societa, "orc_musician_invite_create", { org: ORG, hash: h, label: "Anna, violino", email: mail("anna") });
  assert.ok(c.ok, JSON.stringify(c.d)); INV = c.d;
  const riga = (await rest(env, T.societa, "orc_musician_invites?select=token_hash,label,status&id=eq." + INV)).d[0];
  assert.equal(riga.token_hash, h, "nel database c'è l'impronta");
  assert.notEqual(riga.token_hash, TOKEN, "e non il segreto del link");
  assert.equal(riga.status, "open");
  /* nessun altro vede gli inviti dell'organizzazione */
  assert.deepEqual((await rest(env, T.altraOrg, "orc_musician_invites?select=id")).d, []);
  assert.deepEqual((await rest(env, T.anna, "orc_musician_invites?select=id")).d, []);
  assert.deepEqual((await rpc(env, T.altraOrg, "orc_musician_invites_list", { org: ORG })).d, []);
});

run("un invito sbagliato non dice mai perché, e non lascia entrare", async () => {
  const inventato = await rpc(env, T.anna, "orc_musician_invite_claim", { hash: impronta(nuovoToken()) });
  assert.equal(inventato.d[0].ok, false);
  assert.equal(inventato.d[0].org_id, null, "non si scopre nemmeno di quale organizzazione si tratta");
  const storto = await rpc(env, T.anna, "orc_musician_invite_claim", { hash: "non-una-impronta" });
  assert.equal(storto.d[0].ok, false);
});

run("chi ha il link entra: apre l'invito, compila e appena manda è fra i musicisti", async () => {
  const apri = await rpc(env, T.anna, "orc_musician_invite_claim", { hash: impronta(TOKEN) });
  assert.equal(apri.d[0].ok, true);
  assert.equal(apri.d[0].org_id, ORG);
  assert.equal(apri.d[0].org_name, "Inv A", "sa chi l'ha invitata");
  /* riaprirlo lei stessa va bene: il link si può cliccare due volte */
  assert.equal((await rpc(env, T.anna, "orc_musician_invite_claim", { hash: impronta(TOKEN) })).d[0].ok, true);
  await compila(T.anna, U.anna, "Anna");
  const app = await rpc(env, T.anna, "orc_apply", { org: ORG });
  assert.ok(app.ok && app.d && app.d.id, JSON.stringify(app.d));
  const inviata = await rpc(env, T.anna, "orc_submit_application", { app: app.d.id, msg: "eccomi" });
  assert.ok(inviata.ok, JSON.stringify(inviata.d));
  assert.equal(inviata.d.status, "accepted", "l'invito porta la fiducia con sé: niente valutazione");
  assert.ok(inviata.d.musician_id, "ed è nata la riga fra i musicisti");
  const m = (await rest(env, T.societa, "orc_musicians?select=first_name,last_name,user_id,source,status&id=eq." + inviata.d.musician_id)).d[0];
  assert.equal(m.first_name, "Anna"); assert.equal(m.user_id, U.anna); assert.equal(m.status, "active");
  const mi = (await rest(env, T.societa, "orc_musician_instruments?select=instrument_code&musician_id=eq." + inviata.d.musician_id)).d;
  assert.deepEqual(mi, [{ instrument_code: "violino" }], "con lo strumento che ha dichiarato");
  const inv = (await rest(env, T.societa, "orc_musician_invites?select=status,musician_id&id=eq." + INV)).d[0];
  assert.equal(inv.status, "done"); assert.equal(inv.musician_id, inviata.d.musician_id, "l'invito si chiude su quella persona");
});

run("l'invito me lo ricordo anch'io: chi è entrato dal link lo rilegge quando torna", async () => {
  /* La pagina del musicista si dimentica tutto a ogni ricarica: senza questa domanda al database, chi
     arriva dal link e torna il giorno dopo non legge più da chi è stato invitato — e la promessa
     «appena mandi sei fra i loro musicisti» sparisce proprio quando deve premere il pulsante. */
  const t = nuovoToken();
  const c = await rpc(env, T.societa, "orc_musician_invite_create", { org: ORG, hash: impronta(t), label: "Bruno, corno" });
  assert.ok(c.ok, JSON.stringify(c.d));
  assert.deepEqual((await rpc(env, T.bruno, "orc_my_invite", {})).d, [], "prima di aprirlo non c'è niente da ricordare");
  assert.equal((await rpc(env, T.bruno, "orc_musician_invite_claim", { hash: impronta(t) })).d[0].ok, true);
  const mio = await rpc(env, T.bruno, "orc_my_invite", {});
  assert.equal((mio.d || []).length, 1, "aperto il link, l'invito è suo e se lo ricorda");
  assert.equal(mio.d[0].org_name, "Inv A", "e sa da chi arriva");
  assert.deepEqual((await rpc(env, T.altraOrg, "orc_my_invite", {})).d, [], "l'invito di uno non si legge da un altro account");
  assert.deepEqual((await rpc(env, T.anna, "orc_my_invite", {})).d, [], "e chi è già entrato non ha più niente in sospeso");
  /* revocato: sparisce anche a lui, e il resto della prova riparte da Bruno senza invito */
  assert.ok((await rpc(env, T.societa, "orc_musician_invite_revoke", { inv: c.d })).ok);
  assert.deepEqual((await rpc(env, T.bruno, "orc_my_invite", {})).d, [], "revocato, non c'è più niente da ricordare");
});

run("un invito già usato non si gira a un altro, e uno revocato non vale più", async () => {
  const altro = await rpc(env, T.bruno, "orc_musician_invite_claim", { hash: impronta(TOKEN) });
  assert.equal(altro.d[0].ok, false, "il link è personale");
  assert.equal(altro.d[0].motivo, "gia usato");
  /* un invito nuovo, revocato prima di essere aperto */
  const t2 = nuovoToken();
  const c = await rpc(env, T.societa, "orc_musician_invite_create", { org: ORG, hash: impronta(t2), label: "Bruno" });
  assert.ok((await rpc(env, T.societa, "orc_musician_invite_revoke", { inv: c.d })).ok);
  assert.equal((await rpc(env, T.bruno, "orc_musician_invite_claim", { hash: impronta(t2) })).d[0].ok, false, "revocato: non entra");
  assert.equal((await rpc(env, T.altraOrg, "orc_musician_invite_revoke", { inv: c.d })).ok, false, "e non lo revoca un'altra organizzazione");
});

run("un invito scaduto non vale, e senza invito la candidatura resta da valutare", async () => {
  const t3 = nuovoToken();
  const c = await rpc(env, T.societa, "orc_musician_invite_create", { org: ORG, hash: impronta(t3), label: "Vecchio" });
  await rest(env, admin(env), "orc_musician_invites?id=eq." + c.d, { method: "PATCH", body: { expires_at: "2020-01-01T00:00:00Z" } });
  assert.equal((await rpc(env, T.bruno, "orc_musician_invite_claim", { hash: impronta(t3) })).d[0].ok, false, "scaduto");
  /* Bruno si candida senza invito: percorso normale, con la valutazione */
  await compila(T.bruno, U.bruno, "Bruno");
  const app = await rpc(env, T.bruno, "orc_apply", { org: ORG });
  assert.ok(app.ok && app.d && app.d.id, JSON.stringify(app.d));
  APP_BRUNO = app.d.id;
  const inviata = await rpc(env, T.bruno, "orc_submit_application", { app: app.d.id, msg: "" });
  assert.ok(inviata.ok, JSON.stringify(inviata.d));
  assert.equal(inviata.d.status, "submitted", "senza invito si passa dalla valutazione, come prima");
  assert.equal(inviata.d.musician_id, null, "e non è ancora fra i musicisti");
});

run("nessuno si fa entrare da solo: l'accettazione non si chiama a mano", async () => {
  /* orc_application_accept fa il lavoro vero (crea la riga fra i musicisti) e non ha controlli suoi:
     è chiamabile solo dalle due funzioni che verificano chi sei. Da fuori non deve esistere. */
  assert.ok(APP_BRUNO, "Bruno ha una candidatura in attesa di valutazione");
  assert.equal((await rpc(env, T.bruno, "orc_application_accept", { app: APP_BRUNO })).ok, false, "un candidato non si accetta da sé");
  assert.equal((await rpc(env, T.altraOrg, "orc_application_accept", { app: APP_BRUNO })).ok, false, "e nemmeno un'altra organizzazione");
  const dopo = (await rest(env, T.societa, "orc_applications?select=status,musician_id&id=eq." + APP_BRUNO)).d[0];
  assert.equal(dopo.status, "submitted", "resta da valutare");
  assert.equal(dopo.musician_id, null, "e non è comparso fra i musicisti");
});

run("la fotografia sta con gli altri materiali, e la vede solo chi deve", async () => {
  const p = (await rpc(env, T.anna, "orc_ensure_musician_profile", {})).d;
  assert.ok(p && p.id);
  const path = "profiles/" + U.anna + "/photo/1_ritratto.jpg";
  const f = await rest(env, T.anna, "orc_files", { method: "POST", body: { owner_user_id: U.anna, profile_id: p.id, kind: "photo", path, name: "ritratto.jpg", size: 100, mime: "image/jpeg" } });
  assert.ok(f.ok, JSON.stringify(f.d));
  assert.ok((await rest(env, T.anna, "orc_musician_profiles?id=eq." + p.id, { method: "PATCH", body: { photo_path: path } })).ok);
  /* la società a cui si è candidata la vede */
  const vista = (await rest(env, T.societa, "orc_musician_profiles?select=photo_path&id=eq." + p.id)).d;
  assert.equal(vista.length, 1); assert.equal(vista[0].photo_path, path);
  /* un'altra organizzazione no, e nemmeno un altro musicista */
  assert.deepEqual((await rest(env, T.altraOrg, "orc_musician_profiles?select=photo_path&id=eq." + p.id)).d, []);
  assert.deepEqual((await rest(env, T.bruno, "orc_musician_profiles?select=photo_path&id=eq." + p.id)).d, []);
  /* e nessuno può appiccicare una foto al profilo di un altro */
  const furbo = await rest(env, T.bruno, "orc_musician_profiles?id=eq." + p.id, { method: "PATCH", body: { photo_path: "profiles/x/photo/finta.jpg" } });
  assert.ok(!furbo.ok || (await rest(env, T.anna, "orc_musician_profiles?select=photo_path&id=eq." + p.id)).d[0].photo_path === path);
});
