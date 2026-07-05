# Studio — Categorie a sinistra: renderle facili e immediate
## 05/07/2026

> Richiesta Simone: idee per facilitare l'uso delle categorie sulla sinistra (macro-categorie,
> sottocategorie, colore al click, suggerimenti). Devono essere immediate per chiunque.
> Mockup visivi: `icon-prototype/preview/categorie-ux-proposte.html`.

## 1. Com'è oggi

- **14 categorie** in lista piatta (accordion, una aperta per volta): Palco e strutture, Batteria e
  percussioni, Band e backline, Orchestra, Persone e voci, Microfoni e DI, Monitor da palco,
  Cablaggio e segnale, Regia e console, PA e diffusione, Elettrico, Luci, Video, Dispositivi.
- Alcune hanno sotto-gruppi. In cima una barra di ricerca. Header attivo = accent teal.

**Frizioni:** 14 voci tutte uguali (solo testo) → nessun aiuto visivo; un principiante non sa da dove
iniziare; niente scorciatoie per i setup comuni; nessun suggerimento contestuale.

## 2. Idee (attivabili anche in combinazione)

### A. Colore + icona per macro-area (immediatezza visiva)
Ogni categoria ha un **puntino/icona colorata** e appartiene a una **macro-area** con un colore:
- 🎵 **Strumenti & musicisti** (Batteria, Band, Orchestra, Persone) — caldo/ambra
- 🎙 **Audio** (Microfoni e DI, Monitor, Cablaggio e segnale, Regia, PA) — teal
- 💡 **Luci & Video** (Luci, Video) — viola
- 🔧 **Palco & tecnica** (Palco e strutture, Elettrico, Dispositivi) — grigio/blu
Al click, header e bordo elementi prendono l'accent della macro-area. Orientamento immediato.

### B. Raggruppamento a MACRO (meno voci a colpo d'occhio)
Invece di 14 voci piatte, **4 macro-sezioni** collassabili, ognuna con le sue categorie dentro.
La lista "respira": vedi 4 cose, apri quella giusta, poi la categoria. Ottimo per i non esperti.

### C. Sezione "Usati di recente" / "Frequenti" (velocità)
In cima, gli elementi che l'utente piazza più spesso (o gli ultimi usati). Un musicista che rifà
sempre lo stesso palco li ritrova subito.

### D. Suggerimenti contestuali (guida intelligente)
Dopo aver piazzato un oggetto, proporre i compagni tipici:
- batteria → "sgabello, drum fill, stagebox, overhead"
- chitarra → "ampli, pedaliera, DI"
- voce → "monitor, asta, wireless"
Piccola riga "Ti serve anche…?" con 2-3 chip cliccabili. Riduce i click e insegna.

### E. Start kit / template (partenza in 1 click)
Bottone "Parti da un modello": **Band rock**, **Quartetto d'archi**, **DJ set**, **Coro + orchestra**,
**Conferenza**. Popola un layout iniziale sensato. Il primo "foglio bianco" fa meno paura.

### F. Ricerca protagonista (già c'è, va valorizzata)
Barra di ricerca più evidente con esempi nel placeholder ("cerca: cassa, ampli, iPad…"), risultati
mentre digiti da tutte le categorie. Per chi sa cosa vuole, è la via più rapida.

### G. Onboarding "che evento?" (solo primissima volta)
Una domanda al primo accesso — *Band / Orchestra / DJ / Conferenza / Teatro* — che mette in cima le
categorie giuste e nasconde/riordina le altre. Non complica: è opt-in e sparisce.

### H. Sottotitolo di una riga per categoria (chiarezza linguistica)
Sotto ogni categoria un micro-testo in linguaggio comune ("Microfoni e DI — aste, mic, prese
strumenti"). Zero ambiguità su cosa c'è dentro.

### I. Memoria delle categorie aperte + preview elemento
Ricordare quali categorie l'utente tiene aperte; anteprima più grande al passaggio del mouse.

## 3. Raccomandazione (sequenza)

1. **A + H** (colore/icona per macro-area + sottotitoli) — massima immediatezza, basso costo, non cambia
   la struttura. È il punto di partenza.
2. **C + D** (recenti + suggerimenti contestuali) — velocizzano il lavoro ripetitivo e guidano.
3. **B** (macro-raggruppamento) — se, dopo A, le 14 voci sembrano ancora troppe. Da valutare a video.
4. **E + G** (template + onboarding evento) — per abbassare la barriera del foglio bianco ai nuovi.

Le proposte A/B sono nel mockup Chrome per la scelta visiva.
