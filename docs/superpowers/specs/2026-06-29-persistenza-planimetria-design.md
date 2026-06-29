# Persistenza della planimetria + ripristino al login — Design

**Data:** 2026-06-29
**Ambito:** StagePlot (`index.template.html`, build single-file)
**Tipo:** `fix`
**Copre:** segnalazioni utente **#2** (il login fa sparire il lavoro/planimetria) e **#5** (la planimetria non si salva/riapre col progetto).

> Aggiornato dopo la diagnosi nel browser: la causa di #2 è più profonda del previsto (vedi §1.2). Le segnalazioni #1, #3, #4 restano per un intervento successivo.

---

## 1. Problema

### 1.1 Planimetria non persistita (#5)

`stateReplacer` (riga ~2243) rimuove di proposito `_dataUrl/_imgW/_imgH`, e `stateToJSON()` (che usa quel replacer) è riusata per **tutti** i salvataggi: `localStorage` (`save`/`saveSoon`/`applyHistory`), cloud (`saveProject`), link `#p=`. Lo strip è corretto **solo** per i 120 snapshot di undo. Inoltre `venueLoadFile` (riga ~5585) salva l'immagine a **piena risoluzione** (può pesare MB).

### 1.2 Il boot non ripristina la sessione — per scelta (#2)

Verificato nel browser: salvando un titolo e ricaricando, **lo state non viene ripristinato** da `localStorage`. La funzione `load()` esiste ma **non è mai chiamata** al boot.

Non è un bug accidentale: il commit `3c3f609` ("rimuovi channel list e **ripristino sessione** dalla versione free") ha tolto il bottone "↩ Riprendi ultima sessione" e la rilettura di `localStorage`. Il commento nel codice è esplicito: *"Nuovo progetto a OGNI apertura: non si ripristina automaticamente la sessione"*.

**Conseguenza:** il login Google fa un redirect → reload → la versione free riparte da progetto nuovo → "sparisce tutto". La planimetria è la parte più evidente, ma il problema è l'intero lavoro non salvato.

---

## 2. Vincoli

1. Cronologia undo/redo: leggera (no base64 × 120 snapshot).
2. `localStorage` ~5 MB; `saveSoon()` gira ad alta frequenza → l'immagine non deve essere riscritta a ogni carattere.
3. Cloud (Supabase `data` jsonb): immagini inline ok se piccole.
4. **Non rompere** la scelta di prodotto "nuovo progetto a ogni apertura" per l'avvio normale.
5. Niente framework/bundler. Modifica al solo `index.template.html` (+ build).

---

## 3. Decisioni prese (con l'utente)

| Tema | Decisione |
|------|-----------|
| Qualità planimetria | Downscale a ~2000px lato lungo + ricompressione JPEG ~0.85 al caricamento. |
| Ripristino del lavoro al login (#2) | **Solo al ritorno dal login.** L'avvio normale resta "progetto nuovo"; quando si torna dall'OAuth il lavoro pre-login viene ripristinato. (Scartate: bottone "Riprendi", ripristino sempre.) |
| Scope | Solo #2 + #5. #1/#3/#4 dopo. |

---

## 4. Design

Tutto in `index.template.html`.

### 4.1 Serializzazione

`stateToJSON()` (leggera, strip immagine) resta la serializzazione per **cronologia e `LS_KEY`**. L'immagine **non** entra in `LS_KEY`: va in una chiave dedicata (§4.2). Il **cloud** usa `JSON.stringify(state)` completo (§4.3).

### 4.2 `localStorage` — immagine in chiave dedicata

- Nuova chiave `LS_KEY_VENUE = LS_KEY + "_venue"` con `{name,_dataUrl,_imgW,_imgH}`.
- `persistVenueImg()` la scrive (con try/catch quota); `loadVenueImg()` ripopola `venueImgCache`; `clearVenueImg()` la rimuove.
- Scritta **solo quando la planimetria cambia** (`venueLoadFile`, apertura progetto, rimozione).
- `load()` (quando invocata — §4.6) chiama `loadVenueImg()` + `reattachVenueImg(state)`.

### 4.3 Cloud

- `saveProject()`: `data: JSON.parse(JSON.stringify(state))` (completo, con immagine).
- `openProject()` → `importProject()`: già fa `cacheVenueImg`; aggiunto `persistVenueImg()` così l'immagine sopravvive a un reload dopo l'apertura cloud.

### 4.4 Downscale al caricamento (`venueLoadFile`)

Se il lato lungo > 2000px: ridisegno su `<canvas>` ridotto → `toDataURL('image/jpeg',0.85)`; aggiorno `_dataUrl/_imgW/_imgH` (aspect ratio preservato → calibrazione valida). Altrimenti originale.

### 4.5 Quota piena = avviso

`persistVenueImg()` in caso di `QuotaExceededError` mostra un toast (esposto al main scope come `window.__toast`, pattern già usato da `window.__rtBroadcast`) invece di fallire in silenzio.

### 4.6 Ripristino al ritorno dal login (#2)

- `signIn()`: prima del redirect OAuth, `save()` esplicito → il lavoro corrente è garantito in `localStorage`.
- Boot (dopo `loadFromHash()`): se `sessionStorage["cloudReopen"]==="1"` (ritorno dal login) **e** non c'è progetto da hash → `load()`. Ripristina sessione + planimetria (via §4.2).
- L'avvio normale (senza `cloudReopen`) resta invariato: progetto nuovo.

---

## 5. Fuori scope (dichiarato)

- **F5/reload casuale**: per scelta resta "progetto nuovo" (il ripristino avviene solo dopo login o aprendo un progetto). La planimetria si ritrova via login o via apertura progetto, non con un reload qualunque.
- **Link `#p=`**: senza immagine (non entra in un URL).
- **Progetti cloud già salvati senza immagine**: restano senza finché non si risalva con planimetria caricata. Nessuna migrazione.
- **Supabase Storage**: non necessario a queste dimensioni.
- Segnalazioni #1/#3/#4.

---

## 6. Retrocompatibilità

- `LS_KEY` invariato. `LS_KEY_VENUE` nuova/opzionale.
- Cloud `schema_version` resta 1; `_dataUrl` dentro `data` è additivo.
- `cloudReopen` già esisteva (lo usa l'init cloud per riaprire il modal); lo riusiamo per il resume — l'init cloud continua a rimuoverlo dopo il login.

---

## 7. Verifica — esito test (browser, server locale)

| # | Test | Esito |
|---|------|-------|
| 1 | `persistVenueImg`: immagine in chiave dedicata, `LS_KEY` resta leggero | ✅ `venueKeyPresent:true, lsStateHasDataUrl:false` |
| 2 | `load()` ripristina la planimetria (reattach) | ✅ name + `_dataUrl` ripristinati |
| 3 | Resume-login: `cloudReopen`+reload → sessione + planimetria | ✅ `resumed:true`, `renderedInSvg:true` |
| 4 | Non-regressione: avvio normale = progetto nuovo | ✅ `isNewProject:true` (lavoro in LS ma non ripristinato) |
| 5 | Round-trip cloud: payload con immagine → apertura ripristina | ✅ `payloadHasImg:true`, `afterOpenHasDataUrl:true` |
| 6 | Sintassi JS (tutti i blocchi) + `build.mjs --check` | ✅ 0 errori, allineato |

**Da testare manualmente dall'utente** (non simulabile in locale): il **login Google reale** sul deploy (l'OAuth redirect è configurato per il dominio di produzione), end-to-end con planimetria.
