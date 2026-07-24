# SESSIONE 24/07 — Backup DB automatizzato (LaunchAgent)

Backup automatico del DB Supabase, **verificato funzionante nel contesto launchd** (accesso Keychain OK).
- **Script:** `COWORK/STAGEPLOT/ops/stageplot-db-backup.sh` (fuori dal repo). Fa `supabase db dump` schema+data+roles → `COWORK/STAGEPLOT/backups/AAAAMMGG-HHMM/`, rotazione ultimi 14. Auth via **token nel Keychain** (nessuna password DB). `supabase db dump` usa **Docker** (pg_dump in container): lo script **avvia Docker se spento e lo richiude solo se l'ha avviato lui** (e se non ci sono container attivi).
- **Schedulazione:** LaunchAgent `~/Library/LaunchAgents/it.stageplot.dbbackup.plist`, **giornaliero 14:00** (Mac verosimilmente acceso/Docker su → niente avvio Docker). Log: `ops/backup.log` + `ops/launchd.{out,err}.log`.
- **Gestione:** ricaricare `launchctl bootstrap gui/$(id -u) <plist>`; forzare ora `launchctl kickstart gui/$(id -u)/it.stageplot.dbbackup`; disattivare `launchctl bootout gui/$(id -u)/it.stageplot.dbbackup`.
- **Gotcha:** `head -n -N` (conteggio negativo) NON esiste su macOS/BSD → rotazione con conteggio esplicito. Il dump `--data-only` avvisa su trigger/constraint al restore (normale: restore = schema.sql poi data.sql, vedi drill).
- Backup manuale one-shot resta in `_backup_prod_20260724-1206/`.

---

# SESSIONE 24/07 — Backlog audit: TUTTI i finding M residui ("facciamoli tutti")

Tutto LIVE (`a755174`). Migration 0032+0033 **applicate in produzione** (`db push` fatto: 0032/0033 remote OK). **pg_cron risultava ATTIVO** → il job retention `stageplot-purge-expired` è schedulato (03:17 UTC giornaliero). Nessuna azione in sospeso. Nota operativa: `supabase migration list`/`db push` in questa sessione hanno connesso al DB remoto **senza chiedere la password** (credenziali disponibili in sessione).

**Codice concreto (fatto, testato, gran parte live):**
- **M-14** (`0032`, validata 6/6 su pg effimero) — il lock del progetto ora congela TUTTO il contenuto (`data`/`title`/`venue_image`/`thumbnail`), non solo data/title: la planimetria di un progetto "read-only" non è più modificabile via Data API. Metadati amministrativi (`share_token`/`is_locked`) restano mutabili → revoca share e sblocco possibili anche da bloccato. **Attende `db push`.**
- **M-13** — (a) retention (`0033`): funzione `stageplot_purge_expired()` (analytics >30gg coerente con l'informativa, feedback_throttle >7gg) + schedulazione pg_cron **best-effort in blocco guardato** (se pg_cron off, la migration NON fallisce). **Attende `db push`.** (b) **redazione feedback LIVE**: `submit-feedback` strippa i contatti di terzi dallo `project_snapshot` prima di archiviarlo (`redactSnapshotForFeedback` in `_shared/project-sharing.ts`, +3 test deno = 56 verdi). Funzione **deployata** (`--use-api`). (c) export/delete account self-service = **piano documentato** (troppo sensibile per farlo di fretta).
- **M-17** — **misura-prima fatta** (numeri reali in browser): `render()` = collo confermato, **30 / 404 / 959 ms** a 100/500/1000 elementi; `serialize`/`save` <1ms sempre. Budget + direzione (render incrementale, accoppiato a M-15) in `docs/perf/BENCHMARK.md`.
- **M-15 quick-win** (LIVE `a755174`): `cabRoutePts` da `return pts` (codice A* morto) a **flag esplicito** `CAB_AVOID_OBSTACLES=false`; + **test di caratterizzazione** (275° test): i motori puri (audio/elec/mond/audit/net) NON chiamano `save()`/`render()` — pinna l'invariante la cui violazione ha causato l'incidente cloud.

**Piani/decisioni (XL — onestamente NON riscritti, come raccomanda il report):**
- **M-15 monolite** — `docs/architecture/REFACTOR_PLAN.md` (numeri reali: 105 catch vuoti, motori già isolati, il debito è il commit-point unico; 3 quick-win, 2 fatti).
- **M-16 modello dati collaborazione** — `docs/architecture/DATA_MODEL_EVOLUTION.md`: **deliberatamente differito** in attesa di validazione prodotto (no CRDT prematuro); modello-obiettivo registrato.
- **M-19 osservabilità/DR** — `docs/ops/`: RUNBOOK (5 scenari), RPO_RTO, BACKUP_RESTORE_DRILL.
- **M-13 governance** — `docs/privacy/`: DATA_MAP, RETENTION, DATA_RIGHTS.

**docs/ è gitignored** (repo pubblico → runbook/data-map con dettagli infra/PII restano interni, NON pubblicati). I 9 file vivono in `docs/` sul disco.

**Backlog audit dopo questa sessione:** restano solo H-10 conformità WCAG piena AT-testata (baseline già live) e le PARTI XL di M-13/M-15/M-16/M-19 che richiedono scelte prodotto/legali/infra (export-delete account, refactor monolite incrementale, modello collaborazione, staging/error-tracking). **Tutti i finding con un fix di codice azionabile sono chiusi.**

**PROSSIMA AZIONE UTENTE:** nessuna. 0032+0033 applicate, retention schedulata via pg_cron. Backlog residuo = solo parti XL (prodotto/legale/infra) e H-10 WCAG full.

---

# SESSIONE 24/07 — Backlog audit: Track D (finding Low)

Tutto LIVE (`c954b3b`), verificato in browser + produzione, 274 test verdi.

- **L-01** — nome file PNG canonico. `exportPng` usava il legacy `state.nome` (non slugificato); ora usa `fileName()` (= `state.titolo` slugificato, **come i PDF**). `state.nome` non è più usato da nessuna parte. Verificato: titolo "Concerto Estivo 2026!" → `concerto-estivo-2026.png`.
- **L-02** — service worker: cache sotto prefisso `stageplot-`; la pulizia in `activate` tocca **solo le proprie** cache (non cancella più *tutte* le cache dell'origine — evita conflitti con altre app/tool sullo stesso dominio). Bump `v1→v2` come lever manuale. La freschezza a ogni visita è già garantita dallo stale-while-revalidate, quindi niente versioning per-commit (evita re-precache a ogni deploy).
- **L-03** — build ID immutabile del commit, separato dalla versione prodotto (data). Placeholder `__BUILD_SHA_PLACEHOLDER__` **timbrato dal workflow di deploy** con `${GITHUB_SHA:0:7}` (solo `_site/`, non nel repo). Esposto in `window.__BUILD_ID__`, nei due payload analytics (`build_id`) e in un `console.info` di avvio. **Verificato in produzione**: `stageplot.it` serve `window.__BUILD_ID__="c954b3b"`. Due release nello stesso giorno ora distinguibili in telemetria/supporto.

**Gotcha L-03 (per il futuro):** la sentinella del VALORE (`__BUILD_SHA_PLACEHOLDER__`) è volutamente distinta dall'identificatore `window.__BUILD_ID__`, così il `sed` della CI non tocca il nome della variabile. In dev/localhost il placeholder resta (il `console.info` mostra "build dev"). `--check` resta verde perché build.mjs non tocca il placeholder (match placeholder↔placeholder) e `stripVer` normalizza `__APP_VERSION__`.

**Backlog audit rimasto (nessuna urgenza):** M-13 (GDPR/lifecycle), M-15/16/17 (architettura/perf — M-15 = macchina a stati gesture, prereq di un H-10 completo), M-19 (osservabilità/DR), H-10 conformità WCAG piena AT-testata. **Tutti i finding Critical/High/Medium/Low azionabili dell'audit sono stati chiusi o valutati** tranne questi (per lo più L/XL o dipendenti da scelte di hosting/prodotto).

---

# SESSIONE 24/07 — Backlog audit: Track C (accessibilità + mobile)

Tutto LIVE (`87cd700`), verificato in browser (localhost non loggato), 274 test verdi.

- **H-10** — canvas accessibile da tastiera/screen reader (baseline). `#svg` ora `role="application"` + `tabindex="0"` + `aria-label` con le scorciatoie. **Tab/Shift+Tab** scorrono gli elementi in ordine di documento con annunci `aria-live` (`#a11yLive`, es. "Selezionato Barriera antipanico, posizione 605, 400. 1 di 3"); oltre l'ultimo si **esce dal canvas** (`preventDefault:false` → niente focus-trap). Annunci anche su sposta (frecce)/ruota (r/R)/duplica (d)/elimina. Costruito **sopra** il modello tastiera già ricco (frecce muovono, r/d/Canc, Esc). NB onesto: conformità WCAG 2.2 piena, testata con AT reali + "albero/lista sincronizzata" completo = lavoro maggiore ancora aperto; questa è una baseline usabile.
- **M-22** — modali: da sola semantica a **contratto dialogo completo**. Focus-trap (Tab ciclico nella modale in cima, wrap verificato), **restore del focus al trigger** alla chiusura, sfondo **`inert`** mentre aperta (MutationObserver su visibilità; regione annunci esclusa dall'inert). Verificato il ciclo welcome→apri/chiudi (inert applicato 24 elem, poi rimosso `[]`). + **touch target** su coarse-pointer a 44px per i controlli icona layer (`.layer-ico`, erano ~20px) + `.adv-btn`/`.feed-seg`; colonne `.layer-icons` allargate.
- **M-21** — `pointercancel` (touch interrotto) ora **chiude la transazione di drag in modo atomico**: COMMIT (`save`) per le modalità che scrivono lo stato live (item/rotate/grouprot/venue/frame/segmenti audio-elec-mond/alimentazione), **rollback visivo** per port/reconnect (niente save, `render` ripristina); `drag` sempre azzerato. Verificati entrambi i rami in browser.

**Gotcha M-22 (per il futuro):** il manager rende `inert` tutti i figli di `<body>` tranne le modali e le regioni `aria-live`, guidato da un MutationObserver su `hidden/style/class`. `isVisible` NON usa `offsetParent` (nullo sui `position:fixed`): usa `getBoundingClientRect`. Il welcome è `.modal` → viene gestito come modale (corretto).

**Restano nel backlog audit (futuro):** Track D (L-01/02/03), M-13 (GDPR/lifecycle), M-15/16/17 (architettura/perf — M-15 = macchina a stati gesture, dipendenza di un H-10 completo), M-19 (osservabilità/DR), + H-10 conformità WCAG piena AT-testata.

---

# SESSIONE 23/07 (notte) — Backlog audit: Track A (onestà tecnica) + Track B (sicurezza)

Dopo il rollout backend, attaccato il backlog di `STAGEPLOT_AUDIT_REPORT.md`.

**Track A — onestà tecnica (LIVE, `eb99b6d`):**
- **M-04** — gate export: se `auditEngine()` riporta `errs>0`, `exportPdf` chiede conferma prima di generare (annulla di default). Testato live con `auditEngine` moccato (annulla→no build, override→build).
- **M-05** — commenti routing: chiarito che `cabRoutePts` fa **percorso ortogonale diretto** (l'aggiramento ostacoli A* è disattivato di proposito con `return pts` anticipato), non "aggira le pedane".
- **M-06** — disclaimer nei PDF: box "STIMA PRELIMINARE" nel report elettrico (assunzioni fisse: 230 V, cosφ=1, nessun derating/spunto/caduta) e nota "stime su percorso ortogonale, verificare in loco" nel report cavi.

**Track B — sicurezza/hardening (LIVE, `46f9d44`, CI verde):**
- **M-08** — `<meta name="referrer" content="strict-origin-when-cross-origin">` (protegge i token dei link condivisi da leak via Referer). CSP meta già solida; `unsafe-inline` (5 script + 2 handler inline) e header HTTP (HSTS/nosniff) restano **limiti noti di GitHub Pages** — non risolvibili senza refactor nonce o cambio hosting.
- **M-20** — GitHub Actions in `pages.yml` **pinnate a commit SHA** (checkout/setup-node/setup-deno/upload-pages-artifact/deploy-pages); worker workflow usa solo `curl`, niente da pinnare. SBOM `vendor/README` già completo (3 lib, versioni+fonti+SHA-256).
- **M-11** — CVE-2025-29907 (jsPDF 2.5.1 ReDoS): **verificata già neutralizzata in-app** → il `_dataUrl` venue nasce sempre da `canvas.toDataURL` + `safeVenueDataUrl` è un'allowlist regex **ReDoS-safe** applicata in serializzazione e al render. A jsPDF arrivano solo data-URL base64 ben formati: l'input malefico non è costruibile. Documentato in `vendor/README`; bump 3.x = igiene rimandabile (bundle custom, no golden test PDF), non urgente.

**Restano nel backlog (futuro):** Track C (H-10 accessibilità XL, M-22/M-21 mobile), Track D (L-01/02/03), M-13 (GDPR/lifecycle), M-15/16/17 (architettura/perf), M-19 (osservabilità/DR).

---

# SESSIONE 23/07 (sera) — Review del lavoro di Codex + ROLLOUT COMPLETO backend

**Contesto:** Codex (modello OpenAI) ha fatto in autonomia una remediation di sicurezza/persistenza/pagamenti (lasciata locale, non committata) + un audit indipendente in `STAGEPLOT_AUDIT_REPORT.md` (38 finding: 2 Critical, 11 High, 22 Medium, 3 Low, contro `f1b1a2f`). Regola dell'utente: **valutiamo NOI tutto, teniamo il buono**.

**Cosa ho fatto (tutto valutato, testato, e ora LIVE):**
1. **Preservato** il lavoro di Codex sul branch `codex-hardening` (`0badb6a`), poi **rivisto** io + sub-agenti.
2. **Fix del solo 🔴 client** trovato: `normalizeLoadedItems` bloccava l'intero documento su un id dup/non-safe → ora li **riassegna** (niente lockout, id sporco scartato dal DOM). Commit `02b9281`.
3. **Merge CLIENT su main** (`b5b9e13`, deploy live) — validato: 273 unit test, Tier 1 browser reale (multi-tab/reload/Nuovo+recovery/load-riparato/import), Tier 2 **Supabase reale su progetto usa-e-getta** (CAS stantia → nessuna sovrascrittura). **C-01 verificato**: i campi tecnici (hw/sbId/rackId/ascolto/modelId…) sopravvivono al load. Chiude C-01/C-02/H-02/H-03/H-06/H-09.
4. **ROLLOUT BACKEND** (`b2cb706`, live): catena migration **validata su DB effimero locale** (replay 0000-0031 pulito, finding H-08); **backup prod** (schema+dati in `_backup_prod/`); **riconciliato** il tracciamento (era in drift: 0014-0018 applicate ma non registrate → `migration repair --status applied 0000 0014-0018`); **applicate 0019-0031** in prod; **deployate 6 edge function** (`--project-ref … --use-api`); secret `CONSULTATION_WORKER_SECRET` impostato (Supabase + GitHub, valore in scratchpad); **CI nuova verde** (test frontend+backend+type-check+lint = gate M-18); **worker verificato** (secret sbagliato→401, giusto→200 outbox pulito). Chiude H-01/H-07/H-08/H-11 + RLS/analytics/pagamenti.

**Stato: main `b2cb706`, in sync origin, 32/32 migration tracciate in prod, working tree pulito.**

**RESTA (utente, dashboard):** Stripe **Payment Link → uso singolo** (residuo 🔴 doppio-incasso su link riusabile; il fix "definitivo" = Checkout Session server-side, backlog H-07). Cosmetico: cancellare progetto `TEST-CAS`, togliere l'URL tunnel dai Redirect Supabase.

**BACKLOG APERTO (Codex NON l'ha toccato — futuro):** H-10 accessibilità canvas, M-05 routing A* disattivato, M-06 precisione calcoli elettrici, M-08 header CSP/HTTP, M-11 jsPDF ReDoS, M-15/16/17 architettura/performance, M-19 osservabilità/DR, M-20 SBOM, M-21/22 mobile. Vedi `STAGEPLOT_AUDIT_REPORT.md` §33 (20 azioni prioritarie).

**Gotcha operativi appresi:** verifiche UI SOLO su localhost non loggato (regola `feedback-stageplot-prove-account`); operazioni DB remote (dump/push/repair) richiedono la **password DB** (l'utente la digita via `!`), il deploy funzioni e i secret usano solo il **token**; migration/funzioni del branch vanno copiate/eseguite dalla dir **linkata** (main) o con `--project-ref`.

---

# Goal
Sessione 21/07 (seguito): microfoni voci a scala reale, cablaggio input per-musicista, 2 stili cavo + diretto preciso, stage box del mixer (lato-FOH), ascolto per performer, e **rifinitura UI dei pannelli/liste al livello dei mockup**. Ultima fase: audit visivo Input/Output/Power + lista canali.

# ✅ INCIDENTE CHIUSO — progetto cloud ripristinato (23/07)
Il 21/07, facendo verifiche live sul **tab loggato** (127.0.0.1:8077) col progetto cloud **"sernaglia 26 okok"** aperto, il progetto era stato sovrascritto con una scena usa-e-getta (4 elementi throwaway).
- **Causa:** `elecConnectAll()`/`cabConnectAll()` (e l'auto-connect di `addItem`) chiamano `save()` INTERNAMENTE → l'autosave ha persistito la scena finta sul cloud. Il "clona-state + render senza save()" NON basta: il save parte dentro le funzioni-motore. Stesso errore del 10/07 (memoria `feedback-stageplot-prove-account`, aggiornata).
- **Risoluzione (23/07):** Simone ha ripristinato dall'app "Versione 21/7 22:29" (102 elementi, orchestra Sernaglia reale) dal pannello **"Punti di ripristino"** + salvataggio. Progetto cloud tornato integro.
- **Lezione operativa:** vedi REGOLA RIBADITA in "Bugs and risks".

# Current state (codice)
- App live su **stageplot.it** (GitHub Pages da `main`). Working tree **pulito**, `main` in sync con `origin/main`.
- Suite **243/243 verde** (`node test/engines.test.mjs`); `node build.mjs --check` allineato.
- Ultimo commit: **`c25cc5f`**.

# Changed this session (commit `6468b12`→`c25cc5f`)
Sequenza (dal più recente):
- `c25cc5f` — lista canali: colonna MIC/DI più larga + badge 48V/Ampere sempre visibile (pmic flex, .micname troncabile, badge pinnato).
- `e808598` — liste (canali/carichi) a livello mockup: codice patch = TOKEN con tinta di dominio (teal Input, ciano Output, teal Power); badge 48V (teal) e Ampere (`.pamp` ambra); tolti stili inline dalle righe (`.lbl-note`, `.patch-sum`).
- `1c165d3` — bottoni layer Input/Output rifiniti: `.adv-connect` (Cablaggio automatico) da verde slavato → contorno pulito con hover pieno; `.adv-btn` segmentato hover/transizioni/focus-ring; `.bus-chip` (MAIN L/R…) solido con prefisso "+"; `.feed-seg` hover.
- `859c910` — rifinitura controlli via design system: classi `.prop-card`/`.prop-card__head`/`.prop-hint`/`.lbl-note`; `#props select/input` hover+transizione+chevron custom. Applicate ai 3 controlli nuovi + card gemelle pannello gruppo.
- `be72e42` — **Ascolto per performer** (`it.ascolto`/`ascoltoId`: wedge/iem/pm/cuffie/none → crea/associa il monitor giusto vicino al performer) + **pallino musicista nel layer Input = maniglia del cavo** (`sectionDotMarkup` con `port-hit` per-seduta al posto del `.hit`, classe `secdot-wire`; non sposta più il musicista).
- `f02009b` — fix BUG doppio-cavo ortogonale in editing su stile diretto (overlay segue la linea dritta, solo maniglie dei capi); **stage box del mixer** (flag `it.foh`, esclusa dall'auto, target manuale overflow, badge "MIXER").
- `3c6ab0e` — 2 stili cavo (Angoli smussati/Cablaggio diretto, orto rimosso→curve); diretto converge sul pallino centro box; **batch multi-selezione stage box** (`#grpSbWrap`: modello/ingressi/uscite insieme); **ESC azzera i layer** (solo/fuoco → base).
- `3ce605c` — **un cavo per musicista** nelle postazioni (doppia + tipi ×2 sbundlano; `musicianSeats`/`isPerMusicianMulti`/`channelAnchor`/`seatChannels`; batteria/piano stereo restano UN cavo).
- `6844204` — microfoni voci a scala reale (tonda/giraffa/mano bakati dall'editor) + `cantanteDepth` footprint dinamico.
- `ccab69a`/`5731b3d`/`6468b12` — voci: alias ricerca, figura coro unica, 4 modalità mic.

File toccati: `index.template.html` (sorgente), `src/styles.css`, `app.js`+`index.html` (generati — `node build.mjs`), `test/engines.test.mjs` (+~7 test).

# Decisions made (chiave)
- **Stili cavo = 2**: Angoli smussati (curve, default) · Cablaggio diretto (dir). orto/loom migrano a smussati.
- **Diretto**: linea dritta dal pallino centro box; editing = solo maniglie dei capi (niente segmenti ortogonali).
- **Postazioni** = 1 pallino + 1 cavo per musicista; strumenti singoli multi-mic = 1 cavo (invariato).
- **Stage box del mixer** (`it.foh`): fuori dall'auto, target manuale per gli overflow.
- **Ascolto** performer: 4 tipi che CREANO l'elemento monitor (deciso via AskUserQuestion).
- **Layer Input**: il pallino del musicista cabla, non sposta (per spostare → layer Musicisti).
- **UI**: i controlli nuovi nascono con classi del design system + hover/focus, mai stili inline grezzi (feedback Simone; memoria `feedback-stageplot-ui-polish`).

# Bugs and risks
- **Gotcha SW-cache (dev)**: deregistrare SW + svuotare caches + hard reload su porta nuova.
- **Gotcha test-sandbox**: `window.__cabStatic` truthy nel sandbox node.
- **Gotcha classe CSS**: non chiamare una classe `secdot-cab` (contiene la sottostringa `secdot-c` → falsa i conteggi test); usato `secdot-wire`.
- **REGOLA RIBADITA (vedi incidente sopra)**: verifiche interattive UI/motori SOLO su **localhost non loggato, progetto vuoto**. Mai sul tab col progetto cloud aperto. Le funzioni `elecConnectAll`/`cabConnectAll`/`addItem`(auto-connect) salvano sul cloud.

# Next step
1. Eventuali altre viste da portare a livello mockup se l'utente le segnala.

# Relevant commands
```
cd /Users/simonecastellan/COWORK/STAGEPLOT/stageplot
node build.mjs            # rigenera index.html + app.js (dopo src/ o index.template.html)
node build.mjs --check    # verifica allineamento
node test/engines.test.mjs   # suite (243 test)
python3 -m http.server 8077 --bind 127.0.0.1   # server locale
git push origin main      # deploy (Pages)
```

# Git state
- Branch **main**, in sync con `origin/main`, working tree **pulito**.
- Ultimo commit di codice: **`c25cc5f`** (i successivi sono solo docs `handoff.md`).
- Nota 23/07: repo spostato in `COWORK/STAGEPLOT/stageplot` (prima `COWORK/GITHUB/stageplot`).
