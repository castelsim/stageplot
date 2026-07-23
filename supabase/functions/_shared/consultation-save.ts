type JsonRecord = Record<string, unknown>;

export const MAX_CONSULTATION_DATA_BYTES = 5 * 1024 * 1024;
export const MAX_CONSULTATION_VENUE_BYTES = 15 * 1024 * 1024;
const MAX_VARIANTS = 100;

export type ConsultationSave = {
  data: JsonRecord;
  venueImage?: string | null;
  expectedRevision: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateDocument(data: unknown): data is JsonRecord {
  if (!isRecord(data) || data._doc !== 1 || !Array.isArray(data.variants)) {
    return false;
  }
  if (data.variants.length < 1 || data.variants.length > MAX_VARIANTS) {
    return false;
  }
  if (
    typeof data.active !== "string" || data.active.length < 1 ||
    data.active.length > 80
  ) return false;
  const seen = new Set<string>();
  let hasActive = false;
  for (const rawVariant of data.variants) {
    if (
      !isRecord(rawVariant) || typeof rawVariant.id !== "string" ||
      rawVariant.id.length < 1 || rawVariant.id.length > 80
    ) return false;
    if (seen.has(rawVariant.id)) return false;
    seen.add(rawVariant.id);
    if (rawVariant.id === data.active) hasActive = true;
    if (!isRecord(rawVariant.state)) return false;
    const schema = rawVariant.state._v;
    if (
      typeof schema !== "number" || !Number.isInteger(schema) || schema < 1 ||
      schema > 10_000
    ) return false;
  }
  return hasActive;
}

function validateVenueImage(raw: unknown): raw is string | null {
  if (raw === null) return true;
  if (
    typeof raw !== "string" || byteLength(raw) > MAX_CONSULTATION_VENUE_BYTES
  ) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!isRecord(parsed) || parsed._venueDoc !== 1 || !isRecord(parsed.images)) {
    return false;
  }
  const entries = Object.entries(parsed.images);
  if (entries.length > MAX_VARIANTS) return false;
  for (const [variantId, image] of entries) {
    if (!variantId || variantId.length > 80 || !isRecord(image)) return false;
    if (
      typeof image._dataUrl !== "string" ||
      !/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(
        image._dataUrl,
      )
    ) return false;
  }
  return true;
}

export function validateConsultationSave(
  input: unknown,
): { ok: true; value: ConsultationSave } | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: "payload non valido" };
  if (
    typeof input.expected_revision !== "string" ||
    input.expected_revision.length > 80 ||
    !Number.isFinite(Date.parse(input.expected_revision))
  ) {
    return { ok: false, error: "revisione mancante o non valida" };
  }
  if (!validateDocument(input.data)) {
    return { ok: false, error: "documento non valido" };
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(input.data);
  } catch {
    return { ok: false, error: "documento non serializzabile" };
  }
  if (byteLength(encoded) > MAX_CONSULTATION_DATA_BYTES) {
    return { ok: false, error: "documento troppo grande" };
  }
  const hasVenue = Object.prototype.hasOwnProperty.call(input, "venue_image");
  const venue = hasVenue ? input.venue_image : undefined;
  if (hasVenue && !validateVenueImage(venue)) {
    return { ok: false, error: "planimetria non valida o troppo grande" };
  }
  const value: ConsultationSave = {
    data: input.data,
    expectedRevision: input.expected_revision,
  };
  if (hasVenue) value.venueImage = venue as string | null;
  return {
    ok: true,
    value,
  };
}
