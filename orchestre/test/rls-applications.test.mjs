/* Scenario A + E per candidature, profilo, valutazioni, file (lotto 7), contro il Supabase locale. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);   /* il caso serve: due suite avviate nello stesso millisecondo creerebbero la stessa organizzazione */
const mail = (n) => `orc-app-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let ORG_A, ORG_B, PROF, APP, MID, FILEPATH;

async function storage(env, token, method, path, body, headers = {}) {
  const r = await fetch(env.API_URL + "/storage/v1/" + path, { method, headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + token, ...headers }, body });
  let d = null; try { d = await r.json(); } catch { /* corpo non json */ }
  return { ok: r.ok, status: r.status, d };
}

run("preparazione: due org (A accetta candidature), staff, un candidato, un estraneo", async () => {
  for (const n of ["ownerA", "ownerB", "cand", "altro"]) { U[n] = await mkUser(env, mail(n), undefined, { full_name: "Anna Candidata" }); T[n] = await login(env, mail(n)); }
  ORG_A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "App A", org_slug: "app-a-" + stamp, owner_email: mail("ownerA") })).d;
  ORG_B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "App B", org_slug: "app-b-" + stamp, owner_email: mail("ownerB") })).d;
  assert.ok((await rpc(env, T.ownerA, "orc_set_accepting", { org: ORG_A, accepting: true, intro: "Cerchiamo archi" })).ok);
  const no = await rpc(env, T.cand, "orc_set_accepting", { org: ORG_A, accepting: false });
  assert.equal(no.ok, false, "un candidato non apre/chiude le candidature");
});

run("il profilo: nasce dal JWT, è solo del proprietario; le org aperte si vedono", async () => {
  const p = await rpc(env, T.cand, "orc_ensure_musician_profile", {});
  assert.ok(p.ok, JSON.stringify(p.d)); PROF = p.d.id;
  assert.equal(p.d.first_name, "Anna"); assert.equal(p.d.last_name, "Candidata"); assert.equal(p.d.email, mail("cand"));
  const again = await rpc(env, T.cand, "orc_ensure_musician_profile", {});
  assert.equal(again.d.id, PROF, "idempotente");
  const seen = await rest(env, T.altro, "orc_musician_profiles?select=id");
  assert.deepEqual(seen.d, [], "un altro utente non vede il profilo");
  const staffBefore = await rest(env, T.ownerA, "orc_musician_profiles?select=id");
  assert.deepEqual(staffBefore.d, [], "lo staff non vede un profilo che non si è candidato");
  const upd = await rest(env, T.cand, "orc_musician_profiles?id=eq." + PROF, { method: "PATCH", body: { phone: "3", city: "Padova", province: "pd" } });
  assert.ok(upd.ok, JSON.stringify(upd.d));
  const hack = await rest(env, T.altro, "orc_musician_profiles?id=eq." + PROF, { method: "PATCH", body: { city: "Hack" } });
  assert.ok(!hack.ok || hack.d.length === 0);
  assert.ok((await rest(env, T.cand, "orc_profile_instruments", { method: "POST", body: { profile_id: PROF, instrument_code: "violino", is_primary: true, level: 4 } })).ok);
  const wrongOwner = await rest(env, T.altro, "orc_profile_instruments", { method: "POST", body: { profile_id: PROF, instrument_code: "viola", is_primary: false } });
  assert.equal(wrongOwner.ok, false, "non si aggiungono strumenti al profilo di un altro");
  const open = (await rpc(env, T.cand, "orc_open_organizations", {})).d;
  assert.ok(open.some((o) => o.id === ORG_A) && !open.some((o) => o.id === ORG_B));
});

run("i file: il proprietario carica sotto la sua cartella; l'estraneo no; lo staff legge solo dopo la candidatura", async () => {
  FILEPATH = `profiles/${U.cand}/cv/cv.pdf`;
  const up = await storage(env, T.cand, "POST", "object/orc-files/" + FILEPATH, "%PDF-1.4 prova", { "Content-Type": "application/pdf" });
  assert.ok(up.ok, "upload del proprietario: " + up.status + " " + JSON.stringify(up.d));
  const bad = await storage(env, T.altro, "POST", "object/orc-files/" + FILEPATH.replace("cv.pdf", "hack.pdf"), "%PDF-1.4", { "Content-Type": "application/pdf" });
  assert.equal(bad.ok, false, "l'estraneo non scrive nella cartella altrui");
  const wrongFolder = await storage(env, T.cand, "POST", "object/orc-files/profiles/" + U.altro + "/cv/x.pdf", "%PDF-1.4", { "Content-Type": "application/pdf" });
  assert.equal(wrongFolder.ok, false, "né il proprietario in una cartella non sua");
  const bigMime = await storage(env, T.cand, "POST", "object/orc-files/profiles/" + U.cand + "/cv/x.exe", "MZ", { "Content-Type": "application/x-msdownload" });
  assert.equal(bigMime.ok, false, "tipo non ammesso");
  assert.ok((await rest(env, T.cand, "orc_files", { method: "POST", body: { owner_user_id: U.cand, profile_id: PROF, kind: "cv", path: FILEPATH, name: "cv.pdf", size: 14, mime: "application/pdf" } })).ok);
  const staffNo = await storage(env, T.ownerA, "POST", "object/sign/orc-files/" + FILEPATH, JSON.stringify({ expiresIn: 60 }), { "Content-Type": "application/json" });
  assert.equal(staffNo.ok, false, "prima della candidatura lo staff non firma URL");
  const anon = await storage(env, env.ANON_KEY, "GET", "object/orc-files/" + FILEPATH);
  assert.equal(anon.ok, false, "anon niente");
});

run("scenario A: bozza → invio (profilo completo) → lo staff vede profilo e file, il candidato non vede le valutazioni", async () => {
  const a = await rpc(env, T.cand, "orc_apply", { org: ORG_A });
  assert.ok(a.ok, JSON.stringify(a.d)); APP = a.d.id; assert.equal(a.d.status, "draft");
  const bNo = await rpc(env, T.cand, "orc_apply", { org: ORG_B });
  assert.equal(bNo.ok, false, "B non accetta candidature");
  const early = await rpc(env, T.cand, "orc_submit_application", { app: APP, msg: "ciao" });
  assert.equal(early.ok, false, "senza consenso non si invia: " + JSON.stringify(early.d));
  assert.ok((await rest(env, T.cand, "orc_consents", { method: "POST", body: { user_id: U.cand, kind: "privacy", version: "2026-09-09" } })).ok);
  assert.ok((await rest(env, T.cand, "orc_musician_profiles?id=eq." + PROF, { method: "PATCH", body: { consent_privacy_version: "2026-09-09", consent_privacy_at: new Date().toISOString() } })).ok);
  const staffDraft = await rpc(env, T.ownerA, "orc_applications_list", { org: ORG_A });
  assert.deepEqual(staffDraft.d, [], "una bozza non si vede");
  const sent = await rpc(env, T.cand, "orc_submit_application", { app: APP, msg: "Mi piacerebbe suonare con voi" });
  assert.ok(sent.ok, JSON.stringify(sent.d)); assert.equal(sent.d.status, "submitted");
  const mine = (await rpc(env, T.cand, "orc_my_applications", {})).d;
  assert.equal(mine[0].public_status, "submitted");
  const list = (await rpc(env, T.ownerA, "orc_applications_list", { org: ORG_A })).d;
  assert.equal(list.length, 1); assert.equal(list[0].first_name, "Anna"); assert.equal(list[0].primary_instrument, "Violino");
  assert.deepEqual((await rpc(env, T.ownerB, "orc_applications_list", { org: ORG_A })).d, [], "B non vede le candidature di A");
  const det = (await rpc(env, T.ownerA, "orc_application_detail", { app: APP })).d;
  assert.equal(det.profile.city, "Padova"); assert.equal(det.files.length, 1); assert.equal(det.events.length, 2);
  assert.equal(det.profile.user_id, undefined, "l'id dell'account non viaggia nel dettaglio");
  const staffSign = await storage(env, T.ownerA, "POST", "object/sign/orc-files/" + FILEPATH, JSON.stringify({ expiresIn: 60 }), { "Content-Type": "application/json" });
  assert.ok(staffSign.ok, "dopo la candidatura lo staff di A firma l'URL del CV: " + staffSign.status);
  const staffBSign = await storage(env, T.ownerB, "POST", "object/sign/orc-files/" + FILEPATH, JSON.stringify({ expiresIn: 60 }), { "Content-Type": "application/json" });
  assert.equal(staffBSign.ok, false, "lo staff di B no");
  const ev = await rest(env, T.ownerA, "orc_evaluations", { method: "POST", body: { org_id: ORG_A, application_id: APP, kind: "interview", date: "2026-09-20", outcome: "positivo", technical: 4, overall: 4, private_note: "brava ma poca esperienza pop", decision: "audizione" } });
  assert.ok(ev.ok, JSON.stringify(ev.d));
  const candSees = await rest(env, T.cand, "orc_evaluations?select=id");
  assert.ok(!candSees.ok || candSees.d.length === 0, "E.2 — il candidato non legge le valutazioni");
  const evB = await rest(env, T.ownerB, "orc_evaluations?select=id&org_id=eq." + ORG_A);
  assert.ok(!evB.ok || evB.d.length === 0);
  const candStatus = await rest(env, T.cand, "orc_applications?id=eq." + APP, { method: "PATCH", body: { status: "accepted" } });
  assert.ok(!candStatus.ok || candStatus.d.length === 0, "il candidato non si accetta da solo");
  const st = await rpc(env, T.cand, "orc_application_set_status", { app: APP, new_status: "accepted" });
  assert.equal(st.ok, false);
});

run("colloquio, riserva, accettazione: nasce il musicista nel rolodex, collegato all'account; il candidato vede solo la maschera", async () => {
  const s1 = await rpc(env, T.ownerA, "orc_application_set_status", { app: APP, new_status: "interview_to_schedule", note: "da sentire" });
  assert.ok(s1.ok, JSON.stringify(s1.d));
  assert.equal((await rpc(env, T.cand, "orc_my_applications", {})).d[0].public_status, "evaluating", "il candidato vede «in valutazione», non i dettagli");
  await rpc(env, T.ownerA, "orc_application_set_status", { app: APP, new_status: "interview_scheduled" });
  assert.equal((await rpc(env, T.cand, "orc_my_applications", {})).d[0].public_status, "interview");
  const acc = await rpc(env, T.ownerA, "orc_application_set_status", { app: APP, new_status: "accepted", note: "ok", to_candidate: "Benvenuta!" });
  assert.ok(acc.ok, JSON.stringify(acc.d)); MID = acc.d.musician_id; assert.ok(MID);
  const m = (await rest(env, T.ownerA, "orc_musicians?select=first_name,last_name,email,user_id,profile_id,source,status&id=eq." + MID)).d[0];
  assert.equal(m.first_name, "Anna"); assert.equal(m.user_id, U.cand); assert.equal(m.profile_id, PROF); assert.equal(m.source, "application"); assert.equal(m.status, "active");
  const mi = (await rest(env, T.ownerA, "orc_musician_instruments?select=instrument_code,is_primary&musician_id=eq." + MID)).d;
  assert.deepEqual(mi, [{ instrument_code: "violino", is_primary: true }]);
  const mine = (await rpc(env, T.cand, "orc_my_applications", {})).d[0];
  assert.equal(mine.public_status, "accepted"); assert.equal(mine.note_to_candidate, "Benvenuta!");
  const again = await rpc(env, T.ownerA, "orc_application_set_status", { app: APP, new_status: "accepted" });
  assert.ok(again.ok); assert.equal(again.d.musician_id, MID, "una seconda accettazione non duplica il musicista");
  const evMus = await rest(env, T.cand, "orc_musicians?select=id");
  assert.ok(!evMus.ok || evMus.d.length === 0, "il musicista non legge il rolodex dell'org (note private incluse)");
});

run("l'area personale: inviti e incarichi via account, risposta senza token, export, cancellazione", async () => {
  const PID = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: ORG_A, title: "Concerto per Anna", status: "planning" } })).d[0].id;
  await rest(env, T.ownerA, "orc_production_dates", { method: "POST", body: { production_id: PID, kind: "concert", starts_at: "2026-12-01T21:00:00+01:00" } });
  const ROLE = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: PID, instrument_code: "violino", name: "Violini", seats: 1 } })).d[0].id;
  /* dal collaudo dell'11/09 si convoca solo chi ha scelto di ricevere proposte, come promette l'informativa: Anna le accetta, come fa l'interfaccia */
  assert.ok((await rest(env, T.cand, "orc_consents", { method: "POST", body: { user_id: U.cand, kind: "requests", version: "2026-09-09" } })).ok);
  assert.ok((await rest(env, T.cand, "orc_musician_profiles?id=eq." + PROF, { method: "PATCH", body: { consent_requests: true } })).ok);
  assert.equal((await rpc(env, T.ownerA, "orc_invite", { production: PID, role: ROLE, musicians: [MID], deadline: "2030-01-01T00:00:00Z" })).d, 1);
  const invId = (await rpc(env, T.ownerA, "orc_invitations_list", { production: PID })).d[0].id;
  await rest(env, admin(env), "orc_invitations?id=eq." + invId, { method: "PATCH", body: { status: "sent", notification_status: "sent" } });
  const my = (await rpc(env, T.cand, "orc_my_invitations", {})).d;
  assert.equal(my.length, 1); assert.equal(my[0].title, "Concerto per Anna"); assert.equal(my[0].status, "sent"); assert.equal(JSON.stringify(my[0]).includes("token"), false);
  assert.deepEqual((await rpc(env, T.altro, "orc_my_invitations", {})).d, []);
  const r = await rpc(env, T.cand, "orc_respond_mine", { invitation: invId, answer: "yes", note: "volentieri" });
  assert.ok(r.ok, JSON.stringify(r.d)); assert.equal(r.d.status, "available");
  const hijack = await rpc(env, T.altro, "orc_respond_mine", { invitation: invId, answer: "no" });
  assert.equal(hijack.ok, false, "un altro account non risponde per lei");
  assert.ok((await rpc(env, T.ownerA, "orc_invitation_action", { invitation: invId, action: "confirm" })).ok);
  const eng = (await rpc(env, T.cand, "orc_my_engagements", {})).d;
  assert.equal(eng.length, 1); assert.equal(eng[0].role_name, "Violini");
  const exp = (await rpc(env, T.cand, "orc_export_my_data", {})).d;
  assert.equal(exp.profile.first_name, "Anna"); assert.equal(exp.applications[0].status, "accepted"); assert.equal(exp.engagements.length, 1); assert.equal(exp.consents.length, 2, "privacy e proposte di lavoro");
  assert.equal(JSON.stringify(exp).includes("private_note"), false, "l'export non contiene valutazioni interne");
  assert.ok((await rpc(env, T.cand, "orc_request_deletion", {})).ok);
  const flagged = (await rpc(env, T.ownerA, "orc_applications_list", { org: ORG_A })).d[0];
  assert.ok(flagged.deletion_requested_at, "lo staff vede la richiesta di cancellazione");
  /* un musicista importato per email si collega da solo al login */
  await rpc(env, T.ownerB, "orc_import_musicians", { org: ORG_B, rows: [{ first_name: "Altro", last_name: "Prova", email: mail("altro"), instruments: [{ code: "viola", primary: true }] }] });
  assert.equal((await rpc(env, T.altro, "orc_link_my_musician_rows", {})).d, 1);
  const linked = (await rest(env, T.ownerB, "orc_musicians?select=user_id&email=eq." + encodeURIComponent(mail("altro")))).d[0];
  assert.equal(linked.user_id, U.altro);
});

/* Collaudo 10/09 (revisione di sicurezza): cinque invarianti che l'interfaccia prometteva ma il database
   non imponeva. Rimettendo le vecchie policy ognuno di questi torna rosso. */
run("il candidato non legge lo stato interno della sua candidatura, nemmeno via REST", async () => {
  assert.ok((await rpc(env, T.ownerA, "orc_application_set_status", { app: APP, new_status: "interview_to_schedule", note: "" })).ok);
  const grezzo = await rest(env, T.cand, "orc_applications?select=status,decided_by,musician_id");
  assert.equal(grezzo.status, 200, "la richiesta deve arrivare al database, non fallire per sintassi");
  assert.deepEqual(grezzo.d, [], "dalla console del browser non esce nessuna riga con lo stato interno");
  const mie = (await rpc(env, T.cand, "orc_my_applications")).d;
  assert.equal(mie.length, 1);
  assert.equal(mie[0].public_status, "evaluating", "il candidato vede la maschera (in valutazione), non «colloquio da programmare»");
  assert.ok(!("decided_by" in mie[0]), "e non chi ha deciso");
});

run("un file entra solo nel proprio dossier e nella propria cartella", async () => {
  const suo = (await rpc(env, T.altro, "orc_ensure_musician_profile", {})).d.id;
  const base = { kind: "cv", name: "CV.pdf", size: 10, mime: "application/pdf" };
  const altrui = await rest(env, T.cand, "orc_files", { method: "POST", body: { ...base, owner_user_id: U.cand, profile_id: suo, path: "profiles/" + U.cand + "/cv/x.pdf" } });
  assert.equal(altrui.ok, false, "un file infilato nel dossier di un altro candidato");
  const fuori = await rest(env, T.cand, "orc_files", { method: "POST", body: { ...base, owner_user_id: U.cand, profile_id: PROF, path: "profiles/" + U.altro + "/cv/y.pdf" } });
  assert.equal(fuori.ok, false, "un file che punta alla cartella di un altro");
  const buono = await rest(env, T.cand, "orc_files", { method: "POST", body: { ...base, owner_user_id: U.cand, profile_id: PROF, path: "profiles/" + U.cand + "/cv/ok.pdf" } });
  assert.ok(buono.ok, JSON.stringify(buono.d));
});

run("una valutazione non si scrive nel dossier di un'altra organizzazione", async () => {
  const intrusa = await rest(env, T.ownerB, "orc_evaluations", { method: "POST", body: { org_id: ORG_B, application_id: APP, kind: "general", overall: 1, private_note: "inaffidabile" } });
  assert.equal(intrusa.ok, false, "l'org B non scrive una valutazione dentro una candidatura dell'org A");
  const mia = await rest(env, T.ownerA, "orc_evaluations", { method: "POST", body: { org_id: ORG_A, application_id: APP, kind: "general", overall: 4 } });
  assert.ok(mia.ok, JSON.stringify(mia.d));
});

run("il consenso è una prova: si dà e si legge, non si cancella né si retrodata", async () => {
  const miei = await rest(env, T.cand, "orc_consents?select=id,granted_at");
  assert.equal(miei.status, 200);
  assert.ok(miei.d.length > 0, "il consenso dell'invio è registrato");
  const id = miei.d[0].id;
  await rest(env, T.cand, "orc_consents?id=eq." + id, { method: "DELETE" });
  assert.equal((await rest(env, T.cand, "orc_consents?select=id&id=eq." + id)).d.length, 1, "non si cancella");
  await rest(env, T.cand, "orc_consents?id=eq." + id, { method: "PATCH", body: { granted_at: "2020-01-01T00:00:00Z" } });
  const dopo = (await rest(env, T.cand, "orc_consents?select=granted_at&id=eq." + id)).d[0];
  assert.notEqual(dopo.granted_at.slice(0, 4), "2020", "non si retrodata");
});

run("il registro delle candidature dice lo stato di partenza vero", async () => {
  assert.ok((await rpc(env, T.ownerA, "orc_application_set_status", { app: APP, new_status: "evaluating", note: "" })).ok);
  const ev = (await rest(env, T.ownerA, "orc_application_events?select=from_status,to_status&application_id=eq." + APP + "&order=at.desc&limit=1")).d[0];
  assert.equal(ev.to_status, "evaluating");
  assert.equal(ev.from_status, "interview_to_schedule", "da dove veniva, non dove è arrivata");
});
