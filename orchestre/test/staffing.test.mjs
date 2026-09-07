import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATES, templateSeats, groupStaffing, staffingCounts, suggestedStatus, PROD_STATUS } from "../src/domain/staffing.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("ogni modello usa solo strumenti che esistono nel catalogo (0042)", () => {
  const sql = readFileSync(join(root, "supabase/migrations/0042_orc_catalogs.sql"), "utf8");
  const codes = new Set([...sql.matchAll(/^ \('([a-z_]+)','[^']+','(archi|legni|ottoni|percussioni|tastiere|corde|voci|direzione|ritmica)'/gm)].map((m) => m[1]));
  assert.ok(codes.size >= 40, "catalogo letto: " + codes.size);
  for (const [key, t] of Object.entries(TEMPLATES)) {
    assert.ok(t.name && t.sections.length, key);
    for (const s of t.sections) for (const r of s.roles) {
      assert.ok(codes.has(r.instrument), `${key}: ${r.instrument}`);
      assert.ok(r.seats >= 1 && r.name, `${key}: ${r.name}`);
      assert.ok(["principal", "tutti", "solo"].includes(r.part), `${key}: ${r.part}`);
    }
  }
  assert.equal(templateSeats(TEMPLATES.archi), 12);
  assert.ok(templateSeats(TEMPLATES.ritmico_sinfonica) >= 35);
});

test("gli stati delle produzioni della SPEC hanno tutti un'etichetta", () => {
  const sql = readFileSync(join(root, "supabase/migrations/0044_orc_productions.sql"), "utf8");
  const m = sql.match(/orc_productions_status_chk check \(status in\s*\(([^)]+)\)/);
  const stati = m[1].split(",").map((x) => x.trim().replace(/'/g, ""));
  assert.equal(stati.length, 11);
  for (const s of stati) assert.ok(PROD_STATUS[s], s);
});

test("groupStaffing ricostruisce sezioni → ruoli → posti dalle righe piatte, in ordine", () => {
  const rows = [
    { role_id: "r2", section_id: "s1", section_name: "Archi", section_sort: 1, role_name: "Viole", instrument_code: "viola", instrument_name: "Viola", seats: 2, part: "tutti", role_sort: 102, slot_id: "b", seat_no: 2, slot_status: "open" },
    { role_id: "r1", section_id: "s1", section_name: "Archi", section_sort: 1, role_name: "Violini", instrument_code: "violino", instrument_name: "Violino", seats: 1, part: "principal", role_sort: 101, slot_id: "a", seat_no: 1, slot_status: "confirmed", musician_id: "m", musician_name: "Rossi Anna" },
    { role_id: "r2", section_id: "s1", section_name: "Archi", section_sort: 1, role_name: "Viole", instrument_code: "viola", instrument_name: "Viola", seats: 2, part: "tutti", role_sort: 102, slot_id: "c", seat_no: 1, slot_status: "open" },
    { role_id: "r3", section_id: null, section_name: null, section_sort: null, role_name: "Direttore", instrument_code: "direttore", seats: 0, part: "solo", role_sort: 1, slot_id: null },
  ];
  const g = groupStaffing(rows);
  assert.deepEqual(g.map((s) => s.name), ["Archi", "Senza sezione"]);
  assert.deepEqual(g[0].roles.map((r) => r.name), ["Violini", "Viole"]);
  assert.deepEqual(g[0].roles[1].slots.map((s) => s.seat_no), [1, 2]);
  assert.equal(g[1].roles[0].slots.length, 0);
  assert.deepEqual(staffingCounts(g), { seats: 3, filled: 1, open: 2 });
});

test("suggestedStatus non tocca gli stati terminali e segue i posti", () => {
  assert.equal(suggestedStatus({ seats: 0, filled: 0, open: 0 }, "draft"), "staffing");
  assert.equal(suggestedStatus({ seats: 3, filled: 0, open: 3 }, "draft"), "planning");
  assert.equal(suggestedStatus({ seats: 3, filled: 1, open: 2 }, "planning"), "partial");
  assert.equal(suggestedStatus({ seats: 3, filled: 3, open: 0 }, "partial"), "complete");
  assert.equal(suggestedStatus({ seats: 3, filled: 0, open: 3 }, "done"), "done");
  assert.equal(suggestedStatus({ seats: 3, filled: 3, open: 0 }, "cancelled"), "cancelled");
});
