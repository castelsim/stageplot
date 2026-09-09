/* Collegamento a StagePlot: i progetti dell'editor si leggono con le policy own-rows di `stageplot_projects`
   (l'amministratore vede i SUOI progetti); l'organico si allarga via RPC. */
import { sb } from "../sb.js";

const fail = (error) => { if (error) throw error; };

/* i miei progetti StagePlot (id, titolo, data) */
export async function myProjects() {
  const { data, error } = await sb.from("stageplot_projects").select("id, title, updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(200);
  fail(error);
  return data || [];
}
/* un progetto con il documento; null se non è mio (o non esiste) */
export async function project(id) {
  const { data, error } = await sb.from("stageplot_projects").select("id, title, updated_at, data").eq("id", id).is("deleted_at", null).maybeSingle();
  fail(error);
  return data;
}
/* il catalogo strumenti con le chiavi dell'editor */
export async function instruments() {
  const { data, error } = await sb.from("orc_instruments").select("code, name, family, sort, stageplot_types").order("sort");
  fail(error);
  return data || [];
}
export async function importPositions(pid, projectId, variantId, positions) {
  const { data, error } = await sb.rpc("orc_stageplot_import", { production: pid, project: projectId, variant: variantId || "", positions });
  fail(error);
  return data;
}
export async function links(pid) {
  const { data, error } = await sb.from("orc_stageplot_links").select("item_id, item_type, item_label, instrument_code, role_id, seats, status, variant_id, synced_at").eq("production_id", pid).order("item_label");
  fail(error);
  return data || [];
}
export async function unlink(pid) { fail((await sb.rpc("orc_stageplot_unlink", { production: pid })).error); }
export async function productionsForProject(projectId) {
  const { data, error } = await sb.rpc("orc_productions_for_project", { project: projectId });
  fail(error);
  return data || [];
}
