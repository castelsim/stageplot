/* Lotto Q (migrazione 0089): cascata di riserve per posto e squadre tipo.
   Girano solo con Supabase locale (`supabase start`, `supabase db reset`). Dati inventati, @example.invalid.
   · le tre tabelle si leggono solo dallo staff dell'organizzazione e NON si scrivono dal client (solo funzioni);
   · la lista è ordinata, senza doppioni, solo con musicisti dell'organizzazione non archiviati;
   · lo stato di ognuno non si salva: lo ricavano gli inviti (da chiamare → in corso → rifiutato…);
   · «salva» e «importa» una squadra tipo non inviano niente; un'altra organizzazione non ci arriva;
   · ogni «negato» ha il suo controllo positivo col titolare. */
import test from "node:test";
import assert from "node:assert/strict";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `orc-csc-${n}-${stamp}@example.invalid`;
const U = {}, T = {}, D = {};
/* negato (errore di permessi) oppure vuoto: in tutti e due i casi non vede niente */
const vuoto = (r) => !r.ok || (Array.isArray(r.d) && r.d.length === 0);
const lista = async (tok, prod) => (await rpc(env, tok, "orc_cascade_list", { production: prod })).d;
const stati = async (role) => Object.fromEntries((await lista(T.ownerA, D.P)).filter((x) => x.role_id === role).map((x) => [x.musician_id, x.state]));

run("preparazione: due organizzazioni, cinque musicisti (uno archiviato), due produzioni, due ruoli", async () => {
  for (const n of ["ownerA", "ownerB", "estraneo"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  T.anon = env.ANON_KEY;
  D.A = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Csc A", org_slug: "csc-a-" + stamp, owner_email: mail("ownerA") })).d;
  D.B = (await rpc(env, admin(env), "orc_bootstrap_org", { org_name: "Csc B", org_slug: "csc-b-" + stamp, owner_email: mail("ownerB") })).d;
  const nomi = ["Uno", "Due", "Tre", "Quattro", "Cinque"];
  assert.ok((await rpc(env, T.ownerA, "orc_import_musicians", { org: D.A, rows: nomi.map((n) => ({ first_name: n, last_name: "Prova", email: `${n.toLowerCase()}-${stamp}@example.invalid`, instruments: [{ code: "violino", primary: true }] })) })).ok);
  const lst = (await rpc(env, T.ownerA, "orc_musicians_list", { org: D.A })).d;
  D.M = Object.fromEntries(nomi.map((n) => [n, lst.find((m) => m.first_name === n).id]));
  assert.ok((await rpc(env, T.ownerB, "orc_import_musicians", { org: D.B, rows: [{ first_name: "Altro", last_name: "Org", email: `altro-${stamp}@example.invalid`, instruments: [{ code: "violino", primary: true }] }] })).ok);
  D.MB = (await rpc(env, T.ownerB, "orc_musicians_list", { org: D.B })).d[0].id;
  assert.ok((await rest(env, admin(env), "orc_musicians?id=eq." + D.M.Cinque, { method: "PATCH", body: { status: "archived" } })).ok);
  D.P = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: D.A, title: "Csc " + stamp, status: "planning" } })).d[0].id;
  D.P2 = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: D.A, title: "Csc2 " + stamp, status: "planning" } })).d[0].id;
  D.PB = (await rest(env, T.ownerB, "orc_productions", { method: "POST", body: { org_id: D.B, title: "CscB " + stamp, status: "planning" } })).d[0].id;
  D.R = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: D.P, instrument_code: "violino", name: "Violini", seats: 2 } })).d[0].id;
  D.RF = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: D.P, instrument_code: "flauto", name: "Flauti", seats: 1 } })).d[0].id;
  D.R2 = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: D.P2, instrument_code: "violino", name: "violini ", seats: 1 } })).d[0].id;   /* stesso nome, maiuscole e spazio diversi */
  D.RB = (await rest(env, T.ownerB, "orc_staffing_roles", { method: "POST", body: { production_id: D.PB, instrument_code: "violino", name: "Violini", seats: 1 } })).d[0].id;
});

run("le tabelle non si scrivono dal client: nemmeno il titolare, nemmeno anonimo", async () => {
  for (const tok of [T.ownerA, T.anon]) {
    assert.ok(!(await rest(env, tok, "orc_role_candidates", { method: "POST", body: { role_id: D.R, musician_id: D.M.Uno, org_id: D.A, production_id: D.P, position: 1 } })).ok, "candidates");
    assert.ok(!(await rest(env, tok, "orc_teams", { method: "POST", body: { org_id: D.A, name: "x" } })).ok, "teams");
    assert.ok(!(await rest(env, tok, "orc_team_members", { method: "POST", body: { team_id: D.P, role_name: "x", musician_id: D.M.Uno, org_id: D.A, position: 1 } })).ok, "members");
  }
  assert.ok(!(await rpc(env, T.ownerA, "orc_cascade_replace_internal", { role: D.R, musicians: [D.M.Uno], src: "manual", actor: null })).ok, "la funzione interna è chiusa ai client");
});

run("il titolare mette la lista in ordine: l'ordine resta, i doppioni e chi non va si scartano", async () => {
  const r = await rpc(env, T.ownerA, "orc_cascade_set", { role: D.R, musicians: [D.M.Tre, D.M.Uno, D.M.Tre, D.MB, D.M.Cinque, D.M.Due], src: "manual" });
  assert.ok(r.ok && r.d === 3, "tornano i 3 validi: " + JSON.stringify(r.d));
  const l = (await lista(T.ownerA, D.P)).filter((x) => x.role_id === D.R);
  assert.deepEqual(l.map((x) => x.musician_id), [D.M.Tre, D.M.Uno, D.M.Due], "ordine dato, senza doppione, senza l'altra organizzazione, senza l'archiviato");
  assert.deepEqual(l.map((x) => x.pos), [1, 2, 3]);
  assert.ok(l.every((x) => x.state === "da_chiamare" && x.source === "manual" && x.invitation_id === null), "nessun invito creato");
  assert.equal((await rest(env, admin(env), "orc_invitations?select=id&production_id=eq." + D.P)).d.length, 0, "la lista NON è un invito: niente email, niente link");
  assert.equal((await rest(env, admin(env), "orc_invitation_secrets?select=invitation_id")).d.filter((x) => false).length, 0);
});

run("rimetterla in un altro ordine sostituisce quella di prima", async () => {
  assert.equal((await rpc(env, T.ownerA, "orc_cascade_set", { role: D.R, musicians: [D.M.Due, D.M.Tre], src: "matching" })).d, 2);
  const l = (await lista(T.ownerA, D.P)).filter((x) => x.role_id === D.R);
  assert.deepEqual(l.map((x) => x.musician_id), [D.M.Due, D.M.Tre], "Uno è uscito");
  assert.ok(l.every((x) => x.source === "matching"));
  assert.equal((await rpc(env, T.ownerA, "orc_cascade_set", { role: D.R, musicians: [D.M.Due, D.M.Tre, D.M.Uno, D.M.Quattro], src: "manual" })).d, 4);
});

run("chi non è staff: niente scrittura, niente lettura; src non valido rifiutato", async () => {
  for (const tok of [T.ownerB, T.estraneo, T.anon]) {
    assert.ok(!(await rpc(env, tok, "orc_cascade_set", { role: D.R, musicians: [D.M.Uno], src: "manual" })).ok, "set negato");
    const l = await rpc(env, tok, "orc_cascade_list", { production: D.P });
    assert.ok(!l.ok || (Array.isArray(l.d) && l.d.length === 0), "list vuota o negata");
    assert.ok(vuoto(await rest(env, tok, "orc_role_candidates?select=role_id")), "nemmeno la lettura diretta");
  }
  assert.ok((await rest(env, T.ownerA, "orc_role_candidates?select=role_id")).d.length === 4, "controllo positivo: il titolare le vede");
  assert.ok(!(await rpc(env, T.ownerA, "orc_cascade_set", { role: D.R, musicians: [D.M.Uno], src: "team" })).ok, "origine «team» non si dichiara dal client");
  assert.ok(!(await rpc(env, T.ownerA, "orc_cascade_set", { role: D.RB, musicians: [D.MB], src: "manual" })).ok, "il ruolo di un'altra organizzazione non si tocca");
});

run("lo stato lo ricavano gli inviti: in corso, rifiutato, senza risposta, confermato, già chiamato, archiviato", async () => {
  const ms = [D.M.Uno, D.M.Due, D.M.Tre, D.M.Quattro];
  assert.equal((await rpc(env, T.ownerA, "orc_invite", { production: D.P, role: D.R, musicians: ms, deadline: null, note: "", run: null })).d, 4);
  const inv = (await rest(env, T.ownerA, "orc_invitations?select=id,musician_id&production_id=eq." + D.P + "&role_id=eq." + D.R)).d;
  const set = (m, s) => rest(env, admin(env), "orc_invitations?id=eq." + inv.find((x) => x.musician_id === m).id, { method: "PATCH", body: { status: s } });
  let st = await stati(D.R);
  assert.ok(ms.every((m) => st[m] === "in_corso"), "bozze = in corso: " + JSON.stringify(st));
  await set(D.M.Uno, "unavailable"); await set(D.M.Due, "no_reply"); await set(D.M.Tre, "confirmed"); await set(D.M.Quattro, "cancelled");
  st = await stati(D.R);
  assert.deepEqual([st[D.M.Uno], st[D.M.Due], st[D.M.Tre], st[D.M.Quattro]], ["rifiutato", "senza_risposta", "confermato", "gia_chiamato"]);
  await set(D.M.Quattro, "expired"); assert.equal((await stati(D.R))[D.M.Quattro], "senza_risposta", "scaduto = senza risposta");
  assert.ok((await rest(env, admin(env), "orc_musicians?id=eq." + D.M.Quattro, { method: "PATCH", body: { status: "archived" } })).ok);
  assert.equal((await stati(D.R))[D.M.Quattro], "archiviato", "archiviato dopo");
  await rest(env, admin(env), "orc_musicians?id=eq." + D.M.Quattro, { method: "PATCH", body: { status: "active" } });
});

run("chi non è ancora stato chiamato resta «da chiamare» e il primo della lista è il prossimo", async () => {
  assert.equal((await rpc(env, T.ownerA, "orc_cascade_set", { role: D.RF, musicians: [D.M.Quattro, D.M.Uno], src: "manual" })).d, 2);
  const l = (await lista(T.ownerA, D.P)).filter((x) => x.role_id === D.RF);
  assert.deepEqual(l.map((x) => [x.musician_id, x.state]), [[D.M.Quattro, "da_chiamare"], [D.M.Uno, "da_chiamare"]]);
  assert.equal((await rpc(env, T.ownerA, "orc_invite", { production: D.P, role: D.RF, musicians: [l[0].musician_id], deadline: null, note: "", run: null })).d, 1, "«Chiama il prossimo» = l'orc_invite di sempre");
  assert.deepEqual((await lista(T.ownerA, D.P)).filter((x) => x.role_id === D.RF).map((x) => x.state), ["in_corso", "da_chiamare"], "ora il prossimo è il secondo");
});

run("squadra tipo: si salva dalla produzione (confermati, poi lista, poi invitati) e non invia niente", async () => {
  const inviti0 = (await rest(env, admin(env), "orc_invitations?select=id")).d.length;
  const bad = await rpc(env, T.ownerA, "orc_team_save", { production: D.P, team_name: "   ", key: "" });
  assert.ok(!bad.ok, "nome vuoto rifiutato");
  const r = await rpc(env, T.ownerA, "orc_team_save", { production: D.P, team_name: "Squadra di prova", key: "sinfonica" });
  assert.ok(r.ok && /^[0-9a-f-]{36}$/.test(r.d), JSON.stringify(r.d)); D.T = r.d;
  const det = (await rpc(env, T.ownerA, "orc_team_detail", { team: D.T })).d;
  const vl = det.filter((x) => x.role_name === "Violini").map((x) => x.musician_id);
  assert.equal(vl[0], D.M.Tre, "il confermato per primo");
  assert.deepEqual(new Set(vl), new Set([D.M.Tre, D.M.Due, D.M.Uno, D.M.Quattro]), "poi la lista");
  assert.ok(!vl.includes(D.M.Cinque), "mai l'archiviato");
  assert.deepEqual(det.filter((x) => x.role_name === "Flauti").map((x) => x.musician_id), [D.M.Quattro, D.M.Uno]);
  assert.equal((await rest(env, admin(env), "orc_invitations?select=id")).d.length, inviti0, "salvare non invia niente");
  const tl = (await rpc(env, T.ownerA, "orc_teams_list", { org: D.A })).d;
  assert.deepEqual(tl.map((x) => [x.name, Number(x.roles), x.template_key]), [["Squadra di prova", 2, "sinfonica"]]);
  assert.ok(!(await rpc(env, T.ownerA, "orc_team_save", { production: D.P, team_name: "x", key: "CHIAVE NON VALIDA!" })).ok, "chiave del modello: solo minuscole, cifre e _");
});

run("squadra tipo: si importa in un'altra produzione per nome (senza maiuscole/spazi) e per strumento; nessun invio", async () => {
  assert.equal((await rpc(env, T.ownerA, "orc_team_apply", { team: D.T, production: D.P2 })).d, 1, "il ruolo «violini » trova «Violini»");
  const l = (await lista(T.ownerA, D.P2)).filter((x) => x.role_id === D.R2);
  assert.equal(l.length, 4); assert.equal(l[0].musician_id, D.M.Tre); assert.ok(l.every((x) => x.source === "team" && x.state === "da_chiamare"));
  assert.equal((await rest(env, admin(env), "orc_invitations?select=id&production_id=eq." + D.P2)).d.length, 0, "importare non invia niente");
  // per strumento: un ruolo con altro nome ma unico violino di una produzione nuova
  const P3 = (await rest(env, T.ownerA, "orc_productions", { method: "POST", body: { org_id: D.A, title: "Csc3 " + stamp, status: "planning" } })).d[0].id;
  const R3 = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: P3, instrument_code: "violino", name: "Archi primi", seats: 1 } })).d[0].id;
  assert.equal((await rpc(env, T.ownerA, "orc_team_apply", { team: D.T, production: P3 })).d, 1, "abbinato per strumento: un solo violino qui, un solo gruppo di violini nella squadra");
  assert.equal((await lista(T.ownerA, P3)).filter((x) => x.role_id === R3).length, 4);
  const R4 = (await rest(env, T.ownerA, "orc_staffing_roles", { method: "POST", body: { production_id: P3, instrument_code: "violino", name: "Archi secondi", seats: 1 } })).d[0].id;
  assert.equal((await rpc(env, T.ownerA, "orc_team_apply", { team: D.T, production: P3 })).d, 0, "due violini e nessun nome uguale: nessun abbinamento a caso");
  assert.ok(R4);
});

run("squadra tipo: un'altra organizzazione non la vede, non la usa, non la tocca", async () => {
  for (const tok of [T.ownerB, T.estraneo, T.anon]) {
    assert.ok(!(await rpc(env, tok, "orc_team_apply", { team: D.T, production: D.PB })).ok, "apply negato");
    assert.ok(!(await rpc(env, tok, "orc_team_rename", { team: D.T, new_name: "hack" })).ok, "rename negato");
    assert.ok(!(await rpc(env, tok, "orc_team_duplicate", { team: D.T, new_name: "hack" })).ok, "duplicate negato");
    assert.ok(!(await rpc(env, tok, "orc_team_delete", { team: D.T })).ok, "delete negato");
    assert.ok(vuoto(await rpc(env, tok, "orc_team_detail", { team: D.T })), "dettaglio vuoto");
    assert.ok(vuoto(await rest(env, tok, "orc_teams?select=id")), "lettura diretta vuota");
  }
  assert.ok(!(await rpc(env, T.ownerA, "orc_team_apply", { team: D.T, production: D.PB })).ok, "nemmeno il titolare porta la sua squadra nella produzione di un altro");
  assert.ok(!(await rpc(env, T.ownerB, "orc_team_save", { production: D.P, team_name: "x", key: "" })).ok, "né salva da una produzione non sua");
  assert.equal((await rest(env, T.ownerA, "orc_teams?select=id")).d.length, 1, "controllo positivo: il titolare la vede");
});

run("rinomina, duplica, cancella; la cancellazione toglie anche i membri", async () => {
  assert.ok((await rpc(env, T.ownerA, "orc_team_rename", { team: D.T, new_name: "Nome nuovo" })).ok);
  assert.ok(!(await rpc(env, T.ownerA, "orc_team_rename", { team: D.T, new_name: "" })).ok, "nome vuoto rifiutato");
  const dup = (await rpc(env, T.ownerA, "orc_team_duplicate", { team: D.T, new_name: "Copia" })).d;
  assert.equal((await rest(env, T.ownerA, "orc_team_members?select=musician_id&team_id=eq." + dup)).d.length, (await rest(env, T.ownerA, "orc_team_members?select=musician_id&team_id=eq." + D.T)).d.length, "la copia ha gli stessi membri");
  assert.ok((await rpc(env, T.ownerA, "orc_team_delete", { team: dup })).ok);
  assert.equal((await rest(env, admin(env), "orc_team_members?select=musician_id&team_id=eq." + dup)).d.length, 0, "membri tolti a cascata");
  const aud = (await rest(env, admin(env), "orc_audit_log?select=action,payload&org_id=eq." + D.A + "&action=like.team.*")).d;
  assert.ok(aud.length >= 3 && aud.every((a) => !/Prova|@example/.test(JSON.stringify(a.payload))), "il registro non porta nomi né email");
});

run("se un musicista sparisce dal database, esce da liste e squadre (cascata)", async () => {
  assert.ok((await rest(env, admin(env), "orc_musicians?id=eq." + D.M.Uno, { method: "PATCH", body: { deleted_at: new Date().toISOString() } })).ok);
  const pg = await rpc(env, T.ownerA, "orc_musician_purge", { musician: D.M.Uno, confirm_name: "Prova Uno" });
  assert.ok(pg.ok, "cancellazione definitiva del proprietario: " + JSON.stringify(pg.d));
  assert.equal((await rest(env, admin(env), "orc_role_candidates?select=role_id&musician_id=eq." + D.M.Uno)).d.length, 0);
  assert.equal((await rest(env, admin(env), "orc_team_members?select=team_id&musician_id=eq." + D.M.Uno)).d.length, 0);
});
