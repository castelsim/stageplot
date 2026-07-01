# StagePlot — Box feedback "Cosa manca?" (Blocco 1)

**Data:** 2026-07-01
**Stato:** design approvato, in attesa di piano di implementazione
**Autore:** Simone Castellan + Claude

---

## 1. Contesto e posizione nel piano

Questo spec copre **solo il primo blocco** di un piano più ampio (prompt `DATASET AI, BUG TRACKING`) per instrumentare StagePlot. Il piano completo prevedeva: analytics (PostHog), error tracking (Sentry), feedback loop, dataset AI anonimizzato, dashboard admin, consenso/privacy. In sede di brainstorming il piano è stato tagliato per evitare over-engineering: si parte dal **feedback loop**, che ha il miglior rapporto valore/costo e riusa l'infrastruttura esistente.

**Blocchi futuri (fuori da questo spec):** PostHog, Sentry, dataset AI, dashboard admin. Ognuno avrà il proprio spec.

### Architettura attuale rilevante

- **Frontend:** sito statico su GitHub Pages (`stageplot.it`), vanilla JS. Il tool è un monolite generato: `index.template.html` → `build.mjs` → `index.html`.
- **Backend:** Supabase. Pattern consolidato: il client chiama **Edge Functions** (service role); le tabelle hanno **RLS abilitata senza policy** (nessun accesso diretto dal client).
- **Riuso:** `supabase/functions/_shared/email.ts` (`sendEmail({...})`, `buildEmailHtml(...)`) è già in produzione per le consulenze. `_shared/cors.ts` fornisce `corsHeaders`. Le Edge Function usano `Deno.serve(async (req) => …)` e `createClient` da `jsr:@supabase/supabase-js@2`.

## 2. Obiettivo

Permettere a chiunque usi StagePlot di segnalare in-app cosa manca, cosa non funziona o cosa vorrebbe, **senza login obbligatorio**, e trasformare ogni segnalazione in lavoro azionabile: notifica email all'admin contenente un **prompt Claude già pronto** da incollare in Claude Code. Nessuna dashboard.

## 3. Scope

**In scope**
- Componente UI "Cosa manca?" nel tool.
- Tabella `feedback` + tabella `feedback_throttle` (rate-limit) in Supabase.
- Edge Function `submit-feedback` (validazione, anti-spam, insert, email).
- Email admin con prompt Claude compilato.
- Cattura automatica di contesto tecnico leggero + riassunto anonimo del progetto; allegato progetto completo solo su opt-in.

**Fuori scope (YAGNI, per ora)**
- Dashboard admin (si usa Supabase Studio; colonne `status`/`priority`/`category` gestite a mano).
- Dropdown con 13 categorie in UI (si usano 3 chip opzionali; la categoria fine è inferita dopo).
- Snapshot progetto di default (solo su opt-in).
- Evento PostHog `feedback_submitted` (si aggancerà quando si integra PostHog; per ora la notifica è l'email).

## 4. Architettura e flusso dati

```
Tool (index.template.html)
   └─ box "Cosa manca?"  ──POST──▶  Edge Function submit-feedback (service role)
                                          │  1. valida (5–1000 char, honeypot)
                                          │  2. rate-limit per ip_hash (tab. feedback_throttle)
                                          │  3. INSERT in feedback
                                          │  4. sendEmail(admin) col prompt Claude  [best-effort]
                                          ▼
                                     tabella feedback
```

Nessun accesso diretto client → tabella, coerente con consulenza/share.

## 5. Componente UI (nel tool)

- **Collocazione**: su **desktop** pannello collassabile ancorato in **basso a destra** (sfrutta l'area libera accanto al palco, non copre palco né toolbar). Su **mobile** *non* è un pulsante flottante: la voce **"Cosa manca?"** vive dentro il menu **"Altro…"** già presente, e da lì apre lo stesso pannello a tutta larghezza (scelta per non affollare i controlli mobile).
- Pannello collassabile, **theme-aware** con i token del design system (accent teal, dark mode ok — vedi `STAGEPLOT_DESIGN_SYSTEM.md`).
- Elementi:
  - **textarea** con contatore, vincolo 5–1000 caratteri;
  - **3 chip opzionali** a 1 tap, mutuamente esclusivi, non obbligatori: `Bug` · `Manca qualcosa` · `Idea`;
  - **checkbox "allega il mio progetto"**, visibile solo se c'è un progetto aperto (default: off);
  - **campo honeypot nascosto** (es. input `text` fuori viewport, label anti-autofill);
  - bottone **Invia**.
- Stati: `idle` → `sending` (spinner, bottone disabilitato) → `success` (conferma inline "Ricevuto, grazie") | `error` (messaggio + retry, **il testo non va perso**).
- Se l'utente è loggato (sessione Supabase presente): `user_id` ed `email` vengono agganciati automaticamente lato client e passati alla funzione.

## 6. Schema dati (migration `0006_feedback.sql`)

### Tabella `feedback`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `created_at` | timestamptz | `now()` |
| `message` | text | 5–1000 char (validato in Edge Function) |
| `hint` | text | chip scelto: `bug` \| `missing` \| `idea` \| null |
| `category` | text | categoria fine, inferita **dopo**, default null |
| `status` | text | default `new` (`new`/`reviewed`/`sent_to_claude`/`in_progress`/`implemented`/`rejected`/`duplicate`) |
| `priority` | text | null, impostata a mano |
| `user_id` | uuid | null se anonimo; FK `auth.users(id)` on delete set null |
| `user_email` | text | null se anonimo |
| `project_id` | uuid | null; FK `stageplot_projects(id)` on delete set null |
| `app_version` | text | versione del tool (iniettata da `build.mjs`, formato `YYYY.MM.DD`) |
| `page_url` | text | URL della pagina |
| `user_agent` | text | browser/OS/device derivabili da qui (niente colonne separate) |
| `viewport` | text | es. `1440x900` |
| `language` | text | `navigator.language` |
| `tech_context` | jsonb | `{ tool_attivo, stage_size, total_objects, object_types[], last_action }` |
| `project_snapshot` | jsonb | null; popolato **solo** se opt-in |
| `admin_notes` | text | null |

RLS abilitata **senza policy** (accesso solo via service role), come le altre tabelle.

**Scelta di design:** i ~25 campi del prompt originale sono compressi. Browser/OS/device si derivano da `user_agent`; il contesto tecnico va in **un `jsonb`** (`tech_context`) invece di ~10 colonne. Più manutenibile, stesso valore informativo.

### Tabella `feedback_throttle` (rate-limit)

| Colonna | Tipo | Note |
|---|---|---|
| `ip_hash` | text | SHA-256(IP + salt); l'IP **non** è mai salvato in chiaro |
| `window_start` | timestamptz | inizio finestra oraria |
| `count` | int | invii nella finestra |

Chiave: `(ip_hash, window_start)`. Il salt sta in una env var della funzione. Pulizia periodica opzionale (righe vecchie irrilevanti).

## 7. Edge Function `submit-feedback`

Convenzioni identiche alle funzioni esistenti (`Deno.serve`, `corsHeaders`, helper Response JSON, `createClient` service role).

**Passi:**
1. `OPTIONS` → `ok` con `corsHeaders`.
2. Parse body JSON: `message`, `hint?`, `honeypot?`, `context` (tech_context + meta), `user_id?`, `user_email?`, `project_id?`, `project_snapshot?`.
3. **Honeypot**: se il campo nascosto è valorizzato → rispondi `200` (finto successo), **nessun insert**.
4. **Validazione**: `5 ≤ trim(message).length ≤ 1000`, altrimenti `400`.
5. **Rate-limit**: calcola `ip_hash` da `x-forwarded-for` + salt; upsert su `feedback_throttle` nella finestra oraria corrente; se `count > 5` → `429`.
6. **Insert** in `feedback`.
7. **Email best-effort**: `sendEmail(...)` con il prompt Claude. Se fallisce ma l'insert è ok → **comunque `200`**, errore loggato (il feedback non si perde).

**IP:** ricavato da header `x-forwarded-for`. [DA VERIFICARE] disponibilità/formato esatto su Supabase Edge Functions; fallback: se assente, salta il rate-limit ma procedi.

## 8. Email + prompt Claude

- **A:** email admin = `castellansimone@gmail.com` (via env var, come per le consulenze).
- **Oggetto:** `[StagePlot feedback] {chip|generico} — {primi ~50 char del messaggio}`.
- **Corpo** (via `buildEmailHtml` o testo): messaggio originale · contesto tecnico leggibile · **blocco monospace col prompt Claude già compilato**, pronto da copiare.

**Template prompt Claude (compilato dalla funzione):**

```
Un utente di StagePlot ha segnalato: "{message}"

Segnale utente (chip): {hint|nessuno}

Contesto tecnico:
- Browser/OS/device: {da user_agent}
- Viewport / lingua: {viewport} / {language}
- App version / URL: {app_version} / {page_url}
- Progetto: {project_id|nessuno}
- Tool attivo: {tech_context.tool_attivo}
- Dimensione palco: {tech_context.stage_size}
- Oggetti: {tech_context.total_objects} ({tech_context.object_types})
- Ultima azione: {tech_context.last_action}
- Snapshot progetto allegato: {sì/no}

Analizza se è bug, feature mancante, problema UX o richiesta di libreria strumenti.
Proponi soluzione, rischi di regressione e criteri di accettazione.
Non modificare codice senza prima spiegare il piano.
```

## 9. Privacy / GDPR (minimo necessario a questo blocco)

- **Minimizzazione:** nessuno snapshot progetto se non su opt-in esplicito; contesto tecnico limitato a dati non identificativi; IP mai in chiaro (solo hash per rate-limit).
- **Trasparenza:** micro-nota sotto il box (testo definitivo): *"Inviando, accetti che il messaggio e alcuni dati tecnici anonimi vengano usati per migliorare StagePlot."* Link alla privacy policy esistente (`/privacy`).
- L'uso dei progetti cloud per il **dataset AI** è materia del blocco dataset, non di qui: qui il progetto completo viaggia **solo** se l'utente spunta l'allegato, e per l'unico scopo di riprodurre il problema segnalato.

## 10. Error handling

| Situazione | Comportamento |
|---|---|
| Fetch client fallita | messaggio "Non è stato possibile inviare, riprova"; testo preservato |
| Validazione fallita (lunghezza) | `400` + messaggio; UI evidenzia il vincolo |
| Rate-limit superato | `429`; UI: "Hai inviato troppi feedback, riprova più tardi" |
| Honeypot valorizzato | `200` finto, scartato silenziosamente |
| Insert ok + email KO | `200`; errore email loggato server-side |
| Insert KO | `500`; UI invita a riprovare, testo preservato |

## 11. Testing

Unit test in stile `_shared/*.test.ts` (Deno):
- validazione lunghezza (bordi 4/5/1000/1001);
- honeypot → nessun insert;
- rate-limit (6° invio nella finestra → `429`);
- generazione prompt Claude (campi compilati e placeholder quando mancano dati);
- costruzione email (oggetto, presenza blocco prompt).

## 12. Rischi e questioni aperte

- **[DA VERIFICARE]** header IP su Supabase Edge Functions (`x-forwarded-for`).
- **Deciso:** `app_version` iniettata da `build.mjs` al build (formato `YYYY.MM.DD`); se nel tool esiste già una costante di versione, si riusa quella.
- **[DA VERIFICARE]** formato esatto dello snapshot progetto (`.stageplot` JSON) da riusare per `project_snapshot`.
- Il box vive dentro il monolite `index.template.html`: attenzione a inserirlo nel template e rigenerare `index.html` via `build.mjs` (non editare `index.html` a mano).
- Env var nuove: salt rate-limit, indirizzo email admin (se non già presente).

## 13. Criteri di accettazione

1. Un utente anonimo invia un feedback dal box → record in `feedback`, email admin ricevuta col prompt Claude compilato, conferma inline mostrata.
2. Un utente loggato invia → record con `user_id`/`user_email` valorizzati.
3. Spuntando "allega il mio progetto" → `project_snapshot` popolato; senza spunta → null.
4. Messaggio < 5 o > 1000 char → rifiutato con messaggio chiaro, testo non perso.
5. Bot che compila l'honeypot → nessun record, nessuna email.
6. 6 invii dallo stesso IP entro un'ora → il 6° riceve `429`.
7. Box theme-aware corretto in dark mode.
8. `index.html` rigenerato da `build.mjs` (non modificato a mano).
