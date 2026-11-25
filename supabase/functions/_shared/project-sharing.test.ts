import { assertEquals } from "jsr:@std/assert@1.0.19";
import casiJson from "../../../test/fixtures/link-fisso/casi.json" with { type: "json" };
import {
  projectDataForPublicShare,
  projectVenueForPublicShare,
  redactSnapshotForFeedback,
  rispostaProgettoCondiviso,
  sceltaVersioneCondivisa,
} from "./project-sharing.ts";

Deno.test("feedback: lo snapshot rimuove SEMPRE i contatti (anche con opt-in) senza mutare la sorgente", () => {
  const source = {
    titolo: "Live",
    contacts: [{ name: "Ada", contact: "ada@example.test" }],
    techContact: "Ada · ada@example.test",
    pdfHeader: "Ada · +39 000",
    approval: { by: "Ada", at: "2026-07-23T12:00:00Z" },
    shareOpts: { contacts: true },
  };
  const out = redactSnapshotForFeedback(source) as Record<string, unknown>;
  assertEquals(out.contacts, undefined);
  assertEquals(out.techContact, undefined);
  assertEquals(out.pdfHeader, undefined);
  assertEquals((out.approval as Record<string, unknown>).by, undefined);
  assertEquals(out.titolo, "Live");                       // dato non-PII preservato
  assertEquals(Array.isArray(source.contacts), true);      // sorgente non mutata
});

Deno.test("feedback: snapshot multi-variante redige i contatti di OGNI variante", () => {
  const source = {
    variants: [
      { id: "a", state: { contacts: [{ name: "Ada" }], techContact: "x" } },
      { id: "b", state: { contacts: [{ name: "Bea" }], pdfHeader: "y" } },
    ],
    active: "a",
  };
  const out = redactSnapshotForFeedback(source) as Record<string, unknown>;
  const vs = out.variants as Array<Record<string, unknown>>;
  assertEquals((vs[0].state as Record<string, unknown>).contacts, undefined);
  assertEquals((vs[0].state as Record<string, unknown>).techContact, undefined);
  assertEquals((vs[1].state as Record<string, unknown>).contacts, undefined);
  assertEquals((vs[1].state as Record<string, unknown>).pdfHeader, undefined);
});

Deno.test("feedback: snapshot null/assente resta invariato", () => {
  assertEquals(redactSnapshotForFeedback(null), null);
  assertEquals(redactSnapshotForFeedback(undefined), undefined);
});

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

/* Era: «opt-in della sola attiva preserva i suoi contatti» — cioè il difetto, scritto come regola.
   Di link ce n'è UNO: se una scena diceva no, quel no l'utente l'ha visto e vale per tutto. */
Deno.test("share pubblico multi-variante: scene discordi → i contatti NON si pubblicano", () => {
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
  assertEquals(shared.contacts, undefined);
  assertEquals(shared.techContact, undefined);
});

Deno.test("share pubblico multi-variante: consenso unanime → i contatti si pubblicano", () => {
  const shared = projectDataForPublicShare({
    _doc: 1,
    active: "b",
    variants: [
      { id: "a", state: { contacts: [{ contact: "a@example.test" }], shareOpts: { contacts: true } } },
      { id: "b", state: { titolo: "B", contacts: [{ contact: "b@example.test" }],
        techContact: "Shown", shareOpts: { contacts: true } } },
    ],
  }) as Record<string, unknown>;
  assertEquals(shared.contacts, [{ contact: "b@example.test" }]);
  assertEquals(shared.techContact, "Shown");
});

Deno.test("share pubblico: il permesso di DOCUMENTO comanda sulle varianti", () => {
  const base = {
    _doc: 1,
    active: "a",
    variants: [
      { id: "a", state: { contacts: [{ contact: "a@example.test" }], techContact: "T",
        shareOpts: { contacts: true } } },
    ],
  };
  /* il documento revoca: le varianti non possono resuscitare il consenso */
  const revocato = projectDataForPublicShare({ ...base, shareOpts: { copy: true, contacts: false } }) as Record<string, unknown>;
  assertEquals(revocato.contacts, undefined);
  assertEquals(revocato.techContact, undefined);
  /* il documento acconsente */
  const concesso = projectDataForPublicShare({ ...base, shareOpts: { copy: true, contacts: true } }) as Record<string, unknown>;
  assertEquals(concesso.contacts, [{ contact: "a@example.test" }]);
});

Deno.test("share pubblico: senza alcun permesso dichiarato non si pubblica nulla", () => {
  const shared = projectDataForPublicShare({
    _doc: 1,
    active: "a",
    variants: [{ id: "a", state: { contacts: [{ contact: "a@example.test" }], techContact: "T" } }],
  }) as Record<string, unknown>;
  assertEquals(shared.contacts, undefined);
  assertEquals(shared.techContact, undefined);
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

Deno.test("Orchestre: il link pubblico non espone nessuna chiave orc_ (documento, variante attiva, stato piatto)", () => {
  const doc = {
    _doc: 1, active: "a", orc_link: { production: "x" }, shareOpts: { contacts: true },
    variants: [{ id: "a", state: { titolo: "Live", items: [{ id: "i1", type: "vlnpost" }], orc_slots: [{ musician: "Ada" }], contacts: [{ name: "Ada" }] } }],
  };
  const out = projectDataForPublicShare(doc, { allowContacts: true }) as Record<string, unknown>;
  assertEquals(out.orc_slots, undefined);
  assertEquals(out.orc_link, undefined);
  assertEquals(Array.isArray(out.items), true);                     // il palco passa
  assertEquals(Array.isArray(out.contacts), true);                  // con consenso i contatti passano ancora
  const flat = projectDataForPublicShare({ titolo: "Piatto", "orc-organico": 1, items: [] }) as Record<string, unknown>;
  assertEquals(flat["orc-organico"], undefined);
  assertEquals(flat.titolo, "Piatto");
  assertEquals((doc.variants[0].state as Record<string, unknown>).orc_slots !== undefined, true);   // sorgente non mutata
});

// ───────── Link fisso alla versione (25/11/2026) ─────────
// Le fixture sono le STESSE che userà il client (L2): test/fixtures/link-fisso/casi.json.
type Caso = { nome: string; doc: unknown; chiave: string | null; atteso: Record<string, unknown> };
const CASI = casiJson as Caso[];

Deno.test("link fisso: ci sono i casi (e non sono stati svuotati)", () => {
  assertEquals(CASI.length >= 27, true);
});

for (const caso of CASI) {
  Deno.test(`link fisso: ${caso.nome}`, () => {
    assertEquals(sceltaVersioneCondivisa(caso.doc, { chiave: caso.chiave }), caso.atteso);
  });
}

const DOC_CONTATTI = {
  _doc: 1,
  active: "a3",
  shareOpts: { contacts: true },
  shareLinks: { AAAAAAAAAAAAAAAAAAAAAA: { v: "a2", at: "2026-11-20" } },
  shareLegacy: "a2",
  variants: [
    { id: "a1", name: "Versione 1", state: { status: "superato", versione: 1, titolo: "T1", contacts: [{ name: "Ada" }] } },
    { id: "a2", name: "Versione 2", state: { status: "revisione", versione: 2, titolo: "T2", contacts: [{ name: "Ada" }], techContact: "Ada" } },
    { id: "a3", name: "Versione 3", state: { status: "bozza", versione: 3, titolo: "T3-SEGRETA" } },
  ],
};

Deno.test("link fisso: la risposta è lo state di QUELLA versione, mai il contenuto di un'altra", () => {
  const r = rispostaProgettoCondiviso({ data: DOC_CONTATTI, venue_image: null }, { chiave: "AAAAAAAAAAAAAAAAAAAAAA" });
  if ("errore" in r) throw new Error("errore inatteso");
  const st = r.data as Record<string, unknown>;
  assertEquals(st.titolo, "T2");
  assertEquals(r.piuRecente, false);                      // la Bozza v3 non fa scattare l'avviso
  const testo = JSON.stringify(r);
  assertEquals(testo.includes("T3-SEGRETA"), false);
  assertEquals(testo.includes("shareLinks"), false);
  assertEquals(testo.includes("shareLegacy"), false);
  assertEquals(testo.includes("AAAAAAAAAAAAAAAAAAAAAA"), false);
});

Deno.test("link fisso: contatti tolti come prima (progetto bloccato o senza consenso), anche per la versione scelta", () => {
  const bloccato = rispostaProgettoCondiviso({ data: DOC_CONTATTI, venue_image: null, is_locked: true }, { chiave: "AAAAAAAAAAAAAAAAAAAAAA" });
  if ("errore" in bloccato) throw new Error("errore inatteso");
  assertEquals((bloccato.data as Record<string, unknown>).contacts, undefined);
  assertEquals((bloccato.data as Record<string, unknown>).techContact, undefined);
  const senzaConsenso = { ...DOC_CONTATTI, shareOpts: { contacts: false } };
  const r = rispostaProgettoCondiviso({ data: senzaConsenso, venue_image: null }, { chiave: "AAAAAAAAAAAAAAAAAAAAAA" });
  if ("errore" in r) throw new Error("errore inatteso");
  assertEquals((r.data as Record<string, unknown>).contacts, undefined);
  const consenso = rispostaProgettoCondiviso({ data: DOC_CONTATTI, venue_image: null }, { chiave: "AAAAAAAAAAAAAAAAAAAAAA" });
  if ("errore" in consenso) throw new Error("errore inatteso");
  assertEquals(Array.isArray((consenso.data as Record<string, unknown>).contacts), true);
});

Deno.test("link fisso: la planimetria è quella della versione scelta, non di `active`", () => {
  const venue = JSON.stringify({
    _venueDoc: 1,
    images: { a2: { nome: "planimetria-v2" }, a3: { nome: "planimetria-v3" } },
  });
  const r = rispostaProgettoCondiviso({ data: DOC_CONTATTI, venue_image: venue }, { chiave: "AAAAAAAAAAAAAAAAAAAAAA" });
  if ("errore" in r) throw new Error("errore inatteso");
  assertEquals(JSON.parse(r.venue_image as string).nome, "planimetria-v2");
  // senza il terzo argomento resta il comportamento storico (active)
  assertEquals(JSON.parse(projectVenueForPublicShare(venue, DOC_CONTATTI) as string).nome, "planimetria-v3");
});

Deno.test("link fisso: chiave sconosciuta → errore, nessun contenuto", () => {
  const r = rispostaProgettoCondiviso({ data: DOC_CONTATTI, venue_image: null }, { chiave: "ZZZZZZZZZZZZZZZZZZZZZZ" });
  assertEquals(r, { errore: "chiave_sconosciuta" });
});

Deno.test("link fisso: link nudo di un progetto a versione unica = come oggi (stesso state filtrato)", () => {
  const doc = { _doc: 1, active: "x", variants: [{ id: "x", name: "Versione 1", state: { titolo: "Solo", contacts: [{ name: "Ada" }] } }] };
  const r = rispostaProgettoCondiviso({ data: doc, venue_image: null });
  if ("errore" in r) throw new Error("errore inatteso");
  assertEquals(r.data, projectDataForPublicShare(doc));
  assertEquals(r.piuRecente, false);
});

Deno.test("link fisso: stato piatto legacy senza chiave = come oggi", () => {
  const flat = { titolo: "Live", contacts: [{ name: "Ada" }] };
  const r = rispostaProgettoCondiviso({ data: flat, venue_image: null });
  if ("errore" in r) throw new Error("errore inatteso");
  assertEquals(r.data, projectDataForPublicShare(flat));
});
