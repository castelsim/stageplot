# Consulenza — Output documentale (channel list nel pacchetto PDF) — Design

Data: 2026-07-02. Roadmap: Fase 1B (consolidare la consulenza asincrona). Riferimenti:
`docs/ROADMAP.md`, `docs/AUDIT_2026-07-02.md`.

## Obiettivo

Dare alla consulenza un **deliverable documentale**: il consulente, nella sessione live, compila
la **channel list** (input patch + monitor/output) e la esporta insieme allo stage plot in un
**unico PDF multi-pagina**, che rivede e invia al cliente. Rende reale la promessa "Channel list e
rider tecnico su consulenza".

## Contesto (stato attuale del codice)

Il modulo channel list **esiste già** ma è **deliberatamente disattivato** per la versione free in
tre punti di `index.template.html`:
1. `normalizeState` azzera `s.inputs=[]; s.outputs=[]` a ogni load.
2. `buildPdfDoc` non chiama più la pagina channel list (commento `/* PAG 2 channel list rimossa dalla versione free */`).
3. Il pannello UI (`toggleChan`, `renderChanPanel`, `chanRow`, `+canale`/`+mix`/`Auto`) non ha più un pulsante di accesso.

La funzione `pdfChannelPage(doc, L, paperKey)` (pagina PDF completa: colonne CH / SORGENTE-MIX /
MIC-TIPO / STAND-PATCH / 48V / NOTE; sezioni INPUT PATCH e MONITOR/OUTPUT; paginazione) è **scritta
e pronta**, solo non invocata.

In modalità editor consulenza (`?view=` come admin) il tool **non** entra in `viewmode`: il
consulente ha già header completo e `Salva/Esporta`. Il viewer (cliente) entra in `viewmode`.

## Decisioni prese (brainstorming 02/07, validate visivamente col cliente)

- **Deliverable = stage plot + channel list** in un PDF unico.
- **Consegna = il consulente esporta e invia** (email/WhatsApp). Nessun backend nuovo. Controllo umano finale.
- **Gate = modalità editor consulenza** (`?view=` admin). Nessuna logica "admin" sparsa nel tool free.
- **UI editor ottimizzata**: la schermata del consulente è un ambiente di lavoro, ripulita dagli
  elementi "consumer". La vista del cliente resta invariata.
- **Pulsante Channel list**: nell'header, accanto a `Salva/Esporta`, icona **mixer/fader**.

## Design

### 1. Gate `__consultMode`

Flag globale `window.__consultMode`, impostato a `true` in `startSession` **solo se `isEditor`**,
prima di `importProject`. In ogni altro contesto (tool free, import da file, `?view=` viewer) resta
`false`. È l'unico interruttore del comportamento "consulenza".

### 2. Dati: preservare la channel list

In `normalizeState`: `if (!window.__consultMode) { s.inputs=[]; s.outputs=[]; }`. Il consulente
mantiene i canali; il tool free è invariato. Persistenza gratuita: l'autosave della sessione (Fase 3)
serializza lo stato completo → `inputs`/`outputs` salvati nel progetto, ripristinati ai reload dell'editor.

### 3. UI editor ottimizzata

Aggiungere al `<body>` la classe **`consult-editor`** in `startSession` quando `isEditor`. Regole CSS
sotto `.consult-editor` che **nascondono** gli elementi non pertinenti al consulente:
- pulsante **Guida**, **Cloud** (`#bCloud`), **Consulenza**, **Apri progetto** nell'header;
- il fab feedback **"Cosa manca?"**.

Restano: brand, Titolo/Luogo (editabili, utili al documento), tema, undo/redo, Adatta, griglia,
**Channel list**, **Salva/Esporta**, e la barra "Sessione live · consulente" con Salva ora.

### 4. Pulsante Channel list

Aggiungere nell'header un pulsante (accanto a `Salva/Esporta`) che chiama `toggleChan()`, **visibile
solo** sotto `.consult-editor` (CSS `display:none` di default, mostrato in consult-editor). Icona SVG
mixer/fader (stile stroke coerente col tool):

```html
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <line x1="6" y1="4" x2="6" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/>
  <rect x="3.5" y="7" width="5" height="3.2" rx="1.6" fill="currentColor" stroke="none"/>
  <rect x="9.5" y="12.3" width="5" height="3.2" rx="1.6" fill="currentColor" stroke="none"/>
  <rect x="15.5" y="9" width="5" height="3.2" rx="1.6" fill="currentColor" stroke="none"/>
</svg>
```

Il pannello channel list (`chan-edit`) e i controlli `+canale`/`+mix`/`Auto` esistono già: il
consulente auto-popola dalla scena e rifinisce a mano.

### 5. Output: pacchetto PDF unico

In `buildPdfDoc`, dopo lo stage plot: se `window.__consultMode` **e** c'è almeno un canale
(`state.inputs.length || state.outputs.length`), fare `doc.addPage(...)` e chiamare
`pdfChannelPage(doc, L, paperKey)` (riattiva la chiamata rimossa). Un unico PDF: pagina 1 stage plot,
pagine seguenti INPUT PATCH + MONITOR/OUTPUT. Se non ci sono canali, **nessuna pagina aggiunta** (niente
pagina vuota). L'export PNG resta invariato.

### 6. Realtime / viewer

Nessuna modifica al broadcast. Il viewer (cliente) non è in `__consultMode`, quindi `normalizeState`
gli azzera i canali: non vede la channel list. Coerente con "il consulente esporta e invia".

## Punti di codice (dove intervenire)

| Cosa | File / funzione |
|------|-----------------|
| Set `__consultMode` + classe `consult-editor` | `index.template.html` → `startSession` |
| Preserva inputs/outputs | `normalizeState` (guardia `!__consultMode`) |
| Pulsante Channel list (markup + icona) | header in `index.template.html` |
| CSS nascondi consumer + mostra pulsante | `src/styles.css` sotto `.consult-editor` |
| Pagina channel list nel PDF | `buildPdfDoc` → chiama `pdfChannelPage` |

## Error handling

- `pdfChannelPage` gira dentro il flusso `buildPdfDoc` già coperto da feedback ("Genero il PDF…") e
  `.catch` (mostra "Errore: …"). Nessun nuovo percorso d'errore.
- Se `__consultMode` è `true` ma non ci sono canali: il PDF resta il solo stage plot (nessuna pagina vuota).

## Testing

Test runtime nel browser (localhost) **forzando `window.__consultMode=true`** e la classe
`consult-editor`, verificando:
1. header ripulito (consumer nascosti) + pulsante Channel list visibile con icona fader;
2. `toggleChan` apre il pannello; `Auto` popola i canali dalla scena; i canali persistono a un
   `normalizeState` (import) senza azzerarsi;
3. export → PDF con pagina stage plot **e** pagine channel list (INPUT PATCH / MONITOR);
4. senza `__consultMode` (tool free): canali azzerati, nessun pulsante, PDF solo stage plot (regressione zero).

Nessun test backend (intervento solo frontend).

## Fuori scope (YAGNI, per fasi successive)

- AI che genera la bozza di channel list (Fase 1B "AI interna" — separata).
- Rider tecnico testuale nel PDF (era l'opzione "pacchetto completo", non scelta).
- Consegna automatica al cliente (email/self-service) — scelto "consulente esporta e invia".
- Editing inputs/outputs nel tool free.

## Rischi

- Se il cliente riapre il progetto della consulenza nel **tool free** e risalva, `normalizeState`
  azzera i canali nel `data` (il deliverable è comunque il PDF già consegnato). Rischio minore, accettato.
- La classe `consult-editor` dipende da `isEditor` (admin id). Se cambia l'admin id, aggiornare il gate
  (già hardcoded altrove come `ADMIN_ID`).
