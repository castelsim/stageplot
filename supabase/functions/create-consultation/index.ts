import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PRODUCTS = new Set(["pro-review", "production-pack"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const payload = await req.json().catch(() => null) as
    { project_id?: string; product?: string } | null;
  if (!payload?.project_id || !payload?.product || !PRODUCTS.has(payload.product)) {
    return json({ error: "parametri non validi" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Utente reale dal JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "non autenticato" }, 401);
  const user = userData.user;

  // 2) Ownership del progetto (service role + confronto esplicito su user_id)
  const { data: proj, error: projErr } = await supabase.from("stageplot_projects")
    .select("id,user_id").eq("id", payload.project_id).is("deleted_at", null).maybeSingle();
  if (projErr) { console.error("lookup progetto:", projErr.message); return json({ error: "errore" }, 500); }
  if (!proj || proj.user_id !== user.id) return json({ error: "progetto non valido" }, 403);

  // 3) Crea la richiesta con share_token server-side
  const name = (user.user_metadata?.full_name as string)
    || (user.user_metadata?.name as string) || "";
  const shareToken = crypto.randomUUID();
  const { data: row, error } = await supabase.from("consultation_requests").insert({
    user_id: user.id, name, email: user.email, product: payload.product,
    project_id: payload.project_id, share_token: shareToken, status: "new", paid: false,
  }).select("id").single();
  if (error) { console.error("insert richiesta:", error.message); return json({ error: "errore" }, 500); }

  return json({ request_id: row.id });
});
