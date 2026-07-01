import { assertEquals } from "jsr:@std/assert@1";
import { validateFeedback } from "./feedback-validation.ts";

Deno.test("ok con messaggio valido", () => {
  const r = validateFeedback({ message: "Manca il basso a 5 corde" });
  assertEquals(r.ok, true);
});

Deno.test("errore: messaggio troppo corto", () => {
  const r = validateFeedback({ message: "ciao" }); // 4 char
  assertEquals(r.ok, false);
});

Deno.test("errore: messaggio troppo lungo", () => {
  const r = validateFeedback({ message: "x".repeat(1001) });
  assertEquals(r.ok, false);
});

Deno.test("honeypot pieno => error 'spam'", () => {
  const r = validateFeedback({ message: "messaggio vero", honeypot: "bot" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "spam");
});

Deno.test("hint fuori enum viene azzerato", () => {
  const r = validateFeedback({ message: "messaggio vero", hint: "xxx" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.hint, null);
});

Deno.test("hint valido preservato", () => {
  const r = validateFeedback({ message: "messaggio vero", hint: "bug" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.hint, "bug");
});
