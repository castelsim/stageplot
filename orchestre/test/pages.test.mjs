/* Le pagine di Orchestre sono file statici su GitHub Pages: qui si controlla quello che il browser
   non dice — che ogni rotta sia una cartella vera, che la CSP sia stretta e senza inline, che i
   moduli importati esistano, che il deploy pubblichi la cartella. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROUTES = ["orchestre", "orchestre/login", "orchestre/admin", "orchestre/admin/impostazioni"];
const PUBLIC = new Set(["orchestre"]);

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
    if (PUBLIC.has(r)) assert.match(html, /name="robots" content="index,follow"/, r + " è pubblica");
    else assert.match(html, /name="robots" content="noindex,nofollow"/, r + " è privata");
    assert.match(html, /href="\/orchestre\/ui\.css"/, r);
    assert.match(html, /src="\/vendor\/supabase\.min\.js"/, r);
    const m = html.match(/type="module" src="(\/orchestre\/src\/pages\/[a-z]+\.js)"/);
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
