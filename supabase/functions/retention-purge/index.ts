// supabase/functions/retention-purge/index.ts
//
// La retention promessa nell'informativa, finalmente eseguita. Chiamata una volta al giorno dal workflow
// `retention-purge.yml`, con lo stesso segreto dei worker di consulenze e convocazioni.
//
// PERCHÉ ESISTE. Dal 0033 (luglio) la purga era una funzione SQL da schedulare con pg_cron, «best-effort»:
// se pg_cron non c'era, la migrazione stampava un avviso e andava avanti. In produzione pg_cron non c'è,
// quindi la purga NON È MAI PARTITA — l'11/09 il record più vecchio di analytics_events aveva 55 giorni
// contro i 30 promessi. E anche chiamata a mano sarebbe fallita: la 0037 ci aveva aggiunto un DELETE su
// `storage.objects`, che Supabase rifiuta con un trigger, e che comunque toglieva la riga senza togliere
// il file. Qui le due metà stanno ciascuna dove può funzionare:
//   1. le tabelle le pulisce il database (`stageplot_purge_expired()`, che restituisce i conteggi);
//   2. le schermate le cancella la Storage API, una cartella-giorno scaduta alla volta;
//   3. solo DOPO aver tolto un file se ne toglie il riferimento in `feedback`: se il secondo passo
//      fallisse resterebbe una riga che punta al nulla, e si vede; l'ordine inverso lascerebbe file
//      orfani nel bucket, che non si vedono più.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.108.2";
import { serviceRoleKey, usingLegacyKey } from "../_shared/service-role-key.ts";
import { chunks, expiredDayFolders, lastExpiredDay, SHOT_BUCKET } from "../_shared/retention.ts";

const PAGE = 1000;
const REMOVE_BATCH = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function secretMatches(received: string, expected: string): Promise<boolean> {
  if (!received || !expected) return false;
  const enc = new TextEncoder();
  const [l, r] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(received)), crypto.subtle.digest("SHA-256", enc.encode(expected))]);
  const a = new Uint8Array(l), b = new Uint8Array(r);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Tutti i nomi a un livello del bucket, pagina dopo pagina. */
async function listAll(supabase: SupabaseClient, prefix: string): Promise<{ name: string; isFolder: boolean }[]> {
  const out: { name: string; isFolder: boolean }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(SHOT_BUCKET).list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`elenco ${prefix || "/"}: ${error.message}`);
    const page = data ?? [];
    /* la Storage API elenca le cartelle come voci senza id */
    for (const o of page) out.push({ name: o.name, isFolder: o.id === null });
    if (page.length < PAGE) return out;
  }
}

async function purgeShots(supabase: SupabaseClient, now: Date) {
  const top = await listAll(supabase, "");
  const expired = expiredDayFolders(top.filter((o) => o.isFolder).map((o) => o.name), now);
  let removed = 0;
  for (const day of expired) {
    const files = (await listAll(supabase, day)).filter((o) => !o.isFolder).map((o) => `${day}/${o.name}`);
    for (const batch of chunks(files, REMOVE_BATCH)) {
      const { data, error } = await supabase.storage.from(SHOT_BUCKET).remove(batch);
      if (error) throw new Error(`cancellazione ${day}: ${error.message}`);
      removed += (data ?? []).length;
    }
  }
  /* Tolti TUTTI i file scaduti, i riferimenti — in un solo passaggio, fino all'ultimo giorno scaduto.
     Non cartella per cartella: se un giro precedente ha tolto un file ed è caduto prima di toglierne il
     riferimento, la cartella vuota non esiste più e un passaggio per cartella non la ritroverebbe mai.
     Così il riferimento rimasto si ripulisce al giro dopo. Se una cancellazione sopra è fallita non si
     arriva qui: nessun riferimento sparisce prima del suo file. */
  const until_day = lastExpiredDay(now);
  const { data: n, error } = await supabase.rpc("stageplot_forget_screenshots", { until_day });
  if (error) throw new Error(`riferimenti fino al ${until_day}: ${error.message}`);
  return { folders: expired.length, shots_removed: removed, refs_cleared: typeof n === "number" ? n : 0, until_day };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const expected = Deno.env.get("CONSULTATION_WORKER_SECRET") ?? "";
  const received = req.headers.get("x-stageplot-worker-secret") ?? "";
  if (!expected) return json({ error: "worker not configured" }, 503);
  if (!await secretMatches(received, expected)) return json({ error: "unauthorized" }, 401);
  const roleKey = serviceRoleKey(Deno.env);
  if (!roleKey) return json({ error: "service role key missing" }, 503);
  if (usingLegacyKey(Deno.env)) console.info("retention-purge: chiave service_role legacy in uso");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, roleKey, { auth: { persistSession: false } });
  try {
    const { data: tables, error } = await supabase.rpc("stageplot_purge_expired");
    if (error) throw new Error(`tabelle: ${error.message}`);
    const shots = await purgeShots(supabase, new Date());
    return json({ ok: true, tables, ...shots });
  } catch (e) {
    /* rosso vero: il workflow fallisce e se ne accorge qualcuno, invece di un avviso che nessuno legge */
    console.error("retention-purge fallita:", e instanceof Error ? e.message : "unknown");
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
