import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  nextOutboxAttempt,
  notificationCandidateIsActive,
  notificationClaimIsStale,
  OUTBOX_MAX_ATTEMPTS,
  outboxBatchHasFailures,
  outboxStatusAfterAttempt,
} from "./notification-outbox.ts";

const NOW = Date.parse("2026-07-23T12:00:00.000Z");
const ACTIVE = {
  paid: true,
  status: "paid",
  notification_status: "pending",
  share_revoked_at: null,
  share_expires_at: "2026-07-24T12:00:00.000Z",
  share_token: "token-valid-123",
};

Deno.test("outbox seleziona soltanto richieste pagate e attive", () => {
  assertEquals(notificationCandidateIsActive(ACTIVE, NOW), true);
  assertEquals(
    notificationCandidateIsActive({ ...ACTIVE, paid: false }, NOW),
    false,
  );
  assertEquals(
    notificationCandidateIsActive({
      ...ACTIVE,
      notification_status: "sent",
    }, NOW),
    false,
  );
  assertEquals(
    notificationCandidateIsActive({
      ...ACTIVE,
      share_revoked_at: "2026-07-23T11:00:00.000Z",
    }, NOW),
    false,
  );
  assertEquals(
    notificationCandidateIsActive({
      ...ACTIVE,
      share_expires_at: "2026-07-23T11:00:00.000Z",
    }, NOW),
    false,
  );
});

Deno.test("outbox riconosce claim mancanti, invalidi o scaduti", () => {
  assertEquals(notificationClaimIsStale(null, NOW), true);
  assertEquals(notificationClaimIsStale("invalid", NOW), true);
  assertEquals(
    notificationClaimIsStale("2026-07-23T11:49:59.000Z", NOW),
    true,
  );
  assertEquals(
    notificationClaimIsStale("2026-07-23T11:55:00.000Z", NOW),
    false,
  );
});

Deno.test("outbox incrementa i tentativi con fallback sicuro", () => {
  assertEquals(nextOutboxAttempt(0), 1);
  assertEquals(nextOutboxAttempt(4), 5);
  assertEquals(nextOutboxAttempt(-1), 1);
  assertEquals(nextOutboxAttempt("4"), 1);
});

Deno.test("outbox rende fallito il job se almeno un invio fallisce", () => {
  assertEquals(
    outboxBatchHasFailures([
      { failed: 0 },
      { failed: 1 },
      { failed: 0 },
    ]),
    true,
  );
  assertEquals(
    outboxBatchHasFailures([
      { failed: 0 },
      { failed: 0 },
    ]),
    false,
  );
});

Deno.test("outbox isola un record poison dopo il limite di tentativi", () => {
  assertEquals(outboxStatusAfterAttempt(true, 1), "sent");
  assertEquals(
    outboxStatusAfterAttempt(false, OUTBOX_MAX_ATTEMPTS - 1),
    "pending",
  );
  assertEquals(
    outboxStatusAfterAttempt(false, OUTBOX_MAX_ATTEMPTS),
    "failed",
  );
});
