# Consulenza Fase 2 — login + menù progetti + link "vivo" + vista read-only — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere all'utente loggato di selezionare un suo progetto cloud dal form consulenza; a Simone arriva un link "vivo" che apre lo stage plot sempre aggiornato in sola-lettura, riusando il motore del tool.

**Architecture:** Riuso massimo del tool esistente. Il form consulenza carica `supabase-js`, fa login Google (sessione condivisa col tool sullo stesso dominio) e legge i progetti dell'utente con la sua sessione (RLS). Alla submit invia `project_id`; `submit-consultation` genera un `share_token` e mette nell'email il link `https://stageplot.it/?view={token}`. La nuova Edge Function `get-shared-project` traduce il token nel JSON del progetto (service role). Il tool, se aperto con `?view={token}`, entra in modalità sola-lettura: carica il progetto condiviso, lo renderizza con `importProject()` e nasconde gli strumenti di editing.

**Tech Stack:** Supabase (Postgres + Edge Functions Deno + Auth Google), `@supabase/supabase-js` v2 UMD (CDN) nel frontend, tool single-file generato da `index.template.html` via `node build.mjs`.

## Global Constraints

- Progetto Supabase `vsodplqkuvnsdiikvmjb`; URL `https://vsodplqkuvnsdiikvmjb.supabase.co`; anon JWT pubblica già usata nel tool e nella consulenza (riusarla).
- Il tool è **generato**: modificare `index.template.html` (+ `src/styles.css`), poi `node build.mjs`; mai `index.html` a mano. Prima del commit di release: `node build.mjs --check` deve passare.
- La pagina `consulenza/index.html` è **statica** (non passa per il build): si modifica direttamente.
- Riusare i pattern auth/cloud già nel tool: `signInWithOAuth({provider:"google", options:{redirectTo: location.origin+location.pathname}})`, `createClient(..., {auth:{detectSessionInUrl:true, persistSession:true, autoRefreshToken:true, flowType:"pkce"}})`, query `from("stageplot_projects").select("id,title,updated_at").is("deleted_at",null).order("updated_at",{ascending:false})`.
- `share_token`: UUID random (`crypto.randomUUID()`), non indovinabile; il link "vivo" è `https://stageplot.it/?view={share_token}`.
- Vista read-only: nascondere `#mTop`, `#catalog`, `#props`, `#emptyHint`; mostrare `main`/`#svg`; `pointer-events:none` sul canvas. Funzioni di rendering riusate: `importProject(jsonString)`, `fit()`.
- Branch `consulenza-fase2` (worktree `../stageplot-fase2`). Non sviluppare su `main`.
- Deploy Edge Functions e migration via MCP Supabase (Claude in sessione).

---

## File Structure

- `supabase/migrations/0002_consultation_share.sql` — colonne `project_id`, `share_token`.
- `supabase/functions/get-shared-project/index.ts` — token → progetto (service role, verify_jwt=false).
- `supabase/functions/submit-consultation/index.ts` — Modify: accetta `project_id`, genera `share_token`, link nell'email.
- `supabase/functions/_shared/validation.ts` — Modify: `Brief` include `project_id`.
- `supabase/functions/_shared/email.ts` — Modify: `buildEmailHtml` include il link "vivo".
- `consulenza/index.html` — Modify: supabase-js + login Google + menù progetti + `project_id` nel submit.
- `index.template.html` — Modify: blocco modalità `?view` read-only.
- `src/styles.css` — Modify: regole `.viewmode`.

---

## Task 1: Schema — colonne share (migration)

**Files:**
- Create: `supabase/migrations/0002_consultation_share.sql`

**Interfaces:**
- Produces: `consultation_requests.project_id uuid`, `consultation_requests.share_token text unique`.

- [ ] **Step 1: Scrivere la migration**

```sql
-- supabase/migrations/0002_consultation_share.sql
alter table public.consultation_requests
  add column if not exists project_id uuid references public.stageplot_projects(id),
  add column if not exists share_token text;
create unique index if not exists consultation_requests_share_token_key
  on public.consultation_requests(share_token) where share_token is not null;
```

- [ ] **Step 2: Applicare (MCP)**

Applicare con MCP `apply_migration` (name `consultation_share`, query = contenuto del file).

- [ ] **Step 3: Verificare**

Con MCP `execute_sql`:
```sql
select column_name from information_schema.columns
where table_name='consultation_requests' and column_name in ('project_id','share_token') order by 1;
```
Expected: due righe (`project_id`, `share_token`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_consultation_share.sql
git commit -m "feat(consulenza): colonne project_id e share_token per il link vivo"
```

---

## Task 2: `Brief` con project_id + email con link (TDD)

**Files:**
- Modify: `supabase/functions/_shared/validation.ts`
- Modify: `supabase/functions/_shared/validation.test.ts`
- Modify: `supabase/functions/_shared/email.ts`
- Modify: `supabase/functions/_shared/email.test.ts`

**Interfaces:**
- Produces: `Brief` con campo opzionale `project_id?: string`; `buildEmailHtml(b, {paid, attachmentUrls, viewUrl?})` che, se `viewUrl` è presente, include un link "Apri lo stage plot (sempre aggiornato)".

- [ ] **Step 1: Aggiungere i test che falliscono**

In `validation.test.ts` aggiungere:
```ts
Deno.test("validateBrief: accetta project_id", () => {
  const r = validateBrief({ name: "Mario", email: "m@x.it", project_id: "abc-123" });
  if (!r.ok) throw new Error("atteso ok");
  if (r.value.project_id !== "abc-123") throw new Error("project_id non propagato");
});
```
In `email.test.ts` aggiungere:
```ts
Deno.test("buildEmailHtml: include il link vivo se viewUrl presente", () => {
  const { html } = buildEmailHtml({ name: "Mario", email: "m@x.it" },
    { paid: true, attachmentUrls: [], viewUrl: "https://stageplot.it/?view=tok123" });
  assertStringIncludes(html, "https://stageplot.it/?view=tok123");
});
```

- [ ] **Step 2: Eseguire i test (devono fallire)**

Run: `deno test supabase/functions/_shared/`
Expected: FAIL sui 2 nuovi test.

- [ ] **Step 3: Implementare**

In `validation.ts`, nel type `Brief` aggiungere `project_id?: string;`, e in `validateBrief` aggiungere nel `value`:
```ts
      project_id: str("project_id"),
```
In `email.ts`, cambiare la firma e il corpo:
```ts
export function buildEmailHtml(
  b: Brief,
  opts: { paid: boolean; attachmentUrls: string[]; viewUrl?: string },
): { subject: string; html: string } {
  // ...invariato fino a `links`...
  const view = opts.viewUrl
    ? `<p><strong>Stage plot (sempre aggiornato):</strong> <a href="${opts.viewUrl}">${opts.viewUrl}</a></p>`
    : "";
  const html = `<h2>Richiesta consulenza Stage Plot</h2><p><strong>Stato pagamento:</strong> ${stato}</p>${body}${view}${links}`;
  return { subject, html };
}
```

- [ ] **Step 4: Eseguire i test (devono passare)**

Run: `deno test supabase/functions/_shared/`
Expected: PASS (tutti, inclusi i 2 nuovi).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/validation.ts supabase/functions/_shared/validation.test.ts supabase/functions/_shared/email.ts supabase/functions/_shared/email.test.ts
git commit -m "feat(consulenza): Brief.project_id e link vivo nell'email (TDD)"
```

---

## Task 3: `submit-consultation` genera lo share_token

**Files:**
- Modify: `supabase/functions/submit-consultation/index.ts`

**Interfaces:**
- Consumes: `Brief.project_id`, `buildEmailHtml(..., {viewUrl})`.
- Produces: alla submit, se `project_id` presente, genera `share_token` e lo salva; passa `viewUrl` all'email.

- [ ] **Step 1: Modificare il ramo `submit`**

In `submit-consultation/index.ts`, nel blocco `if (action === "submit")`, prima dell'insert aggiungere:
```ts
    const shareToken = b.project_id ? crypto.randomUUID() : null;
```
Nell'oggetto passato a `.insert({...})` aggiungere:
```ts
      project_id: b.project_id ?? null, share_token: shareToken,
```
Dopo aver costruito `attachmentUrls`, calcolare il link e passarlo all'email:
```ts
    const viewUrl = shareToken ? `https://stageplot.it/?view=${shareToken}` : undefined;
    // nel try dell'email:
      const { subject, html } = buildEmailHtml(b, { paid, attachmentUrls, viewUrl });
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/submit-consultation/index.ts`
Expected: nessun errore di tipo.

- [ ] **Step 3: Deploy (MCP)**

Deploy con MCP `deploy_edge_function` (name `submit-consultation`, verify_jwt=true, includere i file `_shared/*.ts` aggiornati).

- [ ] **Step 4: Verifica e2e (curl)**

Creare un progetto di prova e usarne l'id (oppure usare un id esistente di `stageplot_projects`). Con MCP `execute_sql`: `select id from stageplot_projects limit 1;` → `<PID>`.
```bash
curl -s -X POST "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/submit-consultation?action=submit" \
  -H "Authorization: Bearer <ANON>" -H "Content-Type: application/json" \
  -d '{"name":"Test F2","email":"f2@x.it","project_id":"<PID>"}'
```
Expected: `{"ok":true,"id":"..."}`. Con MCP `execute_sql`: `select share_token, project_id from consultation_requests where email='f2@x.it';` → `share_token` non nullo, `project_id`=`<PID>`. Poi cancellare la riga di test.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/submit-consultation/index.ts
git commit -m "feat(consulenza): submit genera share_token e link vivo quando c'è un progetto"
```

---

## Task 4: Edge Function `get-shared-project`

**Files:**
- Create: `supabase/functions/get-shared-project/index.ts`

**Interfaces:**
- Produces (HTTP): `GET/POST {url}/get-shared-project?token=…` → `{ data, title, updated_at }` oppure `{ error }`.

- [ ] **Step 1: Scrivere la function**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/get-shared-project/index.ts`
Expected: nessun errore di tipo.

- [ ] **Step 3: Deploy senza verifica JWT (MCP)**

Deploy con MCP `deploy_edge_function` (name `get-shared-project`, **verify_jwt=false**: è una pagina pubblica protetta dal token non indovinabile).

- [ ] **Step 4: Verifica (curl)**

Con un `share_token` reale (da Task 3) `<TOK>`:
```bash
curl -s "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/get-shared-project?token=<TOK>" | head -c 400
curl -s "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/get-shared-project?token=inesistente"
```
Expected: il primo restituisce `{data:{...},title,updated_at}`; il secondo `{"error":"non trovato"}`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/get-shared-project/index.ts
git commit -m "feat(consulenza): Edge Function get-shared-project (token -> progetto, service role)"
```

---

## Task 5: Frontend consulenza — login Google + menù progetti

**Files:**
- Modify: `consulenza/index.html`

**Interfaces:**
- Consumes: `submit-consultation` (con `project_id`), auth Supabase.

- [ ] **Step 1: Caricare supabase-js e aggiungere il blocco progetto nel form**

Nel `<head>` di `consulenza/index.html` aggiungere:
```html
<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
```
Nel form, prima del campo allegati, aggiungere:
```html
<label>Il tuo stage plot
  <span id="projAuth"><button type="button" id="projSignin" class="btn">Accedi con Google per scegliere un progetto</button></span>
  <select name="project_id" id="projSelect" style="display:none"></select>
  <small id="projHint" style="color:var(--muted)">Selezionando un progetto, il fonico potrà vederlo sempre aggiornato.</small>
</label>
```
Rimuovere il claim "Niente account, i dati restano sul tuo dispositivo" dal testo della sezione.

- [ ] **Step 2: Aggiungere lo script auth + menù progetti**

Aggiungere prima della chiusura `</body>`:
```html
<script>
(function(){
  if(!window.supabase || !window.supabase.createClient) return;
  var SB_URL="https://vsodplqkuvnsdiikvmjb.supabase.co";
  var SB_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzb2RwbHFrdXZuc2RpaWt2bWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTkyNjksImV4cCI6MjA5ODE5NTI2OX0.rZmZSvOnrNY3cC2JQ8XnbMTKIfjP5WmtbCtQ6l8zPrc";
  var sb=window.supabase.createClient(SB_URL, SB_ANON, { auth:{ detectSessionInUrl:true, persistSession:true, autoRefreshToken:true, flowType:"pkce" } });
  var authEl=document.getElementById("projAuth");
  var sel=document.getElementById("projSelect");
  var signinBtn=document.getElementById("projSignin");
  if(signinBtn) signinBtn.addEventListener("click", function(){
    sb.auth.signInWithOAuth({ provider:"google", options:{ redirectTo: location.origin+location.pathname } });
  });
  function loadProjects(){
    sb.from("stageplot_projects").select("id,title,updated_at").is("deleted_at",null).order("updated_at",{ascending:false})
      .then(function(r){
        if(r.error || !r.data){ return; }
        sel.innerHTML='<option value="">— Nessun progetto (allego a parte) —</option>'+
          r.data.map(function(p){ return '<option value="'+p.id+'">'+(p.title||"Senza titolo").replace(/[<>&]/g,"")+'</option>'; }).join("");
        authEl.style.display="none"; sel.style.display="";
      });
  }
  sb.auth.getSession().then(function(r){ if(r&&r.data&&r.data.session){ loadProjects(); } });
  sb.auth.onAuthStateChange(function(ev, session){ if(session){ loadProjects(); } });
})();
</script>
```

- [ ] **Step 3: Includere project_id nel submit**

Nel body dell'handler `submit` (oggetto JSON), aggiungere:
```js
        project_id: (document.getElementById("projSelect")||{}).value || undefined,
```

- [ ] **Step 4: Verifica sintassi**

```bash
python3 -c "import re; h=open('consulenza/index.html').read(); m=re.findall(r'<script>(.*?)</script>', h, re.S); open('/tmp/c2.js','w').write('\n'.join(m))" && node --check /tmp/c2.js
```
Expected: SYNTAX OK. (Test funzionale del login: in produzione/manuale, sessione condivisa col tool.)

- [ ] **Step 5: Commit**

```bash
git add consulenza/index.html
git commit -m "feat(consulenza): login Google e menù progetti nel form"
```

---

## Task 6: Tool — modalità sola-lettura `?view={token}`

**Files:**
- Modify: `index.template.html`
- Modify: `src/styles.css`
- Generated: `index.html` (via `node build.mjs`)

**Interfaces:**
- Consumes: `get-shared-project`, `importProject(jsonString)`, `fit()`.

- [ ] **Step 1: Aggiungere le regole CSS read-only**

In `src/styles.css` aggiungere in fondo:
```css
/* Modalità sola-lettura (link "vivo" della consulenza): /?view={token} */
body.viewmode #mTop,
body.viewmode #catalog,
body.viewmode #props,
body.viewmode #emptyHint { display: none !important; }
body.viewmode #svg { pointer-events: none; }
body.viewmode #viewBar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  display: flex; align-items: center; gap: 12px;
  padding: 8px 14px; background: #111827; color: #fff; font-size: 14px;
}
body.viewmode main { position: fixed; inset: 44px 0 0 0; }
#viewBar { display: none; }
```

- [ ] **Step 2: Aggiungere la barra read-only nell'HTML**

In `index.template.html`, subito dopo `<body...>` (o dopo `#mTop`), aggiungere:
```html
<div id="viewBar"><strong>Sola lettura</strong><span id="viewMeta"></span></div>
```

- [ ] **Step 3: Aggiungere il blocco JS view-mode**

In `index.template.html`, dentro lo script principale dove `importProject` e `fit` sono già definiti e dopo che il DOM è pronto (vicino alla chiamata iniziale di `load()`), sostituire l'avvio normale con un check del parametro `view`:
```js
(function(){
  var vt = new URLSearchParams(location.search).get("view");
  if(!vt){ load(); return; }   /* flusso normale: carica da localStorage */
  document.body.classList.add("viewmode");
  var bar=document.getElementById("viewBar"); if(bar) bar.style.display="flex";
  fetch("https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/get-shared-project?token="+encodeURIComponent(vt))
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error){ var m=document.getElementById("viewMeta"); if(m) m.textContent="— progetto non disponibile"; return; }
      importProject(JSON.stringify(d.data));
      var m=document.getElementById("viewMeta");
      if(m && d.updated_at){ try{ m.textContent="— "+(d.title||"")+" · ultima modifica "+new Date(d.updated_at).toLocaleString("it-IT"); }catch(e){} }
      fit();
    })
    .catch(function(){ var m=document.getElementById("viewMeta"); if(m) m.textContent="— errore di caricamento"; });
})();
```
NOTA per l'implementer: individuare il punto esatto in cui `load()` è chiamato all'avvio del tool e racchiuderlo in questo branch (se `?view` assente → `load()`; altrimenti carica il progetto condiviso). Non rimuovere altre inizializzazioni che seguono `load()`.

- [ ] **Step 4: Rigenerare il single-file e verificare**

```bash
node build.mjs
node build.mjs --check
deno check index.template.html 2>/dev/null || true   # opzionale: il template non è un modulo
```
Expected: `✓ index.html generato` e `✓ index.html allineato ai sorgenti`.

- [ ] **Step 5: Verifica manuale (read-only)**

Con un `share_token` reale `<TOK>`, aprire `index.html` localmente servito (`python3 -m http.server`) a `/?view=<TOK>` — NB: il CORS di `get-shared-project` è `https://stageplot.it`, quindi il caricamento del progetto va verificato in produzione; in locale verificare almeno che la UI entri in modalità sola-lettura (barra visibile, palette/toolbar nascoste). Verifica e2e completa: dopo il deploy in produzione, aprire `https://stageplot.it/?view=<TOK>` e confermare che lo stage plot compaia in sola-lettura con "ultima modifica".

- [ ] **Step 6: Commit**

```bash
git add index.template.html src/styles.css index.html
git commit -m "feat(tool): modalità sola-lettura /?view={token} per il link vivo della consulenza"
```

---

## Self-review (esito)

- **Copertura spec Fase 2 (§16):** colonne share (T1), Brief.project_id + email link (T2), submit genera token (T3), get-shared-project (T4), login+menù progetti (T5), vista read-only nel tool (T6). Coperto.
- **Placeholder:** unici valori esterni sono `<ANON>` (anon JWT pubblica, già nota), `<PID>`/`<TOK>` (recuperati da step espliciti). Nessun placeholder di logica.
- **Coerenza tipi:** `Brief.project_id`, `buildEmailHtml(..., {viewUrl})`, `share_token` usati con le stesse firme tra `_shared/`, le function e il frontend.

## Note di esecuzione

- Le azioni MCP (apply_migration, deploy_edge_function, execute_sql) le esegue Claude.
- La verifica e2e del login e della vista read-only è in produzione (CORS `https://stageplot.it`); va pianificato un breve test live dopo il merge.
- Decisione presa: vista read-only via **flag `?view` nel tool** (zero duplicazione), non pagina separata.
- Dopo l'esecuzione: merge `consulenza-fase2` → `main` (con consenso utente) e rebuild verificato.
