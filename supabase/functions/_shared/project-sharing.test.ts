import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  projectDataForPublicShare,
  projectVenueForPublicShare,
} from "./project-sharing.ts";

Deno.test("share pubblico legacy: contatti rimossi per default senza mutare la sorgente", () => {
  const source = {
    titolo: "Live",
    contacts: [{ name: "Ada", contact: "ada@example.test" }],
    techContact: "Ada · ada@example.test",
    pdfHeader: "Ada · +39 000",
    approval: { by: "Ada", at: "2026-07-23T12:00:00Z" },
    shareOpts: { copy: true, contacts: false },
  };
  const shared = projectDataForPublicShare(source) as Record<string, unknown>;
  assertEquals(shared.contacts, undefined);
  assertEquals(shared.techContact, undefined);
  assertEquals(shared.pdfHeader, undefined);
  assertEquals((shared.approval as Record<string, unknown>).by, undefined);
  assertEquals(
    (shared.approval as Record<string, unknown>).at,
    "2026-07-23T12:00:00Z",
  );
  assertEquals(source.contacts.length, 1);
});

Deno.test("share pubblico legacy: contatti preservati soltanto con opt-in esplicito", () => {
  const shared = projectDataForPublicShare({
    contacts: [{ name: "Ada", contact: "+39 000" }],
    techContact: "Ada",
    shareOpts: { contacts: true },
  }) as Record<string, unknown>;
  assertEquals(shared.contacts, [{ name: "Ada", contact: "+39 000" }]);
  assertEquals(shared.techContact, "Ada");
});

Deno.test("share di progetto bloccato forza la rimozione contatti anche con opt-in", () => {
  const shared = projectDataForPublicShare({
    contacts: [{ name: "Ada", contact: "+39 000" }],
    techContact: "Ada",
    pdfHeader: "Ada · +39 000",
    approval: { by: "Ada", at: "2026-07-23T12:00:00Z" },
    shareOpts: { contacts: true },
  }, { allowContacts: false }) as Record<string, unknown>;
  assertEquals(shared.contacts, undefined);
  assertEquals(shared.techContact, undefined);
  assertEquals(shared.pdfHeader, undefined);
  assertEquals((shared.approval as Record<string, unknown>).by, undefined);
});

Deno.test("share pubblico multi-variante: espone soltanto lo stato attivo", () => {
  const shared = projectDataForPublicShare({
    _doc: 1,
    active: "a",
    contacts: [{ contact: "root@example.test" }],
    variants: [
      {
        id: "a",
        state: {
          contacts: [{ contact: "hidden@example.test" }],
          techContact: "Hidden",
          shareOpts: { contacts: false },
        },
      },
      {
        id: "b",
        state: {
          contacts: [{ contact: "shown@example.test" }],
          techContact: "Shown",
          shareOpts: { contacts: true },
        },
      },
      {
        id: "c",
        state: { contacts: [{ contact: "default-hidden@example.test" }] },
      },
    ],
  }) as Record<string, unknown>;
  assertEquals(shared.contacts, undefined);
  assertEquals(shared.techContact, undefined);
  assertEquals(shared.variants, undefined);
});

Deno.test("share pubblico multi-variante: opt-in della sola attiva preserva i suoi contatti", () => {
  const shared = projectDataForPublicShare({
    _doc: 1,
    active: "b",
    variants: [
      {
        id: "a",
        state: {
          contacts: [{ contact: "hidden@example.test" }],
          shareOpts: { contacts: false },
        },
      },
      {
        id: "b",
        state: {
          titolo: "B",
          contacts: [{ contact: "shown@example.test" }],
          techContact: "Shown",
          shareOpts: { contacts: true },
        },
      },
    ],
  }) as Record<string, unknown>;
  assertEquals(shared.titolo, "B");
  assertEquals(shared.contacts, [{ contact: "shown@example.test" }]);
  assertEquals(shared.techContact, "Shown");
});

Deno.test("share pubblico multi-variante: planimetria limitata all'attiva", () => {
  const venue = JSON.stringify({
    _venueDoc: 1,
    active: "a",
    images: {
      a: { name: "A", _dataUrl: "data:image/png;base64,AAAA" },
      b: { name: "B segreta", _dataUrl: "data:image/png;base64,QkJCQg==" },
    },
  });
  const shared = projectVenueForPublicShare(venue, { _doc: 1, active: "a" });
  assertEquals(JSON.parse(shared as string), {
    name: "A",
    _dataUrl: "data:image/png;base64,AAAA",
  });
});
