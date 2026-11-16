import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, csvToRows, yesNo, detectDelimiter } from "../src/domain/csv.js";

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
    "Giulia,Rossini,GIULIA@Example.invalid,340 000 0000,Padova,pd,si,120,no,,riserva,violino:5:principale;viola:3:doubling,click:2;in_ear,composer:Nicola Piovani:history;genre:Jazz,prima parte;affidabile\n";
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
  assert.deepEqual(r.repertoire, [{ kind: "composer", name: "Nicola Piovani", source: "history" }, { kind: "genre", name: "Jazz", source: "declared" }]);
  assert.deepEqual(r.tags, ["prima parte", "affidabile"]);
});

test("csvToRows: il primo strumento è principale se nessuno lo dice; errori con numero di riga", () => {
  const t = "nome,cognome,strumenti\nA,B,oboe:4;corno_inglese:3:doubling\n,C,violino\nD,E,kazoo:3\n";
  const { rows, errors } = csvToRows(t, { instruments: new Set(["oboe", "corno_inglese", "violino"]) });
  assert.equal(rows[0].instruments[0].primary, true);
  assert.equal(rows[0].instruments[1].primary, false);
  assert.ok(errors.some((e) => /^Riga 3\b/.test(e)), errors.join(" | "));
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
  assert.ok(rows.filter((r) => r.repertoire.some((x) => x.name === "Nicola Piovani" && x.source === "history")).length >= 10, "abbastanza storico Piovani per il matching");
  assert.ok(rows.every((r) => r.instruments.length >= 1 && r.instruments[0].primary));
});

/* ORC16 (uso reale 16/11): un direttore salva da Excel italiano e il file arriva con «;» e intestazioni a modo suo. */
test("ORC16: il separatore «;» di Excel italiano si riconosce, anche con liste dentro le celle", () => {
  const t = "Nome;Cognome;E-mail;Strumento\r\nAnna;Violini;anna@example.invalid;violino:5,viola:3\r\n";
  assert.equal(detectDelimiter(t), ";");
  const { rows, errors } = csvToRows(t);
  assert.deepEqual(errors, []);
  assert.equal(rows[0].email, "anna@example.invalid");
  assert.deepEqual(rows[0].instruments.map((i) => i.code), ["violino", "viola"]);
});

test("ORC16: tab e virgola; le virgole dentro le virgolette non contano per il separatore", () => {
  assert.equal(detectDelimiter("nome\tcognome\nA\tB"), "\t");
  assert.equal(detectDelimiter('"a;b",c\n1,2'), ",");
  assert.equal(detectDelimiter("nome"), ",");
  assert.equal(detectDelimiter("\uFEFFnome;cognome"), ";");
});

test("ORC16: intestazioni alternative (E-mail, Città, Cellulare, Strumento, Prov.) valgono come quelle standard", () => {
  const { rows, errors, ignored } = csvToRows("Nome,Cognome,E-mail,Cellulare,Città,Prov.,Strumento\nA,B,a@b.it,340 1,Padova,pd,oboe:4\n");
  assert.deepEqual(errors, []); assert.deepEqual(ignored, []);
  assert.equal(rows[0].phone, "340 1"); assert.equal(rows[0].city, "Padova"); assert.equal(rows[0].province, "PD");
  assert.equal(rows[0].instruments[0].code, "oboe");
});

test("ORC16: colonne non capite si dicono; «Nominativo» (nome e cognome insieme) ha il suo messaggio", () => {
  const a = csvToRows("nome,cognome,zodiaco\nA,B,toro\n");
  assert.deepEqual(a.ignored, ["zodiaco"]); assert.equal(a.rows.length, 1);
  const b = csvToRows("Nominativo,Email\nMario Rossi,m@r.it\n");
  assert.equal(b.rows.length, 0);
  assert.match(b.errors[0], /«Nominativo».*nome e cognome insieme/);
  const c = csvToRows("foo,bar\n1,2\n");
  assert.match(c.errors[0], /Nel file ci sono: foo, bar/);
});

test("ORC16: email non valida = si toglie l'email e la persona entra (come dice l'avviso); il nome è nell'avviso", () => {
  const { rows, errors } = csvToRows("nome,cognome,email\nGiulia,Rossi,non-una-email\n");
  assert.equal(rows.length, 1); assert.equal(rows[0].email, "");
  assert.match(errors[0], /Riga 2 \(Giulia Rossi\).*email non valida.*il resto della riga entra/);
});

test("ORC16: doppioni nel file contano una volta (vale l'ultima); stato e livello non validi si dicono", () => {
  const t = "nome,cognome,email,stato,strumenti\nA,B,a@b.it,boh,viola:9\nA,B,a@b.it,,\nC,D,,,\nc,d,,,\n";
  const { rows, errors } = csvToRows(t);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.first_name), ["A", "c"]);
  assert.ok(errors.some((e) => /Riga 3.*stessa persona della riga 2.*stessa email/.test(e)), errors.join("|"));
  assert.ok(errors.some((e) => /Riga 5.*stessa persona della riga 4.*stesso nome/.test(e)), errors.join("|"));
  assert.ok(errors.some((e) => /Riga 2.*stato «boh» non riconosciuto/.test(e)), errors.join("|"));
  assert.ok(errors.some((e) => /Riga 2.*livello «9» di viola fuori scala/.test(e)), errors.join("|"));
});
