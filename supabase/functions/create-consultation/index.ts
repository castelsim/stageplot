import { createClient } from "jsr:@supabase/supabase-js@2.108.2";
import { corsHeaders } from "../_shared/cors.ts";
import { serviceRoleKey } from "../_shared/service-role-key.ts";
import { allegatiDaFiles, pianoRichiesta, RIDER_BUCKET } from "../_shared/rider-order.ts";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PRODUCTS = new Set(["pro-review", "rider-pronto", "production-pack"]);
/* Rider pronto senza progetto: ogni richiesta apre uno spazio per 8 file da 10 MB. Un account non ne apre più di
   tante al giorno senza pagarle (un nuovo tentativo dopo un caricamento fallito resta largamente sotto). */
const RIDER_NON_PAGATE_AL_GIORNO = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const payload = await req.json().catch(() => null);
  const piano = pianoRichiesta(payload, PRODUCTS);
  if (!piano.ok) return json({ error: piano.error }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, serviceRoleKey(Deno.env),
  );

  // 1) Utente reale dal JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "non autenticato" }, 401);
  const user = userData.user;

  // 2) Ownership del progetto (service role + confronto esplicito su user_id), se c'è
  if (piano.project_id) {
    const { data: proj, error: projErr } = await supabase.from("stageplot_projects")
      .select("id,user_id").eq("id", piano.project_id).is("deleted_at", null).maybeSingle();
    if (projErr) { console.error("lookup progetto:", projErr.message); return json({ error: "errore" }, 500); }
    if (!proj || proj.user_id !== user.id) return json({ error: "progetto non valido" }, 403);
  }

  const accountName = (user.user_metadata?.full_name as string)
    || (user.user_metadata?.name as string) || "";
  const shareToken = crypto.randomUUID();

  // 3a) Consulenza con progetto e senza modulo: la richiesta di sempre
  if (!piano.rider) {
    const { data: row, error } = await supabase.from("consultation_requests").insert({
      user_id: user.id, name: accountName, email: user.email, product: piano.product,
      project_id: piano.project_id, share_token: shareToken, status: "new", paid: false,
    }).select("id").single();
    if (error) { console.error("insert richiesta:", error.message); return json({ error: "errore" }, 500); }
    return json({ request_id: row.id });
  }

  // 3b) Rider pronto: modulo, eventuali allegati, progetto facoltativo
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: countErr } = await supabase.from("consultation_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("product", piano.product).eq("paid", false).gte("created_at", since);
  if (countErr) { console.error("conteggio richieste:", countErr.message); return json({ error: "errore" }, 500); }
  if ((count ?? 0) >= RIDER_NON_PAGATE_AL_GIORNO) {
    return json({ error: "troppe richieste non pagate oggi: riprova domani o scrivi a castellansimone@gmail.com" }, 429);
  }

  const r = piano.rider;
  const requestId = crypto.randomUUID();
  const allegati = allegatiDaFiles(requestId, r.files);
  const { error: insErr } = await supabase.from("consultation_requests").insert({
    id: requestId, user_id: user.id, name: r.nome, email: r.email, product: piano.product,
    project_id: piano.project_id, senza_progetto: !piano.project_id,
    rider_per: r.per_chi, event_date: r.data_evento, notes: r.descrizione, attachments: allegati,
    share_token: shareToken, status: "new", paid: false,
  });
  if (insErr) { console.error("insert richiesta rider:", insErr.message); return json({ error: "errore" }, 500); }

  /* Un link firmato per file: vale solo per quel percorso, non sovrascrive, e il bucket controlla tipo e peso.
     Nessuna policy permette a un account di leggere quei file, nemmeno a chi li carica. */
  const uploads: { path: string; token: string }[] = [];
  for (const a of allegati) {
    const { data, error } = await supabase.storage.from(RIDER_BUCKET).createSignedUploadUrl(a.path);
    if (error || !data?.token) {
      console.error("link di caricamento:", error?.message ?? "token mancante");
      await supabase.from("consultation_requests").delete().eq("id", requestId).eq("paid", false);
      return json({ error: "errore" }, 500);
    }
    uploads.push({ path: a.path, token: data.token });
  }
  return json({ request_id: requestId, uploads });
});
