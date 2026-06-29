# Spec — Flusso consulenza minimale (pagina /consulenza/)

Data: 2026-06-29
Branch: (da creare) `consulenza-minimale`
Stato: in revisione utente

## 1. Contesto e problema

La pagina `/consulenza/` (single-file, CSS+JS inline) oggi vende la revisione tecnica
con un **modulo lungo** (nome, email, tipo evento, data/luogo, organico, materiali, note,
selettore progetto, allegati) separato dai bottoni di pagamento Stripe. Problemi:

- **Attrito alto**: troppi campi prima di pagare; il brief si raccoglie comunque meglio dal vivo.
- **Login azzera il form**: il pulsante "Accedi con Google" fa un redirect a pagina intera
  (`redirectTo` = stessa pagina) → i campi digitati e l'eventuale `?session_id` si perdono.
- **Messaggio contraddittorio**: la pagina dice "senza account", ma per il link vivo serve login Google.
- **Pagamento e dati scollegati**: il modulo è inviabile anche senza aver pagato; la mail parte al
  submit del form, non al pagamento.

La consegna reale è la **sessione live** (`?view={token}`, Fase 3): consulente (admin) come editor,
cliente come viewer in sola lettura. Questo meccanismo resta e diventa il cuore del servizio.

## 2. Percorso utente (target)

1. **Tool gratuito** (`/`) — l'utente disegna lo stage plot e lo salva in cloud (login Google).
2. Clicca **"Consulenza"** → `/consulenza/`. Essendo lo stesso dominio `stageplot.it`, la **sessione
   Supabase è condivisa**: chi era loggato nel tool è già loggato qui.
3. Preme la card del pacchetto voluto (Pro Review 29 € / Production Pack 149 €).
   - **non loggato** → login Google (1 click); al ritorno riprende dal pacchetto scelto.
   - **loggato, con progetti** → mini-selettore **"Per quale progetto?"** (i suoi progetti cloud).
   - **loggato, senza progetti** → messaggio "Crea prima il tuo stage plot" + bottone "Apri il tool".
4. Scelto il progetto → **redirect a Stripe** (Payment Link + `client_reference_id` = id richiesta,
   email precompilata).
5. Pagato → pagina di ritorno **"Grazie, ti contatto entro 24h; tieni il progetto aggiornato"**.
6. A pagamento confermato (webhook) → a **Simone** arriva la mail con **link vivo** `?view={token}` +
   contatto (nome+email) + pacchetto + importo.
7. Simone apre il link → **sessione live** → lavorano insieme → consegna.

Niente più modulo lungo né allegati upfront: il brief si fa dal vivo.

## 3. Obiettivi (scope confermato)

1. **Pagina minimale**: hero + 2 card. Via il modulo brief e gli allegati.
2. **Login obbligatorio prima del pagamento** (sessione condivisa col tool; nessun re-login se già loggato).
3. **Progetto obbligatorio** scelto **prima** del pagamento; chi non ne ha viene mandato al tool.
4. **Aggancio pagamento ↔ progetto ↔ contatto** via `client_reference_id`.
5. **Mail a Simone solo a pagamento confermato**, col link vivo + contatto.

Fuori scope: redesign grafico profondo; mail di conferma al cliente (basta ricevuta Stripe + pagina grazie);
modifica della sessione live (Fase 3, già fatta).

## 4. Decisione architetturale

Conferma l'**Approccio A** già in uso: il browser **non scrive mai** nel DB; opera solo via Edge Functions
con service role. La pre-creazione della richiesta avviene server-side leggendo l'utente dal **suo JWT reale**
(non ci si fida del client). Il `share_token` è generato server-side e **non torna mai al browser**: viaggia
solo nella mail a Simone.

## 5. Pagina `/consulenza/` (frontend)

- Rimuovere la sezione `#intake` (modulo brief + allegati) e la logica relativa (`submit`, `uploadFiles`,
  `buildBody`, honeypot, copy-dati). Restano hero, `#offerte`, `#come-funziona`, `#faq`, footer.
- **Badge login** in topbar: "Accedi con Google" / "Ciao, {nome}". Correggere il copy "senza account"
  → "Accesso con Google (lo stesso del tool)".
- Le card "Acquista" non puntano più direttamente a Stripe: diventano trigger di `startPurchase(product)`:
  1. `sb.auth.getSession()` → se assente, `signInWithOAuth({provider:'google', redirectTo: /consulenza/})`
     dopo aver salvato in `sessionStorage` il `product` scelto. Al ritorno, se c'è un `product` pendente
     e la sessione esiste, riapre il selettore.
  2. Carica i progetti dell'utente (`stageplot_projects`, RLS → solo i suoi). Se 0 → pannello "vai al tool".
  3. Selezione progetto → `POST create-consultation` (JWT utente) → riceve `request_id` → redirect a
     `PAYMENT_LINK[product] + "?client_reference_id=" + request_id + "&prefilled_email=" + email`.
- **Ritorno post-pagamento**: se `?session_id` (o `?paid=1`) presente → mostra la sezione "Grazie".

## 6. Backend — Edge Functions

### 6.1 `create-consultation` (nuova, verify_jwt = true)
- Input: `{ project_id, product }`. Header `Authorization: Bearer {access_token utente}`.
- Legge l'utente dal token (`auth.getUser`): ricava `user_id`, `email`, `name` (da user_metadata).
- **Verifica ownership**: carica `project_id` con un client sul JWT utente (RLS) → 403 se non è suo
  o non esiste.
- Inserisce in `consultation_requests`: `{ user_id, name, email, product, project_id,
  share_token = crypto.randomUUID(), status:'new', paid:false }`.
- Ritorna `{ request_id }`. **Nessuna mail.**

### 6.2 `stripe-webhook` (modifica)
- Su `checkout.session.completed`, oltre all'attuale upsert `consultation_payments`:
  - leggere `s.client_reference_id` (= `request_id`).
  - `update consultation_requests set paid=true, paid_at=now(), amount, product where id = request_id`.
  - caricare la richiesta aggiornata (`project_id`, `share_token`, `name`, `email`, `product`, `amount`).
  - inviare la **mail a `NOTIFY_EMAIL`** con: contatto (nome+email), pacchetto+importo, link vivo
    `https://stageplot.it/?view={share_token}`.
- Mantenere il fallback per `stripe_session_id` (compatibilità) ma il percorso primario è `client_reference_id`.

### 6.3 `submit-consultation` (dismessa)
- Non più chiamata dal flusso minimale. Lasciare deployata ma non referenziata (o rimuovere a fine
  migrazione). `prepare-upload`/`submit` non usati.

## 7. Dati — migrazione `0004_consultation_minimal.sql`

- `alter table consultation_requests add column user_id uuid references auth.users(id)` (nullable).
- `alter table consultation_requests add column product text` (nullable) — se non già presente.
- I campi brief esistenti (`event_type`, `lineup`, `materials`, `notes`, `attachments`, `date_place`)
  restano nullable e non più compilati. Nessun drop (reversibilità).

## 8. Mail a Simone (a pagamento confermato)

- Oggetto: `Nuova consulenza pagata — {product} — {name}`.
- Corpo (HTML semplice, riusa `_shared/email.ts`):
  - Contatto: `{name} <{email}>`
  - Pacchetto: `{product}` — Importo: `{amount/100} €`
  - **Link vivo**: `https://stageplot.it/?view={share_token}`

## 9. Sicurezza ed edge case

- `share_token` server-side, mai restituito al client.
- `create-consultation` verifica ownership del progetto → niente token su progetti altrui.
- Richieste non pagate restano `paid=false` (ignorabili/pulibili).
- Se l'utente abbandona dopo `create-consultation` ma prima di pagare → riga `paid=false` orfana: accettabile.
- `client_reference_id` sui Payment Link: accettato via URL (docs Stripe); il webhook lo legge.
- `prefilled_email` migliora la ricevuta Stripe ma non è la fonte di verità del contatto (lo è il JWT).

## 10. Verifica (come collaudare)

1. **create-consultation**: con JWT utente reale e un progetto proprio → 200 + `request_id`; con
   `project_id` altrui → 403.
2. **Redirect Stripe**: il link contiene `client_reference_id`; checkout di prova in modalità test.
3. **Webhook**: `checkout.session.completed` con `client_reference_id` → richiesta marcata `paid`, mail
   ricevuta da Simone col link vivo corretto.
4. **Frontend**: non loggato → login → ritorno al selettore; senza progetti → CTA tool; con progetti →
   selezione → redirect.
5. **Sessione live**: aprire il link vivo della mail come admin → editor (già verificato).

## 11. Fuori scope / follow-up

- Pulizia periodica richieste `paid=false` vecchie.
- Eventuale mail di conferma al cliente (deciso: no, per ora).
- Rate-limit per IP su `create-consultation` (come già annotato per submit).
