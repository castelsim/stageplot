# Modularizzazione di StagePlot

**Obiettivo:** trasformare il monolite `index.html` (~7.500 righe) in moduli sorgente, mantenendo il
**deploy single-file**. Questo è l'unico intervento che rende davvero possibile lo sviluppo parallelo
per-area senza conflitti (l'agente UI tocca `styles.css`, quello export tocca `export.js`, e non si
incontrano mai). Senza modularizzazione, ogni agente "specializzato" editerebbe lo stesso file.

## Principio: sviluppo modulare, deploy single-file

```
src/styles.css ─┐
src/*.js ───────┤── node build.mjs ──→ index.html (single-file, deploy GitHub Pages)
index.template.html ─┘
```

- Si sviluppa nei moduli `src/` + `index.template.html`.
- `node build.mjs` inietta i moduli (inline) nel template e produce `index.html`.
- `node build.mjs --check` verifica che `index.html` sia allineato (da usare prima di un merge/release).
- Il deploy resta **un solo file**: nessuna richiesta HTTP extra, funziona offline, condivisibile.

## Costo (onesto)

Si introduce un **build step** (un solo script Node, zero dipendenze). Implica una regola nuova:
**non si edita più `index.html` a mano**, si editano i moduli e si rigenera. È il prezzo per avere
isolamento reale tra aree di lavoro.

## Stato

| Modulo | Stato | File |
|--------|-------|------|
| CSS / design system | ✅ estratto | `src/styles.css` |
| Markup HTML | dentro il template | `index.template.html` |
| JS: canvas (render, drag, snap, zoom, pan, selezione) | ⏳ da estrarre | `src/canvas.js` (previsto) |
| JS: objects (libreria SVG, strumenti, proprietà) | ⏳ da estrarre | `src/objects.js` (previsto) |
| JS: data (JSON, save/load, import, share) | ⏳ da estrarre | `src/data.js` (previsto) |
| JS: export (PDF/PNG/SVG/print) | ⏳ da estrarre | `src/export.js` (previsto) |
| Asset SVG icone | ⏳ valutare | `src/assets/` (previsto) |

## Come estrarre il prossimo modulo (ricetta)

1. Individuare un blocco coeso e a basso accoppiamento nel JS di `index.template.html`.
2. Spostarlo in `src/<modulo>.js`, lasciando un marcatore nel template (es. `/*__STAGEPLOT_<NOME>__*/`).
3. Registrare il marcatore in `INJECTIONS` dentro `build.mjs`.
4. `node build.mjs` e verificare il **round-trip**: l'`index.html` rigenerato deve restare identico
   (o cambiare solo per ciò che hai voluto cambiare). Verificare nel browser (console pulita).
5. Estrazione = `refactor:` puro: nessun cambiamento di comportamento.

## Ordine consigliato (impatto/rischio)

1. **CSS** ✅ — fatto, basso rischio, abilita subito il lavoro UI isolato.
2. **Asset SVG icone** — grossi blocchi di dati statici, accoppiamento minimo: facili da isolare, alleggeriscono il file editabile.
3. **export** — relativamente autonomo (PDF/PNG/SVG).
4. **data** — serializzazione/IO.
5. **objects** e **canvas** — più accoppiati allo stato globale: per ultimi, con cautela.

> Nota: oggi i moduli JS, una volta estratti, vengono **re-iniettati inline** dal build (niente
> `import`/ESM nel file finale) per non cambiare la semantica delle funzioni globali esistenti.
> Una migrazione a moduli ES veri è un passo successivo, separato e opzionale.
