// Contratto fra il modulo del «rider tecnico completo» (rider-tecnico-completo/richiesta.js, 11/11/2026) e il server.
// Il modulo non ha una funzione sua: passa da submit-feedback. Se un giorno la validazione cambia (lunghezze, tetti,
// campi), questo test lo dice prima che le richieste delle band vengano rifiutate in silenzio.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { validateFeedback } from "./feedback-validation.ts";
import "../../../rider-tecnico-completo/richiesta.js";

// deno-lint-ignore no-explicit-any
const RR = (globalThis as any).RiderRichiesta;

const BASE = {
  band: "Band di prova", genere: "funk", zona: "Nordest", musicisti: "7",
  formazione: "Voce\nChitarra\nBasso\nTastiere e cori\nBatteria\nTromba\nSax",
  ascolti: "misto", palco: "medio", fonico: "nostro", materiali: "https://esempio.it/rider.pdf", rider_vecchio: "on",
  data: "2026-12-20", note: "", nome: "Mario Prova", email: "prova@esempio.it", telefono: "000 000 0000", privacy: "on",
};

Deno.test("la richiesta normale passa la validazione del server com'è", () => {
  const b = RR.corpo(RR.datiPuliti(BASE), { userAgent: "UA", viewport: "390x844", lingua: "it-IT" });
  const v = validateFeedback(b);
  assert(v.ok, JSON.stringify(v));
  if (!v.ok) return;
  assertEquals(v.value.message, b.message);
  assertEquals(v.value.tech_context, b.tech_context, "il contesto arriva intero: è lì la richiesta completa");
  assertEquals(v.value.hint, null);
});

Deno.test("anche la richiesta più lunga possibile passa intera", () => {
  // deno-lint-ignore no-explicit-any
  const pieno = Object.fromEntries(RR.CAMPI.map(([k, max]: any) => [k, "é".repeat(max)]));
  const b = RR.corpo(RR.datiPuliti({ ...pieno, email: "prova@esempio.it", musicisti: "12", privacy: "on" }));
  const v = validateFeedback(b);
  assert(v.ok, JSON.stringify(v));
  if (!v.ok) return;
  assertEquals(v.value.tech_context, b.tech_context);
});

Deno.test("il campo trappola compilato è spam per il server", () => {
  const b = RR.corpo(RR.datiPuliti(BASE), { honeypot: "http://spam" });
  const v = validateFeedback(b);
  assert(!v.ok && v.error === "spam");
});
