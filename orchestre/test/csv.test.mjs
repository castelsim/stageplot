import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, csvToRows, yesNo } from "../src/domain/csv.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("parseCsv: virgolette, virgole dentro le virgolette, CRLF, BOM, righe vuote", () => {
  const t = '﻿a,b\r\n"x, y","con ""virgolette"""\n\n1,2\n';
  assert.deepEqual(parseCsv(t), [["a", "b"], ["x, y", 'con "virgolette"'], ["1", "2"]]);
});

test("yesNo capisce l'italiano e il default", () => {
  for (const v of ["si", "Sì", "S", "yes", "1", "true", "x"]) assert.equal(yesNo(v), true, v);
  for (const v of ["no", "N", "0", "false"]) assert.equal(yesNo(v), false, v);
  assert.equal(yesNo("", true), true);
  assert.equal(yesNo(undefined, false), false);
});

test("csvToRows: una riga completa diventa l'oggetto per la RPC", () => {
  const t = "nome,cognome,email,telefono,citta,provincia,auto,km_max,trasferte,tournee,stato,strumenti,competenze,repertorio,tag\n" +
    "Giulia,Rossini,GIULIA@Example.invalid,340 000 0000,Padova,pd,si,120,no,,riserva,violino:5:principale;viola:3:doubling,click:2;in_ear,composer:Ennio Morricone:history;genre:Jazz,prima parte;affidabile\n";
  const { rows, errors } = csvToRows(t);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.email, "giulia@example.invalid");
  assert.equal(r.province, "PD");
  assert.equal(r.has_car, true); assert.equal(r.travel_ok, false); assert.equal(r.tour_ok, false);
  assert.equal(r.max_distance_km, 120);
  assert.equal(r.status, "reserve");
  assert.deepEqual(r.instruments, [{ code: "violino", level: 5, primary: true, doubling: false }, { code: "viola", level: 3, primary: false, doubling: true }]);
  assert.deepEqual(r.skills, [{ code: "click", level: 2 }, { code: "in_ear", level: 1 }]);
  assert.deepEqual(r.repertoire, [{ kind: "composer", name: "Ennio Morricone", source: "history" }, { kind: "genre", name: "Jazz", source: "declared" }]);
  assert.deepEqual(r.tags, ["prima parte", "affidabile"]);
});

test("csvToRows: il primo strumento è principale se nessuno lo dice; errori con numero di riga", () => {
  const t = "nome,cognome,strumenti\nA,B,oboe:4;corno_inglese:3:doubling\n,C,violino\nD,E,kazoo:3\n";
  const { rows, errors } = csvToRows(t, { instruments: new Set(["oboe", "corno_inglese", "violino"]) });
  assert.equal(rows[0].instruments[0].primary, true);
  assert.equal(rows[0].instruments[1].primary, false);
  assert.ok(errors.some((e) => e.startsWith("Riga 3:")), errors.join(" | "));
  assert.ok(errors.some((e) => e.includes("kazoo")), errors.join(" | "));
  assert.equal(rows.length, 2, "la riga con lo strumento sconosciuto entra senza quello strumento");
});

test("csvToRows: senza nome e cognome nell'intestazione si ferma", () => {
  const { rows, errors } = csvToRows("email\nx@y.z\n");
  assert.equal(rows.length, 0);
  assert.match(errors[0], /nome/);
});

test("il CSV dimostrativo si legge senza errori e ha 40 musicisti inventati", () => {
  const t = readFileSync(join(root, "orchestre/demo/musicisti-demo.csv"), "utf8");
  const { rows, errors } = csvToRows(t);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 40);
  assert.ok(rows.every((r) => r.email.endsWith("@example.invalid")), "nessuna email vera");
  assert.ok(rows.every((r) => / 000 /.test(r.phone)), "nessun telefono vero");
  assert.ok(rows.filter((r) => r.repertoire.some((x) => x.name === "Ennio Morricone" && x.source === "history")).length >= 10, "abbastanza storico Morricone per il matching");
  assert.ok(rows.every((r) => r.instruments.length >= 1 && r.instruments[0].primary));
});
