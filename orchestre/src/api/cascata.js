/* Cascata di riserve e squadre tipo (migrazione 0089). Le scritture passano tutte da funzioni che ricontrollano lo staff. */
import { sb } from "../sb.js";

const fail = (error) => { if (error) throw error; };

export async function list(productionId) {
  const { data, error } = await sb.rpc("orc_cascade_list", { production: productionId });
  fail(error);
  return data || [];
}
/* La lista ordinata di un ruolo: sostituisce quella di prima. */
export async function set(roleId, musicianIds, src = "manual") {
  const { data, error } = await sb.rpc("orc_cascade_set", { role: roleId, musicians: musicianIds, src });
  fail(error);
  return data;
}
export async function teams(orgId) {
  const { data, error } = await sb.rpc("orc_teams_list", { org: orgId });
  fail(error);
  return data || [];
}
export async function teamDetail(teamId) {
  const { data, error } = await sb.rpc("orc_team_detail", { team: teamId });
  fail(error);
  return data || [];
}
export async function saveTeam(productionId, name, key = "") {
  const { data, error } = await sb.rpc("orc_team_save", { production: productionId, team_name: name, key });
  fail(error);
  return data;
}
export async function applyTeam(teamId, productionId) {
  const { data, error } = await sb.rpc("orc_team_apply", { team: teamId, production: productionId });
  fail(error);
  return data;
}
export async function renameTeam(teamId, name) { fail((await sb.rpc("orc_team_rename", { team: teamId, new_name: name })).error); }
export async function duplicateTeam(teamId, name) {
  const { data, error } = await sb.rpc("orc_team_duplicate", { team: teamId, new_name: name });
  fail(error);
  return data;
}
export async function deleteTeam(teamId) { fail((await sb.rpc("orc_team_delete", { team: teamId })).error); }
