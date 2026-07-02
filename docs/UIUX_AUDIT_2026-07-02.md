# StagePlot — Audit UI/UX e standardizzazione — 02/07/2026

> Direttiva: rendere StagePlot **ovvio** — salvare, aprire, creare, esportare, condividere,
> accedere devono trovarsi dove 30 anni di software hanno insegnato a cercarli.
> Metodo: analisi codice (`index.template.html` @ `4a40d71`, `src/styles.css`), verifica runtime
> su stageplot.it (desktop 1440px), linee guida `STAGEPLOT_DESIGN_SYSTEM.md` v1.0.
> Mobile mappato dal codice (breakpoint 880px) + esito del test reale con utente non tecnica.
> Nessuna modifica al codice in questa fase.

---

## 0. Verdetto in una riga

Il motore c'è tutto (autosave locale, cloud, condivisione, export, versioni); manca la
**grammatica standard**: le funzioni esistono ma non si chiamano, né si trovano, dove
l'utente le cerca. Il problema è di **naming e collocazione**, non di funzionalità.

---

## 1. Diagnosi UI/UX attuale

### 1.1 Cosa funziona [CERTO]

| Cosa | Dettaglio |
|---|---|
| Autosave locale | localStorage a ogni modifica (`save()`/`saveSoon()`), ripristino all'avvio: chiudere il browser non perde nulla |
| Conferme distruttive | "Nuovo" → `confirmDialog` con focus di default su Annulla (DS §15 rispettato) |
| Undo/redo | 120 passi, ⌘Z/⇧⌘Z/⌘C/⌘V/⌘X; import annullabile |
| Empty state | 3 passi, differenziato desktop/mobile |
| Dialog Esporta (interno) | gerarchia giusta: PDF primary, area di stampa ripiegata, altri formati sotto |
| Modale Cloud (interna) | "I tuoi progetti": Salva online primary, lista con Apri / condividi / elimina |
| Design system | token, densità, accent unico rispettati nel chrome |

### 1.2 Cosa è confuso [CERTO]

1. **"Salva / Esporta"** = un bottone, due concetti opposti (conservare ≠ produrre output).
   Apre un dialog intitolato **"Esporta"** dove il salvataggio del progetto è l'**ultima voce**,
   sotto "ALTRI FORMATI", chiamata *"Salva progetto (per modificarlo dopo)"*.
2. **Il verbo "Salva" ha 4 significati** in 4 punti: footer (autosave locale), bottone header
   (hub export), voce dialog (download .json), modale Cloud ("Salva online"). Nessuno è ⌘S.
3. **"Cloud"** = etichetta tecnologica, non azione. Contiene 5 funzioni (login, salva online,
   elenco progetti, condivisione, link consulenza) che un musicista non associa alla parola.
4. **Naming divergente per piattaforma**: desktop "Apri progetto" / mobile "Importa";
   desktop "Salva progetto (per modificarlo dopo)" / mobile "Salva (locale)".

### 1.3 Cosa è nascosto [CERTO]

| Funzione | Dov'è oggi | Profondità |
|---|---|---|
| **Condividi** | nessun bottone; solo icona-link per riga dentro Cloud | 2 livelli, etichetta sbagliata |
| **Nuovo (desktop)** | **non esiste** (`#bNew` è `hidden`, proxy solo mobile) | ∞ |
| **Salva (mobile)** | ⋯ → "Altro…" → "Salva (locale)", 6ª voce su 10 | 3 tocchi — è il punto fallito nel test utente |
| **Stato salvato** | testo statico nel footer, 11.5px, `--text-3` (che il DS §4.2 vieta per info essenziali); non cambia mai, non distingue locale/cloud | invisibile |
| **Versioni** | `#versPanel` completo (salva con nome + lista) ma **irraggiungibile**: il bottone `frameVers` che lo apriva non esiste più nel markup → feature morta | ∞ |
| **Login / identità** | dentro Cloud; in header solo un puntino verde [DEDOTTO: indicatore sessione] | 2 livelli |

### 1.4 Cosa non segue standard riconoscibili [CERTO]

- **Nessun menu File** (Word, Docs, Canva, Figma, Photoshop, PowerPoint: tutti ce l'hanno).
- **Nessun ⌘S** (⌘Z/⌘C/⌘V esistono; il più universale di tutti no).
- **Nessun nome-progetto**: esiste solo "Titolo" (evento). L'identità del documento
  (Docs: "Documento senza titolo" cliccabile in alto a sinistra) non esiste →
  "Salva online — *Senza titolo*".
- **Il primary visivo è "Consulenza"** (unico bottone accent pieno): un CTA commerciale al
  posto dell'azione di lavoro. Contraddice DS §12 ("**Salva = unico Primary teal, sempre a
  destra**; Condividi/Esporta = secondary") e §9 ("un solo Primary per schermata").
- **Mobile a 2 livelli** (⋯ → "Altro…") per azioni primarie; lo standard mobile è 3-5 azioni
  primarie in una barra sempre visibile.

---

## 2. Flussi critici (as-is)

| Flusso | Desktop | Mobile | Attrito |
|---|---|---|---|
| Salvare file | Salva/Esporta → dialog "Esporta" → 3ª voce | ⋯ → Altro… → "Salva (locale)" | verbo giusto, posto sbagliato; 2-3 livelli |
| Salvare cloud | Cloud → (login) → "Salva online" | ⋯ → Cloud → … | etichetta "Cloud"; niente ⌘S; nessun autosave cloud (solo in consulenza) |
| Aprire | "Apri progetto" (picker .json) o Cloud → Apri | ⋯ → Altro… → "Importa" | naming divergente |
| Nuovo | **assente** | ⋯ → Altro… → Nuovo | introvabile (la conferma però è corretta) |
| Login | Cloud → "Accedi con Google" | idem | dentro etichetta tecnologica; nessun avatar |
| Condividere | Cloud → icona link per riga | idem | invisibile; il flusso FINALE di uno stage plot (mandarlo a service/locale) è il più nascosto |
| Esportare | Salva/Esporta → "Scarica PDF in scala" | ⋯ → "Esporta PDF" | il flusso migliore; sporcato dal doppio nome del bottone |
| Consulenza | bottone accent in header | link nel menu | visibilissima (giusto per il business) ma occupa il ruolo di primary |
| Stato dopo azione | toast cloud effimero; footer statico | idem | nessuno stato persistente/dinamico |

---

## 3. Standard da introdurre

| # | Convenzione | Da chi | Perché | Dove | Impatto utente |
|---|---|---|---|---|---|
| 1 | **Menu File** | Word, Docs, Canva, Figma | la convenzione più forte dell'informatica: un posto solo per Nuovo/Apri/Salva/Scarica/Esporta/Condividi/Versioni | header, dopo il brand | azzera la domanda "dove si fa X?" |
| 2 | **Nome progetto + stato salvataggio in header** | Docs ("Documento senza titolo" + "Salvato su Drive") | il progetto ha identità; lo stato dà **certezza** (DS §1.3) | header sinistra, promuovendo il campo Titolo | fine dell'ansia "ho salvato?" |
| 3 | **Salva = unico primary a destra + ⌘S** | tutti; già prescritto da DS §12 | l'azione che conserva il lavoro è la più importante | header destra | riflesso ⌘S funziona; il primary torna a essere lavoro |
| 4 | **Condividi visibile in alto a destra** | Figma, Docs, Canva (Share) | la condivisione è l'output sociale del documento | header destra, accanto a Salva | il flusso finale diventa un click |
| 5 | **Identità = avatar / "Accedi"** | ogni web app | login è identità, non "Cloud" | estrema destra header | chiarisce login e stato account |
| 6 | **Bottom bar mobile** | iOS/Android, Canva mobile | azioni primarie sempre visibili, zona pollice | barra fissa in basso | fix diretto del test fallito |
| 7 | **Naming unico cross-device** | tutti | stessi verbi ovunque: Salva, Apri, Nuovo, Esporta, Condividi | ovunque | un solo vocabolario da imparare |

---

## 4. Proposte desktop

### Opzione A — Menu File + barra standard ⭐ consigliata

Header: `[STAGE PLOT] [File ▾] | [Nome progetto ✎] [✓ Salvato] ——— [❔] [🌓|↶|↷|⤢|griglia▾] | [Consulenza·tint] [Condividi] [Esporta] [SALVA·primary] [👤]`

Menu File: Nuovo · Apri file… · I miei progetti · — · Salva online (⌘S) · Rinomina ·
Crea una copia · Scarica file progetto (.json) · — · Esporta PDF… · Esporta PNG · — ·
Versioni… · Condividi…

- **Vantaggi**: standard riconoscibile al 100%; l'header respira (la coda lunga va nel menu);
  le funzioni orfane (Versioni, Copia, Rinomina) trovano casa; scala per il futuro.
- **Svantaggi**: 1 click in più per le azioni rare; il DS non ha ancora la spec "menu dropdown"
  (da aggiungere); più lavoro dell'opzione B.
- **Impatto tecnico**: medio. Le funzioni esistono **tutte** già: è rewiring + un componente
  menu + stato salvataggio dinamico. Nessun cambio di dati o backend.

### Opzione B — Split minimale (senza menu File)

Tenere la struttura attuale, ma: dividere "Salva / Esporta" in **Salva** (primary) ed
**Esporta**; aggiungere **Condividi** e **Nuovo**; rinominare Cloud → **I miei progetti**;
chip stato salvataggio accanto al titolo; naming unificato col mobile.

- **Vantaggi**: sforzo minimo, zero cambi di struttura, risolve i buchi peggiori.
- **Svantaggi**: header a ~12 voci → serve comunque l'overflow `···` (DS §12); Versioni resta
  orfana; non scala.
- **Impatto tecnico**: basso.

### Opzione C — App shell completa (Figma/Canva)

Menu File + home "I miei progetti" all'apertura (se loggati) + avatar menu.

- **Vantaggi**: massima professionalità percepita; project browser di prima classe (il DS §22
  lo aveva già mockuppato).
- **Svantaggi**: contraddice "il foglio è il prodotto" (DS §1.1) e il local-first: una home
  prima del foglio è attrito per l'utente occasionale (il 90%); costo alto.
- **Impatto tecnico**: alto.

**Raccomandazione: A**, con B come prima tappa — B è un **sottoinsieme esatto** di A
(in A i bottoni Salva/Esporta/Condividi restano in barra per DS §12; il menu File si
*aggiunge* come contenitore della coda lunga). Niente lavoro buttato.

---

## 5. Proposte mobile

### Opzione A — Bottom action bar ⭐ consigliata

Barra fissa in basso: `[＋ Aggiungi] [Salva] [Esporta] [Condividi] [⋯]`.
Il menu ⋯ diventa **un solo livello** (niente "Altro…"): Nuovo · Apri · I miei progetti ·
Palco · Evento · Planimetria · Area stampa · Tema · Guida · Consulenza · Cosa manca.
In alto: titolo + chip stato salvataggio.

- **Vantaggi**: le 4 azioni primarie **sempre visibili** in zona pollice — fix diretto del
  test fallito; pattern nativo iOS/Android; il DS ha già la motion per gli sheet (§19).
- **Svantaggi**: ~56px di canvas in meno (mitigazione: auto-hide durante il drag sul palco);
  lavoro CSS/JS medio.
- **Impatto tecnico**: medio (la barra sostituisce FAB+parte del menu; handler esistenti).

### Opzione B — Potenziare l'esistente

Chip stato in `mTop`; Salva/Condividi/Nuovo/Apri promossi al **primo** livello del menu ⋯
(eliminando "Altro…" per le primarie); naming unificato.

- **Vantaggi**: sforzo minimo; nessun cambio di layout.
- **Svantaggi**: le primarie restano dietro un menu — migliora, non risolve.
- **Impatto tecnico**: basso.

### Opzione C — FAB unico + sheet

Non proposta seriamente: nasconde ancora di più. Citata per completezza.

**Raccomandazione: A.** B accettabile solo come tappa-ponte se si vuole spezzare il lavoro.

---

## 6. Mockup descrittivi

### Desktop (Opzione A)

- **In alto a sinistra**: brand → **File ▾** → nome progetto modificabile (ex campo Titolo,
  placeholder "Senza titolo") → chip stato: "✓ Salvato sul dispositivo" / "✓ Salvato online
  · 14:32" / "Salvataggio…" / "⚠ Non salvato online — Accedi".
- **Centro-destra**: gruppo vista (tema, undo, redo, adatta, griglia) — invariato.
- **In alto a destra**: Consulenza (pill **accent-tint**, visibile ma non primary) →
  Condividi (secondary) → Esporta (secondary) → **Salva (primary teal)** → avatar/Accedi.
- **Comportamento Salva**: loggato → salva online + stato aggiornato; non loggato → mini-dialog
  a 2 scelte ("Accedi e salva online" / "Scarica file"). ⌘S = stesso flusso. Il footer statico
  sparisce (sostituito dal chip).
- **Luogo evento**: entra nel pannello Evento (già esistente), esce dall'header.

### Mobile (Opzione A)

- **In alto**: titolo + chip stato compatto (✓/…), ❔ e ⋯ restano.
- **In basso**: barra 5 slot, icona+label 10px: Aggiungi (accent) · Salva · Esporta ·
  Condividi · Menu. Target ≥44px (DS §18). Auto-hide durante drag.
- **Sheet ⋯**: lista piatta a 1 livello, stessi verbi del desktop, Consulenza in evidenza
  in fondo (pattern attuale conservato).
- **Gesto salva**: tap Salva → loggato: online; non loggato: sheet 2 scelte come desktop.

---

## 7. Decisioni richieste

1. **Direzione desktop**: A (File menu, consigliata) / B (split minimale) / C (app shell).
2. **Direzione mobile**: A (bottom bar, consigliata) / B (potenziare menu attuale).
3. **Sequenza**: partire dai **quick wins** (B desktop+mobile: naming, split Salva/Esporta,
   Condividi e Nuovo visibili, chip stato, ⌘S) e arrivare ad A in una seconda tappa —
   oppure andare **diretti ad A**. Consiglio: quick wins prima (nessun lavoro buttato,
   valore immediato sul test utente).

---

## 8. Segnalazione separata — stato delle linee guida UI

`STAGEPLOT_DESIGN_SYSTEM.md` v1.0 è solido e va **rispettato**, ma:

1. **Header obsoleto** [CERTO]: dichiara "proposta per approvazione" e §23 "Non è ancora
   implementato" — il sistema è invece implementato e live dal 30/06. Da aggiornare.
2. **§12 violato dall'header attuale** [CERTO]: "Salva = unico Primary teal a destra;
   Condividi/Esporta secondary; overflow ···" — oggi non c'è nessun Salva primary, nessun
   Condividi, nessun overflow; l'unico bottone pieno è Consulenza.
3. **Sezioni mancanti** [CERTO]: menu dropdown/menu File; indicatore stato documento;
   IA mobile (barra azioni — il DS ha la motion §19 ma non il pattern); avatar/account.
   Da aggiungere (proposta: §24 "File, stato documento e account") quando si implementa.
4. **Violazioni token nel codice** [CERTO]: modale Cloud con hex grezzi inline
   (`#dadce0`, `#3c4043`, `#17212f`) e stili inline su `#bConsulenza` — contro la regola
   d'oro §0 ("nessun esadecimale grezzo fuori da `:root`"). Da bonificare nel refactor.

---

## 9. Decisioni prese (02/07/2026, sui mockup)

Mockup: `.superpowers/brainstorm/2026-07-02-uiux-standardization/content/` (`opzioni.html`, `varianti-a.html`).

1. **Desktop A′**: menu File + nome progetto + chip stato; **senza** Salva/Esporta in header
   (vivono nel File menu); "Cosa manca?" nel menu "?" (fab rimosso); Consulenza in tint.
2. **Mobile A′**: bottom bar 4 tasti (Aggiungi · Esporta · Condividi · Menu), menu a un livello,
   chip stato + "?" in alto.
3. **V2 — autosave online** quando loggato (modello Docs/Canva/Figma); ⌘S = Salva versione.
4. **P1 — Condividi = unico primary**.
5. Sequenza: **diretta** (la tappa quick-wins è decaduta: aggiungeva bottoni poi rimossi).

Spec di design: `docs/superpowers/specs/2026-07-02-uiux-standardization-design.md`.
Piano: `docs/superpowers/plans/2026-07-02-uiux-standardization.md`.

**STATO: IMPLEMENTATO (02/07/2026)** — Task 1-6 completati e verificati a runtime (desktop
light/dark, mobile ≤880px, gate consulenza). Scoperta in corso d'opera: il boot NON ripristinava
da localStorage ("nuovo progetto a ogni apertura", il footer "salvato automaticamente" era
fuorviante) → attivato il **ripristino all'avvio** (gate su `#p=` e `?view=`); il foglio pulito
ora è File → Nuovo. Correzione all'audit §1.1: "ripristino all'avvio" era dato per esistente,
non lo era.

## Criterio di successo (dalla direttiva)

Un utente inesperto apre StagePlot e capisce **senza istruzioni**: dove si salva (bottone
Salva + stato visibile), dove si apre (File/Apri), come si ricomincia (File/Nuovo), come si
manda al service (Condividi/Esporta), chi è (avatar). Verifica: ripetere il test mobile con
lo stesso tipo di utente dopo la Fase 1.
