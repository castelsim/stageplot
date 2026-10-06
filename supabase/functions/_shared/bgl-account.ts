// supabase/functions/_shared/bgl-account.ts
//
// BIGLIETTERIA — «Elimina il mio account» da «Le mie prenotazioni» (specifica area §3.4, decisioni D3 e D9). Solo
// gli account «solo biglietteria»: chi usa anche l'editor o Orchestre riceve 409 e la pagina gli dice di scrivere.
// Ordine: il database disdice le prenotazioni future e toglie nomi ed email; POI l'Admin API cancella l'account.
// Se l'Admin API fallisce, i dati personali sono già via e l'utente può riprovare.

import { bglCors } from "./bgl-cors.ts";
import { tokenDa, type Utente } from "./bgl-utente.ts";
import type { EnvLike } from "./service-role-key.ts";

export const MAX_CORPO_ACCOUNT = 1024;
export type DepsAccount = {
  utente: (token: string) => Promise<Utente | null>;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  elimina: (uid: string) => Promise<{ error: { message: string } | null }>;
  env: EnvLike;
  log?: (m: string) => void;
};

export async function gestisciAccount(req: Request, deps: DepsAccount): Promise<Response> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const cors = bglCors(req.headers.get("origin"), deps.env.get("BGL_CORS_DEV") === "1");
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const no = (errore: string, s: number) => json({ ok: false, errore }, s);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const corpo = new Uint8Array(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (req.method !== "POST") return no("metodo_non_ammesso", 405);
  if (corpo.byteLength > MAX_CORPO_ACCOUNT) return no("richiesta_troppo_grande", 413);
  try {
    let x: Record<string, unknown> | null = null;
    try { x = JSON.parse(new TextDecoder().decode(corpo)); } catch { x = null; }
    if (!x || x.azione !== "elimina") return no("dati_non_validi", 400);
    const token = tokenDa(req);
    const u = token ? await deps.utente(token) : null;
    if (!u) return no("non_autenticato", 401);
    const { data, error } = await deps.rpc("bgl_account_prepara_eliminazione", { p_uid: u.id });
    if (error || !data || typeof data !== "object") { log("bgl-account: database: " + (error ? error.message : "vuoto")); return no("errore_interno", 500); }
    const d = data as Record<string, unknown>;
    if (d.ok !== true) return d.errore === "account_in_uso" ? no("account_in_uso", 409) : no("errore_interno", 500);
    const r = await deps.elimina(u.id);
    if (r.error) { log("bgl-account: Admin API: " + r.error.message); return no("errore_interno", 500); }
    return json({ ok: true, disdette: d.disdette ?? 0, anonimizzate: d.anonimizzate ?? 0 });
  } catch (e) {
    log("bgl-account: " + (e instanceof Error ? e.message : "errore"));
    return no("errore_interno", 500);
  }
}
