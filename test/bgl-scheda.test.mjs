/* Biglietteria — scheda di gestione: le parti pure. node --test test/bgl-scheda.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SC = createRequire(import.meta.url)(join(root, "biglietteria/gestione/gst-scheda.js"));
const P = (id, nome, cognome, posti, stato = "attiva", codice = "C" + id) => ({ id, nome, cognome, email: nome.toLowerCase() + "@example.invalid", posti, stato, codice });

test("elenco: prima le attive, per cognome; la ricerca trova senza accenti, per codice e per posto", () => {
  const L = [P("1", "Mario", "Rossi", ["Platea|B|2"]), P("2", "Álvaro", "Àlvarez", ["Platea|A|1"]), P("3", "Luca", "Verdi", [], "disdetta")];
  assert.deepEqual(SC.elencoPrenotazioni(L, "").map((p) => p.id), ["2", "1", "3"]);
  assert.deepEqual(SC.elencoPrenotazioni(L, "alvarez").map((p) => p.id), ["2"]);
  assert.deepEqual(SC.elencoPrenotazioni(L, "C1").map((p) => p.id), ["1"]);
  assert.deepEqual(SC.elencoPrenotazioni(L, "b 2").map((p) => p.id), ["1"]);
});

test("i nomi sui posti (solo prenotazioni attive) e il testo dell'eliminazione dice che nessuno viene avvisato", () => {
  assert.deepEqual(SC.nomiSuiPosti([P("1", "Mario", "Rossi", ["Platea|B|2", "Platea|B|3"]), P("3", "Luca", "Verdi", ["Platea|C|1"], "disdetta")]),
    { "Platea|B|2": "Rossi Mario", "Platea|B|3": "Rossi Mario" });
  const t = SC.testoElimina({ titolo: "Concerto di prova" }, 3);
  assert.match(t, /3 prenotazioni/); assert.match(t, /nessun avviso/); assert.match(t, /Non si può annullare/);
  assert.match(SC.testoElimina({ titolo: "X" }, 1), /1 prenotazione,/);
});

test("la pagina dell'area carica la scheda dopo il modulo", () => {
  const h = readFileSync(join(root, "biglietteria/gestione/index.html"), "utf8");
  assert.ok(h.indexOf('src="gst-scheda.js') > h.indexOf('src="gst-modulo.js'));
});
