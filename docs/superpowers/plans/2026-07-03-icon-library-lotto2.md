# Libreria icone StagePlot — Lotto 2: piano d'implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** +24 atomi + 1 composizione dalle priorità approvate (report lotto 1 §4 + TAXONOMY "lotto 2 prioritario"), stessa libreria e stesso standard.

**Architecture:** Stessa repo `COWORK/STAGE PLOT/icon-prototype/`, stesso ciclo consolidato: voci manifest per batch → validatore RED → disegno secondo `docs/ICON_DESIGN_GUIDELINES_STAGEPLOT.md` v1.0 (palette canonica, template, min_paths) → thumbnail check per icona → GREEN → commit. Nuovo helper `mallet-bars.mjs` per le tastiere a barre graduate (4 strumenti). Il tool StagePlot resta intoccato.

**Tech Stack:** SVG puro, Node stdlib. Decisioni §6 del report **ratificate da Simone il 03/07/2026** (ingombri reali; <10cm=badge; corista generico; no bordo dark; timpani americani; FOH postazione).

## Global Constraints

Tutte le regole di `ICON_DESIGN_GUIDELINES_STAGEPLOT.md` (1u=1cm, viewBox=ingombro reale, top-view, fronte=sud, namespace `chiave_`, divieti, ≤80KB, B/N-safe, palette canonica). Mallets e tastiere: **gravi = destra pagina** (sinistra del suonatore che sta a nord), coerente coi timpani approvati. Path con spazio → virgolette. Commit per batch.

## Contenuto (misure dichiarate nel manifest con fonte)

| # | Icona | file | W×D | Note distinta |
|---|---|---|---|---|
| 1 | Canalina passacavi | stage-service/canalina-passacavi.svg | 90×54 | base nera, 2 rampe zigrinate N/S, coperchio giallo #e8b41a centrale con cerniere+strisce antiscivolo, viti |
| 2 | Matassa cavo | stage-service/matassa-cavo.svg | 40×35 | 4-5 anelli neri stroke sfalsati, fascetta velcro, coda con XLR |
| 3 | Flight case | stage-service/flight-case.svg | 120×60 | frame alluminio, 8 angolari sfera, pannello laminato nero, 2 serrature butterfly, 2 maniglie, linea coperchio |
| 4 | Rack case | stage-service/rack-case.svg | 62×58 | shock-rack: bordo alluminio, top con 2 maniglie incassate, 4 ruote che sporgono |
| 5 | Ciabatta multipresa | stage-service/ciabatta-multipresa.svg | 45×12 | 6 schuko (cerchio+2 fori+terra), interruttore rosso, cavo |
| 6 | Leggio tablet | stage-service/leggio-tablet.svg | 30×42 | base Ø30 (riuso stile asta-dritta), stelo, morsetto, tablet 25×18 schermo scuro con riflesso a sud |
| 7 | Sub 18" | monitoring/sub-18.svg | 60×70 | top tolex, 2 maniglie conchiglia, angolari, banda griglia sottile a sud |
| 8 | Drum fill | monitoring/drum-fill.svg | 64×70 | sub 64×70 + top 48×42 centrato-nord con griglia a sud (mini-wedge su sub) |
| 9 | Cuffie | monitoring/cuffie.svg | 22×20 | archetto arco spesso, 2 padiglioni ellittici imbottiti, cavo |
| 10 | Hearback mixer | monitoring/hearback-mixer.svg | 25×18 | scatola, 4 manopole grandi in fila, jack, staffa |
| 11 | Marimba | percussion/marimba.svg | 250×90 | barre palissandro #7a4a20→#a86e38 graduate (helper), risuonatori dorati nel gap, telaio, 4 ruote |
| 12 | Vibrafono | percussion/vibrafono.svg | 150×80 | barre alluminio argento, risuonatori, pedale a sud, ruote |
| 13 | Xilofono | percussion/xilofono.svg | 145×75 | barre legno chiaro #c98146→#e0a865, telaio, ruote |
| 14 | Glockenspiel | percussion/glockenspiel.svg | 75×55 | barre acciaio piccole in case aperto (no ruote) |
| 15 | Campane tubolari | percussion/campane-tubolari.svg | 150×60 | portale + 18 tubi = cerchietti cromati Ø4.5 in 2 file sfalsate, pedale damper |
| 16 | Organo Hammond | band/organo-hammond.svg | 125×65 | mobile noce, 2 manuali 61 (keyboard-strip), 2×9 drawbars (barrette), leggio |
| 17 | Leslie | band/leslie.svg | 76×54 | TYPES leslie: cabinet legno, top chiuso, fasce feritoie ai bordi N, targhetta |
| 18 | Piano verticale | band/piano-verticale.svg | 150×62 | top legno scuro venato + tastiera 88 sporgente a sud + cerniera coperchio |
| 19 | E-drums | percussion/e-drums.svg | 140×120 | TYPES edrums: rack tubolare, 5 pad tondi gomma + kick pad + hi-hat pad, modulo con display |
| 20 | SPD-SX | percussion/spd-sx.svg | 40×36 | multipad 34×30: 9 pad 3×3 gomma, bordo rosso, stand X |
| 21 | Controller MIDI | band/controller-midi.svg | 82×26 | 49 tasti (keyboard-strip) + fila pad/manopole a nord |
| 22 | DJ set | band/dj-set.svg | 182×64 | TYPES djset: case con 2 CDJ (jogwheel+display) + mixer centrale (fader+eq) |
| 23 | Podio speaker | furniture/podio-speaker.svg | 62×48 | TYPES podiosp: piano lettura trapezio, base più larga ai bordi, gooseneck con capsula |
| 24 | Attore | people/attore.svg | 55×42 | variante persona: braccio dx esteso (gesto), giacca grigio-blu #3c4654, capelli diversi |
| 25 | Coppia stereo | combined-setups/coppia-stereo.svg | 80×85 | **composizione**: 2× asta-giraffa rot ±20°, basi affiancate (XY) |

---

### Task 1: Helper barre graduate `tools/mallet-bars.mjs`

**Interfaces:** CLI `node tools/mallet-bars.mjs <x0> <y0> <W> <depthNat> <depthSharpFactor> <nNat> <gap>` → stampa `NAT` e `SHARP` come liste di `<rect>` pronti (classe placeholder `BARCLASS`): barre naturali (fila nord, larghezza barra decrescente da dx=gravi a sx=acuti? **NO: larghezza decrescente da destra (gravi, barre larghe/profonde) a sinistra**) e diesis (fila sud sfalsata, pattern 2+3, profondità = depthNat×factor). Ogni barra: `width` interpolata lineare da `wMax=W/nNat×1.25` (dx) a `wMin=W/nNat×0.75` (sx), `depth` interpolata da depthNat (dx) a depthNat×0.62 (sx), gap 0.6 tra barre.

- [ ] **Step 1**: scrivere lo script (usa la stessa struttura di `keyboard-strip.mjs`: parse argv, r2, loop con interpolazioni, pattern diesis `CDFGA` dopo nota, partenza C).
- [ ] **Step 2**: `node tools/mallet-bars.mjs 12 8 226 40 0.8 22 4` → output con 22 rect NAT + 15 SHARP, coordinate crescenti, nessun NaN.
- [ ] **Step 3**: commit `"helper mallet-bars per tastiere a barre"`.

### Task 2 — Batch L2-B1 service (icone 1-6)

- [ ] Voci manifest (min_paths: canalina 10, matassa 8, flight 14, rack 12, ciabatta 10, leggio-tablet 8) → RED → disegnare secondo distinte in tabella → thumbnail check ciascuna → GREEN → commit `"lotto2 B1 service"`.

### Task 3 — Batch L2-B2 monitoring (icone 7-10)

- [ ] Stesse fasi (min_paths: sub 10, drumfill 14, cuffie 8, hearback 8). Commit `"lotto2 B2 monitoring"`.

### Task 4 — Batch L2-B3 mallets (icone 11-15)

- [ ] Stesse fasi (min_paths 14-20; barre via helper Task 1 con parametri: marimba 22 nat prof.40, vibrafono 20 nat prof.34, xilofono 20 nat prof.30, glockenspiel 16 nat prof.20; campane senza helper). Commit `"lotto2 B3 mallets"`.

### Task 5 — Batch L2-B4 band/keys (icone 16-21)

- [ ] Stesse fasi (tastiere via `keyboard-strip.mjs`: hammond 2×36 bianchi start C, piano verticale 52 start A, controller 29 start C; min_paths 10-16). Commit `"lotto2 B4 band/keys"`.

### Task 6 — Batch L2-B5 dj/teatro + composizione (icone 22-25)

- [ ] Atomi 22-24 come sopra (min_paths: dj 16, podio 8, attore 8); poi aggiungere `coppia-stereo` a `compositions.json` (2 part `microphones/asta-giraffa.svg`: {x:0,y:3,rot:20} e {x:25,y:0,rot:-20}, min_paths 40) → `node tools/compose.mjs` → GREEN → commit `"lotto2 B5 dj/teatro + coppia stereo"`.

### Task 7 — Aggiornamento docs e preview

- [ ] `TAXONOMY.md`: marcare 🆕 le voci fatte (canaline, flight case, rack, sub, drum fill, cuffie, hearback, mallets ×5, Hammond+Leslie, piano verticale, e-drums, SPD, controller, DJ, coppia stereo, podio speaker, attore, ciabatta, leggio tablet, matassa) e aggiornare il conteggio.
- [ ] `ICON_LIBRARY_REPORT.md`: addendum "Lotto 2 — 03/07/2026" con elenco, decisioni §6 RATIFICATE, restanti lotto 3.
- [ ] `preview/index.html`: aggiungere a `PLACES`: `['marimba',30,240],['djset',700,600],['flightcase',20,20],['sub18',870,660],['edrums',540,150]` (chiavi manifest reali).
- [ ] `PROGRESSI.md` aggiornato; `node tools/build-preview-data.mjs`; commit `"lotto2 docs+preview"`.

### Task 8 — Verifica Chrome + consegna

- [ ] Validatore GREEN totale (~83 voci), server 8613 attivo, ricarica pagina, screenshot sezioni nuove (service, mallets in Percussioni, band, vista palco), dark spot-check, console senza errori.
- [ ] Fix di ciò che non passa; PROGRESSI/memoria; riepilogo a Simone (la revisione finale resta sua).

## Fuori scope

Integrazione nel tool; rifacimento top-view delle LIB_ICONS prospettiche (decisione separata, report §8); varianti sax taglie; luci.
