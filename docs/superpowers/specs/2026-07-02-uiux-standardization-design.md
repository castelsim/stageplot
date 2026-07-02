# UI/UX Standardization — Desktop A′ + Mobile A′ — Design

Data: 2026-07-02. Origine: direttiva PO "UI/UX Standardization" + audit `docs/UIUX_AUDIT_2026-07-02.md`.
Decisioni prese sui mockup (`.superpowers/brainstorm/2026-07-02-uiux-standardization/content/`,
`opzioni.html` + `varianti-a.html`): **Desktop A′** (menu File, senza Salva/Esporta in header),
**Mobile A′** (bottom bar 4 tasti), **V2 autosave online**, **P1 Condividi primary**,
"Cosa manca?" nel menu "?". Sequenza: diretta (niente tappa intermedia).

## Obiettivo

Un utente inesperto apre StagePlot e capisce senza istruzioni: dove si salva (chip di stato,
automatico), dove si apre/crea (File), come si consegna (Condividi/Esporta), chi è (avatar).
Stessi verbi su desktop e mobile. Zero regressioni su tool free e consulenza.

## 1. Header desktop (52px, invariato nelle fondamenta)

```
STAGE PLOT · [File ▾] │ [Nome progetto ✎] [chip stato] ──spazio──
[?▾] [tema] [undo] [redo] [adatta] [griglia ▾] │ [Consulenza·tint] [Condividi·primary] [avatar]
```

- **Nome progetto** = il campo `#titolo` esistente, promosso a identità del documento
  (placeholder "Senza titolo"; resta l'oggetto-mail della condivisione). **`#luogo` esce
  dall'header** → input nel pannello Evento (`#eventoSec`), stesso `id`, stessi handler.
- **Guida** diventa icona `?` (32px `tbar-ico`) con **menu**: "Cos'è uno stage plot — guida"
  (= `bLearn` attuale) · "Cosa manca? Scrivici" (= azione dell'attuale `#fbTrigger`).
  Il fab `#fbTrigger` viene rimosso; il box feedback (`#fbBox`) resta invariato.
- **Rimossi dall'header**: `#bCloud` (→ File "I miei progetti" + avatar), `#bHdrPdf`
  (→ File "Esporta PDF…"), `#bHdrImport` (→ File "Apri file…").
- **Consulenza**: da accent pieno a **tint** (`--accent-tint`/`--accent-strong`;
  dark `#13202a`/`#5eb8c7`), senza stili inline (nuova classe `.btn.tint` tokenizzata).
- **Condividi**: nuovo bottone, **unico primary teal** della schermata → `openShare()`
  esistente (modal con link + tab "Scarica PDF"). DS §12 va aggiornato di conseguenza.
- **Avatar**: cerchio 30px con iniziali quando loggato (menu: email, I miei progetti, Esci);
  bottone "Accedi" quando sloggato (→ login Google esistente del modulo cloud).

## 2. Menu File (componente nuovo, da speccare anche nel DS)

Dropdown `--r-md`, `--elev-2`, item 13px/500, hover `--accent-tint` (dark `#222b38`):

| Voce | Azione (già esistente) |
|---|---|
| Nuovo | `#bNew` handler (confirmDialog invariato) |
| Apri file… | `#importJson` picker |
| I miei progetti | modal cloud attuale (`#cloudModal`, senza la parte login se già in avatar) |
| — | |
| Rinomina | focus sul nome progetto in header |
| Crea una copia | duplica lo stato come nuovo progetto (riusa la logica "Crea una copia" del viewmode) |
| Scarica file progetto | `#saveJson` (download .json) |
| — | |
| Esporta PDF… | apre `#framePanel` (dialog Esporta attuale, senza più la voce "Salva progetto") |
| Esporta PNG | `#frameSavePng` |
| — | |
| Salva versione (⌘S) | `saveVersion()` + flush autosave |
| Versioni… | `#versPanel` (feature esistente, oggi irraggiungibile → ricollegata qui) |
| Condividi… | `openShare()` |

Tastiera: ⌘S=Salva versione, Esc chiude, frecce navigano (accessibilità DS §18).

## 3. Chip stato documento (sostituisce `#savedInfo` del footer)

Pill 11px accanto al nome. Stati:

| Stato | Aspetto | Quando |
|---|---|---|
| `Salvato online` | verde, icona cloud | autosave cloud ok (loggato) |
| `Salvataggio…` | neutro | debounce in corso |
| `Salvato sul dispositivo` | neutro, icona ✓ | non loggato (autosave locale ok) |
| `Solo su questo dispositivo — Accedi` | ambra + triangolo (DS §13) | non loggato, **cliccabile** → login |
| `Non salvato online — riprovo…` | ambra | errore rete; retry automatico |

Colori dark: pattern reali dell'app (`#0f2d1a/#166534/#4ade80`; ambra `rgba(245,158,11,…)/#fbbf24`).

## 4. Autosave online (V2 — modello Docs/Canva/Figma)

- **Loggato**: ogni `save()`/`saveSoon()` già persiste in localStorage; in più, con **debounce
  ~10s** (stesso ritmo del `setupAutosave` consulenza), upsert del progetto cloud corrente via
  modulo `window.__cloud` (che già traccia `currentId()`).
  - Progetto aperto da "I miei progetti" → aggiorna quel record.
  - Progetto nuovo → **nasce sul cloud alla prima modifica** ("Senza titolo", rinominabile).
    Pulizia dei senza-titolo abbandonati: fuori scope (convive, come in Docs).
- **Non loggato**: nulla di nuovo (localStorage); chip ambra cliccabile.
- **Errore/offline**: chip onesto + retry al prossimo save; nessuna coda sofisticata (YAGNI).
- **⌘S**: `saveVersion()` (nome auto "Versione del 2/7 14:32" se non fornito) + flush
  immediato dell'autosave. Niente più "Salva online" manuale in giro per l'app.
- Sicurezza: nessuna superficie nuova — stesse RLS own-rows (audit S2), stesso client supabase.

## 5. Mobile (≤880px) — bottom bar

- **mTop**: `[titolo] [chip compatto] [?]` — il chip mostra solo icona/colore (tooltip=testo);
  `?` apre sheet con le stesse 2 voci del desktop. `⋯ mMenuBtn` resta come oggi ma il suo
  contenuto cambia (sotto).
- **Bottom bar fissa** (nuova, sostituisce la zona azioni dell'hub `#mActions`):
  `[＋ Aggiungi] [Esporta] [Condividi] [⋯ Menu]` — 4 tasti (niente Salva: c'è l'autosave),
  icona 19px + label 9.5px, target ≥44px (`pointer:coarse`), **auto-hide durante il drag**
  sul palco (torna al rilascio).
- **Menu ⋯** = sheet a **un solo livello** ("Altro…" eliminato):
  Progetto: Nuovo · Apri file · I miei progetti — Palco: Palco · Evento · Planimetria ·
  Area stampa — App: Tema · Consulenza →. (Guida e feedback vivono nel `?`.)
- FAB catalogo `#fabCat` assorbito da "Aggiungi"; `#fabProps` invariato; naming unificato
  (niente più "Importa"/"Salva (locale)").

## 6. Consulenza / viewmode — regressione zero

- La sessione `?view=` ha la sua barra (`#viewBar`) e i gate `consult-editor`/`consult-viewer`:
  **non si tocca**. L'header consulente segue il nuovo layout ma mantiene `#bChanList` nel suo
  gate; l'export della consulenza passa da File → Esporta PDF (stesso handler `bPdf`).
- L'autosave della sessione live (`setupAutosave` admin via `save-shared-project`) resta
  separato e invariato.

## 7. Aggiornamenti al design system (STAGEPLOT_DESIGN_SYSTEM.md)

1. Header doc: stato → "implementato" (oggi dice ancora "proposta").
2. §12 Toolbar: "Salva = unico Primary" → **modello autosave**: chip di stato + "Condividi =
   unico Primary"; gruppi aggiornati al layout A′.
3. Nuovo §24: **menu dropdown** (File/help/avatar), **chip stato documento**, **bottom bar
   mobile** — token, misure e stati come da questa spec.
4. Bonifica: hex grezzi inline della modale cloud e stile inline di `#bConsulenza` → classi
   tokenizzate (regola d'oro §0).

## 8. Fuori scope (YAGNI)

- Home "I miei progetti" all'apertura (opzione C, scartata).
- Coda offline con sync differenziale; conflitti multi-dispositivo (last-write-wins accettato).
- Estensione file `.stageplot` (resta `.json`; eventuale rename in un altro momento).
- Restyling del catalogo/inspector (fuori dal perimetro della direttiva).

## 9. Testing

- `node build.mjs --check` + runtime su `localhost:8765` (pattern consolidato).
- Percorsi da verificare a mano: nuovo/apri/scarica/esporta/condividi da File; chip in tutti
  gli stati (loggato, sloggato, offline simulato); ⌘S → versione; menu `?` + feedback;
  mobile ≤880px: barra, auto-hide, sheet un livello; **consulenza end-to-end** (editor admin +
  viewer) per regressione zero; dark + light.
- Test utente reale mobile (lo stesso profilo del test fallito) come criterio di successo finale.
