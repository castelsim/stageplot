import { assertEquals } from "jsr:@std/assert@1.0.19";
import { consultationShareIsActive } from "./consultation-access.ts";

const NOW = Date.parse("2026-07-23T12:00:00Z");
const ACTIVE = {
  project_id: "6f790d2b-10d7-4b30-8bd3-1c2fb0c6fe32",
  paid: true,
  status: "paid",
  share_expires_at: "2026-10-21T12:00:00Z",
  share_revoked_at: null,
};

Deno.test("consultation access accetta soltanto un link pagato, attivo e non scaduto", () => {
  assertEquals(consultationShareIsActive(ACTIVE, NOW), true);
  assertEquals(
    consultationShareIsActive({ ...ACTIVE, status: "in_progress" }, NOW),
    true,
  );
  assertEquals(
    consultationShareIsActive({ ...ACTIVE, status: "completed" }, NOW),
    true,
  );
});

Deno.test("consultation access fallisce chiusa su stati inattesi o non autorizzati", () => {
  for (
    const status of [
      "new",
      "payment_mismatch",
      "refunded",
      "fraudulent",
      "revoked",
      "future_state",
    ]
  ) {
    assertEquals(
      consultationShareIsActive({ ...ACTIVE, status }, NOW),
      false,
      status,
    );
  }
});

Deno.test("consultation access rifiuta non pagato, revocato, scaduto o privo di progetto", () => {
  assertEquals(
    consultationShareIsActive({ ...ACTIVE, paid: false }, NOW),
    false,
  );
  assertEquals(
    consultationShareIsActive({
      ...ACTIVE,
      share_revoked_at: "2026-07-23T11:00:00Z",
    }, NOW),
    false,
  );
  assertEquals(
    consultationShareIsActive({
      ...ACTIVE,
      share_expires_at: "2026-07-23T12:00:00Z",
    }, NOW),
    false,
  );
  assertEquals(
    consultationShareIsActive({ ...ACTIVE, project_id: null }, NOW),
    false,
  );
});
