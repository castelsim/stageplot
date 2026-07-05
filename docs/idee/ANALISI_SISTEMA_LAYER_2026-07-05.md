# Analisi del sistema tecnico StagePlot + roadmap layer
## 05/07/2026

> Analisi a fondo dello stato attuale, idee di miglioramento, e quali layer conviene aggiungere.
> Convenzioni: [CERTO] = verificato nel codice/sessione · [DEDOTTO] = ragionamento · [DA VERIFICARE].

---

## 1. Cos'è il sistema oggi

**Base editor** [CERTO]: palco in scala reale (blocchi + planimetria), catalogo ~150 elementi (14 categorie),
elementi con metadati, salvataggio locale + cloud, condivisione link, flusso consulenza (a pagamento,
realtime, channel list editabile), export PDF multipli.

**Layer tecnici oggi** [CERTO]:
1. **Zone Audio** — regioni *manuali/dichiarative*: "qui servono N canali + stagebox". Coarse.
2. **Zone Alimentazione** — regioni *manuali*: punti corrente, prese, potenza. + mappa **WATT** per
   elemento (assorbimenti reali) → totali, mappa potenza, PDF "Piano elettrico".
3. **Cablaggio audio (motore v2)** — *calcolato*: sorgenti → stage box → canale → lunghezza cavo;
   **libreria hardware** (stage box + mixer + protocolli + compatibilità), cavi editabili (waypoint),
   punto principale + digital snake, criticità, report. Filosofia **dati → calcolo → layer → report**.
4. **Input list** — *vista derivata* dal motore (patch #·sorgente·mic/DI·box·canale), con PDF.

**Report/PDF**: plot, zone audio, zone alimentazione, cablaggio, input list, documento completo,
channel list consulenza.

---

## 2. Punti di forza

- **Scala reale + motore automatico**: non è un disegno, è pre-produzione (calcola cosa serve).
- **Hardware intelligente**: capacità/protocolli reali, compatibilità mixer↔box.
- **Fonte unica**: input list derivata dal motore, non un secondo elenco → niente drift.
- **Editabile dal tecnico**: il software propone, il tecnico corregge (cavi, box, modello).
- **UI coerente**: layer attivabili on-demand (tendina + cestino), non ingombrano di default.

---

## 3. Debolezze e incoerenze (dove intervenire)

1. **Doppia verità audio** [CERTO]. *Zone Audio* (dichiarativo: "8 canali qui") e *motore cablaggio*
   (per-sorgente su box reali) descrivono la stessa cosa in due modi → un utente può crearle entrambe
   e ottenere due risposte diverse. Rischio di confusione.
2. **Asimmetria audio vs elettrico** [CERTO]. L'audio ha un motore completo; l'elettrico è ancora
   *manuale* (zone + WATT), senza calcolo distro/cavi/fasi. Filosofia non applicata in modo uniforme.
3. **Manca il lato OUTPUT dell'audio** [CERTO]. Il motore fa gli ingressi (mic/DI→box). Ma un sistema
   reale ha i **monitor** (wedge/IEM), i mix, i ritorni box→wedge/ampli. `OUT_SET` e il campo `out`
   della libreria esistono ma non sono "motorizzati". L'audio è raccontato a metà.
4. **Rete come sotto-prodotto** [DEDOTTO]. Il digital snake è disegnato come una linea, ma i sistemi
   moderni sono **reti** (Dante/AVB/AES50): switch, primario/secondario, PoE, tratte Cat/fibra. Oggi
   assente.
5. **Nessun "gestore layer"** [CERTO]. Ogni layer ha la sua sezione a destra. Con 5-6 layer la colonna
   e il palco diventano ingestibili senza un pannello unico (visibilità/opacità/blocco/colore/legenda).
6. **Modello persona-vs-mic** [CERTO]. "Cantante" (personaggio) non genera canale, l'asta sì: corretto
   ma poco intuitivo per un principiante.
7. **Dipendenza dai dati HW** [CERTO]. Il DB è la base del motore; peso/dimensioni non ci sono ancora
   (utili per logistica). La qualità del motore = qualità del DB.
8. **Mobile** [DEDOTTO]. I layer tecnici sono pensati desktop; su mobile il pannello idle non è sempre
   raggiungibile.

---

## 4. Idee di miglioramento (trasversali, non-layer)

- **A. Layer Manager + Legenda** *(abilitante, priorità architetturale)*. Un solo pannello con TUTTI i
  layer: mostra/nascondi, opacità, blocco, colore, ordine; legenda sul palco e nel PDF. Senza questo,
  ogni nuovo layer peggiora l'ingombro. È il prerequisito per crescere.
- **B. Colori per layer formalizzati**: audio-in teal, audio-out/monitor ciano, elettrico ambra,
  rete viola/blu, luci magenta, video verde. Coerenti ovunque + legenda.
- **C. "Audit tecnico" unico**: un check che aggrega le criticità di tutti i layer (sorgenti senza
  patch, sovraccarico elettrico, cavo troppo lungo, HW incompatibile, mixer saturo…) → **punteggio di
  prontezza** del rider.
- **D. Tech pack / Rider PDF**: assembla TUTTI i layer in un documento pro (plot + input + monitor +
  piano elettrico + rete + pesi/ingombri). È **il deliverable** che rende StagePlot uno strumento di
  pre-produzione, non un editor.
- **E. Libreria HW logistica**: peso, unità rack, assorbimento dell'hardware stesso (alimenta il motore
  elettrico), per totali camion/peso/rack.
- **F. Mixer come oggetto intelligente (completare)**: verifica canali richiesti vs canali del mixer,
  filtra box compatibili (fatto in parte), avvisa "servono N stage box".
- **G. Unificare Zone↔Motore**: le Zone Audio diventano *vincoli/suggerimenti* per il motore (dove
  mettere una box, quanti canali), non una verità parallela.
- **H. Template con default tecnici**: "Band rock/Quartetto/DJ" che popolano palco **e** setup tecnico.

---

## 5. Quali LAYER aggiungere — raccomandazione con priorità

Principio guida: **StagePlot è audio-first** (fondatore audio engineer). Ogni nuovo layer deve
(a) **approfondire l'audio**, oppure (b) **riusare un motore esistente**. Luci/video sono espansione
orizzontale: alto valore ma diluiscono il focus → dopo.

| Layer | Stato oggi | Valore | Sforzo | Priorità | Perché |
|---|---|---|---|---|---|
| **Audio OUT / Monitor** | assente (dati `OUT_SET`/`out` ci sono) | Alto | Medio | **1** | Completa l'audio: mix, wedge/IEM, output patch, ritorni box→wedge. È la metà mancante |
| **Elettrico (motore)** | parziale (zone+WATT) | Alto | Medio | **1** | Riusa i WATT: carichi→distro/quadri→sezioni cavo→fasi/sovraccarico→report. Rende uniforme la filosofia |
| **Layer Manager + legenda** | assente | Alto | Basso-Medio | **1** | Abilitante: senza, i layer non scalano |
| **Rete / Dati (Dante/AVB/AES50)** | solo linea snake | Medio-Alto | Medio | **2** | Molto pro; estende il digital snake: switch, backbone, tratte Cat/fibra, ridondanza. Aggancia il DB protocolli |
| **Tech pack PDF** | report separati | Alto | Medio | **2** | Il deliverable che unifica tutto |
| **Luci / DMX** | elementi luci presenti | Medio | Alto | **3** | Universi DMX, dimmer/node, tratte; utente diverso (LD). L'alimentazione la copre già il motore elettrico |
| **Video** | LED wall/schermi presenti | Basso-Medio | Alto | **3** | Catena segnale (SDI/HDMI/fibra), processori; utente AV |

### Sequenza consigliata
1. **Audio OUT/Monitor** + **Layer Manager** (completano e strutturano l'audio).
2. **Motore Elettrico** (trasforma le Zone Alimentazione in calcolo, come l'audio).
3. **Rete/Dati** + **Tech pack PDF** (profondità pro + deliverable unico).
4. Solo se il mercato lo chiede: **Luci/DMX**, poi **Video**.

---

## 6. Nota strategica

Il salto di categoria non è "più layer" ma **coerenza**: un unico modello dove ogni elemento porta i
suoi metadati (canali audio, watt, protocollo, peso) e ogni "layer" è una **vista/motore** su quegli
stessi dati, con un **Layer Manager** che li governa e un **Tech pack** che li stampa. Prima di
aggiungere luci/video, conviene chiudere il cerchio audio (OUT/monitor + rete) e portare l'elettrico
allo stesso livello del cablaggio audio.
