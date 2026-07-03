# STAGEPLOT — Design System

> Linguaggio visivo e sistema di componenti di StagePlot.
> Documento **canonico**: precede l'implementazione. Niente codice di prodotto qui dentro,
> solo principi, token e specifiche.
>
> **Stato:** v2.0 "warm" su branch `ui-warm-v2` (implementata su tool+consulenza, in attesa merge) · 2026-07-03
> — v1.1 live fino al merge · v1.0 approvata e implementata il 30-06
> **v2.0 in sintesi (variante C approvata da Simone sul confronto A/B/C):** neutri cool-gray → **warm stone/avorio**;
> dark blu-notte → **verde carbone**; canvas-bg e griglia caldi; ombre warm; **accent brand INVARIATO** (#0e7490);
> componenti nuovi dal prototipo configuratore (v2.1, live sul tool): **Switch** globale (36×20, checkbox CSS-only),
> **righe opzione** (`#props .chk`: etichetta sx / controllo dx / separatore tratteggiato), **Chips** (`.chips` per scelte esclusive 2-4,
> pilotano select nascoste), **slider in riga** (`.sldrow`: nome — range — valore), **Stepper** `.stpr` (−/+ con valore),
> azioni pannello full-width con UN primario pieno (Dividi & co.), **selezione canvas a outline staccata** (rect +5 cm, rx 8, stroke pieno).
> **Direzione approvata:** *Codifica + elevazione* (stesso DNA dell'app, più rigore) ·
> personalità *Strumento tecnico, accent teal* · light di default, dark di prima classe.
> **v1.1 (UI/UX standardization A′):** menu File, chip stato documento, autosave online,
> dock mobile, menu "?" — vedi §24 e `docs/UIUX_AUDIT_2026-07-02.md`.

---

## 0. Come leggere questo documento

Il sistema è organizzato in **tre cerchi concentrici**:

1. **Token** — le variabili-base (colore, tipo, spazio, raggio, ombra, motion). Sono la fonte di verità.
2. **Componenti** — bottoni, input, pannelli… definiti *solo* in termini di token.
3. **Regioni** — sidebar, toolbar, canvas, inspector: come i componenti si compongono.

Regola d'oro implementativa: **nessun valore esadecimale grezzo fuori dal blocco `:root`.**
Se serve un colore nuovo, prima nasce come token.

> **Cosa NON tocca questo sistema:** i disegni degli **oggetti sul palco** (strumenti, persone,
> sedie, leggii, orchestra, casse) restano i disegni reali dettagliati esistenti, con i loro
> gradienti realistici. Sono *contenuto del prodotto*, non interfaccia. Il sistema governa il
> **chrome** (UI) e gli **overlay del canvas** (selezione, guide, griglia, quote).

---

## 1. Filosofia

### 1.1 Principi di design

1. **Il foglio è il prodotto.** Tutto il chrome esiste per servire il disegno del palco.
   Lo spazio guadagnato va al canvas; l'interfaccia si fa da parte.
2. **Il colore è informazione, non decorazione.** Sul foglio ogni colore è codice tecnico
   (monitor, power, tecnico). Nel chrome esiste **un solo accent** (teal): se è teal, c'è azione o selezione.
3. **Gerarchia per peso e spazio, non per colore.** Come Linear e Stripe: contrasto tipografico
   e spaziatura ordinano la pagina; il colore resta una risorsa scarsa.
4. **Restare piatti.** I bordi separano. L'ombra appare *solo* per dire "questo galleggia sopra".
5. **Velocità prima dell'estetica.** Gli utenti lavorano sotto pressione. Ogni animazione,
   ogni clic in più va giustificato dal lavoro, non dall'apparenza.
6. **Densità professionale.** Base UI a 13px, controlli compatti: è uno strumento, non una landing.
7. **Mai giocoso.** Nessun arrotondamento eccessivo, nessun rimbalzo, nessuna illustrazione carina.

### 1.2 Personalità del prodotto

StagePlot è uno **strumento tecnico di precisione**. La metafora di riferimento è la **console** /
la **DAW** (Pro Tools, Ableton, Logic) — il mondo in cui vive il pubblico primario — più il
rigore silenzioso di Linear e la pulizia di Stripe Dashboard.

| Riferimento | Cosa estraiamo |
|---|---|
| **Linear** | gerarchia per peso, accent unico, densità, motion invisibile |
| **Stripe Dashboard** | tabelle pulite, form chiari, neutri freddi, fiducia |
| **Figma** | canvas protagonista, maniglie/guide, property inspector contestuale |
| **Notion** | calma tipografica, spaziatura generosa nei contenuti (guida, learn) |
| **GitHub** | settings con nav laterale, stati vuoti onesti, liste dense |
| **Raycast** | comando rapido, ricerca come finder primario, zero attrito |

Non si **clona** nessuna di queste interfacce: se ne estraggono i *principi*.

### 1.3 Aspettative dell'utente

- **Curva di apprendimento quasi nulla:** un fonico deve essere produttivo in 2 minuti.
- **Affidabilità percepita:** niente deve sembrare beta; il salvataggio deve dare certezza.
- **Stampa-fedeltà:** ciò che vede a schermo è ciò che esce in PDF/A3.
- **Funziona offline:** local-first, single-file; nessuna dipendenza di rete obbligatoria.

---

## 2. Token — fondazioni

Blocco di riferimento (sintassi CSS custom properties; i valori sono la fonte di verità).

### 2.1 Colore — neutri (warm stone/avorio — v2.0)

> **v2.0 (03/07/2026, decisione Simone):** neutri scaldati (avorio/sabbia) al posto dei cool gray.
> Motivo: fanno risaltare i materiali delle icone realistiche (legni, ottoni, rame, pelli) e danno
> al prodotto un carattere più "carta tecnica". L'accent brand NON cambia (variante C del confronto).

```
--n-50:#f5f4f0;  /* app background          */
--n-100:#edebe4; /* superfici sollevate     */
--n-200:#ddd9cd; /* bordo standard          */
--n-300:#c8c3b4; /* bordo forte / input     */
--n-400:#a29c8e; /* placeholder / icona muta*/
--n-500:#746e60; /* testo secondario        */
--n-600:#59544a; /* testo terziario         */
--n-700:#423e36; /* testo enfasi            */
--n-800:#292620; /* INK — testo primario    */
--n-900:#1a1815; /* near-black              */
```

### 2.2 Colore — accent brand (teal, uno solo)

```
--accent-tint:#e6f4f6;   /* bg selezione / hover soft */
--accent-soft:#bfe3ea;   /* bordo selezionato         */
--accent:#0e7490;        /* BRAND — azione/selezione  */
--accent-strong:#0a5a72; /* hover / active            */
--accent-bright:#22c0d6; /* accent su superfici dark  */
```

### 2.3 Colore — semantica canvas (invariata, continuità)

```
--canvas-monitor:#2563eb; /* monitor / spia  */
--canvas-power:#dc2626;   /* alimentazione   */
--canvas-tech:#b45309;    /* tecnico / quote-H */
--canvas-ink:#1f2937;     /* tratto base     */
```

### 2.4 Colore — feedback

```
--success:#15803d; --success-bg:#f0fdf4; --success-border:#bbf7d0;
--warning:#b45309; --warning-bg:#fffbeb; --warning-border:#fde68a;
--danger:#b91c1c;  --danger-solid:#dc2626; --danger-bg:#fee2e2;
```

### 2.5 Colore — superfici & overlay canvas (semantici)

```
--bg:var(--n-50);            --surface:#ffffff;
--surface-raised:var(--n-100); --border:var(--n-200); --border-strong:var(--n-300);
--text:var(--n-800); --text-2:var(--n-500); --text-3:var(--n-400); --text-on-accent:#fff;

--canvas-bg:#edebe4;  --sheet:#ffffff;   /* v2.0: cornice canvas calda, foglio sempre bianco */
--select:var(--accent);            --select-fill:rgba(14,116,144,.05);
--focus-ring:rgba(14,116,144,.32);
--guide:var(--accent);             --guide-center:#f59e0b;  --axis:#c8c3b4;
--grid-line:#e9e6db;  --grid-major:#dbd6c8;   /* v2.0: griglia sabbia */
```

Ombre (`--elev-*`): base warm `rgba(38,33,24,…)` (v2.0; prima `rgba(16,24,40,…)`).

### 2.6 Tema dark (override su `body.dark`) — v2.0 "verde carbone"

```
--bg:#12181b; --surface:#1b2327; --surface-raised:#20292e;
--border:#2c3a3f; --border-strong:#314046;
--text:#e5e7eb; --text-2:#96a5a1; --text-3:#6b7280;
--canvas-bg:#0e1214; --sheet:#ffffff; /* opz. "foglio attenuato": #f3f4f6 */
--accent:var(--accent-bright);  --select:var(--accent-bright);
--focus-ring:rgba(34,192,214,.32);
```
v2.0: la dark passa dal blu-notte al **verde carbone** (coerente coi neutri warm della light).
Nel dark: **il chrome diventa scuro, il foglio resta chiaro.** L'accent UI passa al teal-bright
per contrasto; la semantica del canvas (monitor/power/tech) non cambia.

### 2.7 Tipografia

```
--font-ui:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
--font-mono:ui-monospace,SFMono-Regular,Menlo,monospace;

--t-micro:10px;  --t-caption:11px; --t-label:12px; --t-body:13px; /* base */
--t-title:15px;  --t-heading:18px; --t-display:24px;

--lh-tight:1.25; --lh-snug:1.4; --lh-normal:1.5; --lh-relaxed:1.6;
```
**System stack, mai un web font:** local-first/single-file/offline → niente FOUT, niente peso,
niente dipendenza di rete in un file condiviso a mano. **Numeri sempre `tabular-nums`** nei campi
quote, coordinate, canali → cifre allineate da console.

### 2.8 Spaziatura — ritmo a 4px

```
--s-05:2px; --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px; --s-6:24px; --s-8:32px;
```
4px per **layout** (gap, margini, ritmo verticale). Padding interno controlli da set fisso
(vedi componenti): bottone 8×14, input 7×10, icon-button 32–34².

### 2.9 Raggi

```
--r-sm:6px;  /* chip, controlli piccoli   */
--r-md:8px;  /* bottoni, input, card       */  /* base */
--r-lg:12px; /* pannelli, modali, tabelle  */
--r-xl:16px; /* sheet, overlay, learn      */
--r-pill:999px;
```

### 2.10 Elevazione

```
--elev-0:none;                                                    /* chrome, card piatte */
--elev-1:0 1px 2px rgba(16,24,40,.08),0 1px 1px rgba(16,24,40,.04); /* hover/raise        */
--elev-2:0 4px 12px rgba(16,24,40,.12);                           /* menu, popover, toast */
--elev-3:0 12px 32px rgba(16,24,40,.18);                          /* modale              */
--elev-4:0 24px 64px rgba(16,24,40,.26);                          /* overlay full        */
```

### 2.11 Motion

```
--dur-fast:120ms;  /* hover, selezione, toggle */
--dur-base:160ms;  /* pannelli, accordion      */
--dur-modal:200ms; /* modale: fade + scale .98→1 */
--dur-sheet:260ms; /* bottom-sheet mobile       */
--ease:cubic-bezier(.2,0,.2,1);
```
Niente rimbalzi. Sempre `@media (prefers-reduced-motion: reduce){ * { transition:none } }`.

### 2.12 Z-index (scala dichiarata)

```
--z-canvas:1; --z-chrome:10; --z-menu:40; --z-overlaybar:50; --z-modal:50;
--z-sheet:60; --z-learn:70; --z-toast:80;
```

---

## 3. Tipografia (uso)

| Ruolo | Token | Peso | Interlinea | Uso |
|---|---|---|---|---|
| Display | `--t-display` 24 | 800 | 1.15 | hero onboarding, titolo learn |
| Heading | `--t-heading` 18 | 700 | 1.25 | titolo modale/dialogo |
| Title | `--t-title` 15 | 700 | 1.3 | brand, titolo card/sezione |
| Body | `--t-body` 13 | 400 | 1.4 | **base** UI, testo controlli |
| Label | `--t-label` 12 | 500 | 1.3 | etichette campo, testo 2° |
| Caption | `--t-caption` 11 | 800 CAPS | 1.3 | label di sezione (uppercase, +0.7px tracking) |
| Micro | `--t-micro` 10 | 700 | 1 | badge, count |

Letter-spacing: caps/uppercase `+0.6–0.8px`; display `-0.02em`. Reading (learn/guida) usa `--lh-relaxed`.

---

## 4. Colore (uso & accessibilità)

### 4.1 Significato

| Colore | Token | Dove | Significato |
|---|---|---|---|
| Teal | `--accent` | chrome | azione primaria, selezione UI, focus, stato attivo, guide |
| Blu | `--canvas-monitor` | canvas | monitor / spia da palco |
| Rosso | `--canvas-power` / `--danger` | canvas / chrome | alimentazione / azione distruttiva |
| Ambra | `--canvas-tech` / `--warning` | canvas / chrome | tecnico-quote / avviso (vedi §13 regola di disambiguazione) |
| Verde | `--success` | chrome | esito positivo (salvato, esportato) |

### 4.2 Contrasto (target WCAG AA)

| Coppia | Ratio | Esito |
|---|---|---|
| `--text` su `--surface` | ~12:1 | AAA |
| `--text-2` su `--surface` | ~4.6:1 | AA |
| bianco su `--accent` | ~4.8:1 | AA (testo normale) |
| `--accent` su `--accent-tint` | ~4.4:1 | AA (testo grande/UI) |
| bianco su `--danger` (#b91c1c) | ~5.9:1 | AA |
| bianco su `--danger-solid` (#dc2626) | ~4.0:1 | **solo ≥14px bold** o uso largo |

`--text-3` (#9ca3af) è **solo** placeholder/decor: mai per testo informativo essenziale.
Per questo il **bottone distruttivo solido usa `--danger`** (#b91c1c), non `--danger-solid`:
quest'ultimo (#dc2626) resta per il *power* sul canvas, dove non porta testo.

### 4.3 Regola anti-daltonismo

Il colore **non porta mai il segnale da solo**. Selezione = colore **+** tratteggio **+** maniglie.
Monitor = colore **+** sagoma a cuneo. Stato = colore **+** icona. Sempre un secondo canale.

---

## 5–6. Spaziatura, bordi, raggi

- **Ritmo verticale** dei pannelli: sezioni a `--s-4` (16) con separatore `1px var(--border)`.
- **Padding pannello laterale:** `--s-3` (12–13) orizzontale.
- **Stroke** UI: `1px` standard, `1.5px` per bordi-input forti, `2–3px` per il bordo del foglio-palco.
- Raggi per famiglia (vedi §2.9): controlli `--r-md`, contenitori `--r-lg`, overlay `--r-xl`.

---

## 7. Ombre / elevazione

Principio **flat-first**: di default tutto è `--elev-0` (separato da bordi).
L'ombra è un *segnale di profondità*, riservato a: menu/popover (`--elev-2`), modali (`--elev-3`),
overlay a tutto schermo e sheet (`--elev-4`). Hover di card cliccabili può salire a `--elev-1`.

---

## 8. Icone

- **Stile:** linea, stroke `1.8px`, terminazioni e giunzioni **tonde** — lo stesso linguaggio del
  tratto SVG sul palco (continuità). Riempite *solo* se semantiche.
- **Dimensioni:** `16` inline · `20` default UI · `24` touch.
- **Sorgente:** geometria **Lucide** (MIT), inlinata in uno sprite `<defs>` single-file
  (no richieste di rete). Le icone-funzione del chrome; **non** gli oggetti-palco (restano i reali).
- **Regola:** lo stroke dell'icona segue il peso del testo accanto; mai mischiare line e fill a caso.

---

## 9. Bottoni

Tutti: `--r-md`, `font:700 13px`, transizione `background/box-shadow/transform var(--dur-fast) var(--ease)`,
altezza base ~34px (`padding:8px 14px`).

| Ruolo | Riposo | Hover | Active | Disabled | Focus |
|---|---|---|---|---|---|
| **Primary** | bg `--accent`, testo bianco | bg `--accent-strong` | `#08475b` + `translateY(1px)` | bg `--n-100`, testo `--n-400` | `0 0 0 3px var(--focus-ring)` |
| **Secondary** | bg `--n-100`, bordo `--border`, testo `--text` | bg `#e6e9ec` | — | come sopra | ring teal |
| **Ghost** | trasparente, testo `--n-700` | bg `--n-100` | — | testo `--n-400` | ring teal |
| **Danger soft** | bg `--danger-bg`, testo `--danger` | bg `#fdcdcd` | — | — | ring teal |
| **Danger solid** | bg `--danger` (#b91c1c), testo bianco | bg `#991b1b` | — | — | ring rosso |

**Dimensioni:** `lg` (CTA modale/mobile) `padding:11px 20px / 14px`; `base` 34px; `sm` (denso) `padding:6px 11px / 12px`.

**Icon button:** `34×34`, `--r-md`, ghost di default; hover `bg --n-100`; **active = `bg --accent-tint`, icona `--accent`**.

**Toolbar button:** icona + label opzionale, ghost; active come icon button (teal-tint).

**Regole:**
- **Un solo Primary per schermata** (l'azione che conta). In conflitto (es. Salva + Esporta),
  *Salva* è primario, *Esporta* è secondary.
- Focus-ring **sempre visibile** da tastiera (no `outline:none` senza sostituto).
- ⚡ *Elevazione vs oggi:* i bottoni passano da **pillola (999px) → `--r-md` (8)** per allinearsi
  agli input e dare un'aria da strumento di precisione.

---

## 10. Input & controlli

| Controllo | Spec |
|---|---|
| **Text / number** | bordo `1px --border-strong`, `--r-md`, `padding:7px 10px`, `font:13px`. Focus: `border:--accent` + `box-shadow:0 0 0 3px var(--focus-ring)`, `outline:none`. Number: `tabular-nums`. |
| **Placeholder** | `--text-3` |
| **Errore** | `border:--danger` + ring `rgba(220,38,38,.12)` + messaggio 11px `--danger` |
| **Disabled** | `bg --n-100`, testo `--text-3`, `cursor:not-allowed` |
| **Select** | come text + chevron `--text-3` a destra, `appearance:none` |
| **Search** | come text + icona lente a sinistra (padding-left 32) |
| **Checkbox** | `18²`, `--r-sm`, bordo `--border-strong`; checked = `bg --accent` + spunta bianca |
| **Radio** | `18²` cerchio; checked = bordo `--accent` + punto `--accent` |
| **Toggle** | track `38×22` pill; on = `--accent`, knob bianco con `--elev-1` |
| **Segmented** | track `--n-100` bordo `--border` `--r-md`, padding 2; selezionato = `bg surface` + `--accent` + `--elev-1` |
| **Slider (rotazione)** | track 4px `--border`, fill `--accent`, thumb `15²` bianco bordo `--accent`; **tacca centrale** `--n-400` a 0° |
| **Counter** | `−` / valore (`tabular-nums`) / `+`, bottoni `27×25` secondary |

---

## 11. Sidebar (catalogo)

- **Larghezza:** 250px (default; collassabile — vedi §18/critica). Scroll verticale.
- **Ricerca** in cima, filtra in tempo reale: è il **finder primario su scala**.
- **Categorie** (livello 1): `caption` uppercase, `padding:8px 11px`, `--r-md`, bg `--n-100`/bordo,
  caret + count badge. **Aperta = `bg --accent` piena, testo bianco**, count su `--accent-strong`.
- **Sottocategorie** (livello 2, max): variante teal-tint; aperta = `--accent`.
- **Item:** mini-anteprima (= **disegno reale dell'oggetto in piccolo**) + nome + descrittore `--text-3`.
  `--r-md`, bordo `--border`. Hover = `bg --accent-tint`, bordo `--accent-soft`. `cursor:grab` (draggable).
- **Profondità massima 2 livelli.** Oltre, si usa la ricerca.

---

## 12. Toolbar (header) — aggiornato v1.1

- **Altezza:** 52px. `overflow-x` controllato (mai wrap su 2 righe).
- **Gruppi** separati da divider `1px var(--border)` (h ~20px):
  identità (brand + **menu File**) → **nome progetto + chip stato** → vista
  (aiuto "?" · tema · undo/redo · adatta · griglia) → azioni → account (avatar).
- **Modello salvataggio = autosave** (v1.1): niente bottone Salva. Lo stato vive nel
  **chip di stato documento** (§24.2); salvataggi espliciti (versione, download) nel menu File.
- **Azioni:** **Condividi = unico Primary teal**, sempre a destra (contiene anche Scarica PDF);
  Consulenza = variante `tint` (visibile, non primary); Esporta e file-ops nel **menu File** (§24.1).
- **Overflow:** la coda lunga vive già nel menu File; niente `···` separato.
- **Icon-button** 31–34px (vedi §9).

---

## 13. Canvas

- **Sfondo area:** `--canvas-bg` (#fafafa light / #0b0e13 dark). **Il foglio-palco è sempre `--sheet` (bianco)** e galleggia.
- **Griglia 2 livelli:** fine `--grid-line` ogni 22px, maestra `--grid-major` ogni 5. Presente ma silenziosa.
- **Asse palco:** `--axis` tratteggiato (riferimento fisso permanente).
- **Guide di allineamento (transitorie, durante drag):** `--guide` (teal) tratteggiate → appaiono e spariscono.
- **Snap al centro:** `--guide-center` (**ambra**) — colore diverso per il momento "sei centrato".
- **Selezione:** selbox `--select` tratteggiato + `--select-fill` + **8 maniglie** quadrate bianche bordo teal.
- **Rotazione:** knob bianco bordo teal su asta teal, con micro-icona ↻.
- **Hover** non selezionato: box `--n-400` tratteggiato tenue (anteprima).
- **Quote:** testo scuro con **alone bianco** (`paint-order:stroke`) → leggibili su qualsiasi sfondo;
  in dark diventano bianche con alone scuro. Esiste una **scala-quote dedicata alla stampa** (più grande).
- **Drop-target:** trascinando dal catalogo, il foglio si illumina `--accent` (bordo + tint).
- **Zoom:** widget flottante in basso a destra (`− %  +`) + "Adatta"; mai invadente. Eco del valore nel footer.

> **Regola di disambiguazione ambra** (dalla critica): l'ambra-**warning** vive *solo* nel chrome e ha
> *sempre* l'icona triangolo; l'ambra-**tecnica** vive *solo* sul foglio e non ha mai icona di stato.

---

## 14. Property Inspector

- **Larghezza:** 360px (default; comprimibile/collassabile sotto 1200px).
- **Header:** `caption` uppercase `--text-2` + **pallino del tipo** (es. blu = monitor) + nome elemento.
- **Sezioni** a ritmo `--s-4`, separate da `1px var(--border)`: posizione (X/Y `tabular-nums`),
  rotazione (slider), etichetta, opzioni specifiche dell'oggetto, canale (counter).
- **Azione distruttiva** isolata in fondo (Danger soft), staccata dalle proprietà.
- **Stato vuoto:** icona muta `--n-300` + "Nessun elemento selezionato" / "Seleziona un oggetto sul palco
  per modificarne le proprietà". Onesto, non promozionale (lezione da GitHub empty states).

---

## 15. Dialoghi (modali)

- **Backdrop:** `rgba(17,24,39,.45)`; card `--surface`, `--r-xl`, `--elev-4`, larghezza 340–380.
- **Struttura:** header (titolo `heading` + chiusura `✕` pill) · corpo · footer.
- **Footer:** **ghost a sinistra, Primary teal a destra**. Verbo esplicito ("Esporta PDF", non "OK").
- **Transizione:** `fade + scale .98→1` in `--dur-modal`.
- **Settings window:** pattern a **nav laterale** (152px) + pannello; controlli allineati a destra,
  etichetta + sotto-descrizione a sinistra (stile Linear/GitHub).
- **Conferma distruttiva:** icona-alone rossa, testo che dichiara *cosa si perde*, Primary = **Danger solid**.
  Mai come azione di default; il focus iniziale è su Annulla.

---

## 16. Notifiche

- **Toast:** in basso, `--surface`, bordo `--border`, `--r-lg`, `--elev-2`; icona di stato (success/info/error),
  titolo `body 700` + dettaglio `--text-2`, autodismiss ~4s, chiusura manuale, azione opzionale.
- **Banner inline:** quando l'avviso riguarda il contesto corrente (non interrompe): warning =
  `--warning-bg`/`--warning-border`/`--warning` con icona triangolo.
- **Gerarchia di interruzione:** banner (passivo) < toast (effimero) < modale (bloccante).
  Si sale di livello solo se l'utente *deve* decidere.

---

## 17. Tabelle (lista canali / patch, browser progetti)

- **Header:** `caption` uppercase `--text-3`, `bg #fafbfc`, ordinabile (freccia `--accent`).
- **Righe:** `padding:9px 12px`, separatore `1px --n-100`, `tabular-nums`. Hover `--n-50`.
- **Selezione riga:** `bg --accent-tint`, testo `--accent` 600.
- **Filtri:** chip sopra la tabella (on = `--accent-tint`/`--accent`) + ricerca a destra.
- **Pallini-tipo** per categoria (ink/blu/ambra) come secondo canale informativo.

---

## 18. Accessibilità

- **Contrasto:** target **WCAG AA** (vedi §4.2). `--text-3` mai per info essenziali.
- **Focus:** ring `0 0 0 3px var(--focus-ring)` **sempre** visibile da tastiera, su ogni elemento interattivo.
- **Navigazione tastiera:** Tab ordine logico; Esc chiude modali/sheet; frecce per nudge oggetti;
  Canc per eliminare; scorciatoie zoom. Trap del focus nei modali.
- **Touch / coarse pointer:** usare `@media (pointer:coarse)`, non solo la larghezza. Target ≥ **44px**;
  nessuna azione nascosta dietro il solo hover.
- **Daltonismo:** mai colore da solo (vedi §4.3). Verificare su deuteranopia (teal vs blu).
- **Reduced motion:** disabilitare transizioni con `prefers-reduced-motion`.
- **Screen reader:** `.sr-only` per etichette/crawler (già presente); icone-funzione con `aria-label`.

---

## 19. Motion

| Evento | Durata | Comportamento |
|---|---|---|
| hover / selezione / toggle | `--dur-fast` 120ms | colore/lift minimo |
| apertura pannello / accordion | `--dur-base` 160ms | altezza/opacità |
| modale | `--dur-modal` 200ms | fade + scale .98→1 |
| bottom-sheet mobile | `--dur-sheet` 260ms | slide dal basso |

Easing unico `--ease`. **Niente rimbalzi, niente ritardi percepiti.** Regola: se rallenta il lavoro, si taglia.

---

## 20. Mappa di migrazione (hex grezzo → token)

Il CSS attuale ha esadecimali sparsi. La transizione si fa **per famiglia, in un passaggio**,
con `grep` dei raw hex come check. Estratto principale:

| Oggi (grezzo) | Token | Note |
|---|---|---|
| `#1f2937` (ink) | `--n-800` / `--text` | testo primario |
| `#6b7280`,`#9ca3af`,`#e5e7eb`,`#d1d5db`,`#f3f4f6`,`#f9fafb` | `--n-*` | rampa neutra |
| `#0e7490` (catalogo/brand) | `--accent` | accent UI unico |
| `#2563eb` **come selezione UI** | → `--accent` | **liberato**: il blu resta solo monitor |
| `#2563eb` **come monitor** | `--canvas-monitor` | invariato (semantica) |
| `#3b82f6` (snap-guide) | `--guide` (teal) | guide allineamento → teal |
| `#f59e0b` (snap centro) | `--guide-center` | invariato (ambra) |
| `#b45309` (tecnico/quote) | `--canvas-tech` / `--warning` | disambiguazione §13 |
| `#dc2626` / `#b91c1c` / `#fee2e2` | `--canvas-power` / `--danger` / `--danger-bg` | |
| `#15803d`/`#166534`/`#bbf7d0` | `--success*` | |
| pill `999px` sui `.btn` | `--r-md` | bottoni → raggio 8 |
| ombre assortite | `--elev-1…4` | scala unica |

**Ordine di implementazione consigliato:** (1) blocco `:root` token → (2) neutri & tipografia →
(3) accent unico + "liberare il blu" → (4) bottoni/input → (5) regioni → (6) canvas/overlay → (7) dark.

---

## 21. Critica & rischi (sintesi)

| # | Nodo | Sev. | Decisione |
|---|---|---|---|
| 01 | Ambra doppio uso (tech/warning) | Media | separazione per contesto + icona (§13) |
| 02 | Teal vs blu confondibili (daltonismo) | Alta | colore mai da solo: forma + maniglie (§4.3) |
| 03 | "Liberare il blu" tocca molti punti | Alta | mappa migrazione + grep dei raw hex (§20) |
| 04 | Valore dipende dai token | Alta | token *prima* di tutto; zero hex grezzi |
| 05 | Icone freehand incoerenti | Media | base geometrica Lucide inline (§8) |
| 06 | Inspector+sidebar fissi soffocano il canvas | Alta | pannelli collassabili sotto 1200px |
| 07 | Catalogo a 2 livelli insufficiente | Media | ricerca = finder primario su scala |
| 08 | Hover-only fallisce al touch (iPad FOH) | Media | `pointer:coarse`, target ≥44px |
| 09 | Foglio bianco abbaglia in sala buia | Bassa | opzione "foglio attenuato" nel dark |
| 10 | Screen-first ma il deliverable è il PDF | Media | scala-quote dedicata alla stampa |

---

## 22. Mockup di riferimento

Mockup ad alta fedeltà prodotti in fase di design (HTML autoconsistenti, in
`.superpowers/brainstorm/<sessione>/content/`):

| File | Contenuto |
|---|---|
| `colore.html` | sistema colore completo (light + dark) |
| `fondamenta.html` | tipografia, spaziatura, raggi, elevazione, motion |
| `controlli.html` | bottoni & input, tutti gli stati, icone |
| `chrome.html` | sidebar · toolbar · inspector, in contesto + stati |
| `canvas.html` | griglia, guide, selezione, maniglie, snap, zoom (light + dark) |
| `overlay.html` | dialoghi, conferme distruttive, toast, banner, tabelle |
| `mockup-workspace.html` | **beauty shot** workspace completo (caso band) |
| `mockup-projects.html` | project browser (cloud-save) |
| `mockup-settings.html` | settings window + export dialog |
| `mockup-mobile.html` | mobile + limiti onesti |
| `critique.html` | critica visiva |

---

## 23. Cosa NON fa questo sistema (limiti dichiarati)

- Non ridisegna gli **oggetti del palco** (strumenti, persone, sedie, leggii, orchestra): restano i reali.
- Non introduce un **web font**: resta lo system stack.
- Non aggiunge framework/bundler: resta local-first single-file.

---

## 24. File, stato documento e account (v1.1 — UI/UX standardization A′)

Decisioni: `docs/UIUX_AUDIT_2026-07-02.md` §9 · spec `docs/superpowers/specs/2026-07-02-uiux-standardization-design.md`.

### 24.1 Menu dropdown (File, "?", futuri)

- Contenitore `.hdrmenu`: `position:fixed` sotto il trigger, min-width 236–256px, `--surface`,
  bordo `--border`, `--r-md`, **`--elev-2`**, padding 5px, `z-index:60`.
- Item `.mi`: 13px/500, padding 7×10, `--r-sm`, icona Lucide 16px in `--text-2`;
  hover `--accent-tint` (dark `#222b38`); scorciatoia a destra in `--font-mono` 11px `--text-3`.
- Separatori `hr` 1px `--border`. Chiusura: click fuori, Esc, click su voce.
- **Menu File** (ordine canonico): Nuovo · Apri file… · I miei progetti · — · Rinomina ·
  Crea una copia · Scarica file progetto · — · Esporta PDF… · Esporta PNG · — ·
  Salva versione (⌘S) · Versioni… · Condividi…
- **Menu "?"**: Cos'è uno stage plot — guida · Cosa manca? Scrivici. (Il feedback NON ha
  più un fab flottante.)

### 24.2 Chip stato documento

- Pill 11px/600 accanto al nome progetto (`.doc-chip`); varianti:
  neutro "Salvato sul dispositivo" (✓) · neutro "Salvataggio…" · verde "Salvato online · HH:MM"
  (icona cloud, `--success*`; dark `#0f2d1a/#166534/#4ade80`) · ambra **cliccabile**
  "Solo su questo dispositivo — Accedi" e "Non salvato online — riprovo" (icona triangolo,
  regola ambra §13; dark `rgba(245,158,11,…)/#fbbf24`).
- È l'**unica** fonte di verità visiva sullo stato: sostituisce il testo statico del footer.
- Autosave: locale a ogni modifica; online con debounce ~10s se loggati; ⌘S = salva versione.
- All'avvio il tool **ripristina** l'ultimo lavoro dal dispositivo (il chip deve dire il vero);
  il foglio pulito è File → Nuovo.

### 24.3 Account

- `.avatar-btn`: pill 30px; sloggato = "Accedi" (secondary); loggato = cerchio `--accent`
  con iniziali email. Click → modale "I tuoi progetti" (account, lista, Esci).

### 24.4 Dock mobile (≤880px)

- `#mDock` fisso in basso, 52px + safe-area, `--surface` + bordo top; 4 voci:
  **Aggiungi** (accent) · Esporta · Condividi · Menu; icona 20px + label 9.5px/600; target ≥44px.
- **Auto-hide durante il drag** sul palco: `body:has(#svg.dragging) #mDock` → translateY(120%).
- Il menu ⋯ è un bottom-sheet a **un solo livello** (gruppi Progetto / Palco / App);
  l'hub proprietà appare solo con selezione o pannelli (46vh sopra il dock).
- FAB rimossi (catalogo = "Aggiungi"; feedback = menu "?").

### 24.5 Naming canonico (cross-device, verbatim)

Nuovo · Apri file… · I miei progetti · Rinomina · Crea una copia · Scarica file progetto ·
Esporta PDF… · Esporta PNG · Salva versione · Versioni… · Condividi… — identici su desktop
e mobile. Vietati sinonimi per piattaforma ("Importa", "Salva (locale)", "Cloud").

### 24.6 Eccezione documentata

Il bottone "Accedi con Google" nella modale account usa i grigi brand Google
(`#dadce0`, `#3c4043`): eccezione consapevole alla regola d'oro §0, per riconoscibilità
del pulsante OAuth secondo le linee guida Google.
