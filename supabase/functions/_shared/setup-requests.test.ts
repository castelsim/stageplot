import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  ELECTRIC_GUITAR_SETUP,
  hashToken,
  isPlausibleToken,
  missingRequired,
  questionApplies,
  requestAccess,
  sanitizeAnswers,
  statusAfterDraft,
  statusAfterOpen,
} from "./setup-requests.ts";

const NOW = Date.parse("2026-07-27T12:00:00Z");
const BASE = {
  id: "8f7d0f6c-9c1a-4f0c-9a2b-2f9f4f0f0f01",
  status: "sent",
  expires_at: "2026-08-27T12:00:00Z",
  revoked_at: null,
  current_version: 1,
};

Deno.test("il link scrive solo negli stati in cui il musicista deve poter rispondere", () => {
  assertEquals(requestAccess(BASE, NOW).mode, "write");
  assertEquals(requestAccess({ ...BASE, status: "created" }, NOW).mode, "write");
  assertEquals(requestAccess({ ...BASE, status: "opened" }, NOW).mode, "write");
  assertEquals(
    requestAccess({ ...BASE, status: "in_progress" }, NOW).mode,
    "write",
  );
  assertEquals(requestAccess({ ...BASE, status: "reopened" }, NOW).mode, "write");
});

Deno.test("dopo l'invio il link resta aperto ma in sola lettura", () => {
  const v = requestAccess({ ...BASE, status: "submitted" }, NOW);
  assertEquals(v.ok, true);
  assertEquals(v.mode, "read");
  assertEquals(requestAccess({ ...BASE, status: "closed" }, NOW).mode, "read");
});

Deno.test("revoca, scadenza e token sconosciuto chiudono il link", () => {
  assertEquals(
    requestAccess({ ...BASE, revoked_at: "2026-07-26T10:00:00Z" }, NOW).reason,
    "revoked",
  );
  assertEquals(requestAccess({ ...BASE, status: "revoked" }, NOW).reason, "revoked");
  assertEquals(
    requestAccess({ ...BASE, expires_at: "2026-07-26T10:00:00Z" }, NOW).reason,
    "expired",
  );
  assertEquals(requestAccess(null, NOW).reason, "not_found");
  assertEquals(requestAccess({ ...BASE, status: "boh" }, NOW).ok, false);
});

Deno.test("una richiesta senza scadenza resta valida", () => {
  assertEquals(requestAccess({ ...BASE, expires_at: null }, NOW).mode, "write");
});

Deno.test("gli stati avanzano e non tornano indietro", () => {
  assertEquals(statusAfterOpen("sent"), "opened");
  assertEquals(statusAfterOpen("created"), "opened");
  assertEquals(statusAfterOpen("in_progress"), "in_progress");
  assertEquals(statusAfterOpen("submitted"), "submitted");
  assertEquals(statusAfterDraft("opened"), "in_progress");
  assertEquals(statusAfterDraft("reopened"), "reopened");
});

Deno.test("il token è a 256 bit e nel database ci va solo il suo hash", async () => {
  assertEquals(isPlausibleToken("8Fk29xQp8Fk29xQp8Fk29xQp8Fk29xQp"), true);
  assertEquals(isPlausibleToken("corto"), false);
  assertEquals(isPlausibleToken("con spazi dentro xxxxxxxxxxxxxxxxxxxx"), false);
  assertEquals(isPlausibleToken(42), false);
  const h = await hashToken("8Fk29xQp8Fk29xQp8Fk29xQp8Fk29xQp");
  assertEquals(/^[0-9a-f]{64}$/.test(h), true);
  assertEquals(h, await hashToken("8Fk29xQp8Fk29xQp8Fk29xQp8Fk29xQp"));
  assertEquals(h === await hashToken("altro-token-lungo-abbastanza-xx"), false);
});

Deno.test("le risposte fuori schema o fuori intervallo non entrano nel database", () => {
  const r = sanitizeAnswers(ELECTRIC_GUITAR_SETUP, {
    guitars: "3",
    stands: "double",
    pedalboard: "yes",
    pedalboard_size: "medium",
    amp: "combo",
    power: 999,
    notes: "  ho un wah  ",
    __proto__: { evil: true },
    campo_inventato: "x",
    output: "laser",
  });
  assertEquals(r.answers.guitars, 3);
  assertEquals(r.answers.power, 12, "il numero va riportato nell'intervallo");
  assertEquals(r.answers.notes, "ho un wah");
  assertEquals("campo_inventato" in r.answers, false);
  assertEquals("output" in r.answers, false, "opzione non prevista: scartata");
  assertEquals(r.dropped.includes("output"), true);
});

Deno.test("le risposte a domande non pertinenti vengono buttate", () => {
  const r = sanitizeAnswers(ELECTRIC_GUITAR_SETUP, {
    pedalboard: "no",
    pedalboard_size: "large", // non pertinente: la pedaliera non c'è
    amp: "modeler",
    amp_onstage: "yes", // non pertinente: nessun ampli
  });
  assertEquals("pedalboard_size" in r.answers, false);
  assertEquals("amp_onstage" in r.answers, false);
});

Deno.test("la logica condizionale del questionario è quella attesa", () => {
  const q = ELECTRIC_GUITAR_SETUP.questions.find((x) => x.key === "stereo")!;
  assertEquals(questionApplies(q, { output: "xlr" }), true);
  assertEquals(questionApplies(q, { output: "mic" }), false);
  assertEquals(questionApplies(q, {}), false);
});

Deno.test("non si può inviare lasciando indietro le domande obbligatorie", () => {
  assertEquals(missingRequired(ELECTRIC_GUITAR_SETUP, {}).length > 0, true);
  const complete = {
    guitars: 2,
    stands: "none",
    pedalboard: "no",
    amp: "modeler",
    output: "xlr",
    stereo: "stereo",
    power: 2,
  };
  assertEquals(missingRequired(ELECTRIC_GUITAR_SETUP, complete), []);
  assertEquals(
    missingRequired(ELECTRIC_GUITAR_SETUP, { ...complete, stereo: undefined })
      .includes("stereo"),
    true,
  );
});
