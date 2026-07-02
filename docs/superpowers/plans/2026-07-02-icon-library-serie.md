# Libreria icone StagePlot — Serie lotto 1: piano d'implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare la libreria da 5 a ~56 SVG (37 atomi nuovi + 14 composizioni), con preview completa per categorie + vista palco, TAXONOMY, guidelines definitive e report — pronta per la revisione finale di Simone.

**Architecture:** Stessa repo prototipo `COWORK/STAGE PLOT/icon-prototype/` (fuori dal sito). Atomi disegnati a mano col metodo approvato al campione (ANATOMIA_LIB_ICONS.md); composizioni generate da `tools/compose.mjs` (fusione+rinamespace dei path degli atomi, coerenza garantita); timpani 58/66/74 generati da template parametrico del timpano-81 approvato. Manifest esteso per batch (TDD: voci→RED→disegno→GREEN→commit). Il tool StagePlot resta intoccato.

**Tech Stack:** SVG puro, Node stdlib, HTML/JS vanilla. Campione approvato da Simone il 02/07/2026.

## Global Constraints

- Tutto come nel piano campione: 1u=1cm, `viewBox="0 0 W D"`, top-view, fronte palco=basso, prefissi `chiave_` su id/classi, vietati `<image>/<filter>/<script>`/font, ≤80KB, B/N-safe, path con spazio → virgolette.
- Palette SOLO da `docs/ANATOMIA_LIB_ICONS.md` (canonica). Realismo = multi-path tonal stacking; gradienti dove servono (max 2-3 per icona).
- Le 5 icone campione approvate NON si ritoccano (solo spostamento cartella).
- Controllo visivo: thumbnail `qlmanage -t -s 600` per OGNI icona nuova prima del commit del batch; fix subito se non legge.
- Naming: file kebab-case italiano; chiave = underscore. Cartelle per categoria (sotto): `percussion/ band/ microphones/ monitoring/ stage-service/ orchestra/ furniture/ people/ combined-setups/`.
- Orientamenti coerenti coi fratelli LIB_ICONS: legni VERTICALI (clarinetto 9×66, oboe 20×62, fagotto 27×134, sax 33×64), tromba ORIZZONTALE 50×15, trombone DIAGONALE 77×85, pianoforte 194×200.

## Tabella misure (fonte per manifest; cm, W×D)

| Icona | file | W×D | Fonte |
|---|---|---|---|
| Rullante su stand | percussion/rullante-14.svg | 46×46 | TYPES rullante |
| Tom 12" | percussion/tom-12.svg | 30×34 | standard, attacco incluso |
| Floor tom 16" | percussion/floor-tom-16.svg | 46×46 | standard + gambe |
| Hi-hat | percussion/hi-hat.svg | 36×52 | piatti Ø36 + pedale |
| Crash 16" | percussion/crash-16.svg | 44×44 | Ø41 + stand |
| Ride 20" | percussion/ride-20.svg | 54×54 | Ø51 + stand |
| Sgabello batteria | percussion/sgabello-batteria.svg | 40×40 | TYPES sgabello Ø38 |
| Timpano 26" | percussion/timpano-66.svg | 73×73 | proporzione timpano-81 |
| Timpano 29" | percussion/timpano-74.svg | 81×81 | idem |
| Timpano 23" | percussion/timpano-58.svg | 65×65 | idem |
| Grancassa sinfonica | percussion/grancassa-sinfonica.svg | 110×60 | Ø90 verticale su telaio, stima |
| Piatti a due | percussion/piatti-a-due.svg | 50×50 | Ø48 coppia sfalsata |
| Tam-tam | percussion/tam-tam.svg | 110×45 | gong Ø90 su portale, stima |
| Combo amp | band/combo-amp.svg | 66×27 | TYPES comboamp |
| Stack 4×12 | band/stack-4x12.svg | 76×36 | TYPES stack |
| Ampli basso | band/ampli-basso.svg | 60×46 | TYPES bassamp |
| Stage piano su stand | band/stage-piano.svg | 135×40 | TYPES stagepiano +stand |
| Doppia tastiera | band/doppia-tastiera.svg | 105×50 | TYPES doppiatastiera |
| Asta dritta | microphones/asta-dritta.svg | 30×42 | base Ø30 + mic offset |
| Asta bassa | microphones/asta-bassa.svg | 25×45 | base Ø25 + boom corto |
| DI box | microphones/di-box.svg | 13×9 | reale (BSS-style) |
| Mic choir overhead | microphones/mic-choir.svg | 40×100 | base Ø40 + asta alta, stima |
| Side fill | monitoring/side-fill.svg | 60×70 | TYPES sidefill |
| Postazione FOH | stage-service/postazione-foh.svg | 200×120 | TYPES foh (tavolo+console+laptop+rack) |
| Ottavino | orchestra/ottavino.svg | 7×33 | organologia |
| Corno inglese | orchestra/corno-inglese.svg | 22×80 | stima (fratello: oboe) |
| Clarinetto basso | orchestra/clarinetto-basso.svg | 22×105 | stima (campana risvoltata) |
| Controfagotto | orchestra/controfagotto.svg | 32×130 | stima (fratello: fagotto) |
| Sax soprano | orchestra/sax-soprano.svg | 12×65 | organologia (dritto) |
| Trombone basso | orchestra/trombone-basso.svg | 80×88 | come trombone (diagonale), campana +10% |
| Organo console | orchestra/organo-console.svg | 150×90 | stima console 2 manuali |
| Clavicembalo | orchestra/clavicembalo.svg | 240×95 | media 2 manuali, stima |
| Sedia orchestrale | furniture/sedia-orchestrale.svg | 50×55 | TYPES sedia |
| Leggio | furniture/leggio.svg | 50×35 | TYPES leggio |
| Podio direttore | furniture/podio-direttore.svg | 100×100 | TYPES podio |
| Corista | people/corista.svg | 55×40 | come persona-cantante + cartella |
| Corista bambino | people/corista-bambino.svg | 45×33 | scala 0.82 |
| (spostamenti) | cassa-22→percussion, timpano-81→percussion, wedge-monitor→monitoring, asta-giraffa→microphones, persona-cantante→people | — | — |

Composizioni (T9, generate): batteria-minimale 165×130 · batteria-standard 195×155 · batteria-rock 245×165 · batteria-jazz 155×125 · timpani-set-2 155×95 · timpani-set-3 230×110 · timpani-set-4 300×135 · timpani-set-5 340×150 · postazione-archi 90×110 · fila-coro 240×45 · postazione-voce-dritta 60×90 · postazione-voce-giraffa 75×105 · postazione-voce-radiomic 55×45 · postazione-voce-headset 55×42 → tutte in `combined-setups/`.

---

### Task 1: Riorganizzazione cartelle + riferimenti completi

- [ ] `git mv` dei 5 campioni nelle cartelle categoria (tabella sopra), creare le 9 cartelle, aggiornare i `file` nel manifest, `node tools/validate-icons.mjs` → GREEN 5/5.
- [ ] Estendere `tools/extract-lib-icons.mjs`: `WANTED` = tutte le 21 chiavi LIB_ICONS → `reference/` completa (21 file).
- [ ] `node tools/build-preview-data.mjs` ok; commit `"riorganizzazione categorie + 21 riferimenti completi"`.

### Task 2 — Batch B1 batteria (7 icone)

Aggiungere le 7 voci al manifest (misure in tabella, `min_paths` 8-12) → validatore RED per esse → disegnare → thumbnail check → GREEN → commit per icona o per batch.

**Distinte (palette canonica; pelli = drum head, cromo = argento):**
- **rullante-14**: base treppiede 3 razze sottili sotto; fusto = anello metallo (Ø36) con 8 blocchetti tensione perimetrali; pelle coated bianca-crema gradiente radiale; riflesso mezzaluna. Front=sud.
- **tom-12**: come rullante senza stand: anello fusto (wrap nero lucido), 6 tiranti, pelle chiara; attacco/braccetto che sporge a nord (verso la cassa) 4×4.
- **floor-tom-16**: Ø41, wrap nero, 8 tiranti, 3 gambe cromate che sporgono a 120° (puntali gomma), pelle chiara.
- **hi-hat**: piatto Ø36 bronzo (gradiente conico simulato: settori toni oro), campana centrale, aste/tirante; pedale a nord (pedana 10×16 con nervature, come pedale cassa ma più snello); 2 gambe treppiede visibili ai lati.
- **crash-16**: piatto Ø41 bronzo con tornitura (2-3 anelli `lathe` chiari sottili), campana, luce a settore; sotto: 3 punte treppiede che spuntano oltre il bordo.
- **ride-20**: come crash ma Ø51, campana più grande, 4 anelli tornitura.
- **sgabello-batteria**: seduta tonda Ø38 sky nera trapuntata (4 bottoni + cuciture radiali), bordo, 3 gambe accennate sotto.

### Task 3 — Batch B2 percussione orchestrale (6 icone, 1 script)

- [ ] `tools/gen-timpani.mjs`: legge `percussion/timpano-81.svg` come TEMPLATE testuale, parametri per diametro: {file, kettle_r, ingombro, n_lugs}: 58→65cm/6 lugs, 66→73cm/7, 74→81cm/8. Scala numerica: sostituzione del viewBox e riscala di TUTTE le coordinate = fattore ingombro/88 (regex sui numeri con parsing float) MA senza scalare gli spessori di stroke sotto 0.3 (clamp min 0.3). Prefissi riscritti `timpano81_`→`timpanoNN_`. Lugs: rigenerati alle rotazioni giuste (360/n).
- [ ] Verifica: 3 file generati PASS + thumbnail.
- **grancassa-sinfonica** (110×60): come cassa-22 ma Ø90 di larghezza, senza pedale/spurs; telaio a culla: 2 montanti laterali + 4 ruote agli angoli; hoop legno scuro; wrap fusto mogano scuro (gradiente cilindrico orizzontale).
- **piatti-a-due** (50×50): due cerchi bronzo Ø48 sovrapposti sfalsati (offset 6,6), quello sopra con luce e cinghia in cuoio centrale (fibbia), tornitura; quello sotto in ombra parziale (tono -15%).
- **tam-tam** (110×45): portale: 2 montanti verticali laterali (tubo nero Ø4 con basi a T e ruote) + traversa nord; gong = ellisse schiacciata (90×8) bronzo scuro con bordo martellato (fila di puntini tono) appesa con 2 corde alla traversa; battente appoggiato? no.
- Commit batch.

### Task 4 — Batch B3 backline (5 icone)

- **combo-amp** (66×27): top: tolex nero con texture, maniglia incassata centrale (come wedge ma proporzioni combo), pannello controlli a nord (striscia argento/crema con 8-10 manopole puntini + 2 jack), angolari metallici 4 angoli, piping bianco perimetrale sottile.
- **stack-4x12** (76×36): top della testata: tolex, maniglia, pannello con manopole a sud (fronte); sotto si intravede il bordo del cabinet 4×12 che sporge (cornice +2cm per lato rispetto alla testata).
- **ampli-basso** (60×46): top combo grande: tolex, griglia a nastro sul bordo sud, maniglia, pannello 6 manopole, angolari.
- **stage-piano** (135×40): piano su stand X: corpo 135×35 nero con tastiera a sud (striscia keyboardStrip realistica: 52 tasti bianchi + gruppi neri disegnati), pannello controlli nord con pochi controlli, leggio? no; le gambe X che spuntano ai lati (4 appoggi).
- **doppia-tastiera** (105×50): due corpi tastiera sovrapposti sfalsati (quello sotto sporge a nord di 12), stand a doppia X visibile ai lati; tastiere con tasti come sopra.
- Commit batch.

### Task 5 — Batch B4 mic/monitor/tecnica (6 icone)

- **asta-dritta** (30×42): base tonda ghisa Ø30 (gradiente radiale grigio scuro, bordo smussato chiaro), stelo = cerchietto centrale; mic con clip che sporge a sud (proiezione dell'inclinazione): corpo+griglia come asta-giraffa; cavo che scende a spirale corta.
- **asta-bassa** (25×45): base Ø25 + boom corto verso sud con mic piccolo (per cassa/ampli).
- **di-box** (13×9): scatola pressofusa grigio-blu scuro; su un lato jack IN/THRU (2 cerchietti), sull'altro XLR OUT (cerchio con 3 pin), switch ground-lift (levetta), etichetta; viti 4 angoli.
- **mic-choir** (40×100): base Ø40 sud, asta con contrappeso, boom lungo verso nord che finisce con mic pencil sottile puntato a sud-basso; il mic sta in alto ma in pianta = linea che si assottiglia.
- **side-fill** (60×70): cabinet full-range verticale visto dall'alto: top 60×70 con griglia sul lato sud (banda forata come wedge), maniglie laterali, angolari; eventuale sub sotto suggerito dal bordo che sporge.
- **postazione-foh** (200×120): tavolo (piano legno scuro/nero 200×120 bordo alluminio) con sopra: console mixer 90×50 al centro-sud (pannello con 2 file di fader = tacche, sezione master, piccolo schermo), laptop aperto a sinistra (45°), rack 3U a destra (2 unità con manopole), tazza? no. Cavi accennati.
- Commit batch.

### Task 6 — Batch B5 fiati orchestra (6 icone)

Tutti VERTICALI (campana/piede a sud, imboccatura a nord), legni con corpo granadilla quasi nero + meccanica argento (chiavi = catene di cerchietti/leve ai lati del fusto), come clarinetto/oboe esistenti:
- **ottavino** (7×33): fusto sottile 3 sezioni, 2 giunti, chiavi argento minute, testata con foro imboccatura.
- **corno-inglese** (22×80): come oboe ma più lungo, campana a pera (bulbo) a sud, chiver curvo a nord (piccola S), ancia.
- **clarinetto-basso** (22×105): fusto lungo, campana metallica risvoltata IN SU a sud (ellisse ottone che guarda l'alto = cerchio pieno con interno scuro), collo curvo a nord con bocchino.
- **controfagotto** (32×130): doppio tubo parallelo legno rossiccio (2 canne affiancate collegate a U in fondo), campana a nord leggermente svasata, bocchino con S-crook laterale, chiavi argento sparse.
- **sax-soprano** (12×65): dritto, corpo ottone (gradiente oro come tromba: #997511→#e6af19+luci #fff), campana svasata a sud, chiavi/tamponi = fila di cerchietti oro con perle, bocchino nero a nord.
- **trombone-basso** (80×88): DIAGONALE come il trombone esistente: gruppo disegnato orizzontale (120 lungo: coulisse doppia canna + campana Ø26 ottone) poi `transform="rotate(-47 ...)"` per stare in 80×88; slide a sud-ovest, campana a nord-est.
- Commit batch.

### Task 7 — Batch B6 tastiere storiche (2 icone)

- **organo-console** (150×90): console vista dall'alto: mobile legno scuro; 2 manuali sovrapposti sfalsati (2 strisce tastiera, quella superiore più corta) a sud; leggio/music rack sopra (nord dei manuali); file di pomelli registri ai 2 lati (2 colonne × 6 cerchietti per lato, avorio); pedaliera che sporge a sud (ventaglio di tasti lunghi legno chiaro/scuro alternati, trapezio 90×25).
- **clavicembalo** (240×95): sagoma ad ala allungata (come pianoforte LIB_ICONS ma più stretta/lunga, curva a S sul lato destro); coperchio chiuso legno noce con filetti oro perimetrali e rosetta dipinta suggerita (cerchio decorato); tastiera a sud che sporge dal filo del mobile (strisce bianco/nero INVERTITE: tasti neri con diesis chiari, tipico cembalo); 3 gambe tornite accennate (cerchietti sotto i vertici).
- Commit batch.

### Task 8 — Batch B7 furniture + persone (5 icone)

- **sedia-orchestrale** (50×55): seduta trapezio arrotondato imbottitura blu notte/nera con bordo, schienale = banda curva a nord (visto dall'alto sporge dietro la seduta), 4 gambe = cerchietti agli angoli.
- **leggio** (50×35): piano inclinato visto dall'alto = trapezio nero opaco largo 48 con bordo porta-spartito a sud (listello), asta centrale sotto + base a 3 razze che spuntano.
- **podio-direttore** (100×100): pedana quadrata legno (frame + piano con doghe sottili), angoli smussati; leggio direttore sul lato nord (verso l'orchestra? NO: il direttore guarda l'orchestra che sta a nord... nello stage plot il direttore di spalle al pubblico: leggio sul lato NORD del podio, di fronte al direttore che guarda nord). Correzione: leggio a nord, ringhierina a sud (2 montanti + corrimano sottile, opzionale nelle guide reali — sì la metto).
- **corista** (55×40): riuso struttura persona-cantante (copiare il file e ri-prefissare a mano `persona_cantante_`→`corista_`), variante: cartella nera portaspartiti tenuta davanti con due mani (rettangolo 20×14 nero con dorso, al posto delle mani ai fianchi), capelli tono diverso (#4a3423 base).
- **corista-bambino** (45×33): come corista scalato 0.82 (script inline o a mano), testa proporzionalmente più grande (+10% relativo), cartella più piccola.
- Commit batch.

### Task 9 — compose.mjs + 14 composizioni

- [ ] `tools/compose.mjs`: legge `compositions.json` (nuovo, in radice): `[{key,file,nome,categoria,w,d,fonte,orientamento,nota,parts:[{src,x,y,scale?,rot?}]}]`. Per ogni composizione: per ogni part: legge l'atomo, estrae `<defs>` (style/gradient) e `<g id="...">`, ri-prefissa TUTTI gli id/classi/url(#)/href `srckey_`→`compkey_pN_`, wrappa in `<g transform="translate(x y)[ rotate(r cx cy)][ scale(s)]">`, accumula; scrive file con viewBox della composizione + defs fusi + gruppi. Aggiunge le voci composizione al MANIFEST (merge automatico: lo script aggiorna anche manifest.json, campo generated:true).
- [ ] Config: **batteria-standard** 195×155: cassa-22 al centro-sud (73,75); tom-12 ×2 ruotati ±15° sopra la cassa (78,52) (108,52); floor-tom-16 a dx (140,95); rullante-14 a sx (52,88); hi-hat sx esterno (18,80); crash-16 alto-sx (30,30) rot -10; ride-20 alto-dx (135,38); sgabello sud (95,125). **batteria-minimale** 165×130: cassa, rullante, hi-hat, ride, sgabello. **batteria-rock** 245×165: standard + seconda cassa-22 affiancata + crash aggiuntivo alto-dx, 2 floor tom. **batteria-jazz** 155×125: cassa scalata 0.82 (18"), rullante, tom, floor, hi-hat, ride grande, sgabello. **timpani-set-N** ad arco attorno al timpanista (sud): 2={74,81}, 3={66,74,81}, 4={58,66,74,81}, 5={58,66,74,81,88? no: 5° piccolo 51→ riuso 58 scalato 0.9}; disposizione: i grandi a sinistra, ad arco con rotazioni -20°..+20° (pedali verso il centro-sud). **postazione-archi** 90×110: sedia-orchestrale (20,25), leggio (8,70) rot -15, violino da `reference/violino.svg` (55,30) rot 20 appoggiato? meglio SENZA violino (icona = solo sedia+leggio; il violino lo aggiunge il musicista) — NO: la spec dice sedia+leggio+strumento (riuso LIB_ICONS): includo violino ruotato sulla sedia. **fila-coro** 240×45: corista ×4 interasse 60 (x=10,70,130,190). **postazione-voce-dritta** 60×90: persona-cantante (2,0), asta-dritta davanti (15,48). **-giraffa** 75×105: persona (10,0), asta-giraffa (10,25) — il mic arriva davanti alla bocca. **-radiomic** 55×45: persona + mic palmare nella mano dx (piccolo gruppo disegnato inline nello script? NO: composizione con parte "radiomic" = file micro `microphones/radiomic.svg` 4×12 disegnato in T9 come bonus atomo: corpo palmare con griglia). **-headset** 55×42: persona + archetto sottile sulla testa (2 path aggiunti — file `microphones/headset-clip.svg` 12×12).
  (→ 2 micro-atomi bonus: radiomic.svg, headset-clip.svg, min_paths 5)
- [ ] Validare tutto (manifest ora ~56 voci) GREEN; thumbnail check delle 14; commit.

### Task 10 — Preview v2 + documentazione finale

- [ ] `preview/index.html` v2: barra filtri categoria (chips), sezioni per categoria in ordine (riferimenti, percussion, band, orchestra, microphones, monitoring, stage-service, furniture, people, combined-setups); **vista palco**: canvas SVG 10×8 m (1000×800 u) con griglia 1m e una selezione fissa di icone piazzate in scala (batteria-standard, wedge ×2, asta-dritta ×2, timpani-set-4, postazione-archi, fila-coro, foh in proscenio) per il confronto dimensionale d'insieme; toggle chiaro/scuro/B/N e slider scala come v1.
- [ ] `docs/TAXONOMY.md`: intera tassonomia del brief (tutte le categorie/voci elencate da Simone) in tabella: voce | stato (esistente-tool / lotto 1 / lotto 2 / non previsto) | file | W×D | fonte misura. Le voci lotto 2 = lista "icone mancanti" del report.
- [ ] `docs/ICON_DESIGN_GUIDELINES_STAGEPLOT.md`: evoluzione di ANATOMIA (che resta come analisi): stile (realismo tonale), palette canonica completa (con i nuovi materiali usati nella serie), struttura file/template, naming, categorie, viewBox/unità/origine/orientamento, varianti & composizioni (uso di compose.mjs), come chiedere nuove icone (template di prompt con esempio compilato), esempi buoni (riferimenti a file della libreria) / da evitare (anti-pattern ANATOMIA), regole B/N/PDF, checklist di accettazione (= validatore + occhio).
- [ ] `docs/ICON_LIBRARY_REPORT.md`: le 10 sezioni del brief (sintesi; create ~56; mancanti da TAXONOMY; priorità successive; problemi; decisioni da approvare — ingombri reali vs TYPES, stacco su fondo scuro, taglia minima simbolica, integrazione futura in LIB_ICONS con nota peso file e fallback PDF; suggerimenti integrazione; rischi incoerenza; fonti/assunzioni; raccomandazione).
- [ ] Commit.

### Task 11 — Verifica finale in Chrome + consegna

- [ ] `node tools/validate-icons.mjs` GREEN totale; `node tools/build-preview-data.mjs`.
- [ ] Server locale porta 8613 (se spento: `python3 -m http.server 8613` dalla cartella preview) + Chrome: scorrere TUTTE le sezioni, screenshot per categoria; checklist: nessun SVG rotto, nomi corretti, scala coerente (spot check: clavicembalo 240 > organo 150 > stage-piano 135; timpani crescenti; corista-bambino < corista), dark + B/N ok, vista palco leggibile.
- [ ] Fix di ciò che non passa; ri-verifica.
- [ ] Aggiornare `PROGRESSI.md` + memoria; riepilogo a Simone con: URL pagina, cosa è nuovo, decisioni da ratificare dal report. **La revisione finale resta sua.**

## Fuori scope

Integrazione nel tool (LIB_ICONS/TYPES), icone lotto 2 (canaline, flight case, rack, luci extra, coro voci distinte, DJ), export PNG, generatore sezioni orchestrali.
