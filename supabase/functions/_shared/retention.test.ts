import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { chunks, expiredDayFolders, lastExpiredDay } from "./retention.ts";

const ORA = new Date("2026-09-11T08:00:00Z");

Deno.test("una cartella-giorno scade solo quando anche il suo ultimo istante ha superato i 30 giorni", () => {
  /* soglia: 2026-08-12T08:00Z. Il 10 agosto è finito prima (11/08 00:00): scaduto.
     L'11 agosto finisce il 12 a mezzanotte, prima della soglia: scaduto.
     Il 12 agosto finisce il 13: dentro c'è ancora roba di meno di 30 giorni, e resta. */
  assertEquals(expiredDayFolders(["2026-08-10", "2026-08-11", "2026-08-12", "2026-09-10"], ORA),
    ["2026-08-10", "2026-08-11"]);
});

Deno.test("mai in anticipo: al confine esatto il giorno si cancella, un millisecondo prima no", () => {
  /* il 12 agosto finisce il 13 alle 00:00; con ora = 12 settembre 00:00 la soglia è proprio lì */
  assertEquals(expiredDayFolders(["2026-08-12"], new Date("2026-09-12T00:00:00Z")), ["2026-08-12"]);
  assertEquals(expiredDayFolders(["2026-08-12"], new Date("2026-09-11T23:59:59.999Z")), []);
});

Deno.test("quello che non è una data non si tocca", () => {
  const nomi = ["", "prova", "2026-8-1", "2026-02-31", "2026-13-01", "../2026-01-01", "2026-01-01/x", "2026-01-01 ", ".emptyFolderPlaceholder"];
  assertEquals(expiredDayFolders(nomi, ORA), [], "nessuno di questi è una cartella-giorno vera");
  assertEquals(expiredDayFolders(["2024-02-29"], ORA), ["2024-02-29"], "il 29 febbraio di un anno bisestile sì");
  assertEquals(expiredDayFolders(["2025-02-29"], ORA), [], "quello di un anno che non lo è no");
});

Deno.test("l'elenco esce ordinato e senza sorprese se arriva disordinato", () => {
  assertEquals(expiredDayFolders(["2026-07-02", "2026-06-30", "2026-07-01"], ORA), ["2026-06-30", "2026-07-01", "2026-07-02"]);
});

Deno.test("la soglia si può cambiare, ma parte da 30 giorni", () => {
  assertEquals(expiredDayFolders(["2026-09-05"], ORA, 5), ["2026-09-05"]);
  assertEquals(expiredDayFolders(["2026-09-05"], ORA), []);
});

Deno.test("i lotti coprono tutto, nell'ordine, e rifiutano una dimensione assurda", () => {
  assertEquals(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assertEquals(chunks([], 100), []);
  assertThrows(() => chunks([1], 0));
  assertThrows(() => chunks([1], 1.5));
});

Deno.test("l'ultimo giorno scaduto è lo stesso confine delle cartelle, detto come una data", () => {
  assertEquals(lastExpiredDay(ORA), "2026-08-11");
  assertEquals(lastExpiredDay(new Date("2026-09-12T00:00:00Z")), "2026-08-12", "al confine esatto il giorno è scaduto");
  assertEquals(lastExpiredDay(new Date("2026-09-11T23:59:59.999Z")), "2026-08-11", "un millisecondo prima no");
  /* la stessa regola, provata su un anno di giorni: una cartella è scaduta se e solo se la sua data
     non supera l'ultimo giorno scaduto. Se le due funzioni divergessero, si toglierebbero riferimenti
     a file che ci sono ancora, o resterebbero riferimenti a file già tolti. */
  for (let h = 0; h < 24 * 400; h += 7) {
    const now = new Date(Date.UTC(2026, 0, 1) + h * 3_600_000);
    const giorni = Array.from({ length: 80 }, (_, i) => new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
    const confine = lastExpiredDay(now);
    assertEquals(expiredDayFolders(giorni, now), giorni.filter((g) => g <= confine).sort(), now.toISOString());
  }
});
