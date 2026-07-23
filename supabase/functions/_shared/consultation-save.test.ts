import { assertEquals } from "jsr:@std/assert@1.0.19";
import { validateConsultationSave } from "./consultation-save.ts";

const REV = "2026-07-23T12:34:56.123456+00:00";
const state = { _v: 5, titolo: "Live", items: [], inputs: [], outputs: [] };
const doc = {
  _doc: 1,
  active: "a",
  variants: [
    { id: "a", name: "Piena", state },
    { id: "b", name: "Ridotta", state: { ...state, titolo: "Ridotta" } },
  ],
};

Deno.test("consultation save accetta documento multi-variante e CAS revision", () => {
  const result = validateConsultationSave({
    data: doc,
    venue_image: null,
    expected_revision: REV,
  });
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.value.expectedRevision, REV);
});

Deno.test("consultation save distingue planimetria omessa da cancellazione esplicita", () => {
  const omitted = validateConsultationSave({
    data: doc,
    expected_revision: REV,
  });
  assertEquals(omitted.ok, true);
  if (omitted.ok) {
    assertEquals(
      Object.prototype.hasOwnProperty.call(omitted.value, "venueImage"),
      false,
    );
  }
  const removed = validateConsultationSave({
    data: doc,
    venue_image: null,
    expected_revision: REV,
  });
  assertEquals(removed.ok, true);
  if (removed.ok) {
    assertEquals(
      Object.prototype.hasOwnProperty.call(removed.value, "venueImage"),
      true,
    );
    assertEquals(removed.value.venueImage, null);
  }
});

Deno.test("consultation save rifiuta snapshot piatto che distruggerebbe le varianti", () => {
  const result = validateConsultationSave({
    data: state,
    venue_image: null,
    expected_revision: REV,
  });
  assertEquals(result, { ok: false, error: "documento non valido" });
});

Deno.test("consultation save richiede la revisione attesa", () => {
  const result = validateConsultationSave({ data: doc, venue_image: null });
  assertEquals(result, { ok: false, error: "revisione mancante o non valida" });
});

Deno.test("consultation save rifiuta active non presente e ID duplicati", () => {
  const missing = validateConsultationSave({
    data: { ...doc, active: "missing" },
    venue_image: null,
    expected_revision: REV,
  });
  assertEquals(missing.ok, false);
  const duplicate = validateConsultationSave({
    data: { ...doc, variants: [{ id: "a", state }, { id: "a", state }] },
    venue_image: null,
    expected_revision: REV,
  });
  assertEquals(duplicate.ok, false);
});

Deno.test("consultation save valida il bundle planimetrie", () => {
  const venue = JSON.stringify({
    _venueDoc: 1,
    active: "a",
    images: {
      a: {
        name: "Venue",
        _dataUrl: "data:image/png;base64,AAAA",
        _imgW: 1,
        _imgH: 1,
      },
    },
  });
  assertEquals(
    validateConsultationSave({
      data: doc,
      venue_image: venue,
      expected_revision: REV,
    }).ok,
    true,
  );
  assertEquals(
    validateConsultationSave({
      data: doc,
      venue_image: "not-json",
      expected_revision: REV,
    }).ok,
    false,
  );
});
