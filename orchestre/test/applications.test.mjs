import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_STATUS, PUBLIC_STATUS, publicStatus, missingFields, completion, STEPS } from "../src/domain/applications.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("ogni stato interno del DB ha un'etichetta e una maschera pubblica; la maschera non svela i dettagli", () => {
  const sql = readFileSync(join(root, "supabase/migrations/0048_orc_applications.sql"), "utf8");
  const m = sql.match(/orc_applications_status_chk check \(status in\s*\(([^)]+)\)/);
  const stati = m[1].split(",").map((x) => x.trim().replace(/'/g, ""));
  assert.equal(stati.length, 12);
  for (const s of stati) { assert.ok(APP_STATUS[s], s); assert.ok(PUBLIC_STATUS[publicStatus(s)], "pubblico di " + s); }
  assert.equal(publicStatus("interview_to_schedule"), "evaluating", "che il colloquio sia da programmare è un fatto interno");
  assert.equal(publicStatus("suspended"), "evaluating", "una sospensione non si annuncia");
  assert.equal(publicStatus("interview_scheduled"), "interview");
  /* la stessa mappa vive nel DB: ogni ramo del CASE deve coincidere */
  for (const [from, to] of [...sql.matchAll(/when '([a-z_]+)' then '([a-z_]+)'/g)].map((x) => [x[1], x[2]])) assert.equal(publicStatus(from), to, from);
});

test("missingFields e completion seguono la stessa regola del DB", () => {
  const sql = readFileSync(join(root, "supabase/migrations/0048_orc_applications.sql"), "utf8");
  const dbKeys = [...sql.matchAll(/then '([a-z_]+)' end/g)].map((x) => x[1]).filter((k) => ["first_name", "last_name", "email", "phone", "city", "instrument", "consent"].includes(k));
  assert.deepEqual([...new Set(dbKeys)].sort(), ["city", "consent", "email", "first_name", "instrument", "last_name", "phone"]);
  const empty = { first_name: "", last_name: "", email: "", phone: "", city: "", consent_privacy_version: "" };
  assert.equal(missingFields(empty, []).length, 7);
  assert.equal(completion(empty, [], []), 0);
  const full = { first_name: "Anna", last_name: "Prova", email: "a@example.invalid", phone: "3", city: "Padova", consent_privacy_version: "2026-09-09", province: "PD", bio: "x", education: "y", years_experience: 5, genres: ["pop"], rehearsal_availability: "sere", exp_live: true, audio_url: "https://example.invalid/a" };
  assert.deepEqual(missingFields(full, [{ is_primary: true }]), []);
  assert.equal(completion(full, [{ is_primary: true }, { is_primary: false }], [{ kind: "cv" }]), 100);
  assert.equal(completion({ ...full, bio: "", education: "" }, [{ is_primary: true }], []), 70 + Math.round((6 / 10) * 30), "restano provincia, anni, generi, prove, esperienza live, audio: 6 su 10");
  assert.deepEqual(missingFields({ ...full, phone: " " }, [{ is_primary: false }]), ["phone", "instrument"]);
});

test("l'onboarding ha otto passi nell'ordine della SPEC", () => {
  assert.deepEqual(STEPS.map((s) => s[0]), ["identita", "strumenti", "competenze", "esperienze", "geografia", "materiali", "revisione", "invio"]);
});
