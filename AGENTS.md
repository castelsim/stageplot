# AGENTS.md — Regole per lo sviluppo (umani e agenti AI)

Questo repository è **StagePlot** (tool live: https://stageplot.it). Documento unico di convenzioni:
right-sized per la realtà del progetto, non un framework enterprise. Leggilo prima di lavorare.

---

## 1. Realtà del progetto (cosa stai toccando)

- Il tool è una web app **local-first**: funziona offline, si condivide come singolo file, il deploy è
  **GitHub Pages da `main`** (un file servito staticamente). Nessun backend obbligatorio.
- Storicamente è **un solo `index.html`** (~7.500 righe). Per permettere a più persone/agenti di
  lavorare in parallelo senza conflitti, lo stiamo **modularizzando**: si sviluppa in `src/`, e un
  build ricompone il **single-file** `index.html` per il deploy. Vedi `docs/MODULARIZATION.md`.
- Niente framework, niente bundler pesante. Build = un solo script Node senza dipendenze (`build.mjs`).

## 2. Fonte di verità e build

- **Si modifica `src/` e `index.template.html`, NON `index.html` a mano.** `index.html` è **generato**.
- Dopo ogni modifica ai sorgenti: `node build.mjs` (rigenera `index.html`).
- Prima di un merge/commit di release: `node build.mjs --check` deve passare (index.html allineato ai sorgenti).
- Finché un modulo non è ancora estratto, vive ancora dentro `index.template.html` (modularizzazione incrementale).

## 3. Rami (Git)

| Ramo | Uso |
|------|-----|
| `main` | Stabile. **È ciò che viene pubblicato.** Solo merge, mai sviluppo diretto. |
| `tool` | Lavoro sul tool: `index.template.html` + `src/` (UI/stili **e** logica — un solo fronte per il single-file). |
| `seo` | Contenuti e indicizzazione: `guida/`, `stage-plot/`, `sitemap.xml`, `llms.txt`, meta. |

Rami temporanei, sopra a quelli sopra, quando serve isolare un intervento:
`feature/<nome>`, `fix/<nome>`, `refactor/<nome>`, `experiment/<nome>`.

**Regola d'oro: un file → un ramo.** Non aprire due rami che modificano lo stesso file in parallelo
(es. due rami che toccano `src/styles.css`): è la causa #1 di conflitti.

## 4. Workflow (worker → integratore)

```
agente worker  →  lavora su un ramo (tool/seo/feature-*), committa lì
                  ↓
integratore    →  git switch main → git merge <ramo> → node build.mjs --check
                  ↓
TU             →  approvi il push (pubblicazione)
```

- I **commit e i merge sono liberi** (locali, reversibili, sul ramo di lavoro).
- Il **push lo decide l'utente**: un hook globale (`~/.claude/settings.json`) chiede conferma su ogni
  `git push`. Nessun agente pubblica di iniziativa.
- **A turni nella stessa cartella**: il worker deve committare sul suo ramo *prima* di passare la mano,
  così lo `switch` dell'integratore non gli sposta modifiche non committate sotto i piedi.
- Per worker **simultanei sullo stesso file** servono i **git worktree** (cartelle separate). Per ora,
  a turni, non servono.

## 5. Commit (Conventional Commits)

Formato: `tipo: descrizione breve all'imperativo` (es. `style: aumenta contrasto pannello proprietà`).

| Tipo | Quando |
|------|--------|
| `feat` | nuova funzionalità utente |
| `fix` | correzione di un bug |
| `style` | CSS/aspetto/spaziatura/colori (nessun cambiamento di logica) |
| `refactor` | ristrutturazione senza cambiare comportamento |
| `perf` | ottimizzazione prestazioni |
| `docs` | documentazione |
| `build` | script di build, deploy, config |
| `chore` | manutenzione varia (no codice prodotto) |

## 6. Ownership (per modulo, cresce con la modularizzazione)

| Area | File | Tocca |
|------|------|-------|
| UI / design | `src/styles.css` | solo CSS, layout, tipografia, colori, responsive. **Mai logica.** |
| Tool (resto) | `index.template.html` | markup + JS finché non estratti in moduli `src/*.js` |
| Contenuti/SEO | `guida/`, `stage-plot/`, `sitemap.xml`, `llms.txt` | pagine statiche, meta |
| Build/infra | `build.mjs`, `index.template.html`, `CNAME`, `manifest.webmanifest` | toolchain e deploy |

I prossimi moduli previsti (vedi piano): `src/` per canvas, objects, data/serializzazione, export.

## 7. Regole assolute

- Non modificare `index.html` a mano (è generato — perderesti le modifiche al prossimo build).
- Non committare `index.html` disallineato dai sorgenti (gira `node build.mjs` prima).
- Non pushare/pubblicare senza l'OK dell'utente.
- Non cambiare la logica di business mentre fai lavoro UI (e viceversa).
- In dubbio su una scelta architetturale: fermati, spiega i trade-off, chiedi.
