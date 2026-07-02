# Collaborazione — passaggio del controllo a turni (Fase 2) — Design

Data: 2026-07-02. Roadmap: Fase 2 (motore di collaborazione), **ridimensionata** da "co-editing
CRDT" a "**passaggio del controllo a turni**" (decisione utente, YAGNI: niente Yjs/CRDT).
Riferimenti: `docs/ROADMAP.md`, sessione live Fase 3, spec 1C.

## Obiettivo

Nella sessione live, il controllo dell'editing può **passare a turni** tra consulente e cliente:
un solo editor alla volta, il consulente "passa il testimone" al cliente e lo riprende. Nessuna
modifica simultanea → nessun conflitto → nessun CRDT.

## Contesto (cosa esiste)

- `startSession(sb, token, d, isEditor)`: ruolo **fisso** — admin (`isEditor`) = editor
  (`window.__rtBroadcast` invia `state`, `setupAutosave`, barra editor); cliente = viewer
  (ascolta broadcast `state` → `applyRemoteState`, `viewmode`+`consult-viewer` read-only).
- Canale realtime `consulenza:{token}`, broadcast `self:false`, presence.
- Persistenza: `setupAutosave` (admin) salva via `save-shared-project` (verify_jwt, **JWT==ADMIN**),
  autosave 10s dopo ogni broadcast + "Salva ora".
- 1B/1C: channel list editabile (editor, `consult-editor`) / read-only (viewer, `consult-viewer`).

## Design

### 1. `control` come stato di sessione

Valore `control` ∈ {`consultant`, `client`}, default `consultant`. Chi è l'editor corrente:
`isCurrentEditor = (control==="consultant" && isAdmin) || (control==="client" && !isAdmin)`.
`isAdmin` = `user.id===ADMIN_ID` (già calcolato come `isEditor` all'avvio; rinominare in `isAdmin`).

### 2. Peer simmetrici + `applyControl`

Refactor di `startSession`: **entrambi** i peer si iscrivono al canale e ascoltano `state` **e**
`control`. Una funzione `applyControl(holder)`:
- calcola `isCurrentEditor`;
- **editor**: rimuove `viewmode`/`consult-viewer`, aggiunge `consult-editor`; abilita
  `window.__rtBroadcast` (invia `state`); mostra barra editor; broadcast dello stato corrente.
- **non-editor**: aggiunge `viewmode`+`consult-viewer`, rimuove `consult-editor`; disattiva
  `__rtBroadcast`; ascolta `state`→`applyRemoteState`; barra viewer.
- `render()`+`renderChannels()` per riflettere read-only/editabile (chanRow legge le classi).

I listener `state`/`control` sono registrati una sola volta; `applyControl` cambia solo il
comportamento (chi invia vs chi applica). `broadcast self:false` evita l'eco.

### 3. Handoff (UI + messaggi)

- **Consulente (admin)** — nella barra: "Passa il controllo al cliente" (se ha il controllo) /
  "Riprendi il controllo" (se ce l'ha il cliente). Al click: `ch.send({event:"control", payload:{holder}})`
  + `applyControl(holder)` locale.
- **Cliente** — quando ha il controllo: "Restituisci il controllo" → `control:consultant`.
- Ricezione `control`: `applyControl(payload.holder)`.
- L'admin ha sempre l'ultima parola (può riprendere in ogni momento).

### 4. Persistenza = sempre l'admin (custode)

`save-shared-project` resta **admin-only** (invariato). L'admin salva:
- quando è editor: `setupAutosave` come ora;
- quando NON è editor (controllo al cliente): l'admin, ricevendo `state` dal cliente-editor,
  **innesca comunque l'autosave** (stesso `doSave` admin). Cioè l'autosave dell'admin si aggancia
  alla *ricezione* dello stato, non solo al proprio broadcast. Il cliente non persiste mai direttamente.

### 5. Sicurezza

- Il cliente-editor modifica solo la **vista** (broadcast); non ha il JWT admin → non può scrivere sul
  DB. La persistenza passa sempre dall'admin (custode). Nessuna nuova superficie server.
- `applyControl` sul cliente si fida del messaggio `control` (broadcast sul canale del token): il canale
  è già ristretto a chi ha il token; accettabile per una sessione di consulenza 1:1.

## Punti di codice

| Cosa | Dove |
|------|------|
| `isAdmin` (ex `isEditor`) + stato `control` | IIFE `?view=` / `startSession` |
| Ascolto `state`+`control` per entrambi i peer | `startSession` (refactor) |
| `applyControl(holder)` (switch ruolo UI + broadcast/apply) | nuovo, in `startSession` |
| Pulsanti handoff (admin + cliente) | barra `#viewBar` + handler |
| Autosave admin su ricezione state | `setupAutosave` / ramo ricezione |

## Testing

- **Via script (questa sessione):** simulare `applyControl("client")` / `applyControl("consultant")`
  e verificare le classi/ruolo (editor↔viewer) e lo stato di `__rtBroadcast`.
- **End-to-end (l'utente, due browser):** admin in una sessione + cliente in un'altra sullo stesso
  `?view={token}`; passare/riprendere il controllo; verificare che l'editing segua il controllo,
  che il broadcast vada nella direzione giusta, e che l'admin persista le modifiche del cliente.

## Rischi

- **Refactor della sessione realtime** (delicata): regressione su editor/viewer standard. Mitigazione:
  mantenere il comportamento attuale come default (`control=consultant`) → senza handoff tutto è come prima.
- **Race**: doppio cambio di control ravvicinato. Mitigazione: l'admin è arbitro (riprende sempre);
  ultimo messaggio vince (stato piccolo, no conflitti di dati).
- **Perdita modifiche cliente** se l'admin si disconnette mentre il cliente edita: accettato (sessione 1:1,
  l'admin è presente per definizione durante la consulenza).

## Fuori scope (YAGNI)

- Co-editing simultaneo / CRDT / Yjs.
- Cursori multipli, lock per-oggetto.
- Richiesta-controllo iniziata dal cliente (solo l'admin passa; il cliente restituisce).

## Decomposizione consigliata (per un refactor sicuro)

1. Refactor `startSession` a peer simmetrici con `applyControl`, **default consultant** (nessun cambiamento di comportamento osservabile) — verificare regressione zero editor/viewer.
2. Aggiungere il broadcast/ricezione `control` + i pulsanti handoff.
3. Autosave admin su ricezione (persistenza modifiche cliente).
4. UI cliente-editor (uscita da viewmode, palette/canvas/channel list editabili) + barra "Hai il controllo".
