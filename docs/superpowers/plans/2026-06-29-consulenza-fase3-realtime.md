# Consulenza Fase 3 — collaborazione real-time — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Durante una sessione live, il consulente (loggato come admin) apre il link `?view={token}`, edita lo stage plot e il cliente vede le modifiche in tempo reale; auto-save sul progetto del cliente.

**Architecture:** Supabase Realtime (broadcast) + motore del tool. Il ruolo (editor/viewer) si decide dalla sessione (`user_id === ADMIN_ID`). L'editor, in `recordHistory()`, broadcasta lo stato sul canale `consulenza:{token}`; il viewer applica lo stato remoto (render senza undo/localStorage). Auto-save via Edge Function `save-shared-project` (verifica JWT==ADMIN_ID + token). Un solo editor → niente CRDT.

**Tech Stack:** Supabase Realtime + `@supabase/supabase-js` v2 (già nel tool via CDN), Edge Function Deno, tool generato da `index.template.html` + `src/styles.css` via `node build.mjs`.

## Global Constraints

- Progetto Supabase `vsodplqkuvnsdiikvmjb`; URL `https://vsodplqkuvnsdiikvmjb.supabase.co`; anon JWT pubblica già nel tool.
- `ADMIN_ID = 4b899cba-3cc2-4b26-9ef0-c3e915929277` (auth.users di castellansimone@gmail.com). Può stare nel client (decide solo la UI; la scrittura è autorizzata lato server dal JWT).
- Tool generato: modificare `index.template.html` + `src/styles.css`, poi `node build.mjs`; `node build.mjs --check` deve passare. Mai `index.html` a mano.
- Riuso del punto d'aggancio `recordHistory()` (index.template.html:2267): è chiamata a ogni modifica finalizzata (`s !== lastSnap`).
- `supabase-js` nel tool è `<script defer>` (head): il codice Realtime deve attendere `window.supabase` (non assumere che sia pronto durante il parsing).
- Canale Realtime: nome `consulenza:{share_token}`, evento broadcast `state` payload `{json}`. Presence per "connesso".
- Editor → editing pieno (NON `body.viewmode`); Viewer → `body.viewmode` (read-only Fase 2).
- Branch `consulenza-fase3` (worktree `../stageplot-fase3`), da `origin/main` (Fase 2 inclusa).

---

## File Structure

- `supabase/functions/save-shared-project/index.ts` — Create: salva il progetto (verify_jwt=true, ADMIN_ID + token).
- `index.template.html` — Modify: blocco `?view` esteso (ruolo + Realtime + applyRemoteState + presence + auto-save + barre).
- `src/styles.css` — Modify: barre `.livebar` editor/viewer.
- `index.html` — Generated (build).

---

## Task 1: Edge Function `save-shared-project`

**Files:**
- Create: `supabase/functions/save-shared-project/index.ts`

**Interfaces:**
- Produces (HTTP): `POST {url}/save-shared-project?token=…` body `{data:<stato>}` header `Authorization: Bearer <JWT admin>` → `{ok:true}` | `{error}`.

- [ ] **Step 1: Scrivere la function**

```ts
// supabase/functions/save-shared-project/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_ID = "4b899cba-3cc2-4b26-9ef0-c3e915929277";
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://stageplot.it",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = new URL(req.url).searchParams.get("token");
  if (!token) return json({ error: "token mancante" }, 400);
  const body = await req.json().catch(() => null) as { data?: unknown } | null;
  if (!body || typeof body.data !== "object") return json({ error: "data mancante" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Verifica che il chiamante sia l'admin (dal JWT)
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user || userData.user.id !== ADMIN_ID) {
    return json({ error: "non autorizzato" }, 403);
  }

  // 2) Token valido → project_id
  const { data: reqRow, error: reqErr } = await supabase.from("consultation_requests")
    .select("project_id").eq("share_token", token).maybeSingle();
  if (reqErr) { console.error("lookup token:", reqErr.message); return json({ error: "errore" }, 500); }
  if (!reqRow?.project_id) return json({ error: "non trovato" }, 404);

  // 3) Scrivi il progetto (service role)
  const { error: updErr } = await supabase.from("stageplot_projects")
    .update({ data: body.data, updated_at: new Date().toISOString() })
    .eq("id", reqRow.project_id);
  if (updErr) { console.error("update progetto:", updErr.message); return json({ error: "errore" }, 500); }

  return json({ ok: true });
});
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/save-shared-project/index.ts`
Expected: nessun errore di tipo. (NON deployare: lo fa il controller.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/save-shared-project/index.ts
git commit -m "feat(consulenza): Edge Function save-shared-project (admin salva il progetto via token)"
```

(Deploy via MCP con verify_jwt=true e test e2e li esegue il controller: JWT admin → ok; JWT non-admin/assente → 403; token errato → 404.)

---

## Task 2: Tool — ruolo + Realtime (broadcast/subscribe/presence)

**Files:**
- Modify: `index.template.html` (blocco AVVIO `?view`, sezione ~6715-6730; funzione `recordHistory` ~2267)

**Interfaces:**
- Consumes: `get-shared-project`, `recordHistory()`, `importProject()`/`render()`/`fit()`, `stateToJSON()`, `window.supabase`.
- Produces: client Realtime condiviso `consulenza:{token}`; broadcast `state` (editor); `applyRemoteState(json)` (viewer); ruolo determinato (`window.__role`).

- [ ] **Step 1: Aggiungere `applyRemoteState` vicino a `applyHistory`**

In `index.template.html`, dopo `applyHistory` (~riga 2291), aggiungere:
```js
function applyRemoteState(json){
  try{
    state=normalizeState(JSON.parse(json)); state.items=sanitizeItems(state.items||[]);
    cacheVenueImg(state.venue); ensureItemIds(); lastSnap=stateToJSON(); sel=null; selSet={};
    setEventInputs(); render(); renderChannels(); fit();
  }catch(e){ /* stato remoto non valido: ignora */ }
}
```

- [ ] **Step 2: Hook broadcast in `recordHistory()`**

Modificare `recordHistory()` (~2267) per broadcastare quando editor:
```js
function recordHistory(){
  var s=stateToJSON();
  if(s===lastSnap) return;
  if(lastSnap!=null){ undoStack.push(lastSnap); if(undoStack.length>120) undoStack.shift(); }
  lastSnap=s; redoStack.length=0;
  if(window.__rtBroadcast) window.__rtBroadcast(s);   /* Fase 3: sessione live, solo editor */
}
```

- [ ] **Step 3: Estendere il blocco AVVIO `?view`**

Sostituire il blocco `?view` (Fase 2) con la versione che determina il ruolo e collega il Realtime. Concetto (codice completo da scrivere dall'implementer):
```js
(function(){
  var vt = new URLSearchParams(location.search).get("view");
  if(!vt) return;   /* flusso normale invariato */
  var SB_URL="https://vsodplqkuvnsdiikvmjb.supabase.co";
  var SB_ANON="<ANON_JWT>";
  var ADMIN_ID="4b899cba-3cc2-4b26-9ef0-c3e915929277";
  // 1) carica il progetto (come Fase 2)
  fetch(SB_URL+"/functions/v1/get-shared-project?token="+encodeURIComponent(vt))
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.error){ document.body.classList.add("viewmode"); showBar("viewer","— progetto non disponibile"); return; }
      // 2) attende supabase-js, crea client, determina ruolo da getSession
      whenSupabase(function(){
        var sb=window.supabase.createClient(SB_URL, SB_ANON, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"}});
        sb.auth.getSession().then(function(res){
          var user=res&&res.data&&res.data.session?res.data.session.user:null;
          var isEditor = !!(user && user.id===ADMIN_ID);
          startSession(sb, vt, d, isEditor);
        });
      });
    });

  function startSession(sb, token, d, isEditor){
    if(!isEditor){ document.body.classList.add("viewmode"); }    /* viewer = read-only Fase 2 */
    importProject(JSON.stringify(d.data));   /* carica il progetto nel motore */
    var ch=sb.channel("consulenza:"+token, {config:{broadcast:{self:false}, presence:{key:isEditor?"editor":"viewer"}}});
    if(isEditor){
      window.__rtBroadcast=function(s){ ch.send({type:"broadcast", event:"state", payload:{json:s}}); };
    } else {
      ch.on("broadcast", {event:"state"}, function(m){ if(m.payload&&m.payload.json) applyRemoteState(m.payload.json); });
    }
    ch.on("presence", {event:"sync"}, function(){ updatePresence(ch, isEditor); });
    ch.subscribe(function(status){
      if(status==="SUBSCRIBED"){
        ch.track({role:isEditor?"editor":"viewer", at:Date.now()});
        if(isEditor && window.__rtBroadcast) window.__rtBroadcast(stateToJSON());  /* allinea subito i viewer */
      }
    });
    showBar(isEditor?"editor":"viewer", "");
    if(isEditor) setupAutosave(sb, token);   /* Task 3 */
    window.__role=isEditor?"editor":"viewer";
  }
  function whenSupabase(cb){ if(window.supabase&&window.supabase.createClient) return cb(); var t=setInterval(function(){ if(window.supabase&&window.supabase.createClient){ clearInterval(t); cb(); } },80); }
  // showBar/updatePresence/setupAutosave: definite in Task 3
  window.__startSession=startSession; // (se serve a Task 3)
})();
```
NOTA: `setupAutosave`, `showBar`, `updatePresence` sono introdotte nel Task 3; in questo task definirle come stub no-op se servono per far girare il codice, poi Task 3 le completa. In alternativa Task 2 e Task 3 si implementano insieme se il reviewer preferisce.

- [ ] **Step 4: Rebuild + check**

Run: `node build.mjs && node build.mjs --check`
Expected: `✓ generato` + `✓ allineato`. Verificare con grep che `index.html` contenga `consulenza:`+`applyRemoteState`.

- [ ] **Step 5: Commit**

```bash
git add index.template.html index.html
git commit -m "feat(tool): sessione live realtime - ruolo admin, broadcast/subscribe, applyRemoteState"
```

---

## Task 3: Tool — UI barre + presence + auto-save

**Files:**
- Modify: `index.template.html` (funzioni `showBar`, `updatePresence`, `setupAutosave`; barra HTML)
- Modify: `src/styles.css` (`.livebar`)

**Interfaces:**
- Consumes: `save-shared-project`, il canale `ch`, `stateToJSON()`.

- [ ] **Step 1: Barra HTML**

In `index.template.html`, dopo `<body>`, sostituire/estendere `#viewBar` con:
```html
<div id="viewBar"><strong id="viewRole">Sola lettura</strong><span id="viewMeta"></span><span id="viewPresence" style="margin-left:auto"></span><button id="viewSave" hidden>Salva ora</button></div>
```

- [ ] **Step 2: CSS `.livebar` (editor vs viewer)**

In `src/styles.css`, accanto alle regole `viewmode`, aggiungere lo stile della barra in modalità editor (mostrata anche senza `viewmode`):
```css
body.livesession #viewBar { display:flex; }
#viewBar #viewSave { margin-left:8px; border:1px solid #fff; background:transparent; color:#fff; border-radius:6px; padding:4px 10px; cursor:pointer; }
```
(La barra in viewmode è già gestita dalla Fase 2; per l'editor si usa `body.livesession`.)

- [ ] **Step 3: `showBar`, `updatePresence`, `setupAutosave`**

In `index.template.html` (stesso IIFE del blocco `?view`):
```js
function showBar(role, meta){
  document.body.classList.add("livesession");
  var bar=document.getElementById("viewBar"); if(bar) bar.style.display="flex";
  var rl=document.getElementById("viewRole"); if(rl) rl.textContent = role==="editor" ? "Sessione live · consulente" : "Sola lettura · in diretta";
  var m=document.getElementById("viewMeta"); if(m) m.textContent = meta||"";
  var sv=document.getElementById("viewSave"); if(sv) sv.hidden = role!=="editor";
}
function updatePresence(ch, isEditor){
  var st=ch.presenceState(); var roles=[]; Object.keys(st).forEach(function(k){ (st[k]||[]).forEach(function(p){ roles.push(p.role); }); });
  var other = isEditor ? (roles.indexOf("viewer")>-1?"cliente connesso":"cliente non connesso")
                       : (roles.indexOf("editor")>-1?"consulente connesso":"consulente non connesso");
  var el=document.getElementById("viewPresence"); if(el) el.textContent="● "+other;
}
function setupAutosave(sb, token){
  var sv=document.getElementById("viewSave");
  var t=null, lastSent=null;
  function doSave(){
    var data; try{ data=JSON.parse(stateToJSON()); }catch(e){ return; }
    var snap=JSON.stringify(data); if(snap===lastSent) return; lastSent=snap;
    var m=document.getElementById("viewMeta"); if(m) m.textContent="salvataggio…";
    sb.auth.getSession().then(function(res){
      var jwt=res&&res.data&&res.data.session?res.data.session.access_token:"";
      fetch("https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/save-shared-project?token="+encodeURIComponent(token),{
        method:"POST", headers:{"Authorization":"Bearer "+jwt,"Content-Type":"application/json"}, body:JSON.stringify({data:data})
      }).then(function(r){return r.json();}).then(function(j){ if(m) m.textContent=j.ok?"salvato":"non salvato"; })
        .catch(function(){ if(m) m.textContent="non salvato"; });
    });
  }
  // auto-save debounced agganciato ai commit
  var prev=window.__rtBroadcast;
  window.__rtBroadcast=function(s){ if(prev) prev(s); clearTimeout(t); t=setTimeout(doSave, 10000); };
  if(sv) sv.addEventListener("click", function(){ clearTimeout(t); doSave(); });
}
```

- [ ] **Step 4: Rebuild + check**

Run: `node build.mjs && node build.mjs --check`
Expected: allineato.

- [ ] **Step 5: Commit**

```bash
git add index.template.html src/styles.css index.html
git commit -m "feat(tool): barra sessione live, presence e auto-save sul progetto del cliente"
```

---

## Self-review (esito)

- **Copertura spec Fase 3:** save-shared-project (T1), ruolo+broadcast+applyRemoteState+presence (T2), UI+auto-save (T3). Coperto.
- **Placeholder:** `<ANON_JWT>` = anon JWT pubblica già nota; nessun placeholder di logica.
- **Coerenza:** `ADMIN_ID`, canale `consulenza:{token}`, evento `state`, `window.__rtBroadcast` usati coerentemente tra i task.

## Note di esecuzione

- MCP (deploy_edge_function, execute_sql) e test e2e li esegue Claude.
- Collaudo finale in produzione: due browser (uno loggato come admin = editor, uno no = viewer) sullo stesso `?view={token}`; verificare diretta + auto-save + presence.
- Realtime: verificare che sia abilitato (default sì). Broadcast non richiede tabelle in publication.
- Task 2 e 3 toccano lo stesso IIFE: se conviene, l'implementer può svilupparli insieme e committare in due step.
