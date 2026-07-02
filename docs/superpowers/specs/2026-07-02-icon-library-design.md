# Libreria icone SVG StagePlot — design (lotto 1, prototipo)

*02/07/2026 — approvato da Simone (scopo, contenuto, design system, struttura/processo).*

## Obiettivo

Libreria **preliminare e standalone** di icone SVG in scala reale, vista dall'alto, destinata a un futuro upgrade grafico del tool (sostituzione dei disegni procedurali + ampliamento di `LIB_ICONS`). **Nessuna modifica al software**: il tool non viene toccato; si producono solo file SVG, documentazione e una pagina di anteprima locale.

## Contesto esistente (fase di analisi, 02/07/2026)

- Catalogo `TYPES` in `index.template.html`: **122 elementi** in 11 categorie, dimensioni reali in cm verificate (`COWORK/STAGE PLOT/docs/RICERCA.md`).
- Convenzioni consolidate: **1 unità SVG = 1 cm**, vista dall'alto, origine al centro dell'elemento, fronte palco in basso, z-order, `resizable`.
- `LIB_ICONS`: **21 icone realistiche** (archi, legni, ottoni, arpa, chitarre, piano) — multi-path, gradienti, classi namespaced `nome_cls-N`, viewBox = ingombro in cm. Consumate via `libIcon(key)` che le ri-centra e rende unici gli ID.
- Vincolo export: il percorso PDF vettoriale (svg2pdf) non digerisce bene gradienti → il tool usa fallback geometrici in `_pdfMode`. Le icone devono restare leggibili anche in B/N.
- Stile del resto del catalogo: procedurale tecnico (primitive `bar/circ/lin`, stroke `#1f2937` 2u, gradienti condivisi `gWood/gBrass/gSilver/gCym/...`).

## Decisioni prese (con Simone, 02/07/2026)

1. **Scopo**: upgrade grafico del tool → compatibilità nativa con le convenzioni esistenti.
2. **Lotto 1**: mix ~20 upgrade band/live (elementi oggi geometrici più usati) + ~20 gap orchestra/coro.
3. **Processo**: approccio "campione → serie". Prima **5 icone campione realistiche** sulla stessa pagina di confronto con arpa/archi/LIB_ICONS esistenti, aperte in Chrome; **solo dopo approvazione visiva** si produce la serie completa.
3-bis. **Standard qualitativo (chiarimento Simone, 02/07/2026)**: le icone sono **veri disegni SVG vettoriali realistici**, standard minimo = le migliori LIB_ICONS esistenti (archi, arpa, chitarre, pianoforte): multi-path, proporzioni realistiche, materiali leggibili, vista dall'alto, scala reale. Le 21 esistenti **non si rifanno** se già sopra standard: sono il riferimento estetico, tecnico e strutturale. Si migliorano solo gli elementi oggi troppo geometrici o poveri. **Output non accettabili**: icone outline generiche, stile Font Awesome, simboli minimalisti, disegni non in scala, SVG decorativi ma non tecnici, oggetti belli ma inutilizzabili nello stage plot, SVG senza dimensioni reali documentate.
4. **Atomi + composizioni**: si disegnano i pezzi singoli; set e postazioni nascono per composizione (coerente col meccanismo "Dividi in elementi" del tool).
5. **Posizione**: libreria in `COWORK/STAGE PLOT/icon-prototype/` — **fuori dalla repo pubblicata** (tutto ciò che entra nella repo finisce online su GitHub Pages). Nella repo va solo questa spec.
6. **Coro**: dall'alto uomo/donna/bambino sono indistinguibili → un corista generico + variante taglia bambino; distinzione affidata a etichetta/colore.
7. **Oggetti < 10 cm** (lavalier, clip mic, ecc.): deroga dichiarata alla scala reale — "taglia minima simbolica" (simbolo ~12 cm per oggetti più piccoli), sempre annotata nei metadati. Da ratificare nel report finale.

## Contenuto lotto 1 (~40 soggetti + composizioni)

### Gruppo A — Upgrade band/live (atomi)

| Icona | Ingombro (cm) | Fonte misura |
|---|---|---|
| Cassa 22" | Ø56 | standard batteria |
| Rullante 14" | Ø36 | standard |
| Tom 12" | Ø30 | standard |
| Floor tom 16" | Ø41 | standard |
| Hi-hat 14" | Ø36 (piatti) | standard |
| Crash 16" | Ø41 | standard |
| Ride 20" | Ø51 | standard |
| Sgabello batteria | Ø35 | stima dichiarata |
| Wedge monitor | 60×45 | TYPES `wedge` |
| Side fill | ~60×50 | TYPES `sidefill` |
| Asta mic dritta | base Ø30 | TYPES `astamic` |
| Asta giraffa | base+braccio ~60×80 | TYPES `giraffa` |
| Asta bassa | base Ø25 | TYPES `astabassa` |
| Persona top-view | Ø55 (spalle) | antropometria media |
| Combo amp chitarra | 66×27 | TYPES `comboamp` |
| Stack testata+4×12 | 76×36 | TYPES `stack` |
| Ampli basso | 60×46 | TYPES `bassamp` |
| Stage piano su stand | 135×35 | TYPES `stagepiano` |
| Doppia tastiera su stand | 105×45 | TYPES `doppiatastiera` |
| DI box | 13×9 (→ taglia min. simbolica) | TYPES `dimono` |
| Mixer FOH | come TYPES `foh` | TYPES |

Composizioni gruppo A: **batteria minimale / standard / rock (doppia cassa) / jazz**; postazioni voce = persona + variante (asta dritta / giraffa / radiomicrofono in mano / headset), tutte dai nuovi atomi.

### Gruppo B — Gap orchestra/coro

| Icona | Ingombro (cm) | Fonte misura |
|---|---|---|
| Ottavino | ~33 | organologia |
| Corno inglese | ~80 | stima dichiarata |
| Clarinetto basso | ~105 | stima dichiarata |
| Controfagotto | ~130 (postazione) | stima dichiarata |
| Sax soprano | ~65 | organologia |
| Trombone basso | ~120 | come tenore, campana maggiore |
| Organo (console) | ~150×90 | stima dichiarata (console moderna) |
| Clavicembalo | ~240×95 | media strumenti 2 manuali, dichiarata |
| Timpano singolo ×4 diametri | Ø58/66/74/81 (+telaio) | coerente TYPES `timpani3` Ø81/74/66 |
| Grancassa sinfonica su telaio | ~110×60 | stima dichiarata |
| Piatti a due | Ø48 | standard |
| Tam-tam su telaio | ~110×40 (gong Ø90) | stima dichiarata |
| Sedia orchestrale (atomo rifatto) | 46×46 | TYPES `sedia` |
| Leggio (atomo rifatto) | 48×35 | TYPES `leggio` |
| Podio direttore + leggio | come TYPES `podio` | TYPES |
| Microfono choir overhead | base Ø40, asta alta | stima dichiarata |
| Corista generico (+ taglia bambino) | Ø55 / Ø45 | antropometria |

Composizioni gruppo B: **timpani ×2/×3/×4/×5** (diametri decrescenti reali), **postazione archi** (sedia+leggio+strumento, riuso LIB_ICONS violino/viola/cello), **fila coro** (coristi a interasse 60 cm).

Regola misure: prima `TYPES`/RICERCA.md (già verificate), poi fonte organologica, altrimenti **stima media dichiarata**. Tutte le misure e le fonti confluiscono in `docs/TAXONOMY.md` della libreria, che mappa anche l'intera tassonomia del brief (esistente / lotto 1 / lotto 2 / non previsto) → genera la lista "icone mancanti" del report.

## Design system (`ICON_DESIGN_GUIDELINES_STAGEPLOT.md`)

- **Un solo standard**: realistico livello LIB_ICONS per tutti gli oggetti (multi-path, materiali, gradienti dove servono). La densità di dettaglio scala con l'oggetto (un DI box realistico resta una scatola con connettori: realismo ≠ decorazione). Nessun trattamento "outline/symbol": vietato dal chiarimento qualità.
- **Unità**: 1 unità = 1 cm. `viewBox="0 0 W D"` con W×D = ingombro reale. Vista dall'alto, **fronte palco in basso** (lato pubblico = basso). Ancoraggio = centro geometrico del viewBox (il renderer del tool ri-centra, come `libIcon`).
- **Struttura file**: SVG puro standalone; `<defs><style>` embedded con classi namespaced `nomefile_cls-N` (pattern LIB_ICONS); gruppi semantici commentati; **vietati**: bitmap, `<filter>`, font esterni, script. Gradienti ammessi solo se l'icona resta leggibile in B/N (regola svg2pdf); ombre esterne: no; riflessi tipo `rimlight`: ammessi.
- **Palette materiali** campionata dalle 21 esistenti: legno strumento (#865227→#4f3017), ottone, argento/nichel, pelle tamburo, bronzo piatti, rame timpani, nero hardware (#1b1b1b), tela speaker, grigio metallo (#494d54). Tabella canonica nelle guidelines.
- **Naming**: file kebab-case italiano (`timpano-81.svg`, `asta-giraffa.svg`), chiave underscore compatibile LIB_ICONS (`timpano_81`); metadati in testa al file (commento: nome, categoria, W×D cm, fonte misura, trattamento, data).
- **Composizioni**: file autonomi che incorporano i path degli atomi (nessun `<use>` cross-file).
- Le guidelines includono: come chiedere nuove icone coerenti in futuro (template di prompt), esempi buoni / da evitare.

## Struttura cartelle

```
COWORK/STAGE PLOT/icon-prototype/
  orchestra/  band/  microphones/  monitoring/  stage-service/
  percussion/  furniture/  combined-setups/
  docs/     → ICON_DESIGN_GUIDELINES_STAGEPLOT.md, TAXONOMY.md, ICON_LIBRARY_REPORT.md
  preview/  → index.html (+ icons-data.js generato)
```

## Pagina di anteprima (`preview/index.html`)

Statica, vanilla, **apribile da `file://` in Chrome** (icone embedded in `icons-data.js` generato da script, per evitare i limiti fetch su file://). Mostra: griglia metrica 1 m / 50 cm; card per icona (nome, categoria, W×D reali, trattamento, nota tecnica, fonte misura); toggle fondo chiaro/scuro; toggle B/N (test stampa); slider scala; vista "palco 10×8 m" con icone piazzate per confronto dimensionale; sezione "coerenza" con affiancate le 21 LIB_ICONS esistenti.

## Report finale (`ICON_LIBRARY_REPORT.md`)

Le 10 sezioni richieste: sintesi; icone create; mancanti (da TAXONOMY.md); priorità successive; problemi; **decisioni da far approvare** (almeno: trattamento scelto, deroga taglia minima, corista generico, strategia integrazione LIB_ICONS vs procedurali); suggerimenti d'integrazione futura (formato già compatibile `libIcon`); rischi d'incoerenza; fonti/assunzioni misure; raccomandazione.

## Processo operativo

1. Piano d'implementazione (skill writing-plans), preceduto da **anatomia delle LIB_ICONS migliori** (estrazione di arpa/violino/tromba: struttura path, palette, uso gradienti) per copiarne la logica di qualità.
2. **Tavola campione (fase obbligatoria)**: 5 icone realistiche — cassa 22" (rotonda materica), wedge (angolato tecnico), asta giraffa (lineare sottile), persona (organica), timpano (rame orchestrale) — sulla stessa pagina, affiancate ad arpa/archi/tromba esistenti su fondo chiaro/scuro + B/N. Apertura in Chrome → **approvazione visiva di Simone. Nessuna serie prima del suo OK.**
3. Serie ~40 allo standard approvato, a batch per categoria, verifica visiva per batch in Chrome.
4. Preview completa + TAXONOMY + guidelines definitive + report.
5. Revisione finale in Chrome (checklist sotto).

## Criteri di verifica finale

- Tutte le icone renderizzano (nessun SVG rotto), nomi e categorie corretti.
- Scala coerente: oggetti confrontati sulla vista palco rispettano i rapporti reali.
- Leggibilità su fondo chiaro, scuro e in B/N.
- Pagina navigabile da `file://` senza server né rete.
- Nessun file modificato dentro la repo del tool (verifica `git status` pulito, salvo questa spec).

## Fuori scope (lotto 1)

Integrazione nel tool; icone luci/video aggiuntive; canaline/cavi/flight case/rack (lotto 2); generatore automatico di sezioni; export PNG.
