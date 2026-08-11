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
