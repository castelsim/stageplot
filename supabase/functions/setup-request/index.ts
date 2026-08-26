// supabase/functions/setup-request/index.ts
//
// L'unica porta del musicista. Il link (/richiesta/?t=TOKEN) non tocca il database: parla solo con
// questa funzione, che gira con service role e decide tutto lei — se il link è ancora buono, cosa
// si può scrivere, quando si può inviare. Il client anonimo non ha nessuna policy RLS: se questa
// funzione dicesse di sì per sbaglio, non ci sarebbe una seconda rete di protezione. Fail-closed.
//
// GET  ?t=TOKEN                       → intestazione, questionario, risposte già salvate, modalità
// POST ?t=TOKEN  {action:"draft"}     → salva la bozza (idempotente per natura)
// POST ?t=TOKEN  {action:"submit"}    → invio definitivo, idempotente sul doppio clic
import { createClient } from "jsr:@supabase/supabase-js@2.108.2";
import {
  hashToken,
  isPlausibleToken,
  missingRequired,
  questionnaireById,
  requestAccess,
  sanitizeAnswers,
  statusAfterDraft,
  statusAfterOpen,
} from "../_shared/setup-requests.ts";
import { serviceRoleKey } from "../_shared/service-role-key.ts";

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
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** messaggi per il musicista: dicono cosa fare, mai perché tecnicamente */
const DENY_TEXT: Record<string, string> = {
  not_found:
    "Questo link non è valido. Chiedi al tecnico di inviartene uno nuovo.",
  revoked:
    "Questo link è stato annullato dal tecnico. Chiedigli il link aggiornato.",
  expired:
    "Questo link è scaduto. Chiedi al tecnico di riaprirlo: le risposte già salvate non si perdono.",
  unknown_status:
    "Questa richiesta non è al momento disponibile. Riprova più tardi o scrivi al tecnico.",
};

const MAX_BODY = 64 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_WRITES = 40; // scritture al minuto per singola richiesta: generoso per un umano

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (!isPlausibleToken(token)) {
    // stessa risposta di un token inesistente: da fuori non si distingue e non si enumera
    return json({ error: "invalid", message: DENY_TEXT.not_found }, 404);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey(Deno.env),
    { auth: { persistSession: false } },
  );

  const tokenHash = await hashToken(token);
  const { data: request, error } = await supabase
    .from("sp_requests")
    .select(
      "id,project_id,item_id,schema_id,request_type,recipient_name,recipient_role,technician_message,status,expires_at,revoked_at,closed_at,current_version",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) return json({ error: "server" }, 500);

  const verdict = requestAccess(request, Date.now());
  if (!verdict.ok) {
    return json({
      error: verdict.reason,
      message: DENY_TEXT[verdict.reason ?? "not_found"] ?? DENY_TEXT.not_found,
    }, verdict.reason === "not_found" ? 404 : 410);
  }

  const schema = questionnaireById(request!.schema_id);
  if (!schema) return json({ error: "schema" }, 500);

  async function currentVersion(): Promise<
    { id: string; version_number: number; status: string; answers: Record<string, unknown> } | null
  > {
    const { data } = await supabase
      .from("sp_request_versions")
      .select("id,version_number,status,answers")
      .eq("request_id", request!.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as never;
  }

  async function logEvent(event: string, meta: Record<string, unknown> = {}) {
    await supabase.from("sp_request_events").insert({
      request_id: request!.id,
      event,
      actor: "recipient",
      meta,
    });
  }

  /** quante scritture ha fatto questo link nell'ultimo minuto (anti-abuso, senza tabelle nuove) */
  async function tooManyWrites(): Promise<boolean> {
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count } = await supabase
      .from("sp_request_events")
      .select("id", { count: "exact", head: true })
      .eq("request_id", request!.id)
      .in("event", ["draft_saved", "submitted"])
      .gte("at", since);
    return (count ?? 0) >= RATE_MAX_WRITES;
  }

  // ------------------------------------------------------------------ GET: cosa vede il musicista
  if (req.method === "GET") {
    const version = await currentVersion();
    const nextStatus = statusAfterOpen(request!.status);
    if (nextStatus !== request!.status) {
      await supabase
        .from("sp_requests")
        .update({ status: nextStatus, opened_at: new Date().toISOString() })
        .eq("id", request!.id)
        .eq("status", request!.status); // niente corse: aggiorna solo se nessuno l'ha già fatto
      await logEvent("link_opened");
    }
    return json({
      mode: verdict.mode,
      status: nextStatus,
      recipient: {
        name: request!.recipient_name,
        role: request!.recipient_role,
      },
      message: request!.technician_message,
      schema,
      answers: version?.answers ?? {},
      version: version?.version_number ?? 1,
      submitted: version?.status === "submitted",
    });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);

  // ------------------------------------------------------------------ POST: bozza e invio
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const action = body.action === "submit" ? "submit" : "draft";

  if (verdict.mode !== "write") {
    return json({
      error: "read_only",
      message:
        "Hai già inviato le risposte: per cambiarle chiedi al tecnico di riaprire la richiesta.",
    }, 409);
  }
  if (await tooManyWrites()) return json({ error: "rate_limited" }, 429);

  const clean = sanitizeAnswers(schema, body.answers);
  let version = await currentVersion();

  // la versione su cui si scrive dev'essere una bozza: se manca (o l'ultima è inviata) se ne apre una
  if (!version || version.status === "submitted") {
    const nextNumber = (version?.version_number ?? 0) + 1;
    const { data: created, error: insErr } = await supabase
      .from("sp_request_versions")
      .insert({
        request_id: request!.id,
        version_number: nextNumber,
        status: "draft",
        answers: clean.answers,
      })
      .select("id,version_number,status,answers")
      .single();
    if (insErr || !created) return json({ error: "server" }, 500);
    version = created as never;
    await supabase.from("sp_requests").update({ current_version: nextNumber })
      .eq("id", request!.id);
  } else {
    const { error: updErr } = await supabase
      .from("sp_request_versions")
      .update({ answers: clean.answers })
      .eq("id", version.id)
      .eq("status", "draft"); // se nel frattempo è stata inviata, non si sovrascrive
    if (updErr) return json({ error: "server" }, 500);
  }

  if (action === "draft") {
    const nextStatus = statusAfterDraft(request!.status);
    if (nextStatus !== request!.status) {
      await supabase.from("sp_requests").update({ status: nextStatus }).eq(
        "id",
        request!.id,
      );
    }
    await logEvent("draft_saved", { keys: Object.keys(clean.answers).length });
    return json({ ok: true, saved: true, status: nextStatus, dropped: clean.dropped });
  }

  // ------------------------------------------------------------------ invio definitivo
  const missing = missingRequired(schema, clean.answers);
  if (missing.length) {
    return json({ error: "incomplete", missing }, 422);
  }
  const nowIso = new Date().toISOString();
  // idempotenza: la marcatura passa solo se la versione è ancora una bozza. Un secondo clic (o un
  // retry di rete) non trova più nulla da aggiornare e riceve comunque una risposta di successo.
  const { data: sealed } = await supabase
    .from("sp_request_versions")
    .update({ status: "submitted", submitted_at: nowIso, answers: clean.answers })
    .eq("id", version!.id)
    .eq("status", "draft")
    .select("id,version_number")
    .maybeSingle();

  if (sealed) {
    await supabase
      .from("sp_requests")
      .update({ status: "submitted", submitted_at: nowIso })
      .eq("id", request!.id);
    await logEvent("submitted", { version: sealed.version_number });
  }
  return json({
    ok: true,
    submitted: true,
    status: "submitted",
    version: sealed?.version_number ?? version!.version_number,
    duplicate: !sealed,
  });
});
