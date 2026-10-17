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

/* ===== Crea elemento (13/10/2026): il tipo nuovo ha il suo nome, mai «undefined» ===== */
Deno.test("email e prompt: il tipo «elemento» ha un nome e porta la scheda dell'elemento", () => {
  const f: FeedbackInput = { ...base, message: "Elemento: Proiettore — Su carrello", hint: "elemento",
    tech_context: { ...base.tech_context, elemento: { nome: "Proiettore", desc: "Su carrello", w: 120, d: 80, watt: 300,
      ins: { n: 2, tipo: "linea" }, backline: false, forme: 3, membri: ["cantante", "astamic"] }, elemento_json: '{"w":120}' } };
  const { subject, html } = buildFeedbackEmail(f);
  assertStringIncludes(subject, "Elemento");
  assertEquals(subject.includes("undefined") || html.includes("undefined"), false);
  const p = buildFeedbackPrompt(f);
  assertStringIncludes(p, "Elemento da rivedere");
  assertStringIncludes(p, "120 × 80 cm");
  assertStringIncludes(p, "300 W");
  assertStringIncludes(p, "2 linea");
  assertStringIncludes(p, "cantante, astamic");
  assertStringIncludes(p, "JSON dell'elemento: sì");
  /* un tipo che il server non conosce più non scrive «undefined» */
  const ignoto = buildFeedbackEmail({ ...base, hint: "vecchio" as string });
  assertEquals(ignoto.subject.includes("undefined"), false);
});

Deno.test("prompt dell'elemento: niente progetto né pagina", () => {
  const f: FeedbackInput = { ...base, message: "Elemento: Proiettore", hint: "elemento", project_id: "p-1",
    tech_context: { elemento: { nome: "Proiettore", desc: "", w: 120, d: 80, watt: null, ins: null, backline: false, forme: 1, membri: [] } } };
  const p = buildFeedbackPrompt(f);
  assertEquals(p.includes("Progetto:"), false);
  assertEquals(p.includes("https://stageplot.it/"), false);
  assertEquals(p.includes("Dimensione palco"), false);
  assertStringIncludes(buildFeedbackPrompt(base), "Progetto: nessuno", "gli altri tipi come prima");
});


/* ===== Contorni (16/10/2026): punti, archi e fori nella riga delle forme ===== */
Deno.test("prompt dell'elemento: punti, archi e fori fra parentesi; senza conteggi (client vecchio) la riga di prima", () => {
  const el = { nome: "Banco", desc: "", w: 300, d: 110, watt: null, ins: null, backline: false, forme: 3, membri: [] };
  const f = (extra: Record<string, unknown>) => buildFeedbackPrompt({ ...base, message: "Elemento: Banco", hint: "elemento",
    tech_context: { elemento: { ...el, ...extra } } });
  assertStringIncludes(f({ punti: 148, archi: 12, fori: 1 }), "- Forme disegnate: 3 (148 punti, 12 archi, 1 foro) · elementi del catalogo dentro: nessuno");
  assertStringIncludes(f({ punti: 1, archi: 1, fori: 0 }), "(1 punto, 1 arco, 0 fori)");
  assertStringIncludes(f({}), "- Forme disegnate: 3 · elementi del catalogo dentro: nessuno");
  assertStringIncludes(f({ punti: null, archi: null, fori: null }), "- Forme disegnate: 3 · elementi del catalogo dentro: nessuno");
});
