const ACTIVE_REQUEST_STATUSES = new Set([
  "paid",
  "in_progress",
  "completed",
]);
export const OUTBOX_MAX_ATTEMPTS = 8;

export function notificationCandidateIsActive(
  value: unknown,
  nowMs = Date.now(),
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const expiresAt = Date.parse(String(row.share_expires_at ?? ""));
  return row.paid === true &&
    row.notification_status === "pending" &&
    typeof row.status === "string" &&
    ACTIVE_REQUEST_STATUSES.has(row.status.toLowerCase()) &&
    row.share_revoked_at == null &&
    typeof row.share_token === "string" &&
    row.share_token.length >= 8 &&
    row.share_token.length <= 200 &&
    Number.isFinite(expiresAt) &&
    expiresAt > nowMs;
}

export function notificationClaimIsStale(
  claimedAt: unknown,
  nowMs = Date.now(),
  staleAfterMs = 10 * 60 * 1000,
): boolean {
  const parsed = Date.parse(String(claimedAt ?? ""));
  return !Number.isFinite(parsed) || parsed <= nowMs - staleAfterMs;
}

export function nextOutboxAttempt(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0
    ? Math.min(Number(value) + 1, 1_000_000)
    : 1;
}

export function outboxBatchHasFailures(
  batches: ReadonlyArray<{ failed: unknown }>,
): boolean {
  return batches.some((batch) =>
    typeof batch.failed === "number" &&
    Number.isFinite(batch.failed) &&
    batch.failed > 0
  );
}

export function outboxStatusAfterAttempt(
  delivered: boolean,
  attempts: number,
): "sent" | "pending" | "failed" {
  if (delivered) return "sent";
  return attempts >= OUTBOX_MAX_ATTEMPTS ? "failed" : "pending";
}
