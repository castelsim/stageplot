# StagePlot Orchestre

Spin-off di StagePlot per chi mette insieme un'orchestra: musicisti, organici per ogni produzione,
richieste di disponibilità, conferme, storico. Vive a `stageplot.it/orchestre/` ed è un'applicazione
distinta dall'editor: condivide con StagePlot solo il dominio, il login Google e il progetto Supabase.

Coperti: **lotto 1** (fondazioni: pagine, login, profilo, organizzazioni, ruoli, cataloghi, RLS, test),
**lotto 2** (roster: pool dei musicisti, strumenti, competenze, repertorio, tag, import CSV, dati demo) e
**lotto 3** (produzioni: date, repertorio, organico a sezioni/ruoli/posti, modelli, assegnazioni, storia),
**lotto 4** (matching: motore puro e spiegabile, pesi versionati, snapshot delle proposte, override con motivo),
**lotto 5** (convocazioni: inviti con link e token, email via worker, risposta in due tocchi, conferme, riserve,
promemoria, revoche, scadenze), **lotto 6** (storico e affidabilità: feedback post-produzione, indicatori con il
campione, tasso di risposta e valutazioni dentro il matching), **lotto 7** (candidature e area musicista: profilo
globale con onboarding in otto passi, candidatura per organizzazione, valutazioni interne, accettazione che crea il
musicista, file privati con URL firmati, consensi, export e cancellazione), **lotto 8** (collegamento a StagePlot: la
produzione punta a un progetto dell'editor, le postazioni-persona del disegno diventano posti dell'organico, dal hub
Produzione dell'editor si arriva alla produzione e da questa si apre il progetto), **lotto 9** (integrazione V1/a: il
legame scende al posto fisico con la parte dedotta dall'etichetta, ogni posto sa la sua postazione, l'editor mostra
nome e stato sulla postazione e nel pannello, e chiede prima di cancellare una postazione con una persona sopra).

## Struttura

```
orchestre/
  index.html                  presentazione pubblica (indicizzabile)
  login/index.html            accesso con Google, ritorno OAuth, smistamento
  admin/index.html            area di gestione (staff dell'organizzazione)
  admin/impostazioni/         membri, ruoli, registro
  admin/musicisti/            il pool: ricerca, filtri, lista
  admin/musicisti/scheda/     scheda di un musicista (?id= apre, ?new=1 crea)
  admin/musicisti/importa/    import da CSV con anteprima
  admin/produzioni/           le produzioni: lista con date, stato, posti coperti
  admin/produzioni/scheda/    una produzione: Dati · Date · Repertorio · Organico · Matching · Convocazioni · Feedback · Storia
  rispondi/index.html         la pagina del musicista convocato (?t=TOKEN): niente account, niente supabase-js
  richiedi/index.html         «Richiedi musicisti»: il cliente che ha disegnato il palco chiede le persone (?p=progetto)
  admin/richieste/            le richieste arrivate dai clienti, con la copia del palco al momento dell'invio
  candidatura/index.html      pagina pubblica: cos'è, come funziona, chi accetta candidature → login
  musicista/index.html        l'area del musicista: profilo in otto passi (?v=profilo&step=N), candidature, inviti, incarichi, privacy
  privacy/index.html          l'informativa (versione in domain/applications.js: PRIVACY_VERSION)
  admin/candidature/          le candidature ricevute; admin/candidature/scheda/ il dettaglio con valutazioni e stato
  demo/musicisti-demo.csv     40 musicisti INVENTATI, nel formato dell'import
  ui.css                      token del design system di StagePlot + componenti
  src/config.js               URL e anon key di Supabase (pubblici), ruoli
  src/sb.js                   il client supabase-js (PKCE), uno per pagina
  src/auth.js                 sessione, profilo, organizzazione attiva, guardie di rotta
  src/ui.js                   esc, el, toast, confirm, stati, formattazioni
  src/nav.js                  le schede dell'area admin
  src/api/org.js              chiamate per membri e organizzazione
  src/api/musicians.js        chiamate per il pool
  src/api/productions.js      chiamate per produzioni e organico
  src/api/matching.js         fatti, pesi, snapshot, override
  src/api/invitations.js      inviti, azioni dello staff, elenco
  src/api/feedback.js         feedback post-produzione, indicatori, storico del musicista
  src/api/applications.js     profilo, file, candidatura, inviti/incarichi via account, privacy; lato staff elenco/dettaglio/stato/valutazioni
  src/api/stageplot.js        i miei progetti StagePlot (own-rows), documento, catalogo con le chiavi dell'editor, import, collegamenti, scollega
  src/api/client-requests.js  le richieste dei clienti: chi riceve, invio, le mie; lato società elenco, dettaglio, stato
  src/domain/client-request.js  campi obbligatori, postazioni da spuntare, copia funzionale del palco, conteggio (puro, testato)
  src/domain/stageplot-import.js  dal documento dell'editor alle postazioni: varianti, mappa tipo → strumento, proposta, differenze (puro, testato)
  src/domain/applications.js  stati (interni e pubblici), passi, completamento, versione dell'informativa (puro, testato)
  src/domain/csv.js           CSV → righe per l'import (puro, testato)
  src/domain/staffing.js      modelli di organico, etichette, raggruppamento posti (puro, testato)
  src/domain/matching.js      IL MOTORE: fase A requisiti, fase B punteggio, spiegazioni (puro, testato)
  src/pages/*.js              un modulo per rotta
  test/pure.test.mjs          funzioni pure (Node, senza rete)
  test/pages.test.mjs         shell HTML, CSP, moduli, allowlist del deploy
  test/rls.test.mjs           scenario E contro un Supabase locale
  test/rls-roster.test.mjs    scenario E per il pool
  test/csv.test.mjs           il parser CSV e il file demo
  test/staffing.test.mjs      modelli coerenti col catalogo, stati, raggruppamento
  test/rls-productions.test.mjs  scenario E per produzioni, posti, storia append-only
  test/matching.test.mjs      il motore: regola Morricone, cold start, rinunce, scala, determinismo
  test/rls-matching.test.mjs  scenario E per fatti, snapshot, override, pesi
  test/rls-invitations.test.mjs  il flusso completo delle convocazioni, con il worker e il musicista simulati
  test/rls-feedback.test.mjs  feedback per org, indicatori con campione, storico, affidabilità nel matching
  test/applications.test.mjs  stati e maschera pubblica allineati al DB, completamento, passi
  test/rls-applications.test.mjs  scenario A + E: profilo, file nel bucket, candidatura, valutazioni invisibili, accettazione, area
  test/stageplot-import.test.mjs  varianti, doppie = 2 posti, tipi sconosciuti, proposta per famiglia, differenze, stale
  test/rls-stageplot.test.mjs  il progetto lo legge chi lo possiede; import che allarga e mai restringe; collegamenti solo allo staff; scollega
supabase/migrations/0041_orc_identity.sql   profili, organizzazioni, ruoli, RPC, RLS
supabase/migrations/0042_orc_catalogs.sql   strumenti e competenze (seed)
supabase/migrations/0043_orc_roster.sql     pool dei musicisti, import, lista
supabase/migrations/0044_orc_productions.sql produzioni, date, organico, posti, eventi, RPC
supabase/migrations/0045_orc_matching.sql   pesi versionati, fatti per il matching, snapshot, override
supabase/migrations/0046_orc_invitations.sql inviti, date, segreti (solo service_role), eventi append-only, RPC
supabase/migrations/0047_orc_feedback.sql   feedback, orc_musician_stats, orc_musician_history, fatti del matching con affidabilità
supabase/migrations/0048_orc_applications.sql profili, candidature, eventi, valutazioni, consensi, file, bucket orc-files con policy, RPC
supabase/migrations/0049_orc_stageplot.sql  orc_stageplot_links, orc_stageplot_import, orc_stageplot_unlink, orc_productions_for_project
supabase/migrations/0050_orc_stageplot_seats.sql  legame → posto (slot_id, seat_index), import per gruppi, orc_stageplot_relink, orc_stage_view, orc_staffing con la postazione
supabase/migrations/0052_orc_client_requests.sql  «Richiedi musicisti»: richieste dei clienti, posti chiesti, copia immutabile, chi riceve
supabase/migrations/0051_orc_collaudo.sql   collaudo: il posto della persona non si sposta, i file solo nel proprio dossier, valutazioni e feedback legati al bersaglio, stato interno mascherato nel DB, consensi non cancellabili, registro con lo stato di partenza
supabase/migrations/0053_orc_service_org.sql  la società che riceve le richieste (is_service_provider), accesa solo se non c'è dubbio
supabase/migrations/0054_orc_candidature_societa.sql  a chi ci si candida, leggibile anche da fuori (orc_service_org_public)
supabase/migrations/0055_orc_inviti_musicisti.sql  invito personale (impronta, mai il segreto), fotografia sul profilo, ingresso diretto, orc_application_accept
supabase/functions/orc-respond/             la porta del musicista (GET apre, POST risponde), verify_jwt=false
supabase/functions/orc-notify/              il worker: scadenze, prese stantie, email via Resend, segreti cancellati
supabase/functions/_shared/orc-invitations.ts  email, parsing della risposta, token: puro, con test Deno
supabase/seed.sql                           dati demo per il LOCALE (generati da scripts/orc-demo.py)
scripts/orc-demo.py                         genera seed.sql e musicisti-demo.csv (deterministico)
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

## Dati dimostrativi

Tutto inventato (email `@example.invalid`, telefoni con `000`): il repo è pubblico e nessuna persona vera
ci entra. `python3 scripts/orc-demo.py` rigenera in modo deterministico `supabase/seed.sql` (per il
locale: `supabase db reset` lo applica e crea l'utente `demo@example.invalid` / `Prova-1234!`, owner di
«Orchestra Demo» con 40 musicisti) e `orchestre/demo/musicisti-demo.csv` (lo stesso roster, da caricare in
produzione dalla pagina Musicisti → Importa). Circa metà dei musicisti ha «Ennio Morricone» nel repertorio
con fonte «dallo storico», e il seed crea anche **tre produzioni concluse** (due Morricone, una Pooh) con
i posti confermati e la loro storia, più una produzione 2026 con l'organico da modello e 42 posti scoperti:
è il materiale su cui lavora il matching del lotto 4.

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

## Organico: ruoli, posti, storia

Un **ruolo** è l'esigenza aggregata («Violini secondi, 5 posti»); i **posti** nascono e muoiono con i
`seats` del ruolo (trigger `orc_roles_sync_slots`): se ne tolgono solo di aperti, mai uno occupato.
Le assegnazioni passano da `orc_assign_slot` / `orc_release_slot` (staff dell'org, controllo sul server);
il client non ha policy di scrittura sui posti. Ogni cambio scrive in `orc_slot_events`, **append-only**:
una rinuncia è un evento con chi e perché, non una cancellazione. `orc_apply_staffing_template` e
`orc_duplicate_staffing` funzionano solo su una produzione senza ruoli.

## Matching

Il punteggio lo calcola il browser con `src/domain/matching.js`; il database raccoglie i **fatti** in una
sola lettura (`orc_matching_candidates`: strumenti, competenze, repertorio, storico per stessa produzione /
repertorio / compositore / direttore / cliente / tipologia, rinunce, carico recente, conflitti di calendario,
esclusioni) e conserva pesi e proposte.

- **Fase A** (obbligatori): strumento, livello minimo, requisiti `required`, esclusioni, conflitti, già in
  produzione, sospesi → non idoneo, in fondo, con il motivo.
- **Fase B**: 50 punti neutri + contributi pesati e **saturati** (5 collaborazioni = 50), riscalati così che il
  massimo possibile faccia 100. Chi non ha storico resta al neutro (più una piccola spinta di rotazione).
  Le rinunce dopo conferma pesano, si dimezzano dopo 24 mesi, mai più di due. Ogni contributo porta la sua
  frase: la spiegazione è la somma delle frasi.
- **Pesi**: Impostazioni → «Pesi del matching»; ogni salvataggio è una nuova versione (`orc_save_ruleset`),
  e ogni proposta salvata cita la sua (`orc_matching_runs.ruleset_version`).
- **Snapshot e override**: «Calcola» salva la proposta (`orc_matching_save_run`); «In cima» registra una
  scelta umana con il motivo (`orc_matching_override`, anche nel registro). La decisione resta umana:
  «Assegna» conferma il posto.

## Convocazioni

1. Dal **Matching** si selezionano i candidati e si preme «Convoca i selezionati»: `orc_invite` crea un invito
   per (ruolo, musicista) con un token casuale (24 byte); nel DB resta lo sha-256, il chiaro sta in
   `orc_invitation_secrets`, tabella **senza grant** al client.
2. Il **worker** `orc-notify` (GitHub Action ogni 10 minuti, stesso segreto del worker consulenze) spedisce via
   Resend con `Idempotency-Key`, segna «inviato» e **cancella il segreto**. Gli indirizzi riservati
   (`.invalid`, `example.*`) non vanno a Resend: i musicisti demo non producono errori. `ORC_EMAIL_MODE=log`
   in locale (in `supabase/functions/.env`, non versionato).
3. Il musicista apre `/orchestre/rispondi/?t=…`: la Edge Function `orc-respond` chiama `orc_invitation_open`
   (marca «visualizzato») e `orc_respond` (sì / no / solo alcune date + nota). Può cambiare fino alla scadenza,
   finché lo staff non conferma.
4. Nella scheda **Convocazioni** lo staff vede risposte, note e date, e agisce: **Conferma** (assegna il primo
   posto scoperto con `orc_assign_slot`: una sola storia dei posti), **Riserva**, **Promemoria** (token nuovo,
   il vecchio link muore), **Revoca**, **Annulla**. Ogni passo è in `orc_invitation_events`, append-only.
5. Alla scadenza il worker porta gli inviti senza risposta a «nessuna risposta» (`orc_expire_invitations`).

## Storico e affidabilità

Dopo una produzione (scheda **Feedback**), per ogni musicista confermato lo staff registra presenza, puntualità,
preparazione, qualità, professionalità, un complessivo 1-5, «da richiamare», problemi e note private
(`orc_performance_feedback`, uno per produzione e musicista). Gli indicatori (`orc_musician_stats`) nascono da
eventi e feedback e dicono **su quante osservazioni** sono calcolati: la scheda del musicista mostra
collaborazioni, valutazione media «su N», assenze, rinunce, tasso di risposta (solo da 3 inviti), ultimo incarico,
e lo storico produzione per produzione (`orc_musician_history`). Gli eventi originali restano: nessun punteggio
li sovrascrive. Nel matching entrano tre fattori: **valutazione verificata** (3 = neutro; una sola pesa meno),
**affidabilità** (tasso di risposta, da 3 inviti), **assenze** (tetto a due); chi è già convocato o ha già detto
di no per la produzione non viene riproposto.

## Candidature e area musicista

- **Il profilo è del musicista** (`orc_musician_profiles`, own-rows): nasce al primo accesso dal JWT, si compila in
  otto passi con la bozza salvata a ogni passo (`step`), ha un completamento percentuale e un elenco di campi che
  mancano per inviare (`orc_profile_missing`, stessa regola in `domain/applications.js`).
- **La candidatura è verso un'organizzazione** (`orc_applications`, una per org e profilo): bozza → inviata (con
  consenso privacy versionato) → stati interni dello staff. Il candidato vede solo la **maschera pubblica**
  (`orc_public_status`): «in valutazione» copre colloqui e audizioni da programmare e le sospensioni.
- **Le valutazioni** (`orc_evaluations`: colloquio, audizione, generale; punteggi 1-5, note private) sono dell'org:
  il candidato non ha nessuna policy. Lo staff vede il profilo di chi si è candidato alla sua org e basta.
- **Accettare** (`orc_application_set_status … 'accepted'`) crea o collega la riga in `orc_musicians` copiando i
  dati dichiarati (strumenti, competenze, repertorio) e collega l'account: da lì in poi riceve convocazioni.
- **File**: bucket privato `orc-files`, `profiles/<uid>/…`; policy su `storage.objects` per proprietario e staff
  delle org candidate; URL firmati a 10 minuti dal client.
- **Area musicista** (`/orchestre/musicista/`): candidature con stato, inviti a cui rispondere senza token
  (`orc_respond_mine`), incarichi confermati, privacy (consenso alle richieste, richiesta di
  cancellazione; la copia dei dati si chiede scrivendo — `orc_export_my_data` esiste ancora nel database, ma non ha più un pulsante: un JSON grezzo non dice niente a un musicista). Chi era già nel rolodex per email viene collegato al login (`orc_link_my_musician_rows`).
- Le organizzazioni aprono le candidature da Impostazioni (`accepting_applications`, testo per i candidati).

### L'invito personale, la fotografia, l'ingresso diretto

- **Il link personale** (`orc_musician_invites`): la società manda un link a una persona che ha già scelto. Il
  segreto del link **non passa dal server**: lo genera il browser di chi invita (`domain/invites.js`), che manda
  solo l'impronta sha-256 e lo mostra una volta sola — stesso schema delle richieste di setup dell'editor. Chi lo
  perde ne fa un altro; quello vecchio si revoca (`orc_musician_invite_revoke`). Scadenza a 30 giorni.
- **Aprirlo** (`orc_musician_invite_claim`): risponde sempre allo stesso modo quando non è valido — scaduto,
  revocato, inesistente o già di un altro account: non si scopre nemmeno di quale organizzazione si tratti. Chi
  l'ha aperto se lo ritrova anche tornando dopo (`orc_my_invite`), perché la pagina si dimentica tutto a ogni
  ricarica ma la promessa «appena mandi sei dentro» deve reggere fino al pulsante.
- **L'ingresso diretto**: `orc_submit_application` guarda se chi manda ha un invito in corso per quell'org e, se sì,
  accetta subito — niente valutazione, la fiducia gliel'ha data chi l'ha invitato. L'accettazione vera sta in
  `orc_application_accept`, estratta da `orc_application_set_status`: **una sola strada** per creare la persona fra
  i musicisti, e **non è chiamabile da fuori** (revocata a `authenticated`: la chiamano solo le due funzioni che
  hanno già verificato chi sei).
- **La fotografia** (`orc_musician_profiles.photo_path`): una sola, sostituibile, nello stesso archivio privato dei
  materiali (`kind = 'photo'`). Si vede nell'area del musicista e nelle due schede dello staff (musicista e
  candidatura) con URL firmato a 10 minuti. **La CSP di quelle tre pagine ammette l'archivio in `img-src`**: senza,
  il browser blocca l'immagine in silenzio e la foto non si vede da nessuna parte (successo, e se n'è accorta solo
  la prova nel browser — c'è un test che lo guarda).

## Collegamento a StagePlot

- **Il progetto resta dell'editor.** `orc_productions.stageplot_project_id` punta a `stageplot_projects` senza FK: chi
  non è proprietario del progetto non lo legge (policy own-rows dell'editor). La scheda «StagePlot» della produzione
  mostra i **miei** progetti, il documento lo legge il client, e nel blob del progetto **non si scrive nulla**: link
  pubblici, copie e PDF di StagePlot non contengono dati di Orchestre (la funzione `get-shared-project` scarta comunque
  ogni chiave `orc_*`, a test).
- **Import** (`domain/stageplot-import.js` + RPC `orc_stageplot_import`): si sceglie la scena (variante); le
  postazioni-persona si riconoscono con `orc_instruments.stageplot_types`; la **parte** si legge dall'etichetta
  («Vl I 3» → Violini primi, «Vl II» → Violini secondi) e l'anteprima mostra il **ruolo di destinazione** (si può
  cambiare; se non si deduce e lo strumento ha più ruoli, chiede). Ogni postazione prende un **posto fisico**
  (`orc_stageplot_links.slot_id`; una postazione a due ne prende due, `seat_index` 1 e 2): tiene quello che aveva,
  altrimenti il primo libero del ruolo, e solo se mancano posti il ruolo si **allarga**. Non si restringe mai e un
  posto con una persona sopra non cambia mano.
- **Collegamenti**: dopo una nuova lettura, le postazioni sparite dal palco restano «non più sul palco» (`stale`,
  senza posto); «Ricollega…» (`orc_stageplot_relink`) le rimette su un'altra postazione libera dello stesso
  strumento. Si leggono dallo staff, si scrivono solo via RPC. L'Organico mostra per ogni posto la sua postazione.
- **Nell'editor** (`orc_stage_view`, solo staff): sotto ogni postazione collegata compare chi c'è e in che stato
  (layer SVG `layOrcSeats`, solo a schermo: `stageSceneSvg` accende `__scenePrint` e il layer non esiste in PDF,
  PNG, miniatura, SVG scaricato; nel documento salvato non entra nulla). Il pannello dell'elemento ha la riga
  «Organico» con il link all'organico (o «Importa le postazioni» se la produzione è collegata ma la postazione no).
  Cancellare una postazione con una persona sopra chiede conferma: il posto in Orchestre resta.
- **Andata e ritorno**: da Orchestre «Apri in StagePlot» apre `/app/?p=<uuid>` (con sessione apre il progetto e
  pulisce l'URL; senza, aspetta il login in `sessionStorage`); nell'editor il hub «Produzione…» ha il riquadro
  «Musicisti» che porta a `/orchestre/admin/produzioni/?p=<uuid>`: una produzione collegata → ci vai, nessuna → ne
  crei una già collegata, più d'una → scegli. Il menu File resta a sei voci (decisione del 13/08).

## Modello dei ruoli

`owner` · `admin` · `artistic` · `production` (staff: entrano nell'area admin) · `section` · `viewer`
(nel modello, senza pagina per ora). I ruoli si cambiano solo con `orc_set_member_role` (owner/admin;
il ruolo owner lo tocca solo un owner; l'ultimo owner non si degrada). Si aggiunge per email con
`orc_add_member_by_email`: la persona deve aver fatto almeno un accesso.

## «Richiedi musicisti»: il cliente che chiede le persone

È la porta d'ingresso commerciale: chi disegna un palco su StagePlot può chiedere alla società di trovargli i
musicisti. Chi arriva **non è di un'organizzazione**: è un utente qualsiasi dell'editor.

- **Il pulsante** sta nell'header dell'editor accanto a Consulenza, nel menu azioni del telefono e nel riquadro
  «Musicisti» del hub Produzione. Porta con sé il progetto salvato nel cloud (`?p=`), così la richiesta nasce
  col palco già allegato.
- **Quello che parte non è il documento**: è una copia *funzionale* — titolo, luogo, misure del palco, elenco
  delle postazioni-persona — costruita da `domain/client-request.js`. I contatti dei collaboratori del cliente
  non entrano per costruzione, e la RPC toglie comunque le chiavi note. A test.
- **La copia è immutabile**: un trigger vieta di modificare la richiesta ricevuta e i posti chiesti, a chiunque,
  servizio compreso. Il cliente continua a disegnare; quello che è arrivato resta com'era.
- **Chi riceve**: l'organizzazione con `is_service_provider` (una sola, indice unico; si accende a mano).
- **Due email**, mandate dal worker `orc-notify`: alla società (basta per decidere: chi, quando, dove, quanti
  posti, budget, orari) e la conferma al cliente, che promette un tempo e non un prezzo. Gli indirizzi dei dati
  di prova non ricevono niente.
- **Lato società**: scheda «Richieste» con elenco, dettaglio, copia del palco, link al progetto vivo e gli stati
  (nuova, presa in carico, preventivo inviato, accettata, non andata, chiusa). Le richieste nuove sono la prima
  riga di «Da fare».

Non c'è ancora: caricamento di allegati (il cliente risponde all'email), trasformazione in evento con un tasto,
preventivo con margine, presenze. Sono i passi successivi.

## Il collaudo del 10/09/2026

Quattro revisioni indipendenti (sicurezza, correttezza, esperienza d'uso, qualità dei test) su tutto Orchestre.
Le riparazioni sono nella migrazione `0051`, in `orchestre/src/` e in `.github/workflows/orchestre-rls.yml`;
ognuna ha il suo test, e ogni test è stato provato **rimettendo il difetto**. Le tre cose che contavano:

- **Le 8 suite RLS non giravano in CI**: `localEnv()` non trovava Supabase e `test.skip` faceva passare tutto.
  43 test su 87 — cioè l'intero modello di sicurezza — erano verdi per assenza. Ora girano in un workflow
  a parte con un Postgres vero e `ORC_RLS=1`, che li fa **fallire** invece di saltarli; un test in
  `pages.test.mjs` pretende che quel workflow esista e copra tutte le suite.
- **Una persona confermata poteva cambiare sedia**: se la sua postazione spariva dal disegno, il posto
  tornava libero e la prima postazione nuova se lo prendeva. Ora un legame che lascia il palco tiene il
  posto finché c'è qualcuno sopra: «Ricollega…» lo rimette dov'era.
- **Lo stato interno di una candidatura si leggeva dalla console**: la maschera pubblica era solo nel client.
  Ora il candidato passa da `orc_my_applications()` e la riga grezza non gli è più visibile.

## Limiti (lotti 1-9)

- Chi entra senza un ruolo di staff finisce nell'area musicista; `section` e `viewer` non hanno ancora una pagina propria.
- La cancellazione è una richiesta registrata (visibile allo staff): l'anonimizzazione vera è manuale.
- Le notifiche interne (`orc_notifications`) non esistono ancora: il musicista vede gli inviti nell'area e via email.
- L'import legge il palco, non le persone: i nomi dei musicisti nel disegno (rubrica dell'editor) non passano a
  Orchestre; sul disegno tornano solo nome e stato, a schermo, per lo staff (niente scrittura nel progetto).
- La parte dall'etichetta è dedotta solo per i violini (primi/secondi); gli altri strumenti hanno un ruolo per
  strumento, e se ne hanno più d'uno l'anteprima chiede.
- «Cerca musicista» dal pannello dell'elemento e la ricerca per più posti arrivano con i lotti successivi della V1.
- Il pool non ha ancora esclusioni dall'interfaccia (la tabella c'è).
- I requisiti di competenza per ruolo (`orc_role_requirements`) hanno tabella, API e peso nel motore, ma non ancora un'interfaccia per impostarli.
- La distanza geografica non è calcolata (niente coordinate); il carico recente conta solo gli impegni confermati.
- Le convocazioni sono per ruolo e in onde; «passa al successivo» è manuale: dalla scheda Convocazioni si torna al Matching del ruolo.
- Le notifiche interne all'area musicista arrivano con le candidature (lotto 7): oggi il musicista riceve solo l'email.
- L'assegnazione dall'organico è diretta (posto confermato): le convocazioni con risposta del musicista sono il lotto 5.
- La home di Orchestre non è ancora in sitemap né linkata dalla landing di StagePlot.
- Nessuna Edge Function nuova: tutto passa da PostgREST + RPC.
- I test RLS coprono profili, organizzazioni, membership, cataloghi; le tabelle dei lotti successivi
  porteranno i loro.
