# Spec — Zone di palco + Piano di assorbimenti elettrici

> Sessione di progettazione, 04/07/2026. Origine: `docs/idee/RICERCA_PRO_PALCHI_2026-07-04.md`
> §5–§6 e §8 (idee 1–2). **Questo è il documento di progettazione**: da qui si deriva un piano
> di implementazione (writing-plans) in una sessione dedicata. Non contiene ancora codice definitivo.

## 1. Perché (il differenziatore)

Nessun competitor "semplice" (Stage Plot Pro, StagePlotGuru, SetupPad) calcola la **potenza
elettrica** né organizza il palco in **zone di cablaggio**. I CAD pro (Vectorworks, WYSIWYG) lo
fanno ma costano 500–3000 € e non sono per musicisti. StagePlot è già **in scala reale**: è l'unico
che può aggiungere questi due strati restando semplice.

Due feature intrecciate, stesso motore:
1. **Zone di palco** — regioni etichettate (A/B/C o SX/CS/DX) che raggruppano gli elementi
   contenuti. Servono a ottimizzare il cablaggio: la channel list e il piano elettrico si generano
   **raggruppati per zona** (ogni zona = 1 sub-stagebox + 1 power drop).
2. **Piano di assorbimenti** — ogni elemento porta un metadato `watt`; il tool somma per zona →
   **tabella kW nel PDF** + margine + taglia generatore/allaccio suggerita, e (fase 2) confronto
   con i generatori piazzati sul palco.

**Valore per chi**: service/noleggiatori (dimensionano l'allaccio), organizzatori (sanno se serve
un generatore), fonici (patch per zona a colpo sicuro), commissioni (documento tecnico).

## 2. Vincoli e principi

- **Non è un calcolo strutturale/elettrico certificato** — come per il rigging plot: valori
  nominali tipici, disclaimer chiaro nel PDF ("non sostituisce il progetto di un tecnico
  abilitato"). Vedi §9.
- **Retrocompatibilità**: i documenti salvati non devono rompersi. `zones` e `watt` sono additivi;
  assenti = comportamento attuale (nessuna zona, potenza 0 → sezione PDF omessa).
- **Riuso**: la meccanica è quella della **channel list** già esistente (`state.inputs/outputs`,
  `renderChannels`, `linkChannelsToItems`) e dei **blocchi palco** (`state.stage.blocks`,
  overlay dashed su layer dedicato). Non si inventa un motore nuovo.
- **Gate**: il "Piano elettrico" nel PDF vive nella **consulenza** (`window.__consultMode`), come la
  channel list pro (audit/roadmap 1B). Nel tool free: totale kW in header + zone disegnabili, ma il
  documento completo è della consulenza. (Decisione D5, §8.)

## 3. Modello dati

### 3.1 Zone
Nuovo array **`state.zones`** (non dentro `stage.blocks`: le zone sono annotazione, non palco).
```
zone = {
  id: "z1",            // univoco
  label: "A",          // A/B/C… o "SX", "Backline", ecc.
  x, y, w, d,          // rettangolo in cm, coord. palco (come i blocchi)
  color: "#0d9488"     // opzionale, tinta del bordo/etichetta (default = accent)
}
```
Assegnazione elemento→zona: **geometrica** (centro dell'elemento dentro il rettangolo zona).
Se più zone si sovrappongono, vince l'**ultima** in `state.zones` (z-order). Override esplicito
opzionale `it.zone = "z1"` (fase 2, per casi limite). Elementi fuori da ogni zona → bucket
**"Fuori zona"**.
Helper: `zoneOf(it)` → id zona o null; `elementsInZone(zid)` → array.

### 3.2 Potenza per elemento
Mappa **`WATT`** (nuovo, accanto a `TYPES`): potenza AC nominale al muro, in watt, **solo per i
tipi che si alimentano**. Tutto il resto (strumenti acustici, aste, persone, pedane, truss,
zavorre, casse passive) = 0 e non compare.
```
var WATT = {
  // backline
  comboamp:300, stack:450, bassamp:500, keysamp:200, leslie:300,
  stagepiano:60, doppiatastiera:120, celesta:40, edrums:80, drumshield:0,
  djset:400,
  // regia e console (draw tipico dal datasheet dove noto)
  dm3:60, dm7c:120, dm7:150, csr3:280, csr5:350, csr10:600,
  sq5:90, sq6:100, sq7:110, avantis:180, dlives5:250, dlives7:280,
  q338:340, hd96:300, laptop:90, audiointerface:15, mixermonitor:150, foh:200,
  // PA — la potenza vive sugli AMP RACK (le casse sono passive → 0, no doppio conteggio)
  amprack:2500, arraylarge:0, arraymid:0, sub218:0, frontfill:0, delaytower:0,
  wedge:0, sidefill:0, drumfill:0,
  // luci — per fixture / per rack
  consolaluci:100, dimmerluci:3600, testamobile:400, parluci:120, sagomatore:750,
  followspot:1200, strobo:900, fumomachine:1000, hazer:800,
  // video — LED wall per AREA (formula, §3.3); resto puntuale
  proiettore:400, camera:30,
  // elettrico — i GENERATORI sono SORGENTI (§3.4), i distro sono pass-through (0)
};
```
Override per-elemento: campo **`it.watt`** modificabile nel pannello (solo per i tipi con `WATT`
definito). `wattOf(it)` = `it.watt ?? areaWatt(it) ?? WATT[it.type] ?? 0`.

### 3.3 LED wall per area
Per `schermo`/`ledwallmod`/LED wall: potenza = **area_m² × 500 W/m²** (P3.9 outdoor tipico, dalla
ricerca). `areaWatt(it)` = `(it.w/100)*(it.d/100)*500` per i tipi in `WATT_BY_AREA = {schermo:500,
ledwallmod:500}`. Il muro LED è resizable → la potenza scala con la superficie. Ottimo esempio del
perché la scala reale è un vantaggio.

### 3.4 Generatori = sorgenti
`gen60`, `gen20` (e futuri) non sono carichi ma **capacità**. Mappa `GEN_KVA = {gen60:60, gen20:20}`.
Capacità utile in kW = `kVA × 0.8` (fattore di potenza tipico). Se ≥1 generatore è sul palco, il
piano confronta **domanda vs capacità totale** (fase 2, semaforo verde/rosso).

## 4. Matematica del piano

```
domanda_zona(zid)  = Σ wattOf(it) per it in elementsInZone(zid)         // W
domanda_totale     = Σ tutte le zone + "Fuori zona"                     // W
margine            = 25%  (configurabile in fase 2; fisso in MVP)
domanda_progetto   = domanda_totale × 1.25
capacita_gen       = Σ GEN_KVA × 0.8 × 1000                             // W (se generatori presenti)
```
**Taglia suggerita** (se nessun generatore o domanda > capacità): più piccola tra
`[20,40,60,100,125,150,...] kVA` tale che `kVA × 0.8 ≥ domanda_progetto/1000`. Se `domanda_progetto`
sta sotto ~15 kW → "allaccio di rete (no generatore)". Sopra ~100 kW → "più generatori / cabina".

Tutti i valori mostrati in **kW** (1 decimale). Fattore di potenza e margine esplicitati nel PDF.

## 5. UI

### 5.1 Strumento "Zona"
In **"Palco e strutture"**, accanto a "Blocco palco" e "Planimetria": azione **"Zona di cablaggio"**.
- Al click entra in una modalità (come `stageEdit`) `zoneEdit`; il pannello destro mostra la lista
  zone + "＋ Aggiungi zona". Ogni zona: campo label, chip colore, e readout live
  **"N elementi · X,X kW"**.
- Le zone si disegnano trascinando (riuso di `newblk` alt-drag) o via "＋ Aggiungi zona" (rettangolo
  di default al centro, poi si trascina/ridimensiona come i blocchi).
- Rendering: rettangolo **dashed** col colore zona, riempimento tenue (`fill-opacity .05`), etichetta
  grande nell'angolo alto-sx ("A"). Su layer **sotto** gli elementi, **sopra** il palco. Non
  intercetta i click degli elementi (pointer-events sul solo bordo/handle in modalità zoneEdit).
- Fuori da `zoneEdit` le zone restano visibili ma leggere (o togglabili da un occhio, come la
  planimetria).

### 5.2 Pannello elemento — Potenza
Per gli elementi con `WATT[it.type]` definito: nel pannello proprietà una riga **"Potenza (W)"**
(stepper/numero, prefill dal default, editabile → `it.watt`). Per gli altri: nascosta. Coerente col
pattern "Lato quota" / stepper già in uso.

### 5.3 Riepilogo in header
La riga statistiche (`renderAccessoriCount`, `#accessoriCount`) guadagna, quando `domanda_totale>0`:
**"⚡ Potenza: X,X kW"** (cliccabile → apre il pannello "Piano elettrico"). Discreto, in tono col
resto.

### 5.4 Pannello "Piano elettrico" (consulenza)
Sezione (come "Evento"/"Planimetria") con la **tabella per zona** (Zona · N elementi · kW), totale,
margine, taglia suggerita, e — se generatori presenti — semaforo capacità. Read-only, si popola dal
modello. Nel tool free: solo il totale in header; la tabella completa è nel PDF consulenza.

## 6. Output PDF

Nuova sezione **"Piano elettrico"** nel PDF consulenza (dopo la channel list), **omessa se
`domanda_totale==0`**:
```
PIANO ELETTRICO (valori nominali — non sostituisce il progetto di un tecnico abilitato)
┌─────────────┬──────────────────────────────┬──────────┐
│ Zona        │ Carichi alimentati           │ Potenza  │
├─────────────┼──────────────────────────────┼──────────┤
│ A — Backline│ Ampli chitarra, Ampli basso… │  1,3 kW  │
│ B — Batteria│ E-drums…                     │  0,1 kW  │
│ FOH         │ Console Q338, Amp rack ×2    │  5,3 kW  │
│ Fuori zona  │ Torre faro                   │  1,5 kW  │
├─────────────┼──────────────────────────────┼──────────┤
│ TOTALE      │                              │  8,2 kW  │
│ + margine 25%                              │ 10,3 kW  │
│ Suggerito: generatore 20 kVA (o allaccio 32A 3F)      │
└───────────────────────────────────────────────────────┘
```
Stessa pipeline della channel list (flatten CSS → svg2pdf già collaudata).

## 7. Companion: channel list per zona

La channel list esistente guadagna una colonna/raggruppamento **"Zona"** derivata da `zoneOf(item)`
via `linkChannelsToItems` (già mappa riga↔oggetto). Nel PDF: le righe si possono ordinare/raggruppare
per zona (es. "Zona B — box B: ch 1 kick, ch 2 snare…"). È la parte "cablaggio audio" del §6 della
ricerca. MVP: colonna zona opzionale; fase 2: raggruppamento + assegnazione box per zona.

## 8. Fasi

- **Fase A (MVP)**: mappa `WATT` + `areaWatt` LED + `it.watt` override nel pannello + totale kW in
  header + strumento Zona (disegna/etichetta/colore) + readout kW per zona + tabella "Piano elettrico"
  nel PDF consulenza + taglia generatore suggerita. Colonna "Zona" nella channel list.
- **Fase B**: semaforo domanda vs generatori piazzati; margine configurabile; raggruppamento channel
  list per zona + box per zona; bilanciamento trifase (ripartizione L1/L2/L3).
- **Fase C**: albero distribuzione (quale distro alimenta quale zona), stima metratura cavi/rampe,
  export assorbimento per fase con margine di spunto (inrush).

## 9. Decisioni & rischi

- **D1 — Doppio conteggio PA**: potenza sugli **amp rack** e sui device attivi; casse passive = 0.
  Documentato nel PDF ("le casse sono alimentate dagli amp rack"). Rischio: utente piazza un array
  senza amp rack → 0 kW PA. Mitigazione: hint nel pannello PA ("la potenza è sull'amp rack") e, in
  fase B, warning "array senza amplificazione".
- **D2 — Valori nominali**: `WATT` sono medie tipiche, non targhe reali. Disclaimer sempre nel PDF.
  Editabili per-elemento per chi ha i dati veri.
- **D3 — Zone geometriche**: assegnazione per centro-in-rettangolo; overlap → ultima zona. Semplice,
  prevedibile. Override esplicito solo in fase 2.
- **D4 — Margine 25% fisso** in MVP (standard di planning dalla ricerca). Configurabile in fase B.
- **D5 — Gate consulenza**: tabella completa nella consulenza; nel free solo il totale. Coerente con
  la channel list. (Se in futuro si vuole il piano anche nel free, è un cambio di gate, non di
  motore.)
- **Rischio peso**: nessun asset nuovo pesante (solo mappe JS piccole). Le icone elettrico/rigging
  sono già in libreria; l'integrazione è separata.
- **Rischio scope**: la tentazione è fare subito il trifase/albero distro. Resta in fase B/C: l'MVP
  deve dare **il numero** (kW totali + taglia) — è già più di ogni competitor.

## 10. Prossimo passo

Da questa spec → **piano di implementazione** (writing-plans) della sola **Fase A**, in sessione
dedicata: task per `WATT`+`wattOf`, `state.zones`+render overlay, strumento Zona nel pannello,
riga potenza header, campo potenza nel pannello elemento, sezione PDF "Piano elettrico", colonna
zona nella channel list. Ogni task con test a video (piazza ampli+console → verifica kW; disegna
zona → verifica raggruppamento; export PDF consulenza → verifica tabella).
