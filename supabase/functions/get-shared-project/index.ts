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
  // 1) prova come token di consulenza (comportamento storico)
  const { data: reqRow, error: reqErr } = await supabase.from("consultation_requests")
    .select("project_id").eq("share_token", token).maybeSingle();
  if (reqErr) { console.error("lookup consultation:", reqErr.message); return json({ error: "errore" }, 500); }

  let projectId: string | null = reqRow?.project_id ?? null;
  let kind = "consultation";

  // 2) altrimenti prova come token di progetto condiviso
  if (!projectId) {
    const { data: shareRow, error: shareErr } = await supabase.from("stageplot_projects")
      .select("id").eq("share_token", token).is("deleted_at", null).maybeSingle();
    if (shareErr) { console.error("lookup project:", shareErr.message); return json({ error: "errore" }, 500); }
    if (shareRow?.id) { projectId = shareRow.id; kind = "project"; }
  }

  if (!projectId) return json({ error: "non trovato" }, 404);

  const { data: proj, error: projErr } = await supabase.from("stageplot_projects")
    .select("data,title,updated_at").eq("id", projectId).maybeSingle();
  if (projErr) { console.error("lettura progetto fallita:", projErr.message); return json({ error: "errore" }, 500); }
  if (!proj) return json({ error: "progetto non trovato" }, 404);

  return json({ data: proj.data, title: proj.title, updated_at: proj.updated_at, kind });
});
