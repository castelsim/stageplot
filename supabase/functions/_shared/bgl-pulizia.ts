// supabase/functions/_shared/bgl-pulizia.ts
//
// BIGLIETTERIA — le pulizie notturne che il database da solo non sa fare, chiamate da retention-purge:
//   · le locandine e i loghi che nessuno spettacolo o organizzatore cita da più di 24 ore (decisione D4: il browser
//     toglie il file appena si elimina uno spettacolo, ma una pagina chiusa a metà lo lascerebbe per sempre);
//   · gli account del pubblico fermi da 12 mesi (specifica area §3.4, D3, D9): li sceglie il database, li
//     cancella l'Admin API.
// Le dipendenze (database, Storage API) si iniettano: si prova con `deno test` senza rete.

export const LOCANDINE_BUCKET = "bgl-locandine";
export const ORFANE_DOPO_ORE = 24;
export const LOTTO = 100;
const NOME_LOCANDINA = /^[0-9a-f-]{36}\/[0-9a-f]{32}\.(webp|jpg)$/;

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export type Rimuovi = (bucket: string, nomi: string[]) => Promise<{ error: { message: string } | null; tolti: number }>;
export type PuliziaDeps = { rpc: Rpc; rimuovi: Rimuovi };

export async function pulisciLocandine(deps: PuliziaDeps, ora: Date): Promise<{ locandine_orfane: number }> {
  const p_prima = new Date(ora.getTime() - ORFANE_DOPO_ORE * 3_600_000).toISOString();
  const { data, error } = await deps.rpc("bgl_locandine_orfane", { p_prima });
  if (error) throw new Error("locandine orfane: " + error.message);
  /* si toglie solo ciò che ha la forma di una locandina: un nome storto non arriva mai alla Storage API */
  const nomi = Array.isArray(data) ? data.filter((x): x is string => typeof x === "string" && NOME_LOCANDINA.test(x)) : [];
  let tolti = 0;
  for (let i = 0; i < nomi.length; i += LOTTO) {
    const r = await deps.rimuovi(LOCANDINE_BUCKET, nomi.slice(i, i + LOTTO));
    if (r.error) throw new Error("locandine: " + r.error.message);
    tolti += r.tolti;
  }
  return { locandine_orfane: tolti };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PuliziaAccountDeps = { rpc: Rpc; elimina: (uid: string) => Promise<{ error: { message: string } | null }> };

/** Gli account del pubblico fermi da 12 mesi (specifica §3.4): per ognuno il database prepara (e ricontrolla che sia
 *  ancora «solo biglietteria»: nel frattempo può aver cominciato a usare StagePlot), poi l'Admin API cancella.
 *  Un fallimento su un account non ferma gli altri; un errore nel trovare la lista sì (il workflow diventa rosso). */
export async function pulisciAccount(deps: PuliziaAccountDeps, limite = 200): Promise<{ account_puliti: number; account_falliti: number }> {
  const { data, error } = await deps.rpc("bgl_account_da_pulire", { p_limite: limite });
  if (error) throw new Error("account da pulire: " + error.message);
  const ids = Array.isArray(data) ? data.filter((x): x is string => typeof x === "string" && UUID.test(x)) : [];
  let puliti = 0, falliti = 0;
  for (const id of ids) {
    const p = await deps.rpc("bgl_account_prepara_eliminazione", { p_uid: id });
    const d = p.data as { ok?: boolean } | null;
    if (p.error || !d || d.ok !== true) { falliti++; continue; }
    const r = await deps.elimina(id);
    if (r.error) falliti++; else puliti++;
  }
  return { account_puliti: puliti, account_falliti: falliti };
}
