/* Il preventivo: i conti. Tutto in centesimi, perché «0,1 + 0,2» in virgola mobile non fa 0,3 e un
   preventivo che sbaglia di un centesimo è un preventivo che il cliente ricontrolla a mano. */
import test from "node:test";
import assert from "node:assert/strict";
import { calcola, euro, righeValide, IVA_STANDARD } from "../src/domain/quote.js";

test("cachet per quantità, più il margine, più l'IVA: in centesimi, senza sorprese", () => {
  const righe = [{ label: "Violino", qty: 2, fee_cents: 25000 }, { label: "Viola", qty: 1, fee_cents: 25000 }];
  const c = calcola(righe, 25, 22);
  assert.equal(c.costo, 75000, "tre musicisti a 250 €: 750 € di cachet");
  assert.equal(c.imponibile, 93750, "con il 25% di margine: 937,50 €");
  assert.equal(c.margine, 18750, "il margine è la differenza, e resta interno");
  assert.equal(c.iva, 20625, "IVA al 22% sull'imponibile");
  assert.equal(c.totale, 114375, "totale 1.143,75 €");
});

test("gli arrotondamenti si fanno una volta, sul totale di ogni passaggio, e al centesimo", () => {
  /* 333,33 € + 10% = 366,663 → 366,66; l'IVA si calcola sull'imponibile già arrotondato */
  const c = calcola([{ qty: 1, fee_cents: 33333 }], 10, 22);
  assert.equal(c.imponibile, 36666);
  assert.equal(c.iva, 8067, "22% di 366,66 = 80,6652 → 80,67");
  assert.equal(c.totale, c.imponibile + c.iva, "il totale è sempre la somma di quello che si vede");
});

test("righe storte non entrano nei conti: quantità, cachet e margine assurdi si rifiutano", () => {
  assert.deepEqual(righeValide([{ qty: 0, fee_cents: 100 }, { qty: 2, fee_cents: -5 }, { qty: 1, fee_cents: 20000 }]), [{ qty: 1, fee_cents: 20000 }]);
  assert.equal(calcola([], 25, 22).totale, 0, "nessuna riga, nessun totale — non NaN");
  assert.throws(() => calcola([{ qty: 1, fee_cents: 100 }], -10, 22), /margine/);
  assert.throws(() => calcola([{ qty: 1, fee_cents: 100 }], 25, 150), /IVA/);
  assert.equal(IVA_STANDARD, 22);
});

test("gli importi si leggono all'italiana", () => {
  assert.equal(euro(114375), "1.143,75 €");
  assert.equal(euro(0), "0,00 €");
  assert.equal(euro(5), "0,05 €");
  assert.equal(euro(100000000), "1.000.000,00 €");
});
