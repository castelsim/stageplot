# Spec — Form consulenza su Supabase (pagina /consulenza/)

Data: 2026-06-28
Branch: `consulenza-supabase`
Stato: approvato — implementazione in 2 fasi (vedi §16)

## 1. Contesto e problema

La pagina `consulenza/index.html` (single-file, CSS+JS inline) vende un servizio di
revisione tecnica di stage plot. Oggi:

- Le **offerte** rimandano a checkout **Stripe** (payment link statici: Pro Review 29 €, Production Pack).
- Il **form "brief"** (nome, email, tipo evento, data/luogo, organico, materiali, note) **non ha
  backend**: alla submit apre un `mailto:` verso `castellansimone@gmail.com`, in alternativa "Copia i dati".
- Il ritorno da Stripe (`?session_id=`) mostra solo un messaggio lato client.

Problemi: il `mailto:` è fragile (richiede un client email configurato, su mobile spesso fallisce),
i lead non vengono salvati, non c'è collegamento tra pagamento e brief, e lo stage plot disegnato nel
tool si trasmette "a mano" (incolla link / allega file).

## 2. Percorso utente (target)

1. **Tool gratuito** (`/`) — l'utente disegna lo stage plot. Se ha fatto login (Google) può salvarlo in cloud.
2. Clicca la CTA **"Consulenza"** → `/consulenza/`.
3. Sceglie un'offerta → **paga su Stripe** (Pro Review 29 € / Production Pack). Si paga prima.
4. Stripe rimanda su `/consulenza/?session_id=…` → "Pagamento ricevuto", scroll al modulo.
5. **Compila il brief**, e da un **menù a tendina seleziona il progetto** (tra i suoi progetti cloud)
   oggetto della consulenza. Facoltativamente carica allegati esterni (foto palco, vecchi rider).
6. **Invia** → richiesta salvata su Supabase, legata al pagamento e al progetto, con un **link "vivo"**.
7. A Simone arriva l'**email** con i dati + il **link** per vedere lo stage plot (sempre aggiornato).
8. Simone revisiona e risponde entro 24-72 ore con i PDF.

## 3. Obiettivi (scope confermato)

1. **Form → Supabase**: la submit salva la richiesta in un database; nessun lead perso.
2. **Menù progetti + link "vivo"**: l'utente loggato seleziona un suo progetto; a Simone arriva un
   link che apre lo stage plot sempre aggiornato, in **sola lettura**.
3. **Allegati su Storage** (fallback/complemento): materiali esterni al progetto.
4. **Collegamento Stripe con conferma certa**: webhook che verifica il pagamento e marca "pagata".
5. **Notifica email automatica** a `castellansimone@gmail.com` a ogni richiesta.

Fuori scope: redesign visivo/copy della pagina.
**Nel nuovo scope (esteso su scelta utente):** login Google sulla pagina consulenza e una **vista
sola-lettura** che renderizza lo stage plot dal JSON (riusa il motore del tool) → questo **tocca anche
il tool**, non solo `/consulenza/`.

## 4. Decisione architetturale (Approccio A — approvato)

Il form è su pagina pubblica. Per non esporre la `anon key` né aprire il DB a spam, **il browser non
scrive mai direttamente nel database**: chiama **Edge Functions** che operano con la service role.
Tabelle e bucket privati (RLS senza policy pubbliche → invisibili all'anon key). La lettura del
progetto condiviso avviene solo lato server tramite token (vedi §8).

## 5. Auth e menù progetti

- Il menù "i tuoi progetti" richiede **utente autenticato**: `stageplot_projects` ha `user_id` + RLS,
  quindi i progetti sono leggibili solo dal proprietario.
- Login **Google** già presente nel tool. Sulla pagina consulenza (stesso dominio `stageplot.it`) la
  **sessione Supabase è condivisa**: se l'utente era già loggato nel tool, il menù si popola da solo;
  altrimenti compare un pulsante "Accedi con Google" sopra il menù.
- Il menù elenca i progetti dell'utente (`id`, `title`, `updated_at`) letti **dal browser con la
  sessione dell'utente** (RLS lo consente solo sui propri). Selezione singola.
- Va **rimosso** il claim attuale del form "*Niente account, i dati restano sul tuo dispositivo*"
  (diventa falso quando si usa il menù).

## 6. Dati

Progetto Supabase: `vsodplqkuvnsdiikvmjb`. Tabella esistente `stageplot_projects` (cloud-save del tool).

### Tabella `consultation_requests`
| Colonna | Tipo | Note |
|---------|------|------|
| `id` | uuid PK | `gen_random_uuid()` |
| `created_at` | timestamptz | `now()` |
| `name`, `email` | text | obbligatori |
| `event_type`, `date_place`, `lineup`, `materials`, `notes` | text | dal form |
| `project_id` | uuid | nullable, FK → `stageplot_projects.id`; il progetto selezionato |
| `share_token` | text unique | token del link "vivo" (random, non indovinabile) |
| `attachments` | jsonb | array di path Storage (default `[]`) |
| `stripe_session_id` | text | nullable |
| `paid` | boolean | default false |
| `paid_at` | timestamptz | nullable |
| `amount` | integer | centesimi, nullable (dal webhook) |
| `product` | text | nullable (dal webhook) |
| `status` | text | default `new` (`new`/`in_review`/`done`) |

RLS abilitata, **nessuna policy** anon/authenticated → tabella invisibile al browser. Accesso solo via
service role nelle Edge Functions.

### Tabella `consultation_payments`
`stripe_session_id` (unique), `email`, `amount`, `product`, `paid_at`. RLS on, nessuna policy pubblica.

**Perché due tabelle:** il pagamento precede il brief. Il webhook arriva quando `consultation_requests`
non esiste ancora → scrive in `consultation_payments`; alla submit la richiesta si lega per `session_id`.

## 7. Storage

Bucket **`consultation-uploads`**, **privato** (nessun bucket esiste oggi).
- Upload via **URL firmati** generati dalla Edge Function; download via URL firmati nell'email (7 giorni).
- Limiti: max 10 MB/file; tipi `image/*` e `application/pdf`; path `{uuid}/{filename}`.

## 8. Link "vivo" e vista sola-lettura

- Alla submit, se è selezionato un progetto, la function genera uno `share_token` (UUID random) e lo
  salva nella richiesta legato a `project_id`.
- A Simone, nell'email, arriva `https://stageplot.it/view?token=…` (pagina di sola lettura).
- La pagina chiama la Edge Function **`get-shared-project`**: riceve il token → lo valida su
  `consultation_requests` → legge `stageplot_projects` **con service role** (bypass RLS controllato)
  → restituisce il JSON **corrente** del progetto ("vivo") + `updated_at`.
- La **vista** renderizza lo stage plot riusando il **motore del tool in modalità read-only** (nessuna
  modifica, nessun salvataggio). Mostra in alto **"ultima modifica: {updated_at}"** così Simone sa se
  il progetto è cambiato dopo la richiesta.
- Token **revocabile** (campo/flag) e non elencabile; chi ha il link vede il progetto (link destinato
  solo a Simone via email).

## 9. Edge Functions

### `submit-consultation` (due operazioni)
- **`prepare-upload`**: valida nomi/tipi/dimensioni file → restituisce URL firmati + path.
- **`submit`**: valida i campi (obbligatori, honeypot) → se c'è `session_id` cerca il pagamento
  (`paid=true`, copia `amount`/`product`/`paid_at`) → genera `share_token` se c'è `project_id` →
  inserisce la riga → **invia l'email** (riepilogo + link "vivo" + link firmati allegati).

### `stripe-webhook`
- Verifica la firma (`STRIPE_WEBHOOK_SECRET`, raw body) → su `checkout.session.completed` **upsert**
  in `consultation_payments` (idempotente sui retry). Se la richiesta esiste già, la marca `paid=true`.

### `get-shared-project`
- Riceve `token` → valida su `consultation_requests` (non revocato) → legge il progetto con service
  role → restituisce JSON corrente + `updated_at`. Sola lettura.

Tutte usano `SUPABASE_SERVICE_ROLE_KEY` (ambiente Edge Functions).

## 10. Frontend

### `consulenza/index.html`
- Pulsante "Accedi con Google" (se non loggato) + **menù a tendina dei progetti**.
- `<input type="file" multiple accept="image/*,application/pdf">` per allegati esterni + honeypot nascosto.
- Sostituire l'handler `mailto:`: (1) upload allegati su URL firmati; (2) `POST` a `submit` con campi +
  `project_id` + path allegati + `session_id`; (3) stati UI in `#formMsg`.
- Rimuovere il claim "Niente account…".
- Dipendenza: serve `supabase-js` (o chiamate auth REST) **solo** per login + lettura dei propri
  progetti nel menù; le scritture restano via Edge Functions. Mantenere "Copia i dati" come fallback.

### Vista sola-lettura (nuova, tocca il tool)
- Pagina `/view` che carica il progetto via `get-shared-project` e lo renderizza col motore del tool
  in read-only. Da definire in dettaglio nel piano: come isolare il rendering dal resto del tool.

## 11. Email

Provider **Resend**, mittente su `stageplot.it` (o `onboarding@resend.dev` in test). Oggetto
"Nuova richiesta consulenza — {name}". Corpo: riepilogo + stato pagamento + **link "vivo"** + link
allegati. Se l'invio fallisce, la riga è già salvata → lead non perso; errore loggato.

## 12. Sicurezza, errori, edge case

- Tabelle/bucket invisibili all'anon key; scritture solo via function (service role).
- `share_token` UUID random, non elencabile, revocabile; consenso di condivisione implicito nella
  selezione del progetto (aggiungere micro-disclaimer nel form: "il progetto sarà visibile al fonico").
- Anti-spam: honeypot + rate-limit per IP in `submit`.
- Webhook duplicati → upsert idempotente. Doppio submit → bottone disabilitato durante l'invio.
- Paga e non compila → pagamento registrato (lead recuperabile). Compila senza pagare → `paid=false`.
- Email fallita → riga salvata, errore loggato.
- Utente non loggato al ritorno da Stripe → può comunque inviare con allegati; il menù progetti
  compare solo dopo il login.

## 13. Prerequisiti di setup

1. **Account Resend** (utente): registrato con `castellansimone@gmail.com` (free). Niente verifica
   dominio per le notifiche a sé stesso (Resend free invia alla mail dell'account). L'utente crea
   una **API Key** che verrà impostata come secret `RESEND_API_KEY` (non passa in chat).
2. **`success_url` payment link Stripe** = `https://stageplot.it/consulenza/?session_id={CHECKOUT_SESSION_ID}`
   — **lo verifica/sistema Claude** sul dashboard durante la Fase 1 (`acct_1TmwYADywY28rNtZ`).
3. **Webhook** registrato nel dashboard Stripe → function `stripe-webhook`, evento `checkout.session.completed`.
4. **Secrets Edge Functions**: `RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `NOTIFY_EMAIL`.
5. **Login Google** già configurato (auth Supabase) — confermare che funziona sul path `/consulenza/` (Fase 2).

## 14. Testing

- `submit` valido/invalido (campi mancanti, honeypot, file oversize/tipo errato).
- Upload su URL firmato + path salvati.
- `stripe-webhook` con evento firmato (Stripe CLI); idempotenza retry.
- `get-shared-project`: token valido/revocato/inesistente; verifica sola lettura.
- End-to-end: login → paga → torna con `session_id` → seleziona progetto + allegato → invia →
  riga `paid=true` con `share_token`; email ricevuta; link "vivo" apre lo stage plot.

## 15. Note di repo

- Branch `consulenza-supabase` (non `main`: `AGENTS.md` vieta sviluppo diretto su `main`).
- Lavoro in **worktree isolato** `../stageplot-consulenza` (l'utente lavora in parallelo su `main`).
- La vista read-only tocca il tool: valutare se va sul branch `tool` o resta qui, in fase di piano.
- Working tree con modifiche utente non correlate (`favicon.svg?v=2`): tenerle fuori dai commit feature.

## 16. Fasi di consegna

**Fase 1 — Backend form (valore immediato: addio `mailto:`, lead salvati).** Niente auth/menù progetti.
- Tabelle `consultation_requests` + `consultation_payments`; bucket `consultation-uploads`.
- Edge Functions `submit-consultation` (`prepare-upload` + `submit`) e `stripe-webhook`.
- Email via Resend. Frontend: form salva su Supabase, upload allegati, stati UI; rimosso `mailto:`.
- Claude sistema il `success_url` Stripe + registra il webhook.

**Fase 2 — Menù progetti + link "vivo" (tocca il tool).**
- Login Google sulla consulenza; menù a tendina dei progetti dell'utente.
- `share_token` + Edge Function `get-shared-project`; pagina `/view` read-only col motore del tool.
- Rimozione claim "Niente account"; micro-disclaimer di condivisione.
