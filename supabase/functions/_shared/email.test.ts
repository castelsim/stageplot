import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import { buildEmailHtml } from "./email.ts";

Deno.test("buildEmailHtml: oggetto contiene il nome", () => {
  const { subject } = buildEmailHtml({ name: "Mario Rossi", email: "m@x.it" }, { paid: true, attachmentUrls: [] });
  assertStringIncludes(subject, "Mario Rossi");
});

Deno.test("buildEmailHtml: mostra stato pagato e gli allegati", () => {
  const { html } = buildEmailHtml(
    { name: "Mario", email: "m@x.it", lineup: "5 elementi" },
    { paid: true, attachmentUrls: ["https://x/y.pdf"] },
  );
  assertStringIncludes(html, "5 elementi");
  assertStringIncludes(html, "Pagato");
  assertStringIncludes(html, "https://x/y.pdf");
});

Deno.test("buildEmailHtml: senza pagamento mostra 'Non pagato'", () => {
  const { html } = buildEmailHtml({ name: "Mario", email: "m@x.it" }, { paid: false, attachmentUrls: [] });
  assert(html.includes("Non pagato"));
});
