import { assertStringIncludes } from "jsr:@std/assert@1";
import { buildFeedbackPrompt, buildFeedbackEmail } from "./feedback-prompt.ts";
import type { FeedbackInput } from "./feedback-validation.ts";

const base: FeedbackInput = {
  message: "Manca il sax baritono", hint: "missing",
  tech_context: { stage_w: 1200, stage_d: 800, total_objects: 12, object_types: { microfono: 4 }, inputs_count: 8, outputs_count: 4, selected_object_type: "microfono" },
  meta: { app_version: "2026.07.01", page_url: "https://stageplot.it/", user_agent: "UA", viewport: "1440x900", language: "it" },
  project_snapshot: null, user_id: null, user_email: null, project_id: null,
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
