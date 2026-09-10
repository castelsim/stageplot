/* Matching: fatti dal DB, pesi versionati, snapshot delle corse, override. Il punteggio lo fa
   src/domain/matching.js nel browser. */
import { sb } from "../sb.js";
import { DEFAULT_WEIGHTS } from "../domain/matching.js";

const fail = (error) => { if (error) throw error; };

export async function candidates(productionId, roleId) {
  const { data, error } = await sb.rpc("orc_matching_candidates", { production: productionId, role: roleId });
  fail(error);
  return data;
}

/* I pesi attivi dell'org: l'ultima versione salvata, altrimenti i default (versione 0). */
/* I pesi si leggono (il motore ne ha bisogno) ma dall'interfaccia non si scrivono più: le sedici caselle
   nelle impostazioni non le capiva nessuno — «non l'ho capita», 10/09 — e chi decide non è chi regola un
   punteggio, è chi legge il perché accanto a ogni proposta. `orc_matching_ruleset_save` resta nel database
   con le sue versioni: il giorno che servirà, si rimette qualcosa che si capisce. */
export async function activeRuleset(orgId) {
  const { data, error } = await sb.from("orc_matching_rulesets").select("id, version, name, weights, created_at").eq("org_id", orgId).eq("active", true).order("version", { ascending: false }).limit(1).maybeSingle();
  fail(error);
  if (!data) return { id: null, version: 0, name: "Pesi di partenza", weights: { ...DEFAULT_WEIGHTS }, created_at: null };
  return { ...data, weights: { ...DEFAULT_WEIGHTS, ...(data.weights || {}) } };
}


export async function saveRun(productionId, roleId, weights, results, engine) {
  const rows = results.map((r) => ({ musician_id: r.musician_id, eligible: r.eligible, score: r.score, rank: r.rank, reasons: r.reasons, missing: r.missing, warnings: r.warnings }));
  const { data, error } = await sb.rpc("orc_matching_save_run", { production: productionId, role: roleId, weights, results: rows, engine });
  fail(error);
  return data;
}

/* L'ultima corsa salvata per un ruolo, con i risultati e i nomi. */
export async function lastRun(roleId) {
  const run = await sb.from("orc_matching_runs").select("id, at, weights, ruleset_version, engine_version").eq("role_id", roleId).order("at", { ascending: false }).limit(1).maybeSingle();
  fail(run.error);
  if (!run.data) return null;
  const res = await sb.from("orc_matching_results").select("musician_id, eligible, score, rank, reasons, missing, warnings, override_rank, override_reason, orc_musicians(first_name, last_name, status)").eq("run_id", run.data.id).order("rank");
  fail(res.error);
  return { ...run.data, results: (res.data || []).map((r) => ({ ...r, name: r.orc_musicians ? r.orc_musicians.last_name + " " + r.orc_musicians.first_name : "", status: r.orc_musicians?.status })) };
}

export async function override(runId, musicianId, rank, reason) {
  fail((await sb.rpc("orc_matching_override", { run: runId, musician: musicianId, new_rank: rank, reason })).error);
}
