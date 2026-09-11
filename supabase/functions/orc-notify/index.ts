// supabase/functions/orc-notify/index.ts
//
// Il worker delle convocazioni di Orchestre, chiamato ogni dieci minuti dal workflow GitHub (stesso
// segreto del worker delle consulenze). Fa tre cose, in ordine:
//   1. scade gli inviti oltre la data limite (orc_expire_invitations);
//   2. libera le prese stantie (una spedizione «sending» da più di 10 minuti torna «pending»);
//   3. spedisce le email pendenti: legge il token in chiaro da orc_invitation_secrets, manda via
//      Resend con Idempotency-Key, e CANCELLA il segreto. Dopo, il token esiste solo nel link.
// ORC_EMAIL_MODE=log non spedisce (sviluppo): segna «sent» e scrive nel log. Mai email reali nei test.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.108.2";
import { serviceRoleKey, usingLegacyKey } from "../_shared/service-role-key.ts";
import { outboxStatusAfterAttempt } from "../_shared/notification-outbox.ts";
import { dispatchInvitations } from "../_shared/orc-invite-dispatch.ts";
import { send } from "../_shared/orc-send.ts";
import { buildClientEmail, buildInternalEmail, type ClientRequestRow, isReservedAddress as isReservedClient, requestKey } from "../_shared/orc-client-requests.ts";
import { buildQuoteEmail, quoteKey, type QuoteMailRow } from "../_shared/orc-quotes.ts";

const CLAIM_STALE_MS = 10 * 60 * 1000;
const BATCH_SIZE = 20;

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

/* «Richiedi musicisti»: due email per richiesta — una alla società (che deve poter decidere subito) e la
   conferma al cliente (che deve sapere quanto aspettare). Sono due invii separati perché possono fallire
   in modo indipendente: se salta la conferma al cliente, la società ha comunque ricevuto il lavoro. */
async function processClientRequests(supabase: SupabaseClient, resendKey: string, mode: string, base: string, to: string) {
  const counts = { reqSent: 0, reqFailed: 0 };
  const { data: rows, error } = await supabase.from("orc_client_requests")
    .select("id,contact_name,contact_company,contact_email,account_email,contact_phone,event_kind,event_title,event_when,event_place,schedule,repertoire,budget,notes,created_at,snapshot,formation_unknown,notification_status,notification_attempts,ack_status,ack_attempts,orc_organizations(name),orc_client_request_slots(label,instrument_code,qty,covered)")
    .or("notification_status.eq.pending,ack_status.eq.pending")
    .order("created_at", { ascending: true }).limit(BATCH_SIZE);
  if (error) throw new Error(error.message);
  for (const raw of (rows ?? []) as unknown as Array<Record<string, unknown>>) {
    const row = {
      ...raw,
      org_name: (raw.orc_organizations as { name?: string } | null)?.name ?? "StagePlot",
      slots: (raw.orc_client_request_slots ?? []) as ClientRequestRow["slots"],
    } as unknown as ClientRequestRow;
    const id = String(raw.id);

    /* 1. alla società */
    if (raw.notification_status === "pending") {
      const claim = await supabase.from("orc_client_requests")
        .update({ notification_status: "sending", notification_claimed_at: new Date().toISOString() })
        .eq("id", id).eq("notification_status", "pending").select("id");
      if (!claim.error && (claim.data ?? []).length) {
        const attempts = Number(raw.notification_attempts ?? 0) + 1;
        const m = buildInternalEmail(row, base);
        let ok = false;
        if (!to) { ok = false; }
        else if (mode === "log") { console.info("orc-notify [log] richiesta →", to, m.subject); ok = true; }
        else ok = (await send(resendKey, to, m.subject, m.html, m.text, requestKey(id, "internal", attempts))).ok;
        await supabase.from("orc_client_requests").update({
          notification_status: outboxStatusAfterAttempt(ok, attempts),
          notification_attempts: attempts, notification_claimed_at: null,
          notification_last_error: ok ? null : (!to ? "no_notify_email" : "send_failed"),
        }).eq("id", id);
        if (ok) counts.reqSent++; else counts.reqFailed++;
      }
    }

    /* 2. al cliente. Gli indirizzi dei dati di prova non ricevono niente: mai email vere dai test. */
    if (raw.ack_status === "pending") {
      const attempts = Number(raw.ack_attempts ?? 0) + 1;
      /* all'indirizzo VERIFICATO dell'account (lo scrive il database dal login), mai a quello scritto nel
       modulo: altrimenti chiunque faceva arrivare dal nostro dominio un testo suo a una persona qualsiasi */
      const dest = String(raw.account_email ?? "");
      let ok = false;
      if (!dest || isReservedClient(dest)) {
        console.info("orc-notify: conferma non spedita (indirizzo riservato o assente)", dest);
        await supabase.from("orc_client_requests").update({ ack_status: "none", ack_attempts: attempts }).eq("id", id);
        continue;
      }
      const m = buildClientEmail(row, base);
      if (mode === "log") { console.info("orc-notify [log] conferma →", dest, m.subject); ok = true; }
      else ok = (await send(resendKey, dest, m.subject, m.html, m.text, requestKey(id, "client", attempts))).ok;
      await supabase.from("orc_client_requests").update({
        ack_status: outboxStatusAfterAttempt(ok, attempts), ack_attempts: attempts,
      }).eq("id", id);
    }
  }
  return counts;
}

/* I preventivi mandati il cui avviso al cliente non è partito subito (la pagina chiusa, l'invio immediato
   fallito). Si leggono solo i campi che il cliente può vedere: cachet, margine e note non passano di qui. */
async function processQuotes(supabase: SupabaseClient, resendKey: string, mode: string, base: string) {
  const counts = { quoteSent: 0, quoteFailed: 0 };
  const { data: rows, error } = await supabase.from("orc_quotes")
    .select("id,description,net_cents,vat_cents,total_cents,vat_pct,notify_attempts,orc_client_requests(contact_name,account_email,event_title,event_when),orc_organizations(name)")
    .eq("status", "sent").eq("notify_status", "pending").order("sent_at", { ascending: true }).limit(BATCH_SIZE);
  if (error) throw new Error(error.message);
  for (const q of (rows ?? []) as unknown as Array<Record<string, unknown>>) {
    const id = String(q.id);
    const r = q.orc_client_requests as { contact_name?: string; account_email?: string; event_title?: string; event_when?: string } | null;
    /* all'indirizzo VERIFICATO dell'account (lo scrive il database dal login), mai a quello scritto nel
       modulo: altrimenti chiunque faceva arrivare dal nostro dominio un testo suo a una persona qualsiasi */
    const dest = String(r?.account_email ?? "");
    if (!dest || isReservedClient(dest)) {
      await supabase.from("orc_quotes").update({ notify_status: "none" }).eq("id", id);
      continue;
    }
    const claim = await supabase.from("orc_quotes").update({ notify_status: "sending", notify_claimed_at: new Date().toISOString() })
      .eq("id", id).eq("notify_status", "pending").select("id");
    if (claim.error || !(claim.data ?? []).length) continue;
    const attempts = Number(q.notify_attempts ?? 0) + 1;
    const row: QuoteMailRow = {
      id, description: String(q.description ?? ""), net_cents: Number(q.net_cents), vat_cents: Number(q.vat_cents), total_cents: Number(q.total_cents),
      vat_pct: Number(q.vat_pct), event_title: r?.event_title ?? "", event_when: r?.event_when ?? "", contact_name: r?.contact_name ?? "",
      org_name: (q.orc_organizations as { name?: string } | null)?.name ?? "StagePlot",
    };
    const m = buildQuoteEmail(row, base);
    let ok = false;
    if (mode === "log") { console.info("orc-notify [log] preventivo →", dest, m.subject); ok = true; }
    else ok = (await send(resendKey, dest, m.subject, m.html, m.text, quoteKey(id, attempts))).ok;
    await supabase.from("orc_quotes").update({
      notify_status: outboxStatusAfterAttempt(ok, attempts), notify_attempts: attempts, notify_claimed_at: null,
    }).eq("id", id);
    if (ok) counts.quoteSent++; else counts.quoteFailed++;
  }
  return counts;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const expected = Deno.env.get("CONSULTATION_WORKER_SECRET") ?? "";
  const received = req.headers.get("x-stageplot-worker-secret") ?? "";
  if (!expected) return json({ error: "worker not configured" }, 503);
  if (!await secretMatches(received, expected)) return json({ error: "unauthorized" }, 401);
  const mode = (Deno.env.get("ORC_EMAIL_MODE") ?? "send").toLowerCase();
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (mode !== "log" && !resendKey) return json({ error: "notification provider not configured" }, 503);
  const base = Deno.env.get("ORC_PUBLIC_BASE") ?? "https://stageplot.it";
  const roleKey = serviceRoleKey(Deno.env);
  if (!roleKey) return json({ error: "service role key missing" }, 503);
  if (usingLegacyKey(Deno.env)) console.info("orc-notify: chiave service_role legacy in uso");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, roleKey, { auth: { persistSession: false } });
  try {
    const { data: expired, error: expErr } = await supabase.rpc("orc_expire_invitations");
    if (expErr) throw new Error(expErr.message);
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
    const { error: stErr } = await supabase.from("orc_invitations")
      .update({ notification_status: "pending", notification_claimed_at: null, notification_last_error: "stale_claim_recovered" })
      .eq("notification_status", "sending").or(`notification_claimed_at.is.null,notification_claimed_at.lt.${staleBefore}`);
    if (stErr) throw new Error(stErr.message);
    await supabase.from("orc_quotes").update({ notify_status: "pending", notify_claimed_at: null })
      .eq("notify_status", "sending").or(`notify_claimed_at.is.null,notify_claimed_at.lt.${staleBefore}`);
    const counts = await dispatchInvitations(supabase, { resendKey, mode, base, limit: BATCH_SIZE });
    const reqCounts = await processClientRequests(supabase, resendKey, mode, base, Deno.env.get("NOTIFY_EMAIL") ?? "");
    const quoteCounts = await processQuotes(supabase, resendKey, mode, base);
    const { count: dead } = await supabase.from("orc_invitations").select("id", { count: "exact", head: true }).eq("notification_status", "failed");
    /* le spedizioni fallite restano visibili allo staff nella scheda Convocazioni: il worker risponde ok
       se ha girato; va rosso solo se non riesce a lavorare */
    return json({ ok: true, expired: expired ?? 0, ...counts, ...reqCounts, ...quoteCounts, deadLetters: dead ?? 0, mode });
  } catch (e) {
    console.error("orc-notify fallito:", e instanceof Error ? e.message : "unknown");
    return json({ error: "worker failed" }, 500);
  }
});
