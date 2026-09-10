import { assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { buildClientEmail, buildInternalEmail, esc, isReservedAddress, needed, requestKey } from "./orc-client-requests.ts";

const ROW = {
  id: "11111111-2222-4333-8444-555555555555",
  contact_name: "Mario Rossi", contact_company: "Eventi srl", contact_email: "mario@example.invalid", contact_phone: "340 000 0000",
  event_kind: "matrimonio", event_title: "Nozze Bianchi", event_when: "fine ottobre", event_place: "Vicenza",
  schedule: "prova alle 17\ncerimonia alle 19", repertoire: "classico e pop", budget: "1500 €", notes: "servono leggii",
  created_at: "2026-09-10T12:00:00Z",
  snapshot: { titolo: "Nozze", palco: { larghezza_cm: 800, profondita_cm: 500 } },
  slots: [
    { label: "Vl I 1-2", instrument_code: "violino", qty: 2, covered: false },
    { label: "Vla", instrument_code: "viola", qty: 1, covered: true },
    { label: "Fl", instrument_code: "flauto", qty: 1, covered: false },
  ],
  org_name: "Orchestra Demo",
};

Deno.test("chi non sa che formazione serve non chiede zero musicisti", () => {
  /* Senza questa distinzione l'email alla societa si intitolava «0 musicisti — Matrimonio Bianchi»,
     che e il modo migliore per far cestinare una richiesta vera. */
  const m = buildInternalEmail({ ...ROW, slots: [], formation_unknown: true }, "https://stageplot.it");
  assertStringIncludes(m.subject, "Formazione da definire");
  assertStringIncludes(m.text, "formazione da definire");
  assertStringIncludes(m.html, "chiede una proposta");
  /* e quando i posti ci sono, il conteggio resta quello di prima */
  const n = buildInternalEmail({ ...ROW, formation_unknown: false }, "https://stageplot.it");
  assertStringIncludes(n.subject, "musicist");
  if (n.subject.includes("Formazione da definire")) throw new Error("il conteggio normale non deve sparire");
});

Deno.test("quanti musicisti: i posti non coperti, non le righe", () => {
  assertEquals(needed(ROW), 3);
  assertEquals(needed({ ...ROW, slots: [] }), 0);
  assertEquals(needed({ ...ROW, slots: undefined }), 0);
  assertEquals(needed({ ...ROW, slots: [{ label: "x", instrument_code: null, qty: 1, covered: false }] }), 1);
});

Deno.test("l'email alla società basta per decidere senza aprire niente", () => {
  const m = buildInternalEmail(ROW, "https://stageplot.it");
  assertEquals(m.subject, "3 musicisti — Nozze Bianchi (fine ottobre)");
  assertStringIncludes(m.text, "Mario Rossi · Eventi srl");
  assertStringIncludes(m.text, "mario@example.invalid · 340 000 0000");
  assertStringIncludes(m.text, "Matrimonio o cerimonia: Nozze Bianchi");
  assertStringIncludes(m.text, "fine ottobre · Vicenza");
  assertStringIncludes(m.text, "Budget: 1500 €");
  assertStringIncludes(m.text, "Vl I 1-2 — 2 posti");
  assertStringIncludes(m.text, "Fl — 1 posto");
  assertEquals(m.text.includes("Vla"), false, "quello che copre il cliente non è un posto da coprire");
  assertStringIncludes(m.text, "Palco: 8 × 5 m");
  assertStringIncludes(m.html, "/orchestre/admin/richieste/?id=11111111-2222-4333-8444-555555555555");
  assertStringIncludes(m.html, "1 posto coperto dal cliente");
  assertStringIncludes(m.html, "prova alle 17<br>cerimonia alle 19");
});

Deno.test("un solo musicista: il singolare regge", () => {
  const uno = { ...ROW, slots: [{ label: "Fl", instrument_code: "flauto", qty: 1, covered: false }] };
  assertEquals(buildInternalEmail(uno, "https://stageplot.it").subject, "1 musicista — Nozze Bianchi (fine ottobre)");
  assertStringIncludes(buildClientEmail(uno, "https://stageplot.it").text, "un musicista da trovare");
});

Deno.test("la conferma al cliente promette un tempo, non un prezzo", () => {
  const m = buildClientEmail(ROW, "https://stageplot.it");
  assertEquals(m.subject, "Richiesta ricevuta — Nozze Bianchi");
  assertStringIncludes(m.html, "Ciao Mario");
  assertStringIncludes(m.html, "Orchestra Demo");
  assertStringIncludes(m.html, "entro un giorno lavorativo");
  assertStringIncludes(m.html, "non è ancora impegnativo per nessuno");
  assertStringIncludes(m.html, "quello che è arrivato resta com'era");
  assertEquals(/\d+ ?€/.test(m.html), false, "nessun prezzo nella conferma");
  assertEquals(m.html.includes("340 000"), false, "non gli rimandiamo i suoi dati di contatto");
});

Deno.test("niente HTML iniettato dai campi del cliente", () => {
  const cattivo = { ...ROW, event_title: '<script>alert(1)</script>', contact_name: 'Mario "il" Rossi & C.' };
  const m = buildInternalEmail(cattivo, "https://stageplot.it");
  assertEquals(m.html.includes("<script>"), false);
  assertStringIncludes(m.html, "&lt;script&gt;");
  assertStringIncludes(m.html, "Mario &quot;il&quot; Rossi &amp; C.");
  assertEquals(esc('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
});

Deno.test("la chiave d'invio cambia a ogni tentativo e per ogni destinatario", () => {
  assertEquals(requestKey("abc", "internal", 0), "orc-req-internal-abc-0");
  assertEquals(requestKey("abc", "client", 0) === requestKey("abc", "internal", 0), false);
  assertEquals(requestKey("abc", "client", 1) === requestKey("abc", "client", 0), false);
});

Deno.test("gli indirizzi dei dati di prova non ricevono email vere", () => {
  assertEquals(isReservedAddress("mario@example.invalid"), true);
  assertEquals(isReservedAddress("x@example.com"), true);
  assertEquals(isReservedAddress("a@b.test"), true);
  assertEquals(isReservedAddress("simone@stageplot.it"), false);
  assertEquals(isReservedAddress("x@gmail.com"), false);
  assertEquals(isReservedAddress(""), false);
});

Deno.test("un evento senza data non rompe l'oggetto", () => {
  const senza = { ...ROW, event_when: "", event_place: "" };
  assertEquals(buildInternalEmail(senza, "https://stageplot.it").subject, "3 musicisti — Nozze Bianchi");
  assertMatch(buildClientEmail(senza, "https://stageplot.it").html, /Nozze Bianchi<\/b>, con la copia/);
});
