# AGENTS.md — Regole per lo sviluppo (umani e agenti AI)

Questo repository è **StagePlot** (tool live: https://stageplot.it). Documento unico di convenzioni:
right-sized per la realtà del progetto, non un framework enterprise. Leggilo prima di lavorare.

---

## 1. Realtà del progetto (cosa stai toccando)

- Il tool è una web app **local-first**: funziona offline, si condivide come singolo file, il deploy è
  **GitHub Pages da `main`** (un file servito staticamente). Nessun backend obbligatorio.
- Storicamente è **un solo `index.html`** (~7.500 righe). Per permettere a più persone/agenti di
  lavorare in parallelo senza conflitti, lo stiamo **modularizzando**: si sviluppa in `src/`, e un
  build ricompone la **shell** dell'app per il deploy. Vedi `docs/MODULARIZATION.md`.
- **Due pagine diverse, non confonderle** (dall'08/08/2026):
  - `/` → `index.html` in radice = **landing di prodotto**, scritta a mano, indicizzata. Il build NON la tocca.
  - `/app/` → `app/index.html` = **l'editor**, generato da `index.template.html`. È `noindex`.
  - I link storici alla radice (`?view=`, `?model=`, `#p=`, `#d=`, PWA) rimbalzano su `/app/` con uno
    script sincrono in testa alla landing: GitHub Pages non ha redirect lato server.
- Niente framework, niente bundler pesante. Build = un solo script Node senza dipendenze (`build.mjs`).

## 2. Fonte di verità e build

- **Si modifica `src/` e `index.template.html`, NON `app/index.html` a mano.** `app/index.html` è **generato**.
- Dopo ogni modifica ai sorgenti: `node build.mjs` (rigenera `app/index.html` + `app.js`).
- Prima di un merge/commit di release: `node build.mjs --check` deve passare (shell allineata ai sorgenti).
- Finché un modulo non è ancora estratto, vive ancora dentro `index.template.html` (modularizzazione incrementale).

## 3. Rami (Git) — come si lavora oggi (aggiornato 24/09/2026)

- `main` è ciò che è pubblicato: **ogni merge su `main` va online** su stageplot.it (workflow `pages.yml`).
- Si lavora su un ramo di lavoro (da settembre 2026 il worktree `.claude/worktrees/telefono-nuovo`,
  ramo `telefono-nuovo`) e si porta su `main` con **una PR per lotto**, poi merge.
- Prima di ogni commit: `git fetch && git merge --ff-only origin/main` (o merge normale se il ramo ha
  lavoro suo) e verifica di branch e HEAD: più sessioni e agenti lavorano sullo stesso repository.
- Mai `git stash` nudo: la pila è condivisa fra i worktree. Meglio un commit temporaneo.
- I vecchi rami `tool` / `seo` descritti nelle versioni precedenti di questo file non si usano più.

## 4. Un lotto, dall'inizio alla fine

1. Aggiornare il ramo (sopra) e leggere `handoff.md` in cima: dice cosa è cambiato di recente.
2. Modificare `index.template.html` / `src/` (mai `app/index.html`), poi `node build.mjs`.
3. **Ogni correzione ha il suo test** in `test/engines.test.mjs` (o `orchestre/test/`), e il test va
   provato **con mutazioni**: base verde, si rompe il codice apposta, il test deve diventare rosso,
   si rimette e la base torna verde. Un test che resta verde sul codice rotto non protegge niente.
4. Le suite: `node build.mjs --check` · `node test/engines.test.mjs` · `node --test orchestre/test/*.test.mjs`
   · `deno test --lock=deno.lock --frozen supabase/functions/_shared/*.test.ts`.
5. **Scelte visive e flussi: guardarli nel browser** su un server locale (`python3 -m http.server <porta>`),
   con una **porta nuova a ogni prova** (il service worker serve il codice vecchio) oppure con
   unregister del SW + `caches.delete()`.
6. Commit con il perché, PR, merge; poi **verificare in produzione** che il codice nuovo sia su
   stageplot.it (es. `curl https://stageplot.it/app.js | grep <funzione nuova>`). Si dice «fatto» solo dopo.
7. Edge Function toccate (anche solo un modulo in `_shared/`): ridistribuire tutte quelle che lo importano
   con `supabase functions deploy <nome> --project-ref vsodplqkuvnsdiikvmjb --use-api`.
8. Fine sessione: una sezione nuova **in cima** a `handoff.md`.

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

- Non modificare `app/index.html` a mano (è generato — perderesti le modifiche al prossimo build).
  L'`index.html` in radice è invece la landing: quello si modifica a mano ed è il build a non toccarlo.
- Non committare `app/index.html` disallineato dai sorgenti (gira `node build.mjs` prima).
- Pubblicare solo ciò che l'utente ha chiesto o approvato in quella sessione (la richiesta vale come OK).
- Database di produzione: **solo lettura**; le modifiche passano da migrazioni in `supabase/migrations/`.
- Niente dati reali di clienti, musicisti o fornitori nel repo: è pubblico.
- Non cambiare la logica di business mentre fai lavoro UI (e viceversa).
- In dubbio su una scelta architetturale: fermati, spiega i trade-off, chiedi.

## 8. Trappole note (costate ore: leggerle prima)

- **CSS, regole annidate per sbaglio**: `.tbar-ico{` in `src/styles.css` non si chiude sulla sua riga;
  una regola inserita dopo la prima riga finisce annidata e il browser la ignora. Inserire dopo la `}`.
- **CSS, ordine**: a parità di specificità vince l'ultima scritta; una regola base scritta *dopo* un
  gradino `@media` lo annulla. Dentro `#props` ogni regola nuova va scritta almeno `#props .x`.
- **Boot**: una `var` definita più in basso nel file è `undefined` per il codice di avvio sopra di lei.
- **PDF**: molte funzioni `*Pdf` hanno un `function trow(...)` identico: sostituire dentro la funzione
  giusta, mai la prima occorrenza nel file.
- **Ricerca del catalogo**: un nome nuovo che contiene «mic» o «monitor» ruba i risultati ad aste e wedge;
  si usa `qaCede` sul tipo nuovo.
- **Modelli**: ogni modello ha due strade — con la finestra dell'organico e con «Formazione tipica»
  (`formazione` nullo). Vanno provate tutte e due.
- **Voci**: `VOCE` è il punto di aggancio per chiunque parli o canti (cantante, corista, relatore,
  moderatore): microfono dal pannello, canale, sedia, leggio. Un tipo nuovo di persona va aggiunto lì.
- **Tipo di evento**: `state.tipoEvento` (`concerto`/`conferenza`, per variante) cambia parole del PDF,
  avvisi e testi di partenza tramite `eventoConferenza()` / `nomeDocumento()`, non il disegno.
- **Edge Function**: non rispondere prima di aver letto il corpo della richiesta (causa 503 dopo due minuti).
- **Prove multi-browser**: Playwright (Chromium, WebKit, Firefox) su una copia `git archive origin/main`
  servita in locale, con la rete verso l'esterno bloccata (`ctx.route`) per non toccare dati veri.

