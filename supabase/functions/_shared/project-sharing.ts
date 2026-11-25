type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? value : JSON.parse(encoded) as T;
}

function stripContacts(state: unknown): void {
  if (!isRecord(state)) return;
  delete state.contacts;
  delete state.techContact;
  delete state.pdfHeader;
  if (isRecord(state.approval)) delete state.approval.by;
  stripOrchestre(state);
}

/**
 * Orchestre (lotto 8) non scrive nulla nel documento: il collegamento produzione ↔ progetto vive nelle
 * tabelle `orc_*`. Se un giorno una chiave `orc_…` finisse nel blob (per errore, o per un client vecchio),
 * il link pubblico non deve comunque farla uscire: chi c'è in organico è un dato dell'orchestra.
 */
function stripOrchestre(node: unknown): void {
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) if (/^orc[_-]/i.test(key)) delete node[key];
}

/**
 * Il consenso a pubblicare i contatti è UNO, del documento — perché di link ce n'è uno.
 *
 * Era un opt-in della singola variante: lo stesso indirizzo pubblicava o nascondeva nome, telefono
 * ed email dei collaboratori a seconda di quale scena fosse attiva, e l'utente vedeva
 * l'interruttore della sola scena aperta (caccia ai bug 03/08/2026).
 *
 * Ordine di lettura: il `shareOpts` di documento comanda. I documenti creati prima — che lo hanno
 * solo dentro le varianti — acconsentono soltanto se TUTTE le varianti acconsentono: se anche una
 * sola diceva no, quel no l'utente l'ha visto e vale per il link intero. Sono dati personali di
 * terzi, quindi ogni caso incerto sta dalla parte del no.
 */
function contactsAllowedByDocument(doc: JsonRecord): boolean {
  const docOpts = isRecord(doc.shareOpts) ? doc.shareOpts : null;
  if (docOpts) return docOpts.contacts === true;
  if (Array.isArray(doc.variants)) {
    const withOpts = doc.variants.filter((v) => isRecord(v) && isRecord(v.state) && isRecord(v.state.shareOpts));
    if (!withOpts.length) return false;
    return withOpts.every((v) => {
      const st = (v as JsonRecord).state as JsonRecord;
      return (st.shareOpts as JsonRecord).contacts === true;
    });
  }
  return false;
}

/**
 * Produce la sola proiezione pubblicabile di un progetto.
 *
 * Il link pubblico rappresenta soltanto la variante attiva mostrata dalla UI, ma il PERMESSO è del
 * documento (vedi contactsAllowedByDocument). La funzione lavora su una copia JSON e non modifica
 * mai il record letto dal database.
 */
export function projectDataForPublicShare(
  data: unknown,
  options: { allowContacts?: boolean; variantId?: string } = {},
): unknown {
  const allowContacts = options.allowContacts !== false;
  if (!isRecord(data)) return cloneJson(data);
  const out = cloneJson(data);
  if (!isRecord(out)) return out;

  const consenso = allowContacts && contactsAllowedByDocument(out);
  stripOrchestre(out);

  if (Array.isArray(out.variants)) {
    // `variantId` (link fisso, 25/11/2026): la versione scelta da sceltaVersioneCondivisa; senza, `active` come sempre.
    const active = typeof options.variantId === "string"
      ? options.variantId
      : typeof out.active === "string"
      ? out.active
      : "";
    const selected = out.variants.find((variant) =>
      isRecord(variant) && String(variant.id ?? "") === active &&
      isRecord(variant.state)
    );
    const state = isRecord(selected) ? cloneJson(selected.state) : {};
    if (!consenso) stripContacts(state);
    stripOrchestre(state);
    return state;
  }
  if (!consenso) stripContacts(out);
  stripOrchestre(out);
  return out;
}

/**
 * Rimuove i dati di contatto (PII di terzi: musicisti/tecnici) da uno snapshot di progetto
 * PRIMA di archiviarlo nella tabella `feedback` (audit M-13). Il feedback serve a diagnosticare
 * problemi: geometria e layer bastano, i contatti sono PII di terzi da minimizzare. Diversamente
 * dalla condivisione, qui i contatti si rimuovono SEMPRE (nessun opt-in). Lavora su una copia e
 * gestisce sia il documento multi-variante sia lo stato piatto legacy.
 */
export function redactSnapshotForFeedback(snapshot: unknown): unknown {
  if (snapshot === null || snapshot === undefined) return snapshot;
  const out = cloneJson(snapshot);
  if (!isRecord(out)) return out;
  if (Array.isArray(out.variants)) {
    for (const v of out.variants) {
      if (isRecord(v) && isRecord(v.state)) stripContacts(v.state);
    }
  }
  stripContacts(out);
  return out;
}

/**
 * Come il documento, anche la colonna venue_image pubblica soltanto l'immagine
 * della variante attiva. Il record legacy restituito verrà rimappato dal client
 * sull'ID locale creato importando lo stato piatto.
 */
export function projectVenueForPublicShare(
  rawVenue: unknown,
  data: unknown,
  variantId?: string,
): unknown {
  if (rawVenue === null || rawVenue === undefined) return null;
  let parsed = rawVenue;
  if (typeof rawVenue === "string") {
    try {
      parsed = JSON.parse(rawVenue);
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed)) return null;
  if (parsed._venueDoc !== 1 || !isRecord(parsed.images)) {
    return cloneJson(rawVenue);
  }
  const active = typeof variantId === "string"
    ? variantId
    : isRecord(data) && typeof data.active === "string"
    ? data.active
    : "";
  const image = active && isRecord(parsed.images[active])
    ? parsed.images[active]
    : null;
  return image ? JSON.stringify(cloneJson(image)) : null;
}

// ───────── Link fisso alla versione (25/11/2026) ─────────
// Un link `?view=<token>&v=<chiave>` serve SEMPRE la versione legata alla chiave (DOC_EXTRA.shareLinks), mai
// un'altra. La regola è una funzione PURA, con le stesse fixture del client (test/fixtures/link-fisso/).

const VERSIONE_MAX = 999;
const VERSIONE_FINALE_RE =
  /\s*\bv(\d{1,3})\b(?:\s*[·\-–—]\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})?\s*$/i;
const NOME_DI_SERIE_RE = /^(?:Variante|Versione)\s+\d+$/i;
/** forma ammessa della chiave di versione (tokenCondivisione del client: 128 bit in base64url/hex) */
export const CHIAVE_VERSIONE_RE = /^[A-Za-z0-9_-]{16,64}$/;

export type SceltaVersione =
  | { id: string | null; piuRecente: boolean }
  | { errore: "chiave_sconosciuta" | "link_incompleto" };

function intVersione(x: unknown): number {
  return typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= VERSIONE_MAX ? x : 0;
}

/** numero «visibile» di una versione, come il client: scritto, «vN» nel titolo, nome di serie («Versione N» = posizione); 0 = nessuno */
function numeroVisibile(v: JsonRecord, i: number): number {
  const st = isRecord(v.state) ? v.state : {};
  const scritto = intVersione(st.versione);
  if (scritto) return scritto;
  const m = VERSIONE_FINALE_RE.exec(typeof st.titolo === "string" ? st.titolo : "");
  const dalTitolo = m ? parseInt(m[1], 10) : 0;
  if (dalTitolo >= 1 && dalTitolo <= VERSIONE_MAX) return dalTitolo;
  const nome = String(v.name ?? "").trim();
  return !nome || NOME_DI_SERIE_RE.test(nome) ? i + 1 : 0;
}

function statoDi(v: JsonRecord): string {
  return isRecord(v.state) && typeof v.state.status === "string" ? v.state.status : "bozza";
}

/**
 * Sceglie QUALE versione serve un link e dice se ne esiste una più recente. Restituisce solo id e booleano:
 * mai il contenuto di un'altra versione, né le chiavi di `shareLinks`.
 * - con chiave: solo quella versione; chiave sconosciuta o versione eliminata → errore, MAI ripiego;
 * - senza chiave: `shareLegacy` (id fermo) → quella; `shareLegacy === false` → link incompleto;
 *   altrimenti l'ultima Inviata/Approvata, e se non c'è `active` come prima della modifica.
 * `piuRecente` = la scelta è Superata, oppure un'altra Inviata/Approvata ha numero più alto (una Bozza non conta).
 */
export function sceltaVersioneCondivisa(
  doc: unknown,
  opts: { chiave?: string | null } = {},
): SceltaVersione {
  if (!isRecord(doc) || !Array.isArray(doc.variants)) {
    // stato piatto (legacy): una sola versione; una chiave non può puntare a niente
    return opts.chiave ? { errore: "chiave_sconosciuta" } : { id: null, piuRecente: false };
  }
  const vars = doc.variants.filter((v): v is JsonRecord => isRecord(v) && isRecord(v.state) && typeof v.id === "string");
  const trova = (id: unknown) => vars.find((v) => v.id === id);
  let scelta: JsonRecord | undefined;

  if (opts.chiave) {
    const links = isRecord(doc.shareLinks) ? doc.shareLinks : null;
    const voce = links && CHIAVE_VERSIONE_RE.test(opts.chiave) && Object.hasOwn(links, opts.chiave)
      ? links[opts.chiave]
      : null;
    scelta = isRecord(voce) ? trova(voce.v) : undefined;
    if (!scelta) return { errore: "chiave_sconosciuta" };
  } else if (doc.shareLegacy === false) {
    return { errore: "link_incompleto" };
  } else if (typeof doc.shareLegacy === "string") {
    scelta = trova(doc.shareLegacy);
    if (!scelta) return { errore: "chiave_sconosciuta" };
  } else {
    let migliore = -1;
    vars.forEach((v, i) => {
      const s = statoDi(v);
      if (s !== "revisione" && s !== "approvato") return;
      const n = numeroVisibile(v, i);
      if (n >= migliore) { migliore = n; scelta = v; }   // a pari numero vince l'ultima nell'elenco
    });
    scelta ??= trova(doc.active);
  }
  if (!scelta) return { id: typeof doc.active === "string" ? doc.active : null, piuRecente: false };

  const idx = vars.indexOf(scelta);
  const mio = numeroVisibile(scelta, idx);
  const piuRecente = statoDi(scelta) === "superato" ||
    (mio > 0 && vars.some((v, i) => {
      if (v === scelta) return false;
      const s = statoDi(v);
      return (s === "revisione" || s === "approvato") && numeroVisibile(v, i) > mio;
    }));
  return { id: scelta.id as string, piuRecente };
}

/**
 * Risposta pubblica di un progetto condiviso (token di progetto, non consulenza): scelta della versione,
 * stesso `state` filtrato di sempre, planimetria della STESSA versione, più il solo booleano `piuRecente`.
 * Una sola funzione sceglie la versione per dati e planimetria (niente due letture di `active`).
 */
export function rispostaProgettoCondiviso(
  proj: { data: unknown; venue_image: unknown; is_locked?: boolean | null },
  opts: { chiave?: string | null } = {},
): { errore: "chiave_sconosciuta" | "link_incompleto" } | { data: unknown; venue_image: unknown; piuRecente: boolean } {
  const scelta = sceltaVersioneCondivisa(proj.data, opts);
  if ("errore" in scelta) return { errore: scelta.errore };
  const variantId = scelta.id ?? undefined;
  return {
    data: projectDataForPublicShare(proj.data, { allowContacts: !proj.is_locked, variantId }),
    venue_image: projectVenueForPublicShare(proj.venue_image, proj.data, variantId),
    piuRecente: scelta.piuRecente,
  };
}
