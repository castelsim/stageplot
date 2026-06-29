# Spec — Fase 3: collaborazione real-time sul link "vivo"

Data: 2026-06-29
Branch: `consulenza-fase3`
Stato: design in review

## 1. Contesto

Oggi (Fase 2) il link "vivo" `https://stageplot.it/?view={token}` apre il progetto del cliente in
**sola-lettura**, leggendo l'**ultimo salvataggio** (snapshot). Non c'è sincronizzazione mentre si edita.

Obiettivo Fase 3: durante una **sessione dal vivo** (entrambi online), **il consulente (Simone) edita**
e **il cliente vede le modifiche in tempo reale**; a fine sessione le modifiche sono **salvate sul
progetto del cliente**.

## 2. Decisioni (confermate)

- Scenario: **sessione live** (co-presenza). Non asincrono.
- Editing: **solo il consulente** (un editor, niente conflitti → niente CRDT).
- Persistenza: **sì**, le modifiche del consulente vanno salvate sul progetto del cliente.
- Autorizzazione editor: **il consulente è loggato come admin**. `ADMIN_ID = 4b899cba-3cc2-4b26-9ef0-c3e915929277`
  (auth.users di castellansimone@gmail.com). Chi apre il link con quell'`user_id` → editor; chiunque
  altro → osservatore.

Fuori scope: co-editing bidirezionale, CRDT/OT, cursori multipli, chat.

## 3. Architettura

Riuso di Supabase **Realtime (broadcast)** + il motore del tool. Niente nuova infrastruttura.

### 3.1 Ruolo all'avvio (`?view={token}`)
Estende la modalità Fase 2:
1. `get-shared-project` carica il progetto (come ora).
2. Si determina il ruolo dalla sessione Supabase:
   - utente loggato con `user_id === ADMIN_ID` → **editor** (NON read-only; può modificare);
   - altrimenti → **viewer** (read-only come Fase 2).
3. Entrambi si uniscono al canale Realtime `consulenza:{share_token}`.

`ADMIN_ID` può stare nel client (è solo un UUID, decide solo la UI). La vera autorizzazione alla
**scrittura** è lato server (§3.4) e verifica il JWT.

### 3.2 Canale Realtime
- Nome canale: `consulenza:{share_token}`.
- Evento broadcast: `state` con payload `{ json: <stateToJSON()> }`.
- **Presence**: editor/viewer pubblicano la propria presenza → la UI mostra "cliente connesso" /
  "consulente connesso".

### 3.3 Editor → broadcast (aggancio in `recordHistory()`)
[CERTO] `recordHistory()` (index.template.html:2267) è chiamata a ogni modifica **finalizzata**
(rileva il cambiamento con `s !== lastSnap`). È il punto d'aggancio:
- in modalità editor, dopo che `recordHistory` rileva un cambiamento, **broadcast** dello stato `s`.
- Throttle leggero (es. ~150 ms, trailing) per coalescere raffiche di modifiche.

### 3.4 Viewer ← broadcast
- Subscribe al canale; on `state` → `applyRemoteState(json)`: nuova funzione che fa
  `state = normalizeState(JSON.parse(json)); render(); renderChannels(); fit();` **senza** toccare
  undo/redo né localStorage (a differenza di `applyHistory`/`importProject`).
- Il viewer resta read-only (UI Fase 2: header/palette/props nascosti, `pointer-events:none`).

### 3.5 Persistenza — Edge Function `save-shared-project` (nuova)
- Input: `token`, `data` (lo stato JSON), `Authorization: Bearer <JWT utente>`. **verify_jwt=true**.
- Verifiche: (a) il JWT appartiene a `ADMIN_ID`; (b) `token` valido in `consultation_requests`
  (non revocato) con `project_id` non nullo.
- Azione: scrive `stageplot_projects.data` per quel `project_id` (service role).
- Chiamata dall'editor: **auto-save debounced** (es. ogni 10 s di inattività) + pulsante "Salva ora".
  Il cliente, riaprendo, ritrova le modifiche; chi non è in sessione vede sempre l'ultimo salvataggio.

### 3.6 UI
- **Editor**: barra "Sessione live · consulente" con indicatore presenza cliente + stato salvataggio
  ("salvato"/"salvataggio…") + pulsante "Salva ora". Editing pieno abilitato.
- **Viewer**: barra "Sola lettura · in diretta col consulente" + indicatore "consulente connesso".

## 4. Sicurezza

- Scrittura sul progetto: solo via `save-shared-project`, che verifica JWT == ADMIN_ID **e** token valido.
  Un viewer col token può solo ricevere broadcast (lettura), mai salvare.
- Il canale `consulenza:{share_token}` è derivato dal token non indovinabile; chi non ha il token non
  vi accede. (RLS Realtime: valutare in fase di piano se serve una policy sul broadcast; il broadcast
  effimero non espone il DB.)
- `get-shared-project` invariata (Fase 2).

## 5. Errori / edge case

- Cliente offline durante la sessione → l'editor continua a lavorare; al salvataggio il progetto è
  aggiornato comunque. Presence segnala "cliente non connesso".
- Riconnessione: alla (ri)connessione del viewer, l'editor invia un broadcast `state` "full" (lo stato
  corrente) così il nuovo arrivato si allinea subito (oppure il viewer ricarica via get-shared-project).
- Editor che apre il link **non loggato** o non admin → ricade in viewer read-only (nessun editing).
- Conflitto con localStorage del tool: in editor mode il progetto caricato è quello del cliente; valutare
  se isolare dal LS locale del consulente (per non sporcare i suoi progetti).
- Auto-save fallito → ritenta; mostra "non salvato" e mantiene il pulsante "Salva ora".

## 6. Componenti da costruire (per il piano)

1. `applyRemoteState()` + `ADMIN_ID` + rilevamento ruolo nel tool (index.template.html).
2. Aggancio broadcast in `recordHistory()` (solo editor) + subscribe canale (entrambi) + presence.
3. UI barre editor/viewer (src/styles.css + template).
4. Edge Function `save-shared-project` (verify_jwt=true; ADMIN_ID + token).
5. Auto-save debounced + pulsante "Salva ora" (editor).
6. Rebuild single-file (`node build.mjs`).

## 7. Note di repo
- Branch `consulenza-fase3` (worktree `../stageplot-fase3`), da `origin/main` (56b0569, Fase 2 inclusa).
- Realtime: verificare in fase di piano che Realtime sia abilitato sul progetto Supabase e i limiti del free tier (ampi per 2 client).
