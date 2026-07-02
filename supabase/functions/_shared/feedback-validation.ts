export type FeedbackMeta = {
  app_version?: string; page_url?: string; user_agent?: string; viewport?: string; language?: string;
};
export type FeedbackInput = {
  message: string;
  hint: string | null;
  tech_context: Record<string, unknown>;
  meta: FeedbackMeta;
  project_snapshot: unknown | null;
  user_id: string | null;
  user_email: string | null;
  project_id: string | null;
};
export type ValidationResult =
  | { ok: true; value: FeedbackInput }
  | { ok: false; error: string };

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
      user_id: typeof p.user_id === "string" ? p.user_id : null,
      user_email: typeof p.user_email === "string" ? p.user_email : null,
      project_id: typeof p.project_id === "string" ? p.project_id : null,
    },
  };
}
