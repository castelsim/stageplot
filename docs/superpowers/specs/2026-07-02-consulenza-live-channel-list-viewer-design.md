# Consulenza live — il cliente vede la channel list in diretta (Fase 1C) — Design

Data: 2026-07-02. Roadmap: Fase 1C (consulenza live). Riferimenti: `docs/ROADMAP.md`,
spec 1B `2026-07-02-consulenza-output-documentale-design.md`.

## Obiettivo

Nella sessione live, il cliente (viewer) deve poter vedere **in diretta anche la channel list**
mentre il consulente la compila — non solo lo stage plot. Layout scelto: **toggle** tra "Stage plot"
e "Channel list" (una vista alla volta, a piena pagina), in sola lettura.

## Contesto (cosa esiste già)

- Sessione live realtime (Fase 3): consulente admin apre `?view={token}` → **editor** (broadcast
  `stateToJSON` via Supabase Realtime, autosave); cliente non-admin → **viewer** (`viewmode`, sola
  lettura, `applyRemoteState` aggiorna in diretta).
- 1B/M1-M7: il pannello channel list (`#chanlist`, `chanRow`, `renderChannels`) è attivo per l'editor
  dietro il gate `window.__consultMode` + classe `consult-editor`.
- **Blocco attuale:** `stateToJSON` INCLUDE inputs/outputs (il broadcast li manda), ma
  `applyRemoteState` → `normalizeState` li **azzera** per il viewer (non è `__consultMode`). E
  `#props`/#chanlist è nascosto in `viewmode`.

## Decisioni prese (brainstorming 02/07)

- Il cliente vede la channel list live (non solo lo stage plot).
- Layout: **toggle** Stage plot ⇄ Channel list, a piena pagina, sola lettura.
- Nessun editing dal viewer; nessun cursore multiplo/lock (quelli sono Fase 2).

## Design

### 1. Preservare i dati per il viewer (`consult-viewer`)

In `startSession`, per il viewer di una sessione consulenza (kind consultation, non editor):
`window.__consultMode = true` (così `normalizeState`/`applyRemoteState` NON azzerano più
inputs/outputs) **+** classe `consult-viewer` sul body (distinta da `consult-editor`).
`consult-editor` resta solo per l'admin: nessun pannello editabile né pulsante editor per il cliente.

### 2. Toggle nella barra viewer

In `#viewBar` aggiungere un controllo a due voci **"Stage plot | Channel list"**, visibile solo con
`body.consult-viewer`. Al click alterna la classe `cl-view` sul body (default OFF = stage plot).

### 3. Channel list read-only a piena pagina

CSS sotto `body.viewmode.consult-viewer.cl-view`:
- nasconde `#svg`/`main` (canvas), mostra `#chanlist` a piena pagina (sopra l'area principale);
- in `chanRow`, se `body.consult-viewer` (e non editor): input/select **disabled**, e i controlli
  editor (`+canale`/`+mix`/`Auto`/`Svuota`/`Fatto`/elimina, il grip di reorder) **nascosti**.
- Le sezioni Input patch / Monitor sono **aperte** di default per il cliente (nessun toggle a scomparsa).

### 4. Realtime

Nessuna modifica: `applyRemoteState` già chiama `renderChannels()`. Una volta preservati i dati
(punto 1), quando il consulente compila, il cliente vede la channel list aggiornata in diretta.
Se il cliente è sul toggle "Channel list" durante una modifica, la vista si aggiorna da sé.

## Punti di codice

| Cosa | Dove |
|------|------|
| Flag `__consultMode` viewer + classe `consult-viewer` | `startSession` (ramo non-editor consultation) |
| Toggle Stage plot/Channel list | markup `#viewBar` + handler (classe `cl-view`) |
| Vista read-only + nascondi canvas | `src/styles.css` sotto `body.viewmode.consult-viewer` |
| Input disabilitati + controlli editor nascosti | `chanRow` (guard `consult-viewer`) + CSS |

## Error handling

Nessun nuovo percorso d'errore: read-only lato viewer; `applyRemoteState` ha già un try/catch che
ignora stati remoti non validi.

## Testing (runtime nel browser)

Simulando una sessione viewer (`viewmode` + `consult-viewer`, `__consultMode=true`):
1. il toggle appare nella barra; default = stage plot (canvas visibile);
2. toggle → "Channel list": canvas nascosto, channel list visibile, input **disabilitati**, nessun controllo editor;
3. `applyRemoteState` con un progetto che ha canali → la channel list si popola (dati non azzerati);
4. regressione: viewer di una **condivisione generica** (kind project, non consultation) NON deve
   avere il toggle né la channel list; editor invariato; tool free invariato.

## Fuori scope (YAGNI)

- Editing della channel list dal cliente (è read-only).
- Cursori multipli, lock per-oggetto, più editor (Fase 2).
- `autoOutputs` a banchi (micro-follow-up 1B).

## Rischi

- `__consultMode=true` per il viewer abilita anche la pagina channel list nell'export PDF: ma il
  viewer non ha UI di export (viewmode nasconde header/Salva-Esporta), quindi ininfluente.
- Verificare che `consult-viewer` scatti solo per kind consultation (non per la condivisione generica
  `?view=` kind project, che ha un flusso diverso — `startSharedProject`).
