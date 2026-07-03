# Libreria icone StagePlot — Lotto 3 + review mode: piano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Metodo consolidato: `ICON_DESIGN_GUIDELINES_STAGEPLOT.md` + ciclo manifest→RED→disegno→thumbnail→GREEN→commit per batch.

**Goal:** (a) Review mode nella preview (per ogni icona: radio Aggiungi/Modifica/Non aggiungere + note, localStorage + export JSON); (b) remake top-view delle LIB_ICONS prospettiche; (c) lotto 3 dal report §9-bis. Richiesto da Simone il 03/07/2026.

**Global constraints:** come lotto 1-2 (guidelines v1.0). Stessa repo `STAGE PLOT/icon-prototype/`.

## T1 — Preview review mode (PRIMA di tutto: Simone può iniziare a revisionare)

In `preview/index.html`: per ogni card (samples E reference, chiave `ref:<key>` per i secondi): riga con 3 radio (`add` "Aggiungi", `mod` "Modifica", `skip` "Non aggiungere") + input note. Stato in `localStorage['iconReview']` (JSON `{key:{d,n}}`), salvataggio su change, ripopolato a ogni render. In header: contatore "N/tot segnate" + bottone **Esporta revisione** (scarica `review-icone-YYYY-MM-DD.json` con `{key, nome, decisione, note}` solo delle segnate + le conta per decisione). Verifica: segnare 2 icone, ricaricare (persistono), esportare.

## T2 — Remake top-view (5, decisione "rifalle")

| Icona | file | W×D | Distinta |
|---|---|---|---|
| Pianoforte a coda | orchestra/pianoforte-coda.svg | 160×275 | pianista a sud: tastiera 88 (keyboard-strip) a sud tra guance, corpo ad ala nero lucido (curva a destra), coperchio chiuso con filetto+riflessi, 3 ruote accennate, linea coperchio |
| Arpa (top-view) | orchestra/arpa-topview.svg | 70×95 | suonatore a sud: colonna a nord (cerchio decorato), cassa a goccia verso sud che si allarga, corde = ventaglio di line sottili tra colonna e cassa, base con pedali (7 tacche) |
| Chitarra elettrica su stand | band/chitarra-elettrica-stand.svg | 40×75 | manico a nord: corpo strato (2 spalle) sunburst, 3 pickup+ponte, manico con tastiera scorciata, paletta 6 meccaniche; gambe stand A-frame che spuntano E/O + gomma |
| Chitarra acustica su stand | band/chitarra-acustica-stand.svg | 42×78 | corpo dreadnought naturale (gradiente legno chiaro), buca con rosetta, battipenna, ponte, manico+paletta; stand |
| Basso su stand | band/basso-stand.svg | 38×85 | corpo P-bass, 4 corde, 2 pickup, manico lungo, paletta 4 meccaniche; stand |

Nota TAXONOMY: `cassa` LIB_ICONS frontale = già sostituita da `cassa-22`; `les_paul` coperta dalla elettrica (nota).

## T3 — Sax taglie (3): a J verticale, campana risvoltata in su (ellisse ottone), bocchino a nord, chiavi a coppette con perle (stile sax-soprano): sax-alto 30×65 · sax-tenore 34×72 · sax-baritono 40×85 (col baritono: doppio ricciolo al collo).

## T4 — Percussioni/varie (4): celesta 115×60 (mobile noce, tastiera a sud, 4 gambe) · congas-coppia 75×45 (2 fusti Ø30 doghe ambra su stand tubolare) · tavolo-percussioni 120×60 (feltro verde scuro + tamburello, 2 shaker, woodblock, triangolo, maracas) · asta-cuffie 24×30 (base+stelo, cuffie appese viste dall'alto).

## T5 — Tecnica (6): stagebox 50×40 (24 XLR in griglia 6×4 + maniglie + cavo multicore) · laptop-stand 45×40 (laptop aperto su stand X, schermo a nord) · pedaliera-fx 62×32 (board con 5 pedali colori diversi + switch + cavi + alimentatore) · mixer-monitor 95×65 (console fader in case, senza tavolo) · talkback 25×38 (base tonda + mic con switch) · par-led 28×28 (corona 12 led + lente + staffa) e testa-mobile 42×48 (base + giogo + testa lente) — sì, 7 icone in questo batch.

## T6 — Composizione tripla-tastiera 110×72 (compose: doppia-tastiera x0 y14 + controller-midi x14 y0 rot 0) + docs: TAXONOMY (remake/lotto3 marcati; cassa/les_paul note), report addendum lotto 3, PROGRESSI, PLACES (+pianoforte-coda, congas), build, verifica Chrome (sezioni nuove + review mode), memoria, consegna.

Fuori scope: integrazione tool; luci restanti (dimmer, sagomatore…); organo a canne.
