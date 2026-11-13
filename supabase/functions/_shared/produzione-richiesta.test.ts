// Contratto fra il modulo di «Produzione eventi» (produzione-eventi/richiesta.js, 13/11/2026) e il server.
// Il modulo non ha una funzione sua: passa da submit-feedback (come il rider). Se un giorno la validazione cambia
// (lunghezze, tetti, campi), questo test lo dice prima che le richieste di Comuni e aziende vengano rifiutate in silenzio.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { validateFeedback } from "./feedback-validation.ts";
import "../../../produzione-eventi/richiesta.js";

// deno-lint-ignore no-explicit-any
const PR = (globalThis as any).ProduzioneRichiesta;

const BASE = {
  tipo: "festa-azienda", data: "2027-12-10", luogo: "Borgo Salice (inventato)", persone: "100-300", presente: "palco",
  livello: "distanza", budget: "3.000 €", descrizione: "Cena con saluti e una band di sette elementi.",
  scadenze: "Preventivi entro novembre", ente: "Azienda di prova", nome: "Mario Prova", email: "prova@esempio.it",
  telefono: "000 000 0000", privacy: "on",
};

Deno.test("la richiesta normale passa la validazione del server com'è", () => {
  const b = PR.corpo(PR.datiPuliti(BASE), { userAgent: "UA", viewport: "390x844", lingua: "it-IT" });
  const v = validateFeedback(b);
  assert(v.ok, JSON.stringify(v));
  if (!v.ok) return;
  assertEquals(v.value.message, b.message);
  assertEquals(v.value.tech_context, b.tech_context, "il contesto arriva intero: è lì la richiesta completa");
  assertEquals(v.value.hint, null);
});

Deno.test("anche la richiesta più lunga possibile passa intera", () => {
  // deno-lint-ignore no-explicit-any
  const pieno = Object.fromEntries(PR.CAMPI.map(([k, max]: any) => [k, "é".repeat(max)]));
  const b = PR.corpo(PR.datiPuliti({ ...pieno, tipo: "altro", email: "prova@esempio.it", privacy: "on" }));
  const v = validateFeedback(b);
  assert(v.ok, JSON.stringify(v));
  if (!v.ok) return;
  assertEquals(v.value.tech_context, b.tech_context);
});

Deno.test("il campo trappola compilato è spam per il server", () => {
  const b = PR.corpo(PR.datiPuliti(BASE), { honeypot: "http://spam" });
  const v = validateFeedback(b);
  assert(!v.ok && v.error === "spam");
});
