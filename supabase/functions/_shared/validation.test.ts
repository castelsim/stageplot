import { assertEquals } from "jsr:@std/assert@1";
import { validateBrief, validateUploadRequest } from "./validation.ts";

Deno.test("validateBrief: ok con campi minimi", () => {
  const r = validateBrief({ name: "Mario", email: "m@x.it" });
  assertEquals(r.ok, true);
});

Deno.test("validateBrief: errore senza nome", () => {
  const r = validateBrief({ email: "m@x.it" });
  assertEquals(r.ok, false);
});

Deno.test("validateBrief: errore email non valida", () => {
  const r = validateBrief({ name: "Mario", email: "non-una-email" });
  assertEquals(r.ok, false);
});

Deno.test("validateBrief: honeypot pieno => errore (spam)", () => {
  const r = validateBrief({ name: "Mario", email: "m@x.it", honeypot: "bot" });
  assertEquals(r.ok, false);
});

Deno.test("validateUploadRequest: rifiuta tipo non consentito", () => {
  const r = validateUploadRequest([{ name: "a.exe", type: "application/x-msdownload" }]);
  assertEquals(r.ok, false);
});

Deno.test("validateUploadRequest: accetta pdf e immagini", () => {
  const r = validateUploadRequest([{ name: "rider.pdf", type: "application/pdf" }]);
  assertEquals(r.ok, true);
});
