// L'email «il tuo preventivo è pronto»: testo puro, senza rete.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildQuoteEmail, euro, quoteKey, type QuoteMailRow } from "./orc-quotes.ts";

const ROW: QuoteMailRow = {
  id: "11111111-2222-3333-4444-555555555555",
  description: "Trio d'archi per l'aperitivo, due ore",
  net_cents: 97500, vat_cents: 21450, total_cents: 118950, vat_pct: 22,
  event_title: "Aperitivo in cantina", event_when: "3 ottobre",
  contact_name: "Paola Rossi", org_name: "Orchestra Demo",
};

Deno.test("dice cosa è pronto, per quale evento, e quanto costa in tutto", () => {
  const m = buildQuoteEmail(ROW, "https://stageplot.it");
  assertStringIncludes(m.subject, "Aperitivo in cantina");
  assertStringIncludes(m.html, "Trio d'archi per l'aperitivo, due ore");
  assertStringIncludes(m.html, "1.189,50 €");
  assertStringIncludes(m.text, "1.189,50 €");
  assertStringIncludes(m.html, "Ciao Paola");
});

Deno.test("porta dove si risponde: le proprie richieste, non una pagina qualsiasi", () => {
  const m = buildQuoteEmail(ROW, "https://stageplot.it");
  assertStringIncludes(m.html, 'href="https://stageplot.it/orchestre/mie-richieste/"');
  assertStringIncludes(m.text, "https://stageplot.it/orchestre/mie-richieste/");
});

Deno.test("niente di quello che il cliente non deve vedere: la riga non lo porta nemmeno", () => {
  /* il tipo della riga non ha campi per cachet, margine o note: non si possono mettere per sbaglio */
  const m = buildQuoteEmail(ROW, "https://stageplot.it");
  /* si guarda quello che il cliente LEGGE: i tag e gli stili (dove «margin» c'è, ma è CSS) si tolgono */
  const leggibile = m.html.replace(/<[^>]+>/g, " ").toLowerCase() + " " + m.text.toLowerCase();
  for (const vietato of ["margine", "cachet", "nota interna", "note interne"]) {
    if (leggibile.includes(vietato)) {
      throw new Error("l'email al cliente parla di «" + vietato + "»");
    }
  }
});

Deno.test("quello che scrive la società non diventa HTML", () => {
  const m = buildQuoteEmail({ ...ROW, description: "<script>x</script> & «archi»" }, "https://stageplot.it");
  assertStringIncludes(m.html, "&lt;script&gt;");
  assertEquals(m.html.includes("<script>"), false);
});

Deno.test("un evento senza data e una descrizione vuota non rompono il testo", () => {
  const m = buildQuoteEmail({ ...ROW, event_when: "", description: "" }, "https://stageplot.it");
  assertEquals(m.subject.includes("()"), false);
  assertStringIncludes(m.html, "1.189,50 €");
});

Deno.test("gli importi all'italiana, e una chiave d'invio diversa a ogni tentativo", () => {
  assertEquals(euro(118950), "1.189,50 €");
  assertEquals(euro(5), "0,05 €");
  assertEquals(quoteKey(ROW.id, 1) === quoteKey(ROW.id, 2), false);
});
