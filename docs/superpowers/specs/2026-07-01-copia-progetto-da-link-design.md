# Spec — Condivisione generica + copia progetto da link

Data: 2026-07-01
Milestone: "sistema condivisione link cloud" (prossima tappa a UI ultimata).
Origine: filtro del brief `modalità condivisione.rtf` → idea #1 "Crea una copia nel mio account" (vedi `STAGE PLOT/docs/idee/condivisione-consulenza-idee-da-tenere.md`).

## Problema

Chi riceve uno stage plot (es. band → service, o cliente → tecnico) non ha modo di ripartire da quel piano nel proprio account. Oggi l'unico link read-only è quello **della consulenza** (`share_token` su `consultation_requests`): non esiste una condivisione generica di un progetto qualsiasi, né un modo di "forkarlo". Conseguenza: si perde traccia di quale sia lo stage plot valido.

## Obiettivo

1. **Condivisione free generica**: da qualsiasi progetto, generare un link pubblico in sola lettura.
2. **Copia**: chi apre quel link può crearne una copia indipendente nel proprio account, con un click (dopo login).

La copia deve essere **indipendente**: modifiche alla copia non toccano l'originale.

## Stato attuale (verificato nel codice)

- Tool single-file: `index.html` è **generato** da `index.template.html` (+ `src/styles.css`) via `node build.mjs`. Editare i sorgenti, mai `index.html`. Verifica allineamento: `node build.mjs --check`.
- Schema `stageplot_projects` (dedotto da `saveProject`, template riga ~7304): `id, user_id, schema_version, title, data (jsonb), thumbnail, updated_at, deleted_at`.
- `saveProject()` (template ~7293): se `cloudCurrentId` esiste → `update(fields)`; altrimenti → `insert({ user_id, schema_version:1, title, data, thumbnail })`. Al salvataggio senza titolo parte la modale **"Dai un nome al progetto"** (titolo obbligatorio). **La copia riusa questo path forzando l'insert.**
- Login Google: `sb.auth.signInWithOAuth({ provider:"google", redirectTo: location.origin+location.pathname })` (template ~7247).
- Apertura `?view={token}` (template ~6931): oggi attiva **Sessione live Fase 3** (ruolo + Supabase Realtime + presence). Chiama `get-shared-project?token=` → carica `data,title`. Il client entra in sola-lettura aggiungendo `document.body.classList.add("viewmode")` (CSS blocca l'editing) e mostra la barra `#viewBar` via `showBar()`.
- **Condivisione già esistente (via hash)**: pulsante "Condividi" `#bShare` → `openShare()` (template ~6045) genera `stageplot.it/#p=<LZString(state)>` (progetto intero compresso nell'URL), con modale `#shareModal` (QR, Copia, Email, WhatsApp, Web Share). `loadFromHash()` (~2422) legge `#p=`/`#d=` all'avvio e carica il progetto in `state`, poi `history.replaceState` pulisce l'hash. Client-only, offline, nessun login. **B riusa questa modale, cambiando l'URL generato in link DB corto per gli utenti loggati.**
- **`redirectTo` del login perde la query**: `signIn()` (~7247) usa `redirectTo: location.origin+location.pathname` → al ritorno dall'OAuth **`?view={token}` è perso** e la pagina è ricaricata pulita. Va gestito esplicitamente per completare la copia post-login.
- Edge Function `get-shared-project`: lookup `consultation_requests` by `share_token` → ritorna `{data, title, updated_at}` (service role, bypassa RLS).
- Edge Function `save-shared-project`: scrittura consentita solo ad `ADMIN_ID` e solo via token di consulenza. **Non esiste** endpoint di scrittura pubblico su un progetto → i link sono read-only lato server per costruzione.
- RLS su `stageplot_projects`: policy *own-rows* presente e funzionante (insert/update/select/delete propri girano in prod; confermato anche da nota memoria "RLS verificato OK"). L'`update` di `share_token` sul proprio progetto è quindi permesso.

## Architettura

Un solo meccanismo di link (`?view={token}`), esteso a due tipi di sorgente:

```
[Owner] modale cloud → "Condividi" → (salva il progetto corrente) → genera share_token → link https://stageplot.it/?view={token}
                                                                                                │
[Chi riceve] apre link → get-shared-project (lookup dual) → render read-only statico + banner
                                                                                                │
                                                          "Crea una copia" → login → insert nuovo progetto (indipendente)
```

## Componenti

### 1. Modello dati — migration `0007_stageplot_projects_share.sql`
- `alter table public.stageplot_projects add column if not exists share_token text;`
- `create unique index if not exists stageplot_projects_share_token_key on public.stageplot_projects(share_token) where share_token is not null;`
- Nessuna nuova tabella. La copia è un normale insert in `stageplot_projects`.

### 2. Condividi (owner) — modifica di `openShare()` + `#shareModal` esistenti
Si riusa il pulsante "Condividi" (`#bShare`) e la sua modale (`#shareModal`: QR, Copia, Email, WhatsApp). Cambia solo l'URL generato, con due rami:

- **Utente loggato** (`sb` + `cloudUser`): al click, in sequenza:
  1. **Salva il progetto corrente** (riusa `saveProject`). Se non è mai stato salvato (`cloudCurrentId` nullo), parte la **finestra "Dai un nome al progetto"** (`askProjectName`, titolo obbligatorio, template ~7256). Prosegue **solo** dopo salvataggio riuscito e con un `id` in DB.
  2. Ottenuto l'`id`: se il progetto non ha `share_token`, generarlo con `crypto.randomUUID()` e `sb.from("stageplot_projects").update({ share_token }).eq("id", id)` (RLS: solo owner); se ce l'ha già, riusarlo.
  3. Popolare la modale esistente con l'URL **corto** `location.origin + "/?view=" + token`. QR ora sempre valido (URL < 1000). Aggiungere in modale **"Smetti di condividere"** (D2: `update({ share_token: null })` → link in 404).
- **Utente non loggato / offline** (`!sb` o `!cloudUser`): comportamento **attuale invariato** (link hash `#p=` via `buildShareUrl`), con nota "Accedi per un link più corto e sempre aggiornato". Nessuna regressione della condivisione offline.

Nota: incatenare 1→2 richiede che `saveProject` esponga il completamento e l'`id`. `saveProject` oggi non lo fa (il completamento è dentro `doSave→q.then`): va aggiunto un parametro `onSaved(id)` (backward-compatible: il listener di "Salva online" continua a chiamare `saveProject()` senza argomenti). `askProjectName(then)` propaga già un callback.

### 3. Apri link (lettura) — Edge Function `get-shared-project` + client
- **Edge Function**: lookup **dual**.
  1. `consultation_requests` by `share_token` → se trovato: `kind: "consultation"` (comportamento invariato).
  2. altrimenti `stageplot_projects` by `share_token` con `deleted_at is null` → `kind: "project"`.
  3. altrimenti 404.
  - Risposta arricchita con `kind`. Ritornare sempre solo `data, title` (+ `updated_at`). Nessun altro campo del progetto.
- **Client** (template ~6931): dopo la fetch, ramificare su `kind`:
  - `kind:"consultation"` → logica attuale Fase 3 (Realtime/ruoli), **invariata**.
  - `kind:"project"` (D1) → **sola-lettura statica**: caricare `data,title`, NESSUN canale Realtime/presence, editing disabilitato, mostrare banner (punto 4).

### 4. Crea copia — `index.template.html` (ramo `kind:"project"` + barra `#viewBar`)
- Nel ramo `kind:"project"`: `importProject(d.data)`, `document.body.classList.add("viewmode")` (riusa il read-only esistente), `showBar` con testo *"Sola lettura · Crea una copia per modificare"* e un pulsante dedicato **`#viewCopy`** "Crea una copia" (nuovo, nel markup di `#viewBar`, visibile solo per `kind:"project"`).
- Al click di `#viewCopy`:
  1. se **loggato**: `cloudCurrentId = null` → `saveProject()` con `state.titolo = "Copia di " + title` → dopo l'insert `history.replaceState` per rimuovere `?view=` e togliere `viewmode` → la copia resta aperta come progetto editabile dell'utente. `share_token` non impostato (copia privata); `thumbnail` rigenerata da `genThumbnail`.
  2. se **non loggato**: salvare `sessionStorage.setItem("copyFromToken", token)` **prima** del redirect, poi `signIn()`. Il token, non i dati (che con la planimetria possono eccedere lo storage). Vedi edge case OAuth.

### 5. Sicurezza
- Link pubblico espone solo `data, title` via service role; nessuna PII (`data` = geometria del palco).
- Nessun endpoint scrive su un progetto altrui: l'unica persistenza per chi riceve è "crea copia" = insert nel **proprio** account (`user_id = self`, garantito da RLS).
- Token = UUID v4 (non enumerabile). Revoca = `share_token = null`.
- `deleted_at is null` nel lookup → un progetto cestinato non è più raggiungibile dal link.

## Decisioni prese
- **D1**: link generico = **sola-lettura statica** (niente Realtime; il live resta esclusiva consulenza/collab premium).
- **D2**: revoca inclusa nell'MVP ("Smetti di condividere").
- **D3**: se l'owner apre il proprio link → MVP mostra comunque read-only + copia; "apri in modifica" è rifinitura successiva.
- **Condividi**: agisce sul **progetto corrente**, salvandolo prima (con modale titolo se mai salvato), non su una lista.
- **URL**: riuso `?view={token}` (dual lookup lato Edge Function); nessun parametro dedicato.
- **Titolo copia**: "Copia di {title}".
- **RLS**: assunta policy *update own-rows* su `stageplot_projects` (rischio basso accettato; il client scrive `share_token` direttamente). Fallback se smentita: generare il token via Edge Function.

## UI/UX
- Modale cloud del progetto corrente: pulsante "Condividi" accanto a "Salva online". Se il progetto non è salvato, prima appare "Dai un nome al progetto"; poi il riquadro con link + "Copia link" + "Smetti di condividere".
- Pagina condivisa (`kind:"project"`): banner sticky in alto, chiaro che è sola lettura, con un solo CTA primario (teal, design system) "Crea una copia".
- Post-copia: toast "Copia creata" + URL ripulito; l'utente è ora sull'editor della sua copia.
- Stile: token del design system (`--accent` teal, `--r-md`), niente hex grezzi. CSS in `src/styles.css`.

## Fuori scope (YAGNI)
- Ruoli formali (owner/editor/viewer/consultant come tabella `members`).
- Collaborazione live tra pari / Premium.
- Lock per-elemento, timer consulenza, snapshot revisionato (idee #2/#3/#4, sessioni separate).
- Anteprima social / OpenGraph della pagina condivisa.
- "Apri in modifica" per l'owner (D3, rifinitura).
- Nudge "copia" sui vecchi link hash `#p=` (legacy): restano funzionanti (`loadFromHash`), ma senza read-only né invito. La copia è comunque possibile a mano (apri → Salva online).
- Migrazione della condivisione offline: il ramo non-loggato continua a usare `#p=`; nessun tentativo di forzare il login per condividere.

## Edge case e rischi
- **Ritorno da OAuth** [CRITICO]: `redirectTo` usa `location.origin+location.pathname` → al ritorno **il `?view={token}` è perso** e la pagina è ricaricata senza il progetto condiviso. Meccanismo: prima del redirect si salva `sessionStorage.copyFromToken = token` (solo il token, non i dati). All'avvio, dopo che la sessione utente è pronta, se `copyFromToken` è presente e l'utente è loggato → **ri-fetch** `get-shared-project?token=` → `importProject(data)` → `cloudCurrentId=null` → `saveProject` (title "Copia di …") → `sessionStorage.removeItem("copyFromToken")` → toast + URL pulito. Il re-fetch (invece di conservare i dati in storage) evita i limiti di `sessionStorage` con le planimetrie base64.
- **Progetto cestinato/revocato**: get-shared-project → 404 → il client mostra "Link non più disponibile" invece del canvas.
- **Non regredire la consulenza**: i token di consulenza devono continuare a matchare per primi e attivare la Fase 3. Test dedicato.
- **`schema_version` / `thumbnail`**: la copia passa dal path `saveProject` (schema_version:1, thumbnail rigenerata dal canvas). Coerente con i progetti nuovi; nessuna gestione speciale.
- **Collisione token**: UUID v4, rischio trascurabile; l'unique index protegge comunque.

## File coinvolti
- `supabase/migrations/0007_stageplot_projects_share.sql` (nuovo).
- `supabase/functions/get-shared-project/index.ts` (lookup dual + `kind`).
- `index.template.html`: `saveProject` (aggiungere `onSaved(id)`); `openShare()` (~6045, ramo loggato → link DB + revoca / non-loggato → hash invariato); IIFE `?view=` (~6932, ramo `kind:"project"` read-only + `#viewCopy`); markup `#viewBar` (pulsante `#viewCopy`); avvio (~7012, completamento copia post-OAuth via `copyFromToken`). **Poi `node build.mjs`.**
- `src/styles.css` (banner + riquadro condivisione, token design system).
- Deploy: migration + `get-shared-project` su Supabase; `index.html` rigenerato su Pages.

## Test manuali (post-implementazione)
1. Owner con progetto già salvato: "Condividi" → link generato, "Copia link" funziona. Ripetere con un progetto **mai salvato** → prima appare "Dai un nome al progetto", poi il link.
2. Browser anonimo (o altro account): aprire il link → canvas in sola lettura, banner presente, editing disabilitato, nessun errore Realtime in console.
3. "Crea una copia" da non loggato → login Google → al ritorno la copia è creata e aperta come progetto proprio; l'URL non ha più `?view=`.
4. Modificare la copia → l'originale dell'owner resta invariato (verificare i due record distinti).
5. Owner: "Smetti di condividere" → il vecchio link dà "Link non più disponibile".
6. Regressione consulenza: un link `?view=` di consulenza esistente apre ancora la sessione live Fase 3 (admin editor / viewer).
7. `node build.mjs --check` verde in CI.

## Da verificare prima di implementare
- Confermare i nomi esatti di colonne/campi in `stageplot_projects` e nel payload `data` leggendo i blocchi reali del template (righe ~7293-7344 e ~6931-6960), per non introdurre disallineamenti.
- Confermare come il client entra in "modalità view" oggi (quali flag/variabili disabilitano l'editing) per riusarli nel ramo `kind:"project"`.
- Confermare come `saveProject` segnala il completamento e l'`id` salvato, e come funziona la modale "Dai un nome al progetto", per incatenare Condividi → salva → genera token.
