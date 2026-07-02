# Libreria icone StagePlot — Fase campione: piano d'implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produrre 5 icone SVG campione realistiche (standard LIB_ICONS) + pagina di confronto con le icone esistenti, apribile in Chrome da `file://`, per il gate di approvazione visiva di Simone.

**Architecture:** Libreria standalone in `COWORK/STAGE PLOT/icon-prototype/` (repo git locale nuova, FUORI dal sito pubblicato). Fonte unica dei metadati = `manifest.json`; validatore Node senza dipendenze; pagina preview statica con SVG embedded via file generato (`icons-data.js`) per funzionare da `file://`. Il tool StagePlot viene letto (estrazione LIB_ICONS di riferimento) ma **mai modificato**.

**Tech Stack:** SVG puro, Node.js ≥18 (solo stdlib), HTML/CSS/JS vanilla.

**Spec:** `docs/superpowers/specs/2026-07-02-icon-library-design.md` (repo stageplot).

## Global Constraints

- **Non modificare nulla** in `/Users/simonecastellan/COWORK/GITHUB/stageplot/` salvo `docs/superpowers/` (spec/piani). Il file del tool si apre in sola lettura.
- Path del prototipo contiene uno spazio: citare sempre `"/Users/simonecastellan/COWORK/STAGE PLOT/icon-prototype"` tra virgolette nei comandi.
- Unità SVG: **1 unità = 1 cm**. `viewBox="0 0 W D"` dove W×D = ingombro reale dichiarato nel manifest. Vista dall'alto. Fronte palco (pubblico) = **basso**.
- Standard qualità: realistico multi-path livello LIB_ICONS. Vietati: outline generico, stile Font Awesome, simboli minimalisti, `<image>`, `<filter>`, `<script>`, font esterni.
- Ogni icona deve restare leggibile in B/N (test in preview) — vincolo export PDF del tool.
- Nomi file kebab-case italiano; prefisso classi/id interno = chiave underscore (es. file `cassa-22.svg`, prefisso `cassa22_`).
- Commit frequenti nella repo del prototipo, messaggi in italiano.
- Node senza dipendenze npm: niente `package.json`, niente `npm install`.

## Struttura file finale della fase

```
COWORK/STAGE PLOT/icon-prototype/
  manifest.json                  ← metadati icone campione (fonte unica)
  samples/                       ← le 5 icone campione
    cassa-22.svg  wedge-monitor.svg  asta-giraffa.svg
    persona-cantante.svg  timpano-81.svg
  reference/                     ← estratti LIB_ICONS (solo confronto, NON output)
    arpa.svg  violino.svg  violoncello.svg  tromba.svg
  tools/
    extract-lib-icons.mjs        ← tool (RO) → reference/*.svg
    validate-icons.mjs           ← lint strutturale, exit 0/1
    build-preview-data.mjs       ← manifest+svg → preview/icons-data.js
  docs/
    ANATOMIA_LIB_ICONS.md        ← analisi esistenti + palette canonica
  preview/
    index.html                   ← pagina confronto (file://)
    icons-data.js                (generato, non editare a mano)
```

---

### Task 1: Setup prototipo + estrazione icone di riferimento

**Files:**
- Create: `"/Users/simonecastellan/COWORK/STAGE PLOT/icon-prototype"` (albero cartelle, `git init`)
- Create: `tools/extract-lib-icons.mjs`
- Read-only: `/Users/simonecastellan/COWORK/GITHUB/stageplot/index.template.html`

**Interfaces:**
- Produces: `reference/arpa.svg`, `reference/violino.svg`, `reference/violoncello.svg`, `reference/tromba.svg` — SVG standalone `<svg xmlns viewBox="x y w h">` + body originale LIB_ICONS (classi già namespaced dal tool).

- [ ] **Step 1: Creare l'albero e la repo**

```bash
cd "/Users/simonecastellan/COWORK/STAGE PLOT" && mkdir -p icon-prototype/{samples,reference,tools,docs,preview}
cd icon-prototype && git init -b main
```

- [ ] **Step 2: Scrivere `tools/extract-lib-icons.mjs`**

```js
#!/usr/bin/env node
/* Estrae icone da LIB_ICONS del tool (SOLA LETTURA) e le salva come SVG standalone. */
import { readFileSync, writeFileSync } from 'node:fs';

const TOOL = '/Users/simonecastellan/COWORK/GITHUB/stageplot/index.template.html';
const OUT = new URL('../reference/', import.meta.url).pathname;
const WANTED = ['arpa', 'violino', 'violoncello', 'tromba'];

const html = readFileSync(TOOL, 'utf8');
const m = html.match(/var LIB_ICONS = (\{.*?\});\s*\n/s);
if (!m) { console.error('LIB_ICONS non trovato'); process.exit(1); }
const lib = JSON.parse(m[1]);

for (const key of WANTED) {
  const ic = lib[key];
  if (!ic) { console.error('manca: ' + key); process.exit(1); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ic.vb.join(' ')}">\n` +
              `<!-- riferimento LIB_ICONS "${key}" — estratto ${new Date().toISOString().slice(0,10)}, NON modificare -->\n` +
              ic.body + '\n</svg>\n';
  writeFileSync(OUT + key + '.svg', svg);
  console.log('ok', key, ic.vb.join('×'));
}
```

- [ ] **Step 3: Eseguire e verificare**

```bash
node tools/extract-lib-icons.mjs && grep -c "<path" reference/*.svg
```
Atteso: `ok` per i 4 nomi; ogni file con conteggio `<path` ≥ 5 (sono multi-path realistici).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "setup prototipo + estrazione riferimenti LIB_ICONS (arpa, violino, violoncello, tromba)"
```

---

### Task 2: Anatomia delle LIB_ICONS → `docs/ANATOMIA_LIB_ICONS.md`

**Files:**
- Create: `docs/ANATOMIA_LIB_ICONS.md`

**Interfaces:**
- Produces: **palette materiali canonica** (tabella hex) e **template SVG standalone canonico** usati da tutti i task icona (4-8). Se gli hex qui sotto (default del piano) divergono da quelli campionati dalle icone reali, vince l'anatomia e si aggiorna la tabella.

- [ ] **Step 1: Campionare i colori reali**

```bash
grep -oE 'fill: ?#[0-9a-fA-F]{3,6}|stop-color="#[0-9a-fA-F]{3,6}"' reference/*.svg | sort | uniq -c | sort -rn | head -40
```

- [ ] **Step 2: Scrivere il documento** con: (a) per ciascuna delle 4 icone: n. path, n. gradienti e tipo, struttura `<defs><style>`, come ottengono materiali/volume (campiture sovrapposte scure→chiare, riflessi come path chiari, niente stroke di contorno); (b) tabella palette canonica partendo da questi default e correggendola con i valori campionati:

| Materiale | Default piano (grad. scuro→chiaro) |
|---|---|
| Legno strumento | #4f3017 → #865227 |
| Ottone | #8a6d1f → #d9b44a |
| Argento/nichel/cromo | #6f7377 → #cdcccc |
| Nero hardware/gomma | #141414 → #383938 |
| Rame timpano | #6e4522 → #b87333 |
| Pelle percussione | #cfc6b4 → #efe9db |
| Bronzo piatti | #7a5c28 → #c9a24b |
| Tela/griglia speaker | #1b1b1b + trama #2e2e2e |
| Pelle/incarnato persona | #c9a186 → #e7c9ae |
| Tessuto abito | #23262b → #3a3f47 |

(c) il **template canonico** delle nuove icone:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W D">
<!-- nome-file | Categoria | W×D cm | fonte misura | orientamento | data -->
<defs>
  <style>.PREFIX_cls-1{fill:#...}</style>
  <linearGradient id="PREFIX_g1" ...>...</linearGradient>
</defs>
<g id="PREFIX">…solo path/rect/circle/ellipse/g…</g>
</svg>
```

Regole nel template: coordinate native in cm (decimali liberi, niente `transform="scale()"` di rimappatura); ogni id/classe col prefisso; riflessi = path chiari semitrasparenti sopra le campiture; nessuno stroke di contorno esterno pesante.

- [ ] **Step 3: Commit**

```bash
git add docs/ANATOMIA_LIB_ICONS.md && git commit -m "anatomia LIB_ICONS: struttura, palette canonica, template nuove icone"
```

---

### Task 3: `manifest.json` + validatore (test harness, parte RED)

**Files:**
- Create: `manifest.json`
- Create: `tools/validate-icons.mjs`

**Interfaces:**
- Produces: `manifest.json` schema `{ "icons": [ { key, file, nome, categoria, w_cm, d_cm, fonte, orientamento, nota, min_paths } ] }`; `node tools/validate-icons.mjs` → exit 0 se tutte valide, 1 altrimenti, output `PASS/FAIL <key> — motivo`. I task 4-8 portano ciascuno la propria riga da FAIL a PASS. Il Task 9 legge lo stesso manifest.

- [ ] **Step 1: Scrivere `manifest.json`** (misure dalla spec; `min_paths` = soglia anti-pittogramma dichiarata)

```json
{
  "icons": [
    { "key": "cassa22", "file": "samples/cassa-22.svg", "nome": "Cassa 22\"", "categoria": "Batteria e percussioni",
      "w_cm": 56, "d_cm": 62, "fonte": "standard 22\" (fusto Ø56×45) + pedale, stima dichiarata",
      "orientamento": "pedale upstage (alto), risuonante verso il pubblico (basso)", "nota": "fusto nero lucido, hoop cromati, pedale con battente", "min_paths": 10 },
    { "key": "wedge_monitor", "file": "samples/wedge-monitor.svg", "nome": "Wedge monitor", "categoria": "Monitoraggio",
      "w_cm": 60, "d_cm": 45, "fonte": "TYPES wedge (verificata)",
      "orientamento": "griglia verso il musicista (alto)", "nota": "cabinet moquette nera, griglia forata, maniglie", "min_paths": 8 },
    { "key": "asta_giraffa", "file": "samples/asta-giraffa.svg", "nome": "Asta microfonica a giraffa", "categoria": "Microfoni",
      "w_cm": 60, "d_cm": 80, "fonte": "TYPES giraffa + boom esteso, stima dichiarata",
      "orientamento": "base upstage, microfono verso il pubblico (basso)", "nota": "treppiede, boom con contrappeso, mic dinamico", "min_paths": 8 },
    { "key": "persona_cantante", "file": "samples/persona-cantante.svg", "nome": "Cantante (persona)", "categoria": "Persone",
      "w_cm": 55, "d_cm": 55, "fonte": "antropometria media (spalle+braccia)",
      "orientamento": "guarda il pubblico (basso)", "nota": "testa+spalle top-view, realistico discreto, no cartoon", "min_paths": 6 },
    { "key": "timpano81", "file": "samples/timpano-81.svg", "nome": "Timpano 32\" (Ø81)", "categoria": "Batteria e percussioni",
      "w_cm": 88, "d_cm": 88, "fonte": "TYPES timpsingolo/timpani3 (Ø81 + telaio)",
      "orientamento": "pedale verso il timpanista (alto)", "nota": "caldaia rame, pelle chiara, tiranti, pedale", "min_paths": 10 }
  ]
}
```

- [ ] **Step 2: Scrivere `tools/validate-icons.mjs`**

```js
#!/usr/bin/env node
/* Lint strutturale icone campione. Node stdlib, nessuna dipendenza. */
import { readFileSync, existsSync, statSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const man = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
let fail = 0;
const bad = (k, why) => { console.log('FAIL ' + k + ' — ' + why); fail = 1; };

for (const ic of man.icons) {
  const p = root + ic.file;
  if (!existsSync(p)) { bad(ic.key, 'file mancante'); continue; }
  const s = readFileSync(p, 'utf8');
  const vb = s.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!vb) { bad(ic.key, 'viewBox assente o non "0 0 W D"'); continue; }
  if (Math.abs(+vb[1] - ic.w_cm) > 0.5 || Math.abs(+vb[2] - ic.d_cm) > 0.5)
    bad(ic.key, `viewBox ${vb[1]}×${vb[2]} ≠ manifest ${ic.w_cm}×${ic.d_cm}`);
  for (const t of ['<image', '<filter', '<script', 'font-family'])
    if (s.includes(t)) bad(ic.key, 'vietato: ' + t);
  const paths = (s.match(/<(path|rect|circle|ellipse|polygon|line)[\s>]/g) || []).length;
  if (paths < ic.min_paths) bad(ic.key, `solo ${paths} shape (< ${ic.min_paths}): troppo pittogramma`);
  const prefix = ic.key + '_';
  const ids = [...s.matchAll(/id="([^"]+)"/g)].map(x => x[1]).filter(i => i !== ic.key);
  if (ids.some(i => !i.startsWith(prefix))) bad(ic.key, 'id senza prefisso ' + prefix);
  if (statSync(p).size > 80 * 1024) bad(ic.key, 'file > 80KB');
  const open = (s.match(/<[a-zA-Z]/g) || []).length, close = (s.match(/<\/[a-zA-Z]|\/>/g) || []).length;
  if (open !== close) bad(ic.key, `tag sbilanciati (${open} aperti vs ${close} chiusi)`);
  if (!fail) console.log('PASS ' + ic.key + ` (${paths} shape)`);
}
process.exit(fail);
```

- [ ] **Step 3: Eseguire — deve fallire (RED)**

```bash
node tools/validate-icons.mjs; echo "exit=$?"
```
Atteso: 5 × `FAIL <key> — file mancante`, `exit=1`.

- [ ] **Step 4: Commit**

```bash
git add manifest.json tools/validate-icons.mjs && git commit -m "manifest 5 campioni + validatore strutturale (red)"
```

---

### Task 4: Icona `samples/wedge-monitor.svg`

*(Si parte dal wedge: geometria più semplice, calibra il metodo.)*

**Files:**
- Create: `samples/wedge-monitor.svg`

**Interfaces:**
- Consumes: template canonico e palette da `docs/ANATOMIA_LIB_ICONS.md`; riga `wedge_monitor` del manifest (60×45, min 8 shape).

**Distinta base (vista dall'alto, viewBox `0 0 60 45`, prefisso `wedge_monitor_`):**
1. Corpo a cuneo: dall'alto il cabinet appare come esagono allungato (pannello superiore trapezoidale, lato lungo 60 in basso-corpo, smussi angolari) — moquette nera (#141414→#2b2b2b, gradiente verticale leggero, bordi arrotondati rx≈2).
2. Banda griglia (verso l'alto = musicista): trapezio profondo ~14 cm, fondo #1b1b1b, trama fori = 3-4 file di puntini #2e2e2e Ø0,8 (pattern disegnato, non `<pattern>` se più semplice: righe di cerchietti).
3. Dietro la griglia, in trasparenza suggerita: arco del cono woofer (#383938) e slot tweeter.
4. Due maniglie a conchiglia laterali (ellissi incassate #0d0d0d con bordo #383938).
5. Angolari/scivoli metallici agli spigoli (piccoli path #6f7377→#cdcccc).
6. Riflesso: path chiaro semitrasparente (bianco 8-12%) lungo il bordo basso del pannello.

- [ ] **Step 1: Disegnare l'SVG** secondo distinta e template (coordinate in cm, decimali liberi).
- [ ] **Step 2: Validare**

```bash
node tools/validate-icons.mjs
```
Atteso: `PASS wedge_monitor`, gli altri 4 ancora FAIL.

- [ ] **Step 3: Controllo visivo rapido** (apri il file in anteprima/Quick Look o browser; forma riconoscibile come wedge a colpo d'occhio, anche in B/N mentale).
- [ ] **Step 4: Commit**

```bash
git add samples/wedge-monitor.svg && git commit -m "campione: wedge monitor 60×45 realistico"
```

---

### Task 5: Icona `samples/cassa-22.svg`

**Files:**
- Create: `samples/cassa-22.svg`

**Interfaces:**
- Consumes: palette/template Task 2; riga `cassa22` del manifest (56×62, min 10 shape).

**Distinta base (viewBox `0 0 56 62`, prefisso `cassa22_`):** kick 22" con asse orizzontale puntato al pubblico (basso).
1. Fusto = rettangolo arrotondato 56×45 (y 0→45): wrap nero lucido, **gradiente orizzontale cilindrico** (#0d0d0d ai lati → #3a3a3a al centro) per suggerire la curvatura.
2. Hoop anteriore (basso) e posteriore (alto) = bande 56×3 cromate (#6f7377→#cdcccc) alle due estremità del fusto.
3. Aste/artigli di tensione: 6 piccoli tiranti cromati per lato lungo (rettangolini 1×2,5).
4. Gambe stabilizzatrici (spurs): due path metallici che escono diagonali dagli angoli bassi verso l'esterno, puntale in gomma nera.
5. Pedale (y 45→62 al centro): pedana 10×15 (#383938 con nervature), catena/asta e battente = stelo che entra nel fusto con testa in feltro Ø6 (#cfc6b4).
6. Riflesso: path bianco 8% lungo il bordo basso del fusto.

- [ ] **Step 1: Disegnare l'SVG.**
- [ ] **Step 2: Validare** — atteso `PASS cassa22`.
- [ ] **Step 3: Controllo visivo rapido.**
- [ ] **Step 4: Commit** — `git add samples/cassa-22.svg && git commit -m "campione: cassa 22\" realistica con pedale"`

---

### Task 6: Icona `samples/timpano-81.svg`

**Files:**
- Create: `samples/timpano-81.svg`

**Interfaces:**
- Consumes: palette/template Task 2; riga `timpano81` del manifest (88×88, min 10 shape).

**Distinta base (viewBox `0 0 88 88`, prefisso `timpano81_`, centro 44,44):**
1. Corona caldaia rame: anello esterno Ø81 (r 40,5) con gradiente radiale/conico simulato (#6e4522→#b87333, riflesso caldo #d99a5b su un quadrante).
2. Pelle: cerchio r 36 crema (#efe9db→#cfc6b4 gradiente radiale leggero, centro più chiaro).
3. Cerchione (counterhoop): anello sottile argento tra pelle e caldaia.
4. Tiranti: 8 gruppi vite/blocchetto (#6f7377) distribuiti sul cerchione ogni 45°.
5. Telaio/ruote: 3-4 settori che sporgono oltre la caldaia fino a Ø88 (staffe scure + ruote piroettanti Ø7 nere con cerchietto grigio).
6. Pedale: sagoma trapezoidale che sporge in alto (y basse... **attenzione: alto = y piccole**) verso il timpanista, #383938 con leva.
7. Riflesso pelle: mezzaluna bianca 10% off-center.

- [ ] **Step 1: Disegnare l'SVG.**
- [ ] **Step 2: Validare** — atteso `PASS timpano81`.
- [ ] **Step 3: Controllo visivo rapido** (il rame deve leggersi anche in B/N: contrasto caldaia/pelle).
- [ ] **Step 4: Commit** — `git add samples/timpano-81.svg && git commit -m "campione: timpano 32\" Ø81 rame, pelle, pedale"`

---

### Task 7: Icona `samples/asta-giraffa.svg`

**Files:**
- Create: `samples/asta-giraffa.svg`

**Interfaces:**
- Consumes: palette/template Task 2; riga `asta_giraffa` del manifest (60×80, min 8 shape).

**Distinta base (viewBox `0 0 60 80`, prefisso `asta_giraffa_`):** base in alto (upstage), mic verso il basso (cantante/pubblico).
1. Treppiede: 3 gambe nere (path affusolati, spessore 2→1) a Y dal mozzo (30,18), puntali in gomma; apertura Ø~55.
2. Mozzo/frizione: cerchio Ø5 #383938 con vite a T laterale.
3. Stelo verticale: visto dall'alto = cerchietto concentrico al mozzo (Ø3, #6f7377).
4. Boom: barra da (30,18) a (30,72), spessore 1,6, nero con giunto centrale cromato; contrappeso dietro il mozzo (capsula 4×8 #141414) che sporge verso l'alto oltre il mozzo.
5. Snodo/clip porta-mic a (30,66): morsetto #383938.
6. Microfono dinamico in punta (30,72): corpo affusolato 2×7 (#383938→#141414) + griglia sferica Ø4 (#6f7377→#cdcccc con retino di puntini).
7. Cavo: path sottile curvo (#141414, larghezza 0,6) che segue il boom e scende dal mozzo.

- [ ] **Step 1: Disegnare l'SVG.**
- [ ] **Step 2: Validare** — atteso `PASS asta_giraffa`.
- [ ] **Step 3: Controllo visivo rapido** (leggibile anche a scala piccola: il tool la renderà ~1-2 cm su schermo).
- [ ] **Step 4: Commit** — `git add samples/asta-giraffa.svg && git commit -m "campione: asta giraffa con mic dinamico"`

---

### Task 8: Icona `samples/persona-cantante.svg`

**Files:**
- Create: `samples/persona-cantante.svg`

**Interfaces:**
- Consumes: palette/template Task 2; riga `persona_cantante` del manifest (55×55, min 6 shape).

**Distinta base (viewBox `0 0 55 55`, prefisso `persona_cantante_`, guarda il pubblico = basso):**
1. Spalle/busto: forma a fagiolo orizzontale ~46×26 centrata (27,5, 24), tessuto scuro (#23262b→#3a3f47 gradiente), spalle leggermente asimmetriche (naturalezza).
2. Braccia: accenni laterali che portano l'ingombro a 55 (avambraccio destro piegato in avanti — verso il basso — come a tenere un mic).
3. Testa: cerchio Ø16 a (27,5, 22) leggermente sopra il busto (verso l'alto = dietro? **no: la testa sporge verso il pubblico**, quindi centro testa a y≈26, davanti al busto), incarnato #e7c9ae con gradiente.
4. Capelli: calotta che copre 2/3 posteriori della testa (#2e2019→#4a3423), ciuffo/riga.
5. Naso/mento suggeriti: piccola sporgenza dell'incarnato sul bordo basso della testa (direzione sguardo).
6. Riflesso: mezzaluna chiara sui capelli.
7. **No occhi/bocca disegnati** (top-view reale non li mostra); no ombra a terra.

- [ ] **Step 1: Disegnare l'SVG.**
- [ ] **Step 2: Validare** — atteso `PASS persona_cantante` → **tutte e 5 PASS, exit=0 (GREEN)**.
- [ ] **Step 3: Controllo visivo rapido** (test: sembra una persona vista dall'alto o un avatar? deve essere il primo).
- [ ] **Step 4: Commit** — `git add samples/persona-cantante.svg && git commit -m "campione: persona/cantante top-view realistica"`

---

### Task 9: Pagina di confronto `preview/index.html` + `tools/build-preview-data.mjs`

**Files:**
- Create: `tools/build-preview-data.mjs`
- Create: `preview/index.html`
- Generate: `preview/icons-data.js`

**Interfaces:**
- Consumes: `manifest.json`, `samples/*.svg`, `reference/*.svg`.
- Produces: `preview/icons-data.js` = `window.ICON_DATA = { samples:[{key,nome,categoria,w,d,fonte,orientamento,nota,svg}], reference:[{key,nome,w,d,svg}] }` (w,d in cm; per i reference w,d = viewBox).

- [ ] **Step 1: Scrivere `tools/build-preview-data.mjs`**

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const man = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
const samples = man.icons.map(ic => ({
  key: ic.key, nome: ic.nome, categoria: ic.categoria, w: ic.w_cm, d: ic.d_cm,
  fonte: ic.fonte, orientamento: ic.orientamento, nota: ic.nota,
  svg: readFileSync(root + ic.file, 'utf8')
}));
const reference = readdirSync(root + 'reference').filter(f => f.endsWith('.svg')).map(f => {
  const svg = readFileSync(root + 'reference/' + f, 'utf8');
  const vb = svg.match(/viewBox="([\d.\- ]+)"/)[1].split(' ').map(Number);
  return { key: f.replace('.svg',''), nome: f.replace('.svg','') + ' (esistente)', w: vb[2], d: vb[3], svg };
});
writeFileSync(root + 'preview/icons-data.js',
  'window.ICON_DATA = ' + JSON.stringify({ samples, reference }) + ';\n');
console.log('ok:', samples.length, 'campioni,', reference.length, 'riferimenti');
```

- [ ] **Step 2: Scrivere `preview/index.html`** — statica, nessuna risorsa esterna, funziona da `file://`:

```html
<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>StagePlot — Icone campione vs esistenti</title>
<style>
  :root{--bg:#f5f4f0;--fg:#17201f;--card:#fff;--line:#d8d5cd;--accent:#0d9488}
  body.dark{--bg:#12181b;--fg:#e8ebe9;--card:#1b2327;--line:#2c3a3f}
  *{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,system-ui,sans-serif;background:var(--bg);color:var(--fg)}
  header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 20px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;z-index:2}
  h1{font-size:17px;margin:0 auto 0 0}
  label{display:flex;gap:6px;align-items:center;font-size:13px}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin:26px 20px 8px}
  .row{display:flex;gap:18px;align-items:flex-end;overflow-x:auto;padding:8px 20px 20px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;text-align:center;flex:0 0 auto}
  .stage{display:flex;align-items:flex-end;justify-content:center;
    background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
    background-size:calc(var(--s)*50px) calc(var(--s)*50px);border-radius:6px;padding:8px}
  body.bn .stage{filter:grayscale(1)}
  .meta{font-size:12px;opacity:.75;max-width:230px;margin:8px auto 0}
  .meta b{display:block;font-size:13px;opacity:1}
  .dim{color:var(--accent);font-weight:600}
</style></head><body>
<header>
  <h1>Icone campione — confronto con LIB_ICONS esistenti (scala uniforme)</h1>
  <label>Scala <input id="s" type="range" min="1.5" max="5" step="0.1" value="2.5"> <span id="sv"></span> px/cm</label>
  <label><input id="dark" type="checkbox"> Fondo scuro</label>
  <label><input id="bn" type="checkbox"> Bianco/nero</label>
</header>
<h2>Riferimento — icone esistenti nel tool (NON in discussione)</h2><div class="row" id="ref"></div>
<h2>Campioni nuovi — da approvare</h2><div class="row" id="new"></div>
<script src="icons-data.js"></script>
<script>
const S=()=>+document.getElementById('s').value;
function card(ic){
  const w=ic.w*S(), d=ic.d*S();
  const div=document.createElement('div'); div.className='card';
  div.innerHTML='<div class="stage" style="--s:'+S()+';width:'+Math.max(w+16,120)+'px;height:'+(d+16)+'px">'+
    ic.svg.replace('<svg ','<svg style="width:'+w+'px;height:'+d+'px" ')+'</div>'+
    '<div class="meta"><b>'+ic.nome+'</b><span class="dim">'+ic.w+'×'+ic.d+' cm</span>'+
    (ic.categoria?' · '+ic.categoria:'')+(ic.nota?'<br>'+ic.nota:'')+
    (ic.fonte?'<br><i>misura: '+ic.fonte+'</i>':'')+'</div>';
  return div;
}
function render(){
  document.getElementById('sv').textContent=S().toFixed(1);
  for(const [id,list] of [['ref',ICON_DATA.reference],['new',ICON_DATA.samples]]){
    const el=document.getElementById(id); el.innerHTML='';
    list.forEach(ic=>el.appendChild(card(ic)));
  }
}
document.getElementById('s').oninput=render;
document.getElementById('dark').onchange=e=>{document.body.classList.toggle('dark',e.target.checked);};
document.getElementById('bn').onchange=e=>{document.body.classList.toggle('bn',e.target.checked);};
render();
</script></body></html>
```

- [ ] **Step 3: Generare i dati e verificare**

```bash
node tools/build-preview-data.mjs && node tools/validate-icons.mjs
```
Atteso: `ok: 5 campioni, 4 riferimenti` + 5 PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/build-preview-data.mjs preview/ && git commit -m "pagina confronto campioni vs esistenti (file://, scala uniforme, dark, B/N)"
```

---

### Task 10: Verifica visiva in Chrome + gate

**Files:** nessuno nuovo (eventuali fix alle icone → commit dedicati).

- [ ] **Step 1: Caricare i tool browser** — invocare la skill `claude-in-chrome`, poi ToolSearch unico per `tabs_context_mcp, navigate, computer, read_page, tabs_create_mcp`.
- [ ] **Step 2: Aprire** `file:///Users/simonecastellan/COWORK/STAGE%20PLOT/icon-prototype/preview/index.html` in una nuova scheda.
- [ ] **Step 3: Checklist visiva** (screenshot a scala 2.5, poi dark, poi B/N):
  - le 9 icone renderizzano (nessun riquadro vuoto/rotto);
  - scala coerente: timpano (88) > cassa (56) ≈ persona (55) > wedge (60×45); violoncello di riferimento più lungo del wedge;
  - i campioni non stonano accanto ad arpa/violino/tromba (materiali, densità di dettaglio);
  - leggibilità in B/N mantenuta.
- [ ] **Step 4: Fix di ciò che non passa** la checklist (iterare disegno→valida→ricarica; commit per fix).
- [ ] **Step 5: STOP — gate di approvazione.** Riepilogo a Simone con: percorso pagina, cosa guardare, decisioni da prendere (approva standard / correzioni per icona). **Nessuna produzione di serie prima del suo OK.**

---

## Fuori scope di questo piano

Serie ~40 icone, TAXONOMY.md, guidelines definitive, report finale: pianificati in un secondo piano **dopo** l'approvazione del campione (le decisioni del gate ne cambiano i dettagli).
