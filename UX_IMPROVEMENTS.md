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

## Da fare nel prossimo ciclo

Scenari non ancora percorsi: **3** (dimensioni del palco), **5** (rotazione e duplicazione),
**7** (proprietà, nomi, numerazioni), **8** (elementi sovrapposti), **13** (aprire un progetto
condiviso), **12** (export vero — bloccato dall'ambiente, vedi limiti).

Proposta aperta per Simone: nel catalogo, cercando «cantante» i risultati si chiamano «Donna» e
«Uomo». Mostrare la famiglia accanto alla variante («Voce · Donna») farebbe comparire la parola
cercata senza cambiare i nomi. Non fatto da solo: ribalta una scelta motivata del 27/07.
