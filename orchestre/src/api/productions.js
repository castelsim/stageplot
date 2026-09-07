/* Produzioni, date, repertorio, organico. RLS per lo staff; le scritture di stato passano da RPC. */
import { sb } from "../sb.js";

const fail = (error) => { if (error) throw error; };

export async function list(orgId) {
  const { data, error } = await sb.rpc("orc_productions_list", { org: orgId });
  fail(error);
  return data || [];
}
export async function get(id) {
  const { data, error } = await sb.from("orc_productions").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  fail(error);
  return data;
}
const FIELDS = ["title", "client", "description", "kind", "conductor", "manager", "venue", "address", "status", "fee_note", "conditions", "dress_code", "reply_deadline", "notes", "stageplot_project_id"];
function pick(f) {
  const out = {};
  for (const k of FIELDS) if (k in f) out[k] = f[k];
  if ("reply_deadline" in out && !out.reply_deadline) out.reply_deadline = null;
  if ("stageplot_project_id" in out && !out.stageplot_project_id) out.stageplot_project_id = null;
  return out;
}
export async function create(orgId, fields) {
  const { data, error } = await sb.from("orc_productions").insert({ org_id: orgId, ...pick(fields) }).select("id").single();
  fail(error);
  return data.id;
}
export async function update(id, fields) { fail((await sb.from("orc_productions").update(pick(fields)).eq("id", id)).error); }
export async function archive(id) { fail((await sb.from("orc_productions").update({ deleted_at: new Date().toISOString() }).eq("id", id)).error); }

/* date */
export async function listDates(pid) {
  const { data, error } = await sb.from("orc_production_dates").select("*").eq("production_id", pid).order("starts_at");
  fail(error);
  return data || [];
}
export async function addDate(pid, d) { fail((await sb.from("orc_production_dates").insert({ production_id: pid, ...d })).error); }
export async function updateDate(id, d) { fail((await sb.from("orc_production_dates").update(d).eq("id", id)).error); }
export async function deleteDate(id) { fail((await sb.from("orc_production_dates").delete().eq("id", id)).error); }

/* repertorio della produzione */
export async function listRepertoire(pid) {
  const { data, error } = await sb.from("orc_production_repertoire").select("repertoire_id, orc_repertoire(kind, name)").eq("production_id", pid);
  fail(error);
  return (data || []).map((r) => ({ id: r.repertoire_id, kind: r.orc_repertoire?.kind, name: r.orc_repertoire?.name }));
}
export async function addRepertoire(orgId, pid, { kind, name }) {
  const rep = await sb.from("orc_repertoire").select("id").eq("org_id", orgId).eq("kind", kind).ilike("name", name.trim()).maybeSingle();
  fail(rep.error);
  let rid = rep.data?.id;
  if (!rid) {
    const ins = await sb.from("orc_repertoire").insert({ org_id: orgId, kind, name: name.trim() }).select("id").single();
    fail(ins.error);
    rid = ins.data.id;
  }
  fail((await sb.from("orc_production_repertoire").upsert({ production_id: pid, repertoire_id: rid })).error);
}
export async function removeRepertoire(pid, rid) { fail((await sb.from("orc_production_repertoire").delete().eq("production_id", pid).eq("repertoire_id", rid)).error); }

/* organico */
export async function staffing(pid) {
  const { data, error } = await sb.rpc("orc_staffing", { production: pid });
  fail(error);
  return data || [];
}
export async function addSection(pid, name, sort) {
  const { data, error } = await sb.from("orc_staffing_sections").insert({ production_id: pid, name, sort }).select("id").single();
  fail(error);
  return data.id;
}
export async function renameSection(id, name) { fail((await sb.from("orc_staffing_sections").update({ name }).eq("id", id)).error); }
export async function deleteSection(id) { fail((await sb.from("orc_staffing_sections").delete().eq("id", id)).error); }
export async function addRole(pid, role) {
  const { data, error } = await sb.from("orc_staffing_roles").insert({ production_id: pid, ...role }).select("id").single();
  fail(error);
  return data.id;
}
export async function updateRole(id, fields) { fail((await sb.from("orc_staffing_roles").update(fields).eq("id", id)).error); }
export async function deleteRole(id) { fail((await sb.from("orc_staffing_roles").delete().eq("id", id)).error); }
export async function listRequirements(roleId) {
  const { data, error } = await sb.from("orc_role_requirements").select("skill_code, required, min_level").eq("role_id", roleId);
  fail(error);
  return data || [];
}
export async function setRequirements(roleId, reqs) {
  fail((await sb.from("orc_role_requirements").delete().eq("role_id", roleId)).error);
  if (reqs.length) fail((await sb.from("orc_role_requirements").insert(reqs.map((r) => ({ role_id: roleId, ...r })))).error);
}
export async function assignSlot(slotId, musicianId, reason = "") { fail((await sb.rpc("orc_assign_slot", { slot: slotId, musician: musicianId, reason })).error); }
export async function releaseSlot(slotId, event, reason = "") { fail((await sb.rpc("orc_release_slot", { slot: slotId, event, reason })).error); }
export async function applyTemplate(pid, template) {
  const { data, error } = await sb.rpc("orc_apply_staffing_template", { production: pid, template });
  fail(error);
  return data;
}
export async function duplicateStaffing(src, dst) {
  const { data, error } = await sb.rpc("orc_duplicate_staffing", { src, dst });
  fail(error);
  return data;
}
export async function slotEvents(pid) {
  const { data, error } = await sb.from("orc_slot_events").select("slot_id, musician_id, event, reason, at, orc_musicians(first_name, last_name), orc_staffing_slots(seat_no, orc_staffing_roles(name))")
    .eq("production_id", pid).order("at", { ascending: false }).limit(200);
  fail(error);
  return (data || []).map((e) => ({
    event: e.event, reason: e.reason, at: e.at,
    musician: e.orc_musicians ? e.orc_musicians.last_name + " " + e.orc_musicians.first_name : "",
    role: e.orc_staffing_slots?.orc_staffing_roles?.name || "", seat_no: e.orc_staffing_slots?.seat_no,
  }));
}
