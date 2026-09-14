/**
 * Salvare una segnalazione senza perderla per colpa del progetto a cui è legata.
 *
 * Perché esiste (14/09/2026). Simone scrive dal box «Cosa manca?» e riceve «Non è stato possibile
 * inviare, riprova»; nel database non arrivava niente dal 10/09. Riprodotto: la riga porta
 * `project_id`, la colonna ha un vincolo verso `stageplot_projects`, e se il progetto aperto nel
 * browser non esiste più nel database (cancellato, o l'identificativo è rimasto nel dispositivo da
 * un progetto vecchio) l'insert viola il vincolo — codice 23503 — e la function risponde 500. Il
 * messaggio di chi scrive si perdeva per un dettaglio che non gli serve.
 *
 * Il rimedio: se il vincolo che salta è quello del progetto, si salva di nuovo SENZA il progetto.
 * La segnalazione vale più del collegamento, e chi la legge lo sa dal campo `projectDropped`.
 */
export type InsertResult = { id: string | null; error: string | null; projectDropped: boolean };

// deno-lint-ignore no-explicit-any
type ClientLike = { from(table: string): any };

const FK_VIOLATION = "23503";

export async function insertFeedbackRow(
  client: ClientLike,
  row: Record<string, unknown>,
): Promise<InsertResult> {
  const prova = async (r: Record<string, unknown>) =>
    await client.from("feedback").insert(r).select("id").single();
  let { data, error } = await prova(row);
  if (error && error.code === FK_VIOLATION && row.project_id != null) {
    ({ data, error } = await prova({ ...row, project_id: null }));
    if (!error) return { id: data?.id ?? null, error: null, projectDropped: true };
  }
  if (error) return { id: null, error: String(error.message ?? error), projectDropped: false };
  return { id: data?.id ?? null, error: null, projectDropped: false };
}
