import type { FeedbackInput } from "./feedback-validation.ts";

const HINT_LABEL: Record<string, string> = { bug: "Bug", missing: "Manca qualcosa", idea: "Idea" };

export function buildFeedbackPrompt(f: FeedbackInput): string {
  const tc = f.tech_context as Record<string, unknown>;
  const m = f.meta;
  const types = tc.object_types ? JSON.stringify(tc.object_types) : "n/d";
  return [
    `Un utente di StagePlot ha segnalato: "${f.message}"`,
    ``,
    `Segnale utente (chip): ${f.hint ? HINT_LABEL[f.hint] : "nessuno"}`,
    ``,
    `Contesto tecnico:`,
    `- Browser/OS/device: ${m.user_agent ?? "n/d"}`,
    `- Viewport / lingua: ${m.viewport ?? "n/d"} / ${m.language ?? "n/d"}`,
    `- App version / URL: ${m.app_version ?? "n/d"} / ${m.page_url ?? "n/d"}`,
    `- Progetto: ${f.project_id ?? "nessuno"}`,
    `- Dimensione palco (cm): ${tc.stage_w ?? "n/d"} x ${tc.stage_d ?? "n/d"}`,
    `- Oggetti: ${tc.total_objects ?? "n/d"} (${types})`,
    `- Input/Output: ${tc.inputs_count ?? "n/d"} / ${tc.outputs_count ?? "n/d"}`,
    `- Oggetto selezionato: ${tc.selected_object_type ?? "nessuno"}`,
    `- Snapshot progetto allegato: ${f.project_snapshot ? "sì" : "no"}`,
    ``,
    `Analizza se è bug, feature mancante, problema UX o richiesta di libreria strumenti.`,
    `Proponi soluzione, rischi di regressione e criteri di accettazione.`,
    `Non modificare codice senza prima spiegare il piano.`,
  ].join("\n");
}

export function buildFeedbackEmail(f: FeedbackInput): { subject: string; html: string } {
  const chip = f.hint ? HINT_LABEL[f.hint] : "Feedback";
  const short = f.message.length > 50 ? f.message.slice(0, 50) + "…" : f.message;
  const subject = `[StagePlot feedback] ${chip} — ${short}`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const prompt = buildFeedbackPrompt(f);
  const html = [
    `<h2>Nuovo feedback StagePlot</h2>`,
    `<p><strong>Messaggio:</strong><br>${esc(f.message)}</p>`,
    `<p><strong>Chip:</strong> ${chip}${f.user_email ? ` · <strong>Utente:</strong> ${esc(f.user_email)}` : ""}</p>`,
    `<hr>`,
    `<p><strong>Prompt Claude pronto (copia e incolla):</strong></p>`,
    `<pre style="white-space:pre-wrap;background:#f4f4f5;padding:12px;border-radius:8px;font-family:monospace;font-size:13px">${esc(prompt)}</pre>`,
  ].join("\n");
  return { subject, html };
}
