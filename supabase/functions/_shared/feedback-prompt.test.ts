import { assertStringIncludes, assertEquals } from "jsr:@std/assert@1";
import { buildFeedbackPrompt, buildFeedbackEmail, feedbackAttachment } from "./feedback-prompt.ts";
import type { FeedbackInput } from "./feedback-validation.ts";

const base: FeedbackInput = {
  message: "Manca il sax baritono", hint: "missing",
  tech_context: { stage_w: 1200, stage_d: 800, total_objects: 12, object_types: { microfono: 4 }, inputs_count: 8, outputs_count: 4, selected_object_type: "microfono" },
  meta: { app_version: "2026.07.01", page_url: "https://stageplot.it/", user_agent: "UA", viewport: "1440x900", language: "it" },
  project_snapshot: null, screenshot: null, user_id: null, user_email: null, project_id: null,
};

Deno.test("prompt include messaggio e chip", () => {
  const p = buildFeedbackPrompt(base);
  assertStringIncludes(p, "Manca il sax baritono");
  assertStringIncludes(p, "Manca qualcosa");
});

Deno.test("prompt segnala snapshot assente", () => {
  assertStringIncludes(buildFeedbackPrompt(base), "Snapshot progetto allegato: no");
});

Deno.test("prompt segnala snapshot presente", () => {
  const p = buildFeedbackPrompt({ ...base, project_snapshot: { a: 1 } });
  assertStringIncludes(p, "Snapshot progetto allegato: sì");
});

Deno.test("email: oggetto con chip e anteprima", () => {
  const { subject } = buildFeedbackEmail(base);
  assertStringIncludes(subject, "[StagePlot feedback]");
  assertStringIncludes(subject, "Manca qualcosa");
});

Deno.test("email: html contiene il blocco prompt", () => {
  const { html } = buildFeedbackEmail(base);
  assertStringIncludes(html, "<pre");
  assertStringIncludes(html, "Manca il sax baritono");
});

Deno.test("la mail dice che la schermata c'è, e la porta con sé", () => {
  /* Il difetto (18/08): la schermata finiva nel bucket e la mail non la nominava mai. Chi la
     riceveva pensava fosse andata persa. Ora è ALLEGATA, e la mail lo dice sopra al prompt. */
  const senza = buildFeedbackEmail(base);
  assertStringIncludes(senza.html, "Nessuna schermata allegata");
  assertEquals(feedbackAttachment(base), null);

  const con = { ...base, screenshot: "data:image/jpeg;base64,QUJD" };
  assertStringIncludes(buildFeedbackEmail(con).html, "Schermata allegata a questa email");
  assertStringIncludes(buildFeedbackPrompt(con), "Schermata allegata: sì");
  assertStringIncludes(buildFeedbackPrompt(base), "Schermata allegata: no");

  const a = feedbackAttachment(con)!;
  assertEquals(a.filename, "segnalazione.jpg");   // jpeg → jpg, come nel bucket
  assertEquals(a.content, "QUJD");                // solo base64: il prefisso data: lo mangia Resend
  assertEquals(feedbackAttachment({ ...base, screenshot: "data:image/png;base64,Rk9P" })!.filename, "segnalazione.png");
  assertEquals(feedbackAttachment({ ...base, screenshot: "non un data url" }), null);
});
