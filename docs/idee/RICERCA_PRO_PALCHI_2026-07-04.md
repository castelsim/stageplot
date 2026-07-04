# StagePlot → software di produzione tecnica completa
## Ricerca approfondita — 04/07/2026 (sessione notturna)

> Mandato Simone: "capire cosa serve a StagePlot per essere profondo per i professionisti E per i musicisti;
> PA, cablaggio per zone, elettrico da palco, console fedeli, assorbimenti, sicurezza/site plan completo
> (vie di fuga, antincendio, ambulanze, bagni), ottica 3D. Ricerca + icone in libreria, zero codice nel tool."

---

## 1. Sintesi esecutiva

StagePlot oggi copre bene il **palco del musicista** (backline in scala reale, channel list, condivisione,
consulenza). Per diventare il riferimento della **produzione tecnica di eventi** mancano 4 strati che i
competitor non hanno (o hanno male):

1. **Strato FOH/PA** — il suono del pubblico: array, sub, delay tower, postazione FOH in scala.
2. **Strato elettrico** — distribuzione corrente sul palco e sul sito: quadri, distro, generatori,
   percorsi cavi, e (futuro) **piano di assorbimento in kW** calcolato dagli elementi piazzati.
3. **Strato sicurezza/site** — il piano dell'area evento richiesto dalle autorità (in Italia: direttiva
   Gabrielli 07/06/2017 + linee guida prefettizie): vie di fuga, transenne, ambulanze/PMA, bagni,
   ingressi contingentati, segnaletica di emergenza.
4. **Strato 3D** (prospettiva) — la libreria va preparata ADESSO con metadati di altezza/forma
   perché ogni icona possa diventare un volume.

**Nessun competitor copre 2+3**: è lo spazio libero dove StagePlot può vincere (§2).
La libreria icone è il prerequisito di tutti e quattro gli strati → lotto 4 prodotto stanotte (§9).

---

## 2. Benchmark competitor (stato luglio 2026)

| Prodotto | Punti di forza | Cosa NON fa |
|---|---|---|
| Stage Plot Pro (app) | 297 icone, input list auto, PDF, link condivisibili | Non in scala reale, niente elettrico/sicurezza, niente 3D |
| StagePlotGuru | Web, librerie ampie, collaborazione realtime | Icone generiche, niente scala, niente site plan |
| StagePlotPro (legacy desktop) | Storico, semplice | ~30 icone generiche, 2D, niente collaboration |
| SetupPad / BandHelper | Input list + setlist integrate | Grafica povera, niente produzione |
| CAD generici (Vectorworks Spotlight, WYSIWYG, Capture) | Professionali veri, 3D, rider completi | Costosi (500-3000€), curva ripida, NON per musicisti |

**Il gap di mercato**: tra i "giocattoli per band" e i CAD da 2000€ non c'è NULLA che faccia
produzione tecnica seria (zone, elettrico, sicurezza) restando semplice e in scala reale nel browser.
StagePlot è già in scala reale: è l'unico ponte credibile.

Feature che i pro si aspettano (dai rider reali e dai forum di settore):
- Input list / patch list **per zona di palco** (stage box A/B/C) — vedi §6
- Monitor mix list (wedge/IEM per musicista) — in parte c'è
- Potenza richiesta in kW / allacci (es. "2× 63A 3P+N+T") scritta NEL rider — vedi §7
- Pianta quotata con distanze FOH↔palco — la scala reale c'è già
- Versione "site" per l'organizzatore: area evento completa — vedi §8

---

## 3. Console fedeli — dimensioni verificate (pianta W×D in mm)

Richiesta esplicita: "i mixer dovranno essere fedeli, dal DM3 al DM7 al Rivage a tutti gli Allen&Heath professionali".

| Console | W×D (mm) | Fonte |
|---|---|---|
| Yamaha DM3 | 320 × 455 | Yamaha specs |
| Yamaha DM7 Compact | 468 × 564 | Yamaha specs |
| Yamaha DM7 | 793 × 564 | Yamaha specs |
| Yamaha Rivage CS-R3 | 1145 × 650 | Yamaha Rivage specs |
| Yamaha Rivage CS-R5 | 1444 × 643 | Yamaha Rivage specs |
| Yamaha Rivage CS-R10 | 1549 × 848 | Yamaha Rivage specs |
| Yamaha Rivage CS-R10-S | 1128 × 848 | Yamaha Rivage specs |
| A&H SQ-5 | 440 × 515 | A&H weights & measures |
| A&H SQ-6 | 638 × 515 | A&H datasheet |
| A&H SQ-7 | 804 × 515 | A&H weights & measures |
| A&H Avantis | 917 × 627 | A&H cut sheet |
| A&H dLive S5000 | 1222 × 810 [DA VERIFICARE] | forum/retailer |
| A&H dLive S7000 | 1473 × 810 [DA VERIFICARE] | forum/retailer |
| DiGiCo Quantum 338 | **1595 × 805** [CERTO] | datasheet ufficiale (line drawing letto) |
| DiGiCo SD12 | 1094 × 795 [DA VERIFICARE] | datasheet da confermare |
| Midas HD96-24 | 1028 × 719 | quick start guide |
| Behringer X32 (già nel tool?) | 900 × 528 | noto |
| Midas M32 Live | 880 × 610 | noto |

**Design icone console**: top-view con superficie riconoscibile = banchi fader (righe di slot),
schermi touch (rettangoli scuri con riflesso), sezione master, poggiapolsi. **Niente loghi registrati**
(IP): la fedeltà sta in proporzioni, numero schermi e layout banchi. Nome nel catalogo = modello reale.
Le prime 12 (Yamaha + A&H + Q338 + HD96) sono nel lotto 4 (§9), generate con un **generatore
parametrico** (`gen-console.mjs`) per garantire coerenza di stile.

---

## 4. PA / impianto per il pubblico

Elementi con dimensioni reali di riferimento (pianta):

| Elemento | Pianta (cm) | Note |
|---|---|---|
| Line array large (stile K2/GSL8) | 134 × 52 | il singolo cabinet visto dall'alto = l'ingombro dell'array appeso |
| Line array mid (stile Kara II, ~110×?) | 74 × 45 | compatto |
| Sub doppio 18" (stile KS28) | 134 × 90 | ground stack, spesso in array |
| Sub singolo 18" | 60 × 70 | club/piazza piccola |
| Arco sub cardioide | componibile | fila di sub con spaziatura λ/4 — COMPOSITO col pattern batteria |
| Front fill | 40 × 35 | sul bordo palco |
| Side fill | 60 × 55 | ai lati (spesso su sub) |
| Delay tower (torre + array) | 220 × 220 | footprint torre layher 2×2 con zavorre |
| Torre FOH (Layher, 2 piani) | 400 × 300 | mixer+luci+follow spot |
| Postazione FOH a terra (transennata) | 400 × 300 | variante piazza |
| Amp rack / drive rack | 60 × 80 | dietro palco / sotto ala |
| Stack ground support PA | 140 × 100 | array a terra su sub |

Nel tool (futuro): il PA sta FUORI dal palco → serve la modalità "site" (§8) o almeno il piazzamento
fuori dai blocchi palco (il tool già lo consente).

---

## 5. Elettrico da palco e da sito ("quello che serve a un elettricista")

Direttiva: "fornire il palco di coordinate elettriche" + futuro piano assorbimenti.

### Catena tipica di distribuzione evento
Allaccio (rete o generatore) → quadro generale (main distro con differenziali) → sub-distro di zona
(palco SX/DX, FOH, luci, video, catering) → ciabatte/power drop ai musicisti.

| Elemento | Pianta (cm) | Note |
|---|---|---|
| Generatore 60 kVA silenziato (trailer) | 420 × 180 | con timone; il "main" dei medi eventi |
| Generatore 20 kVA | 300 × 150 | eventi piccoli |
| Quadro generale 125A (main distro) | 60 × 45 | CEE rossa 125A in, uscite 63/32A |
| Sub-distro 63A | 60 × 40 | tipico da palco |
| Distro 32A compatta | 40 × 30 | zona/ala |
| Power drop palco (ciabatta 16A×6) | 45 × 15 | ai piedi del musicista |
| Cable ramp 5 canali (modulo) | 90 × 50 | passaggio carrabile; componibile in fila |
| Passerella cavi pedonale | 100 × 30 | uscite di sicurezza |
| Torre faro mobile | 260 × 180 | illuminazione di sicurezza area |
| UPS rack | 55 × 60 | regia/video |
| Colonnina/torretta di allaccio | 40 × 40 | siti attrezzati |

### Assorbimenti tipici (per il futuro "piano di assorbimento")
Valori medi di pianificazione (fonte: guide di power planning eventi; margine +20-30%):

| Sistema | kW tipici |
|---|---|
| PA medio (line array + sub, palco 10×8) | 10–25 kW |
| PA large festival | 30–60 kW |
| Luci convenzionali+moving (palco medio) | 30–80 kW |
| LED wall (per m², P3.9 outdoor) | 0.4–0.7 kW/m² |
| Console + stage rack + monitor | 2–5 kW |
| Backline | 1–3 kW |
| Catering / food truck | 5–15 kW cad. |
| Torre faro | 1–2 kW |
| **Evento medio (1 palco)** | **30–45 kW** → generatore 60 kVA |
| **Festival main stage** | **150–400 kW** → 2× generatore + ridondanza |

**Idea forte (mia)**: ogni TYPES della libreria porta un metadato `watt` → il tool somma per zona
e produce automaticamente il **piano di assorbimento** nel PDF (tabella per quadro/zona + totale
+ margine + taglia generatore suggerita). Nessun competitor lo fa. Stessa meccanica della
channel list già esistente.

---

## 6. Cablaggio e ZONE del palco

Richiesta: "suddividere in zone il palco per ottimizzare il cablaggio, sia audio che elettrico".

Pratica professionale consolidata:
- Il palco si divide in **zone** (SX/CS/DX × fronte/retro, o A/B/C/D) — ogni zona ha il suo
  **sub-stagebox** (es. 16/8) collegato in cat/fibra o multicore allo split/mixer.
- L'input list si scrive **per zona**: "ch 12 — kick — box B-03" → il fonico di palco patcha a colpo sicuro.
- Stesso principio per l'elettrico: ogni zona ha il suo power drop da un sub-distro.

Elementi libreria (alcuni già esistenti: stagebox ✓ lotto 3, canaline ✓ lotto 2):

| Elemento | Pianta (cm) | Note |
|---|---|---|
| Sub-stagebox 16/8 | 48 × 35 | per zona |
| Splitter rack (FOH/monitor/broadcast) | 60 × 70 | 3-way split |
| Bobina multicore analogico | Ø 45 | 24-48ch |
| Bobina cat/fibra (cat drum) | Ø 32 | digitale |
| Sub-snake 8ch con frusta | 30 × 20 | ultimo metro |
| Patch bay da palco | 48 × 25 | |
| Wireless rack antenne (paddle ×2) | 55 × 45 | zona SR di solito |
| IEM rack + combiner | 55 × 60 | |

**Idea software (roadmap, non ora)**: strumento "Zona" nel tool = rettangolo etichettato (A/B/C)
che raggruppa gli elementi contenuti; channel list e piano elettrico si generano RAGGRUPPATI PER ZONA.
È il ponte naturale tra il disegno e i due piani (audio + power). Anche qui: nessun competitor lo fa.

---

## 7. Sicurezza / site plan (direttiva Gabrielli + pratica)

Ciò che le autorità chiedono nel piano di safety (I pilastri della circolare 07/06/2017 e linee guida):
ingressi/uscite separati e contingentati, **vie di fuga larghe e segnalate** (moduli da 120 cm),
settorizzazione della folla con corridoi centrali e perimetrali, **spazi di soccorso raggiungibili dai
mezzi**, assistenza sanitaria (ambulanze posizionate + PMA), antincendio (estintori, idranti, divieti),
impianto audio di emergenza con alimentazione dedicata, torri faro, centro di coordinamento.

Elementi fisici per il site plan:

| Elemento | Pianta (cm) | Note |
|---|---|---|
| Barriera antipanico (stile Mojo, modulo) | 100 × 125 | pedana calpestabile verso pubblico; componibile in linea/curva |
| Transenna zincata | 200 × 40 | percorsi e perimetri |
| New jersey plastica | 100 × 50 | viabilità/antintrusione veicolare |
| Ambulanza | 590 × 210 | tipo van (Sprinter/Ducato) |
| PMA — tenda pneumatica | 500 × 400 | posto medico avanzato |
| Bagno chimico | 110 × 110 | batterie da N moduli |
| Bagno chimico PMR (disabili) | 160 × 160 | obbligatorio |
| Gate ingresso (corsie contapersone) | componibile | transenne + tornelli |
| Metal detector portale | 85 × 60 | |
| Tornello a tripode | 50 × 50 | |
| Estintore carrellato 50kg | 40 × 70 | + simbolo normativo |
| Punto di raccolta (segnale) | simbolo | layer segnaletica |
| Torre faro (già in elettrico) | 260 × 180 | illuminazione esodo |
| Cabina di regia/coordinamento | 300 × 250 | container o gazebo |
| Food truck | 500 × 250 | distanze antincendio |
| Gazebo 3×3 | 300 × 300 | stand |
| Tenda 6×3 | 600 × 300 | hospitality/backstage |
| Container 10' | 300 × 240 | magazzino/camerino |
| Torre delay/follow spot | 220 × 220 | già in PA |
| Recinzione cantiere (pannello) | 350 × 40 | perimetro evento |

### Segnaletica normativa (famiglia grafica SEPARATA)
Per il piano di emergenza servono i **pittogrammi normati** (ISO 7010 / UNI EN): uscita di emergenza
(E001/E002, verde), estintore (F001, rosso), idrante (F002), punto di raccolta (E007), primo soccorso
(E003), direzione esodo (frecce). Qui i pittogrammi NON violano la regola "no pittogrammi": sono la
rappresentazione corretta e legale. Nel tool andranno su un **layer "sicurezza"** dedicato con stile
normativo (quadrati verdi/rossi) — distinto dagli oggetti fisici realistici.

---

## 8. Idee mie (oltre il mandato)

1. **Piano di assorbimento automatico** (§5) — metadato `watt` sugli elementi → tabella kW per
   zona nel PDF + suggerimento taglia generatore. Killer feature per noleggiatori e service.
2. **Zone di palco** (§6) — raggruppamento con etichetta → channel list e power plan per zona.
3. **Modalità "Site"** — scala grande (1u = 10 cm o 1 m) per l'area evento: palco diventa un
   blocco, entrano PA/torri/bagni/ambulanze/gate. Stesso motore, seconda vista. Il documento
   può avere ENTRAMBE le viste (palco + sito) nello stesso progetto.
4. **Layer** (audio / luci / video / elettrico / sicurezza) con visibilità separata e PDF per
   destinatario: il fonico riceve la pianta audio, l'elettricista quella elettrica, la commissione
   di vigilanza quella safety. Un progetto, N tavole — è ESATTAMENTE come lavorano i CAD pro,
   ma semplice.
5. **Distanze/quote automatiche FOH↔palco** e copertura PA indicativa (settore di dispersione
   disegnato come arco) — aiuta a posizionare i delay.
6. **Percorsi cavi**: polilinea "cavo" con metratura automatica (già c'è il metro lineare) +
   conteggio rampe necessarie ogni volta che attraversa una via di passaggio.
7. **Rider import/export**: il pacchetto consulenza già genera PDF; aggiungere blocco "requisiti
   elettrici" e "safety" = rider tecnico completo per l'organizzatore.
8. **Per i musicisti** (profondità sul loro setup): pedalboard configurabile (pattern batteria:
   pedali componibili), rack synth/IEM, postazione DJ completa, ampli+cassa combinazioni.

---

## 9. Strategia 3D per la libreria (richiesta esplicita)

La libreria è 2D top-view in cm reali: è GIÀ la pianta di un mondo 3D. Percorso a 3 stadi senza
buttare nulla:

1. **Adesso (fatto stanotte)**: ogni icona nuova nel manifest porta `h_cm` (altezza reale) e
   `forma3d` (`box` | `cilindro` | `prisma` | `custom`). Le esistenti si integrano a tappe.
   Costo: zero disegno, solo metadati.
2. **2.5D (medio termine)**: vista isometrica generata per ESTRUSIONE: footprint × h_cm, con il
   top-view come texture della faccia superiore. Per l'80% degli oggetti (casse, mixer, pedane,
   bagni, container) l'estrusione è già credibile. Engine: SVG isometrico o canvas, niente WebGL.
3. **3D vero (lungo termine)**: three.js + glTF low-poly per gli oggetti "hero" (batteria, timpani,
   line array appeso, palco con blocchi ad altezze reali — le altezze dei blocchi ci sono GIÀ).
   Il modello dati non cambia: x, y, rot, w, d, h ci sono tutti.

Nota: `h` esiste già in TYPES per molti elementi del tool → il passo 1 allinea la libreria al tool.

---

## 10. Lotto 4 prodotto stanotte (in libreria, zero codice nel tool)

Prodotte con i criteri di sempre (realistiche, scala reale, validatore, preview con review mode).
Dettagli e conteggio finale in `ICON_LIBRARY_REPORT.md` (addendum lotto 4) nella repo libreria.

- **Console** (gen-console.mjs, parametrico): DM3, DM7 Compact, DM7, CS-R3, CS-R5, CS-R10,
  SQ-5, SQ-6, SQ-7, Avantis, dLive S5000, dLive S7000, Quantum 338, HD96-24
- **PA**: line array large/mid, sub 2×18 e 1×18, front fill, side fill, amp rack, delay tower,
  postazione FOH
- **Elettrico**: generatore 60/20 kVA, main distro 125A, sub-distro 63A, distro 32A, power drop,
  cable ramp, torre faro
- **Cablaggio**: sub-stagebox, splitter rack, bobina multicore, cat drum, sub-snake, wireless rack
- **Sicurezza/site**: barriera antipanico, transenna, new jersey, ambulanza, PMA, bagno chimico
  (std+PMR), metal detector, tornello, estintore carrellato, food truck, gazebo 3×3, tenda 6×3,
  container, cabina regia
- **Video**: LED wall (parete 3×2 m), follow spot su torre — [se il tempo lo consente]

## 11. Fonti principali

- Competitor: [wifitalents ranking](https://wifitalents.com/best/stage-plot-software/), [StageBuilder Pro blog](https://stagebuilderpro.com/blog/best-stage-plot-apps), [SoundGirls list](https://soundgirls.org/list-of-apps-and-software-for-designing-stage-plots/)
- Console: [Yamaha Rivage specs](https://usa.yamaha.com/products/proaudio/mixers/rivage_pm/specs.html), [Yamaha DM7 specs](https://usa.yamaha.com/products/proaudio/mixers/dm7/specs.html), [A&H SQ-7 weights&measures](https://www.allen-heath.com/content/uploads/2023/06/Weights-and-Measures-SQ-7.pdf), [A&H Avantis cut sheet](https://www.allen-heath.com/content/uploads/2023/05/Avantis-Cut-sheet.pdf), [DiGiCo Q338 datasheet](https://digico.biz/wp-content/uploads/2022/10/DiGiCo-Quantum-338-Data-Sheet.pdf) (line drawing), [Midas HD96 guide](https://manuals.plus/m/40ac4d381c2aefbe368a89ba23fbd5707eecc094bbf82ae83024f6e3084ca522)
- PA: [L-Acoustics K2](https://www.l-acoustics.com/products/k2/), [KS28 datasheet](https://cdn-docs.av-iq.com/dataSheet/KS28_Datasheet.pdf), [d&b GSL8](https://www.dbaudio.com/global/en/products/all/series/sl-series/gsl8/)
- Elettrico: [Distribution Zone distro boxes](https://www.distributionzone.com/products/power-distribution-boxes/), [Active Air 60kVA trailer](https://activeair.com.au/equipment/60kva-trailer-mounted-silenced-generator/), [Ticket Fairy power planning](https://www.ticketfairy.com/blog/power-supply-and-electrical-distribution-planning-for-festivals)
- Sicurezza: [PuntoSicuro circolare Gabrielli](https://www.puntosicuro.it/security-C-125/la-circolare-gabrielli-sulla-sicurezza-dei-grandi-eventi-AR-17138/), [Safety&Security Magazine piano emergenza](https://www.safetysecuritymagazine.com/articoli/la-redazione-del-piano-emergenza-le-manifestazioni-pubbliche/), [HSE stage barriers](https://www.hse.gov.uk/event-safety/stage-barriers.htm), [Mojo Barriers](http://mojobarriers.com/products/)
- Varie: [D-tox portable toilet dims](https://www.dtox.org/blog/portable-toilet-dimensions-everything-you-need-to-know), [Layher FOH tower](https://www.layher.com/en/products/eventsystems/overlay_foh-turm), [JMAZ LED panel 500×500](https://jmazlighting.com/products/osiris-outdoor-3-9-led-video-wall-500x500/)
