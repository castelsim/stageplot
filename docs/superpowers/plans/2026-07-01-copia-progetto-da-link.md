# Condivisione generica + copia progetto da link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Da qualsiasi progetto salvato generare un link corto in sola lettura (`?view={token}`); chi lo apre può crearne una copia indipendente nel proprio account.

**Architecture:** Riuso di `stageplot_projects` con una colonna `share_token`; `get-shared-project` diventa un lookup duale (consulenza **o** progetto) che ritorna `kind`. Nel client (single-file, tre IIFE con scope separati che comunicano via `window.__*`) si espone `window.__cloud`, si estende il "Condividi" esistente per generare il link DB, e si aggiunge un ramo read-only + copia alla modalità `?view=`.

**Tech Stack:** Supabase (Postgres + Edge Functions Deno), JS vanilla in `index.template.html`, build single-file via `node build.mjs`.

## Global Constraints

- **Mai editare `index.html`**: è generato. Editare `index.template.html` (JS/HTML) e `src/styles.css` (stile), poi `node build.mjs`. CI: `node build.mjs --check` deve passare.
- **Scope separati**: `openShare` (~6040) e l'IIFE `?view=` (~6932) NON vedono `sb`/`cloudUser`/`saveProject` (locali al modulo cloud, `var` a 7176). Comunicare solo via `window.__cloud` (Task 3) e le globali `state`, `importProject`, `stateToJSON`, `buildShareUrl`, `window.__toast`.
- **Nessun unit test JS**: il client single-file si verifica in browser (prassi del progetto). Gli step "test" qui sono `node build.mjs --check`, comandi `curl` per l'Edge Function, e verifica browser con esito atteso.
- **Design system**: nuovo CSS con token (`--accent` teal, `--r-md`), niente hex grezzi.
- **Non regredire la consulenza**: i token di consulenza devono restare `kind:"consultation"` e attivare la Fase 3 (Realtime) invariata.
- **Deploy Supabase** (migration + Edge Function) lo esegue Simone (credenziali).
- **Modifiche al template inline**, non via subagent che riscrive il file (rischio corruzione smart-quotes nel JS, già occorso — vedi `PROGRESSI_CONSULENZA_WEB.md`).

Spec di riferimento: `docs/superpowers/specs/2026-07-01-copia-progetto-da-link-design.md`.

---

### Task 1: Migration — `share_token` su `stageplot_projects`

**Files:**
- Create: `supabase/migrations/0007_stageplot_projects_share.sql`

**Interfaces:**
- Produces: colonna `stageplot_projects.share_token text` (unique quando non null).

- [ ] **Step 1: Scrivere la migration**

```sql
-- supabase/migrations/0007_stageplot_projects_share.sql
-- Condivisione generica di un progetto: token pubblico per il link ?view= (sola lettura + copia).
-- Riusa la tabella esistente; nessuna nuova tabella (la copia è un normale insert).
alter table public.stageplot_projects
  add column if not exists share_token text;

create unique index if not exists stageplot_projects_share_token_key
  on public.stageplot_projects(share_token) where share_token is not null;
```

- [ ] **Step 2: Applicare la migration su Supabase** (Simone)

Da dashboard SQL editor o CLI. Comando CLI se disponibile:
Run: `supabase db push`
Expected: applica `0007`; nessun errore.

- [ ] **Step 3: Verificare la colonna**

Query nel SQL editor:
```sql
select column_name from information_schema.columns
where table_name='stageplot_projects' and column_name='share_token';
```
Expected: 1 riga (`share_token`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_stageplot_projects_share.sql
git commit -m "feat(share): migration share_token su stageplot_projects"
```

---

### Task 2: `get-shared-project` — lookup duale + `kind`

**Files:**
- Modify: `supabase/functions/get-shared-project/index.ts`

**Interfaces:**
- Consumes: `stageplot_projects.share_token` (Task 1).
- Produces: risposta JSON `{ data, title, updated_at, kind }` con `kind ∈ {"consultation","project"}`; 404 se il token non matcha nulla.

- [ ] **Step 1: Riscrivere il corpo del handler** (dopo la riga `if (!token) return json(...)`, sostituire dal primo lookup fino al `return` finale)

```ts
  // 1) prova come token di consulenza (comportamento storico)
  const { data: reqRow, error: reqErr } = await supabase.from("consultation_requests")
    .select("project_id").eq("share_token", token).maybeSingle();
  if (reqErr) { console.error("lookup consultation:", reqErr.message); return json({ error: "errore" }, 500); }

  let projectId: string | null = reqRow?.project_id ?? null;
  let kind = "consultation";

  // 2) altrimenti prova come token di progetto condiviso
  if (!projectId) {
    const { data: shareRow, error: shareErr } = await supabase.from("stageplot_projects")
      .select("id").eq("share_token", token).is("deleted_at", null).maybeSingle();
    if (shareErr) { console.error("lookup project:", shareErr.message); return json({ error: "errore" }, 500); }
    if (shareRow?.id) { projectId = shareRow.id; kind = "project"; }
  }

  if (!projectId) return json({ error: "non trovato" }, 404);

  const { data: proj, error: projErr } = await supabase.from("stageplot_projects")
    .select("data,title,updated_at").eq("id", projectId).maybeSingle();
  if (projErr) { console.error("lettura progetto fallita:", projErr.message); return json({ error: "errore" }, 500); }
  if (!proj) return json({ error: "progetto non trovato" }, 404);

  return json({ data: proj.data, title: proj.title, updated_at: proj.updated_at, kind });
```

- [ ] **Step 2: Deploy dell'Edge Function** (Simone)

Run: `supabase functions deploy get-shared-project`
Expected: deploy OK.

- [ ] **Step 3: Verifica via curl — token di progetto**

Usare un `share_token` reale generato a mano su un progetto di test (o dopo Task 4).
Run: `curl -s "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/get-shared-project?token=<TOKEN_PROGETTO>" | head -c 300`
Expected: JSON con `"kind":"project"` e `"data"`, `"title"`.

- [ ] **Step 4: Verifica via curl — regressione consulenza + 404**

Run: `curl -s ".../get-shared-project?token=<TOKEN_CONSULENZA_ESISTENTE>" | head -c 120`
Expected: JSON con `"kind":"consultation"`.
Run: `curl -s ".../get-shared-project?token=inesistente-xyz"`
Expected: `{"error":"non trovato"}` (HTTP 404).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/get-shared-project/index.ts
git commit -m "feat(share): get-shared-project lookup duale consulenza/progetto + kind"
```

---

### Task 3: `window.__cloud` + `onSaved` su `saveProject`

**Files:**
- Modify: `index.template.html` (modulo cloud, ~7293 `saveProject`; ~7390 fine IIFE)

**Interfaces:**
- Produces: `window.__cloud` con: `user()`, `currentId()`, `setCurrentId(v)`, `signIn`, `save(onSaved)`, `ensureShareToken(cb)`, `clearShareToken(cb)`. Usato da Task 4/5/6.
- `saveProject(onSaved)`: `onSaved(id)` chiamato dopo salvataggio riuscito.

- [ ] **Step 1: Aggiungere `onSaved` a `saveProject`**

Sostituire la firma `function saveProject(){` con `function saveProject(onSaved){`, propagare nel ramo titolo mancante e chiamare `onSaved` dopo il salvataggio. Le due righe da cambiare:

Riga ~7296, da:
```js
  if(!(state.titolo||"").trim()){ askProjectName(saveProject); return; }
```
a:
```js
  if(!(state.titolo||"").trim()){ askProjectName(function(){ saveProject(onSaved); }); return; }
```

Nel `q.then(...)` (riga ~7306), dopo `loadProjects();` aggiungere:
```js
        if(typeof onSaved==="function") onSaved(cloudCurrentId);
```

- [ ] **Step 2: Esporre `window.__cloud`** (subito prima di `if(document.readyState!=="loading") init();`, riga ~7390)

```js
  /* Interfaccia cloud per gli altri IIFE (openShare, ?view=), che hanno scope separati. */
  function ensureShareToken(cb){
    if(!sb || !cloudCurrentId){ cb(null); return; }
    sb.from("stageplot_projects").select("share_token").eq("id", cloudCurrentId).single().then(function(r){
      if(r.error){ cb(null); return; }
      if(r.data && r.data.share_token){ cb(r.data.share_token); return; }
      var tok=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():(String(Date.now())+Math.random().toString(16).slice(2));
      sb.from("stageplot_projects").update({ share_token:tok }).eq("id", cloudCurrentId).then(function(u){ cb(u.error?null:tok); });
    });
  }
  function clearShareToken(cb){
    if(!sb || !cloudCurrentId){ if(cb) cb(false); return; }
    sb.from("stageplot_projects").update({ share_token:null }).eq("id", cloudCurrentId).then(function(u){ if(cb) cb(!u.error); });
  }
  window.__cloud = {
    user: function(){ return cloudUser; },
    currentId: function(){ return cloudCurrentId; },
    setCurrentId: function(v){ cloudCurrentId=v; },
    signIn: signIn,
    save: saveProject,
    ensureShareToken: ensureShareToken,
    clearShareToken: clearShareToken
  };
```

- [ ] **Step 3: Build**

Run: `node build.mjs`
Expected: `✓ index.html generato dai sorgenti.`

- [ ] **Step 4: Verifica in browser**

Aprire `index.html`, console: `typeof window.__cloud.save`
Expected: `"function"`. Se loggato, `window.__cloud.user()` → oggetto utente; altrimenti `null`.

- [ ] **Step 5: Commit**

```bash
git add index.template.html index.html
git commit -m "feat(share): espone window.__cloud + onSaved in saveProject"
```

---

### Task 4: "Condividi" genera il link DB (ramo loggato)

**Files:**
- Modify: `index.template.html` (markup `#shareModal` ~677-682; IIFE `openShare` ~6045)

**Interfaces:**
- Consumes: `window.__cloud` (Task 3), `buildShareUrl()` (globale), `state`.

- [ ] **Step 1: Aggiungere il pulsante "Smetti di condividere" nel markup** (dentro `#shareLinkBox`, dopo `#shareUrlButtons`, riga ~682)

```html
      <button class="btn" id="shareUnshare" hidden style="margin-top:6px">Smetti di condividere</button>
```

- [ ] **Step 2: Rifattorizzare `openShare` in `fillShareModal` + due rami** (sostituire l'attuale `function openShare(){ ... }`, ~6045-6062)

```js
  function fillShareModal(url){
    urlEl.value=url; status("");
    document.getElementById("shareNative").hidden = !navigator.share;
    var qrImg=document.getElementById('shareQrImg'), qrErr=document.getElementById('shareQrErr'), qrWarn=document.getElementById('shareQrWarn');
    qrErr.style.display='none';
    if(url.length > 1000){ qrImg.style.display='none'; qrImg.src=''; qrWarn.style.display='block'; }
    else { qrWarn.style.display='none'; qrImg.style.display='block'; qrImg.src='https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=6&ecc=L&data='+encodeURIComponent(url); }
    setTimeout(function(){ try{ urlEl.focus(); urlEl.select(); }catch(e){} },40);
  }
  function showUnshare(on){ var b=document.getElementById("shareUnshare"); if(b) b.hidden=!on; }
  function openShare(){
    var C=window.__cloud;
    modal.hidden=false;
    if(C && C.user()){
      status("Preparazione link…"); showUnshare(false);
      C.save(function(id){
        if(!id){ status(""); return; }
        C.ensureShareToken(function(tok){
          if(!tok){ fillShareModal(buildShareUrl()); return; }   /* fallback offline */
          fillShareModal(location.origin+location.pathname+"?view="+encodeURIComponent(tok));
          showUnshare(true);
        });
      });
      return;
    }
    /* non loggato / offline: link hash storico, invariato */
    showUnshare(false);
    fillShareModal(buildShareUrl());
  }
```

- [ ] **Step 3: Listener del pulsante revoca** (accanto agli altri listener share, dopo `shareCopy`, ~6098)

```js
  (function(){ var ub=document.getElementById("shareUnshare"); if(ub) ub.addEventListener("click", function(){
    var C=window.__cloud; if(!C) return;
    C.clearShareToken(function(ok){
      if(ok){ status("Condivisione revocata."); urlEl.value=""; showUnshare(false);
        var q=document.getElementById('shareQrImg'); if(q){ q.style.display='none'; q.src=''; } }
      else status("Revoca non riuscita.");
    });
  }); })();
```

- [ ] **Step 4: Build**

Run: `node build.mjs && node build.mjs --check`
Expected: generato + `✓ index.html allineato ai sorgenti.`

- [ ] **Step 5: Verifica browser — loggato e non**

Loggato: crea un progetto, "Condividi" → appare "Preparazione…" poi un link `.../?view=<uuid>` corto, QR visibile, "Smetti di condividere" visibile. Se il progetto non era salvato, prima appare "Dai un nome al progetto".
Non loggato: "Condividi" → link `#p=...` (comportamento storico), nessun pulsante revoca.

- [ ] **Step 6: Commit**

```bash
git add index.template.html index.html
git commit -m "feat(share): Condividi genera link ?view= per utenti loggati + revoca"
```

---

### Task 5: Ramo `kind:"project"` in `?view=` — read-only + "Crea una copia"

**Files:**
- Modify: `index.template.html` (markup `#viewBar` riga 141; IIFE `?view=` ~6941 e nuova funzione)

**Interfaces:**
- Consumes: `get-shared-project` con `kind` (Task 2), `window.__cloud` (Task 3), `importProject`, `state`, `showBar`.

- [ ] **Step 1: Aggiungere `#viewCopy` al markup `#viewBar`** (riga 141, prima di `</div>`)

```html
<button id="viewCopy" hidden>Crea una copia</button>
```

- [ ] **Step 2: Ramificare sul `kind`** nel `.then(function(d){...})` dell'IIFE (riga ~6941). Dopo la riga `if(d.error){ ... return; }` aggiungere:

```js
      if(d.kind==="project"){ startSharedProject(vt, d); return; }   /* condivisione generica: read-only statico + copia */
```

- [ ] **Step 3: Definire `startSharedProject`** (dentro l'IIFE `?view=`, accanto a `startSession`)

```js
  function startSharedProject(token, d){
    document.body.classList.add("viewmode");
    importProject(JSON.stringify(d.data));
    showBar("viewer", "");
    var role=document.getElementById("viewRole"); if(role) role.textContent="Sola lettura · Crea una copia per modificare";
    var pres=document.getElementById("viewPresence"); if(pres) pres.textContent="";
    var cp=document.getElementById("viewCopy"); if(!cp) return;
    cp.hidden=false;
    cp.addEventListener("click", function(){
      var C=window.__cloud;
      if(C && C.user()){
        C.setCurrentId(null);
        try{ state.titolo="Copia di "+(d.title||"progetto"); }catch(e){}
        C.save(function(id){
          if(!id) return;
          document.body.classList.remove("viewmode");
          try{ history.replaceState(null,"",location.pathname); }catch(e){}
          var bar=document.getElementById("viewBar"); if(bar) bar.style.display="none";
          if(window.__toast) window.__toast("✓ Copia creata nel tuo account.");
        });
      } else {
        try{ sessionStorage.setItem("copyFromToken", token); }catch(e){}
        if(C && C.signIn) C.signIn();
      }
    });
  }
```

- [ ] **Step 4: Build**

Run: `node build.mjs && node build.mjs --check`
Expected: generato + allineato.

- [ ] **Step 5: Verifica browser**

In un browser diverso (o incognito) aprire il link `?view=<token>` generato in Task 5-precedente: il canvas mostra il progetto in **sola lettura**, la barra dice "Sola lettura · Crea una copia per modificare", il pulsante "Crea una copia" è visibile; console senza errori Realtime (niente canale `consulenza:`). Da loggato, "Crea una copia" apre la copia editabile e pulisce l'URL.

- [ ] **Step 6: Commit**

```bash
git add index.template.html index.html
git commit -m "feat(share): ?view= progetto → read-only + Crea una copia"
```

---

### Task 6: Completare la copia dopo il login (OAuth perde `?view=`)

**Files:**
- Modify: `index.template.html` (modulo cloud, `init` ~7376; nuova `completeCopyFromToken`)

**Interfaces:**
- Consumes: `sessionStorage.copyFromToken` (impostato in Task 5), `SUPABASE_URL`, `importProject`, `saveProject`.

- [ ] **Step 1: Definire `completeCopyFromToken`** (nel modulo cloud, accanto a `saveProject`)

```js
  function completeCopyFromToken(token){
    fetch(SUPABASE_URL+"/functions/v1/get-shared-project?token="+encodeURIComponent(token))
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(!d || d.error || !d.data){ toast("Impossibile completare la copia.", true); return; }
        try{ importProject(JSON.stringify(d.data)); }catch(e){ toast("Copia non valida.", true); return; }
        cloudCurrentId=null;
        try{ state.titolo="Copia di "+(d.title||"progetto"); }catch(e){}
        saveProject(function(){ toast("✓ Copia creata nel tuo account."); try{ history.replaceState(null,"",location.pathname); }catch(e){} });
      })
      .catch(function(){ toast("Impossibile completare la copia.", true); });
  }
```

- [ ] **Step 2: Agganciare il completamento nel `getSession().then`** (riga ~7376). Sostituire il corpo del `.then` con:

```js
    sb.auth.getSession().then(function(r){
      cloudUser=(r && r.data && r.data.session)?r.data.session.user:null;
      updateBtn();
      var copyTok=null; try{ copyTok=sessionStorage.getItem("copyFromToken"); }catch(e){}
      if(copyTok && cloudUser){
        try{ sessionStorage.removeItem("copyFromToken"); sessionStorage.removeItem("cloudReopen"); }catch(e){}
        completeCopyFromToken(copyTok);
        return;
      }
      var reopen=false; try{ reopen=sessionStorage.getItem("cloudReopen")==="1"; }catch(e){}
      if(reopen && cloudUser){ try{ sessionStorage.removeItem("cloudReopen"); }catch(e){} openModal(); }
    });
```

- [ ] **Step 3: Build**

Run: `node build.mjs && node build.mjs --check`
Expected: generato + allineato.

- [ ] **Step 4: Verifica browser (flusso completo non loggato)**

In incognito, aprire `?view=<token>` → "Crea una copia" → login Google → al ritorno: la copia è salvata (compare "✓ Copia creata"), l'URL non ha più `?view=`, e nel menù Cloud appare "Copia di …".

- [ ] **Step 5: Commit**

```bash
git add index.template.html index.html
git commit -m "feat(share): completa la copia post-login (copyFromToken + re-fetch)"
```

---

### Task 7: Verifica end-to-end + regressione + deploy finale

**Files:**
- Nessuna modifica nuova; consolida build e deploy.

- [ ] **Step 1: Build pulita**

Run: `node build.mjs && node build.mjs --check`
Expected: `✓ index.html allineato ai sorgenti.`

- [ ] **Step 2: Regressione consulenza (Fase 3)**

Aprire un link `?view=<token_consulenza>` esistente da admin: parte la sessione live (editor/viewer, Realtime), **nessun** pulsante "Crea una copia", comportamento invariato.

- [ ] **Step 3: Test manuali dallo spec (1–7)**

Eseguire i test elencati in `docs/superpowers/specs/2026-07-01-copia-progetto-da-link-design.md` §"Test manuali". Tutti verdi.

- [ ] **Step 4: Deploy** (Simone)

Migration `0007` applicata (Task 1), `get-shared-project` deployata (Task 2), push su `main` → GitHub Pages rigenera. Verifica su `stageplot.it`.

- [ ] **Step 5: Commit finale se restano diff di build**

```bash
git add index.html
git commit -m "chore(share): rigenera index.html (condivisione + copia)"
```

---

## Note di esecuzione
- I Task 3–6 toccano lo stesso file (`index.template.html`) in punti diversi: eseguirli in ordine (3 espone `window.__cloud`, da cui dipendono 4/5/6).
- Preferire esecuzione **inline** per i task sul template (rischio corruzione smart-quotes con riscritture automatiche — nota in `PROGRESSI_CONSULENZA_WEB.md`).
- `share_token` è invisibile all'utente: nessuna copia/localizzazione da rivedere.
