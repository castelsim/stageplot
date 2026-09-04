/* Il pool dei musicisti. Ogni chiamata passa da RLS (solo lo staff dell'org) o da una RPC che
   ricontrolla il ruolo sul server. */
import { sb } from "../sb.js";

const fail = (error) => { if (error) throw error; };

export async function catalogs() {
  const [i, s] = await Promise.all([
    sb.from("orc_instruments").select("code, name, family, sort").order("sort"),
    sb.from("orc_skills").select("code, name, kind, sort").order("sort"),
  ]);
  fail(i.error); fail(s.error);
  return { instruments: i.data || [], skills: s.data || [] };
}

export async function list(orgId) {
  const { data, error } = await sb.rpc("orc_musicians_list", { org: orgId });
  fail(error);
  return data || [];
}

export async function get(id) {
  const m = await sb.from("orc_musicians").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  fail(m.error);
  if (!m.data) return null;
  const [ins, sk, rep, tg] = await Promise.all([
    sb.from("orc_musician_instruments").select("instrument_code, is_primary, level, doubling").eq("musician_id", id),
    sb.from("orc_musician_skills").select("skill_code, level, source").eq("musician_id", id),
    sb.from("orc_musician_repertoire").select("repertoire_id, source, note, orc_repertoire(kind, name)").eq("musician_id", id),
    sb.from("orc_musician_tags").select("tag").eq("musician_id", id).order("tag"),
  ]);
  fail(ins.error); fail(sk.error); fail(rep.error); fail(tg.error);
  return {
    ...m.data,
    instruments: (ins.data || []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
    skills: sk.data || [],
    repertoire: (rep.data || []).map((r) => ({ id: r.repertoire_id, source: r.source, note: r.note, kind: r.orc_repertoire?.kind, name: r.orc_repertoire?.name })),
    tags: (tg.data || []).map((t) => t.tag),
  };
}

const FIELDS = ["first_name", "last_name", "email", "phone", "city", "province", "area", "has_car", "max_distance_km", "travel_ok", "tour_ok", "status", "bio", "notes_private"];
function pick(fields) {
  const out = {};
  for (const k of FIELDS) if (k in fields) out[k] = fields[k];
  if ("email" in out) out.email = String(out.email || "").trim().toLowerCase();
  if ("province" in out) out.province = String(out.province || "").trim().toUpperCase();
  if ("max_distance_km" in out) out.max_distance_km = out.max_distance_km === "" || out.max_distance_km == null ? null : Number(out.max_distance_km);
  return out;
}

export async function create(orgId, fields) {
  const { data, error } = await sb.from("orc_musicians").insert({ org_id: orgId, source: "manual", ...pick(fields) }).select("id").single();
  fail(error);
  return data.id;
}

export async function update(id, fields) {
  const { error } = await sb.from("orc_musicians").update(pick(fields)).eq("id", id);
  fail(error);
}

export async function archive(id) {
  const { error } = await sb.from("orc_musicians").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  fail(error);
}

/* items: [{code, primary, level, doubling}] — sostituisce l'elenco */
export async function setInstruments(id, items) {
  fail((await sb.from("orc_musician_instruments").delete().eq("musician_id", id)).error);
  if (!items.length) return;
  const rows = items.map((x) => ({ musician_id: id, instrument_code: x.code, is_primary: !!x.primary, level: x.level || null, doubling: !!x.doubling }));
  fail((await sb.from("orc_musician_instruments").insert(rows)).error);
}

/* items: [{code, level, source}] — sostituisce l'elenco */
export async function setSkills(id, items) {
  fail((await sb.from("orc_musician_skills").delete().eq("musician_id", id)).error);
  if (!items.length) return;
  const rows = items.map((x) => ({ musician_id: id, skill_code: x.code, level: x.level ?? 1, source: x.source || "declared" }));
  fail((await sb.from("orc_musician_skills").insert(rows)).error);
}

export async function setTags(id, tags) {
  fail((await sb.from("orc_musician_tags").delete().eq("musician_id", id)).error);
  const clean = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
  if (!clean.length) return;
  fail((await sb.from("orc_musician_tags").insert(clean.map((tag) => ({ musician_id: id, tag })))).error);
}

export async function listRepertoire(orgId) {
  const { data, error } = await sb.from("orc_repertoire").select("id, kind, name").eq("org_id", orgId).order("kind").order("name");
  fail(error);
  return data || [];
}

export async function addRepertoire(orgId, musicianId, { kind, name, source = "declared" }) {
  const rep = await sb.from("orc_repertoire").select("id").eq("org_id", orgId).eq("kind", kind).ilike("name", name.trim()).maybeSingle();
  fail(rep.error);
  let rid = rep.data?.id;
  if (!rid) {
    const ins = await sb.from("orc_repertoire").insert({ org_id: orgId, kind, name: name.trim() }).select("id").single();
    fail(ins.error);
    rid = ins.data.id;
  }
  fail((await sb.from("orc_musician_repertoire").upsert({ musician_id: musicianId, repertoire_id: rid, source })).error);
}

export async function removeRepertoire(musicianId, repertoireId) {
  fail((await sb.from("orc_musician_repertoire").delete().eq("musician_id", musicianId).eq("repertoire_id", repertoireId)).error);
}

export async function importRows(orgId, rows) {
  const { data, error } = await sb.rpc("orc_import_musicians", { org: orgId, rows });
  fail(error);
  return data;
}
