import { assertEquals } from "jsr:@std/assert@1";
import { normalizzaProvenienza, validaColpo } from "./landing-metrics.ts";

Deno.test("una visita senza bottone è valida", () => {
  const r = validaColpo({ event: "view", ref: "" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.ref, "diretto");
});

Deno.test("un clic dichiara da quale bottone parte", () => {
  const r = validaColpo({ event: "app_click", source: "hero-modello", ref: "www.instagram.com" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value, { event: "app_click", source: "hero-modello", ref: "instagram" });
});

Deno.test("evento fuori elenco: rifiutato", () => {
  assertEquals(validaColpo({ event: "acquisto" }).ok, false);
  assertEquals(validaColpo({ event: "view; drop table" }).ok, false);
});

Deno.test("bottone inventato: rifiutato", () => {
  assertEquals(validaColpo({ event: "app_click", source: "qualunque" }).ok, false);
});

Deno.test("visita con bottone e clic senza bottone: rifiutati entrambi", () => {
  /* altrimenti i due conteggi si mescolano e nessuno dei due significa più niente */
  assertEquals(validaColpo({ event: "view", source: "hero" }).ok, false);
  assertEquals(validaColpo({ event: "app_click", source: "" }).ok, false);
});

Deno.test("payload non oggetto: rifiutato", () => {
  assertEquals(validaColpo(null).ok, false);
  assertEquals(validaColpo("view").ok, false);
  assertEquals(validaColpo(42).ok, false);
});

Deno.test("i sottodomini finiscono sotto il nome giusto", () => {
  assertEquals(normalizzaProvenienza("m.facebook.com"), "facebook");
  assertEquals(normalizzaProvenienza("it.search.yahoo.com"), "altro");
  assertEquals(normalizzaProvenienza("l.instagram.com"), "instagram");
  assertEquals(normalizzaProvenienza("www.google.it"), "google");
  assertEquals(normalizzaProvenienza("stageplot.it"), "interno");
});

Deno.test("un host sconosciuto non entra nel database: diventa «altro»", () => {
  /* il punto di tutta la normalizzazione: nessun nome arbitrario finisce in una riga */
  assertEquals(normalizzaProvenienza("sito-di-qualcuno.example"), "altro");
  assertEquals(normalizzaProvenienza("192.168.1.1"), "altro");
});

Deno.test("host malformato o con caratteri strani: «altro», mai un errore", () => {
  assertEquals(normalizzaProvenienza("<script>"), "altro");
  assertEquals(normalizzaProvenienza("a b c"), "altro");
  assertEquals(normalizzaProvenienza("x".repeat(500)), "altro");
  assertEquals(normalizzaProvenienza(undefined), "diretto");
  assertEquals(normalizzaProvenienza(12345), "diretto");
});

Deno.test("«googlefake.com» non si spaccia per Google", () => {
  /* endsWith('.'+chiave) e non includes(chiave): un dominio che contiene il nome non basta */
  assertEquals(normalizzaProvenienza("googlefake.com"), "altro");
  assertEquals(normalizzaProvenienza("instagram-clone.net"), "altro");
});
