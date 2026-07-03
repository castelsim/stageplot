# UI components v2 (stile configuratore) — piano

> REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Branch `ui-components-v2`. Decisioni Simone 03/07 (2 giri di domande, tutte le Recommended): switch ovunque; righe opzione label-sx/controllo-dx con separatore tratteggiato; stepper per quantità/scatti; chips per scelte esclusive 2-4; slider con nome+valore (rotazione, zoom dove naturale); selezione canvas = outline teal staccata (offset, angoli tondi, senza tratteggio); nei pannelli 1 bottone primario pieno full-width (con icona) + secondari; rollout in branch unico → verifica → live.

Riferimento visivo: `STAGE PLOT/icon-prototype/preview/drum-configurator.html`. Vincolo: monolite `index.template.html` (7.5k righe) → preferire CSS-only e select-nascosti-pilotati; `node build.mjs` dopo ogni blocco.

- [ ] **B1 CSS (src/styles.css)**: (a) checkbox→switch globale (`appearance:none`, 36×20, pallino ::after 16, `--n-300`→`--accent` checked, focus-ring); (b) `#props .chk` → flex row-reverse space-between + `border-bottom:1px dashed var(--border)`, padding 7px 0; (c) `input[type=range]{accent-color:var(--accent)}` + `.sldrow` (label sx, range flex, output dx bold); (d) chips `.chips`/`.chips button.on`; (e) bottoni pannello: `#props .btn` full-width flex; i Dividi (`#pDivide,#pGtrSplit,#pCompSplit,#pSplit,#grpUngroup`) = primario pieno accent.
- [ ] **B2 selezione**: nel template, draw del `<rect class="selbox">` → espandere di 5cm/lato + `rx 8`; CSS: `.item.selected .selbox` stroke solido 2 senza dasharray (hover resta dash discreta).
- [ ] **B3 chips export**: `#pdfPaper` (A4/A3) e `#pdfOrient` → select nascosti + chips che fanno `value=…; dispatchEvent(change)`.
- [ ] **B4 slider rotazione**: riga `.sldrow` in `#props` dopo `#pDims` (`#pRot` 0-359 step 5 + `#pRotV`); populate da `it.rot` dove si setta `pW.value`; input → scrive `rot` sugli selezionati con lo stesso percorso del rot-handle + redraw. (Zoom: resta Adatta+pinch — dichiarato.)
- [ ] **B5 verifica Chrome** (:8614): elemento con opzioni (violino: Sedia/Leggio switch), export dialog chips, slider rotazione live, dark, finestra stretta per dock mobile; fix.
- [ ] **B6**: DS doc v2.1 (componenti §12: switch/stepper/chips/sldrow/selezione), commit, merge main, push, verify live, memoria.
