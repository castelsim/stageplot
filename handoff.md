# Goal
Ridisegno del sistema **layer / cablaggio** dell'editor: layer come "viste" (Palco = tutto · Musicisti · Input · Output · P.M. · Power), cablaggio automatico leggibile, e coerenza grafica di sorgenti/stagebox/voci. Fase attuale: rifinitura visiva del cablaggio — chiusa e live.

# Current state
- App live e funzionante su **stageplot.it** (GitHub Pages da `main`). Deploy verificato: i marker di questa sessione sono presenti nel bundle live (`cab-iobar-in`, `micModeOf`, `cab-boxdot`, `pmAutoConnectBasic`, `layerAutoConnect`).
- Suite **238/238 verde**; `node build.mjs --check` allineato (index.html + app.js generati dai sorgenti).
- Working tree **pulito**, `main` **in sync** con `origin/main`, ultimo commit `6468b12`.
- Supabase allineato: migrazioni fino a **0018** applicate, seed equip applicati (44 prodotti).

# Decisions made
- **Palco = TUTTO** (occhi in OR): un elemento si vede se l'occhio Palco è acceso OPPURE un layer acceso lo contiene. Coperture = veto. `layerFgItem("stage")` è sempre true.
- **Input/Output/P.M. = tre layer separati** (id storici `cabin`/`cabout`/`mond`). Il vecchio layer unico "cabaudio" non esiste più (resta solo come `focus` legacy nel renderer PDF).
- **P.M. solo digitali**: i personal mixer (`hearback`/`mixhub`, MON_DIG_NODE) NON sono sink analogici e NON stanno in Output; si collegano via Cat5 all'hub. Capienza hub rispettata (porte del modello, 8 generico).
- **Vista cablaggio**: senza layer selezionato = plot pulito, **0 cavi**. I cavi compaiono solo col layer a fuoco/solo (canvas). Il PDF (`window.__cabStatic`) è invariato.
- **Solo a due rese**: bottone **S** = isola (resto NASCOSTO) · clic sulla riga (tendina) = fuoco con contesto sfumato 15%. Si escludono a vicenda.
- **Niente slider opacità** nel pannello layer (solo Planimetria). Riga = griglia a slot fissi `[S][occhio][lucchetto][cestino]`.
- **Nomi layer**: Palco · Musicisti · **Input** · Output · P.M. · **Power** (fisici in IT, tecnici in EN; "Corrente" scartato).
- **Stile cavo per-layer** (indipendente): `cab.style` (Input) · `cab.styleOut` (Output) · `mond.style` (P.M.) · `elec.style` (Power). Valori: `orto` (Angoli retti) · `curve` (Smussati) · `dir` (Diretto). Il vecchio `loom` migra a `orto`; i fasci/scie sono stati RIMOSSI.
- **Pallini colorati per sezione** nei layer tecnici: musicisti (audio) e carichi (Power) diventano punti col colore della sezione + legenda. **N pallini per musicista** nelle postazioni doppie.
- **Costruttore "Palco e pedane"**: la card "Blocco palco" costruisce anche le pedane (+ Blocco / + Semicerchio / + Pedana + chip pedane esistenti).
- **Voci — 4 modalità mic** (`micModeOf`): Base tonda · Giraffa · In mano · Panoramico. Panoramico = 0 canali (voce nel mic di sezione); altrimenti 1 SM58. Default corista = panoramico. Il dropdown "Microfonazione" è nascosto per le voci.
- **Stagebox = variante A**: al posto della pillola numerica, due barre sopra la box (ingressi teal / uscite ciano) proporzionali a used/capacità.

# Changed this session
15 commit (`3a87026..6468b12`). File toccati:
- `index.template.html` — sorgente unico dell'app (tutte le modifiche logica/UI/registro layer).
- `src/styles.css` — CSS layer/cablaggio (slot, solo, section-dot, cab-boxdot, iobar, autocab, cabstyle).
- `app.js` + `index.html` — **generati** da `node build.mjs` (NON editare a mano).
- `test/engines.test.mjs` — +~14 test, alcuni aggiornati al modello v3.
- `supabase/migrations/0018_dept_published.sql` — creato (già applicato in produzione).

# Files in flight
Nessuno. Tutto committato e pushato. Working tree pulito.

# Failed attempts
- **Rinomina "Power" → "Corrente"** (commit `0e25b4e`): fatta e poi **annullata** su richiesta (`6f663f4`). Il layer resta "Power". Non ri-italianizzare senza motivo.
- **Selettore stile con "Fascio + canali"** (loom): scartato. Le "scie" semi-trasparenti (`.cab-loom`) disturbavano → rimosse. Non reintrodurre il loom nel rendering.
- **Slider opacità sul layer selezionato**: giudicato inutile (il fuoco sfuma già) → rimosso da tutti i layer tranne Planimetria.

# Bugs and risks
- **Gotcha SW-cache (dev)**: il service worker su localhost serve `app.js` stantio. In sviluppo: deregistrare SW + svuotare caches + hard reload (Cmd+Shift+R). Su stageplot.it basta l'hard reload.
- **Gotcha test-sandbox**: `window.__cabStatic` è uno stub *truthy* nel sandbox node → per testare "nessun cavo senza selezione" impostare `A.__cabStatic = false`. Nel browser è falsy.
- **Regressione potenziale coristi**: il default corista è passato a "panoramico" = **0 canali** (prima 1 SM58). Progetti esistenti con coristi perdono i canali per-corista finché non si imposta una modalità mic o un mic di sezione. Scelta deliberata (coro coperto da mic di sezione).
- **Stile "Diretto"**: il disegno è a linea retta ma le **lunghezze nei report** restano calcolate sul percorso ortogonale (stima prudente). Non è un bug, ma è una scelta da ricordare.
- **PDF pagine-vista**: usano `stageSceneSvg(focus=...)`, indipendenti dal registro/solo. Non toccate da questa sessione ma da ricontrollare se si cambia la semantica dei layer.
- **3 worktree stantii** (`cttesti`, `fase2-layout-ui`, `rubmenu`): puliti e **0 commit avanti** rispetto a main → nessun lavoro da perdere. Rimuovibili con `git worktree remove`.

# Tests
- Eseguito: `node test/engines.test.mjs` → **238/238 verde**.
- Eseguito: `node build.mjs --check` → ok.
- Verificato e2e su localhost (porta 8077, SW deregistrato): occhi OR, S/tendina, 0 cavi senza selezione, pallino centro box, Power a pallini, N pallini doppia, capienza hub (8+2 pendenti), 4 modalità mic + icone, stagebox 5/16 in + 2/8 out.
- **Da fare**: nessun test mancante bloccante. Se si tocca il PDF, aggiungere copertura sulle pagine-vista (oggi non testate in sandbox).

# Next step
Chiedere a Simone se le rese live lo convincono (ha lavorato molto a raffica). Nessun intervento tecnico obbligato in coda. Se serve un default: **valutare la resa del cavo bundle di una postazione doppia** — oggi i 2 pallini musicista hanno UN solo cavo "A1 ×2" che parte dal pallino di destra; se Simone vuole un cavo per pallino, modificare la resa in `cablingMarkup` (attualmente il motore bundla i canali di un elemento con chiave `grp:<id>`).

# Relevant commands
```
cd /Users/simonecastellan/COWORK/GITHUB/stageplot
node build.mjs            # rigenera index.html + app.js dai sorgenti (SEMPRE dopo aver toccato src/ o index.template.html)
node build.mjs --check    # verifica che index.html/app.js siano allineati (pre-merge)
node test/engines.test.mjs   # suite motori (238 test)
python3 -m http.server 8077 --bind 127.0.0.1   # server statico per test locale
git push origin main      # deploy (GitHub Pages) — chiede conferma via hook
```
Test locale nel browser: deregistrare SW + svuotare caches, poi hard reload. Non aprire prove su un tab loggato con progetto cloud aperto (usare localhost).

# Git state
- Branch: **main**, in sync con `origin/main`, working tree **pulito**.
- Ultimo commit: **`6468b12`** — "voci con 4 modalità mic + stagebox variante A".
- Nessuna modifica non committata. Nessun file in staging.
- Worktree extra (stantii, 0 avanti): `.claude/worktrees/{cttesti,fase2-layout-ui,rubmenu}`.
