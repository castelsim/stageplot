/**
 * Richieste setup ai musicisti — contratto condiviso (spec: docs/richieste/SPEC_R1.md).
 *
 * Qui vivono le regole che NON possono stare nel client: chi può ancora scrivere, cosa può
 * scrivere, e come si passa da uno stato all'altro. La pagina del musicista è solo una vista.
 */

export type RequestStatus =
  | "created"
  | "sent"
  | "opened"
  | "in_progress"
  | "submitted"
  | "reopened"
  | "closed"
  | "expired"
  | "revoked";

export type RequestRow = {
  id?: unknown;
  status?: unknown;
  expires_at?: unknown;
  revoked_at?: unknown;
  closed_at?: unknown;
  current_version?: unknown;
};

/** stati in cui il musicista può ancora scrivere (bozza e invio) */
const WRITABLE = new Set<RequestStatus>([
  "created",
  "sent",
  "opened",
  "in_progress",
  "reopened",
]);
/** stati in cui il link si apre in sola lettura: la risposta c'è, si può rileggere */
const READABLE = new Set<RequestStatus>([...WRITABLE, "submitted", "closed"]);

export type AccessVerdict = {
  ok: boolean;
  mode: "write" | "read" | "denied";
  reason?: "not_found" | "revoked" | "expired" | "unknown_status";
  status?: RequestStatus;
};

/**
 * Verdetto unico e fail-closed sul link del musicista: uno stato nuovo o inatteso non diventa
 * scrivibile per distrazione. La scadenza si valuta qui, non si crede al client.
 */
export function requestAccess(
  row: RequestRow | null | undefined,
  nowMs = Date.now(),
): AccessVerdict {
  if (!row || typeof row.status !== "string") {
    return { ok: false, mode: "denied", reason: "not_found" };
  }
  const status = row.status as RequestStatus;
  if (row.revoked_at !== null && row.revoked_at !== undefined) {
    return { ok: false, mode: "denied", reason: "revoked", status };
  }
  if (status === "revoked") {
    return { ok: false, mode: "denied", reason: "revoked", status };
  }
  if (typeof row.expires_at === "string" && row.expires_at) {
    const exp = Date.parse(row.expires_at);
    if (Number.isFinite(exp) && exp <= nowMs) {
      return { ok: false, mode: "denied", reason: "expired", status };
    }
  }
  if (status === "expired") {
    return { ok: false, mode: "denied", reason: "expired", status };
  }
  if (WRITABLE.has(status)) return { ok: true, mode: "write", status };
  if (READABLE.has(status)) return { ok: true, mode: "read", status };
  return { ok: false, mode: "denied", reason: "unknown_status", status };
}

/** stato dopo che il musicista ha aperto il link (non torna mai indietro) */
export function statusAfterOpen(status: RequestStatus): RequestStatus {
  if (status === "created" || status === "sent") return "opened";
  return status;
}

/** stato dopo il salvataggio di una bozza */
export function statusAfterDraft(status: RequestStatus): RequestStatus {
  if (status === "created" || status === "sent" || status === "opened") {
    return "in_progress";
  }
  return status;
}

/** sha-256 esadecimale: il DB conserva solo questo, il token vive nel link */
export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** il token del link: 43 caratteri url-safe (256 bit), niente informazioni dentro */
export function isPlausibleToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(token);
}

// ---------------------------------------------------------------- questionari

export type QuestionOption = { value: string; label: string; hint?: string };
export type Question = {
  key: string;
  type:
    | "single"
    | "multi"
    | "number"
    | "yesno"
    | "text"
    | "provider" /* Porto io / Produzione / Non so */;
  label: string;
  help?: string;
  options?: QuestionOption[];
  min?: number;
  max?: number;
  optional?: boolean;
  /** mostra la domanda solo se un'altra risposta vale uno di questi valori */
  showIf?: { key: string; in: string[] };
};
export type Questionnaire = {
  id: string;
  title: string;
  minutes: number;
  questions: Question[];
};

const PROVIDER_OPTIONS: QuestionOption[] = [
  { value: "self", label: "Lo porto io" },
  { value: "production", label: "Lo deve portare la produzione" },
  { value: "unknown", label: "Non lo so" },
];

/**
 * Chitarra elettrica. Linguaggio da musicista, non da fonico: nessuna domanda presuppone che
 * l'utente sappia cosa sia una DI. Ogni domanda ha una via d'uscita ("Non lo so").
 */
export const ELECTRIC_GUITAR_SETUP: Questionnaire = {
  id: "electric_guitar_setup",
  title: "Il tuo setup di chitarra",
  minutes: 2,
  questions: [
    {
      key: "guitars",
      type: "number",
      label: "Quante chitarre porti?",
      help: "Conta anche quelle di scorta che vuoi tenere pronte sul palco.",
      min: 0,
      max: 12,
    },
    {
      key: "stands",
      type: "single",
      label: "Ti serve un supporto per appoggiarle?",
      options: [
        { value: "none", label: "No, faccio da me" },
        { value: "single", label: "Sì, un supporto singolo" },
        { value: "double", label: "Sì, un supporto doppio" },
        { value: "rack", label: "Sì, una rastrelliera (3 o più)" },
      ],
    },
    {
      key: "stands_provider",
      type: "provider",
      label: "Il supporto lo porti tu?",
      options: PROVIDER_OPTIONS,
      showIf: { key: "stands", in: ["single", "double", "rack"] },
    },
    {
      key: "pedalboard",
      type: "yesno",
      label: "Usi una pedaliera?",
      help: "Anche una singola pedaliera multieffetto conta.",
    },
    {
      key: "pedalboard_size",
      type: "single",
      label: "Quanto è grande, più o meno?",
      options: [
        { value: "small", label: "Piccola", hint: "quanto un foglio A4" },
        { value: "medium", label: "Media", hint: "mezzo metro circa" },
        { value: "large", label: "Grande", hint: "oltre 70 cm" },
        { value: "unknown", label: "Non lo so" },
      ],
      showIf: { key: "pedalboard", in: ["yes"] },
    },
    {
      key: "amp",
      type: "single",
      label: "Come amplifichi la chitarra?",
      options: [
        { value: "combo", label: "Un combo", hint: "ampli tutto in uno" },
        { value: "stack", label: "Testata e cassa" },
        {
          value: "modeler",
          label: "Un modeler o multieffetto",
          hint: "senza ampli sul palco",
        },
        { value: "none", label: "Niente: uso quello che c'è" },
        { value: "unknown", label: "Non lo so ancora" },
      ],
    },
    {
      key: "amp_provider",
      type: "provider",
      label: "L'amplificatore lo porti tu?",
      options: PROVIDER_OPTIONS,
      showIf: { key: "amp", in: ["combo", "stack"] },
    },
    {
      key: "amp_onstage",
      type: "yesno",
      label: "L'amplificatore starà sul palco, vicino a te?",
      help: "Serve al tecnico per sapere quanto spazio riservarti.",
      showIf: { key: "amp", in: ["combo", "stack"] },
    },
    {
      key: "output",
      type: "single",
      label: "Come esce il suono verso il mixer?",
      help: "Se non lo sai, va benissimo: lo decide il tecnico.",
      options: [
        { value: "mic", label: "Un microfono davanti all'ampli" },
        { value: "xlr", label: "Un cavo XLR dal mio apparecchio" },
        { value: "jack", label: "Un cavo jack" },
        { value: "both", label: "Microfono e cavo insieme" },
        { value: "unknown", label: "Non lo so" },
      ],
    },
    {
      key: "stereo",
      type: "single",
      label: "Esci in mono o in stereo?",
      options: [
        { value: "mono", label: "Mono", hint: "un solo cavo" },
        { value: "stereo", label: "Stereo", hint: "due cavi, destra e sinistra" },
        { value: "unknown", label: "Non lo so" },
      ],
      showIf: { key: "output", in: ["xlr", "jack", "both", "unknown"] },
    },
    {
      key: "power",
      type: "number",
      label: "Quante prese di corrente ti servono?",
      help: "Pedaliera, ampli, alimentatori: conta le spine da attaccare.",
      min: 0,
      max: 12,
    },
    {
      key: "notes",
      type: "text",
      label: "Vuoi aggiungere qualcosa?",
      help: "Qualunque cosa serva al tecnico per prepararti la postazione.",
      optional: true,
    },
  ],
};

export const QUESTIONNAIRES: Record<string, Questionnaire> = {
  [ELECTRIC_GUITAR_SETUP.id]: ELECTRIC_GUITAR_SETUP,
};

export function questionnaireById(id: unknown): Questionnaire | null {
  return (typeof id === "string" && QUESTIONNAIRES[id]) || null;
}

/** una domanda è pertinente per queste risposte? (logica condizionale, valutata anche server-side) */
export function questionApplies(
  q: Question,
  answers: Record<string, unknown>,
): boolean {
  if (!q.showIf) return true;
  const v = answers[q.showIf.key];
  return typeof v === "string" && q.showIf.in.includes(v);
}

export type Sanitized = {
  answers: Record<string, unknown>;
  dropped: string[];
};

/**
 * Ripulisce le risposte: tiene solo le chiavi del questionario, tipi e intervalli previsti, testo
 * troncato. Non ci si fida della pagina: il payload arriva da un client anonimo.
 */
export function sanitizeAnswers(
  schema: Questionnaire,
  raw: unknown,
): Sanitized {
  const out: Record<string, unknown> = {};
  const dropped: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { answers: out, dropped };
  }
  const src = raw as Record<string, unknown>;
  for (const q of schema.questions) {
    if (!(q.key in src)) continue;
    const v = src[q.key];
    if (v === null || v === undefined || v === "") continue;
    if (q.type === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) { dropped.push(q.key); continue; }
      const min = q.min ?? 0, max = q.max ?? 99;
      out[q.key] = Math.min(max, Math.max(min, Math.round(n)));
    } else if (q.type === "yesno") {
      if (v === "yes" || v === "no" || v === "unknown") out[q.key] = v;
      else dropped.push(q.key);
    } else if (q.type === "single" || q.type === "provider") {
      const ok = (q.options || []).some((o) => o.value === v);
      if (ok) out[q.key] = v;
      else dropped.push(q.key);
    } else if (q.type === "multi") {
      if (!Array.isArray(v)) { dropped.push(q.key); continue; }
      const vals = v.filter((x) => (q.options || []).some((o) => o.value === x));
      if (vals.length) out[q.key] = vals;
    } else if (q.type === "text") {
      if (typeof v !== "string") { dropped.push(q.key); continue; }
      const t = v.trim().slice(0, 1000);
      if (t) out[q.key] = t;
    }
  }
  // una risposta a una domanda non pertinente non va conservata: sporcherebbe la proposta
  for (const q of schema.questions) {
    if (q.key in out && !questionApplies(q, out)) {
      delete out[q.key];
      dropped.push(q.key);
    }
  }
  return { answers: out, dropped };
}

/** domande obbligatorie ancora senza risposta: il musicista non deve poter inviare a metà */
export function missingRequired(
  schema: Questionnaire,
  answers: Record<string, unknown>,
): string[] {
  return schema.questions
    .filter((q) => !q.optional && questionApplies(q, answers))
    .filter((q) => answers[q.key] === undefined)
    .map((q) => q.key);
}
