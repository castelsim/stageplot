# Consulenza — Output documentale (channel list nel PDF) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riattivare il modulo channel list solo per il consulente (modalità editor `?view=`) e includerlo nell'export PDF, così il consulente consegna un pacchetto stage plot + channel list.

**Architecture:** Un unico flag `window.__consultMode` (impostato in `startSession` quando l'utente è l'admin editor) sblocca tre comportamenti già presenti ma disattivati: preservare `inputs`/`outputs`, mostrare il pannello/pulsante channel list, aggiungere la pagina channel list al PDF. Più una classe `consult-editor` sul `<body>` per ripulire la UI dai comandi non pertinenti. Solo frontend, nessun backend.

**Tech Stack:** HTML/CSS/JS single-file (`index.template.html` + `src/styles.css`), build `node build.mjs`. jsPDF+svg2pdf self-hosted (lazy). Deploy GitHub Pages da `main`.

## Global Constraints

- Si modifica **`index.template.html`** e **`src/styles.css`**, MAI `index.html` a mano; dopo ogni modifica `node build.mjs`; prima del commit `node build.mjs --check` deve passare (copiato da `AGENTS.md`).
- Nessun test runner JS per il frontend: la verifica è `node build.mjs --check` + verifica runtime nel browser su `http://localhost:8765` (server: `python3 -m http.server 8765 --bind 127.0.0.1` dalla root del repo).
- La modalità editor è `?view=` come admin id `4b899cba-3cc2-4b26-9ef0-c3e915929277` (costante `ADMIN_ID` già nel file). Nei test si forza `window.__consultMode` via console invece di autenticarsi come admin.
- Non toccare la vista del cliente (`viewmode`). Il tool free deve restare identico (regressione zero: senza `__consultMode`, canali azzerati e PDF solo stage plot).
- Commit convenzionali; push solo con OK utente.

---

### Task 1: Gate `__consultMode` e persistenza della channel list

**Files:**
- Modify: `index.template.html` — `startSession` (~riga 6607) e `normalizeState` (~riga 1960)

**Interfaces:**
- Produce: `window.__consultMode` (boolean) — letto da Task 3 (PDF) e dal CSS/gate di Task 2. `true` solo nella sessione editor consulenza.

- [ ] **Step 1: Impostare il flag e la classe in `startSession`**

In `index.template.html`, in `startSession`, subito dopo la riga `if(!isEditor){ document.body.classList.add("viewmode"); }` e PRIMA di `importProject(...)`, inserire:

```javascript
    if(isEditor){ window.__consultMode=true; document.body.classList.add("consult-editor"); }
```

(Deve stare prima di `importProject` perché quest'ultimo chiama `normalizeState`, che legge il flag.)

- [ ] **Step 2: Preservare inputs/outputs in `normalizeState`**

In `normalizeState`, sostituire la riga:

```javascript
  s.inputs=[]; s.outputs=[];   /* channel list rimossa dalla versione free (modulo input patch/monitor riservato alle consulenze) */
```

con:

```javascript
  if(!window.__consultMode){ s.inputs=[]; s.outputs=[]; }   /* channel list riservata alla consulenza: preservata solo in modalità editor (audit/roadmap 1B) */
```

- [ ] **Step 3: Build**

Run: `node build.mjs && node build.mjs --check`
Expected: `✓ index.html generato dai sorgenti.` e `✓ index.html allineato ai sorgenti.`

- [ ] **Step 4: Verifica runtime (persistenza con flag ON, azzeramento con flag OFF)**

Avviare `python3 -m http.server 8765 --bind 127.0.0.1` e nel browser su `http://localhost:8765/` eseguire in console:

```javascript
// flag OFF (tool free): i canali si azzerano
window.__consultMode=false;
importProject(JSON.stringify({stage:{w:1200,d:800},items:[],inputs:[{src:"Kick",mic:"D6"}],outputs:[]}));
var off = state.inputs.length; // atteso 0
// flag ON (consulenza): i canali si preservano
window.__consultMode=true;
importProject(JSON.stringify({stage:{w:1200,d:800},items:[],inputs:[{src:"Kick",mic:"D6"}],outputs:[]}));
var on = state.inputs.length; // atteso 1
({off:off, on:on});
```

Expected: `{off:0, on:1}`.

- [ ] **Step 5: Commit**

```bash
node build.mjs
git add index.template.html index.html
git commit -m "feat(consulenza): gate __consultMode preserva la channel list in editor (1B)"
```

---

### Task 2: Pulsante Channel list e UI editor ottimizzata

**Files:**
- Modify: `index.template.html` — header (~riga 209, dentro il `<div style="display:flex;gap:4px">`) e wiring listener (~riga 3878, dopo `bFit`)
- Modify: `src/styles.css` — nuove regole `.consult-editor` (dopo il blocco `body.viewmode`, ~riga 561)

**Interfaces:**
- Consumes: `window.__consultMode` + classe `consult-editor` (Task 1); `toggleChan()` (già esistente, ~riga 3803).
- Produce: pulsante `#bChanList` visibile solo in `consult-editor`.

- [ ] **Step 1: Aggiungere il pulsante nell'header**

In `index.template.html`, dentro il `<div style="display:flex;gap:4px">` (dove ci sono `#bHdrPdf` e `#bHdrImport`), inserire come PRIMO figlio, prima di `#bHdrPdf`:

```html
    <button class="btn" id="bChanList" title="Channel list (input patch / monitor) — consulenza"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/><rect x="3.5" y="7" width="5" height="3.2" rx="1.6" fill="currentColor" stroke="none"/><rect x="9.5" y="12.3" width="5" height="3.2" rx="1.6" fill="currentColor" stroke="none"/><rect x="15.5" y="9" width="5" height="3.2" rx="1.6" fill="currentColor" stroke="none"/></svg>Channel list</button>
```

- [ ] **Step 2: Collegare il pulsante a `toggleChan`**

In `index.template.html`, subito dopo la riga `document.getElementById("bFit").addEventListener("click", fit);`, aggiungere:

```javascript
(function(){ var b=document.getElementById("bChanList"); if(b) b.addEventListener("click", toggleChan); })();
```

- [ ] **Step 3: CSS — mostrare il pulsante solo in consulenza e nascondere i comandi consumer**

In `src/styles.css`, dopo il blocco `body.livesession:not(.viewmode) #viewBar { ... }` (~riga 561), aggiungere:

```css
/* Editor consulenza (1B): il pulsante Channel list è riservato al consulente */
#bChanList { display: none; }
body.consult-editor #bChanList { display: inline-flex; align-items: center; gap: 6px; }
/* La schermata del consulente è un ambiente di lavoro: via i comandi "consumer" */
body.consult-editor #bLearn,
body.consult-editor #bCloud,
body.consult-editor #bConsulenza,
body.consult-editor #bHdrImport,
body.consult-editor #fbTrigger { display: none !important; }
```

- [ ] **Step 4: Build**

Run: `node build.mjs && node build.mjs --check`
Expected: entrambe le righe `✓`.

- [ ] **Step 5: Verifica runtime**

Su `http://localhost:8765/` in console:

```javascript
document.body.classList.add("consult-editor"); window.__consultMode=true;
var b=document.getElementById("bChanList");
var visibile = !!(b && b.offsetParent);                 // atteso true
var consumerNascosti = ["bLearn","bCloud","bConsulenza","bHdrImport","fbTrigger"]
  .every(function(id){ var e=document.getElementById(id); return !e || e.offsetParent===null; }); // atteso true
b.click();                                              // apre il pannello channel list
var pannello = document.body.classList.contains("chan-edit"); // atteso true
({visibile:visibile, consumerNascosti:consumerNascosti, pannello:pannello});
```

Expected: `{visibile:true, consumerNascosti:true, pannello:true}`. Fare anche uno screenshot per conferma visiva (header ripulito, pulsante con icona fader).

- [ ] **Step 6: Verifica regressione tool free**

Ricaricare `http://localhost:8765/` (senza toccare nulla) e in console:

```javascript
var b=document.getElementById("bChanList");
({bottoneNascosto: !b || b.offsetParent===null, consultMode: !!window.__consultMode}); // atteso {bottoneNascosto:true, consultMode:false}
```

Expected: `{bottoneNascosto:true, consultMode:false}` (nel tool free il pulsante non c'è).

- [ ] **Step 7: Commit**

```bash
node build.mjs
git add index.template.html index.html src/styles.css
git commit -m "feat(consulenza): pulsante Channel list (icona fader) + UI editor ripulita (1B)"
```

---

### Task 3: Pagina channel list nell'export PDF

**Files:**
- Modify: `index.template.html` — `buildPdfDoc` (~riga 6289, il commento `/* PAG 2 channel list rimossa dalla versione free */`)

**Interfaces:**
- Consumes: `window.__consultMode` (Task 1); `pdfChannelPage(doc, L, paperKey)` (già esistente, ~riga 6425); variabili locali `doc`, `L`, `paperKey`, `state.inputs`, `state.outputs`.

- [ ] **Step 1: Riattivare la pagina channel list**

In `buildPdfDoc`, sostituire la riga:

```javascript
    /* PAG 2 channel list rimossa dalla versione free */
```

con:

```javascript
    /* PAG 2+ channel list: solo in consulenza e se ci sono canali (audit/roadmap 1B) */
    if(window.__consultMode && (state.inputs.length || state.outputs.length)){
      doc.addPage(paperKey, L.orient);
      pdfChannelPage(doc, L, paperKey);
    }
```

- [ ] **Step 2: Build**

Run: `node build.mjs && node build.mjs --check`
Expected: entrambe le righe `✓`.

- [ ] **Step 3: Verifica runtime (PDF con canali → pagine channel list)**

Su `http://localhost:8765/` in console:

```javascript
window.__consultMode=true;
state.inputs=[{src:"Kick",mic:"Beta91",stand:"—",p48:false,notes:""},{src:"Voce",mic:"SM58",stand:"tall",p48:false,notes:"lead"}];
state.outputs=[{src:"Mon 1",mic:"wedge",stand:"",p48:false,notes:"cantante"}];
buildPdfDoc("a4", 100, "l", "").then(function(doc){ window.__testPages=doc.getNumberOfPages(); console.log("pagine:", window.__testPages); });
```

Attendere ~1s, poi:

```javascript
window.__testPages;   // atteso >= 2 (stage plot + channel list)
```

Expected: `>= 2`.

- [ ] **Step 4: Verifica regressione (senza consulenza il PDF resta 1 pagina)**

Ricaricare la pagina e in console:

```javascript
buildPdfDoc("a4", 100, "l", "").then(function(doc){ console.log("pagine free:", doc.getNumberOfPages()); });
```

Expected: `pagine free: 1` (stage plot solo; `__consultMode` è false, i canali sono azzerati).

- [ ] **Step 5: Verifica end-to-end via UI (opzionale ma consigliata)**

Ricaricare, in console forzare `window.__consultMode=true; document.body.classList.add("consult-editor")`, popolare la channel list col pulsante e `Auto`, poi Salva/Esporta → Salva PDF e confermare che il PDF scaricato contenga la pagina "— Channel list" con INPUT PATCH / MONITOR.

- [ ] **Step 6: Commit**

```bash
node build.mjs
git add index.template.html index.html
git commit -m "feat(consulenza): pagina channel list nel PDF in modalità consulenza (1B)"
```

---

## Self-Review

**Spec coverage:**
- Gate `__consultMode` → Task 1. ✓
- Preservare channel list → Task 1 (normalizeState). ✓
- UI editor ottimizzata (nascondere consumer) → Task 2 (CSS). ✓
- Pulsante Channel list (icona fader) → Task 2. ✓
- Output PDF unico con channel list → Task 3. ✓
- Realtime/viewer invariati → nessuna modifica (verificato: viewer non ha `__consultMode`). ✓
- Regressione zero tool free → Task 2 Step 6, Task 3 Step 4. ✓

**Placeholder scan:** nessun TBD/TODO; ogni step ha codice completo e comandi con output atteso.

**Type consistency:** `window.__consultMode` (boolean) usato coerentemente in Task 1/2/3; classe `consult-editor` coerente tra startSession (Task 1) e CSS (Task 2); `toggleChan`, `pdfChannelPage`, `buildPdfDoc` sono firme esistenti verificate nel codice.

## Rischi / note

- `buildPdfDoc` chiama `loadJsPDF()` (lazy, audit P1): il PDF di test si risolve dopo il caricamento di `/vendor/pdf.min.js` — per questo i test usano `.then()`.
- Se il cliente riapre il progetto nel tool free e risalva, i canali nel `data` si azzerano (deliverable è il PDF già inviato). Accettato.
