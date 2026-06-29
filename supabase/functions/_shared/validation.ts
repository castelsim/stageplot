export const MAX_BYTES = 10_485_760;
export const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/heic", "application/pdf",
];

export type Brief = {
  name: string; email: string;
  event_type?: string; date_place?: string; lineup?: string;
  materials?: string; notes?: string; honeypot?: string;
  attachments?: string[]; stripe_session_id?: string; project_id?: string;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateBrief(input: unknown):
  { ok: true; value: Brief } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "payload non valido" };
  const o = input as Record<string, unknown>;
  if (typeof o.honeypot === "string" && o.honeypot.trim() !== "") return { ok: false, error: "spam" };
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const email = typeof o.email === "string" ? o.email.trim() : "";
  if (!name) return { ok: false, error: "nome obbligatorio" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "email non valida" };
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : undefined);
  const attachments = Array.isArray(o.attachments)
    ? (o.attachments.filter((p) => typeof p === "string") as string[]) : [];
  return {
    ok: true,
    value: {
      name, email,
      event_type: str("event_type"), date_place: str("date_place"),
      lineup: str("lineup"), materials: str("materials"), notes: str("notes"),
      attachments, stripe_session_id: str("stripe_session_id"), project_id: str("project_id"),
    },
  };
}

export function validateUploadRequest(files: unknown):
  { ok: true; value: { name: string; type: string }[] } | { ok: false; error: string } {
  if (!Array.isArray(files)) return { ok: false, error: "lista file non valida" };
  if (files.length > 8) return { ok: false, error: "troppi file (max 8)" };
  const out: { name: string; type: string }[] = [];
  for (const f of files) {
    const name = (f as Record<string, unknown>)?.name;
    const type = (f as Record<string, unknown>)?.type;
    if (typeof name !== "string" || typeof type !== "string") return { ok: false, error: "file malformato" };
    if (!ALLOWED_TYPES.includes(type)) return { ok: false, error: `tipo non consentito: ${type}` };
    out.push({ name, type });
  }
  return { ok: true, value: out };
}
