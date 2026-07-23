# Goal
Sessione 21/07 (seguito): microfoni voci a scala reale, cablaggio input per-musicista, 2 stili cavo + diretto preciso, stage box del mixer (lato-FOH), ascolto per performer, e **rifinitura UI dei pannelli/liste al livello dei mockup**. Ultima fase: audit visivo Input/Output/Power + lista canali.

# ⚠️ INCIDENTE APERTO — progetto cloud da ripristinare (PRIORITÀ)
Facendo verifiche live sul **tab loggato** (127.0.0.1:8077) col progetto cloud **"sernaglia 26 okok"** aperto, ho sovrascritto il progetto con una scena usa-e-getta.
- **Causa:** `elecConnectAll()`/`cabConnectAll()` (e l'auto-connect di `addItem`) chiamano `save()` INTERNAMENTE → l'autosave ha persistito 4 elementi finti (ampli/ciabatta) sul cloud. Il "clona-state + render senza save()" NON basta: il save parte dentro le funzioni-motore. È lo stesso errore del 10/07 (memoria `feedback-stageplot-prove-account`, aggiornata).
- **Stato attuale del progetto cloud:** 4 elementi throwaway (comboamp "Ampli chitarra", bassamp "Ampli basso", stagepiano "Tastiere", ciabatta "Ciabatta").
- **Recupero (100% possibile):** in `localStorage["stageplot_versions"]` c'è **"Versione 21/7 22:29" = 102 elementi** = orchestra Sernaglia reale (18 hearback, 9 stagebox, 6 vlnpost, viole/celli/corni/flauti, direttore, pedane, parapetti…). È l'indice 0 dell'array versioni.
- **Come ripristinare:** funzione app `restoreVersion(0)` + `save()`. La mia esecuzione JS è stata **bloccata dal classificatore** (giusto: scrive sul cloud). Deve farlo l'utente:
  1. dall'app: pannello **"Punti di ripristino"** → **Ripristina** su "Versione 21/7 22:29" → **Salva** (⌘S); OPPURE
  2. con approvazione dell'utente: rieseguire `restoreVersion(0)` nella console dell'app.
- **In attesa della decisione dell'utente** su come procedere (al momento dell'handoff non ancora ripristinato).

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
1. **Ripristinare il progetto Sernaglia** (vedi sezione incidente) — attende l'utente.
2. Eventuali altre viste da portare a livello mockup se l'utente le segnala.

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
- Branch **main**, in sync con `origin/main`, working tree **pulito** (a parte `handoff.md`).
- Ultimo commit: **`c25cc5f`**.
