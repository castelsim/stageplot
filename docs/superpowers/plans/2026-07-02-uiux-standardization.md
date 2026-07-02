# UI/UX Standardization A′ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Header desktop con menu File + chip stato + Condividi primary, autosave online (V2), menu "?" con feedback, mobile con bottom dock a 4 tasti e menu a un livello — senza regressioni su tool free e consulenza.

**Architecture:** Tutto vive in `index.template.html` (single-file, ~7600 righe) + `src/styles.css`, build con `node build.mjs` (genera `index.html` — MAI editarlo a mano). I bottoni esistenti con handler già bindati diventano **proxy nascosti** (pattern già usato da `#mActions`: `proxy(id)` → `.click()`); i menu nuovi cliccano i proxy. L'autosave cloud riusa `window.__cloud.save` (upsert su `currentId`).

**Tech Stack:** Vanilla JS ES5-style (coerente col file), CSS custom properties (token DS), Supabase JS (già self-hosted), GitHub Pages.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-uiux-standardization-design.md`. Design system: `STAGEPLOT_DESIGN_SYSTEM.md` (token only, zero hex grezzi nuovi).
- Editare SOLO `index.template.html` e `src/styles.css`; poi `node build.mjs` e committare template+index.html+styles insieme.
- Naming UI (verbatim): "Nuovo", "Apri file…", "I miei progetti", "Rinomina", "Crea una copia", "Scarica file progetto", "Esporta PDF…", "Esporta PNG", "Salva versione", "Versioni…", "Condividi…", "Cos'è uno stage plot — guida", "Cosa manca? Scrivici".
- Icone: SVG inline geometria Lucide, `stroke-width:1.8`, linecap/linejoin round (stesse dell'header attuale).
- Regressione zero: consulenza (`?view=`, gate `consult-editor`/`consult-viewer`), `__consultMode`, viewmode.
- Test runtime: server `python3 -m http.server 8765` dalla root + browser su `http://localhost:8765`; non c'è test runner JS.
- Commit frequenti (uno per task), messaggio `feat(uiux): …`, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Header desktop A′ (markup + CSS, proxy preservati)

**Files:**
- Modify: `index.template.html:181-222` (header), `:184-185` (titolo/luogo), `:534-538` (footer), `:336` circa (pannello Evento — aggiunta campo luogo)
- Modify: `src/styles.css` (classi nuove dopo il blocco `.btn` ~riga 88; gate consulenza 571-577)

**Interfaces:**
- Produces: id nuovi `#fileBtn`, `#helpBtn`, `#accountBtn`, `#docState` (chip); proxy nascosti invariati: `#bLearn`, `#bCloud`, `#bHdrPdf`, `#bHdrImport`, `#bShare`, `#bNew`, `#bPdf`, `#saveJson`, `#importJson`, `#fbTrigger`. Classe CSS `.btn.tint`, `.hdr-name`, `.doc-chip*`, `.hdrmenu` (contenitore dropdown, usato in Task 2).

- [ ] **Step 1: riscrivere il blocco header**

In `index.template.html`, sostituire le righe 181-222 (`<header>…</header>`) con (i proxy in fondo restano; gli SVG di tema/undo/redo/adatta/griglia sono IDENTICI agli attuali — copiarli dalle righe correnti 192-206):

```html
<header>
  <h1 class="brand">STAGE PLOT<span class="sr-only"> — crea stage plot in scala online e gratis · channel list e rider tecnico su consulenza</span></h1>
  <button class="btn ghost" id="fileBtn" aria-haspopup="menu" aria-expanded="false">File <span class="chev">▾</span></button>
  <span class="tbdiv"></span>
  <input type="text" id="titolo" class="hdr-name" placeholder="Senza titolo" title="Nome del progetto (e oggetto della mail in condivisione)">
  <span class="doc-chip" id="docState" role="status" hidden></span>
  <button class="btn" id="bStageShape" hidden>▦ Palco</button>
  <span style="flex:1"></span>
  <button class="tbar-ico" id="helpBtn" title="Guida e feedback" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2a3 3 0 0 1 5.6 1c0 2-2.8 2.5-2.8 3.5"/><path d="M12 17h.01"/></svg></button>
  [bTheme, bUndo, bRedo INVARIATI — righe attuali 192-194]
  [bFit INVARIATO — riga 195] [snapwrap INVARIATO — righe 196-206]
  <span class="tbdiv"></span>
  <div style="display:flex;gap:8px;align-items:center">
    <button class="btn" id="bChanList" title="Channel list (input patch / monitor) — consulenza">[SVG fader INVARIATO — riga 209]Channel list</button>
    <a class="btn tint" id="bConsulenza" href="/consulenza/" target="_blank" rel="noopener" title="Consulenza tecnica: un sound engineer revisiona e valida il tuo stage plot">Consulenza</a>
    <button class="btn primary" id="bShareHdr" title="Condividi con un link (contiene anche Scarica PDF)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Condividi</button>
    <button class="avatar-btn" id="accountBtn" title="Account">Accedi</button>
  </div>
  <input type="number" id="stW" hidden><input type="number" id="stD" hidden>
  <!-- proxy nascosti: handler già bindati per id; i menu (Task 2) li cliccano -->
  <button id="bLearn" hidden></button>
  <button id="bCloud" hidden></button>
  <button id="bHdrPdf" hidden></button>
  <button id="bHdrImport" hidden></button>
  <button class="btn btn-icon" id="bVenue" hidden>🗺</button>
  <button id="bPdf" hidden></button>
  <button id="bAi" hidden style="display:none"></button>
  <button id="bShare" hidden></button>
  <button id="bNew" hidden></button>
</header>
```

Nota: `#luogo` sparisce dall'header → aggiungerlo nel pannello Evento (`#eventoSec`, vicino agli altri campi evento, cercare `id="eventoSec"`): `<label style="display:block;margin-top:8px;font-size:12px">Luogo<input type="text" id="luogo" placeholder="Luogo dell'evento" style="width:100%;margin-top:3px"></label>` — stesso id, gli handler esistenti continuano a funzionare. `#bShareHdr` è NUOVO (il proxy `#bShare` resta): bind in Step 3.

- [ ] **Step 2: footer senza savedInfo**

Riga ~536: eliminare l'intero `<span id="savedInfo">…</span>` (il credito "Designed and built by" resta).

- [ ] **Step 3: bind di #bShareHdr e #accountBtn**

Vicino al bind esistente `document.getElementById("bShare").addEventListener("click", openShare);` (riga ~5796) aggiungere:

```js
(function(){ var b=document.getElementById("bShareHdr"); if(b) b.addEventListener("click", openShare); })();
(function(){ var a=document.getElementById("accountBtn"); if(a) a.addEventListener("click", function(){ document.getElementById("bCloud").click(); }); })();
```

- [ ] **Step 4: CSS nuove classi + gate consulenza**

In `src/styles.css`, dopo il blocco `.btn.danger-solid` (~riga 88) aggiungere:

```css
  /* ===== Header A′ (UI/UX standardization 02/07) ===== */
  .btn.ghost{background:transparent}
  .btn.ghost:hover{background:var(--n-100)}
  body.dark .btn.ghost{background:transparent}
  body.dark .btn.ghost:hover{background:#222b38}
  .btn .chev{color:var(--text-3);font-size:10px}
  .btn.tint{background:var(--accent-tint);color:var(--accent-strong)}
  .btn.tint:hover{background:#d7edf1}
  body.dark .btn.tint{background:#13202a;color:#5eb8c7}
  body.dark .btn.tint:hover{background:#17262f}
  .hdr-name{border:1px solid transparent;border-radius:8px;padding:6px 9px;font-size:14px;font-weight:600;
    color:var(--text);background:transparent;width:200px;min-width:90px}
  .hdr-name:hover{border-color:var(--border)}
  .hdr-name:focus{outline:none;border-color:var(--accent)}
  .hdr-name::placeholder{color:var(--text-3);font-weight:400}
  .avatar-btn{width:auto;min-width:32px;height:30px;border:1px solid var(--border);border-radius:999px;
    background:var(--n-100);color:var(--text);font:600 12px var(--font-ui);padding:0 10px;cursor:pointer;flex:0 0 auto}
  .avatar-btn.logged{width:30px;padding:0;background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700}
  body.dark .avatar-btn{background:#222b38;border-color:#2b3445;color:#e5e7eb}
  body.dark .avatar-btn.logged{background:var(--accent);border-color:var(--accent);color:#fff}
  .doc-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;border-radius:999px;
    padding:3px 9px;white-space:nowrap;border:1px solid var(--border);color:var(--text-2);background:var(--surface-raised);flex:0 0 auto;cursor:default}
  .doc-chip svg{width:12px;height:12px}
  .doc-chip.on{color:var(--success);background:var(--success-bg);border-color:var(--success-border)}
  body.dark .doc-chip.on{color:#4ade80;background:#0f2d1a;border-color:#166534}
  .doc-chip.warn{color:var(--warning);background:var(--warning-bg);border-color:var(--warning-border);cursor:pointer}
  body.dark .doc-chip.warn{color:#fbbf24;background:rgba(245,158,11,.10);border-color:rgba(245,158,11,.30)}
  body.dark .doc-chip{background:#222b38;border-color:#2b3445;color:#94a3b8}
```

Sostituire il gate consulenza (righe 573-577) con:

```css
  body.consult-editor #fileBtn,
  body.consult-editor #helpBtn,
  body.consult-editor #bConsulenza,
  body.consult-editor #bShareHdr,
  body.consult-editor #accountBtn,
  body.consult-editor #docState { display: none !important; }
```

- [ ] **Step 5: build + verifica statica**

Run: `node build.mjs` → Expected: exit 0, `index.html` rigenerato.
Run: `grep -c 'id="bCloud"\|id="bHdrPdf"\|id="bHdrImport"\|id="bLearn"\|id="bShare"\|id="bNew"' index.html` → Expected: tutti presenti (proxy vivi).

- [ ] **Step 6: verifica runtime**

Server: `python3 -m http.server 8765` dalla root. Browser su `http://localhost:8765`: header mostra brand/File/nome/…/Consulenza tint/Condividi primary/Accedi; console senza errori (`bLearnM`, `mMenuBtn` ecc. ancora bindabili); undo/redo/tema/adatta/griglia funzionano; titolo scrivibile.

- [ ] **Step 7: commit**

```bash
git add index.template.html index.html src/styles.css
git commit -m "feat(uiux): header desktop A' — File/nome/chip + Condividi primary, proxy preservati"
```

---

### Task 2: Menu File + menu "?" + ⌘S + Esporta-dialog cleanup

**Files:**
- Modify: `index.template.html` (markup menu subito dopo `</header>`; JS vicino ai bind header ~5796; keydown ~3958; framePanel 494-496)
- Modify: `src/styles.css` (stili `.hdrmenu`)

**Interfaces:**
- Consumes: proxy Task 1; `saveVersion(name)` (esistente, ~5285), `toggleVersionEdit()` (5315), `openShare()` (5780), `window.__cloud.setCurrentId/user/save`.
- Produces: `bindMenu(btnId,menuId)` helper; `fileSaveVersion()`; `fileMakeCopy()`; `flushCloudAutosave()` è definita in Task 3 — qui chiamarla SOLO se esiste (`if(window.flushCloudAutosave) flushCloudAutosave();`).

- [ ] **Step 1: markup dei due menu** (dopo `</header>`)

```html
<div class="hdrmenu" id="fileMenu" hidden role="menu">
  <button class="mi" data-file="new">＋ Nuovo</button>
  <button class="mi" data-file="open">📂 Apri file…</button>
  <button class="mi" data-file="projects">☁ I miei progetti</button>
  <hr>
  <button class="mi" data-file="rename">✎ Rinomina</button>
  <button class="mi" data-file="copy">⧉ Crea una copia</button>
  <button class="mi" data-file="download">⬇ Scarica file progetto</button>
  <hr>
  <button class="mi" data-file="pdf">📄 Esporta PDF…</button>
  <button class="mi" data-file="png">🖼 Esporta PNG</button>
  <hr>
  <button class="mi" data-file="version">🕘 Salva versione <span class="kbd">⌘S</span></button>
  <button class="mi" data-file="versions">🗂 Versioni…</button>
  <button class="mi" data-file="share">🔗 Condividi…</button>
</div>
<div class="hdrmenu" id="helpMenu" hidden role="menu">
  <button class="mi" data-help="learn">📖 Cos'è uno stage plot — guida</button>
  <button class="mi" data-help="feedback">💬 Cosa manca? Scrivici</button>
</div>
```

(Le emoji sono segnaposto SOLO se il tempo stringe — versione finale: sostituirle con gli stessi SVG Lucide 16px usati nei mockup `varianti-a.html`, copiandoli 1:1.)

- [ ] **Step 2: CSS `.hdrmenu`** (in styles.css, sotto le classi del Task 1)

```css
  .hdrmenu{position:fixed;z-index:60;min-width:236px;background:var(--surface);border:1px solid var(--border);
    border-radius:var(--r-md);box-shadow:var(--elev-2);padding:5px}
  .hdrmenu .mi{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:none;background:none;
    padding:7px 10px;border-radius:var(--r-sm);font:500 13px var(--font-ui);color:var(--text);cursor:pointer}
  .hdrmenu .mi:hover{background:var(--accent-tint)}
  body.dark .hdrmenu .mi:hover{background:#222b38}
  .hdrmenu .mi .kbd{margin-left:auto;color:var(--text-3);font:11px var(--font-mono)}
  .hdrmenu hr{border:0;border-top:1px solid var(--border);margin:5px 4px}
```

- [ ] **Step 3: JS — bindMenu + azioni** (vicino ai bind header, ~5796)

```js
/* ===== Menu File / "?" (UI/UX A′) ===== */
function bindMenu(btnId, menuId){
  var b=document.getElementById(btnId), m=document.getElementById(menuId);
  if(!b||!m) return;
  function close(){ m.hidden=true; b.setAttribute("aria-expanded","false"); }
  function open(){
    document.querySelectorAll(".hdrmenu").forEach(function(x){ x.hidden=true; });
    var r=b.getBoundingClientRect();
    m.style.top=(r.bottom+4)+"px";
    m.style.left=Math.min(r.left, window.innerWidth-m.offsetWidth-8)+"px";
    m.hidden=false; b.setAttribute("aria-expanded","true");
    if(m.style.left==="0px"||parseFloat(m.style.left)<0) m.style.left="8px";
  }
  b.addEventListener("click", function(e){ e.stopPropagation(); if(m.hidden) open(); else close(); });
  document.addEventListener("click", function(e){ if(!m.hidden && !m.contains(e.target)) close(); });
  document.addEventListener("keydown", function(e){ if(e.key==="Escape") close(); });
  m.addEventListener("click", function(){ setTimeout(close,0); });
}
function proxyClick(id){ var el=document.getElementById(id); if(el) el.click(); }
function fileSaveVersion(){
  var d=new Date();
  saveVersion("Versione "+d.getDate()+"/"+(d.getMonth()+1)+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"));
  if(window.flushCloudAutosave) window.flushCloudAutosave();
}
function fileMakeCopy(){
  var C=window.__cloud;
  if(!(C&&C.user())){ proxyClick("bCloud"); return; }   /* copia = concetto cloud: prima accedi */
  C.setCurrentId(null);
  state.titolo=(state.titolo||"Senza titolo")+" — copia";
  setEventInputs(); save();
  if(window.flushCloudAutosave) window.flushCloudAutosave();
}
bindMenu("fileBtn","fileMenu"); bindMenu("helpBtn","helpMenu");
(function(){
  var acts={ "new":function(){proxyClick("bNew");}, "open":function(){proxyClick("bHdrImport");},
    "projects":function(){proxyClick("bCloud");}, "rename":function(){var t=document.getElementById("titolo"); t.focus(); t.select();},
    "copy":fileMakeCopy, "download":function(){proxyClick("saveJson");}, "pdf":function(){proxyClick("bHdrPdf");},
    "png":function(){proxyClick("frameSavePng");}, "version":fileSaveVersion,
    "versions":function(){toggleVersionEdit();}, "share":function(){openShare();} };
  document.querySelectorAll("#fileMenu .mi").forEach(function(x){ x.addEventListener("click", function(){ var f=acts[x.getAttribute("data-file")]; if(f) f(); }); });
  document.querySelectorAll("#helpMenu .mi").forEach(function(x){ x.addEventListener("click", function(){
    var a=x.getAttribute("data-help");
    if(a==="learn") proxyClick("bLearn");
    else if(a==="feedback"){ if(typeof window.openFeedbackBox==="function") window.openFeedbackBox(); else proxyClick("fbTrigger"); }
  }); });
})();
```

- [ ] **Step 4: ⌘S** — nel keydown globale (~3958, accanto a ⌘Z) aggiungere PRIMA dei rami esistenti:

```js
  if((e.metaKey||e.ctrlKey) && (e.key==="s"||e.key==="S")){ e.preventDefault(); if(!document.body.classList.contains("viewmode")) fileSaveVersion(); return; }
```

- [ ] **Step 5: rimuovere "Salva progetto" dal dialog Esporta**

In `#framePanel` (riga ~496) eliminare il bottone `#frameSaveJson` e il suo bind JS (`document.getElementById("frameSaveJson")…` riga ~5805). Il download vive in File → Scarica file progetto (proxy `#saveJson`, che resta).

- [ ] **Step 6: build + runtime**

`node build.mjs` → exit 0. Browser: File si apre/chiude (click fuori, Esc); ogni voce fa la sua azione (Nuovo→confirm, Apri→picker, I miei progetti→modal, Rinomina→focus, Scarica→download .json, Esporta PDF→dialog senza più voce Salva, PNG→download, Versioni→pannello versioni FINALMENTE apribile, Condividi→modal); "?"→guida e feedback; ⌘S→toast/aggiornamento versioni.

- [ ] **Step 7: commit**

```bash
git add index.template.html index.html src/styles.css
git commit -m "feat(uiux): menu File e menu '?' (guida+feedback), Cmd+S salva versione"
```

---

### Task 3: Chip stato + autosave online (V2) + modale cloud semplificata

**Files:**
- Modify: `index.template.html` — `save()`/`saveSoon()` (1894-1907), modulo cloud (saveProject ~7100, export 7203, render modale 7000-7040, onAuthStateChange — cercarlo con `grep -n "onAuthStateChange" index.template.html`)

**Interfaces:**
- Consumes: `#docState` (Task 1), `window.__cloud.{user,currentId,setCurrentId,save}`.
- Produces: `window.setDocState(mode)` con mode ∈ `"local" | "saving" | "online" | "offline-warn" | "error"`; `window.scheduleCloudAutosave()`; `window.flushCloudAutosave()`; `saveProject(onSaved, silent)` (param nuovo).

- [ ] **Step 1: stato documento + scheduler** (subito dopo `saveSoon`, ~1907)

```js
/* ===== Stato documento + autosave online (V2, modello Docs) ===== */
var CHIP_SVG={
  ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 .3-9 6 6 0 0 0-11.6 1.6A4 4 0 0 0 6.5 19z"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>'
};
function setDocState(mode){
  var el=document.getElementById("docState"), elM=document.getElementById("docStateM");
  var cls="doc-chip", html="";
  if(mode==="online"){ cls+=" on"; var d=new Date(); html=CHIP_SVG.cloud+"Salvato online · "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
  else if(mode==="saving"){ html="Salvataggio…"; }
  else if(mode==="offline-warn"){ cls+=" warn"; html=CHIP_SVG.warn+"Solo su questo dispositivo — Accedi"; }
  else if(mode==="error"){ cls+=" warn"; html=CHIP_SVG.warn+"Non salvato online — riprovo"; }
  else { html=CHIP_SVG.ok+"Salvato sul dispositivo"; }
  [el,elM].forEach(function(c){ if(!c) return; c.className=cls+(c.id==="docStateM"?" doc-chip-m":""); c.innerHTML=html; c.hidden=false; });
}
window.setDocState=setDocState;
var _cloudAsT=null;
function cloudAutosaveNow(){
  var C=window.__cloud;
  if(!C || !C.user()) { setDocState("offline-warn"); return; }
  setDocState("saving");
  C.save(function(id){ setDocState(id ? "online" : "error"); }, true);
}
function scheduleCloudAutosave(){
  if(window.__consultMode || document.body.classList.contains("viewmode")) return;  /* consulenza ha il suo autosave */
  var C=window.__cloud;
  if(!C || !C.user()){ setDocState("offline-warn"); return; }
  clearTimeout(_cloudAsT); _cloudAsT=setTimeout(cloudAutosaveNow, 10000);
}
function flushCloudAutosave(){ clearTimeout(_cloudAsT); cloudAutosaveNow(); }
window.scheduleCloudAutosave=scheduleCloudAutosave; window.flushCloudAutosave=flushCloudAutosave;
```

Poi dentro `save()` e `saveSoon()` (dopo il `localStorage.setItem`) aggiungere UNA riga: `if(window.scheduleCloudAutosave) scheduleCloudAutosave();`

Nota chip cliccabile: `document.getElementById("docState").addEventListener("click", function(){ if(this.classList.contains("warn")) document.getElementById("bCloud").click(); });` — aggiungerlo insieme al blocco sopra (nel bootstrap UI, dove il DOM è pronto).

- [ ] **Step 2: `saveProject` silenzioso**

Nel modulo cloud: `function saveProject(onSaved)` → `function saveProject(onSaved, silent)`; ogni `toast(…)` di quel flusso va condizionato: `if(!silent) toast(…)`. L'export `save: saveProject` resta invariato (il secondo parametro passa attraverso).

- [ ] **Step 3: avatar + stato iniziale su auth**

Trovare `onAuthStateChange` (grep). Nel callback (dove il modulo aggiorna il proprio stato utente) aggiungere:

```js
      if(window.renderAccountBtn) window.renderAccountBtn();
```

E definire, vicino a `setDocState`:

```js
function renderAccountBtn(){
  var b=document.getElementById("accountBtn"); if(!b) return;
  var C=window.__cloud, u=C&&C.user();
  if(u){ var em=(u.email||"?"); b.textContent=em.slice(0,2).toUpperCase(); b.classList.add("logged"); b.title=em; }
  else { b.textContent="Accedi"; b.classList.remove("logged"); b.title="Accedi per salvare online"; }
  setDocState(u ? (C.currentId()?"online":"local") : "offline-warn");
}
window.renderAccountBtn=renderAccountBtn;
```

All'avvio (bootstrap, dopo il load): chiamare `renderAccountBtn()` una volta (fallback quando il modulo cloud non è ancora pronto: try/catch, default `setDocState("local")`).

- [ ] **Step 4: modale cloud senza "Salva online"**

Nel render della modale (riga ~7036): rimuovere il bottone `#cloudSave` e il suo listener. La modale loggata resta: intestazione utente + Esci + lista progetti (Apri/condividi/elimina) + link consulenza.

- [ ] **Step 5: build + runtime**

`node build.mjs`. Browser: da sloggato chip ambra "Solo su questo dispositivo — Accedi" (click → modal login); da loggato: modifica un elemento → dopo ~10s chip "Salvato online · HH:MM" e il progetto compare/si aggiorna in "I miei progetti" SENZA bottone Salva online; "Crea una copia" (File) crea un secondo record; nessun toast durante l'autosave (silent).

- [ ] **Step 6: commit**

```bash
git add index.template.html index.html src/styles.css
git commit -m "feat(uiux): chip stato documento + autosave online (V2) + avatar, cloud modal senza Salva"
```

---

### Task 4: Mobile A′ — dock 4 tasti, hub a scomparsa, menu a un livello

**Files:**
- Modify: `index.template.html` — `#mTop` (169-180), `#mBar` (229-234), `#mActions` (235-257), nuovo `#mDock` dopo `#mobBackdrop` (532), bind `mMenuBtn` (2925), `bLearnM` (cercare il suo listener con `grep -n "bLearnM" index.template.html`)
- Modify: `src/styles.css` — blocco mobile `@media (max-width:880px)` (399-421) + regole nuove

**Interfaces:**
- Consumes: `openDrawer("cat")` (3303), proxy (`bHdrPdf`,`bShare`,`bCloud`,`bNew`,`bHdrImport`,`bTheme`), `bindMenu` (Task 2), `#docStateM` (chip mobile), gate `body.m-has-sel|stage-edit|evento-edit|chan-edit` esistenti.
- Produces: `#mDock` con `data-dock` acts; `#mActions` trasformato in bottom-sheet `.msheet`.

- [ ] **Step 1: mTop — chip + history nella riga 2**

Riga 1: dopo `#mTitle` inserire `<span class="doc-chip doc-chip-m" id="docStateM" hidden></span>`; `#bLearnM` resta (diventa trigger del `helpMenu`); `#mMenuBtn` resta.
Riga 2 (`.mtop-r2`): in fondo aggiungere `<span style="flex:1"></span>` + spostarci DENTRO i tre bottoni di `#mBar` (`#mFit`, `#mUndo`, `#mRedo` — markup identico, solo ricollocato). Eliminare il contenitore `#mBar` da `#props`.

- [ ] **Step 2: dock** — dopo `<div id="mobBackdrop"></div>`:

```html
<nav id="mDock" aria-label="Azioni principali">
  <button data-dock="add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>Aggiungi</button>
  <button data-dock="export"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><path d="M12 15V3"/></svg>Esporta</button>
  <button data-dock="share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Condividi</button>
  <button data-dock="menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none"/></svg>Menu</button>
</nav>
```

- [ ] **Step 3: #mActions → sheet a un livello**

Spostare `#mActions` FUORI da `#props` (subito dopo `#mDock`) e sostituirne il contenuto:

```html
<div id="mActions">
  <div class="sh">Progetto</div>
  <div class="mact-grid">
    <button data-act="new" class="danger">Nuovo</button>
    <button data-act="import">Apri file</button>
    <button data-act="cloud">I miei progetti</button>
    <button data-act="download">Scarica file</button>
  </div>
  <div class="sh">Palco</div>
  <div class="mact-grid">
    <button data-act="palco">Palco</button>
    <button data-act="evento">Evento</button>
    <button data-act="venue">Planimetria</button>
    <button data-act="frame">Area stampa</button>
  </div>
  <div class="sh">App</div>
  <div class="mact-grid">
    <button data-act="theme">Tema chiaro/scuro</button>
    <button data-act="chan">Channel list</button>
  </div>
  <a href="/consulenza/" target="_blank" rel="noopener" class="mact-consul">Consulenza tecnica →</a>
</div>
```

Nel delegato esistente `#mActions button` (righe 3315-3332) aggiungere il ramo `else if(a==="download") proxyClick("saveJson");` e rimuovere i rami morti (`share`,`save`,`pdf`,`feedback`,`add` — l'add vive nel dock). Rimuovere il bind di `mMoreToggle` (non esiste più).

- [ ] **Step 4: bind dock + mMenuBtn + bLearnM**

```js
(function(){
  var dock=document.getElementById("mDock"); if(!dock) return;
  var sheet=document.getElementById("mActions"), bd=document.getElementById("mobBackdrop");
  function toggleSheet(on){ sheet.classList.toggle("open", on); bd.classList.toggle("show", on); }
  window.toggleMobileMenu=toggleSheet;
  bd.addEventListener("click", function(){ toggleSheet(false); });
  dock.querySelectorAll("button").forEach(function(b){
    b.addEventListener("click", function(){
      var a=b.getAttribute("data-dock");
      if(a==="add"){ toggleSheet(false); window.openDrawer("cat"); }
      else if(a==="export"){ toggleSheet(false); proxyClick("bHdrPdf"); }
      else if(a==="share"){ toggleSheet(false); proxyClick("bShare"); }
      else if(a==="menu"){ toggleSheet(!sheet.classList.contains("open")); }
    });
  });
  sheet.addEventListener("click", function(e){ if(e.target.closest("button,a")) setTimeout(function(){ toggleSheet(false); },0); });
})();
```

Rebind `mMenuBtn` (riga 2925): sostituire l'handler con `window.toggleMobileMenu ? toggleMobileMenu(true) : null` (stessa funzione del dock Menu). `bLearnM`: sostituire il suo listener con l'apertura del `helpMenu` (`bindMenu("bLearnM","helpMenu")` NON va bene — un menu, due trigger: aggiungere invece `document.getElementById("bLearnM").addEventListener("click", function(e){ e.stopPropagation(); document.getElementById("helpBtn").click(); })` dopo aver rimosso il listener precedente, oppure lasciare il vecchio comportamento che apre la guida e spostare il feedback SOLO nel dock-menu — NO: seguire la spec, "?"=menu su entrambe).

- [ ] **Step 5: CSS mobile**

Nel blocco `@media (max-width:880px)` (399-421):
- `main{position:fixed;top:86px;left:0;right:0;bottom:58px;…}` (era `bottom:46vh`).
- `#props{display:none}` di default; mostrarlo a 46vh SOLO con selezione/pannelli: `body.m-has-sel #props, body.stage-edit #props, body.evento-edit #props, body.chan-edit #props{display:block; position:fixed; …(regole attuali 406-407)… height:46vh}` e in quei casi `main{bottom:46vh}` (stesse classi sul `main`).
- Dock:

```css
    #mDock{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--surface);
      border-top:1px solid var(--border);padding-bottom:env(safe-area-inset-bottom,0)}
    #mDock button{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;border:none;background:none;
      padding:8px 0 9px;font:600 9.5px var(--font-ui);color:var(--text-2);min-height:52px;cursor:pointer}
    #mDock button svg{width:20px;height:20px}
    #mDock button:first-child{color:var(--accent)}
    body.dark #mDock{background:#161b24;border-top-color:#283142}
    body.dark #mDock button:first-child{color:var(--accent-bright)}
    body:has(#svg.dragging) #mDock{transform:translateY(120%);transition:transform 160ms var(--ease)}
    #mActions{position:fixed;left:0;right:0;bottom:0;z-index:60;background:var(--surface);border-radius:16px 16px 0 0;
      transform:translateY(103%);transition:transform .26s ease;box-shadow:0 -8px 30px rgba(0,0,0,.22);
      max-height:80vh;overflow-y:auto;padding:12px 14px calc(20px + env(safe-area-inset-bottom,0));display:block}
    #mActions.open{transform:none}
    #mActions .sh{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);padding:8px 2px 6px}
    .doc-chip-m{font-size:10px;padding:2px 7px}
    #fabCat,#fabProps{display:none!important}
    body.viewmode #mDock,body.viewmode #mActions{display:none!important}
```

Fuori dal media (regola globale): `#mDock,#mActions{display:none}` di default desktop — attenzione: `#mActions` ha già `display:none` fuori dal mobile (riga 355), mantenere la coerenza (il sheet vive solo ≤880px).

- [ ] **Step 6: build + runtime mobile**

`node build.mjs`. Browser: DevTools non disponibile via estensione → verificare con finestra ridotta se possibile, altrimenti `javascript_tool` forzando `window.innerWidth`? NO — usare Chrome vero: aprire `http://localhost:8765` e ridurre la finestra sotto 880px (se il window manager lo consente) o verificare via telefono. Minimo garantito: nessun errore console a 1440px; poi test manuale utente su telefono. Probes JS: `document.getElementById('mDock')!==null`, delegati bindati.

- [ ] **Step 7: commit**

```bash
git add index.template.html index.html src/styles.css
git commit -m "feat(uiux): mobile A' — dock 4 tasti, hub a scomparsa, menu un livello, history in mTop"
```

---

### Task 5: Regressione consulenza + viewmode

**Files:** nessuna modifica prevista (solo fix se emergono)

- [ ] **Step 1:** aprire `http://localhost:8765/?view={token}` da admin loggato (prendere un token condiviso da "I miei progetti" → icona link di un progetto). Verificare: viewBar presente, editor funziona, channel list nel gate, **autosave sessione** (Salva ora / broadcast) invariato, chip `#docState` nascosto (gate consult-editor), menu File nascosto.
- [ ] **Step 2:** stessa pagina in finestra anonima (viewer non loggato): viewmode read-only, toggle Stage plot/Channel list OK, dock mobile nascosto (`body.viewmode`).
- [ ] **Step 3:** tool free: giro completo di fumo (nuovo → aggiungi elementi → undo/redo → esporta PDF → condividi → apri file → versioni) in light e dark.
- [ ] **Step 4:** commit di eventuali fix `fix(uiux): regressioni consulenza/viewmode`.

---

### Task 6: Design system + bonifica

**Files:**
- Modify: `STAGEPLOT_DESIGN_SYSTEM.md` (header stato, §12, nuovo §24)
- Modify: `index.template.html` (hex grezzi modale cloud → token, dove non-Google)

- [ ] **Step 1:** DS header: `**Stato:** implementato · v1.1 · 2026-07-02` + nota changelog. §12: sostituire la riga "Azioni: Condividi/Esporta = secondary; Salva = unico Primary teal, sempre a destra" con "Azioni: **Condividi = unico Primary teal a destra**; Esporta/salvataggio vivono nel **menu File**; lo stato del documento è il **chip di stato** accanto al nome (autosave, §24)". Aggiungere §24 "File, stato documento e account" con: spec menu dropdown (misure/token della `.hdrmenu`), chip stati (5), avatar-btn, dock mobile (52px, 4 voci, auto-hide su drag), naming canonico.
- [ ] **Step 2:** bonifica: nella modale cloud sostituire `#17212f` (toast) → `var(--n-900)`, grigi generici → token; il bottone Google sign-in resta coi colori brand Google (eccezione documentata in §24).
- [ ] **Step 3:** `node build.mjs` + commit `docs(ds): design system v1.1 — File/chip/dock (§24), §12 aggiornato, bonifica token`.

---

### Task 7: E2E finale + documentazione

- [ ] **Step 1:** giro E2E completo (desktop light+dark; mobile reale o finestra <880px; consulenza admin+viewer; sloggato+loggato; ⌘S; File completo; termini/ live dopo push).
- [ ] **Step 2:** aggiornare `docs/UIUX_AUDIT_2026-07-02.md` (sezione 9: "implementato, commit …"), `docs/ROADMAP.md` se cita la UI, memoria (`stageplot_uiux_standardization.md`) e `STAGE PLOT/PROGRESSI_CONSULENZA_WEB.md`.
- [ ] **Step 3:** commit finale + (con OK dell'utente) push su main → verificare stageplot.it dopo il deploy Pages (incluso /termini/ 200).

## Self-review

- Spec coverage: §1 header→Task 1; §2 File→Task 2; §3 chip→Task 3; §4 autosave→Task 3; §5 mobile→Task 4; §6 consulenza→Task 5 (+gate CSS in Task 1); §7 DS→Task 6; §9 testing→Task 5/7. ✔
- "Rinomina"=focus sul nome (niente modale) — coerente con spec. "Crea una copia" richiede login (deviazione minima, motivata: copia è concetto cloud; unlogged→invito login). ✔
- Nomi coerenti tra task: `proxyClick`, `setDocState`, `scheduleCloudAutosave`, `flushCloudAutosave`, `bindMenu`, `toggleMobileMenu`, `#docState/#docStateM`, `#mDock`. ✔
