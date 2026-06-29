// supabase/functions/save-shared-project/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_ID = "4b899cba-3cc2-4b26-9ef0-c3e915929277";
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://stageplot.it",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = new URL(req.url).searchParams.get("token");
  if (!token) return json({ error: "token mancante" }, 400);
  const body = await req.json().catch(() => null) as { data?: unknown } | null;
  if (!body || body.data === null || typeof body.data !== "object") return json({ error: "data mancante" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Verifica che il chiamante sia l'admin (dal JWT)
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user || userData.user.id !== ADMIN_ID) {
    return json({ error: "non autorizzato" }, 403);
  }

  // 2) Token valido → project_id
  const { data: reqRow, error: reqErr } = await supabase.from("consultation_requests")
    .select("project_id").eq("share_token", token).maybeSingle();
  if (reqErr) { console.error("lookup token:", reqErr.message); return json({ error: "errore" }, 500); }
  if (!reqRow?.project_id) return json({ error: "non trovato" }, 404);

  // 3) Scrivi il progetto (service role)
  const { error: updErr } = await supabase.from("stageplot_projects")
    .update({ data: body.data, updated_at: new Date().toISOString() })
    .eq("id", reqRow.project_id);
  if (updErr) { console.error("update progetto:", updErr.message); return json({ error: "errore" }, 500); }

  return json({ ok: true });
});
