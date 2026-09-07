# StagePlot Orchestre

Spin-off di StagePlot per chi mette insieme un'orchestra: musicisti, organici per ogni produzione,
richieste di disponibilità, conferme, storico. Vive a `stageplot.it/orchestre/` ed è un'applicazione
distinta dall'editor: condivide con StagePlot solo il dominio, il login Google e il progetto Supabase.

Questo README copre il **lotto 1** (fondazioni): pagine, login, profilo, organizzazioni, ruoli, cataloghi,
RLS, test. I lotti successivi (roster, produzioni, matching, convocazioni, storico, candidature,
collegamento a StagePlot) aggiungono cartelle e migrazioni con lo stesso schema.

## Struttura

```
orchestre/
  index.html                  presentazione pubblica (indicizzabile)
  login/index.html            accesso con Google, ritorno OAuth, smistamento
  admin/index.html            area di gestione (staff dell'organizzazione)
  admin/impostazioni/         membri, ruoli, registro
  ui.css                      token del design system di StagePlot + componenti
  src/config.js               URL e anon key di Supabase (pubblici), ruoli
  src/sb.js                   il client supabase-js (PKCE), uno per pagina
  src/auth.js                 sessione, profilo, organizzazione attiva, guardie di rotta
  src/ui.js                   esc, el, toast, confirm, stati, formattazioni
  src/nav.js                  le schede dell'area admin
  src/api/org.js              chiamate per membri e organizzazione
  src/pages/*.js              un modulo per rotta
  test/pure.test.mjs          funzioni pure (Node, senza rete)
  test/pages.test.mjs         shell HTML, CSP, moduli, allowlist del deploy
  test/rls.test.mjs           scenario E contro un Supabase locale
supabase/migrations/0041_orc_identity.sql   profili, organizzazioni, ruoli, RPC, RLS
supabase/migrations/0042_orc_catalogs.sql   strumenti e competenze (seed)
```

Regole: **una cartella per rotta** (GitHub Pages non riscrive nulla, `404.html` è una vera 404);
**moduli ES nativi**, nessun build, nessun `package.json`; CSP senza script né stili inline;
tabelle e funzioni con prefisso `orc_`, Edge Function con prefisso `orc-`; l'autorizzazione sta
**nel database** (RLS + RPC `security definer`), mai in un bottone nascosto.

## Avvio locale

```
cd stageplot                                   # radice del repo
python3 -m http.server 8077 --bind 127.0.0.1   # poi http://127.0.0.1:8077/orchestre/
```

Le pagine parlano con il progetto Supabase di **produzione** (`src/config.js`). Per provare l'area
admin senza toccare la produzione si usa il Supabase locale (sotto) e si punta temporaneamente
`SB_URL`/`SB_ANON` in `src/config.js` e la `connect-src` della CSP delle shell al locale — senza
committare la modifica.

## Supabase locale (Docker)

```
supabase start          # prima volta: scarica le immagini (qualche minuto)
supabase db reset       # applica TUTTE le migrazioni da zero (0000 → 0042): prova di riproducibilità
supabase status -o json # URL e chiavi locali (non vanno mai su disco né nel repo)
```

Gotcha visto il 04/09/2026: dopo `db reset` Kong può tenere in cache il vecchio IP del container
auth (502 su `/auth/v1/*`). Rimedio: `docker restart supabase_kong_vsodplqkuvnsdiikvmjb`.

Gotcha: l'immagine Postgres locale **non dà più i privilegi di default** ad `anon`/`authenticated`
sulle tabelle nuove. Le migrazioni `orc_` scrivono i `grant` esplicitamente: fallo anche nelle
prossime.

## Verifiche

```
node build.mjs --check                      # l'editor: generati allineati (non tocchiamo il template)
node test/engines.test.mjs                  # suite dell'editor (contiene anche il test su SW/allowlist)
node --test orchestre/test/*.test.mjs       # test di Orchestre; RLS solo se il locale è acceso
ORC_RLS=1 node --test orchestre/test/*.test.mjs   # RLS obbligatoria: senza locale è rosso
deno lint orchestre/src                     # lint (Deno è già in CI, zero dipendenze)
```

Ogni rimedio si prova rimettendo il difetto: un test verde che non diventa rosso sabotando il
codice non guarda niente. Per la RLS: aggiungere una policy permissiva nel locale e pretendere il rosso.

## Messa in produzione (azioni umane)

1. **Redirect URL** in dashboard Supabase → Authentication → URL Configuration → Redirect URLs:
   `https://stageplot.it/orchestre/login/` e, per le prove, `http://127.0.0.1:8077/orchestre/login/`.
   Senza, il login Google torna al Site URL e non a Orchestre.
2. **Migrazioni**: `supabase db push` dal repo (chiede la password del DB). Prima: `supabase db reset`
   in locale dev'essere verde.
3. **Prima organizzazione**: il proprietario fa un accesso a `stageplot.it/orchestre/login/` (così
   esiste in `auth.users`), poi da `COWORK/STAGEPLOT/ops/`:
   `./orc-bootstrap.sh "Nome" nome-org email@…` (usa la service_role dalla CLI, solo in memoria).
4. Merge della PR: `main` pubblica in automatico; `orchestre` è nell'allowlist di `pages.yml`.

## Modello dei ruoli

`owner` · `admin` · `artistic` · `production` (staff: entrano nell'area admin) · `section` · `viewer`
(nel modello, senza pagina per ora). I ruoli si cambiano solo con `orc_set_member_role` (owner/admin;
il ruolo owner lo tocca solo un owner; l'ultimo owner non si degrada). Si aggiunge per email con
`orc_add_member_by_email`: la persona deve aver fatto almeno un accesso.

## Limiti del lotto 1

- Nessuna pagina per musicisti, `section`, `viewer`: chi entra senza un ruolo di staff vede la spiegazione.
- La home di Orchestre non è ancora in sitemap né linkata dalla landing di StagePlot.
- Nessuna Edge Function nuova: tutto passa da PostgREST + RPC.
- I test RLS coprono profili, organizzazioni, membership, cataloghi; le tabelle dei lotti successivi
  porteranno i loro.
