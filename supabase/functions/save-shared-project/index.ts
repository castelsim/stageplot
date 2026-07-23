// supabase/functions/save-shared-project/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2.108.2";
import { consultationShareIsActive } from "../_shared/consultation-access.ts";
import { validateConsultationSave } from "../_shared/consultation-save.ts";

const ADMIN_ID = "4b899cba-3cc2-4b26-9ef0-c3e915929277";
const MAX_REQUEST_BYTES = 22 * 1024 * 1024;
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://stageplot.it",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
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
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = new URL(req.url).searchParams.get("token");
  if (!token || token.length > 200) {
    return json({ error: "token mancante o non valido" }, 400);
  }
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return json(
      { error: "payload troppo grande", code: "PAYLOAD_TOO_LARGE" },
      413,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Verifica che il chiamante sia l'admin (dal JWT)
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user || userData.user.id !== ADMIN_ID) {
    return json({ error: "non autorizzato" }, 403);
  }

  // Il payload potenzialmente grande viene letto/validato soltanto dopo l'autorizzazione.
  const body = await req.json().catch(() => null);
  const checked = validateConsultationSave(body);
  if (!checked.ok) {
    return json({ error: checked.error, code: "INVALID_PAYLOAD" }, 400);
  }

  // 2) Token pagato e valido → project_id
  const { data: reqRow, error: reqErr } = await supabase.from(
    "consultation_requests",
  )
    .select("project_id,paid,status,share_expires_at,share_revoked_at").eq(
      "share_token",
      token,
    ).maybeSingle();
  if (reqErr) {
    console.error("lookup token:", reqErr.message);
    return json({ error: "errore" }, 500);
  }
  const active = consultationShareIsActive(reqRow);
  if (!active || !reqRow) return json({ error: "non trovato" }, 404);

  // 3) Scrivi documento + planimetrie con compare-and-swap sulla revisione letta.
  //    Due tab/sessioni non possono più sovrascriversi fuori ordine.
  const updateFields: Record<string, unknown> = { data: checked.value.data };
  if (Object.prototype.hasOwnProperty.call(checked.value, "venueImage")) {
    updateFields.venue_image = checked.value.venueImage;
  }
  const { data: updated, error: updErr } = await supabase.from(
    "stageplot_projects",
  )
    .update(updateFields)
    .eq("id", reqRow.project_id)
    .is("deleted_at", null)
    .eq("is_locked", false)
    .eq("updated_at", checked.value.expectedRevision)
    .select("updated_at")
    .maybeSingle();
  if (updErr) {
    if (/project is locked/i.test(updErr.message)) {
      return json({ error: "progetto bloccato", code: "PROJECT_LOCKED" }, 423);
    }
    console.error("update progetto:", updErr.message);
    return json({ error: "errore" }, 500);
  }
  if (!updated?.updated_at) {
    const { data: current } = await supabase.from("stageplot_projects")
      .select("updated_at,is_locked").eq("id", reqRow.project_id)
      .is("deleted_at", null).maybeSingle();
    if (!current) {
      return json(
        { error: "progetto non trovato", code: "PROJECT_NOT_FOUND" },
        404,
      );
    }
    if (current?.is_locked) {
      return json({ error: "progetto bloccato", code: "PROJECT_LOCKED" }, 423);
    }
    return json({ error: "conflitto", code: "REVISION_CONFLICT" }, 409);
  }

  return json({ ok: true, updated_at: updated.updated_at });
});
