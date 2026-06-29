# Flusso Consulenza Minimale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il modulo brief della pagina `/consulenza/` con un flusso minimale "pacchetto → login → progetto → pagamento", e far partire la mail col link vivo solo a pagamento confermato (webhook).

**Architecture:** Il browser non scrive mai nel DB: una Edge Function `create-consultation` pre-crea la richiesta (leggendo l'utente dal suo JWT, verificando la proprietà del progetto) e genera il `share_token`; il frontend reindirizza al Payment Link Stripe con `client_reference_id` = id richiesta; il webhook, a pagamento confermato, marca `paid` e invia a Simone la mail col link vivo. La sessione live (`?view={token}`, già esistente) resta la consegna.

**Tech Stack:** Frontend single-file HTML+CSS+JS vanilla (zero build); Supabase Edge Functions (Deno, `jsr:@supabase/supabase-js@2`); Stripe Payment Links + webhook; Resend per le mail.

## Global Constraints

- Frontend = **single-file** `consulenza/index.html`, CSS+JS inline, **zero build**.
- Edge Functions in **Deno**; client `createClient` da `jsr:@supabase/supabase-js@2`.
- CORS: origin fisso `https://stageplot.it` (`supabase/functions/_shared/cors.ts`).
- Supabase project ref: `vsodplqkuvnsdiikvmjb`. URL `https://vsodplqkuvnsdiikvmjb.supabase.co`.
- Secret già impostati su Supabase: `RESEND_API_KEY`, `NOTIFY_EMAIL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.
- Anon JWT pubblica (per il client browser): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzb2RwbHFrdXZuc2RpaWt2bWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTkyNjksImV4cCI6MjA5ODE5NTI2OX0.rZmZSvOnrNY3cC2JQ8XnbMTKIfjP5WmtbCtQ6l8zPrc`.
- Payment Links (live): `pro-review` = `https://buy.stripe.com/28EcN5f073Jpg20dJY7ok06`; `production-pack` = `https://buy.stripe.com/9B6dR93hpa7Ng20fS67ok05`.
- Codici prodotto interni: **`"pro-review"`** (29 €) e **`"production-pack"`** (149 €).
- `share_token`: generato server-side, **mai** restituito al browser (solo nella mail).
- ADMIN_ID (sessione live, invariato): `4b899cba-3cc2-4b26-9ef0-c3e915929277`.
- Deploy Edge Functions: Supabase MCP `deploy_edge_function` (o `supabase functions deploy <nome>`). Migrazioni: MCP `apply_migration` (o `supabase db push`).

---

### Task 1: Migrazione — colonna `user_id` su `consultation_requests`

`product` esiste già nella tabella; serve solo `user_id` per legare la richiesta all'utente Google.

**Files:**
- Create: `supabase/migrations/0004_consultation_user_id.sql`

**Interfaces:**
- Produces: colonna `consultation_requests.user_id uuid` (nullable, FK → `auth.users`).

- [ ] **Step 1: Scrivere la migrazione**

```sql
-- supabase/migrations/0004_consultation_user_id.sql
-- Lega la richiesta all'utente Google loggato (flusso minimale: progetto + login pre-pagamento).
alter table public.consultation_requests
  add column if not exists user_id uuid references auth.users(id);
```

- [ ] **Step 2: Applicare la migrazione**

Applicare il contenuto del file via Supabase MCP `apply_migration` (name: `consultation_user_id`) oppure `supabase db push`.

- [ ] **Step 3: Verificare la colonna**

Eseguire (MCP `execute_sql`):
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='consultation_requests' and column_name='user_id';
```
Expected: una riga `user_id | uuid | YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_consultation_user_id.sql
git commit -m "feat(db): user_id su consultation_requests per flusso minimale"
```

---

### Task 2: Builder mail "pagata" (`paid-email.ts`) — TDD

Funzione pura testabile; il webhook (Task 3) la userà.

**Files:**
- Create: `supabase/functions/_shared/paid-email.ts`
- Test: `supabase/functions/_shared/paid-email.test.ts`

**Interfaces:**
- Produces: `buildPaidEmail(a: { name: string|null; email: string|null; product: string|null; amount: number|null; viewUrl: string }): { subject: string; html: string }`.

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
// supabase/functions/_shared/paid-email.test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import { buildPaidEmail } from "./paid-email.ts";

Deno.test("buildPaidEmail: contatto, importo e link vivo", () => {
  const { subject, html } = buildPaidEmail({
    name: "Mario Rossi", email: "mario@x.it", product: "pro-review",
    amount: 2900, viewUrl: "https://stageplot.it/?view=tok123",
  });
  assertStringIncludes(subject, "Stage Plot Pro Review");
  assertStringIncludes(subject, "Mario Rossi");
  assertStringIncludes(html, "mario@x.it");
  assertStringIncludes(html, "29.00 €");
  assertStringIncludes(html, "https://stageplot.it/?view=tok123");
});

Deno.test("buildPaidEmail: campi mancanti → trattino, nessun crash", () => {
  const { html } = buildPaidEmail({ name: null, email: null, product: null, amount: null, viewUrl: "https://stageplot.it/?view=t" });
  assert(html.includes("—"));
  assertStringIncludes(html, "https://stageplot.it/?view=t");
});
```

- [ ] **Step 2: Eseguire il test → deve fallire**

Run: `deno test supabase/functions/_shared/paid-email.test.ts`
Expected: FAIL ("Module not found ./paid-email.ts").

- [ ] **Step 3: Implementare il builder**

```ts
// supabase/functions/_shared/paid-email.ts
function esc(s: string | null | undefined): string {
  return (s ?? "—").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

const PRODUCT_LABEL: Record<string, string> = {
  "pro-review": "Stage Plot Pro Review",
  "production-pack": "Production Pack",
};

export function buildPaidEmail(a: {
  name: string | null; email: string | null; product: string | null;
  amount: number | null; viewUrl: string;
}): { subject: string; html: string } {
  const label = a.product ? (PRODUCT_LABEL[a.product] ?? a.product) : "—";
  const eur = a.amount != null ? (a.amount / 100).toFixed(2) + " €" : "—";
  const subject = `Nuova consulenza pagata — ${label} — ${a.name || a.email || "cliente"}`;
  const html =
    `<h2>Consulenza pagata</h2>` +
    `<p><strong>Contatto:</strong> ${esc(a.name)} &lt;${esc(a.email)}&gt;</p>` +
    `<p><strong>Pacchetto:</strong> ${esc(label)} — <strong>Importo:</strong> ${esc(eur)}</p>` +
    `<p><strong>Link vivo (sessione):</strong> <a href="${a.viewUrl}">${a.viewUrl}</a></p>`;
  return { subject, html };
}
```

- [ ] **Step 4: Eseguire il test → deve passare**

Run: `deno test supabase/functions/_shared/paid-email.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/paid-email.ts supabase/functions/_shared/paid-email.test.ts
git commit -m "feat(email): builder mail consulenza pagata (link vivo + contatto)"
```

---

### Task 3: Webhook Stripe — aggancio `client_reference_id` + mail al pagamento

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`

**Interfaces:**
- Consumes: `buildPaidEmail` (Task 2), `sendEmail` da `../_shared/email.ts`.
- Produces: su `checkout.session.completed` con `client_reference_id`, marca la richiesta `paid` e invia la mail.

- [ ] **Step 1: Aggiungere import in cima al file**

Dopo la riga `import { createClient } from "jsr:@supabase/supabase-js@2";` aggiungere:
```ts
import { buildPaidEmail } from "../_shared/paid-email.ts";
import { sendEmail } from "../_shared/email.ts";
```

- [ ] **Step 2: Inserire il ramo `client_reference_id`**

Dentro `if (event.type === "checkout.session.completed") { ... }`, **dopo** il blocco esistente che fa `update consultation_requests ... .eq("stripe_session_id", sessionId)` (riga ~42-46) e **prima** del `return new Response(...)` finale del ramo, inserire:

```ts
    // Flusso minimale: la richiesta è pre-creata, legata via client_reference_id.
    const requestId = s.client_reference_id ?? null;
    if (requestId) {
      const { data: reqRow, error: refErr } = await supabase.from("consultation_requests")
        .update({ paid: true, paid_at: new Date().toISOString(), amount })
        .eq("id", requestId)
        .select("name,email,product,amount,share_token")
        .maybeSingle();
      if (refErr) {
        console.error("update richiesta (client_reference_id) fallito:", refErr);
        return new Response("db error", { status: 500 });
      }
      if (reqRow?.share_token) {
        try {
          const { subject, html } = buildPaidEmail({
            name: reqRow.name, email: reqRow.email, product: reqRow.product,
            amount: reqRow.amount, viewUrl: `https://stageplot.it/?view=${reqRow.share_token}`,
          });
          await sendEmail({
            apiKey: Deno.env.get("RESEND_API_KEY")!,
            to: Deno.env.get("NOTIFY_EMAIL")!, subject, html,
          });
        } catch (e) { console.error("mail pagamento fallita:", e); }
      }
    }
```

- [ ] **Step 3: Deploy della funzione**

Deploy `stripe-webhook` via Supabase MCP `deploy_edge_function` (verify_jwt = **false**, invariato) o `supabase functions deploy stripe-webhook --no-verify-jwt`.

- [ ] **Step 4: Verifica firma non valida (smoke test)**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/stripe-webhook \
  -H "Content-Type: application/json" -d '{"type":"checkout.session.completed"}'
```
Expected: `400` (firma mancante/non valida — il ramo nuovo non viene raggiunto). La verifica end-to-end del pagamento è nel Task 6.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(webhook): aggancio client_reference_id + mail link vivo a pagamento confermato"
```

---

### Task 4: Edge Function `create-consultation`

**Files:**
- Create: `supabase/functions/create-consultation/index.ts`

**Interfaces:**
- Consumes: `corsHeaders` da `../_shared/cors.ts`.
- Produces: `POST /functions/v1/create-consultation` con header `Authorization: Bearer {access_token utente}` e body `{ project_id: string, product: "pro-review"|"production-pack" }` → `{ request_id: string }` (200) | errori 400/401/403/500.

- [ ] **Step 1: Scrivere la funzione**

```ts
// supabase/functions/create-consultation/index.ts
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
```

- [ ] **Step 2: Deploy della funzione**

Deploy `create-consultation` con **verify_jwt = true** (MCP `deploy_edge_function`, opzione verify_jwt true; oppure `supabase functions deploy create-consultation`). La funzione valida comunque l'utente con `getUser`.

- [ ] **Step 3: Integration test — token utente reale + progetto proprio**

Ottenere un access_token utente reale dalla console del browser su `https://stageplot.it` (loggato):
```js
JSON.parse(localStorage["sb-vsodplqkuvnsdiikvmjb-auth-token"]).access_token
```
Poi, con `TOK` = quell'access_token e `PID` = un id di un progetto di **quell'**utente:
```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/create-consultation \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PID\",\"product\":\"pro-review\"}"
```
Expected: `HTTP 200` + `{"request_id":"..."}`.

- [ ] **Step 4: Integration test — progetto altrui → 403**

Ripetere con `PID` = id di un progetto NON dell'utente del token.
Expected: `HTTP 403` + `{"error":"progetto non valido"}`.

- [ ] **Step 5: Pulire le righe di test**

```sql
delete from consultation_requests where status='new' and paid=false and email = '<email del token>'
  and created_at > now() - interval '15 minutes';
```
(eseguire via MCP `execute_sql`, restringendo all'email usata; verificare prima con un `select`.)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/create-consultation/index.ts
git commit -m "feat(fn): create-consultation (pre-crea richiesta + share_token, ownership check)"
```

---

### Task 5: Frontend — pagina minimale + flusso d'acquisto

Rimuovere il modulo brief e gli script relativi; aggiungere badge login, trigger d'acquisto, selettore progetto, redirect a Stripe con `client_reference_id`, ripresa post-login, pagina "grazie".

**Files:**
- Modify: `consulenza/index.html`

**Interfaces:**
- Consumes: `create-consultation` (Task 4), Payment Links (Global Constraints).

- [ ] **Step 1: Topbar — aggiungere il badge login**

In `consulenza/index.html`, nella `<nav class="nav">` (dopo `<a href="/">Tool gratuito</a>`), aggiungere:
```html
      <span id="authBadge" style="font-size:14px;color:var(--muted)"></span>
```

- [ ] **Step 2: Card offerte — bottoni con `data-product` (niente link diretto a Stripe)**

Sostituire i due `<a class="btn primary" href="https://buy.stripe.com/...">Acquista</a>` con:
```html
          <button class="btn primary" type="button" data-product="pro-review">Acquista</button>
```
(card "Stage Plot Pro Review") e
```html
          <button class="btn primary" type="button" data-product="production-pack">Acquista</button>
```
(card "Production Pack").

- [ ] **Step 3: Sostituire la sezione `#intake` con selettore progetto + grazie**

Rimuovere **tutta** la `<section id="intake"> … </section>` e inserire al suo posto:
```html
    <section id="intake">
      <div class="head">
        <h2>Quasi fatto</h2>
        <p>Scegli il progetto da far revisionare, poi vai al pagamento sicuro.</p>
      </div>
      <div class="form-wrap">
        <div class="paid" id="thanks" hidden>Grazie, pagamento ricevuto.<span>Ti contatto entro 24 ore. Tieni il progetto aggiornato: lo rivediamo insieme dal vivo.</span></div>

        <div id="pickerLogin" hidden>
          <p>Per la consulenza serve l'accesso (lo stesso del tool gratuito).</p>
          <button class="btn primary" type="button" id="loginBtn">Accedi con Google</button>
        </div>

        <div id="pickerProjects" hidden>
          <label>Per quale progetto?
            <select id="projPick"></select>
          </label>
          <div class="form-actions">
            <button class="btn primary" type="button" id="payBtn">Vai al pagamento</button>
          </div>
          <p class="form-msg" id="pickMsg" role="status"></p>
        </div>

        <div id="pickerEmpty" hidden>
          <p>Non hai ancora un progetto salvato. Crealo col tool gratuito (bastano due minuti), poi torna qui.</p>
          <a class="btn primary" href="/">Apri il tool gratuito</a>
        </div>
      </div>
    </section>
```

- [ ] **Step 4: Sostituire i due `<script>` finali con la logica d'acquisto**

Rimuovere i due blocchi `<script>` esistenti prima di `</body>` (il primo che gestisce `#briefForm`/upload/copy/ritorno, e il secondo del select progetti) **mantenendo** la riga `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>`. Al loro posto:
```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  <script>
  (function(){
    var SB_URL="https://vsodplqkuvnsdiikvmjb.supabase.co";
    var SB_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzb2RwbHFrdXZuc2RpaWt2bWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTkyNjksImV4cCI6MjA5ODE5NTI2OX0.rZmZSvOnrNY3cC2JQ8XnbMTKIfjP5WmtbCtQ6l8zPrc";
    var FN=function(p){ return SB_URL+"/functions/v1/"+p; };
    var PAY={ "pro-review":"https://buy.stripe.com/28EcN5f073Jpg20dJY7ok06",
              "production-pack":"https://buy.stripe.com/9B6dR93hpa7Ng20fS67ok05" };
    if(!window.supabase||!window.supabase.createClient) return;
    var sb=window.supabase.createClient(SB_URL, SB_ANON, { auth:{ detectSessionInUrl:true, persistSession:true, autoRefreshToken:true, flowType:"pkce" } });

    var badge=document.getElementById("authBadge");
    var sLogin=document.getElementById("pickerLogin");
    var sProjects=document.getElementById("pickerProjects");
    var sEmpty=document.getElementById("pickerEmpty");
    var sel=document.getElementById("projPick");
    var pickMsg=document.getElementById("pickMsg");
    var intake=document.getElementById("intake");
    var currentProduct=null;

    function escHtml(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
    function show(el){ if(el) el.hidden=false; }
    function hide(el){ if(el) el.hidden=true; }
    function resetPickers(){ hide(sLogin); hide(sProjects); hide(sEmpty); }

    function startLogin(){
      try{ sessionStorage.setItem("pendingProduct", currentProduct||""); }catch(e){}
      sb.auth.signInWithOAuth({ provider:"google", options:{ redirectTo: location.origin+location.pathname } });
    }

    function openPicker(product){
      currentProduct=product;
      resetPickers();
      if(intake) intake.scrollIntoView({behavior:"smooth", block:"start"});
      sb.auth.getSession().then(function(res){
        var session=res&&res.data?res.data.session:null;
        if(!session){ show(sLogin); return; }
        sb.from("stageplot_projects").select("id,title,updated_at").is("deleted_at",null)
          .order("updated_at",{ascending:false}).then(function(r){
            if(r.error){ show(sLogin); return; }
            if(!r.data||!r.data.length){ show(sEmpty); return; }
            sel.innerHTML=r.data.map(function(p){ return '<option value="'+p.id+'">'+escHtml(p.title||"Senza titolo")+'</option>'; }).join("");
            show(sProjects);
          });
      });
    }

    function pay(){
      var pid=sel.value; if(!pid){ pickMsg.textContent="Seleziona un progetto."; return; }
      pickMsg.textContent="Preparo il pagamento…";
      sb.auth.getSession().then(function(res){
        var session=res&&res.data?res.data.session:null;
        if(!session){ show(sLogin); return; }
        fetch(FN("create-consultation"),{
          method:"POST",
          headers:{ "Authorization":"Bearer "+session.access_token, "Content-Type":"application/json" },
          body:JSON.stringify({ project_id:pid, product:currentProduct })
        }).then(function(r){ return r.json().then(function(j){ return {ok:r.ok, j:j}; }); })
          .then(function(o){
            if(!o.ok||!o.j.request_id){ pickMsg.textContent="Errore. Riprova o scrivimi a castellansimone@gmail.com."; return; }
            var url=PAY[currentProduct]+"?client_reference_id="+encodeURIComponent(o.j.request_id)
              +"&prefilled_email="+encodeURIComponent(session.user.email||"");
            location.href=url;
          })
          .catch(function(){ pickMsg.textContent="Errore di rete. Riprova."; });
      });
    }

    // Bottoni "Acquista"
    [].forEach.call(document.querySelectorAll("[data-product]"), function(btn){
      btn.addEventListener("click", function(){ openPicker(btn.getAttribute("data-product")); });
    });
    var payBtn=document.getElementById("payBtn"); if(payBtn) payBtn.addEventListener("click", pay);
    var loginBtn=document.getElementById("loginBtn"); if(loginBtn) loginBtn.addEventListener("click", startLogin);

    // Badge login + ripresa dopo OAuth
    function refreshBadge(){
      sb.auth.getSession().then(function(res){
        var session=res&&res.data?res.data.session:null;
        if(badge) badge.textContent = session ? ("Ciao, "+((session.user.user_metadata&&(session.user.user_metadata.name||session.user.user_metadata.full_name))||session.user.email)) : "";
      });
    }
    sb.auth.onAuthStateChange(function(ev, session){
      refreshBadge();
      if(session){
        var pend=null; try{ pend=sessionStorage.getItem("pendingProduct"); }catch(e){}
        if(pend){ try{ sessionStorage.removeItem("pendingProduct"); }catch(e){} openPicker(pend); }
      }
    });
    refreshBadge();

    // Ritorno da Stripe: pagina "grazie"
    if(new URLSearchParams(location.search).has("session_id")){
      var t=document.getElementById("thanks"); if(t) t.hidden=false;
      if(intake) intake.scrollIntoView({behavior:"smooth", block:"start"});
    }
  })();
  </script>
```

- [ ] **Step 5: Correggere il copy "senza account"**

Nella sezione `#offerte`, sostituire `Senza abbonamento, senza account.` con `Senza abbonamento. Accesso con Google, lo stesso del tool.` Nella sezione `#come-funziona`, in `<p>Tre passaggi, senza account. …</p>`, sostituire `senza account` con `accesso con Google`.

- [ ] **Step 6: Verifica nel browser (manuale)**

Servire la cartella e aprire la pagina (loggato come un utente con progetti):
1. Click "Acquista" su una card → scrolla a `#intake`, appare il selettore "Per quale progetto?" con i tuoi progetti.
2. Logout / utente anonimo → click "Acquista" → appare "Accedi con Google".
3. Utente loggato senza progetti → appare "Apri il tool gratuito".
4. Aprire `?session_id=test` → appare il riquadro "Grazie, pagamento ricevuto".
(Fermarsi prima del redirect reale a Stripe: il pagamento vero è nel Task 6.)

- [ ] **Step 7: Commit**

```bash
git add consulenza/index.html
git commit -m "feat(consulenza): pagina minimale — pacchetto, login, progetto, redirect Stripe"
```

---

### Task 6: Verifica end-to-end (Stripe) + go-live

Pagamento reale → webhook → mail col link vivo. **Richiede Simone** (login + carta).

**Files:** nessuno (verifica + deploy).

- [ ] **Step 1: Deploy pagina su produzione**

Copiare `consulenza/index.html` nel deploy e pubblicare: il repo è già su `castelsim/stageplot` (GitHub Pages da `main`). Merge del branch `consulenza-minimale` su `main` e push (vedi handoff finishing-a-development-branch). La pagina va live su `https://stageplot.it/consulenza/`.

- [ ] **Step 2: Scelta ambiente Stripe (decisione di Simone)**

Per non spendere denaro reale: o (a) creare 2 Payment Link in **modalità test** con gli stessi prezzi e usarli temporaneamente, oppure (b) fare un acquisto live reale di prova e poi **rimborsarlo** da dashboard. Consigliato (a).

- [ ] **Step 3: Acquisto di prova end-to-end**

Da `https://stageplot.it/consulenza/`, loggato, con un progetto reale: click pacchetto → seleziona progetto → "Vai al pagamento" → completare il checkout (carta test `4242 4242 4242 4242` se ambiente test).

- [ ] **Step 4: Verifiche**

1. Ritorno su `/consulenza/?session_id=…` → riquadro "Grazie".
2. DB (MCP `execute_sql`): la richiesta ha `paid=true`, `paid_at`, `amount`, `share_token`, `project_id`, `user_id`.
   ```sql
   select id, paid, amount, product, share_token is not null as has_token, user_id
   from consultation_requests order by created_at desc limit 1;
   ```
3. Mail ricevuta a `castellansimone@gmail.com` con oggetto "Nuova consulenza pagata — …" e il link `https://stageplot.it/?view={token}`.
4. Aprire quel link da loggato admin → **editor** (sessione live); da anonimo → **sola lettura**.

- [ ] **Step 5: Pulizia ambiente test (se usato)**

Disattivare/archiviare gli eventuali Payment Link di test; eliminare la richiesta di prova dal DB se non serve.

---

## Note di esecuzione

- Le Edge Function girano su Supabase remoto (no stack locale): per le funzioni la verifica è **integration** (deploy + curl + e2e), mentre `paid-email.ts` ha un **unit test** Deno reale (Task 2).
- `submit-consultation` resta deployata ma non più referenziata dal frontend; rimozione opzionale come follow-up.
- Ordine consigliato: Task 1 → 2 → 3 → 4 → 5 → 6 (Task 4 dipende da Task 1; Task 3 da Task 2; Task 5 da Task 4).
