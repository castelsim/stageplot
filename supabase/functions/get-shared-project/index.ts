// supabase/functions/get-shared-project/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://stageplot.it",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return json({ error: "token mancante" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: reqRow, error: reqErr } = await supabase.from("consultation_requests")
    .select("project_id").eq("share_token", token).maybeSingle();
  if (reqErr) { console.error("lookup token fallito:", reqErr.message); return json({ error: "errore" }, 500); }
  if (!reqRow || !reqRow.project_id) return json({ error: "non trovato" }, 404);

  const { data: proj, error: projErr } = await supabase.from("stageplot_projects")
    .select("data,title,updated_at").eq("id", reqRow.project_id).maybeSingle();
  if (projErr) { console.error("lettura progetto fallita:", projErr.message); return json({ error: "errore" }, 500); }
  if (!proj) return json({ error: "progetto non trovato" }, 404);

  return json({ data: proj.data, title: proj.title, updated_at: proj.updated_at });
});
