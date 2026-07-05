# Spec — Audio OUT / Monitor + Layer Manager
## 05/07/2026 · target: stageplot.it (index.template.html + src/styles.css → build.mjs)

**Obiettivo.** (1) Completare l'audio col **lato OUTPUT** (monitor: wedge/IEM, mix, ritorni box→monitor,
monitor list, criticità), riusando il motore di cablaggio esistente. (2) Introdurre un **Layer Manager**:
un pannello unico che governa visibilità/opacità/colore/blocco/rimozione di tutti i layer, con legenda.

**Non-obiettivi (v1).** Editing manuale dei cavi di ritorno (waypoint); sistema monitor "split"
(console monitor separata) completo; DMX/luci/video; drag per riordinare lo z-order dei layer.

---

## PARTE A — Audio OUT / Monitor

### A0. Dati già presenti (riuso) [CERTO]
- `OUT_SET = { wedge:"wedge", sidefill:"side fill", drumfill:"drum fill", iem:"IEM", iemant:"IEM",
  hearback:"personal mixer", monmix:"console mon" }` → i **sink monitor**.
- `STAGEBOX_DB[id].out` → uscite line della stage box (es. Rio1608-D2 out:8).
- `audioCablingEngine()` / `cabResult()` / `cablingMarkup()` / `state.cab` già esistono.
- `autoOutputs()` (consulenza) già raggruppa i monitor: logica di riferimento, non riusata direttamente.

### A1. Modello: mix e sink
- **Sink** = item con `OUT_SET[it.type] != null`, ESCLUSO `monmix` (è la console monitor, non un sink).
- **Mix** = gruppo di sink con la **stessa etichetta normalizzata** (`trim().toUpperCase()`).
  Sink senza etichetta → mix singolo auto `"MIX n"`. (Convenzione già usata: wedge "MIX 1"…"MIX 4".)
- Un mix occupa **1 canale di uscita** su una stage box; `iem`/`iemant`/`hearback` = **stereo (2 ch)**.
- Ordine mix: per banco/ordine inserimento del primo sink del gruppo (stabile), poi numerati `M1..Mk`.

### A2. Capacità uscite box
```
function cabBoxCapOut(it){
  if(it.hw && STAGEBOX_DB[it.hw]) return Math.max(0, STAGEBOX_DB[it.hw].out||0);
  return it.type==="stagebox" ? 8 : 4;   // generico
}
```
Box auto-proposte (input): assegnare `outCap = 8` di default così i ritorni hanno dove appoggiarsi.

### A3. Estendere `audioCablingEngine()` (NON creare un secondo motore)
Aggiungere al risultato, riusando le stesse `boxes` (accounting separato `usedOut`):
- Raccogli i sink; raggruppa per etichetta → `mixes = [{name, ch (stereo?2:1), sinks:[items], box, outCh}]`.
- Per ogni mix (ordine stabile): scegli la box più vicina al **centroide dei suoi sink** con
  `outCap - usedOut >= mix.ch`; incrementa `usedOut`; assegna `outCh` (progressivo per box).
  Se nessuna: `mix.box=null` → criticità.
- `returnLinks = [{mix, sink(item), box, outCh, pts:[[box],[sink]], lenM (+margine), cut}]`
  (un cavo per ogni sink del mix; stessa `outCh`).
- `capOutTot = Σ box.outCap`; conteggio ritorni per taglio in `returnCables{}`.
- **Criticità monitor** (in `issues`, livello coerente):
  - mix totali (canali) > `capOutTot` → err "uscite insufficienti".
  - sink con `box=null` → err "monitor senza uscita".
  - sink a >8 m dalla box → warn "monitor lontano: valuta sub-snake/return locale".
  - mix `iem`/`hearback` senza `wlrack` sul palco → info "IEM: prevedi rack wireless".
- Ritornare anche: `mixes, returnLinks, returnCables, capOutTot, monConsole` (`monConsole` = item `monmix`
  se presente, usato come nodo origine alternativo in v2).

### A4. Rendering layer ritorni (in `cablingMarkup()`)
- Gate: disegnare i **cavi di ingresso** solo se `state.cab.showInputs!==false`; i **ritorni** solo se
  `state.cab.showReturns!==false`.
- Ritorni: `<path class="cab-return">` colore **monitor ciano #06b6d4**, tratto pieno, leggermente più
  sottile; etichetta `class="cab-lbl cab-lbl-ret"` con `M{n}` + (se `showLengths`) `· {cut} m`.
- Badge box: mostrare `in {used}/{cap} · out {usedOut}/{outCap}`.
- v1: ritorni **non editabili** (no `.cab-hit`/waypoint). L'editing dei ritorni è v2.

### A5. Monitor list (vista derivata) — sezione a tendina con cestino (come Input list)
- `monitorList()` → righe `{n, mix, tipo (OUT_SET), patch: box.letter+"O"+outCh || "—", nMon, box}`.
- Sezione destra `#monSec` clonando il pattern di `#patchSec`: header `.cab-sechead`
  (`#monCaret` + titolo "Monitor list" + `.cab-trash #monTrash`), corpo `#monBody`
  (`#monSummary` + `#monRows` + bottone `#monPdf` "Esporta monitor list (PDF)").
- Var JS `monActive`/`monOpen`; `renderMonitorPanel()` chiamata da `renderAccessoriCount()`.
- Colonne: `# · Mix · Tipo · Uscita` (badge patch ciano). Riepilogo: N mix, N wedge/IEM, uscite usate.
- `monitorListPdf()` clonando `patchListPdf()` (header, tabella; hook `__monPdfTest`).
- Catalogo: pulsante azione **"Monitor list"** sotto "Monitor da palco" (accanto ai wedge), `toggleMonitorView()`.

### A6. Attivazione
- Il layer ritorni fa parte di **Cablaggio audio** (stesse box). Quando `state.cab.on`, il motore calcola
  anche i monitor; la loro **visibilità** è governata dal Layer Manager (`showReturns`).
- Se ci sono monitor sul palco ma `state.cab.on===false`, la Monitor list mostra comunque il calcolo
  (come Input list: `cabResult(true)` è puro), proponendo box auto.

### A7. Stato nuovo (in `state.cab`, normalizzato in `normalizeState`)
`showInputs` (bool, default true), `showReturns` (bool, default true). Nessun altro campo persistito
(mix/ritorni sono derivati). `it.chOut` opzionale su box generiche (uscite manuali) — opzionale v1.

---

## PARTE B — Layer Manager

### B1. Registro layer (estensibile) — `LAYERS`
Array di descrittori (fonte unica per manager + legenda + colori). Ogni voce:
```
{ id, name, color, group,
  active(),                 // il layer esiste sul palco?
  visible(), setVisible(v), // mostra/nascondi
  opacity(), setOpacity(v), // opzionale (null se non applicabile)
  lockable, locked(), setLocked(v),
  removable, remove() }     // disattiva del tutto (cestino)
```
Voci v1:
| id | name | color | active | visible/set | opacity | lock | remove |
|---|---|---|---|---|---|---|---|
| `zaudio` | Zone Audio | `#3b82f6` | zones kind=audio | `state.layerAudio` | — | no | spegne `layerAudio` |
| `zpower` | Zone Alimentazione | `#d97706` | zones kind=power | `state.layerPower` | — | no | spegne `layerPower` |
| `cabin` | Cablaggio audio (in) | `#0d9488` | `state.cab.on` | `state.cab.showInputs` | `state.cab.opacity` | `state.cab.locked` | spegne `cab.on` |
| `cabout` | Monitor / ritorni | `#06b6d4` | `state.cab.on` | `state.cab.showReturns` | (condivisa cab) | (condivisa) | — |

Ogni `setVisible/setOpacity/…` fa `save()` + `render()`. Colori centralizzati in `LAYER_COLORS`.

### B2. UI — pulsante header + popover
- Nuovo controllo nell'header (toolbar in alto), icona "layer" (stack) + testo "Layer", accanto agli
  altri controlli. Sempre accessibile (anche con elemento selezionato → risolve il limite delle sezioni
  che spariscono in selezione).
- Click → **popover** ancorato al pulsante:
  - Titolo "Layer".
  - Per ogni layer con `active()`: riga `[dot colore] Nome … [occhio visibile] [🔒 se lockable] [🗑 se removable]`;
    slider opacità sotto la riga se `opacity()!=null`.
  - Layer non attivi: elencati in grigio con "attiva…" che apre il catalogo/azione relativa (o omessi in v1).
  - **Legenda** in fondo: griglia di `[dot] nome` per tutti i colori (anche layer futuri elettrico/rete
    listati come "in arrivo" o nascosti finché non implementati).
- Chiusura su click esterno / Esc. Nessuno stato persistito del popover.

### B3. Colori formalizzati — `LAYER_COLORS`
```
audioIn:#0d9488, monitor:#06b6d4, elettrico:#d97706, rete:#4f46e5, luci:#db2777, video:#16a34a,
zoneAudio:#3b82f6, zonePower:#d97706
```
Applicare in CSS (`.cab-line` teal, `.cab-return` ciano, ecc.) e nella legenda. Le classi zone restano.

### B4. Legenda su plot/PDF (v1 minimale)
- v1: legenda solo nel popover del Layer Manager.
- v2: opzione "mostra legenda sul palco" (riquadro in un angolo) + blocco legenda nei PDF.

---

## Integrazione / punti di modifica (file: index.template.html salvo diverso)
- `audioCablingEngine()` — aggiungi calcolo mix/returnLinks/criticità monitor (A3).
- `cablingMarkup()` — gate `showInputs`/`showReturns`, render ritorni ciano, badge in/out (A4).
- `normalizeState()` — `state.cab.showInputs/showReturns` (A7).
- Nuove funzioni: `cabBoxCapOut`, `monitorList`, `renderMonitorPanel`, `toggleMonitorView`,
  `monitorListPdf`; HTML `#monSec` in `#noSel`; chiamata in `renderAccessoriCount`.
- Catalogo `buildCatalog()` — azione "Monitor list" sotto "Monitor da palco".
- Layer Manager: `LAYERS`/`LAYER_COLORS`, pulsante header + popover `#layerPop`,
  `renderLayerManager()`; CSS popover + `.cab-return`/`.cab-lbl-ret` + dot legenda; `src/styles.css`.

## Criteri di accettazione (test e2e Chrome)
1. Palco con batteria + 3 wedge etichettati "MIX 1","MIX 1","MIX 2" + 1 IEM → **3 mix** (M1 con 2 wedge,
   M2, M3-IEM stereo); Monitor list mostra 3 righe; ritorni disegnati **ciano**; M1 ha 2 cavi stessa uscita.
2. `showReturns=false` → ritorni spariti, ingressi restano; `showInputs=false` → viceversa (Layer Manager).
3. Box reale con `out<mix` → criticità "uscite insufficienti"; monitor lontano → warn sub-snake.
4. Monitor list: cestino rimuove solo la Monitor list; PDF 1 pagina con le righe corrette.
5. Layer Manager (header): elenca i layer attivi con occhio/opacità/cestino; legenda coi colori;
   toggle visibilità funziona anche con un elemento selezionato; accessibile in dark.
6. Retrocompat: progetti esistenti caricano senza errori (nuovi campi defaultati).

## Deferred (v2+)
- Editing manuale dei cavi di ritorno (waypoint) e del percorso.
- Sistema monitor split (origine dalla console `monmix`/monitor world) e home-run monitor dedicato.
- IEM: catena verso rack wireless + antenne come sink intermedio.
- Legenda sul palco e nei PDF; z-order riordinabile; opacità per-zona.
- Aggancio ai layer futuri (elettrico-motore, rete) già previsti nel registro `LAYERS`.
