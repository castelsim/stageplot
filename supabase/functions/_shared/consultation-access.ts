type ConsultationAccessRow = {
  project_id?: unknown;
  paid?: unknown;
  status?: unknown;
  share_expires_at?: unknown;
  share_revoked_at?: unknown;
};

const ACTIVE_STATUSES = new Set(["paid", "in_progress", "completed"]);

/**
 * Contratto unico e fail-closed per i bearer link di consulenza.
 * Stati nuovi o inattesi non diventano automaticamente pubblici.
 */
export function consultationShareIsActive(
  row: ConsultationAccessRow | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (
    !row || row.paid !== true || typeof row.project_id !== "string" ||
    !row.project_id
  ) return false;
  if (row.share_revoked_at !== null && row.share_revoked_at !== undefined) {
    return false;
  }
  if (
    typeof row.status !== "string" ||
    !ACTIVE_STATUSES.has(row.status.toLowerCase())
  ) return false;
  if (typeof row.share_expires_at !== "string") return false;
  const expiresAt = Date.parse(row.share_expires_at);
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}
