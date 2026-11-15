/* V1/d — come si raccontano le versioni delle condizioni (domain/conditions.js) e come le pagine le usano.
   Dati tutti inventati. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { changeRows, reconfirmSummary, reconfirmText, changedNames, versionTitle, snapDateLine } from "../src/domain/conditions.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(root, f), "utf8");

const ch = {
  changed: ["dress_code", "dates", "fee_note"],
  before: { fee_note: "100 €", dress_code: "", dates: [{ kind: "concert", starts_at: "2027-03-10T19:00:00Z" }] },
  after: { fee_note: "130 €", dress_code: "abito scuro", dates: [{ kind: "concert", starts_at: "2027-03-11T19:00:00Z", venue: "Teatro Nuovo" }, { kind: "rehearsal", starts_at: "2027-03-09T15:00:00Z" }] },
};

test("changeRows: in ordine di importanza (compenso, date, poi abbigliamento), vuoto detto «(vuoto)»", () => {
  const r = changeRows(ch);
  assert.deepEqual(r.map((x) => x.key), ["fee_note", "dates", "dress_code"]);
  assert.deepEqual([r[0].was, r[0].is], ["100 €", "130 €"]);
  assert.deepEqual([r[2].was, r[2].is], ["(vuoto)", "abito scuro"]);
});

test("changeRows: le date si mostrano come sono ora, una per riga, con il luogo", () => {
  const d = changeRows(ch).find((x) => x.key === "dates");
  assert.equal(d.is.split("\n").length, 2);
  assert.match(d.is, /Teatro Nuovo/);
  assert.match(d.is, /Concerto/);
});

test("changeRows tollera il niente: nessun cambiamento, null, forma sbagliata", () => {
  assert.deepEqual(changeRows(null), []);
  assert.deepEqual(changeRows({}), []);
  assert.deepEqual(changeRows({ changed: [] }), []);
  assert.deepEqual(changeRows({ changed: ["fee_note"] }).map((x) => [x.was, x.is]), [["(vuoto)", "(vuoto)"]]);
  assert.equal(snapDateLine({ kind: "boh", starts_at: "non-una-data" }).includes("Invalid"), false);
});

const need = [
  { invitation_id: "a", material: true, requested_at: null, notification_status: "sent", current_version: 3 },
  { invitation_id: "b", material: true, requested_at: "2026-11-15T10:00:00Z", notification_status: "sent", current_version: 3 },
  { invitation_id: "c", material: false, requested_at: null, notification_status: "sent", current_version: 3 },
  { invitation_id: "d", material: true, requested_at: null, notification_status: "pending", current_version: 2 },
];
test("reconfirmSummary: chi sollecitare = importanti, non ancora sollecitati, con nessuna email in coda", () => {
  const s = reconfirmSummary(need);
  assert.equal(s.total, 4); assert.equal(s.material, 3); assert.equal(s.asked, 1); assert.deepEqual(s.toAsk, ["a"]); assert.equal(s.version, 3);
  assert.deepEqual(reconfirmSummary(null), { total: 0, material: 0, asked: 0, toAsk: [], version: 0 });
});

test("testi: persona/persone, nomi dei campi, titolo di versione", () => {
  assert.equal(reconfirmText(0), ""); assert.equal(reconfirmText(1), "1 persona da riconfermare"); assert.equal(reconfirmText(5), "5 persone da riconfermare");
  assert.equal(changedNames(["dress_code", "fee_note"]), "compenso, abbigliamento");
  assert.equal(versionTitle({ version: 0, role_name: null }), "Condizioni alla prima convocazione");
  assert.equal(versionTitle({ version: 3, changed: ["fee_note", "dates"], role_name: "Violini" }), "Condizioni v3 · compenso, date · Violini");
});

/* il cablaggio: chi salva lo vede, il musicista legge il confronto */
test("scheda produzione: salvare Dati, Date e compenso del ruolo passa da withConditions; il banner usa il database", () => {
  const prod = read("orchestre/src/pages/produzione.js");
  assert.match(prod, /withConditions\(\(\) => api\.update\(p\.id, f\)\)/, "Dati");
  assert.match(prod, /withConditions\(\(\) => api\.addDate\(/, "aggiunta di una data");
  assert.match(prod, /withConditions\(\(\) => api\.deleteDate\(/, "data tolta");
  assert.match(prod, /withConditions\(\(\) => api\.updateRole\(/, "compenso del ruolo");
  assert.match(prod, /inv\.reconfirmNeeded\(p\.id\)/, "chi manca si chiede al database, non si deduce");
  assert.match(prod, /Chiedi riconferma a tutti/, "tasto del banner");
  assert.match(prod, /confirm\(\{ title: "Chiedi la riconferma\?"/, "dialogo dopo il salvataggio");
  assert.match(prod, /inv\.conditionsHistory\(p\.id\)/, "storia delle versioni");
});
test("la riconferma non è mai bloccante: se il controllo fallisce il salvataggio resta fatto", () => {
  const prod = read("orchestre/src/pages/produzione.js");
  assert.match(prod, /afterConditions\(before\)\.catch\(\(\) => \{\}\)/);
  assert.match(prod, /await save\(\);\n\s+if \(before !== null\)/, "il salvataggio viene prima del controllo");
});
test("API: le quattro RPC di V1/d con i nomi dei parametri della migrazione", () => {
  const a = read("orchestre/src/api/invitations.js");
  assert.match(a, /orc_reconfirm_needed", \{ production: productionId \}/);
  assert.match(a, /orc_reconfirm_request", \{ production: productionId, invitation_ids: invitationIds, note \}/);
  assert.match(a, /orc_conditions_history", \{ production: productionId \}/);
  assert.match(a, /orc_conditions_set_reason", \{ version_id: versionId, reason \}/);
  const m = read("supabase/migrations/0084_orc_condizioni_versionate.sql");
  for (const f of ["orc_reconfirm_needed(production uuid)", "orc_reconfirm_request(production uuid, invitation_ids uuid[], note text default ''", "orc_conditions_history(production uuid)", "orc_conditions_set_reason(version_id bigint, reason text)"]) assert.ok(m.includes(f), f);
});
test("pagina del musicista: banner con il confronto e due soli tasti per chi è già confermato; niente HTML dai dati", () => {
  const r = read("orchestre/src/pages/rispondi.js");
  assert.match(r, /D\.mode === "reconfirm"\) return paintReconfirm\(\)/);
  assert.match(r, /Le condizioni sono cambiate da quando hai risposto/);
  assert.match(r, /data-a="yes">Sì, confermo/);
  assert.match(r, /data-a="no">No, non posso più/);
  assert.doesNotMatch(r.slice(r.indexOf("function condizioniCambiate"), r.indexOf("function paintReconfirm")), /innerHTML\s*=.*(r\.|v\.)/, "righe e nota sono testo (textContent), mai HTML");
});
test("la migrazione 0084 non tocca orc_invite e mette i permessi giusti", () => {
  const m = read("supabase/migrations/0084_orc_condizioni_versionate.sql");
  assert.doesNotMatch(m, /function public\.orc_invite\(/);
  assert.match(m, /revoke all on function public\.orc_invitation_open\(text\), public\.orc_respond\(text, text, jsonb, text\), public\.orc_invitation_changes\(uuid\) from public, anon, authenticated;/);
  assert.match(m, /grant execute on function public\.orc_invitation_open\(text\), public\.orc_respond\(text, text, jsonb, text\), public\.orc_invitation_changes\(uuid\) to service_role;/);
  assert.match(m, /revoke all on public\.orc_condition_versions from anon, authenticated;\ngrant select on public\.orc_condition_versions to authenticated;/);
  assert.match(m, /drop policy if exists orc_condition_versions_staff_select/);
  assert.match(m, /notify pgrst, 'reload schema';/);
});
