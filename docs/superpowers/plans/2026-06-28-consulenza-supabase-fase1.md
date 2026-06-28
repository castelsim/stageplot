# Consulenza su Supabase — Fase 1 (backend form) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il form `mailto:` della pagina `/consulenza/` con un backend Supabase che salva le richieste, accetta allegati, verifica il pagamento Stripe via webhook e notifica via email — senza login (Fase 2).

**Architecture:** Il browser non scrive mai nel DB: chiama 2 Edge Functions (Deno) che operano con la service role. Due tabelle (`consultation_requests`, `consultation_payments`) + un bucket Storage privato. La logica pura (validazione, costruzione email) è in moduli `_shared/` testabili con `deno test`; le function si deployano via MCP Supabase.

**Tech Stack:** Supabase (Postgres + Edge Functions Deno + Storage), `@supabase/supabase-js` v2 (service role), Stripe SDK (verifica firma webhook), Resend (email via REST), HTML/JS vanilla nel single-file `consulenza/index.html`.

## Global Constraints

- Progetto Supabase: `vsodplqkuvnsdiikvmjb` — URL `https://vsodplqkuvnsdiikvmjb.supabase.co`.
- Nessuna Supabase CLI: migration via MCP `apply_migration`, deploy via MCP `deploy_edge_function`. Versionare comunque i sorgenti in `supabase/`.
- RLS abilitata su entrambe le tabelle, **nessuna policy** anon/authenticated (tabelle invisibili al browser).
- Bucket `consultation-uploads` **privato**; allegati max 10 MB; tipi `image/*` e `application/pdf`.
- Email mittente in test: `onboarding@resend.dev`; destinatario `NOTIFY_EMAIL` (`castellansimone@gmail.com`).
- Secrets Edge Functions: `RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `NOTIFY_EMAIL`. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono iniettate automaticamente nel runtime Edge.
- Branch `consulenza-supabase` (worktree `../stageplot-consulenza`). Niente sviluppo su `main`.
- Non toccare `index.html`/`index.template.html`/`favicon.svg` (modifiche utente non correlate). Solo `consulenza/`, `supabase/`, `docs/`.

---

## File Structure

- `supabase/migrations/0001_consultation_tables.sql` — DDL tabelle + RLS + bucket.
- `supabase/functions/_shared/cors.ts` — header CORS condivisi.
- `supabase/functions/_shared/validation.ts` — funzioni pure (validazione brief, allegati, honeypot).
- `supabase/functions/_shared/validation.test.ts` — test Deno della logica pura.
- `supabase/functions/_shared/email.ts` — costruzione corpo email (puro) + invio Resend.
- `supabase/functions/_shared/email.test.ts` — test Deno della costruzione email.
- `supabase/functions/submit-consultation/index.ts` — endpoint `prepare-upload` + `submit`.
- `supabase/functions/stripe-webhook/index.ts` — webhook Stripe.
- `consulenza/index.html` — modifica form, handler fetch, upload, stati UI (Modify).

---

## Task 1: Schema DB e bucket (migration)

**Files:**
- Create: `supabase/migrations/0001_consultation_tables.sql`

**Interfaces:**
- Produces: tabelle `public.consultation_requests`, `public.consultation_payments`, bucket `consultation-uploads`. Colonne usate dalle function (vedi sotto).

- [ ] **Step 1: Scrivere la migration**

```sql
-- supabase/migrations/0001_consultation_tables.sql
create table if not exists public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  event_type text,
  date_place text,
  lineup text,
  materials text,
  notes text,
  attachments jsonb not null default '[]'::jsonb,
  stripe_session_id text,
  paid boolean not null default false,
  paid_at timestamptz,
  amount integer,
  product text,
  status text not null default 'new'
);

create table if not exists public.consultation_payments (
  stripe_session_id text primary key,
  email text,
  amount integer,
  product text,
  paid_at timestamptz not null default now()
);

alter table public.consultation_requests enable row level security;
alter table public.consultation_payments enable row level security;
-- Nessuna policy: tabelle accessibili solo via service role (Edge Functions).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consultation-uploads', 'consultation-uploads', false, 10485760,
        array['image/png','image/jpeg','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;
```

- [ ] **Step 2: Applicare la migration (MCP)**

Applicare con MCP Supabase `apply_migration` (name: `consultation_tables`, query = contenuto del file).

- [ ] **Step 3: Verificare struttura**

Con MCP `execute_sql`:
```sql
select table_name from information_schema.tables
where table_schema='public' and table_name like 'consultation_%' order by 1;
select id, public, file_size_limit from storage.buckets where id='consultation-uploads';
select relrowsecurity from pg_class where relname='consultation_requests';
```
Expected: 2 tabelle elencate; bucket `public=false`, `file_size_limit=10485760`; `relrowsecurity=true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_consultation_tables.sql
git commit -m "feat(consulenza): schema DB e bucket Storage per le richieste"
```

---

## Task 2: Logica pura di validazione (TDD)

**Files:**
- Create: `supabase/functions/_shared/validation.ts`
- Test: `supabase/functions/_shared/validation.test.ts`

**Interfaces:**
- Produces:
  - `type Brief = { name: string; email: string; event_type?: string; date_place?: string; lineup?: string; materials?: string; notes?: string; honeypot?: string; attachments?: string[]; stripe_session_id?: string }`
  - `validateBrief(input: unknown): { ok: true; value: Brief } | { ok: false; error: string }`
  - `validateUploadRequest(files: unknown): { ok: true; value: {name:string;type:string}[] } | { ok: false; error: string }`
  - `const ALLOWED_TYPES: string[]`, `const MAX_BYTES = 10485760`

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
// supabase/functions/_shared/validation.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { validateBrief, validateUploadRequest } from "./validation.ts";

Deno.test("validateBrief: ok con campi minimi", () => {
  const r = validateBrief({ name: "Mario", email: "m@x.it" });
  assertEquals(r.ok, true);
});

Deno.test("validateBrief: errore senza nome", () => {
  const r = validateBrief({ email: "m@x.it" });
  assertEquals(r.ok, false);
});

Deno.test("validateBrief: errore email non valida", () => {
  const r = validateBrief({ name: "Mario", email: "non-una-email" });
  assertEquals(r.ok, false);
});

Deno.test("validateBrief: honeypot pieno => errore (spam)", () => {
  const r = validateBrief({ name: "Mario", email: "m@x.it", honeypot: "bot" });
  assertEquals(r.ok, false);
});

Deno.test("validateUploadRequest: rifiuta tipo non consentito", () => {
  const r = validateUploadRequest([{ name: "a.exe", type: "application/x-msdownload" }]);
  assertEquals(r.ok, false);
});

Deno.test("validateUploadRequest: accetta pdf e immagini", () => {
  const r = validateUploadRequest([{ name: "rider.pdf", type: "application/pdf" }]);
  assertEquals(r.ok, true);
});
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run: `deno test supabase/functions/_shared/validation.test.ts`
Expected: FAIL (modulo `validation.ts` inesistente).

- [ ] **Step 3: Implementare `validation.ts`**

```ts
// supabase/functions/_shared/validation.ts
export const MAX_BYTES = 10_485_760;
export const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/heic", "application/pdf",
];

export type Brief = {
  name: string; email: string;
  event_type?: string; date_place?: string; lineup?: string;
  materials?: string; notes?: string; honeypot?: string;
  attachments?: string[]; stripe_session_id?: string;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateBrief(input: unknown):
  { ok: true; value: Brief } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "payload non valido" };
  const o = input as Record<string, unknown>;
  if (typeof o.honeypot === "string" && o.honeypot.trim() !== "") return { ok: false, error: "spam" };
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const email = typeof o.email === "string" ? o.email.trim() : "";
  if (!name) return { ok: false, error: "nome obbligatorio" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "email non valida" };
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : undefined);
  const attachments = Array.isArray(o.attachments)
    ? (o.attachments.filter((p) => typeof p === "string") as string[]) : [];
  return {
    ok: true,
    value: {
      name, email,
      event_type: str("event_type"), date_place: str("date_place"),
      lineup: str("lineup"), materials: str("materials"), notes: str("notes"),
      attachments, stripe_session_id: str("stripe_session_id"),
    },
  };
}

export function validateUploadRequest(files: unknown):
  { ok: true; value: { name: string; type: string }[] } | { ok: false; error: string } {
  if (!Array.isArray(files)) return { ok: false, error: "lista file non valida" };
  if (files.length > 8) return { ok: false, error: "troppi file (max 8)" };
  const out: { name: string; type: string }[] = [];
  for (const f of files) {
    const name = (f as Record<string, unknown>)?.name;
    const type = (f as Record<string, unknown>)?.type;
    if (typeof name !== "string" || typeof type !== "string") return { ok: false, error: "file malformato" };
    if (!ALLOWED_TYPES.includes(type)) return { ok: false, error: `tipo non consentito: ${type}` };
    out.push({ name, type });
  }
  return { ok: true, value: out };
}
```

- [ ] **Step 4: Eseguire i test (devono passare)**

Run: `deno test supabase/functions/_shared/validation.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/validation.ts supabase/functions/_shared/validation.test.ts
git commit -m "feat(consulenza): validazione brief e allegati (TDD)"
```

---

## Task 3: Costruzione email (TDD) + invio Resend

**Files:**
- Create: `supabase/functions/_shared/email.ts`
- Test: `supabase/functions/_shared/email.test.ts`

**Interfaces:**
- Consumes: `Brief` da `validation.ts`.
- Produces:
  - `buildEmailHtml(b: Brief, opts: { paid: boolean; attachmentUrls: string[] }): { subject: string; html: string }`
  - `sendEmail(args: { apiKey: string; to: string; subject: string; html: string }): Promise<{ ok: boolean; status: number }>`

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
// supabase/functions/_shared/email.test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import { buildEmailHtml } from "./email.ts";

Deno.test("buildEmailHtml: oggetto contiene il nome", () => {
  const { subject } = buildEmailHtml({ name: "Mario Rossi", email: "m@x.it" }, { paid: true, attachmentUrls: [] });
  assertStringIncludes(subject, "Mario Rossi");
});

Deno.test("buildEmailHtml: mostra stato pagato e gli allegati", () => {
  const { html } = buildEmailHtml(
    { name: "Mario", email: "m@x.it", lineup: "5 elementi" },
    { paid: true, attachmentUrls: ["https://x/y.pdf"] },
  );
  assertStringIncludes(html, "5 elementi");
  assertStringIncludes(html, "Pagato");
  assertStringIncludes(html, "https://x/y.pdf");
});

Deno.test("buildEmailHtml: senza pagamento mostra 'Non pagato'", () => {
  const { html } = buildEmailHtml({ name: "Mario", email: "m@x.it" }, { paid: false, attachmentUrls: [] });
  assert(html.includes("Non pagato"));
});
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run: `deno test supabase/functions/_shared/email.test.ts`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implementare `email.ts`**

```ts
// supabase/functions/_shared/email.ts
import type { Brief } from "./validation.ts";

function esc(s: string | undefined): string {
  return (s ?? "—").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

export function buildEmailHtml(
  b: Brief,
  opts: { paid: boolean; attachmentUrls: string[] },
): { subject: string; html: string } {
  const subject = `Nuova richiesta consulenza — ${b.name}`;
  const stato = opts.paid ? "Pagato" : "Non pagato";
  const rows: [string, string | undefined][] = [
    ["Nome", b.name], ["Email", b.email], ["Tipo evento", b.event_type],
    ["Data e luogo", b.date_place], ["Organico", b.lineup],
    ["Materiali", b.materials], ["Note", b.notes],
  ];
  const body = rows.map(([k, v]) => `<p><strong>${k}:</strong> ${esc(v)}</p>`).join("");
  const links = opts.attachmentUrls.length
    ? "<p><strong>Allegati:</strong></p><ul>" +
      opts.attachmentUrls.map((u) => `<li><a href="${u}">${u}</a></li>`).join("") + "</ul>"
    : "<p><strong>Allegati:</strong> nessuno</p>";
  const html = `<h2>Richiesta consulenza Stage Plot</h2><p><strong>Stato pagamento:</strong> ${stato}</p>${body}${links}`;
  return { subject, html };
}

export async function sendEmail(args: {
  apiKey: string; to: string; subject: string; html: string;
}): Promise<{ ok: boolean; status: number }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Stage Plot <onboarding@resend.dev>",
      to: [args.to], subject: args.subject, html: args.html,
    }),
  });
  return { ok: res.ok, status: res.status };
}
```

- [ ] **Step 4: Eseguire i test (devono passare)**

Run: `deno test supabase/functions/_shared/email.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/email.ts supabase/functions/_shared/email.test.ts
git commit -m "feat(consulenza): costruzione e invio email Resend (TDD)"
```

---

## Task 4: Edge Function `submit-consultation`

**Files:**
- Create: `supabase/functions/submit-consultation/index.ts`
- Create: `supabase/functions/_shared/cors.ts`

**Interfaces:**
- Consumes: `validateBrief`, `validateUploadRequest`, `buildEmailHtml`, `sendEmail`.
- Produces (HTTP):
  - `POST {url}/submit-consultation?action=prepare-upload` body `{files:[{name,type}]}` → `{uploads:[{path,signedUrl}]}`
  - `POST {url}/submit-consultation?action=submit` body `Brief` → `{ok:true, id}`

- [ ] **Step 1: Scrivere `cors.ts`**

```ts
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "https://stageplot.it",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

- [ ] **Step 2: Scrivere `submit-consultation/index.ts`**

```ts
// supabase/functions/submit-consultation/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { validateBrief, validateUploadRequest } from "../_shared/validation.ts";
import { buildEmailHtml, sendEmail } from "../_shared/email.ts";

const BUCKET = "consultation-uploads";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const action = new URL(req.url).searchParams.get("action");
  const payload = await req.json().catch(() => null);

  if (action === "prepare-upload") {
    const v = validateUploadRequest((payload as { files?: unknown })?.files);
    if (!v.ok) return json({ error: v.error }, 400);
    const uploads = [];
    for (const f of v.value) {
      const path = `${crypto.randomUUID()}/${f.name}`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) return json({ error: error.message }, 500);
      uploads.push({ path, signedUrl: data.signedUrl });
    }
    return json({ uploads });
  }

  if (action === "submit") {
    const v = validateBrief(payload);
    if (!v.ok) return json({ error: v.error }, 400);
    const b = v.value;

    // Lega il pagamento se presente
    let paid = false, amount: number | null = null, product: string | null = null, paidAt: string | null = null;
    if (b.stripe_session_id) {
      const { data: pay } = await supabase.from("consultation_payments")
        .select("*").eq("stripe_session_id", b.stripe_session_id).maybeSingle();
      if (pay) { paid = true; amount = pay.amount; product = pay.product; paidAt = pay.paid_at; }
    }

    const { data: row, error } = await supabase.from("consultation_requests").insert({
      name: b.name, email: b.email, event_type: b.event_type, date_place: b.date_place,
      lineup: b.lineup, materials: b.materials, notes: b.notes,
      attachments: b.attachments ?? [], stripe_session_id: b.stripe_session_id ?? null,
      paid, paid_at: paidAt, amount, product,
    }).select("id").single();
    if (error) return json({ error: error.message }, 500);

    // Link firmati per gli allegati (7 giorni)
    const attachmentUrls: string[] = [];
    for (const p of (b.attachments ?? [])) {
      const { data: sig } = await supabase.storage.from(BUCKET).createSignedUrl(p, 60 * 60 * 24 * 7);
      if (sig?.signedUrl) attachmentUrls.push(sig.signedUrl);
    }

    // Email (non blocca: se fallisce, la riga è già salvata)
    try {
      const { subject, html } = buildEmailHtml(b, { paid, attachmentUrls });
      await sendEmail({
        apiKey: Deno.env.get("RESEND_API_KEY")!,
        to: Deno.env.get("NOTIFY_EMAIL")!, subject, html,
      });
    } catch (e) { console.error("email fallita:", e); }

    return json({ ok: true, id: row.id });
  }

  return json({ error: "azione sconosciuta" }, 400);
});
```

- [ ] **Step 3: Type-check locale**

Run: `deno check supabase/functions/submit-consultation/index.ts`
Expected: nessun errore di tipo.

- [ ] **Step 4: Deploy (MCP)**

Deploy con MCP Supabase `deploy_edge_function` (name `submit-consultation`, file index.ts + i moduli `_shared`). Includere `_shared/*.ts` tra i file.

- [ ] **Step 5: Impostare i secrets**

Impostare (dashboard Supabase → Edge Functions → Secrets, oppure l'utente li fornisce): `RESEND_API_KEY`, `NOTIFY_EMAIL=castellansimone@gmail.com`. (Verranno usati anche da Task 6.)

- [ ] **Step 6: Verifica e2e (curl)**

```bash
# Sostituire <ANON> con la publishable key (Task 7, step 1).
curl -s -X POST "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/submit-consultation?action=submit" \
  -H "Authorization: Bearer <ANON>" -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@x.it","lineup":"trio jazz"}'
```
Expected: `{"ok":true,"id":"..."}`. Verificare con MCP `execute_sql`: `select name,email,paid from consultation_requests order by created_at desc limit 1;` → riga presente, `paid=false`. Verificare l'arrivo dell'email a `castellansimone@gmail.com`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/cors.ts supabase/functions/submit-consultation/index.ts
git commit -m "feat(consulenza): Edge Function submit-consultation (upload + insert + email)"
```

---

## Task 5: Edge Function `stripe-webhook`

**Files:**
- Create: `supabase/functions/stripe-webhook/index.ts`

**Interfaces:**
- Consumes: nessuno dai task precedenti.
- Produces: upsert in `consultation_payments` su `checkout.session.completed`; marca `paid=true` su `consultation_requests` se la riga esiste già.

- [ ] **Step 1: Scrivere `stripe-webhook/index.ts`**

```ts
// supabase/functions/stripe-webhook/index.ts
import Stripe from "https://esm.sh/stripe@16?target=deno";
import { createClient } from "jsr:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20" });

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig!, Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
    );
  } catch (e) {
    console.error("firma webhook non valida:", e);
    return new Response("invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const sessionId = s.id;
    const email = s.customer_details?.email ?? s.customer_email ?? null;
    const amount = s.amount_total ?? null;

    await supabase.from("consultation_payments").upsert({
      stripe_session_id: sessionId, email, amount,
      product: (s.metadata?.product as string) ?? null, paid_at: new Date().toISOString(),
    }, { onConflict: "stripe_session_id" });

    // Se il brief è già stato inviato, marcalo pagato.
    await supabase.from("consultation_requests")
      .update({ paid: true, paid_at: new Date().toISOString(), amount })
      .eq("stripe_session_id", sessionId);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Type-check locale**

Run: `deno check supabase/functions/stripe-webhook/index.ts`
Expected: nessun errore di tipo.

- [ ] **Step 3: Deploy senza verifica JWT (MCP)**

Deploy con MCP `deploy_edge_function` (name `stripe-webhook`). **Importante:** Stripe non invia il JWT Supabase → la function va deployata con verifica JWT disattivata (config `verify_jwt = false`). Annotare nel deploy.

- [ ] **Step 4: Impostare i secrets webhook**

Impostare `STRIPE_WEBHOOK_SECRET` e `STRIPE_SECRET_KEY` (dal dashboard Stripe; l'utente li fornisce o li imposta). Il `STRIPE_WEBHOOK_SECRET` si ottiene in Task 6 step 2.

- [ ] **Step 5: Test con evento firmato (Stripe CLI)**

```bash
stripe listen --forward-to https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/stripe-webhook
stripe trigger checkout.session.completed
```
Expected: la function risponde 200; con MCP `execute_sql`: `select * from consultation_payments order by paid_at desc limit 1;` → riga presente. Re-inviare lo stesso evento → nessuna riga duplicata (upsert idempotente). Se `stripe` CLI non è installata, testare in Task 6 con un pagamento reale di prova.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(consulenza): Edge Function stripe-webhook (verifica firma + upsert pagamento)"
```

---

## Task 6: Configurazione Stripe (Claude, sul dashboard)

**Files:** nessuno (config esterna). Documentare l'esito in `docs/superpowers/specs/` se cambia.

- [ ] **Step 1: Identificare i 2 payment link della consulenza**

Sul dashboard Stripe (`acct_1TmwYADywY28rNtZ`) trovare i payment link che corrispondono agli URL in `consulenza/index.html`: `buy.stripe.com/28EcN5f073Jpg20dJY7ok06` (Pro Review 29 €) e `buy.stripe.com/9B6dR93hpa7Ng20fS67ok05` (Production Pack).

- [ ] **Step 2: Registrare il webhook endpoint**

Stripe → Developers → Webhooks → Add endpoint:
- URL: `https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/stripe-webhook`
- Evento: `checkout.session.completed`
- Copiare lo **Signing secret** → impostarlo come `STRIPE_WEBHOOK_SECRET` (Task 5 step 4).

- [ ] **Step 3: Sistemare il `success_url` dei 2 payment link**

Per ciascun payment link → "After payment" → Redirect →
`https://stageplot.it/consulenza/?session_id={CHECKOUT_SESSION_ID}`.

- [ ] **Step 4: Verifica**

Eseguire un pagamento di prova (modalità test o importo reale rimborsabile): dopo il pagamento si torna su `/consulenza/?session_id=...`, il webhook scrive in `consultation_payments`, e inviando poi il brief la riga risulta `paid=true`.

---

## Task 7: Frontend — `consulenza/index.html`

**Files:**
- Modify: `consulenza/index.html` (blocco `<script>` ~682-730 e il `<form id="briefForm">` ~596-632)

**Interfaces:**
- Consumes: endpoint `submit-consultation` (`prepare-upload`, `submit`).

- [ ] **Step 1: Recuperare la publishable (anon) key**

Con MCP Supabase `get_publishable_keys`. È pubblica (va nel frontend). Annotarla per la costante `SB_ANON`.

- [ ] **Step 2: Aggiungere campo file + honeypot nel form**

In `consulenza/index.html`, dentro `<form id="briefForm">`, prima di `.form-actions`, aggiungere:
```html
<label>Allegati (foto del palco, vecchi rider, input list — facoltativi)
  <input type="file" name="files" id="filesInput" multiple accept="image/*,application/pdf">
</label>
<input type="text" name="company" id="hpField" tabindex="-1" autocomplete="off"
       style="position:absolute;left:-9999px" aria-hidden="true">
```

- [ ] **Step 3: Sostituire l'handler `mailto:` con le chiamate alle Edge Functions**

Rimpiazzare il blocco `form.addEventListener("submit", …)` (e `buildBody`/`copyBtn` restano come fallback) con:
```html
<script>
  const SB_URL = "https://vsodplqkuvnsdiikvmjb.supabase.co";
  const SB_ANON = "<INCOLLARE_PUBLISHABLE_KEY>"; // da Task 7 step 1 (pubblica)
  const FN = (p) => `${SB_URL}/functions/v1/${p}`;
  const form = document.querySelector("#briefForm");
  const msg = document.querySelector("#formMsg");
  const filesInput = document.querySelector("#filesInput");
  const submitBtn = form.querySelector('button[type="submit"]');

  async function uploadFiles(files) {
    if (!files.length) return [];
    const prep = await fetch(FN("submit-consultation?action=prepare-upload"), {
      method: "POST",
      headers: { "Authorization": `Bearer ${SB_ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({ files: files.map((f) => ({ name: f.name, type: f.type })) }),
    });
    if (!prep.ok) throw new Error("upload non disponibile");
    const { uploads } = await prep.json();
    for (let i = 0; i < files.length; i++) {
      const put = await fetch(uploads[i].signedUrl, { method: "PUT", body: files[i] });
      if (!put.ok) throw new Error("caricamento allegato fallito");
    }
    return uploads.map((u) => u.path);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    msg.textContent = "Invio in corso…";
    try {
      const paths = await uploadFiles([...filesInput.files]);
      const d = new FormData(form);
      const body = {
        name: d.get("name"), email: d.get("email"),
        event_type: d.get("eventType"), date_place: d.get("datePlace"),
        lineup: d.get("lineup"), materials: d.get("materials"), notes: d.get("notes"),
        honeypot: d.get("company"), attachments: paths,
        stripe_session_id: new URLSearchParams(location.search).get("session_id") || undefined,
      };
      const res = await fetch(FN("submit-consultation?action=submit"), {
        method: "POST",
        headers: { "Authorization": `Bearer ${SB_ANON}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "errore");
      form.reset();
      msg.textContent = "Richiesta ricevuta. Ti rispondo entro 24 ore.";
    } catch (err) {
      msg.textContent = "Invio non riuscito. Riprova o usa “Copia i dati” e scrivimi a castellansimone@gmail.com.";
    } finally {
      submitBtn.disabled = false;
    }
  });
</script>
```
Mantenere il bottone "Copia i dati" e la sua logica come fallback; cambiare il testo del bottone submit da "Invia via email" a "Invia richiesta".

- [ ] **Step 4: Verifica manuale e2e**

Aprire `consulenza/index.html` (via `python3 -m http.server` nella cartella, o l'anteprima del sito), compilare il form con un allegato PDF e inviare. Expected: messaggio "Richiesta ricevuta"; con MCP `execute_sql` la riga compare con `attachments` non vuoto; email ricevuta con link all'allegato funzionante.

- [ ] **Step 5: Commit**

```bash
git add consulenza/index.html
git commit -m "feat(consulenza): form salva su Supabase con upload allegati (addio mailto)"
```

---

## Self-review (esito)

- **Copertura spec Fase 1:** tabelle (T1), Storage (T1), `submit-consultation` (T4), `stripe-webhook` (T5), email (T3), frontend senza mailto (T7), config Stripe + success_url + webhook (T6). Tutto coperto. Auth/menù/link-vivo esclusi (Fase 2, come da §16).
- **Placeholder:** unico valore da inserire è la publishable key (pubblica) e i secrets — recuperati in step espliciti, non placeholder di logica.
- **Coerenza tipi:** `Brief`, `validateBrief`, `validateUploadRequest`, `buildEmailHtml`, `sendEmail` usati con le stesse firme tra `_shared/` e le function.

## Note di esecuzione

- Le azioni MCP (apply_migration, deploy_edge_function, execute_sql, get_publishable_keys) le esegue Claude in questa sessione.
- I secrets (`RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`) li fornisce/imposta l'utente: non transitano in chat.
- `deploy_edge_function` deve includere i file `_shared/*.ts` referenziati.
