/* Candidature: il lato del musicista (profilo, file, candidatura, inviti, privacy) e il lato dello staff
   (elenco, dettaglio, stato, valutazioni). RLS + RPC; il client non decide niente. */
import { sb } from "../sb.js";

const fail = (error) => { if (error) throw error; };

/* ---------------- musicista */
export async function ensureProfile() { const { data, error } = await sb.rpc("orc_ensure_musician_profile"); fail(error); return data; }
export async function linkMusicianRows() { const { data, error } = await sb.rpc("orc_link_my_musician_rows"); fail(error); return data; }
export async function getProfile() {
  const p = await sb.from("orc_musician_profiles").select("*").maybeSingle();
  fail(p.error);
  if (!p.data) return null;
  const [ins, rep, files] = await Promise.all([
    sb.from("orc_profile_instruments").select("instrument_code, is_primary, level, doubling").eq("profile_id", p.data.id),
    sb.from("orc_profile_repertoire").select("kind, name").eq("profile_id", p.data.id).order("name"),
    sb.from("orc_files").select("id, kind, path, name, size, mime, created_at").eq("profile_id", p.data.id).order("created_at"),
  ]);
  fail(ins.error); fail(rep.error); fail(files.error);
  return { ...p.data, instruments: (ins.data || []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)), repertoire: rep.data || [], files: files.data || [] };
}
const PROFILE_FIELDS = ["first_name", "last_name", "email", "phone", "city", "province", "area", "bio", "website", "audio_url", "video_url", "education", "years_experience",
  "exp_orchestral", "exp_pop", "exp_live", "exp_studio", "exp_theatre", "reading_sight", "reading_score", "with_conductor", "click", "sequences", "in_ear", "improvisation",
  "genres", "parts", "rehearsal_availability", "travel_ok", "tour_ok", "has_car", "max_distance_km", "step", "consent_requests"];
export async function saveProfile(id, fields) {
  const row = {};
  for (const k of PROFILE_FIELDS) if (k in fields) row[k] = fields[k];
  if ("email" in row) row.email = String(row.email || "").trim().toLowerCase();
  if ("province" in row) row.province = String(row.province || "").trim().toUpperCase();
  for (const k of ["years_experience", "max_distance_km"]) if (k in row) row[k] = row[k] === "" || row[k] == null ? null : Number(row[k]);
  const { error } = await sb.from("orc_musician_profiles").update(row).eq("id", id);
  fail(error);
}
export async function setInstruments(profileId, items) {
  fail((await sb.from("orc_profile_instruments").delete().eq("profile_id", profileId)).error);
  if (!items.length) return;
  fail((await sb.from("orc_profile_instruments").insert(items.map((x) => ({ profile_id: profileId, instrument_code: x.code, is_primary: !!x.primary, level: x.level || null, doubling: !!x.doubling })))).error);
}
export async function setRepertoire(profileId, items) {
  fail((await sb.from("orc_profile_repertoire").delete().eq("profile_id", profileId)).error);
  const clean = [...new Map(items.map((x) => [x.kind + "|" + x.name.trim().toLowerCase(), { kind: x.kind, name: x.name.trim() }])).values()].filter((x) => x.name);
  if (!clean.length) return;
  fail((await sb.from("orc_profile_repertoire").insert(clean.map((x) => ({ profile_id: profileId, ...x })))).error);
}
/* consenso privacy: versionato, registrato in orc_consents e sul profilo */
export async function grantConsent(profileId, kind, version) {
  const uid = (await sb.auth.getUser()).data.user.id;
  fail((await sb.from("orc_consents").insert({ user_id: uid, kind, version })).error);
  if (kind === "privacy") fail((await sb.from("orc_musician_profiles").update({ consent_privacy_version: version, consent_privacy_at: new Date().toISOString() }).eq("id", profileId)).error);
  if (kind === "requests") fail((await sb.from("orc_musician_profiles").update({ consent_requests: true }).eq("id", profileId)).error);
}
/* La revoca la scrive il database, non il client: `orc_consents` non accetta UPDATE da nessuno —
   il consenso è una prova e la sua data non la sceglie l'interessato. Dal 09/09 al 10/09 questo
   pulsante ha risposto 403: la policy era stata tolta, la chiamata no. */
export async function revokeConsent(profileId, kind) {
  fail((await sb.rpc("orc_consent_revoke", { kind_in: kind })).error);
  if (kind === "requests") fail((await sb.from("orc_musician_profiles").update({ consent_requests: false }).eq("id", profileId)).error);
}
/* file: bucket privato, percorso profiles/<uid>/<kind>/<nome> */
export async function uploadFile(profile, kind, file) {
  const uid = profile.user_id;
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const path = `profiles/${uid}/${kind}/${Date.now()}_${safe}`;
  const up = await sb.storage.from("orc-files").upload(path, file, { contentType: file.type, upsert: false });
  fail(up.error);
  const { data, error } = await sb.from("orc_files").insert({ owner_user_id: uid, profile_id: profile.id, kind, path, name: file.name.slice(0, 120), size: file.size, mime: file.type }).select("*").single();
  fail(error);
  return data;
}
export async function deleteFile(f) {
  fail((await sb.storage.from("orc-files").remove([f.path])).error);
  fail((await sb.from("orc_files").delete().eq("id", f.id)).error);
}
/* La fotografia sta nello stesso archivio privato degli altri materiali, ma il profilo ne tiene UNA sola:
   caricarne un'altra sostituisce quella di prima, così non restano ritratti orfani nell'archivio. */
export async function setPhoto(profile, file) {
  const vecchia = profile.photo_path || "";
  const f = await uploadFile(profile, "photo", file);
  fail((await sb.from("orc_musician_profiles").update({ photo_path: f.path }).eq("id", profile.id)).error);
  /* la vecchia foto si toglie dopo: se il ripulisci fallisce, resta un file in più — non un profilo rotto.
     (`sb.from(...)` si attende ma non è una Promise: niente `.catch` attaccato, serve try/catch) */
  if (vecchia) {
    try { await sb.storage.from("orc-files").remove([vecchia]); } catch { /* già sparita */ }
    try { await sb.from("orc_files").delete().eq("path", vecchia); } catch { /* già sparita */ }
  }
  return f.path;
}
export async function removePhoto(profile) {
  const p = profile.photo_path || "";
  fail((await sb.from("orc_musician_profiles").update({ photo_path: "" }).eq("id", profile.id)).error);
  if (p) {
    try { await sb.storage.from("orc-files").remove([p]); } catch { /* già sparita */ }
    try { await sb.from("orc_files").delete().eq("path", p); } catch { /* già sparita */ }
  }
}
export async function signedUrl(path) {
  const { data, error } = await sb.storage.from("orc-files").createSignedUrl(path, 600);
  fail(error);
  return data.signedUrl;
}
export async function openOrganizations() { const { data, error } = await sb.rpc("orc_open_organizations"); fail(error); return data || []; }
export async function apply(orgId) { const { data, error } = await sb.rpc("orc_apply", { org: orgId }); fail(error); return data; }
export async function submit(appId, message) { const { data, error } = await sb.rpc("orc_submit_application", { app: appId, msg: message }); fail(error); return data; }
export async function myApplications() { const { data, error } = await sb.rpc("orc_my_applications"); fail(error); return data || []; }
export async function myInvitations() { const { data, error } = await sb.rpc("orc_my_invitations"); fail(error); return data || []; }
export async function myEngagements() { const { data, error } = await sb.rpc("orc_my_engagements"); fail(error); return data || []; }
export async function respondMine(invitationId, answer, dates, note) { const { data, error } = await sb.rpc("orc_respond_mine", { invitation: invitationId, answer, dates, note }); fail(error); return data; }
export async function requestDeletion() { fail((await sb.rpc("orc_request_deletion")).error); }

/* ---------------- staff */
export async function list(orgId) { const { data, error } = await sb.rpc("orc_applications_list", { org: orgId }); fail(error); return data || []; }
export async function detail(appId) { const { data, error } = await sb.rpc("orc_application_detail", { app: appId }); fail(error); return data; }
export async function setStatus(appId, status, note = "", toCandidate = null) { const { data, error } = await sb.rpc("orc_application_set_status", { app: appId, new_status: status, note, to_candidate: toCandidate }); fail(error); return data; }
export async function saveEvaluation(row) {
  const { data, error } = row.id ? await sb.from("orc_evaluations").update(row).eq("id", row.id).select("*").single() : await sb.from("orc_evaluations").insert(row).select("*").single();
  fail(error);
  return data;
}
export async function deleteEvaluation(id) { fail((await sb.from("orc_evaluations").delete().eq("id", id)).error); }
export async function setAccepting(orgId, accepting, intro) { fail((await sb.rpc("orc_set_accepting", { org: orgId, accepting, intro })).error); }
export async function orgSettings(orgId) { const { data, error } = await sb.from("orc_organizations").select("accepting_applications, application_intro").eq("id", orgId).single(); fail(error); return data; }
