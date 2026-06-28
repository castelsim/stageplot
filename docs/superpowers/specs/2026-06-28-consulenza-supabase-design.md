# Spec — Form consulenza su Supabase (pagina /consulenza/)

Data: 2026-06-28
Branch: `consulenza-supabase`
Stato: design approvato, in attesa di review dello spec scritto

## 1. Contesto e problema

La pagina `consulenza/index.html` (single-file, CSS+JS inline) vende un servizio di
revisione tecnica di stage plot. Oggi:

- Le **offerte** rimandano a checkout **Stripe** (payment link statici: Pro Review 29 €, Production Pack).
- Il **form "brief"** (nome, email, tipo evento, data/luogo, organico, materiali, note) **non ha
  backend**: alla submit apre un `mailto:` verso `castellansimone@gmail.com`, in alternativa "Copia i dati".
- Il ritorno da Stripe (`?session_id=`) mostra solo un messaggio lato client.

Problemi: il `mailto:` è fragile (richiede un client email configurato, su mobile spesso fallisce),
i lead non vengono salvati, non c'è collegamento tra pagamento e brief, gli allegati si gestiscono
"a mano" (incolla link).

## 2. Obiettivi (scope confermato dall'utente)

1. **Form → Supabase**: la submit salva la richiesta in un database; nessun lead perso.
2. **Allegati su Storage**: l'utente carica foto del palco / vecchi rider / input list nel form.
3. **Collegamento Stripe con conferma certa**: un webhook verifica il pagamento e marca la richiesta "pagata".
4. **Notifica email automatica** a `castellansimone@gmail.com` a ogni nuova richiesta.

Fuori scope: redesign visivo/copy della pagina; modifiche al tool principale; account utente sul form.

## 3. Decisione architetturale (Approccio A — approvato)

Il form è su pagina pubblica. Per non esporre la `anon key` né aprire il DB a spam, **il browser non
scrive mai direttamente nel database**: chiama **Edge Functions** che operano lato server con la
service role. Tabelle e bucket restano privati (RLS senza policy pubbliche → invisibili all'anon key).

## 4. Dati

Progetto Supabase: `vsodplqkuvnsdiikvmjb`.

### Tabella `consultation_requests`
| Colonna | Tipo | Note |
|---------|------|------|
| `id` | uuid PK | `gen_random_uuid()` |
| `created_at` | timestamptz | `now()` |
| `name` | text | obbligatorio |
| `email` | text | obbligatorio |
| `event_type` | text | |
| `date_place` | text | |
| `lineup` | text | |
| `materials` | text | |
| `notes` | text | |
| `attachments` | jsonb | array di path Storage (default `[]`) |
| `stripe_session_id` | text | nullable, da `?session_id=` |
| `paid` | boolean | default false |
| `paid_at` | timestamptz | nullable |
| `amount` | integer | centesimi, nullable (dal webhook) |
| `product` | text | nullable (dal webhook) |
| `status` | text | default `new` (`new`/`in_review`/`done`) |

RLS: abilitata, **nessuna policy** per `anon`/`authenticated` → tabella non leggibile/scrivibile dal browser.
Accesso solo via service role nelle Edge Functions.

### Tabella `consultation_payments`
| Colonna | Tipo | Note |
|---------|------|------|
| `stripe_session_id` | text PK/unique | |
| `email` | text | da Stripe |
| `amount` | integer | centesimi |
| `product` | text | |
| `paid_at` | timestamptz | `now()` |

RLS: abilitata, nessuna policy pubblica.

**Perché due tabelle:** il pagamento avviene *prima* del brief. Il webhook
`checkout.session.completed` arriva quando la riga `consultation_requests` non esiste ancora, quindi
scrive in `consultation_payments`. Quando l'utente poi compila il brief (con `session_id` nell'URL),
la richiesta si lega al pagamento (lookup per `session_id`, `paid=true`). Se uno paga ma non compila,
il lead pagante resta comunque registrato in `consultation_payments`.

## 5. Storage

Bucket **`consultation-uploads`**, **privato**. (Stato attuale: nessun bucket esiste.)
- Upload solo via **URL firmati** generati dalla Edge Function (non si espone insert anonimo).
- Download solo via URL firmati inclusi nell'email (validità 7 giorni).
- Limiti: max 10 MB/file; tipi consentiti `image/*` e `application/pdf`.
- Path namespacing: `{request_id o uuid}/{filename}`.

## 6. Edge Functions

### `submit-consultation` (2 operazioni, una function)
- **`prepare-upload`**: riceve nomi+tipi dei file → valida tipo/dimensione → genera e restituisce
  URL firmati di upload + i path attesi.
- **`submit`**: riceve i campi del form + i path allegati + `session_id` (se presente) →
  valida (campi obbligatori, honeypot) → cerca il pagamento in `consultation_payments` per
  `session_id` (se trovato: `paid=true`, copia `amount`/`product`/`paid_at`) → inserisce la riga in
  `consultation_requests` → **invia l'email** a `NOTIFY_EMAIL` con riepilogo + link firmati agli allegati.

### `stripe-webhook`
- Riceve gli eventi Stripe → **verifica la firma** con `STRIPE_WEBHOOK_SECRET` (raw body) → su
  `checkout.session.completed`: **upsert** in `consultation_payments` su `stripe_session_id`
  (idempotente sui retry di Stripe). Se per quel `session_id` esiste già una `consultation_requests`
  (caso raro: brief inviato prima del webhook), la marca `paid=true`.

Entrambe usano `SUPABASE_SERVICE_ROLE_KEY` (disponibile nell'ambiente Edge Functions).

## 7. Frontend — `consulenza/index.html`

- Aggiungere `<input type="file" multiple accept="image/*,application/pdf">` (foto palco / vecchi rider / input list).
- Aggiungere un campo **honeypot** nascosto (anti-spam).
- Sostituire l'handler `mailto:` con:
  1. se ci sono file → chiama `prepare-upload` → carica i file sugli URL firmati (PUT);
  2. `POST` a `submit` con campi + path allegati + `session_id` (da `URLSearchParams`);
  3. stati UI in `#formMsg`: "Invio in corso…" / "Richiesta ricevuta, ti rispondo entro 24 ore." / errore.
- **Nessuna dipendenza nuova**: solo `fetch` agli endpoint (niente `supabase-js` nel browser) →
  coerente col single-file local-first.
- Mantenere "Copia i dati" come fallback se la function è irraggiungibile.
- Config endpoint: costante con l'URL base delle Edge Functions + `anon key` (pubblica, usata solo
  per invocare le function; non dà accesso ai dati perché le tabelle non hanno policy).

## 8. Email

Provider **Resend**. Mittente sul dominio `stageplot.it` (o `onboarding@resend.dev` in test).
Oggetto: "Nuova richiesta consulenza — {name}". Corpo: riepilogo evento + stato pagamento + link
firmati agli allegati. Se l'invio fallisce, **la riga è già salvata** → il lead non si perde; l'errore
viene loggato (no blocco della risposta all'utente).

## 9. Sicurezza, errori, edge case

- Tabelle e bucket invisibili all'`anon key`; ogni scrittura passa per le function (service role).
- Anti-spam: honeypot + rate-limit per IP nella function `submit`.
- Validazione lato server: campi obbligatori, dimensione/tipo file.
- Webhook duplicati → upsert idempotente su `stripe_session_id`.
- Doppio submit lato client → disabilitare il bottone durante l'invio.
- Utente paga ma non compila brief → pagamento registrato (lead recuperabile via email Stripe).
- Utente compila senza pagare → salvato con `paid=false` (caso legittimo: vuole prima un contatto).
- Invio email fallito → riga salvata comunque, errore loggato.

## 10. Prerequisiti di setup (da verificare/procurare prima dell'implementazione)

1. **Account Resend** + dominio `stageplot.it` verificato (o `onboarding@resend.dev` per test).
2. **Payment link Stripe**: il `success_url` deve essere
   `https://stageplot.it/consulenza/?session_id={CHECKOUT_SESSION_ID}` — necessario per legare
   pagamento↔brief. DA VERIFICARE sul dashboard (account `acct_1TmwYADywY28rNtZ`, payment link già esistenti).
3. **Endpoint webhook** registrato nel dashboard Stripe verso la function `stripe-webhook`, evento
   `checkout.session.completed`.
4. **Secrets Edge Functions**: `RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `NOTIFY_EMAIL=castellansimone@gmail.com`.

## 11. Testing

- `submit` con payload valido/invalido (campi mancanti, honeypot pieno, file troppo grande/tipo errato).
- Upload su URL firmato e verifica path salvati.
- `stripe-webhook` con evento firmato (Stripe CLI `stripe trigger checkout.session.completed`);
  verifica idempotenza sui retry.
- Flusso end-to-end: paga → torna con `session_id` → compila brief con allegato → riga `paid=true`,
  email ricevuta con link funzionante.

## 12. Note di repo

- Branch dedicato `consulenza-supabase` (non `main`: `AGENTS.md` vieta sviluppo diretto su `main`).
- Nella working tree esistono modifiche dell'utente non correlate (`favicon.svg?v=2` in `index.html`
  e `index.template.html`): vanno tenute fuori dai commit di questa feature.
