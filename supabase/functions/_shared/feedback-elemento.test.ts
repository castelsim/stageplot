import { assertEquals } from "jsr:@std/assert@1";
import { elementoRichiedeUtente } from "./feedback-validation.ts";

/* Un elemento inviato per revisione aspetta una risposta nell'app: senza utente non c'è a chi darla.
   Il server lo rifiuta (401) PRIMA di caricare l'anteprima e di scrivere la riga. */
Deno.test("elemento senza utente: rifiutato", () => {
  assertEquals(elementoRichiedeUtente("elemento", null), true);
  assertEquals(elementoRichiedeUtente("elemento", "uuid-utente"), false);
  assertEquals(elementoRichiedeUtente("bug", null), false);
  assertEquals(elementoRichiedeUtente(null, null), false);
  assertEquals(elementoRichiedeUtente("elemento", ""), true, "un id vuoto non è un utente");
});
