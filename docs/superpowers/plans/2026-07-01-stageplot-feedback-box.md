# Box feedback "Cosa manca?" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere a StagePlot un box "Cosa manca?" che raccoglie feedback (anche senza login), li salva in Supabase e notifica l'admin via email con un prompt Claude già pronto.

**Architecture:** Frontend statico (monolite `index.template.html`) → Edge Function `submit-feedback` (service role) → tabella `feedback`. La Edge Function valida, applica rate-limit per IP hashato e manda l'email best-effort. Nessun accesso diretto client→tabella. Riusa i pattern esistenti (`submit-consultation`, `_shared/email.ts`, `_shared/cors.ts`).

**Tech Stack:** Vanilla JS (frontend), Supabase Postgres + Edge Functions (Deno/TypeScript), Resend (email), Deno test + `jsr:@std/assert@1`.

## Global Constraints

- **Build single-file:** MAI editare `index.html` a mano. Editare `index.template.html` e `src/styles.css`, poi eseguire `node build.mjs`. Verifica allineamento: `node build.mjs --check`.
- **Nessuna nuova dipendenza frontend / nessun framework:** solo vanilla JS.
- **Pattern Supabase:** client → Edge Function (service role); tabelle con RLS abilitata **senza policy**.
- **Testo privacy (verbatim):** `Inviando, accetti che il messaggio e alcuni dati tecnici anonimi vengano usati per migliorare StagePlot.`
- **Chip (label → valore):** `Bug`→`bug`, `Manca qualcosa`→`missing`, `Idea`→`idea`. Opzionali, mutuamente esclusivi.
- **Vincolo messaggio:** 5–1000 caratteri (trim).
- **Email:** destinatario `Deno.env.get("NOTIFY_EMAIL")`, invio via `RESEND_API_KEY` (entrambe già configurate). Nuovo secret da creare: `FEEDBACK_IP_SALT`.
- **Design:** accent teal `#2dd4bf`, componente theme-aware (vedi `STAGEPLOT_DESIGN_SYSTEM.md`).
- **Test Deno:** `import { assertEquals } from "jsr:@std/assert@1";`

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `supabase/migrations/0006_feedback.sql` | tabelle `feedback` + `feedback_throttle` + funzione `feedback_throttle_hit` | Create |
| `supabase/functions/_shared/feedback-validation.ts` | validazione input + honeypot | Create |
| `supabase/functions/_shared/feedback-validation.test.ts` | test validazione | Create |
| `supabase/functions/_shared/feedback-prompt.ts` | genera prompt Claude + oggetto/HTML email | Create |
| `supabase/functions/_shared/feedback-prompt.test.ts` | test prompt/email | Create |
| `supabase/functions/submit-feedback/index.ts` | Edge Function orchestrazione | Create |
| `build.mjs` | inietta `app_version` (data build) | Modify |
| `index.template.html` | marcatore versione + markup box + JS wiring + voce menu "Altro…" | Modify |
| `src/styles.css` | stile del box (theme-aware) | Modify |

**Ordine:** backend testabile prima (Task 1–4), poi versione (Task 5), poi frontend (Task 6–7).

---

### Task 1: Migration DB

**Files:**
- Create: `supabase/migrations/0006_feedback.sql`

**Interfaces:**
- Produces: tabella `public.feedback`; funzione RPC `public.feedback_throttle_hit(p_ip_hash text) returns int`.

- [ ] **Step 1: Scrivere la migration**

```sql
-- supabase/migrations/0006_feedback.sql
-- Box feedback "Cosa manca?" — Blocco 1 instrumentation.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null,
  hint text,
  category text,
  status text not null default 'new',
  priority text,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  project_id uuid references public.stageplot_projects(id) on delete set null,
  app_version text,
  page_url text,
  user_agent text,
  viewport text,
  language text,
  tech_context jsonb not null default '{}'::jsonb,
  project_snapshot jsonb,
  admin_notes text
);

alter table public.feedback enable row level security;
-- Nessuna policy: accessibile solo via service role (Edge Function submit-feedback).

create table if not exists public.feedback_throttle (
  ip_hash text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (ip_hash, window_start)
);
alter table public.feedback_throttle enable row level security;

-- Incremento atomico del contatore nella finestra oraria corrente. Ritorna il nuovo count.
create or replace function public.feedback_throttle_hit(p_ip_hash text)
returns int language plpgsql security definer
set search_path = public as $$
declare v_window timestamptz := date_trunc('hour', now()); v_count int;
begin
  insert into public.feedback_throttle(ip_hash, window_start, count)
  values (p_ip_hash, v_window, 1)
  on conflict (ip_hash, window_start)
  do update set count = feedback_throttle.count + 1
  returning count into v_count;
  return v_count;
end $$;
```

- [ ] **Step 2: Applicare la migration**

Run: `supabase db push` (richiede progetto linkato)
Expected: migration `0006_feedback` applicata senza errori; tabelle `feedback` e `feedback_throttle` presenti in Supabase Studio.

- [ ] **Step 3: Creare il secret per l'hash IP**

Run: `supabase secrets set FEEDBACK_IP_SALT="$(openssl rand -hex 16)"`
Expected: secret creato (verifica con `supabase secrets list`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_feedback.sql
git commit -m "feat(feedback): migration tabelle feedback + throttle"
```

---

### Task 2: Validazione input (TDD)

**Files:**
- Create: `supabase/functions/_shared/feedback-validation.ts`
- Test: `supabase/functions/_shared/feedback-validation.test.ts`

**Interfaces:**
- Produces: `validateFeedback(payload: unknown): { ok: true; value: FeedbackInput } | { ok: false; error: string }`. Il tipo `FeedbackInput` è consumato da Task 3 e 4. `error === "spam"` segnala honeypot (Task 4 lo mappa a finto 200).

- [ ] **Step 1: Scrivere i test**

```ts
// supabase/functions/_shared/feedback-validation.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { validateFeedback } from "./feedback-validation.ts";

Deno.test("ok con messaggio valido", () => {
  const r = validateFeedback({ message: "Manca il basso a 5 corde" });
  assertEquals(r.ok, true);
});

Deno.test("errore: messaggio troppo corto", () => {
  const r = validateFeedback({ message: "ciao" }); // 4 char
  assertEquals(r.ok, false);
});

Deno.test("errore: messaggio troppo lungo", () => {
  const r = validateFeedback({ message: "x".repeat(1001) });
  assertEquals(r.ok, false);
});

Deno.test("honeypot pieno => error 'spam'", () => {
  const r = validateFeedback({ message: "messaggio vero", honeypot: "bot" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "spam");
});

Deno.test("hint fuori enum viene azzerato", () => {
  const r = validateFeedback({ message: "messaggio vero", hint: "xxx" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.hint, null);
});

Deno.test("hint valido preservato", () => {
  const r = validateFeedback({ message: "messaggio vero", hint: "bug" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.hint, "bug");
});
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run: `deno test supabase/functions/_shared/feedback-validation.test.ts`
Expected: FAIL — modulo `feedback-validation.ts` inesistente.

- [ ] **Step 3: Implementare la validazione**

```ts
// supabase/functions/_shared/feedback-validation.ts
export type FeedbackMeta = {
  app_version?: string; page_url?: string; user_agent?: string; viewport?: string; language?: string;
};
export type FeedbackInput = {
  message: string;
  hint: string | null;
  tech_context: Record<string, unknown>;
  meta: FeedbackMeta;
  project_snapshot: unknown | null;
  user_id: string | null;
  user_email: string | null;
  project_id: string | null;
};
export type ValidationResult =
  | { ok: true; value: FeedbackInput }
  | { ok: false; error: string };

const HINTS = ["bug", "missing", "idea"];

export function validateFeedback(payload: unknown): ValidationResult {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p.honeypot === "string" && p.honeypot.trim() !== "") {
    return { ok: false, error: "spam" };
  }
  const message = typeof p.message === "string" ? p.message.trim() : "";
  if (message.length < 5) return { ok: false, error: "messaggio troppo corto" };
  if (message.length > 1000) return { ok: false, error: "messaggio troppo lungo" };
  const hint = typeof p.hint === "string" && HINTS.includes(p.hint) ? p.hint : null;
  const obj = (x: unknown) => (x && typeof x === "object") ? x as Record<string, unknown> : {};
  return {
    ok: true,
    value: {
      message, hint,
      tech_context: obj(p.tech_context),
      meta: obj(p.meta) as FeedbackMeta,
      project_snapshot: p.project_snapshot ?? null,
      user_id: typeof p.user_id === "string" ? p.user_id : null,
      user_email: typeof p.user_email === "string" ? p.user_email : null,
      project_id: typeof p.project_id === "string" ? p.project_id : null,
    },
  };
}
```

- [ ] **Step 4: Eseguire i test (devono passare)**

Run: `deno test supabase/functions/_shared/feedback-validation.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/feedback-validation.ts supabase/functions/_shared/feedback-validation.test.ts
git commit -m "feat(feedback): validazione input + honeypot"
```

---

### Task 3: Prompt Claude + email (TDD)

**Files:**
- Create: `supabase/functions/_shared/feedback-prompt.ts`
- Test: `supabase/functions/_shared/feedback-prompt.test.ts`

**Interfaces:**
- Consumes: `FeedbackInput` da Task 2.
- Produces: `buildFeedbackPrompt(f: FeedbackInput): string`; `buildFeedbackEmail(f: FeedbackInput): { subject: string; html: string }`. Consumati da Task 4.

- [ ] **Step 1: Scrivere i test**

```ts
// supabase/functions/_shared/feedback-prompt.test.ts
import { assertStringIncludes } from "jsr:@std/assert@1";
import { buildFeedbackPrompt, buildFeedbackEmail } from "./feedback-prompt.ts";
import type { FeedbackInput } from "./feedback-validation.ts";

const base: FeedbackInput = {
  message: "Manca il sax baritono", hint: "missing",
  tech_context: { stage_w: 1200, stage_d: 800, total_objects: 12, object_types: { microfono: 4 }, inputs_count: 8, outputs_count: 4, selected_object_type: "microfono" },
  meta: { app_version: "2026.07.01", page_url: "https://stageplot.it/", user_agent: "UA", viewport: "1440x900", language: "it" },
  project_snapshot: null, user_id: null, user_email: null, project_id: null,
};

Deno.test("prompt include messaggio e chip", () => {
  const p = buildFeedbackPrompt(base);
  assertStringIncludes(p, "Manca il sax baritono");
  assertStringIncludes(p, "Manca qualcosa");
});

Deno.test("prompt segnala snapshot assente", () => {
  assertStringIncludes(buildFeedbackPrompt(base), "Snapshot progetto allegato: no");
});

Deno.test("prompt segnala snapshot presente", () => {
  const p = buildFeedbackPrompt({ ...base, project_snapshot: { a: 1 } });
  assertStringIncludes(p, "Snapshot progetto allegato: sì");
});

Deno.test("email: oggetto con chip e anteprima", () => {
  const { subject } = buildFeedbackEmail(base);
  assertStringIncludes(subject, "[StagePlot feedback]");
  assertStringIncludes(subject, "Manca qualcosa");
});

Deno.test("email: html contiene il blocco prompt", () => {
  const { html } = buildFeedbackEmail(base);
  assertStringIncludes(html, "<pre");
  assertStringIncludes(html, "Manca il sax baritono");
});
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run: `deno test supabase/functions/_shared/feedback-prompt.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementare prompt + email**

```ts
// supabase/functions/_shared/feedback-prompt.ts
import type { FeedbackInput } from "./feedback-validation.ts";

const HINT_LABEL: Record<string, string> = { bug: "Bug", missing: "Manca qualcosa", idea: "Idea" };

export function buildFeedbackPrompt(f: FeedbackInput): string {
  const tc = f.tech_context as Record<string, unknown>;
  const m = f.meta;
  const types = tc.object_types ? JSON.stringify(tc.object_types) : "n/d";
  return [
    `Un utente di StagePlot ha segnalato: "${f.message}"`,
    ``,
    `Segnale utente (chip): ${f.hint ? HINT_LABEL[f.hint] : "nessuno"}`,
    ``,
    `Contesto tecnico:`,
    `- Browser/OS/device: ${m.user_agent ?? "n/d"}`,
    `- Viewport / lingua: ${m.viewport ?? "n/d"} / ${m.language ?? "n/d"}`,
    `- App version / URL: ${m.app_version ?? "n/d"} / ${m.page_url ?? "n/d"}`,
    `- Progetto: ${f.project_id ?? "nessuno"}`,
    `- Dimensione palco (cm): ${tc.stage_w ?? "n/d"} x ${tc.stage_d ?? "n/d"}`,
    `- Oggetti: ${tc.total_objects ?? "n/d"} (${types})`,
    `- Input/Output: ${tc.inputs_count ?? "n/d"} / ${tc.outputs_count ?? "n/d"}`,
    `- Oggetto selezionato: ${tc.selected_object_type ?? "nessuno"}`,
    `- Snapshot progetto allegato: ${f.project_snapshot ? "sì" : "no"}`,
    ``,
    `Analizza se è bug, feature mancante, problema UX o richiesta di libreria strumenti.`,
    `Proponi soluzione, rischi di regressione e criteri di accettazione.`,
    `Non modificare codice senza prima spiegare il piano.`,
  ].join("\n");
}

export function buildFeedbackEmail(f: FeedbackInput): { subject: string; html: string } {
  const chip = f.hint ? HINT_LABEL[f.hint] : "Feedback";
  const short = f.message.length > 50 ? f.message.slice(0, 50) + "…" : f.message;
  const subject = `[StagePlot feedback] ${chip} — ${short}`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const prompt = buildFeedbackPrompt(f);
  const html = [
    `<h2>Nuovo feedback StagePlot</h2>`,
    `<p><strong>Messaggio:</strong><br>${esc(f.message)}</p>`,
    `<p><strong>Chip:</strong> ${chip}${f.user_email ? ` · <strong>Utente:</strong> ${esc(f.user_email)}` : ""}</p>`,
    `<hr>`,
    `<p><strong>Prompt Claude pronto (copia e incolla):</strong></p>`,
    `<pre style="white-space:pre-wrap;background:#f4f4f5;padding:12px;border-radius:8px;font-family:monospace;font-size:13px">${esc(prompt)}</pre>`,
  ].join("\n");
  return { subject, html };
}
```

- [ ] **Step 4: Eseguire i test (devono passare)**

Run: `deno test supabase/functions/_shared/feedback-prompt.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/feedback-prompt.ts supabase/functions/_shared/feedback-prompt.test.ts
git commit -m "feat(feedback): generatore prompt Claude + email"
```

---

### Task 4: Edge Function `submit-feedback`

**Files:**
- Create: `supabase/functions/submit-feedback/index.ts`

**Interfaces:**
- Consumes: `validateFeedback` (Task 2), `buildFeedbackEmail` (Task 3), `corsHeaders` (`_shared/cors.ts`), `sendEmail` (`_shared/email.ts`), RPC `feedback_throttle_hit` (Task 1).
- Produces: endpoint POST `/functions/v1/submit-feedback` che ritorna `{ ok: true, id }` | `{ error }`.

- [ ] **Step 1: Implementare la Edge Function**

```ts
// supabase/functions/submit-feedback/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { validateFeedback } from "../_shared/feedback-validation.ts";
import { buildFeedbackEmail } from "../_shared/feedback-prompt.ts";
import { sendEmail } from "../_shared/email.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ipHash(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + salt));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const payload = await req.json().catch(() => null);
  const v = validateFeedback(payload);
  if (!v.ok) {
    if (v.error === "spam") return json({ ok: true }); // honeypot: finto successo, nessun insert
    return json({ error: v.error }, 400);
  }
  const f = v.value;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Rate-limit per IP hashato (best-effort: se manca IP o salt, si salta)
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const salt = Deno.env.get("FEEDBACK_IP_SALT") || "";
  if (ip && salt) {
    const h = await ipHash(ip, salt);
    const { data: count, error: rlErr } = await supabase.rpc("feedback_throttle_hit", { p_ip_hash: h });
    if (rlErr) console.error("throttle fallito:", rlErr.message);
    else if (typeof count === "number" && count > 5) return json({ error: "troppi invii, riprova più tardi" }, 429);
  }

  const { data: row, error } = await supabase.from("feedback").insert({
    message: f.message, hint: f.hint,
    user_id: f.user_id, user_email: f.user_email, project_id: f.project_id,
    app_version: f.meta.app_version ?? null, page_url: f.meta.page_url ?? null,
    user_agent: f.meta.user_agent ?? null, viewport: f.meta.viewport ?? null, language: f.meta.language ?? null,
    tech_context: f.tech_context, project_snapshot: f.project_snapshot,
  }).select("id").single();
  if (error) return json({ error: error.message }, 500);

  // Email best-effort col prompt Claude (se fallisce, la riga è già salvata)
  try {
    const { subject, html } = buildFeedbackEmail(f);
    await sendEmail({ apiKey: Deno.env.get("RESEND_API_KEY")!, to: Deno.env.get("NOTIFY_EMAIL")!, subject, html });
  } catch (e) { console.error("email feedback fallita:", e); }

  return json({ ok: true, id: row.id });
});
```

- [ ] **Step 2: Deploy della funzione**

Run: `supabase functions deploy submit-feedback`
Expected: deploy ok, funzione elencata in Supabase Studio → Edge Functions.

- [ ] **Step 3: Verifica invio valido (curl)**

Run:
```bash
curl -s -X POST "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/submit-feedback" \
  -H "Content-Type: application/json" \
  -d '{"message":"Test dal piano di implementazione","hint":"idea","tech_context":{"total_objects":0}}'
```
Expected: `{"ok":true,"id":"<uuid>"}`; riga presente in tabella `feedback`; email ricevuta su `NOTIFY_EMAIL` col blocco prompt.

- [ ] **Step 4: Verifica honeypot (finto 200, nessun insert)**

Run:
```bash
curl -s -X POST "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/submit-feedback" \
  -H "Content-Type: application/json" \
  -d '{"message":"spam test","honeypot":"bot"}'
```
Expected: `{"ok":true}` **senza** `id`; nessuna nuova riga in `feedback`.

- [ ] **Step 5: Verifica messaggio corto (400)**

Run: stessa curl con `-d '{"message":"ciao"}'`
Expected: HTTP 400, `{"error":"messaggio troppo corto"}`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/submit-feedback/index.ts
git commit -m "feat(feedback): Edge Function submit-feedback (validazione, rate-limit, email)"
```

---

### Task 5: Iniettare `app_version` al build

**Files:**
- Modify: `build.mjs`
- Modify: `index.template.html` (marcatore + esposizione su `window`)

**Interfaces:**
- Produces: variabile globale `window.__APP_VERSION__` (stringa `YYYY.MM.DD`) leggibile dal frontend (Task 6).

- [ ] **Step 1: Aggiungere il marcatore versione nel template**

Nella sezione `<head>` di `index.template.html`, subito dopo il tag `<title>…</title>`, aggiungere:

```html
<script>window.__APP_VERSION__="/*__APP_VERSION__*/";</script>
```

- [ ] **Step 2: Iniettare la data di build in `build.mjs`**

In `build.mjs`, dentro `function build()`, dopo il ciclo `for (const { marker, file } of INJECTIONS)` e prima di `return out;`, aggiungere:

```js
  const version = new Date().toISOString().slice(0, 10).replace(/-/g, "."); // YYYY.MM.DD
  if (!out.includes("/*__APP_VERSION__*/")) throw new Error("Marcatore mancante: /*__APP_VERSION__*/");
  out = out.replaceAll("/*__APP_VERSION__*/", version);
```

- [ ] **Step 3: Rigenerare e verificare**

Run: `node build.mjs && grep -o 'window.__APP_VERSION__="[0-9.]*"' index.html`
Expected: stampa `window.__APP_VERSION__="2026.07.01"` (data odierna).

- [ ] **Step 4: Commit**

```bash
git add build.mjs index.template.html index.html
git commit -m "feat(feedback): inietta app_version (data build) nel single-file"
```

---

### Task 6: Box feedback — UI desktop + wiring

**Files:**
- Modify: `src/styles.css` (stile box)
- Modify: `index.template.html` (markup + JS)

**Interfaces:**
- Consumes: endpoint `submit-feedback` (Task 4); `state`, `getSel()`, `buildProjectJson()`, `whenSupabase()`, `cloudCurrentId`, `window.__APP_VERSION__` (esistenti nel template).
- Produces: funzione globale `openFeedbackBox()` (usata da Task 7 per il menu mobile).

- [ ] **Step 1: Aggiungere lo stile in `src/styles.css`**

Aggiungere in fondo a `src/styles.css`:

```css
/* ===== Box feedback "Cosa manca?" ===== */
#fbBox{position:fixed;right:22px;bottom:22px;width:326px;z-index:900;
  background:var(--panel,#161d2b);border:1px solid var(--border,#2c3a4f);border-radius:14px;
  box-shadow:0 18px 44px rgba(0,0,0,.4);color:var(--text,#e2e8f0);overflow:hidden;display:none}
#fbBox.open{display:block}
#fbBox .fb-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 0}
#fbBox .fb-head strong{font-size:16px}
#fbBox .fb-body{padding:12px 16px 16px}
#fbBox textarea{width:100%;height:72px;resize:none;background:var(--bg,#0e1420);
  border:1px solid var(--border,#2c3a4f);border-radius:9px;color:inherit;padding:9px 11px;
  font-size:13px;font-family:inherit;box-sizing:border-box}
#fbBox .fb-count{font-size:11px;color:var(--muted,#64748b);text-align:right;margin:4px 2px 0}
#fbBox .fb-chips{display:flex;gap:7px;margin:8px 0 12px}
#fbBox .fb-chip{flex:1;text-align:center;font-size:12px;font-weight:600;padding:6px 0;border-radius:8px;
  background:var(--bg,#0e1420);border:1px solid var(--border,#2c3a4f);color:var(--muted,#94a3b8);cursor:pointer}
#fbBox .fb-chip.on{background:#2dd4bf;border-color:#2dd4bf;color:#06251f}
#fbBox .fb-attach{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted,#94a3b8);margin-bottom:12px}
#fbBox .fb-send{width:100%;background:#2dd4bf;color:#06251f;border:none;border-radius:9px;padding:10px 0;
  font-size:14px;font-weight:700;cursor:pointer}
#fbBox .fb-send:disabled{opacity:.5;cursor:default}
#fbBox .fb-note{margin:11px 2px 0;font-size:10.5px;line-height:1.4;color:var(--muted,#64748b)}
#fbBox .fb-note a{color:inherit;text-decoration:underline}
#fbBox .fb-msg{font-size:12.5px;margin:10px 2px 0}
#fbBox .fb-close{background:none;border:none;color:var(--muted,#64748b);font-size:20px;cursor:pointer;line-height:1}
/* Trigger pill desktop */
#fbTrigger{position:fixed;right:22px;bottom:22px;z-index:899;display:flex;align-items:center;gap:7px;
  background:#2dd4bf;color:#06251f;padding:10px 15px;border-radius:999px;font-weight:700;font-size:13px;
  border:none;cursor:pointer;box-shadow:0 10px 26px rgba(0,0,0,.35)}
#fbTrigger.hide{display:none}
@media (max-width:760px){ #fbTrigger{display:none} #fbBox{right:0;left:0;bottom:0;width:auto;border-radius:14px 14px 0 0} }
```

> Nota: `var(--panel/--border/--bg/--text/--muted)` sono i token del design system se presenti; i fallback coprono il dark. Verificare i nomi reali in `STAGEPLOT_DESIGN_SYSTEM.md` e allineare se differiscono.

- [ ] **Step 2: Aggiungere il markup prima di `</body>`**

In `index.template.html`, subito prima di `</body>`:

```html
<button id="fbTrigger" type="button">💬 Cosa manca?</button>
<div id="fbBox" role="dialog" aria-label="Cosa manca?">
  <div class="fb-head"><strong>Cosa manca?</strong><button class="fb-close" id="fbClose" aria-label="Chiudi">×</button></div>
  <div class="fb-body">
    <textarea id="fbMsg" maxlength="1000" placeholder="Scrivi cosa manca, cosa non funziona o cosa vorresti migliorare…"></textarea>
    <div class="fb-count"><span id="fbCount">0</span>/1000</div>
    <div class="fb-chips">
      <button type="button" class="fb-chip" data-hint="bug">Bug</button>
      <button type="button" class="fb-chip" data-hint="missing">Manca qualcosa</button>
      <button type="button" class="fb-chip" data-hint="idea">Idea</button>
    </div>
    <label class="fb-attach" id="fbAttachRow" style="display:none">
      <input type="checkbox" id="fbAttach"> Allega il mio progetto</label>
    <!-- honeypot anti-bot: nascosto agli umani -->
    <input type="text" id="fbHp" tabindex="-1" autocomplete="off"
      style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" aria-hidden="true">
    <button class="fb-send" id="fbSend">Invia</button>
    <p class="fb-note">Inviando, accetti che il messaggio e alcuni dati tecnici anonimi vengano usati per migliorare StagePlot. <a href="/privacy">Privacy</a></p>
    <p class="fb-msg" id="fbResult" style="display:none"></p>
  </div>
</div>
```

- [ ] **Step 3: Aggiungere il JS prima di `</body>` (dopo il markup)**

```html
<script>
(function(){
  var SUBMIT_URL = "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/submit-feedback";
  var box=document.getElementById("fbBox"), trigger=document.getElementById("fbTrigger"),
      msg=document.getElementById("fbMsg"), count=document.getElementById("fbCount"),
      send=document.getElementById("fbSend"), result=document.getElementById("fbResult"),
      attachRow=document.getElementById("fbAttachRow"), attach=document.getElementById("fbAttach"),
      hp=document.getElementById("fbHp"), close=document.getElementById("fbClose");
  var hint=null;

  window.openFeedbackBox=function(){
    box.classList.add("open"); trigger.classList.add("hide");
    // mostra "allega progetto" solo se c'è un progetto con oggetti
    attachRow.style.display=(window.state&&state.items&&state.items.length)?"flex":"none";
    setTimeout(function(){ msg.focus(); },50);
  };
  function closeBox(){ box.classList.remove("open"); trigger.classList.remove("hide"); }

  trigger.addEventListener("click", window.openFeedbackBox);
  close.addEventListener("click", closeBox);
  msg.addEventListener("input", function(){ count.textContent=msg.value.length; });
  Array.prototype.forEach.call(document.querySelectorAll("#fbBox .fb-chip"), function(c){
    c.addEventListener("click", function(){
      if(hint===c.dataset.hint){ hint=null; c.classList.remove("on"); return; }
      hint=c.dataset.hint;
      Array.prototype.forEach.call(document.querySelectorAll("#fbBox .fb-chip"), function(x){ x.classList.toggle("on", x===c); });
    });
  });

  function techContext(){
    var s=window.state||{items:[],stage:{},inputs:[],outputs:[]};
    var types={}; (s.items||[]).forEach(function(i){ types[i.type]=(types[i.type]||0)+1; });
    var sel=(typeof getSel==="function" && getSel()) || null;
    return { stage_w:(s.stage||{}).w, stage_d:(s.stage||{}).d,
      total_objects:(s.items||[]).length, object_types:types,
      inputs_count:(s.inputs||[]).length, outputs_count:(s.outputs||[]).length,
      selected_object_type: sel?sel.type:null };
  }

  function collectAndSend(userId, userEmail){
    var body={
      message: msg.value.trim(), hint: hint, honeypot: hp.value,
      tech_context: techContext(),
      meta:{ app_version: window.__APP_VERSION__||null, page_url: location.href,
        user_agent: navigator.userAgent, viewport: innerWidth+"x"+innerHeight, language: navigator.language },
      project_snapshot: (attach.checked && typeof buildProjectJson==="function") ? buildProjectJson() : null,
      user_id: userId||null, user_email: userEmail||null,
      project_id: (window.cloudCurrentId||null)
    };
    fetch(SUBMIT_URL,{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return {status:r.status,j:j}; }); })
      .then(function(res){
        send.disabled=false;
        if(res.status===200 && res.j.ok){
          result.style.display="block"; result.style.color="#2dd4bf"; result.textContent="Ricevuto, grazie!";
          msg.value=""; count.textContent="0"; setTimeout(closeBox,1400);
        } else {
          result.style.display="block"; result.style.color="#f87171";
          result.textContent=res.status===429 ? "Hai inviato troppi feedback, riprova più tardi." : "Non è stato possibile inviare, riprova.";
        }
      })
      .catch(function(){ send.disabled=false; result.style.display="block"; result.style.color="#f87171";
        result.textContent="Non è stato possibile inviare, riprova."; });
  }

  send.addEventListener("click", function(){
    var m=msg.value.trim();
    if(m.length<5){ result.style.display="block"; result.style.color="#f87171"; result.textContent="Scrivi almeno 5 caratteri."; return; }
    send.disabled=true; result.style.display="none";
    // prova ad agganciare l'utente loggato, altrimenti invio anonimo
    if(typeof whenSupabase==="function" && window.sb && sb.auth){
      sb.auth.getSession().then(function(r){
        var u=r&&r.data&&r.data.session&&r.data.session.user;
        collectAndSend(u?u.id:null, u?u.email:null);
      }).catch(function(){ collectAndSend(null,null); });
    } else { collectAndSend(null,null); }
  });
})();
</script>
```

> Nota innesto: `window.state`, `getSel`, `buildProjectJson`, `cloudCurrentId`, `sb` sono definiti nel corpo del template. Verificare che `sb` sia esposto (in caso contrario, usare il pattern `whenSupabase` già presente per ottenere il client). L'invio anonimo NON dipende da Supabase JS: usa `fetch` nativo.

- [ ] **Step 4: Rigenerare il single-file**

Run: `node build.mjs && node build.mjs --check`
Expected: `✓ index.html generato` poi `✓ index.html allineato ai sorgenti.`

- [ ] **Step 5: Verifica visuale (desktop)**

Servire la cartella e aprire in browser:
```bash
python3 -m http.server 8080
```
Aprire `http://127.0.0.1:8080/`, cliccare la pill "💬 Cosa manca?" in basso a destra.
Expected: si apre il box in basso a destra, theme-aware; il contatore aggiorna; i chip si attivano/disattivano; il box non copre palco né toolbar.

- [ ] **Step 6: Verifica invio end-to-end**

Nel box aperto scrivere un messaggio ≥5 char e premere Invia.
Expected: compare "Ricevuto, grazie!"; nuova riga in tabella `feedback` con `tech_context` popolato (stage/oggetti); email ricevuta.

- [ ] **Step 7: Commit**

```bash
git add src/styles.css index.template.html index.html
git commit -m "feat(feedback): box 'Cosa manca?' desktop + invio"
```

---

### Task 7: Voce "Cosa manca?" nel menu "Altro…" (mobile)

**Files:**
- Modify: `index.template.html` (menu mobile)

**Interfaces:**
- Consumes: `window.openFeedbackBox()` (Task 6); `#mMoreToggle` (riga ~213) e il relativo menu.

- [ ] **Step 1: Individuare il contenitore del menu "Altro…"**

Run: `grep -n "mMoreToggle" index.template.html`
Leggere il markup del menu che `#mMoreToggle` apre (le voci fratelle, es. Esporta/Cloud) per replicarne la classe e la struttura.

- [ ] **Step 2: Aggiungere la voce nel menu**

Dentro il contenitore delle voci del menu "Altro…", aggiungere (adattando la classe a quella delle voci esistenti):

```html
<button type="button" class="mact-item" id="mFeedback">Cosa manca?</button>
```

- [ ] **Step 3: Collegare la voce al box**

Aggiungere, nello `<script>` del box (Task 6, Step 3) prima della chiusura `})();`:

```js
  var mFeedback=document.getElementById("mFeedback");
  if(mFeedback){ mFeedback.addEventListener("click", function(){
    if(typeof closeMoreMenu==="function") closeMoreMenu(); // se esiste un helper per chiudere il menu
    window.openFeedbackBox();
  }); }
```

> Verificare il nome reale dell'helper di chiusura del menu (se presente); in mancanza, chiudere il menu con la stessa logica usata dalle altre voci.

- [ ] **Step 4: Rigenerare e verificare (mobile)**

Run: `node build.mjs && node build.mjs --check`
Aprire `http://127.0.0.1:8080/` con finestra a ~400px di larghezza (o DevTools device mode). Toccare "Altro…" → "Cosa manca?".
Expected: su mobile la pill flottante NON è visibile; la voce "Cosa manca?" nel menu "Altro…" apre il box a tutta larghezza in basso.

- [ ] **Step 5: Commit**

```bash
git add index.template.html index.html
git commit -m "feat(feedback): voce 'Cosa manca?' nel menu Altro (mobile)"
```

---

## Note di rilascio / deploy

- **Migration + funzione + secret** (Task 1) e **deploy Edge Function** (Task 4) richiedono progetto Supabase linkato (`supabase link`) e vanno eseguiti una volta.
- ⚠️ **`submit-feedback` va deployata con `verify_jwt=false`** → `supabase functions deploy submit-feedback --no-verify-jwt`. Il box invia **senza** header di auth (stesso pattern di `get-shared-project`), quindi col default `verify_jwt=true` ogni invio anonimo prenderebbe **401** dal gateway *prima* di raggiungere la funzione. (Rilevato dalla review finale del branch.)
- Il frontend va in produzione col normale flusso GitHub Pages (merge del branch → `stageplot.it`). Verificare CORS: `_shared/cors.ts` deve consentire l'origine di `stageplot.it` (già così per le altre funzioni).
- **Fuori scope** (blocchi successivi, non in questo piano): PostHog, Sentry, dashboard admin, dataset AI, evento `feedback_submitted`.
