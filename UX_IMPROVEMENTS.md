# Registro delle frizioni — StagePlot usato da chi non lo conosce

Aperto il **01/09/2026**. Ogni riga nasce da una prova vera nel browser, non da una lettura del
codice: si apre l'app, si prova a fare una cosa, e si annota dove ci si ferma.

**Regola che tiene onesto il metodo:** chi prova sa già dove sono i bottoni, perché ha scritto il
codice. Per non barare: durante lo scenario non si apre il sorgente per trovare una funzione, si usa
solo quello che si vede a schermo, e uno scenario che non si completa guardando la sola interfaccia
si segna **fallito** — anche sapendo come si farebbe.

**Non vale come risposta** «l'utente dovrebbe capire». Se un'azione importante non è evidente, il
problema è dell'interfaccia.

---

## Limiti dell'ambiente di prova (misurati, non supposti)

Servono a leggere gli esiti per quello che valgono:

- **I click per coordinate sbagliano bersaglio.** Lo screenshot è scalato, e non linearmente:
  mirando a «Band» si apre «Orchestra da camera». I gesti si fanno via DOM (`.click()`), che
  dispatcha gli stessi eventi — ma **il drag&drop realistico non è riproducibile**.
- **La scheda resta in secondo piano.** Il canvas non produce il blob (`toBlob` nullo), quindi
  **l'export PNG e PDF vero non è verificabile**; e le transizioni CSS non avanzano, quindi le
  altezze si misurano dalla classe, mai dal `getBoundingClientRect`.
- **Il viewport non si ridimensiona** (finestra in fullscreen macOS) e l'app esce dagli iframe per
  anti-clickjacking. Il telefono si prova forzando attive le media query mobile **e spente quelle
  desktop** — senza il secondo passaggio si misura un layout ibrido che non esiste da nessuna parte.
  Copre layout e bersagli; **non** copre tastiera che sale, gesti a due dita, proporzioni reali.

---

## Scenari già coperti prima di questo registro

Le frizioni sono state trovate e chiuse nelle PR indicate.

| Scenario | Esito | Dove |
|---|---|---|
| Capire cosa fa StagePlot | ok — hero e tre passi | — |
| Creare da un modello | ok | — |
| Il riepilogo iniziale copriva il palco (12%) | **risolto** → 2% | #75 |
| Zoom e spazio: colonne fisse da 530 px su laptop | **risolto** | #75 |
| Gratis vs a pagamento: l'editor prometteva il rider «su consulenza» | **risolto** | #75 |
| Liste avanzate sempre in vista | **risolto** (Produzione avanzata) | #78 |
| Nessuno vedeva il controllo del progetto | **risolto** (riga di stato) | #79 |
| Telefono: 49 bersagli sotto i 44 px | **risolto** → 13 (campi a 40) | #80 |
| «Manca una stage box» detto a chi non ha sbagliato | **risolto** | #81 |
| Il PDF usciva «solo palco» | **risolto** («Aggiungi le N suggerite») | #81 |

---

## Ciclo 1 — 01/09

### 1.1 · Palco vuoto senza indicazioni

- **Scenario:** 15 (stati vuoti) + 2 (creare da zero). Memoria pulita, si chiude il benvenuto con
  «Progetta il tuo palco» invece di scegliere un modello.
- **Osservato:** un rettangolo con «FONDO PALCO», «PUBBLICO», le quote. **Nessuna indicazione a
  schermo**: misurato, zero elementi di suggerimento. Il catalogo è a sinistra ma niente dice di
  usarlo, e la spiegazione del benvenuto è appena sparita.
- **Gravità:** media-alta. **Frequenza:** alta — è la strada di chi non vuole un modello.
  **Impatto:** l'utente resta fermo davanti a un rettangolo.
- **Causa:** `stageLayerMarkup()` disegna solo palco e scritte di orientamento; nessuno stato vuoto.
- **Modifica:** `stageEmptyHintMarkup()`, una riga al centro del palco. Sparisce al primo elemento,
  **non entra mai nel PDF né nella vista condivisa** (lì un palco vuoto è un palco vuoto, non un
  invito rivolto a chi guarda), e dice il gesto giusto per il dispositivo: su desktop il catalogo a
  sinistra, su telefono il bottone «Aggiungi» del dock.
- **File:** `index.template.html`, `src/styles.css`, `test/engines.test.mjs`.
- **Verifica:** nel browser — compare, sparisce col primo elemento, **torna se si svuota il palco**;
  su telefono simulato dice «Tocca «Aggiungi» qui sotto». 994 test verdi. **5 mutazioni su 5 viste.**
- **Esito:** risolto.

### 1.2 · Cercare «cantante» — falso allarme, poi una frizione minore

- **Scenario:** 4 (inserire musicisti). Si cerca la parola che userebbe chiunque: «cantante».
- **Primo esito, SBAGLIATO:** «la ricerca non trova niente». Era il selettore della prova a essere
  errato: la ricerca **funziona**. Annotato perché è il tipo di errore che fa «correggere» cose sane.
- **Osservato davvero:** «cantante» trova due risultati, ma si chiamano **«Donna»** e **«Uomo»**
  (sottotitolo «voce»). La parola cercata non compare in nessun risultato — mentre «batteria» trova
  «Batteria». Chi cerca si chiede se ha trovato la cosa giusta.
- **Gravità:** media. **Frequenza:** alta.
- **Causa:** il catalogo espone le due varianti di genere della figura «voce». È una scelta
  ragionata e documentata nel codice (audit del 27/07: «Prima diceva Corista — che in italiano è il
  cantante di un coro, non il solista»).
- **Deciso:** **non toccato.** Ribaltare una scelta di prodotto motivata vale una domanda a Simone,
  non una modifica presa da solo.
- **Prossimo:** proporre di mostrare la famiglia accanto alla variante («Voce · Donna»), che non
  cambia i nomi ma fa comparire la parola cercata.

### 1.3 · Salvare e ritrovare — nessuna frizione

- **Scenario:** 11. Modello band, nome «I Ramarri — Rivellino», un elemento aggiunto, poi si ricarica
  la pagina come farebbe chi riapre domani.
- **Osservato:** il lavoro si ritrova intatto (titolo e 12 elementi), il benvenuto non ricompare, e
  la barra dice **«Salvato su questo dispositivo · Accedi per il cloud»**.
- **Esito:** superato, nessuna modifica.
- **Falso allarme annotato:** una prima misura diceva che l'indicazione «Salvato» non c'era. Era il
  filtro della prova a escluderla (cercava solo elementi senza figli). Terzo errore di misura della
  giornata: **è più facile inventare un difetto che trovarne uno.**

### 1.4 · Cancellare per sbaglio: nessuna via d'uscita visibile

- **Scenario:** 6 (correggere un'azione sbagliata). Si seleziona un elemento sul palco e si preme
  «Elimina».
- **Osservato:** l'elemento sparisce e **a schermo non succede nient'altro**. Nessuna conferma di
  cosa sia successo. Per rimediare bisogna indovinare che l'icona da **19×32 px** in alto — senza
  testo, con solo il tooltip «Annulla (⌘Z)» — sia l'annulla.
- **Gravità:** alta — categoria «rischio di perdere il lavoro», la seconda priorità del brief.
  **Frequenza:** alta. **Impatto:** chi non trova l'annulla ricrea l'elemento a mano, o perde il lavoro.
- **Causa:** `deleteSel()` non dava alcun riscontro; il sistema di messaggi (`toast`) esisteva ma
  sapeva mostrare **solo testo**, senza azioni.
- **Modifica:** il messaggio impara a portare **un'azione** (terzo parametro facoltativo: le decine
  di chiamate esistenti non cambiano) e l'eliminazione lo usa: **«Elemento eliminato · Annulla»**,
  che chiama l'annulla vero. Resta 7 secondi invece di 3,2, perché c'è da leggere e da raggiungere.
- **File:** `index.template.html`, `src/styles.css`, `test/engines.test.mjs`.
- **Verifica:** nel browser, ciclo intero — eliminato (11→10), avviso comparso, «Annulla» premuto,
  elemento tornato (10→11), avviso chiuso. Poi **la stessa prova su telefono**: funziona.
  996 test verdi. **7 mutazioni su 7 viste.**
- **Esito:** risolto.

### 1.5 · Su telefono l'avviso copriva il dock

- **Scenario:** 14 (funzioni principali da smartphone), emerso mentre si verificava 1.4.
- **Osservato:** l'avviso appena aggiunto finiva **sopra il dock**, coprendo per **27 px** i quattro
  bottoni (Aggiungi · Esporta · Condividi · Menu) per tutti i sette secondi in cui resta a schermo.
  Il bottone «Annulla» restava raggiungibile — verificato con `elementFromPoint` — ma il dock no.
- **Gravità:** media. **Causa:** il `bottom` del messaggio era scritto **inline nell'HTML**, dove
  nessuna media query poteva toccarlo.
- **Modifica:** la posizione passa nel foglio di stile, e su telefono sale sopra la barra con la
  stessa variabile `--dock-h` che usa già il riepilogo del modello.
- **Verifica:** rimisurato sul telefono simulato: **23 px di aria** fra avviso e dock, nessuna
  sovrapposizione. 2 mutazioni su 2 viste.
- **Esito:** risolto. **Nota:** una modifica introdotta in questo stesso ciclo ha creato una
  frizione nuova, trovata solo perché si ricontrolla anche il telefono dopo ogni cambio.

---

## Ciclo 2 — 01/09

### 2.1 · «Il mio palco è 8×5, come lo cambio?»

- **Scenario:** 3 (dimensioni del palco), con la domanda più ovvia che si possa fare.
- **Osservato:** a schermo ci sono **due** strade plausibili — la riga «Palco 12 × 8 m» nella colonna
  e «Forma del palco» nel catalogo. Si prova la prima, perché **dice già la misura**. Si apre… il
  riepilogo di aste, leggii e sgabelli. Delle misure, niente.
  Su palco vuoto è peggio: cliccando non succede **assolutamente nulla** (la sezione «Stato» è
  nascosta finché non c'è almeno un elemento — ragionevole in sé, ma l'utente non riceve nessun
  riscontro da una riga che si dichiara `layer-clickable`).
- **Gravità:** media-alta. **Frequenza:** alta — è fra le prime cose che uno vuole cambiare.
  **Impatto:** le misure si trovano solo scoprendo «Forma del palco» **nel catalogo**, cioè dove si
  prendono gli elementi, non dove si configura il palco.
- **Modifica:** **il numero stesso diventa il bersaglio.** Chi vede «16 × 6,5 m» e vuole cambiarlo ci
  clicca sopra, e si apre «Forma del palco» — lo stesso pannello del catalogo, non una copia dei
  campi. Il resto della riga continua a fare quello che faceva: non si toglie niente.
- **File:** `index.template.html`, `src/styles.css`, `test/engines.test.mjs`.
- **Verifica:** nel browser su desktop e su telefono (bersaglio da 44 px, apre il pannello).
  **6 mutazioni su 6 viste.**
- **Esito:** risolto.

### 2.2 · Mezzo metro di palco sparito

- **Scenario:** emerso subito dopo, aprendo il pannello dal punto 2.1.
- **Osservato:** la riga diceva **«16 × 7 m»**, il pannello **«16 m × 6,5 m»** — due numeri diversi
  per la stessa cosa, **visibili insieme** appena si clicca sulla misura.
- **Gravità:** media-alta. Su uno strumento che si chiama «in scala», mezzo metro di palco non è un
  dettaglio: è lo spazio di un musicista.
- **Causa:** `layerSummary` usava `Math.round((s.d||0)/100)` — 650 cm → 6,5 → **7**.
- **Modifica:** la riga usa `fmtM()`, **la stessa funzione del pannello**. Un decimale quando serve,
  nessuno quando non serve: 6,5 resta 6,5 e 6 non diventa «6,0».
- **Verifica:** provato con 8×5,5 e 10×6 dalla strada vera (`applyStageWidth/Depth`): entrambi
  corretti, e la riga coincide col pannello. 998 test verdi.
- **Esito:** risolto. **È la stessa famiglia dei numeri della demo in homepage:** un dato scritto in
  due posti che nessuno tiene insieme.

---

## Da fare nel prossimo ciclo

Scenari non ancora percorsi: **5** (rotazione e duplicazione),
**7** (proprietà, nomi, numerazioni), **8** (elementi sovrapposti), **13** (aprire un progetto
condiviso), **12** (export vero — bloccato dall'ambiente, vedi limiti).

Proposta aperta per Simone: nel catalogo, cercando «cantante» i risultati si chiamano «Donna» e
«Uomo». Mostrare la famiglia accanto alla variante («Voce · Donna») farebbe comparire la parola
cercata senza cambiare i nomi. Non fatto da solo: ribalta una scelta motivata del 27/07.
