# Spec — UI salvataggio cloud-only (data strategy §2)

**Data:** 2026-07-03 · **Stato:** in attesa di approvazione PO
**Fonte:** `STAGE PLOT/docs/idee/DATA_STRATEGY_DATASET_AI_2026-07.md` (sez. 2, approvata):
uso ed export liberi senza login; il salvataggio è solo cloud con Google; il localStorage resta
come recovery buffer silenzioso e la UI non lo chiama mai "salvataggio".

## Stato attuale — già conforme (nessun intervento)

| Elemento | Stato |
|---|---|
| Chip anonimo "Solo su questo dispositivo — Accedi" (warn) | ✔ conforme: non parla di salvataggio, spinge al login |
| Avatar "Accedi" con tooltip "Accedi per salvare online" | ✔ |
| Loggato: autosave online + chip "Salvato online · HH:MM" | ✔ (V2, sessione UI/UX A′) |
| Cloud modal anonimo: "Accedi per salvare i tuoi stage plot online… il tool funziona anche senza" | ✔ |
| Boot-restore da localStorage | ✔ è il recovery buffer: resta, silenzioso |
| Export .stageplot/PDF/PNG | ✔ canale "porto via il file", invariato |

## Interventi (3, tutti micro)

### 1. Nudge post-export (solo anonimi, una volta per sessione)
Il momento a più alto valore: chi esporta ha un progetto reale (= segnale principe del quality
gate) e non ha account. Dopo il **primo export riuscito** della sessione (PDF, PNG o
.stageplot), se non loggato:

> toast: "Export fatto. Il progetto però vive solo su questo dispositivo — accedi per averlo
> salvato online."

- Flag in sessione (variabile, non localStorage): mai più di un nudge per sessione.
- Nessun nudge se loggato, in viewer `?view=` o in consulenza (`__consultMode`).

### 2. "Salva versione" (⌘S) da anonimo: feedback riallineato
Il comportamento resta (le versioni locali sono un paracadute, anche per i loggati — portarle
in cloud è fuori scope). Cambia solo il feedback quando NON si è loggati:

> toast: "Versione salvata su questo dispositivo. Accedi per avere il progetto salvato online."

Loggato: nessun cambiamento (flushCloudAutosave già parte).

### 3. Copy handler errori globale (R1)
Oggi: "Il tuo lavoro resta salvato su questo dispositivo…" — chiama "salvato" il localStorage,
in contrasto con la strategia. Diventa:

> "Si è verificato un problema imprevisto. Il tuo lavoro non è andato perso; se qualcosa non
> risponde, ricarica la pagina."

## Non-obiettivi (YAGNI)
- Nessun blocco di funzioni agli anonimi (uso ed export restano liberi al 100%).
- Boot-restore invariato; nessuna rimozione del localStorage.
- Versioni ⌘S restano locali anche per i loggati (eventuale "versioni cloud" = feature futura).
- Nessun redesign: solo i 3 punti sopra.

## Verifica (e2e)
1. Anonimo: export PDF → toast nudge (solo la prima volta nella sessione); export PNG dopo → nessun toast.
2. Anonimo: ⌘S → nuovo copy; versione presente nel pannello Versioni.
3. Loggato: export → nessun nudge; ⌘S → comportamento attuale.
4. Viewer `?view=` e consulenza: nessun nudge.
5. Chip e boot-restore invariati.
