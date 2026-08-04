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
  options: { allowContacts?: boolean } = {},
): unknown {
  const allowContacts = options.allowContacts !== false;
  if (!isRecord(data)) return cloneJson(data);
  const out = cloneJson(data);
  if (!isRecord(out)) return out;

  const consenso = allowContacts && contactsAllowedByDocument(out);

  if (Array.isArray(out.variants)) {
    const active = typeof out.active === "string" ? out.active : "";
    const selected = out.variants.find((variant) =>
      isRecord(variant) && String(variant.id ?? "") === active &&
      isRecord(variant.state)
    );
    const state = isRecord(selected) ? cloneJson(selected.state) : {};
    if (!consenso) stripContacts(state);
    return state;
  }
  if (!consenso) stripContacts(out);
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
  const active = isRecord(data) && typeof data.active === "string"
    ? data.active
    : "";
  const image = active && isRecord(parsed.images[active])
    ? parsed.images[active]
    : null;
  return image ? JSON.stringify(cloneJson(image)) : null;
}
