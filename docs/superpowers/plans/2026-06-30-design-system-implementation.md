# StagePlot Design System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tradurre `STAGEPLOT_DESIGN_SYSTEM.md` in `src/styles.css` introducendo un layer di token (CSS custom properties) e migrando il CSS esistente, con le elevazioni approvate (accent teal unico, "liberare il blu", bottoni a raggio 8, ecc.) — senza toccare gli oggetti del palco né la logica.

**Architecture:** Una sola superficie di lavoro: `src/styles.css`. Si aggiunge un blocco `:root` di token in cima, poi si migra il resto del foglio da hex grezzo a `var(--token)`, una famiglia alla volta. Il dark mode diventa una ridefinizione dei token sotto `body.dark`. Dopo ogni modifica ai sorgenti si rigenera il single-file con `node build.mjs` e si verifica con `node build.mjs --check`. La verifica funzionale è **build-check + confronto visivo** contro i mockup di riferimento (non esistono unit test nel progetto).

**Tech Stack:** HTML/CSS vanilla, single-file, build con `node build.mjs` (zero dipendenze). Nessun framework, nessun bundler, nessun web font.

## Global Constraints

- Modificare **solo** `src/styles.css`. Mai `index.html` a mano (è generato). [CERTO — AGENTS.md]
- Dopo ogni modifica ai sorgenti: `node build.mjs`. Prima di ogni commit di chiusura task: `node build.mjs --check` deve dare `✓`.
- **Nessun esadecimale grezzo** introdotto fuori dal blocco `:root` dei token. Solo `var(--token)`.
- **Non** modificare i disegni degli oggetti del palco (classi `.fWood`, `.fBrass`, `.fSkin`, sagome, ecc.) né la semantica canvas (`.mon`/`#2563eb` come monitor, `.pow`/`#dc2626`, `.tec`/`#b45309`). Si tocca solo dove `#2563eb` è **selezione/guida UI**.
- **Non** modificare logica/JS (`index.template.html`). Solo CSS.
- Lavorare sul branch `design-system` (dove vive già `STAGEPLOT_DESIGN_SYSTEM.md`). Commit liberi; **push solo con OK utente**.
- ⚠︎ Coordinamento: esiste il branch `fix/palette-palco-planimetria` che tocca la palette. **Non** lavorarci in parallelo (regola "un file → un ramo" su `styles.css`); integrarlo/chiuderlo prima o dopo, mai insieme.
- Valori dei token: copiare **verbatim** dalle sezioni §2.x di `STAGEPLOT_DESIGN_SYSTEM.md`.

---

### Task 1: Backup dello stato attuale (PRIMA di toccare il codice)

Requisito esplicito utente: un backup recuperabile in caso qualcosa vada storto. Doppia rete: tag git + tarball fisico fuori dalla repo.

**Files:**
- Nessun file di prodotto modificato (solo operazioni git + archivio esterno).

- [ ] **Step 1: Verificare di essere sul branch giusto e con working tree pulito**

Run:
```bash
git -C /Users/simonecastellan/COWORK/GITHUB/stageplot status --short
git -C /Users/simonecastellan/COWORK/GITHUB/stageplot branch --show-current
```
Expected: nessuna modifica pendente sui file di prodotto; branch `design-system`.

- [ ] **Step 2: Creare un tag git di backup sullo stato pubblicato (main)**

Run:
```bash
git -C /Users/simonecastellan/COWORK/GITHUB/stageplot tag -a backup/pre-design-system-2026-06-30 main \
  -m "Snapshot StagePlot prima dell'implementazione del design system"
git -C /Users/simonecastellan/COWORK/GITHUB/stageplot tag --list 'backup/*'
```
Expected: il tag compare nell'elenco. (Ripristino: `git checkout backup/pre-design-system-2026-06-30 -- src/styles.css index.template.html index.html`.)

- [ ] **Step 3: Creare un tarball fisico FUORI dalla repo (sopravvive a qualsiasi reset interno)**

Run:
```bash
git -C /Users/simonecastellan/COWORK/GITHUB/stageplot archive --format=tar.gz -o \
  /Users/simonecastellan/COWORK/GITHUB/_BACKUP_stageplot_pre-design-system_2026-06-30.tar.gz main
ls -lh /Users/simonecastellan/COWORK/GITHUB/_BACKUP_stageplot_pre-design-system_2026-06-30.tar.gz
```
Expected: file `.tar.gz` creato (alcuni MB).

- [ ] **Step 4: Verificare che il tarball sia integro e contenga i file chiave**

Run:
```bash
tar -tzf /Users/simonecastellan/COWORK/GITHUB/_BACKUP_stageplot_pre-design-system_2026-06-30.tar.gz \
  | grep -E '^(index.html|index.template.html|src/styles.css|build.mjs)$'
```
Expected: tutte e 4 le righe presenti. Backup confermato → si può procedere.

---

### Task 2: Layer di token (`:root`) — nessun cambiamento visivo

Si aggiunge il blocco token in cima a `src/styles.css`. I token non sono ancora consumati: il rendering resta identico. È il fondamento di tutto il resto.

**Files:**
- Modify: `src/styles.css` (inserire in cima, prima della riga 1 attuale `*{box-sizing...}`)

**Interfaces:**
- Produces: tutte le custom properties `--n-*`, `--accent*`, `--canvas-*`, feedback, superfici, `--t-*`, `--s-*`, `--r-*`, `--elev-*`, `--dur-*`, `--ease`, z-index — consumate dai task successivi. Nomi e valori **verbatim** da §2 del design system.

- [ ] **Step 1: Inserire il blocco `:root` in cima a `src/styles.css`**

Copiare i token da §2.1–2.12 del design system in un unico blocco `:root{ … }` come prima regola del file. Esempio (estratto, completare con TUTTI i token di §2):
```css
:root{
  /* neutri */
  --n-50:#f9fafb;--n-100:#f3f4f6;--n-200:#e5e7eb;--n-300:#d1d5db;--n-400:#9ca3af;
  --n-500:#6b7280;--n-600:#4b5563;--n-700:#374151;--n-800:#1f2937;--n-900:#111827;
  /* accent */
  --accent-tint:#e6f4f6;--accent-soft:#bfe3ea;--accent:#0e7490;--accent-strong:#0a5a72;--accent-bright:#22c0d6;
  /* semantica canvas */
  --canvas-monitor:#2563eb;--canvas-power:#dc2626;--canvas-tech:#b45309;--canvas-ink:#1f2937;
  /* feedback */
  --success:#15803d;--success-bg:#f0fdf4;--success-border:#bbf7d0;
  --warning:#b45309;--warning-bg:#fffbeb;--warning-border:#fde68a;
  --danger:#b91c1c;--danger-solid:#dc2626;--danger-bg:#fee2e2;
  /* superfici & overlay */
  --bg:var(--n-50);--surface:#fff;--surface-raised:var(--n-100);--border:var(--n-200);--border-strong:var(--n-300);
  --text:var(--n-800);--text-2:var(--n-500);--text-3:var(--n-400);--text-on-accent:#fff;
  --canvas-bg:#fafafa;--sheet:#fff;--select:var(--accent);--select-fill:rgba(14,116,144,.05);
  --focus-ring:rgba(14,116,144,.32);--guide:var(--accent);--guide-center:#f59e0b;--axis:#cbd5e1;
  --grid-line:#eceef0;--grid-major:#dde0e3;
  /* tipografia */
  --font-ui:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --font-mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  --t-micro:10px;--t-caption:11px;--t-label:12px;--t-body:13px;--t-title:15px;--t-heading:18px;--t-display:24px;
  --lh-tight:1.25;--lh-snug:1.4;--lh-normal:1.5;--lh-relaxed:1.6;
  /* spazio / raggi / ombre / motion / z */
  --s-05:2px;--s-1:4px;--s-2:8px;--s-3:12px;--s-4:16px;--s-5:20px;--s-6:24px;--s-8:32px;
  --r-sm:6px;--r-md:8px;--r-lg:12px;--r-xl:16px;--r-pill:999px;
  --elev-0:none;--elev-1:0 1px 2px rgba(16,24,40,.08),0 1px 1px rgba(16,24,40,.04);
  --elev-2:0 4px 12px rgba(16,24,40,.12);--elev-3:0 12px 32px rgba(16,24,40,.18);--elev-4:0 24px 64px rgba(16,24,40,.26);
  --dur-fast:120ms;--dur-base:160ms;--dur-modal:200ms;--dur-sheet:260ms;--ease:cubic-bezier(.2,0,.2,1);
  --z-canvas:1;--z-chrome:10;--z-menu:40;--z-overlaybar:50;--z-modal:50;--z-sheet:60;--z-learn:70;--z-toast:80;
}
```

- [ ] **Step 2: Rigenerare il single-file**

Run: `node build.mjs`
Expected: `✓ index.html generato dai sorgenti.`

- [ ] **Step 3: Verificare allineamento build**

Run: `node build.mjs --check`
Expected: `✓ index.html allineato ai sorgenti.`

- [ ] **Step 4: Verifica visiva — nessun cambiamento**

Aprire `index.html` nel browser. Expected: l'app è **identica** a prima (i token sono definiti ma non ancora usati).

- [ ] **Step 5: Commit**

```bash
git add src/styles.css index.html
git commit -m "feat(design-system): layer di token :root (custom properties)"
```

---

### Task 3: Migrare neutri + tipografia ai token — refactor invisibile

Sostituire gli hex neutri e i font-size/family con `var(--token)`. Stessi valori → **stesso aspetto**. È la prova che la migrazione è meccanica e sicura.

**Files:**
- Modify: `src/styles.css` (occorrenze di `#1f2937`, `#374151`, `#4b5563`, `#6b7280`, `#9ca3af`, `#d1d5db`, `#e5e7eb`, `#f3f4f6`, `#f9fafb`, `#fff`/`#ffffff` come superfici, e lo stack font in `body`)

**Interfaces:**
- Consumes: token da Task 2.

- [ ] **Step 1: Sostituire lo stack font e i neutri nel chrome**

In `body` usare `font-family:var(--font-ui)`. Sostituire i neutri **del chrome** (non del canvas) con i token corrispondenti, es.: `color:#1f2937`→`color:var(--text)`; bordi `#e5e7eb`→`var(--border)`; testo secondario `#6b7280`→`var(--text-2)`; placeholder/muted `#9ca3af`→`var(--text-3)`; superfici `#fff`→`var(--surface)`; app bg `#fafafa`/`#fff` dell'area → lasciare il canvas a `var(--canvas-bg)` nel task canvas. Mappa completa in §20 del design system.

> Nota: NON toccare gli hex dentro le classi SVG-oggetto (`.ic`, `.fWood`, sagome, `.lbl`, ecc.) — sono contenuto/canvas, trattati nei Task 7. In questo task: solo header, sidebar, props, footer, modali generiche, menu.

- [ ] **Step 2: Migrare i font-size del chrome ai token tipografici**

Mappare i size esistenti al gradino più vicino della scala (§3): brand 15→`--t-title`; titoli modale 16/17→`--t-heading`; body/control 13/13.5→`--t-body`; label 12/12.5→`--t-label`; caption uppercase 10.5/11→`--t-caption`; badge 10→`--t-micro`. Dove un valore non ha token (es. 14), arrotondare al gradino e annotare.

- [ ] **Step 3: Build + check**

Run: `node build.mjs && node build.mjs --check`
Expected: entrambi `✓`.

- [ ] **Step 4: Verifica visiva — invariato**

Aprire `index.html`. Confronto con il mockup `fondamenta.html`. Expected: aspetto sostanzialmente **identico** a prima del task (micro-variazioni accettabili solo dove un size è stato arrotondato al gradino di scala).

- [ ] **Step 5: Commit**

```bash
git add src/styles.css index.html
git commit -m "refactor(design-system): neutri e tipografia su token (no visual change)"
```

---

### Task 4: Accent unico + "liberare il blu" (cambiamento visibile)

Spostare l'accent UI sul teal e liberare il blu perché significhi solo "monitor". È l'elevazione-chiave approvata.

**Files:**
- Modify: `src/styles.css` — punti dove `#2563eb`/`#3b82f6` sono **selezione o guida UI** (NON la classe `.mon`/monitor).

**Interfaces:**
- Consumes: `--accent`, `--select`, `--select-fill`, `--guide`, `--accent-tint`, `--accent-soft`.

- [ ] **Step 1: Inventariare gli usi di blu da migrare**

Run:
```bash
grep -nE '#2563eb|#3b82f6|#1d4ed8|#bfdbfe|#eff6ff|#dbeafe' src/styles.css
```
Classificare ogni riga: **(A) selezione/guida UI** → migra a teal; **(B) monitor/semantica canvas** (`.mon`, `.mon.fill`) → **non toccare**. La selezione oggetti (`.item.selected .selbox`, `.item:hover .selbox`), snap-guide (`.snap-guide`), stage-block (`.stageblk`, `.blk-*`, `.rs-handle`, `.rot-handle`), frame (`.frame-*`), chip selezionati, `.pa-card.sel`, `#catalog ... open` blu residui = categoria A.

- [ ] **Step 2: Migrare la categoria A a teal**

Sostituire: selezione `#2563eb`→`var(--select)`; fill selezione `rgba(37,99,235,.05/.06/.14)`→`var(--select-fill)` (o `--accent-tint` dove è sfondo pieno); snap-guide `#3b82f6`→`var(--guide)`; bordo selezionato→`var(--accent)`; tinte di sfondo blu→`var(--accent-tint)`. Lasciare `--guide-center` (`#f59e0b`) invariato.

- [ ] **Step 3: Confermare che il monitor resta blu**

Run: `grep -nE '\.mon' src/styles.css`
Expected: `.mon{stroke:#2563eb}` e `.mon.fill{fill:#2563eb}` **invariati** (migrabili a `var(--canvas-monitor)` per pulizia, stesso colore).

- [ ] **Step 4: Build + check + verifica visiva**

Run: `node build.mjs && node build.mjs --check`
Aprire `index.html`, selezionare un oggetto: selbox/maniglie/guide ora **teal**; un monitor resta **blu**. Confronto col mockup `canvas.html`.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css index.html
git commit -m "feat(design-system): accent UI teal unico, blu = solo monitor"
```

---

### Task 5: Bottoni & input — raggio 8, stati, focus ring

Portare i bottoni da pillola a `--r-md`, unificare il ring di focus teal, allineare gli stati (§9–§10).

**Files:**
- Modify: `src/styles.css` — `.btn*`, `.btn-icon`, input/select (`header input`, `#props input`, `.hdr-stage input`, `#catSearch`, `.mcard ...`), checkbox/segmented/slider.

**Interfaces:**
- Consumes: `--accent`, `--accent-strong`, `--r-md`, `--focus-ring`, `--border`, `--border-strong`, `--n-100`, `--text`.

- [ ] **Step 1: Bottoni → raggio 8 + ruoli**

`.btn{border-radius:var(--r-md)}` (era `999px`). `.btn.primary{background:var(--accent)}` + `:hover{background:var(--accent-strong)}`. Secondary = `var(--n-100)`/`var(--border)`. `.btn.danger` = `var(--danger-bg)`/`var(--danger)`. Aggiungere variante danger-solid = `var(--danger)` testo bianco (per conferme distruttive). Transizione `var(--dur-fast) var(--ease)`.

- [ ] **Step 2: Focus ring globale per controlli interattivi**

Aggiungere regola: `.btn:focus-visible, input:focus-visible, select:focus-visible{outline:none;box-shadow:0 0 0 3px var(--focus-ring)}`. Mantenere il `border-color:var(--accent)` sul focus degli input.

- [ ] **Step 3: Input → bordo/raggio/focus su token**

Input e select: `border:1px solid var(--border-strong)`, `border-radius:var(--r-md)`, focus `border-color:var(--accent)` + ring. Campi numerici (quote/coordinate/canali): aggiungere `font-variant-numeric:tabular-nums`.

- [ ] **Step 4: Build + check + verifica visiva**

Run: `node build.mjs && node build.mjs --check`
Confronto col mockup `controlli.html`: bottoni rettangolari raggio 8, primario teal, focus ring teal, input coerenti.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css index.html
git commit -m "feat(design-system): bottoni raggio 8, input e focus ring su token"
```

---

### Task 6: Regioni chrome — sidebar, toolbar, inspector

Allineare le tre regioni a §11–§12–§14 (categoria aperta teal, gruppi/divider toolbar, ritmo inspector).

**Files:**
- Modify: `src/styles.css` — `#catalog*`, `header`/`.hdr-*`, `#props*`, `footer`, `.menu-pop`.

**Interfaces:**
- Consumes: token colore/spazio/raggio; `--accent`, `--accent-tint`, `--accent-strong`.

- [ ] **Step 1: Sidebar — categoria aperta teal piena**

`#catalog .cat-head.open` da `#1f2937` a `background:var(--accent);border-color:var(--accent);color:#fff`. Count aperto su `var(--accent-strong)`. Item hover → `var(--accent-tint)`/`var(--accent-soft)`. Padding/raggi ai token.

- [ ] **Step 2: Toolbar — gruppi e divider su token**

`header` e `.hdr-stage` (gruppo palco) usano `--surface-raised`/`--border`. Verificare/uniformare i divider a `1px var(--border)`. Icon-button (`.btn-icon`) hover `var(--n-100)`, active `var(--accent-tint)`/`var(--accent)`.

- [ ] **Step 3: Inspector — ritmo e header**

`#props .sec` separatore `1px var(--border)` a ritmo `var(--s-4)`. `#props h3` su `--text-2`/`--t-caption`. Bottone elimina = danger soft. Stato vuoto (`#noSel`) leggibile, `--text-2`/`--text-3`.

- [ ] **Step 4: Build + check + verifica visiva**

Run: `node build.mjs && node build.mjs --check`
Confronto col mockup `chrome.html`.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css index.html
git commit -m "feat(design-system): sidebar/toolbar/inspector su token (categoria aperta teal)"
```

---

### Task 7: Canvas — griglia, guide, selezione, quote

Allineare gli overlay del canvas a §13 (guide teal, snap-centro ambra, maniglie, alone quote). **Gli oggetti del palco restano invariati.**

**Files:**
- Modify: `src/styles.css` — `.grid line*`, `.cl`, `.snap-guide*`, `.selbox`, `.rs-handle`, `.rot-handle*`, `.dim-*`, `.zone-lbl`, `.stageblk*`, `.blk-*`, `.frame-*`, `main`.

**Interfaces:**
- Consumes: `--guide`, `--guide-center`, `--axis`, `--grid-line`, `--grid-major`, `--select`, `--canvas-bg`, `--canvas-tech`.

- [ ] **Step 1: Sfondo, griglia, asse**

`main{background:var(--canvas-bg)}`. `.grid line{stroke:var(--grid-line)}`, `.grid line.m{stroke:var(--grid-major)}`. `.cl{stroke:var(--axis)}`.

- [ ] **Step 2: Selezione, maniglie, guide**

`.selbox`/`.item.selected` → `var(--select)`; maniglie `.rs-handle`/`.rot-handle .rh-*` bordo `var(--select)`. `.snap-guide{stroke:var(--guide)}`; `.snap-guide.center{stroke:var(--guide-center)}` (resta ambra). Stage-block e frame (categoria A del Task 4) coerenti col teal.

- [ ] **Step 3: Quote (con alone) e tecnico**

`.dim-*` su `var(--text-2)`/`--canvas-ink`, mantenendo `paint-order:stroke;stroke:#fff` (l'alone). `.dim-h`/`.tec` su `var(--canvas-tech)`. **Non** alterare il valore dei colori-quota, solo tokenizzare.

- [ ] **Step 4: Build + check + verifica visiva (light)**

Run: `node build.mjs && node build.mjs --check`
Confronto col mockup `canvas.html`: griglia silenziosa, guide teal, snap-centro ambra, maniglie teal, oggetti del palco **identici a prima**.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css index.html
git commit -m "feat(design-system): overlay canvas su token (guide teal, snap ambra)"
```

---

### Task 8: Overlay & feedback — dialoghi, toast, tabelle, danger AA

Allineare modali/toast/tabelle a §15–§17 e correggere il contrasto del distruttivo (§4.2).

**Files:**
- Modify: `src/styles.css` — `.modal`, `.mcard`, `.menu-pop`, `#learn`/`.learn-*`, `#versBox`, `#venuePanel`, `#frameBox`, eventuali stili toast/tabella (se presenti; altrimenti definirli secondo §16–§17).

**Interfaces:**
- Consumes: `--surface`, `--r-lg`/`--r-xl`, `--elev-2`/`--elev-3`/`--elev-4`, `--danger`, `--success`, `--warning*`.

- [ ] **Step 1: Modali e popover su elevazione/raggi token**

`.mcard`/`.modal` → `border-radius:var(--r-xl)`, `box-shadow:var(--elev-4)`. `.menu-pop` → `var(--r-lg)`/`var(--elev-2)`. Footer modale: ghost a sx, primario teal a dx (già da Task 5).

- [ ] **Step 2: Conferma distruttiva → danger AA**

Il bottone di conferma distruttiva usa `var(--danger)` (#b91c1c, AA), non #dc2626. Verificare che esista la variante e applicarla dove si elimina con perdita dati.

- [ ] **Step 3: Toast/banner e tabelle**

Se gli stili toast/tabella esistono, tokenizzarli (icone success/info/error su `--success`/`--accent`/`--danger`; banner warning su `--warning-bg`/`--warning-border`). Se non esistono ancora come componenti CSS, crearli secondo §16–§17 (header tabella `--t-caption`/`--text-3`, riga selezionata `--accent-tint`).

- [ ] **Step 4: Build + check + verifica visiva**

Run: `node build.mjs && node build.mjs --check`
Confronto col mockup `overlay.html`.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css index.html
git commit -m "feat(design-system): overlay/feedback su token, distruttivo AA (#b91c1c)"
```

---

### Task 9: Dark mode su token

Convertire `body.dark{…}` da decine di override hardcoded a **ridefinizione dei token**, più accent-bright e opzione "foglio attenuato".

**Files:**
- Modify: `src/styles.css` — l'intero blocco `body.dark ...` (righe ~296–342 attuali) e le sue ramificazioni.

**Interfaces:**
- Consumes/Produces: ridefinizione token sotto `body.dark`.

- [ ] **Step 1: Ridefinire i token sotto `body.dark`**

```css
body.dark{
  --bg:#11151c;--surface:#161b24;--surface-raised:#1b2230;
  --border:#283142;--border-strong:#2b3445;
  --text:#e5e7eb;--text-2:#94a3b8;--text-3:#6b7280;
  --canvas-bg:#0b0e13;--sheet:#fff;
  --accent:var(--accent-bright);--select:var(--accent-bright);
  --focus-ring:rgba(34,192,214,.32);
}
```

- [ ] **Step 2: Rimuovere gli override dark ridondanti**

Eliminare le regole `body.dark .qualcosa{background:#…}` che ora sono coperte dai token (il componente già usa `var(--surface)` ecc.). Tenere **solo** gli override che non passano dai token (es. quote dark `.dim-edge`/`.dim-tot` bianche con alone scuro; `body.dark main` se serve).

- [ ] **Step 3: (Opzionale §critica #09) Foglio attenuato**

Aggiungere una classe opt-in `body.dark.sheet-dim{--sheet:#f3f4f6}` (il wiring del toggle è un follow-up template, fuori scope CSS).

- [ ] **Step 4: Build + check + verifica visiva (dark)**

Run: `node build.mjs && node build.mjs --check`
Attivare il tema scuro: chrome scuro, foglio chiaro che galleggia, accent teal-bright, quote bianche con alone. Confronto coi riquadri dark di `colore.html`/`canvas.html`.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css index.html
git commit -m "refactor(design-system): dark mode come ridefinizione token + accent-bright"
```

---

### Task 10: Pass di accessibilità & verifica finale

Chiudere §18: focus, touch/coarse pointer, reduced-motion, e un controllo finale di assenza di hex grezzi.

**Files:**
- Modify: `src/styles.css` (regole globali a fine file).

- [ ] **Step 1: Reduced motion + coarse pointer**

Aggiungere:
```css
@media (prefers-reduced-motion: reduce){ *{transition:none !important; animation:none !important} }
@media (pointer: coarse){ .btn,.btn-icon,.cnt-b,.mtbtn{ min-height:44px } }
```

- [ ] **Step 2: Verifica "zero hex grezzi fuori dal chrome-token"**

Run:
```bash
grep -nE '#[0-9a-fA-F]{3,6}' src/styles.css | grep -vE ':root|body\.dark|paint-order|stroke:#fff|#0b0e13' | head -60
```
Expected: le occorrenze residue sono SOLO dentro classi **oggetto-palco/canvas** (`.fWood`, `.ic`, sagome, `.lbl`, gradienti DEFS) — quelle restano per design. Nessun hex di **chrome** residuo.

- [ ] **Step 3: Build + check finale**

Run: `node build.mjs && node build.mjs --check`
Expected: entrambi `✓`.

- [ ] **Step 4: Verifica visiva completa (light + dark + mobile)**

Aprire `index.html`: percorrere toolbar, sidebar, selezione oggetto, inspector, una modale, tema scuro, e il layout < 880px (bottom-sheet). Confronto con `mockup-workspace.html` e `mockup-mobile.html`.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css index.html
git commit -m "feat(design-system): a11y (reduced-motion, target touch) + verifica finale"
```

---

## Follow-up (fuori da questo piano — richiedono template/JS, branch separato)

Questi nascono dalla critica ma toccano `index.template.html`/JS, quindi non rientrano nella migrazione CSS:

- **Pannelli laterali collassabili** sotto 1200px (critica #06) — toggle + scorciatoia.
- **Wiring del toggle "foglio attenuato"** nel tema dark (critica #09).
- **Sprite icone Lucide** inline in `<defs>` per le icone-funzione (critica #05).
- **Scala-quote dedicata alla stampa** se la verifica PDF lo richiede (critica #10).

Ognuno è un piccolo piano a sé; vanno fatti dopo il merge della migrazione CSS, per non violare "un file → un ramo".

---

## Self-Review (eseguita)

- **Copertura spec:** token (§2)→T2; tipografia/neutri (§3,§5)→T3; accent/blu (§4)→T4; bottoni/input (§9,§10)→T5; regioni (§11,§12,§14)→T6; canvas (§13)→T7; overlay/feedback (§15,§16,§17)→T8; dark (§2.6)→T9; a11y (§18)/motion (§19)→T10; backup (richiesta utente)→T1; migrazione (§20)→trasversale; critica (§21)→recepita o in follow-up.
- **Placeholder:** nessun "TBD/TODO"; ogni step ha comando o CSS concreto.
- **Coerenza tipi/nomi:** nomi token identici in tutti i task (verbatim da §2); marker build `/*__STAGEPLOT_STYLES__*/` e comandi `node build.mjs[ --check]` coerenti.
- **Verifica adattata:** niente unit test nel progetto → build-check + confronto visivo coi mockup nominati, esplicitato in ogni task.
