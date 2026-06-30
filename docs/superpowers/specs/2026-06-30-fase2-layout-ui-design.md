# StagePlot — Fase 2: Layout & UI — Spec

> Seconda fase dopo l'implementazione del design system (live su main `75c4ac6`).
> La Fase 1 ha portato **colori/token**; la Fase 2 porta i **layout e le icone-UI** dei mockup approvati.
> Documento di **design/scope**: precede il piano d'implementazione.
>
> **Stato:** proposta per approvazione · 2026-06-30 · branch `worktree-fase2-layout-ui` (worktree isolato)
> **Riferimento visivo:** i mockup in `.superpowers/brainstorm/12961-1782799917/content/` (chrome, workspace, overlay, settings, mobile) + `STAGEPLOT_DESIGN_SYSTEM.md`.

---

## 1. Obiettivo

Avvicinare l'app live ai mockup polished su **layout e icone-UI**, mantenendo la continuità ("codifica + elevazione") e **senza toccare le grafiche degli oggetti**.

## 2. Vincolo assoluto (il più importante)

**[CERTO] Le icone degli strumenti e tutte le grafiche degli oggetti restano IDENTICHE.**
- Restano invariati: strumenti, persone, sedie, leggii, orchestra, casse — i disegni dettagliati con gradienti (classi `.fWood`, `.fBrass`, `.fSkin`, sagome, `.ic`, `.lbl`, gradienti DEFS, ecc.) e le mini-anteprime del catalogo (= il vero oggetto in piccolo).
- Cambia **solo** un'altra famiglia: le **icone-funzione dell'interfaccia** (undo/redo, tema, adatta, griglia, export, share, ecc.).

Due livelli separati, da non confondere mai:

| Si tocca (Fase 2) | NON si tocca |
|---|---|
| icone-UI del chrome, toolbar, layout, mobile, modali | grafiche oggetti-palco, mini-catalogo, semantica canvas |

## 3. Principi (ereditati dal design system)

- Il **foglio è il prodotto**; il chrome serve il palco.
- **Un solo accent teal**; gerarchia per peso/spazio.
- **Flat-first**; ombra solo per "galleggia".
- **Velocità > estetica**; densità da strumento pro.
- Local-first single-file: nessun web font, build via `node build.mjs`.

## 4. Scope — cosa entra in Fase 2

### Blocco A — Polish toolbar (rischio basso)
Obiettivo: pulizia immediata, risolve le frecce undo/redo che non piacciono.

- **A1 · Icone-UI a linea.** Sostituire le icone-funzione della toolbar con set a **linea uniforme** (geometria Lucide, stroke 1.8px, terminazioni tonde — coerente col tratto del palco), inline SVG in `index.template.html`. Copre: undo, redo, tema, adatta/fit, griglia, quote, export, guida, cloud, condividi, apri-progetto, salva.
  - **Decisione aperta A1a:** stile esatto di **undo/redo** → presentare **2-3 alternative affiancate** (es. freccia curva, freccia ad angolo, freccia U-turn), l'utente sceglie *prima* di applicare.
- **A2 · Slider nativi → teal.** `input[type=range]{accent-color:var(--accent)}` (CSS). Risolve il pollice blu su rotazione/dimensione.
- **A3 · Dropdown "Griglia".** Da scuro-pieno a controllo **neutro/secondary** coerente (CSS), eventualmente con icona griglia.
- **A4 · Widget zoom flottante.** `− 100% +` in basso a destra sul canvas (markup + CSS), come il mockup canvas; affianca/sostituisce l'attuale gestione zoom.

### Blocco B — Toolbar pro raggruppata (rischio medio)
Obiettivo: il salto "da app a strumento pro" (mockup workspace).

- Raggruppare la toolbar in gruppi separati da **divisori 1px**: identità (brand) · documento (titolo/luogo + dimensioni palco) · cronologia (undo/redo) · zoom · vista (griglia/quote/tema) · azioni (guida/cloud/condividi/export) · **primario (Salva)** · account.
- **Un solo primario teal = Salva**, sempre a destra.
- **Overflow**: sotto soglia di larghezza i gruppi meno usati collassano in un menu `···` (mai wrap su 2 righe).
- **Decisione aperta B1:** il bottone **"Consulenza"** oggi è il CTA teal. Il design vuole *un solo* primario (Salva). Opzioni: (a) tenere Consulenza come CTA distinta ma defilata; (b) Salva primario + Consulenza secondary; (c) Consulenza in un menu. → da decidere con l'utente (è monetizzazione, scelta-prodotto).

### Mobile — rivisto e semplificato (rischio medio)
Obiettivo: l'attuale è confuso; rifarlo sul mockup approvato.

- Implementare il pattern del mockup mobile: **barra alta** (titolo + undo/redo + palco) · **canvas** · **hub in basso** (proprietà se selezione, altrimenti aggiungi+menu) · **catalogo a bottom-sheet** con maniglia.
- **Semplificare**: rimuovere ridondanze, target tocco **≥44px**, niente inspector da 360px schiacciato.
- Principio "**si riduce con onestà**": mobile = consultare / mostrare al cliente / ritocchi rapidi; layout complessi = desktop.

### Blocco C — Export come modale (rischio medio-alto)
Obiettivo: il pannello Export a destra → dialogo pulito.

- Convertire l'export nel **modale** del mockup: formato a card (PDF/PNG/SVG), dimensione foglio, checklist "Includi", primario **"Esporta PDF"** teal.
- Tocca il markup del pannello export **e** il JS che innesca le azioni (download PDF/PNG/SVG, salva progetto, condividi/QR).
- Mantenere intatte le funzioni esistenti (genThumbnail, askProjectName, share token).

## 5. Fuori scope (Fase 3, separata)

- **Blocco D — Project Browser** (home dei progetti salvati) e **Settings window** (nav laterale): feature **nuove** che toccano JS + cloud/Supabase. Scoping a parte dopo la Fase 2.

## 6. Vincoli tecnici & processo

- Si modifica `src/styles.css` (CSS) e `index.template.html` (markup + JS). Dopo ogni modifica: `node build.mjs`; prima del commit di task: `node build.mjs --check` verde.
- **Niente web font**, niente framework: resta single-file local-first.
- **Worktree isolato** (`worktree-fase2-layout-ui`): l'altro agente lavora sul checkout principale. **Push solo con OK utente**; merge in main solo dopo approvazione.
- **Grafiche oggetti intoccabili** (vedi §2): check finale `grep` che le classi oggetto non siano cambiate.

## 7. Ordine d'implementazione

1. **A** (polish toolbar) — con il gate "alternative undo/redo → utente sceglie" prima di A1.
2. **B** (toolbar pro) — dopo aver risolto la decisione B1 (Consulenza).
3. **Mobile** (rivisto/semplificato).
4. **C** (export modale).
5. (Fase 3) **D**.

Checkpoint visivo (light + dark, e mobile per il punto 3) dopo ogni blocco.

## 8. Criteri di accettazione

- Ogni blocco corrisponde visivamente al mockup approvato (entro la continuità "codifica + elevazione").
- `node build.mjs --check` verde a ogni task; nessuna regressione su light/dark.
- **Le grafiche degli oggetti del palco sono identiche a prima** (verifica grep + visiva).
- Mobile usabile e semplificato su schermo piccolo (target ≥44px).
- Funzioni esistenti preservate (export, salvataggio, share, miniatura).

## 9. Decisioni aperte (da risolvere in implementazione)

| ID | Decisione | Come si risolve |
|---|---|---|
| A1a | Stile icone undo/redo | 2-3 alternative affiancate → utente sceglie |
| B1 | Posizionamento "Consulenza" vs primario Salva | proposta + scelta utente |
| — | Dettagli raggruppamento toolbar e overflow | mockup mirato prima di applicare |
| — | Semplificazioni specifiche mobile | confronto col mockup, conferma utente |
