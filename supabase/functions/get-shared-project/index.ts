// supabase/functions/get-shared-project/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2.108.2";
import { consultationShareIsActive } from "../_shared/consultation-access.ts";
import {
  projectDataForPublicShare,
  projectVenueForPublicShare,
} from "../_shared/project-sharing.ts";

const ADMIN_ID = "4b899cba-3cc2-4b26-9ef0-c3e915929277";
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://stageplot.it",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const params = new URL(req.url).searchParams;
  const token = params.get("token");
  const since = params.get("since");
  if (!token || token.length > 200) {
    return json({ error: "token mancante o non valido" }, 400);
  }
  if (
    since !== null &&
    (since.length > 100 || !Number.isFinite(Date.parse(since)))
  ) {
    return json({ error: "revisione non valida" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  // 1) prova come token di consulenza (comportamento storico)
  const { data: reqRow, error: reqErr } = await supabase.from(
    "consultation_requests",
  )
    .select("project_id,paid,status,share_expires_at,share_revoked_at").eq(
      "share_token",
      token,
    ).maybeSingle();
  if (reqErr) {
    console.error("lookup consultation:", reqErr.message);
    return json({ error: "errore" }, 500);
  }

  const consultationActive = consultationShareIsActive(reqRow);
  let projectId: string | null = consultationActive ? reqRow!.project_id : null;
  let kind = "consultation";
  const consultationTokenExists = !!reqRow;

  // 2) altrimenti prova come token di progetto condiviso
  if (!projectId && !consultationTokenExists) {
    const { data: shareRow, error: shareErr } = await supabase.from(
      "stageplot_projects",
    )
      .select("id").eq("share_token", token).is("deleted_at", null)
      .maybeSingle();
    if (shareErr) {
      console.error("lookup project:", shareErr.message);
      return json({ error: "errore" }, 500);
    }
    if (shareRow?.id) {
      projectId = shareRow.id;
      kind = "project";
    }
  }

  if (!projectId) return json({ error: "non trovato" }, 404);

  let consultationAdmin = false;
  if (kind === "consultation") {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (jwt) {
      const { data: userData } = await supabase.auth.getUser(jwt);
      consultationAdmin = userData?.user?.id === ADMIN_ID;
    }
  }

  if (since !== null) {
    const { data: revision, error: revisionErr } = await supabase.from(
      "stageplot_projects",
    )
      .select("updated_at").eq("id", projectId).is("deleted_at", null)
      .maybeSingle();
    if (revisionErr) {
      console.error("lettura revisione fallita:", revisionErr.message);
      return json({ error: "errore" }, 500);
    }
    if (!revision?.updated_at) {
      return json({ error: "progetto non trovato" }, 404);
    }
    if (revision.updated_at === since) {
      return json({ updated_at: revision.updated_at, unchanged: true, kind });
    }
  }

  const { data: proj, error: projErr } = await supabase.from(
    "stageplot_projects",
  )
    .select("data,title,updated_at,venue_image,is_locked").eq("id", projectId)
    .is("deleted_at", null).maybeSingle();
  if (projErr) {
    console.error("lettura progetto fallita:", projErr.message);
    return json({ error: "errore" }, 500);
  }
  if (!proj) return json({ error: "progetto non trovato" }, 404);

  // venue_image (colonna dedicata, 0013): la planimetria non sta più dentro `data`; ritornala così il viewer la mostra.
  const fullConsultation = kind === "consultation" && consultationAdmin;
  const responseData = fullConsultation
    ? proj.data
    : projectDataForPublicShare(proj.data, {
      allowContacts: kind === "project" && !proj.is_locked,
    });
  const responseVenue = fullConsultation
    ? proj.venue_image
    : projectVenueForPublicShare(proj.venue_image, proj.data);
  return json({
    data: responseData,
    title: proj.title,
    updated_at: proj.updated_at,
    venue_image: responseVenue,
    is_locked: !!proj.is_locked,
    kind,
  });
});
