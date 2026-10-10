// supabase/functions/_shared/rider-order.ts
//
// «RIDER PRONTO» SENZA PROGETTO (10/10/2026). Chi arriva con un vecchio rider in PDF o Word, una foto del palco o solo
// una descrizione non ha un progetto StagePlot da scegliere: per questo livello, e SOLO per questo, la richiesta nasce
// dagli allegati e/o da una descrizione. Qui stanno le regole pure (si provano con `deno test` senza rete):
//   · pianoRichiesta: cosa accetta create-consultation (progetto obbligatorio per gli altri livelli, come prima);
//   · percorsoAllegato: dove finisce un file nel bucket privato (nome deciso dal server, mai dal cliente);
//   · riderPerEmail: il blocco della mail a Simone (descrizione + link firmati a scadenza);
//   · pulisciAllegatiRider: la retention (il database sceglie, la Storage API cancella, poi il database dimentica).
// La lista dei tipi è la stessa della migrazione 0081 (bucket) e di consulenza/index.html: un test le confronta.

export const RIDER_PRODUCT = "rider-pronto";
export const RIDER_BUCKET = "consultation-uploads";
export const MAX_FILES = 8;                       // come validateUploadRequest (validation.ts) per le consulenze
export const MAX_FILE_BYTES = 10_485_760;         // il limite del bucket (0001): 10 MB a file
export const MAX_DESCRIZIONE = 4000;
export const MAX_NOME = 120;
export const MAX_PER_CHI = 120;
export const MAX_NOME_FILE = 120;
export const LINK_EMAIL_SECONDI = 7 * 24 * 3600;  // i link firmati nella mail a Simone valgono 7 giorni
export const ALLEGATI_NON_PAGATI_GIORNI = 7;
export const ALLEGATI_PAGATI_GIORNI = 90;          // come il link della consulenza (0021)

/** tipo → estensioni ammesse. Il tipo del file si decide dall'estensione (il browser a volte manda "" o tipi strani). */
export const TIPI_AMMESSI: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.oasis.opendocument.text": ["odt"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "image/heif": ["heif"],
};

const EMAIL_RE = /^[^@\s<>"']{1,64}@[^@\s<>"']{1,190}\.[^@\s<>"']{2,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// deno-lint-ignore no-control-regex
const CONTROLLO = new RegExp("[\\u0000-\\u001f\\u007f\\u2028\\u2029]", "g");

export type FileDichiarato = { name: string; type: string; size: number };
export type OrdineRider = {
  nome: string;
  email: string;
  per_chi: string | null;
  data_evento: string | null;
  descrizione: string | null;
  files: FileDichiarato[];
};
export type Piano =
  | { ok: true; product: string; project_id: string; rider: null }
  | { ok: true; product: string; project_id: string | null; rider: OrdineRider }
  | { ok: false; error: string };

function testo(v: unknown, max: number): string | null | false {
  if (v == null) return null;
  if (typeof v !== "string") return false;
  const t = v.replace(CONTROLLO, " ").trim();
  if (!t) return null;
  return t.length > max ? false : t;
}

export function estensione(nome: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Il tipo giusto per un nome di file, o "" se l'estensione non è ammessa. */
export function tipoDaNome(nome: string): string {
  const e = estensione(nome);
  if (!e) return "";
  for (const [tipo, est] of Object.entries(TIPI_AMMESSI)) if (est.includes(e)) return tipo;
  return "";
}

export function validaFile(f: unknown): { ok: true; value: FileDichiarato } | { ok: false; error: string } {
  if (!f || typeof f !== "object" || Array.isArray(f)) return { ok: false, error: "file malformato" };
  const o = f as Record<string, unknown>;
  const name = testo(o.name, MAX_NOME_FILE);
  if (!name) return { ok: false, error: "nome del file non valido" };
  const tipo = tipoDaNome(name);
  if (!tipo) return { ok: false, error: `tipo di file non ammesso: ${name}` };
  if (o.type !== tipo) return { ok: false, error: `tipo di file non coerente: ${name}` };
  const size = o.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size < 1) return { ok: false, error: `file vuoto: ${name}` };
  if (size > MAX_FILE_BYTES) return { ok: false, error: `file oltre 10 MB: ${name}` };
  return { ok: true, value: { name, type: tipo, size } };
}

function dataValida(v: unknown): string | null | false {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return false;
  const m = DATA_RE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? v : false;
}

/** Cosa crea create-consultation a partire dal corpo della richiesta.
 *  - Consulenza Tecnica e Produzione completa: progetto obbligatorio, niente allegati (come prima del 10/10).
 *  - Rider pronto: progetto facoltativo; senza progetto servono almeno un file o una descrizione. */
export function pianoRichiesta(input: unknown, prodotti: ReadonlySet<string>): Piano {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "parametri non validi" };
  const p = input as Record<string, unknown>;
  const product = p.product;
  if (typeof product !== "string" || !prodotti.has(product)) return { ok: false, error: "parametri non validi" };
  const pid = p.project_id;
  if (pid != null && (typeof pid !== "string" || !UUID_RE.test(pid))) return { ok: false, error: "parametri non validi" };
  const projectId = typeof pid === "string" ? pid : null;

  if (product !== RIDER_PRODUCT) {
    if (p.rider != null) return { ok: false, error: "allegati e descrizione solo per il Rider pronto" };
    if (!projectId) return { ok: false, error: "parametri non validi" };
    return { ok: true, product, project_id: projectId, rider: null };
  }

  /* Rider pronto con progetto e senza modulo: la richiesta di prima (il client vecchio manda solo progetto e prodotto). */
  if (p.rider == null) {
    if (!projectId) return { ok: false, error: "manca il materiale: allega un file o scrivi una descrizione" };
    return { ok: true, product, project_id: projectId, rider: null };
  }
  const r = p.rider;
  if (typeof r !== "object" || Array.isArray(r)) return { ok: false, error: "parametri non validi" };
  const o = r as Record<string, unknown>;
  const nome = testo(o.nome, MAX_NOME);
  if (!nome) return { ok: false, error: "nome obbligatorio" };
  const email = testo(o.email, 254);
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "email non valida" };
  const perChi = testo(o.per_chi, MAX_PER_CHI);
  if (perChi === false) return { ok: false, error: "«per chi» troppo lungo" };
  const descrizione = testo(o.descrizione, MAX_DESCRIZIONE);
  if (descrizione === false) return { ok: false, error: "descrizione troppo lunga" };
  const dataEvento = dataValida(o.data_evento);
  if (dataEvento === false) return { ok: false, error: "data dell'evento non valida" };
  const raw = o.files == null ? [] : o.files;
  if (!Array.isArray(raw)) return { ok: false, error: "lista file non valida" };
  if (raw.length > MAX_FILES) return { ok: false, error: `troppi file (al massimo ${MAX_FILES})` };
  const files: FileDichiarato[] = [];
  for (const f of raw) {
    const v = validaFile(f);
    if (!v.ok) return v;
    files.push(v.value);
  }
  if (!projectId && !files.length && !descrizione) {
    return { ok: false, error: "manca il materiale: allega un file o scrivi una descrizione" };
  }
  return {
    ok: true, product, project_id: projectId,
    rider: { nome, email, per_chi: perChi, data_evento: dataEvento, descrizione, files },
  };
}

/** Dove sta l'i-esimo file della richiesta: rider/<id>/<n>-<nome ripulito>.<estensione>. Lo decide il server. */
export function percorsoAllegato(requestId: string, indice: number, nome: string): string {
  if (!UUID_RE.test(requestId)) throw new Error("id richiesta non valido");
  const ext = estensione(nome);
  const base = nome.replace(/\.[A-Za-z0-9]{1,8}$/, "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "file";
  return `rider/${requestId.toLowerCase()}/${indice + 1}-${base}.${ext}`;
}

export type Allegato = { path: string; name: string; type: string; size: number };

export function allegatiDaFiles(requestId: string, files: FileDichiarato[]): Allegato[] {
  return files.map((f, i) => ({ path: percorsoAllegato(requestId, i, f.name), name: f.name, type: f.type, size: f.size }));
}

/** Allegati salvati in una riga (jsonb), solo quelli ben formati della richiesta giusta. */
export function allegatiDellaRiga(requestId: string, v: unknown): Allegato[] {
  if (!Array.isArray(v)) return [];
  const prefisso = `rider/${String(requestId).toLowerCase()}/`;
  return v.filter((a): a is Allegato =>
    !!a && typeof a === "object" && typeof (a as Allegato).path === "string" &&
    (a as Allegato).path.startsWith(prefisso) && !(a as Allegato).path.includes("..") &&
    typeof (a as Allegato).name === "string"
  );
}

export type RiderEmail = {
  senza_progetto: boolean;
  per_chi: string | null;
  data_evento: string | null;
  descrizione: string | null;
  allegati: { name: string; size: number | null; url: string | null }[];
  allegati_rimossi: boolean;
};

/** Il blocco «materiale del cliente» della mail a Simone, o null se la richiesta non ha niente di suo
 *  (consulenza normale). `firma` crea un link firmato a scadenza, o null se il file non c'è (mai caricato). */
export async function riderPerEmail(
  row: Record<string, unknown>,
  firma: (path: string) => Promise<string | null>,
): Promise<RiderEmail | null> {
  const id = typeof row.id === "string" ? row.id : "";
  const allegati = allegatiDellaRiga(id, row.attachments);
  const senza = row.senza_progetto === true;
  const descrizione = typeof row.notes === "string" && row.notes.trim() ? row.notes : null;
  const perChi = typeof row.rider_per === "string" && row.rider_per.trim() ? row.rider_per : null;
  const data = typeof row.event_date === "string" && row.event_date ? row.event_date : null;
  const rimossi = row.allegati_rimossi_at != null;
  if (!senza && !allegati.length && !descrizione && !perChi && !data) return null;
  const out: RiderEmail["allegati"] = [];
  for (const a of allegati) {
    let url: string | null = null;
    try { url = await firma(a.path); } catch { url = null; }
    out.push({ name: a.name, size: typeof a.size === "number" ? a.size : null, url });
  }
  return { senza_progetto: senza, per_chi: perChi, data_evento: data, descrizione, allegati: out, allegati_rimossi: rimossi };
}

// ─────────────────────────────────────────────────────────────── retention
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export type Rimuovi = (bucket: string, nomi: string[]) => Promise<{ error: { message: string } | null; tolti: number }>;

/** Allegati scaduti (7 giorni senza pagamento, 90 dal pagamento): il database li sceglie, la Storage API li toglie,
 *  e SOLO DOPO il database smette di citarli. Se la Storage API fallisce, i riferimenti restano (si vede, e si riprova). */
export async function pulisciAllegatiRider(deps: { rpc: Rpc; rimuovi: Rimuovi }, ora: Date, limite = 200):
  Promise<{ allegati_rider_richieste: number; allegati_rider_tolti: number }> {
  const { data, error } = await deps.rpc("stageplot_rider_allegati_scaduti", { p_ora: ora.toISOString(), p_limite: limite });
  if (error) throw new Error("allegati rider scaduti: " + error.message);
  const righe = Array.isArray(data) ? data as { request_id?: unknown; paths?: unknown }[] : [];
  const ids: string[] = [];
  let tolti = 0;
  for (const r of righe) {
    if (typeof r.request_id !== "string" || !UUID_RE.test(r.request_id)) continue;
    const prefisso = `rider/${r.request_id.toLowerCase()}/`;
    const paths = Array.isArray(r.paths)
      ? r.paths.filter((p): p is string => typeof p === "string" && p.startsWith(prefisso) && !p.includes(".."))
      : [];
    if (paths.length) {
      const x = await deps.rimuovi(RIDER_BUCKET, paths);
      if (x.error) throw new Error("allegati rider: " + x.error.message);
      tolti += x.tolti;
    }
    ids.push(r.request_id);
  }
  if (ids.length) {
    const d = await deps.rpc("stageplot_rider_allegati_dimentica", { p_ids: ids });
    if (d.error) throw new Error("allegati rider, riferimenti: " + d.error.message);
  }
  return { allegati_rider_richieste: ids.length, allegati_rider_tolti: tolti };
}
