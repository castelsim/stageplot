/* Accesso ai dati dell'organizzazione. Ogni funzione passa da RLS o da una RPC che controlla il ruolo
   sul server: qui non c'è autorizzazione, solo chiamate. */
import { sb } from "../sb.js";

export async function listMembers(orgId) {
  const { data, error } = await sb.rpc("orc_org_members", { org: orgId });
  if (error) throw error;
  return data || [];
}

/* role ∈ owner|admin|artistic|production|section|viewer|remove */
export async function setRole(orgId, userId, role) {
  const { error } = await sb.rpc("orc_set_member_role", { org: orgId, target: userId, new_role: role });
  if (error) throw error;
}

export async function addByEmail(orgId, email, role) {
  const { data, error } = await sb.rpc("orc_add_member_by_email", { org: orgId, member_email: email, new_role: role });
  if (error) throw error;
  return data;
}

export async function renameOrg(orgId, name) {
  const { error } = await sb.from("orc_organizations").update({ name }).eq("id", orgId);
  if (error) throw error;
}

export async function listAudit(orgId, limit = 50) {
  const { data, error } = await sb.from("orc_audit_log")
    .select("action, entity, entity_id, payload, at, actor_id")
    .eq("org_id", orgId).order("at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}
