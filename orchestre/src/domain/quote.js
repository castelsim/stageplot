/* Il preventivo: i conti. Puro, senza rete: lo stesso calcolo lo rifà il database quando il preventivo
   parte, e i due devono dare la stessa cifra al centesimo.

   Il modello l'ha scelto Simone (11/09): per ogni posto il CACHET del musicista, un MARGINE percentuale
   unico su tutto, e sopra l'IVA. Al cliente arriva solo il totale (con imponibile e IVA): cachet e
   margine restano della società.

   Tutto in centesimi interi. Si arrotonda al centesimo una volta per passaggio — imponibile, poi IVA
   sull'imponibile già arrotondato — così il totale è sempre la somma esatta di quello che si vede. */

export const IVA_STANDARD = 22;

/* Le righe che entrano nei conti: quantità da 1 in su, cachet non negativo e intero. */
export function righeValide(righe) {
  return (righe || []).filter((r) => Number.isInteger(Number(r.qty)) && Number(r.qty) >= 1
    && Number.isInteger(Number(r.fee_cents)) && Number(r.fee_cents) >= 0);
}

/* Arrotondamento al centesimo «commerciale»: 0,5 va su. Math.round lo fa già per i positivi. */
const cent = (x) => Math.round(x);

export function calcola(righe, marginePct, ivaPct = IVA_STANDARD) {
  const m = Number(marginePct), v = Number(ivaPct);
  if (!Number.isFinite(m) || m < 0 || m > 500) throw new Error("margine fuori scala: " + marginePct);
  if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error("IVA fuori scala: " + ivaPct);
  const costo = righeValide(righe).reduce((t, r) => t + Number(r.qty) * Number(r.fee_cents), 0);
  const imponibile = cent(costo * (1 + m / 100));
  const iva = cent(imponibile * v / 100);
  return { costo, margine: imponibile - costo, imponibile, iva, totale: imponibile + iva };
}

/* 114375 → «1.143,75 €». Senza Intl: stesso risultato in ogni browser e in Node. */
export function euro(centesimi) {
  const n = Math.round(Number(centesimi) || 0);
  const neg = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const interi = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return neg + interi + "," + String(a % 100).padStart(2, "0") + " €";
}
