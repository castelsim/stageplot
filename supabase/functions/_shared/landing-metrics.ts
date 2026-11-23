// supabase/functions/_shared/landing-metrics.ts
//
// Normalizza e valida quello che la landing manda al contatore. Esiste come modulo separato
// perché è l'unico punto in cui un input anonimo diventa una riga di database: la migration
// 0026 aveva chiuso l'ingest analytics anonimo proprio per non lasciare quella porta aperta,
// e qui non la riapriamo — passa tutto da questa allowlist, e chi scrive è la Edge Function
// con la service key, mai il browser.
//
// Regola di fondo: NIENTE che arrivi dal client finisce nel database così com'è. Il giorno lo
// mette il server, la provenienza viene ricondotta a un elenco chiuso di nomi, e qualunque
// valore sconosciuto diventa "altro" invece di essere salvato.

export const EVENTI = ["view", "app_click"] as const;
export type Evento = (typeof EVENTI)[number];

/** Gli ingressi verso l'editor marcati nella landing, più "" per la semplice visita.
    Sono SETTE, non i quattro bottoni evidenti: la didascalia sotto la schermata, il link nel
    prima/dopo e quello nelle domande portano gente all'editor esattamente come i bottoni, e
    lasciarli fuori darebbe un totale falso per difetto — peggio di nessun totale.
    Chi ne aggiunge uno deve toccare anche il CHECK della migration 0036. */
export const SORGENTI = [
  "", "hero", "hero-modello", "nav", "finale", "hero-didascalia", "confronto", "domande",
] as const;

/** Provenienze riconosciute. Tutto il resto diventa "altro": nessun host arbitrario nel DB. */
const PROVENIENZE: Record<string, string> = {
  "google": "google",
  "google.com": "google",
  "bing": "bing",
  "duckduckgo": "duckduckgo",
  "ecosia": "ecosia",
  "instagram": "instagram",
  "facebook": "facebook",
  "youtube": "youtube",
  "linkedin": "linkedin",
  "reddit": "reddit",
  "whatsapp": "whatsapp",
  "t.co": "twitter",
  "twitter": "twitter",
  "x.com": "twitter",
  "chatgpt": "chatgpt",
  "openai": "chatgpt",
  "perplexity": "perplexity",
  "claude": "claude",
  "gemini": "gemini",
  "stageplot.it": "interno",
};

export function normalizzaProvenienza(host: unknown): string {
  if (typeof host !== "string" || host.trim() === "") return "diretto";
  const h = host.trim().toLowerCase().replace(/^www\./, "").slice(0, 120);
  if (!/^[a-z0-9.:-]+$/.test(h)) return "altro";
  // il credito «Creato con stageplot.it» dei PDF esportati porta ?utm_source=pdf: l'unico utm riconosciuto
  if (h === "utm:pdf") return "pdf";
  if (PROVENIENZE[h]) return PROVENIENZE[h];
  // un motore o un social ha molti sottodomini (it.search.yahoo.com, m.facebook.com…):
  // si guarda se una chiave nota compare come pezzo del nome, non come sottostringa qualsiasi
  for (const [chiave, nome] of Object.entries(PROVENIENZE)) {
    if (h === chiave || h.endsWith("." + chiave) || h.split(".").includes(chiave)) return nome;
  }
  return "altro";
}

export type Colpo = { event: Evento; source: string; ref: string };

export function validaColpo(payload: unknown): { ok: true; value: Colpo } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") return { ok: false, error: "payload" };
  const p = payload as Record<string, unknown>;

  const event = p.event;
  if (typeof event !== "string" || !(EVENTI as readonly string[]).includes(event)) {
    return { ok: false, error: "evento" };
  }
  const evento = event as Evento;

  const source = typeof p.source === "string" ? p.source : "";
  if (!(SORGENTI as readonly string[]).includes(source)) return { ok: false, error: "sorgente" };
  // una visita non ha un bottone di partenza, un clic sì: altrimenti i conteggi non tornano
  if (evento === "view" && source !== "") return { ok: false, error: "sorgente" };
  if (evento === "app_click" && source === "") return { ok: false, error: "sorgente" };

  return { ok: true, value: { event: evento, source, ref: normalizzaProvenienza(p.ref) } };
}

// ---------------------------------------------------------------------------------------------
// Misure anonime d'uso dell'editor (23/11/2026, studio ORIZZONTE 01, mossa 1).
// Stessa regola della landing: dal client entrano solo parole di un elenco chiuso, il giorno lo
// mette il server, niente IP/user agent/identificatori. Contatore giornaliero per
// evento × lingua × dispositivo × account (sì/no = c'è una sessione salvata, non chi sia).
// Chi aggiunge un valore deve toccare anche il CHECK della migration 0093.

export const EVENTI_USO = ["editor_aperto", "pdf_esportato", "png_esportato", "progetto_condiviso"] as const;
export const LINGUE_USO = ["it", "en", "de", "fr", "es", "altro"] as const;
export const DISPOSITIVI_USO = ["telefono", "computer"] as const;
export const ACCOUNT_USO = ["si", "no"] as const;

export type ColpoUso = { event: string; lang: string; device: string; account: string };

/** true se il payload è un evento d'uso dell'editor (si valida con validaUso, non con validaColpo). */
export function eUso(payload: unknown): boolean {
  return !!payload && typeof payload === "object" &&
    (EVENTI_USO as readonly string[]).includes((payload as Record<string, unknown>).event as string);
}

export function validaUso(payload: unknown): { ok: true; value: ColpoUso } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") return { ok: false, error: "payload" };
  const p = payload as Record<string, unknown>;
  const dentro = (v: unknown, elenco: readonly string[]) => typeof v === "string" && elenco.includes(v);
  if (!dentro(p.event, EVENTI_USO)) return { ok: false, error: "evento" };
  if (!dentro(p.lang, LINGUE_USO)) return { ok: false, error: "lingua" };
  if (!dentro(p.device, DISPOSITIVI_USO)) return { ok: false, error: "dispositivo" };
  if (!dentro(p.account, ACCOUNT_USO)) return { ok: false, error: "account" };
  return { ok: true, value: { event: p.event as string, lang: p.lang as string, device: p.device as string, account: p.account as string } };
}
