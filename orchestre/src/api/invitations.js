/* Convocazioni: inviti, azioni dello staff, elenco. Le scritture passano tutte da RPC. */
import { sb } from "../sb.js";
import { SB_URL, SB_ANON } from "../config.js";

const fail = (error) => { if (error) throw error; };

export async function invite(productionId, roleId, musicianIds, { deadline = null, note = "", runId = null } = {}) {
  const { data, error } = await sb.rpc("orc_invite", { production: productionId, role: roleId, musicians: musicianIds, deadline, note, run: runId });
  fail(error);
  return data;
}
export async function action(invitationId, act, reason = "") {
  fail((await sb.rpc("orc_invitation_action", { invitation: invitationId, action: act, reason })).error);
}
export async function list(productionId) {
  const { data, error } = await sb.rpc("orc_invitations_list", { production: productionId });
  fail(error);
  return data || [];
}
export async function events(invitationId) {
  const { data, error } = await sb.from("orc_invitation_events").select("event, actor, meta, at").eq("invitation_id", invitationId).order("at");
  fail(error);
  return data || [];
}
/* Link nuovo per un invito già partito (0087): restituisce il token in chiaro UNA volta; il vecchio link smette di valere. */
export async function relink(invitationId) {
  const { data, error } = await sb.rpc("orc_invitation_relink", { invitation: invitationId });
  fail(error);
  return data;
}
/* «Ci sono, ma solo se manca qualcuno» (0087): il segno sta sull'invito. */
export async function reserveFlags(productionId) {
  const { data, error } = await sb.from("orc_invitations").select("id, reserve_only").eq("production_id", productionId).eq("reserve_only", true);
  fail(error);
  return new Set((data || []).map((x) => x.id));
}
/* Condizioni versionate (migrazione 0084): chi manca, richiesta di riconferma, storia delle versioni. */
export async function reconfirmNeeded(productionId) {
  const { data, error } = await sb.rpc("orc_reconfirm_needed", { production: productionId });
  fail(error);
  return data || [];
}
export async function reconfirmRequest(productionId, invitationIds, note = "") {
  const { data, error } = await sb.rpc("orc_reconfirm_request", { production: productionId, invitation_ids: invitationIds, note });
  fail(error);
  return data || 0;
}
export async function conditionsHistory(productionId) {
  const { data, error } = await sb.rpc("orc_conditions_history", { production: productionId });
  fail(error);
  return data || [];
}
export async function setConditionReason(versionId, reason) {
  fail((await sb.rpc("orc_conditions_set_reason", { version_id: versionId, reason })).error);
}
/* per la dashboard: inviti aperti e senza risposta per org */
export async function openCounts(orgId) {
  const { data, error } = await sb.from("orc_invitations").select("status, production_id").eq("org_id", orgId).in("status", ["draft", "sent", "viewed", "available", "partial", "no_reply", "unavailable"]);
  fail(error);
  return data || [];
}
/* Manda subito quello che è in coda per questa produzione (inviti, promemoria, conferme, revoche). Se non
   riesce non è grave: resta in coda e lo riprende il worker — che però gira quando gli pare, quindi si prova. */
export async function notifyNow(productionId) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { ok: false };
  try {
    const r = await fetch(SB_URL + "/functions/v1/orc-invite-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_ANON, Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ production_id: productionId }),
    });
    return r.ok ? await r.json().catch(() => ({ ok: false })) : { ok: false, status: r.status };
  } catch { return { ok: false }; }
}

/* com'è andata, detto a chi ha premuto il pulsante */
export function esitoEmail(a) {
  if (!a || !a.ok) return "Le email non sono partite adesso: restano in coda e il sistema le riprova. Lo stato è riga per riga.";
  if (a.failed > 0) return (a.sent ? a.sent + (a.sent === 1 ? " email partita, " : " email partite, ") : "") + a.failed + (a.failed === 1 ? " non partita" : " non partite") + ": il sistema le riprova da solo.";
  if (a.sent > 0) return a.sent === 1 ? "Email partita." : a.sent + " email partite.";
  return "";
}
