# Spec — Analytics minimi privacy-friendly (Fase 0 "Strumentare")

**Data:** 2026-07-03 · **Stato:** in attesa di approvazione PO
**Fonte:** schema a gate (sanity check community 02/07: Fase 0 = strumentare + numeri reali) e
data strategy (quality gate del dataset richiede eventi d'uso; oggi non esiste alcuna raccolta).

## Principi
- **Zero fornitori nuovi**: si usa Supabase (già responsabile del trattamento in privacy). Niente
  Plausible/GA/terzi, niente script esterni.
- **Zero cookie banner**: nessun identificatore persistente per gli anonimi (vedi "Identità").
- **Fire-and-forget**: l'invio non blocca mai la UI, fallisce in silenzio, non retry.
- **Niente nei momenti sbagliati**: nessun evento in viewer `?view=` né in consulenza
  (`__consultMode`) — inquinerebbero i numeri e traccerebbero i clienti del consulente.

## Eventi v1 (6, non uno di più)

| Evento | Quando | Perché |
|---|---|---|
| `app_open` | avvio tool (non viewer/consulenza) | DAU, baseline funnel |
| `project_activated` | il progetto raggiunge 3 elementi (una volta per sessione) | attivazione = soglia quality gate |
| `export` | export riuscito, `props.format` = pdf/png/stageplot | segnale principe quality gate |
| `share_created` | creazione link di condivisione | segnale forte + funnel condivisione |
| `login_success` | login Google riuscito | conversione anonimi→account |
| `cloud_first_save` | primo salvataggio online di un progetto | ingresso nel funnel dataset |

**Proprietà comuni:** `ts`, `event`, `session_id`, `user_id` (solo se loggato), `props` jsonb
(`format`, `logged` bool, `mobile` bool, `app_version`). **Mai:** IP (non persistito), user agent
completo, URL/referrer, dati del progetto.

## Identità e retention (decisione chiave)
- `session_id` = UUID random in `sessionStorage` (muore alla chiusura del tab). Gli **anonimi**
  producono solo metriche aggregate (DAU, tassi di attivazione/export per sessione): nessun
  identificatore persistente → niente consenso ePrivacy, niente banner.
- I **loggati** hanno `user_id`: la retention 30gg del GATE 1→2 si misura su di loro — che è
  esattamente la coorte che alimenta il dataset. Base giuridica: legittimo interesse, dichiarato
  in privacy, opt-out condiviso con quello del dataset.
- **Alternativa scartata** (device_id persistente in localStorage anche per anonimi): darebbe la
  retention degli anonimi ma è un identificatore ePrivacy → zona grigia senza banner. Contro la
  strategia "zero popup". Riapribile in futuro se il gate lo richiede.

## Storage
- Migration `0009_analytics_events.sql`: tabella `public.analytics_events`
  (`id` bigint identity, `created_at`, `event` text, `session_id` uuid, `user_id` uuid null,
  `props` jsonb default '{}').
- **RLS**: INSERT-only per `anon` e `authenticated` (with check: `event` in whitelist,
  `user_id` null o = `auth.uid()`); **nessuna SELECT/UPDATE/DELETE dal client**. Lettura solo
  service role / SQL editor.
- Ritenzione: eventi grezzi 12 mesi (pulizia manuale/cron futura), aggregati per sempre.

## Invio (client)
- REST insert Supabase via `fetch` con `keepalive: true` (sopravvive alla chiusura pagina),
  anon key già presente nel client. Nessuna edge function (niente da nascondere: la whitelist
  la fa RLS).
- Coda in memoria + flush immediato (6 eventi rari: niente batching sofisticato).
- Guard unico `track(event, props)` nel main scope, no-op se viewer/consulenza.

## Privacy (contestuale al deploy)
Aggiungere in `privacy/index.html` (sezione 2 + tabella finalità):
- "Dati d'uso anonimi o pseudonimi (eventi tecnici come apertura, esportazione, condivisione)
  per capire come viene usato lo strumento e migliorarlo. Nessun identificatore persistente
  senza account; con l'account, gli eventi sono collegati ad esso."
- Base: legittimo interesse (art. 6.1.f). Opt-out: stessa strada del dataset (email, poi toggle).
- **Regola di coerenza**: privacy aggiornata nello stesso deploy dell'attivazione eventi.

## Metriche derivate (query SQL, niente dashboard per ora)
DAU · attivazione (activated/open) · export rate · conversione login · retention 30gg (loggati)
→ sono esattamente i numeri dei gate dello schema community e le soglie del quality gate dataset.

## Verifica (e2e)
1. Tool anonimo: open/activated/export → 3 righe in tabella con `user_id` null, `props` corretti.
2. Loggato: login_success + cloud_first_save con `user_id` valorizzato.
3. Viewer `?view=` e consulenza: zero righe.
4. RLS: select da anon key → negata; insert con `event` fuori whitelist → negata.
5. Privacy live aggiornata nello stesso deploy.
