/* Convocazioni: inviti, azioni dello staff, elenco. Le scritture passano tutte da RPC. */
import { sb } from "../sb.js";

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
/* per la dashboard: inviti aperti e senza risposta per org */
export async function openCounts(orgId) {
  const { data, error } = await sb.from("orc_invitations").select("status, production_id").eq("org_id", orgId).in("status", ["draft", "sent", "viewed", "available", "partial", "no_reply"]);
  fail(error);
  return data || [];
}
