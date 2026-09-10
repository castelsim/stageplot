/* Le pagine di Orchestre sono file statici su GitHub Pages: qui si controlla quello che il browser
   non dice — che ogni rotta sia una cartella vera, che la CSP sia stretta e senza inline, che i
   moduli importati esistano, che il deploy pubblichi la cartella. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROUTES = ["orchestre", "orchestre/login", "orchestre/admin", "orchestre/admin/impostazioni",
  "orchestre/admin/musicisti", "orchestre/admin/musicisti/scheda", "orchestre/admin/musicisti/importa",
  "orchestre/admin/produzioni", "orchestre/admin/produzioni/scheda", "orchestre/rispondi",
  "orchestre/musicista", "orchestre/candidatura", "orchestre/privacy", "orchestre/admin/candidature", "orchestre/admin/candidature/scheda",
  "orchestre/richiedi", "orchestre/admin/richieste"];
const NO_SB = new Set(["orchestre/rispondi"]);   /* parla solo con la Edge Function: niente supabase-js */
/* Nessuna pagina di Orchestre va su Google finché è un cantiere (decisione di Simone, 06/09).
   La home è l'unica che un giorno sarà pubblica: `noindex,follow` come /app/ — fuori dalla SERP,
   ma i link a /privacy/ e /termini/, che pubbliche lo sono davvero, restano seguibili. Le altre
   sono login e area riservata: `noindex,nofollow`. Quando Orchestre apre, questa riga cambia
   INSIEME al sitemap, o si torna a una pagina indicizzabile che Google non sa di dover cercare. */
const CANTIERE = new Set(["orchestre", "orchestre/privacy"]);   /* la privacy: noindex,follow come la home, coi link seguibili */

test("ogni rotta è una cartella con index.html (GitHub Pages non riscrive nulla)", () => {
  for (const r of ROUTES) assert.ok(existsSync(join(root, r, "index.html")), r + "/index.html");
});

test("le shell: CSP senza inline, robots coerente, ui.css, supabase self-hosted, modulo esistente", () => {
  for (const r of ROUTES) {
    const html = readFileSync(join(root, r, "index.html"), "utf8");
    assert.match(html, /^<!doctype html>/i, r + ": doctype in testa (niente quirks mode)");
    assert.match(html, /Content-Security-Policy/, r);
    assert.doesNotMatch(html, /script-src[^"]*unsafe-inline/, r + ": niente unsafe-inline negli script");
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, r + ": nessuno script inline");
    assert.doesNotMatch(html, /\sstyle="/, r + ": nessuno stile inline");
    assert.doesNotMatch(html, /\son[a-z]+="/, r + ": nessun handler inline");
    if (CANTIERE.has(r)) assert.match(html, /name="robots" content="noindex,follow"/, r + ": cantiere, fuori dalla SERP ma coi link seguibili");
    else assert.match(html, /name="robots" content="noindex,nofollow"/, r + " è privata");
    assert.doesNotMatch(html, /name="robots" content="index/, r + ": nessuna pagina di Orchestre va indicizzata finché è un cantiere");
    assert.match(html, /href="\/orchestre\/ui\.css"/, r);
    if (NO_SB.has(r)) assert.doesNotMatch(html, /supabase\.min\.js/, r + ": la pagina del musicista non carica supabase-js");
    else assert.match(html, /src="\/vendor\/supabase\.min\.js"/, r);
    const m = html.match(/type="module" src="(\/orchestre\/src\/pages\/[a-z-]+\.js)"/);
    assert.ok(m, r + ": modulo di pagina");
    assert.ok(existsSync(join(root, m[1].slice(1))), m[1]);
    assert.match(html, /viewport-fit=cover/, r);
    assert.match(html, /frame-ancestors 'none'/, r);
    assert.match(html, /connect-src https:\/\/vsodplqkuvnsdiikvmjb\.supabase\.co/, r + ": parla solo con Supabase");
    assert.match(html, /<html lang="it">/, r);
    assert.match(html, /<main[^>]*id="app"/, r + ": il modulo disegna dentro #app");
  }
});

test("i moduli importano solo file che esistono, e nessuno importa il monolite dell'editor", () => {
  const src = join(root, "orchestre/src");
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  const files = walk(src);
  assert.ok(files.length >= 6, "ci sono i moduli");
  for (const f of files) {
    const code = readFileSync(f, "utf8");
    for (const m of code.matchAll(/from "(\.[^"]+)"/g)) assert.ok(existsSync(join(dirname(f), m[1])), f + " → " + m[1]);
    assert.doesNotMatch(code, /app\.js|icons\.js|index\.template/, f + ": non dipende dall'editor");
    assert.doesNotMatch(code, /service_role|SERVICE_ROLE/, f + ": nessuna chiave privilegiata nel client");
  }
});

test("il deploy pubblica orchestre e la CI la prova", () => {
  const wf = readFileSync(join(root, ".github/workflows/pages.yml"), "utf8");
  const allow = wf.slice(wf.indexOf("rsync -a"), wf.indexOf("./_site/"));
  assert.match(allow, /\borchestre\b/);
  assert.match(wf, /node --test orchestre\/test/);
  assert.match(wf, /deno lint orchestre\/src/);
});

test("le pagine private non entrano in sitemap; la home di Orchestre non ancora", () => {
  const sm = readFileSync(join(root, "sitemap.xml"), "utf8");
  assert.doesNotMatch(sm, /orchestre\/(login|admin)/);
});

test("config.js parla col Supabase di produzione: la anon key è quella dell'editor, non quella locale", () => {
  const cfg = readFileSync(join(root, "orchestre/src/config.js"), "utf8");
  const tpl = readFileSync(join(root, "index.template.html"), "utf8");
  const key = cfg.match(/export const SB_ANON = "([^"]+)"/)[1];
  const editorKey = tpl.match(/var SUPABASE_ANON_KEY = "([^"]+)"/)[1];
  const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
  assert.equal(payload.iss, "supabase", "non la chiave demo del Supabase locale (10/09: il login era rotto dal lotto 4)");
  assert.equal(payload.ref, "vsodplqkuvnsdiikvmjb");
  assert.equal(payload.role, "anon");
  assert.equal(key, editorKey, "stessa chiave dell'editor");
  assert.match(cfg, /SB_URL = "https:\/\/vsodplqkuvnsdiikvmjb\.supabase\.co"/);
});

/* Le regole di sicurezza si provano solo con un Postgres vero: se nessuno fa partire il locale, le 8
   suite `rls*.test.mjs` si SALTANO in silenzio e il modello di sicurezza è verde per assenza. È quello
   che succedeva in CI fino al 10/09/2026: 43 test su 87 non giravano mai. Questo test pretende che il
   workflow che le esegue esista, che renda obbligatorio il locale (ORC_RLS) e che le copra TUTTE. */
test("le suite RLS girano davvero in CI, e il workflow le copre tutte", () => {
  const p = join(root, ".github/workflows/orchestre-rls.yml");
  assert.ok(existsSync(p), "manca .github/workflows/orchestre-rls.yml: senza, le RLS non si provano mai");
  const wf = readFileSync(p, "utf8");
  assert.match(wf, /supabase start/, "serve un Supabase vero, non lo skip");
  assert.match(wf, /ORC_RLS: "1"/, "senza ORC_RLS le suite si saltano invece di fallire");
  const glob = wf.match(/node --test (\S*rls\S*)/);
  assert.ok(glob, "il workflow deve eseguire le suite RLS");
  const suites = readdirSync(join(root, "orchestre/test")).filter((f) => /^rls.*\.test\.mjs$/.test(f));
  assert.ok(suites.length >= 8, "trovate " + suites.length + " suite RLS");
  const re = new RegExp("^" + glob[1].replace("orchestre/test/", "").replace(/\*/g, ".*") + "$");
  for (const s of suites) assert.match(s, re, s + " non e coperta dal comando del workflow");
  assert.match(wf, /paths:[\s\S]*supabase\/migrations/, "una migrazione che cambia le policy deve far girare i test");
});

/* Un import con un nome sbagliato non rompe nessun test ma lascia la pagina BIANCA nel browser:
   il modulo non fa il parse e l'errore resta in console. Qui ogni simbolo importato da un modulo
   interno deve esistere davvero fra i suoi export. */
test("ogni simbolo importato dai moduli di Orchestre esiste davvero", () => {
  const dir = join(root, "orchestre/src");
  const files = [];
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const f = join(d, e);
      if (statSync(f).isDirectory()) walk(f);
      else if (e.endsWith(".js")) files.push(f);
    }
  })(dir);
  assert.ok(files.length >= 15, "moduli trovati: " + files.length);
  const exportsOf = (file) => {
    const src = readFileSync(file, "utf8");
    const names = new Set();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
      for (const part of m[1].split(",")) {
        const as = part.trim().split(/\s+as\s+/);
        if (as.length) names.add((as[1] || as[0]).trim());
      }
    }
    return names;
  };
  const cache = new Map();
  let checked = 0;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"(\.[^"]+)"/g)) {
      const target = join(dirname(file), m[2]);
      assert.ok(existsSync(target), file.replace(root, "") + " importa un file che non esiste: " + m[2]);
      if (!cache.has(target)) cache.set(target, exportsOf(target));
      const have = cache.get(target);
      for (const raw of m[1].split(",")) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        checked++;
        assert.ok(have.has(name), file.replace(root, "") + ' importa "' + name + '" da ' + m[2] + ", che non lo esporta");
      }
    }
  }
  assert.ok(checked > 60, "simboli controllati: " + checked);
});

/* Un dialogo costruito con la sola classe `.modal` non è una finestra: in `ui.css` solo `.modal-ov` è
   `position:fixed` con lo sfondo. Senza, la scatola finisce in fondo alla pagina, sotto la piega, e il
   bottone che l'ha aperta sembra rotto — è quello che faceva «Ricollega…» (collaudo 10/09/2026). */
test("ogni finestra di dialogo ha il suo sfondo, altrimenti non si vede", () => {
  const css = readFileSync(join(root, "orchestre/ui.css"), "utf8");
  assert.match(css, /\.modal-ov\{[^}]*position:fixed/, "è .modal-ov a fare la finestra");
  const dir = join(root, "orchestre/src");
  const files = [];
  (function walk(d) { for (const e of readdirSync(d)) { const f = join(d, e); if (statSync(f).isDirectory()) walk(f); else if (e.endsWith(".js")) files.push(f); } })(dir);
  let dialoghi = 0;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<div class="modal([^"]*)"/g)) {
      dialoghi++;
      const cls = m[1];
      /* la scatola interna va bene: quello che conta è che la riga PRIMA apra un .modal-ov */
      const i = m.index;
      const prima = src.slice(Math.max(0, i - 400), i);
      assert.ok(cls.includes("-ov") || prima.includes('class="modal-ov'),
        f.replace(root, "") + ': un dialogo senza .modal-ov non si vede (vicino a "' + src.slice(i, i + 90).replace(/\n/g, " ") + '")');
    }
  }
  assert.ok(dialoghi >= 6, "dialoghi controllati: " + dialoghi);
});

/* Il query builder di supabase-js si puo' attendere con await ma NON e' una Promise: non ha `.catch`.
   Attaccarglielo lancia «.catch is not a function» a tempo di esecuzione, dove nessun test di struttura
   arriva — a me e' successo in produzione sulla dashboard (collaudo 10/09/2026). */
test("nessun .catch attaccato a una catena del query builder di Supabase (non e una Promise)", () => {
  const dir = join(root, "orchestre/src");
  const files = [];
  (function walk(d) { for (const e of readdirSync(d)) { const f = join(d, e); if (statSync(f).isDirectory()) walk(f); else if (e.endsWith(".js")) files.push(f); } })(dir);
  const re = /sb\s*\.\s*from\([^;]{0,300}?\.catch\(/g;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const m = src.match(re);
    assert.equal(m, null, f.replace(root, "") + ": «" + (m && m[0].slice(0, 80)) + "» — il builder non ha .catch, serve try/catch attorno all'await");
  }
  /* e le RPC: sb.rpc(...).catch(...) ha lo stesso difetto */
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const m = src.match(/sb\s*\.\s*rpc\([^;]{0,300}?\.catch\(/g);
    assert.equal(m, null, f.replace(root, "") + ": «" + (m && m[0].slice(0, 80)) + "»");
  }
});
