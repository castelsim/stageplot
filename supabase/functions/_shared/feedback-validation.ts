import { metaPulito } from "./feedback-limits.ts";

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
/* Le tre «chip» del box segnalazioni (anche della biglietteria: test/bgl-segnala.test.mjs le confronta). */
export const HINTS = ["bug", "missing", "idea"];
/* Tipi che arrivano solo dall'editor, non dalle chip: «elemento» = un elemento personalizzato inviato per
   revisione (Crea elemento, 13/10/2026). Vale solo con un utente autenticato: vedi elementoRichiedeUtente. */
export const HINTS_EDITOR = ["elemento"];

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

/* ===== Crea elemento: l'elemento inviato per revisione (13/10/2026) =====
   Arriva dentro tech_context come `elemento` (la scheda) ed `elemento_json` (il modello, per rifarlo). Sono dati
   di un client che non controlliamo: si tengono SOLO i campi noti, con tipi e limiti della spec; quello che non
   torna si scarta (il campo, o tutto l'elemento se manca il nome), mai salvato com'era arrivato. */
export type ElementoInviato = {
  nome: string; desc: string; w: number | null; d: number | null; watt: number | null;
  ins: { n: number; tipo: "mic" | "linea" } | null; backline: boolean; forme: number | null; membri: string[];
};
const EL_NOME = 60, EL_DESC = 280, EL_FORME = 200, EL_MEMBRI = 100, EL_WATT = 20_000, EL_INS = 16;
export const MAX_ELEMENTO_JSON_CHARS = 30_000;
/* Caratteri che non si vedono e che cambiano quello che si vede: di controllo C0/C1 (sequenze ANSI nel terminale di
   ops/segnalazioni.sh), di larghezza zero e di direzione (U+200B, U+200E–U+200F, U+202A–U+202E, U+2066–U+2069: girano
   il testo a schermo). Diventano spazi. RESTANO U+200C (ZWNJ) e U+200D (ZWJ): fanno parte del testo (emoji composte
   come famiglie e bandiere, persiano, hindi). INVISIBILI_TESTO lascia anche a capo e tabulazione, che in un messaggio
   servono; prima di pulire, \r\n e \r da solo diventano \n (giro 2 della revisione). */
const INVISIBILI = /[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const INVISIBILI_TESTO = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
export const messaggioPulito = (s: string) => s.replace(/\r\n?/g, "\n").replace(INVISIBILI_TESTO, " ").trim();
/* nome e descrizione: una riga sola, spazi compattati */
const senzaControllo = (s: string) => s.replace(INVISIBILI, " ").replace(/\s+/g, " ").trim();
const numeroIn = (v: unknown, lo: number, hi: number) =>
  (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi) ? v : null;

export function elementoPulito(x: unknown): ElementoInviato | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e = x as Record<string, unknown>;
  if (typeof e.nome !== "string" || e.nome.length > EL_NOME) return null;
  const nome = senzaControllo(e.nome);
  if (!nome) return null;
  const desc = (typeof e.desc === "string" && e.desc.length <= EL_DESC) ? senzaControllo(e.desc) : "";
  let ins: ElementoInviato["ins"] = null;
  if (e.ins && typeof e.ins === "object" && !Array.isArray(e.ins)) {
    const i = e.ins as Record<string, unknown>;
    if (Number.isInteger(i.n) && (i.n as number) >= 1 && (i.n as number) <= EL_INS && (i.tipo === "mic" || i.tipo === "linea")) {
      ins = { n: i.n as number, tipo: i.tipo };
    }
  }
  const forme = (Number.isInteger(e.forme) && (e.forme as number) >= 0 && (e.forme as number) <= EL_FORME) ? e.forme as number : null;
  const membri = Array.isArray(e.membri)
    ? e.membri.filter((m): m is string => typeof m === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(m) &&
        m !== "__proto__" && m !== "constructor" && m !== "prototype").slice(0, EL_MEMBRI)
    : [];
  return {
    nome, desc,
    w: numeroIn(e.w, 10, 100_000), d: numeroIn(e.d, 10, 100_000),
    watt: numeroIn(e.watt, 0, EL_WATT),
    ins, backline: e.backline === true, forme, membri,
  };
}

/* il modello dell'elemento: una STRINGA di JSON (un oggetto), entro 30000 caratteri; altrimenti niente */
export function elementoJsonPulito(x: unknown): string | null {
  if (typeof x !== "string" || x.length > MAX_ELEMENTO_JSON_CHARS) return null;
  try {
    const v = JSON.parse(x);
    return (v && typeof v === "object" && !Array.isArray(v)) ? x : null;
  } catch {
    return null;
  }
}

/* «elemento» senza utente si rifiuta: la risposta torna nell'app solo a chi ha fatto l'accesso */
export function elementoRichiedeUtente(hint: string | null, userId: string | null): boolean {
  return hint === "elemento" && !userId;
}

/* tech_context: i campi dell'elemento hanno il loro tetto e la loro validazione; il resto il tetto di sempre */
function techContextPulito(raw: Record<string, unknown>, hint: string | null): Record<string, unknown> {
  const { elemento, elemento_json, ...resto } = raw;
  /* Privacy (revisione 13/10): per l'elemento arrivano SOLO disegno, misure e descrizione, come promette la frase del
     consenso. Niente contesto del progetto (palco, tipi, conteggi): si parte da vuoto anche se il client lo manda. */
  const tc: Record<string, unknown> = (hint === "elemento" || jsonSize(resto) > MAX_TECH_BYTES) ? {} : resto;
  if (hint === "elemento") {
    const el = elementoPulito(elemento), js = elementoJsonPulito(elemento_json);
    if (el) tc.elemento = el;
    if (el && js !== null) tc.elemento_json = js;
  }
  return tc;
}

export function validateFeedback(payload: unknown): ValidationResult {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p.honeypot === "string" && p.honeypot.trim() !== "") {
    return { ok: false, error: "spam" };
  }
  /* via i caratteri di controllo e di direzione per ogni tipo: il messaggio finisce nella mail e nel terminale */
  const message = typeof p.message === "string" ? messaggioPulito(p.message) : "";
  if (message.length < 5) return { ok: false, error: "messaggio troppo corto" };
  if (message.length > 1000) return { ok: false, error: "messaggio troppo lungo" };
  const hint = typeof p.hint === "string" && (HINTS.includes(p.hint) || HINTS_EDITOR.includes(p.hint)) ? p.hint : null;
  const obj = (x: unknown) => (x && typeof x === "object") ? x as Record<string, unknown> : {};
  const elemento = hint === "elemento";
  /* per l'elemento delle meta restano solo versione e lingua: niente pagina, browser, schermo */
  const meta = metaPulito(p.meta) as FeedbackMeta;
  const metaElemento: FeedbackMeta = {};
  if (meta.app_version !== undefined) metaElemento.app_version = meta.app_version;
  if (meta.language !== undefined) metaElemento.language = meta.language;
  return {
    ok: true,
    value: {
      message, hint,
      tech_context: techContextPulito(obj(p.tech_context), hint),
      meta: elemento ? metaElemento : meta,   // solo stringhe corte e note (16/09): finiscono nelle colonne e nella mail
      project_snapshot: (!elemento && p.project_snapshot != null && jsonSize(p.project_snapshot) <= MAX_SNAPSHOT_BYTES)
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
      project_id: (!elemento && typeof p.project_id === "string") ? p.project_id : null,   // l'elemento non porta il progetto
    },
  };
}
