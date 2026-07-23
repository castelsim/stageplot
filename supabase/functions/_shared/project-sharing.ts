type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? value : JSON.parse(encoded) as T;
}

function redactState(state: unknown, allowContacts: boolean): void {
  if (!isRecord(state)) return;
  const opts = isRecord(state.shareOpts) ? state.shareOpts : null;
  if (allowContacts && opts?.contacts === true) return;
  delete state.contacts;
  delete state.techContact;
  delete state.pdfHeader;
  if (isRecord(state.approval)) delete state.approval.by;
}

/**
 * Produce la sola proiezione pubblicabile di un progetto.
 *
 * Il link pubblico rappresenta soltanto la variante attiva mostrata dalla UI.
 * Il toggle contatti è un opt-in di quella variante. La funzione lavora su una
 * copia JSON e non modifica mai il record letto dal database.
 */
export function projectDataForPublicShare(
  data: unknown,
  options: { allowContacts?: boolean } = {},
): unknown {
  const allowContacts = options.allowContacts !== false;
  if (!isRecord(data)) return cloneJson(data);
  const out = cloneJson(data);
  if (!isRecord(out)) return out;

  if (Array.isArray(out.variants)) {
    const active = typeof out.active === "string" ? out.active : "";
    const selected = out.variants.find((variant) =>
      isRecord(variant) && String(variant.id ?? "") === active &&
      isRecord(variant.state)
    );
    const state = isRecord(selected) ? cloneJson(selected.state) : {};
    redactState(state, allowContacts);
    return state;
  }
  redactState(out, allowContacts);
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
