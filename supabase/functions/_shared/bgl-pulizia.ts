// supabase/functions/_shared/bgl-pulizia.ts
//
// BIGLIETTERIA — le pulizie notturne che il database da solo non sa fare, chiamate da retention-purge:
//   · le locandine e i loghi che nessuno spettacolo o organizzatore cita da più di 24 ore (decisione D4: il browser
//     toglie il file appena si elimina uno spettacolo, ma una pagina chiusa a metà lo lascerebbe per sempre);
//   · (task 9) gli account del pubblico fermi da 12 mesi.
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
