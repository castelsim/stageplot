/* Storico e affidabilità: feedback post-produzione, indicatori con campione, storico del musicista. */
import { sb } from "../sb.js";

const fail = (error) => { if (error) throw error; };

export async function roster(productionId) {
  const { data, error } = await sb.rpc("orc_production_roster", { production: productionId });
  fail(error);
  return data || [];
}
const FIELDS = ["attended", "punctuality", "preparation", "artistic", "reading", "professionalism", "communication", "collaboration", "overall", "rehire", "issues", "note"];
export async function save(orgId, productionId, musicianId, fields) {
  const row = { org_id: orgId, production_id: productionId, musician_id: musicianId };
  const TEXT = new Set(["issues", "note"]);
  for (const k of FIELDS) if (k in fields) row[k] = !TEXT.has(k) && fields[k] === "" ? null : fields[k];   /* i testi restano stringhe: la colonna è not null */
  const { error } = await sb.from("orc_performance_feedback").upsert(row, { onConflict: "production_id,musician_id" });
  fail(error);
}
export async function stats(orgId) {
  const { data, error } = await sb.rpc("orc_musician_stats", { org: orgId });
  fail(error);
  return data || [];
}
export async function history(musicianId) {
  const { data, error } = await sb.rpc("orc_musician_history", { musician: musicianId });
  fail(error);
  return data || [];
}
