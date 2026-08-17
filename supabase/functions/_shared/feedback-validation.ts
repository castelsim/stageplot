export type FeedbackMeta = {
  app_version?: string; page_url?: string; user_agent?: string; viewport?: string; language?: string;
};
export type FeedbackInput = {
  message: string;
  hint: string | null;
  tech_context: Record<string, unknown>;
  meta: FeedbackMeta;
  project_snapshot: unknown | null;
  screenshot: string | null;      // data URL già ridotto e compresso dal client
  user_id: string | null;
  user_email: string | null;
  project_id: string | null;
};
export type ValidationResult =
  | { ok: true; value: FeedbackInput }
  | { ok: false; error: string };

/* 2,8 milioni di caratteri base64 ≈ 2 MB di immagine: lo stesso tetto del bucket. */
const MAX_SHOT_CHARS = 2_800_000;
const HINTS = ["bug", "missing", "idea"];

// Cap anti-abuso su un endpoint pubblico non autenticato: oltre il limite il campo
// viene scartato (il messaggio dell'utente passa comunque). Il rate-limit resta la difesa primaria.
const MAX_SNAPSHOT_BYTES = 1_048_576; // 1 MB
const MAX_TECH_BYTES = 32_768; // 32 KB (tech_context = solo metadati/contatori)
function jsonSize(v: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(v)).length;
  } catch {
    return Infinity;
  }
}

export function validateFeedback(payload: unknown): ValidationResult {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p.honeypot === "string" && p.honeypot.trim() !== "") {
    return { ok: false, error: "spam" };
  }
  const message = typeof p.message === "string" ? p.message.trim() : "";
  if (message.length < 5) return { ok: false, error: "messaggio troppo corto" };
  if (message.length > 1000) return { ok: false, error: "messaggio troppo lungo" };
  const hint = typeof p.hint === "string" && HINTS.includes(p.hint) ? p.hint : null;
  const obj = (x: unknown) => (x && typeof x === "object") ? x as Record<string, unknown> : {};
  return {
    ok: true,
    value: {
      message, hint,
      tech_context: jsonSize(obj(p.tech_context)) > MAX_TECH_BYTES ? {} : obj(p.tech_context),
      meta: obj(p.meta) as FeedbackMeta,
      project_snapshot: (p.project_snapshot != null && jsonSize(p.project_snapshot) <= MAX_SNAPSHOT_BYTES)
        ? p.project_snapshot
        : null,
      // Schermata allegata: solo un data URL di immagine, e solo se sta nel limite. Il client la
      // riduce già a 1600 px e la comprime in JPEG (~200 KB il caso peggiore); questo tetto è la
      // rete di sicurezza contro un client modificato, non la misura attesa.
      screenshot: (typeof p.screenshot === "string" &&
                   /^data:image\/(jpeg|png|webp);base64,/.test(p.screenshot) &&
                   p.screenshot.length <= MAX_SHOT_CHARS)
        ? p.screenshot
        : null,
      // Identità NON dal client (audit S5): l'endpoint è pubblico, un client potrebbe
      // spoofare user_id/user_email. Vengono derivati dal JWT verificato in index.ts.
      user_id: null,
      user_email: null,
      project_id: typeof p.project_id === "string" ? p.project_id : null,
    },
  };
}
