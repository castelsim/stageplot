// Le spedizioni delle convocazioni, in un posto solo. Le usano il worker `orc-notify` (tutte, al suo giro)
// e `orc-invite-notify` (quelle di una produzione, subito, quando lo staff convoca, conferma o revoca):
// il cron di GitHub gira quando gli pare, e una convocazione che parte ore dopo non serve.
//
// Quattro tipi: 'invite' e 'reminder' portano il link con il token (poi il segreto si cancella);
// 'confirmed' e 'revoked' no — dicono com'è andata e rimandano all'area del musicista.
// La presa è atomica (pending → sending): worker e funzione possono girare insieme senza doppioni.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.108.2";
import { nextOutboxAttempt, outboxStatusAfterAttempt } from "./notification-outbox.ts";
import { buildInviteEmail, buildStatusEmail, idempotencyKey, isReservedAddress, type InviteRow } from "./orc-invitations.ts";
import { send } from "./orc-send.ts";

type Row = {
  id: string; notification_kind: InviteRow["notification_kind"]; notification_attempts: number; deadline: string | null; note_admin: string | null; status: string;
  orc_musicians: { first_name: string; email: string } | null;
  orc_organizations: { name: string } | null;
  orc_productions: { title: string; venue: string | null; conductor: string | null; fee_note: string | null; id: string } | null;
  orc_staffing_roles: { name: string; fee_note: string | null } | null;
  orc_invitation_secrets: { token: string } | null;
};

const EVENTO: Record<string, string> = { invite: "sent", reminder: "reminder_sent", confirmed: "confirmation_sent", revoked: "revocation_sent" };

export async function dispatchInvitations(
  supabase: SupabaseClient,
  opts: { resendKey: string; mode: string; base: string; productionId?: string; limit: number },
): Promise<{ sent: number; failed: number; skipped: number }> {
  const counts = { sent: 0, failed: 0, skipped: 0 };
  let q = supabase.from("orc_invitations")
    .select("id,notification_kind,notification_attempts,deadline,note_admin,status,orc_musicians(first_name,email),orc_organizations(name),orc_productions(id,title,venue,conductor,fee_note),orc_staffing_roles(name,fee_note),orc_invitation_secrets(token)")
    .eq("notification_status", "pending");
  if (opts.productionId) q = q.eq("production_id", opts.productionId);
  const { data: rows, error } = await q.order("notification_attempts", { ascending: true }).order("created_at", { ascending: true }).limit(opts.limit);
  if (error) throw new Error(error.message);
  for (const row of (rows ?? []) as unknown as Row[]) {
    const conLink = row.notification_kind === "invite" || row.notification_kind === "reminder";
    const email = row.orc_musicians?.email ?? "";
    const token = row.orc_invitation_secrets?.token ?? "";
    if (!email || (conLink && !token) || !row.orc_productions) {
      await supabase.from("orc_invitations").update({ notification_status: "failed", notification_last_error: !email ? "no_email" : !row.orc_productions ? "no_production" : "no_secret" }).eq("id", row.id);
      counts.skipped++;
      continue;
    }
    /* presa atomica: solo chi passa da pending a sending spedisce */
    const attempts = nextOutboxAttempt(row.notification_attempts);
    const { data: claimed } = await supabase.from("orc_invitations")
      .update({ notification_status: "sending", notification_claimed_at: new Date().toISOString(), notification_attempts: attempts })
      .eq("id", row.id).eq("notification_status", "pending").select("id").maybeSingle();
    if (!claimed) { counts.skipped++; continue; }
    const { data: dates } = await supabase.from("orc_invitation_dates").select("orc_production_dates(kind,starts_at,ends_at,venue,note)").eq("invitation_id", row.id);
    const inv: InviteRow = {
      id: row.id, notification_kind: row.notification_kind, notification_attempts: attempts, deadline: row.deadline, note_admin: row.note_admin,
      musician_first_name: row.orc_musicians!.first_name, musician_email: email, organization: row.orc_organizations?.name ?? "Orchestre",
      production_title: row.orc_productions.title, production_venue: row.orc_productions.venue, production_conductor: row.orc_productions.conductor,
      /* il compenso del SUO ruolo; quello uguale per tutti solo se il ruolo non ne ha uno */
      production_fee_note: row.orc_staffing_roles?.fee_note || row.orc_productions.fee_note, role_name: row.orc_staffing_roles?.name ?? "",
      dates: ((dates ?? []) as unknown as { orc_production_dates: InviteRow["dates"][number] | null }[]).map((d) => d.orc_production_dates).filter((d): d is InviteRow["dates"][number] => !!d)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    };
    const mail = conLink ? buildInviteEmail(inv, token, opts.base) : buildStatusEmail(inv, opts.base);
    let delivered = false, lastError = "";
    const effectiveMode = opts.mode === "log" || isReservedAddress(email) ? "log" : "send";
    if (effectiveMode === "log") {
      console.info("orc-invite [log]", row.id, inv.notification_kind, "→", email.replace(/^(.).*@/, "$1***@"), mail.subject);
      delivered = true;
    } else {
      try {
        const r = await send(opts.resendKey, email, mail.subject, mail.html, mail.text, idempotencyKey(inv));
        delivered = r.ok; if (!r.ok) lastError = "resend_" + r.status;
      } catch (e) { lastError = e instanceof Error ? e.message.slice(0, 200) : "send_failed"; }
    }
    const status = outboxStatusAfterAttempt(delivered, attempts);
    const patch: Record<string, unknown> = { notification_status: status, notification_claimed_at: null, notification_last_error: lastError };
    if (delivered) {
      if (row.status === "draft") { patch.status = "sent"; patch.sent_at = new Date().toISOString(); }
      if (conLink) await supabase.from("orc_invitation_secrets").delete().eq("invitation_id", row.id);
      await supabase.from("orc_invitation_events").insert({ invitation_id: row.id, event: EVENTO[row.notification_kind] ?? "sent", actor: "system", meta: { mode: effectiveMode } });
    }
    await supabase.from("orc_invitations").update(patch).eq("id", row.id);
    if (delivered) counts.sent++; else counts.failed++;
  }
  return counts;
}
