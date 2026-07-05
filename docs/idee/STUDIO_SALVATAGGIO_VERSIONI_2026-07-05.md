# Studio — Salvataggio, versioni e recall (come funziona oggi + idee)
## 05/07/2026

> Richiesta Simone: capire come funzionano salva-versione, recall e salvataggio su browser, e avere
> idee per renderli più fruibili.

## 1. Come funziona OGGI (3 livelli, distinti)

Ci sono **tre meccanismi diversi** che oggi convivono e non sono chiarissimi tra loro:

### A. Copia di lavoro sul browser (localStorage) — sempre attiva
- Ogni modifica → `save()` → scrive TUTTO il documento in `localStorage["stageplot_v1"]` (+ id cloud,
  + immagine planimetria in una chiave a parte). È il **"Salvato sul dispositivo"**.
- Sopravvive al reload **solo su quello stesso browser/dispositivo**. Se cambi PC o svuoti la cache: perso.
- Non richiede login.

### B. Autosave online (cloud, Supabase) — modello Google Docs
- Se sei **loggato**, ogni salvataggio locale arma un upsert al cloud con debounce ~10s
  (`scheduleCloudAutosave`). Chip in alto: **"Salvato online · HH:MM"**.
- Se **non** sei loggato: chip ambra **"Solo su questo dispositivo — Accedi"**.
- È **una copia per progetto** (l'ultima). Sincronizzata tra dispositivi. La lista è **"I miei progetti"**.
- Salva SEMPRE lo stato più recente: non tiene lo storico.

### C. Versioni manuali (Salva versione / Versioni…) — **solo locali**
- "Salva versione" (⌘S) fa uno **snapshot** completo con nome+data in `localStorage["stageplot_versions"]`
  (max 30). "Versioni…" apre la lista con Ripristina / Elimina.
- **Sono LOCALI**: NON vanno nel cloud, NON sono su altri dispositivi, si perdono se svuoti la cache,
  non sono condivisibili. Ripristina **sovrascrive** lo stato corrente (senza salvarlo prima).

### D. Undo/Redo (cronologia)
- `undoStack`/`redoStack` in memoria: si perdono al reload.

## 2. I problemi (perché non è fruibile)

1. **Tre concetti sovrapposti** ("sul dispositivo" vs "online" vs "versioni") che l'utente fatica a mettere
   in relazione: *"sono salvato? quale versione è quella buona? dov'è?"*.
2. **Le versioni sono locali** → il valore percepito è basso: spariscono cambiando device o pulendo la
   cache, non si condividono. È il difetto più grave.
3. **⌘S = "Salva versione"** è controintuitivo: su ogni altro software ⌘S = "salva" (che qui è già
   automatico). L'utente preme ⌘S aspettandosi un salvataggio, e crea invece uno snapshot con nome.
4. **Ripristina è distruttivo**: sovrascrive il lavoro corrente senza rete di sicurezza.
5. **Nessuna cronologia automatica**: solo snapshot manuali; se dimentichi di salvare-versione, non c'è
   modo di tornare a "com'era un'ora fa".
6. **"I miei progetti" (cloud) vs "Versioni" (locali)**: due liste diverse, facili da confondere.

## 3. Idee (dalla più semplice alla più strutturale)

### Idea 1 — Un solo indicatore chiaro di stato (rapido, alto impatto)
Sostituire i vari stati con **un unico chip** sempre comprensibile:
- loggato: **"Tutte le modifiche salvate"** (✓ cloud, con ora); in salvataggio: "Salvataggio…".
- non loggato: **"Salvato su questo dispositivo · Accedi per sincronizzare"** (invito chiaro al valore).
Un click sul chip apre "Cronologia versioni". Così l'utente non deve capire i tre livelli: sa solo
"è salvato" e "posso tornare indietro".

### Idea 2 — ⌘S non crea versioni (rapido)
⌘S non deve fare "Salva versione" (già si salva da solo). Opzioni:
- ⌘S → mostra un micro-toast "Già salvato ✓" (rassicura chi ha il riflesso di premerlo).
- Spostare "Salva versione" su un pulsante esplicito **"★ Segna versione"** (bookmark), non su ⌘S.

### Idea 3 — Versioni nel CLOUD (strutturale, il vero salto)
Portare gli snapshot **nel cloud, per progetto** (nuova tabella `versions` legata al progetto):
- disponibili su **tutti i dispositivi**, sopravvivono alla cache, **condivisibili**.
- Ripristina **non distrugge**: prima di ripristinare, salva in automatico una versione "prima del
  ripristino" (rete di sicurezza).
Richiede login (coerente con la scelta "solo online").

### Idea 4 — Cronologia AUTOMATICA a timeline (modello Google Docs)
Oltre alle versioni manuali (bookmark), tenere **auto-snapshot** periodici/su cambi significativi
(es. ogni 10 min o ogni N modifiche), con una **timeline** scorribile ("oggi 15:32 · 12 elementi").
L'utente non deve ricordarsi di salvare: può sempre tornare a "com'era prima". Le versioni con nome
sono i "punti stella" evidenziati sulla timeline.

### Idea 5 — Auto-nome delle versioni (rapido)
Se l'utente non dà un nome, generarlo con contesto: **"5 lug 15:32 · 12 elementi · 2 zone"** invece di
"Versione". Riconoscibile a colpo d'occhio.

### Idea 6 — Fondere le due liste (chiarezza)
Un solo pannello **"Cronologia"** per il progetto corrente (versioni cloud) + **"I miei progetti"** per
cambiare progetto. Nomi coerenti: *Progetti* (documenti diversi) vs *Versioni* (storia di questo).

### Idea 7 — Undo persistente (nice-to-have)
Salvare in localStorage anche la coda undo, così un reload non azzera "annulla".

## 4. Raccomandazione (sequenza)

1. **Subito, a basso costo**: Idea 1 (chip unico) + Idea 2 (⌘S non crea versioni) + Idea 5 (auto-nome).
   Tolgono la confusione con poche righe.
2. **Salto di valore**: Idea 3 (versioni nel cloud) + Idea 6 (liste chiare). È ciò che rende le versioni
   davvero utili (multi-device, sicure, condivisibili) — coerente con "salvataggio solo online".
3. **Fiore all'occhiello**: Idea 4 (timeline automatica) quando il resto è solido.

Nota tecnica: A/B (localStorage + autosave cloud) restano la base; le versioni migrano da localStorage
(C) al cloud. Il chip `setDocState` è già il punto giusto per l'indicatore unico.
