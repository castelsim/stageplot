import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import { buildPaidEmail } from "./paid-email.ts";

Deno.test("buildPaidEmail: contatto, importo e link vivo", () => {
  const { subject, html } = buildPaidEmail({
    name: "Mario Rossi", email: "mario@x.it", product: "pro-review",
    amount: 2900, viewUrl: "https://stageplot.it/?view=tok123",
  });
  assertStringIncludes(subject, "Stage Plot Pro Review");
  assertStringIncludes(subject, "Mario Rossi");
  assertStringIncludes(html, "mario@x.it");
  assertStringIncludes(html, "29.00 €");
  assertStringIncludes(html, "https://stageplot.it/?view=tok123");
});

Deno.test("buildPaidEmail: campi mancanti → trattino, nessun crash", () => {
  const { html } = buildPaidEmail({ name: null, email: null, product: null, amount: null, viewUrl: "https://stageplot.it/?view=t" });
  assert(html.includes("—"));
  assertStringIncludes(html, "https://stageplot.it/?view=t");
});
