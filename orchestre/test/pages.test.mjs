/* Le pagine di Orchestre sono file statici su GitHub Pages: qui si controlla quello che il browser
   non dice — che ogni rotta sia una cartella vera, che la CSP sia stretta e senza inline, che i
   moduli importati esistano, che il deploy pubblichi la cartella. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
test("i workflow non hanno due punti sciolti nei nomi degli step (rompono lo YAML)", () => {
  /* «name: Lint (lo stesso del deploy: se fallisce...)» non e YAML valido: il secondo «:» apre una
     mappa dentro un valore. GitHub non esegue nemmeno il file e non lascia un log — mostra il run col
     percorso al posto del nome. Successo il 10/09, e la diagnosi costa piu del difetto. */
  const dir = join(root, ".github/workflows");
  const colpevoli = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
    readFileSync(join(dir, f), "utf8").split("\n").forEach((r, i) => {
      const m = r.match(/^\s*-?\s*name:\s*(.+)$/);
      if (!m) return;
      const v = m[1].trim();
      const quotato = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));
      if (!quotato && /:\s/.test(v)) colpevoli.push(f + ":" + (i + 1) + " → " + v.slice(0, 60));
    });
  }
  assert.deepEqual(colpevoli, [], "nomi di step con due punti non quotati");
});

test("il lint di Orchestre gira PRIMA del merge, non solo nel deploy", () => {
  /* Girava solo nel workflow di pubblicazione: una PR tutta verde poteva fermare il deploy dopo il
     merge, e il sito restava indietro senza che nessuno se ne accorgesse (successo il 10/09). */
  const rls = readFileSync(join(root, ".github/workflows/orchestre-rls.yml"), "utf8");
  assert.match(rls, /deno lint orchestre\/src/, "il workflow delle PR deve fare anche il lint");
  assert.match(rls, /denoland\/setup-deno/, "e deve installare Deno, o il passo muore con «command not found»");
});

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

/* L'email della richiesta parte subito da una funzione chiamata dalla pagina; il worker resta la rete di
   sicurezza. Le tre cose che non devono cambiare: la richiesta è di chi la fa spedire, la presa è atomica
   (il worker non spedisce due volte), e un invio fallito torna in coda invece di perdersi. */
test("l'invio immediato della richiesta è protetto e non salta la coda del worker", () => {
  const src = readFileSync(join(root, "supabase/functions/orc-request-notify/index.ts"), "utf8");
  assert.match(src, /row\.user_id !== user\.id/, "la richiesta dev'essere di chi chiama");
  assert.match(src, /"non tua", 403|error: "non tua" \}, 403/, "e se non lo è, 403");
  assert.match(src, /\.eq\("notification_status", "pending"\)/, "presa atomica: il worker non spedisce due volte");
  assert.match(src, /notification_status: ok \? "sent" : "pending"/, "un invio fallito torna in coda");
  assert.match(src, /serviceRoleKey\(Deno\.env\)/, "legge e scrive col servizio, non coi permessi del chiamante");
  const cfg = readFileSync(join(root, "supabase/config.toml"), "utf8");
  assert.match(cfg, /\[functions\.orc-request-notify\]\s*\n\s*(#[^\n]*\n\s*)*verify_jwt = true/, "la funzione chiede il JWT");
  /* e la pagina la chiama davvero, altrimenti resta il ritardo del cron */
  const pag = readFileSync(join(root, "orchestre/src/pages/richiedi.js"), "utf8");
  assert.match(pag, /api\.notifyNow\(/, "la pagina manda subito dopo aver creato");
  const wf = readFileSync(join(root, ".github/workflows/pages.yml"), "utf8");
  assert.match(wf, /orc-request-notify\/index\.ts/, "e la CI la controlla");
});

/* La fotografia serve a chi convoca: se si carica e poi non la vede nessuno, tanto vale non chiederla.
   Queste due schede sono i due posti dove lo staff guarda una persona in faccia. Non basta che il file
   nomini `signedUrl`: si guarda dentro la funzione che disegna il ritratto, e che qualcuno la chiami. */
test("la fotografia caricata dal musicista si vede anche dalle schede dello staff", () => {
  assert.match(readFileSync(join(root, "orchestre/src/pages/musicista.js"), "utf8"), /setPhoto|upFoto/, "il musicista la carica");
  for (const f of ["orchestre/src/pages/scheda.js", "orchestre/src/pages/candidatura-scheda.js"]) {
    const src = readFileSync(join(root, f), "utf8");
    const m = src.match(/async function ritratto\([^)]*\)\s*\{[\s\S]*?\n\}/);
    assert.ok(m, f + ": manca la funzione che disegna il ritratto");
    assert.match(m[0], /signedUrl\(/, f + ": il file sta nell'archivio privato, l'indirizzo va firmato");
    assert.match(m[0], /\.src = await/, f + ": e l'indirizzo firmato è quello che finisce nell'immagine");
    assert.match(m[0], /foto-prev/, f + ": con la classe del ritratto");
    assert.ok(/\n\s{0,4}ritratto\(/.test(src), f + ": definirla non basta, va chiamata quando si disegna la scheda");
  }
  assert.match(readFileSync(join(root, "orchestre/src/api/musicians.js"), "utf8"), /photo_path/,
    "la scheda del musicista non sa da sola che c'è una foto: sta sul profilo");
  assert.match(readFileSync(join(root, "orchestre/ui.css"), "utf8"), /\.foto-prev\{/, "e la classe deve esistere davvero");
});

/* Il link personale è la promessa «entri diretto»: se la pagina del musicista smette di leggere ?inv=,
   il link continua a funzionare come una candidatura qualsiasi e nessuno se ne accorge finché non
   arriva qualcuno a lamentarsi di essere rimasto in attesa di valutazione. */
test("la pagina del musicista raccoglie l'invito che arriva dal link", () => {
  const src = readFileSync(join(root, "orchestre/src/pages/musicista.js"), "utf8");
  assert.match(src, /["']inv["']/, "legge il parametro ?inv=");
  assert.match(src, /claimInvite/, "e lo presenta al database");
  assert.ok(/\n\s{0,6}await apriInvito\(/.test(src), "e lo fa all'apertura della pagina: definirla e non chiamarla è come non averla");
  const dom = readFileSync(join(root, "orchestre/src/domain/invites.js"), "utf8");
  assert.match(dom, /crypto\.subtle\.digest\(\s*["']SHA-256["']/, "al database va l'impronta, mai il segreto del link");
  const api = readFileSync(join(root, "orchestre/src/api/invites.js"), "utf8");
  assert.doesNotMatch(api, /token:\s*token\b/, "il token in chiaro non si manda mai al database");
});

/* La fotografia arriva dall'archivio privato di Supabase con un indirizzo firmato: se la CSP della pagina
   non lo ammette, il browser la blocca in silenzio e la foto non si vede da nessuna parte — successo il
   10/09, e se n'e accorta solo la prova nel browser. Dove non serve, `img-src` resta stretta. */
test("le pagine che mostrano una fotografia la lasciano passare nella CSP; le altre no", () => {
  const CON_FOTO = new Set(["orchestre/musicista", "orchestre/admin/musicisti/scheda", "orchestre/admin/candidature/scheda"]);
  for (const r of ROUTES) {
    const html = readFileSync(join(root, r, "index.html"), "utf8");
    const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
    const img = (csp.match(/img-src ([^;]+)/) || [])[1] || "";
    const con = (csp.match(/connect-src ([^;]+)/) || [])[1] || "";
    if (CON_FOTO.has(r)) {
      assert.ok(con.trim() && img.includes(con.trim()), r + ": qui si mostra una foto firmata, e img-src deve ammettere lo stesso archivio di connect-src");
    } else {
      assert.equal(img.trim(), "'self' data:", r + ": nessuna foto da mostrare, img-src resta stretta");
    }
  }
});

/* L'informativa e la pagina devono dire la stessa cosa: finche l'area del musicista non ha un pulsante
   per scaricare i dati, l'informativa non puo prometterlo (e viceversa). Il 10/09 il pulsante e stato
   tolto — un JSON grezzo non dice niente a un musicista, la copia si chiede scrivendo — e la frase
   dell'informativa sarebbe rimasta li a promettere una cosa che non c'e piu. */
test("l'informativa non promette quello che l'area del musicista non fa", () => {
  const pagina = readFileSync(join(root, "orchestre/src/pages/musicista.js"), "utf8");
  const info = readFileSync(join(root, "orchestre/privacy/index.html"), "utf8");
  const scarica = /Scarica i miei dati|exportMyData/.test(pagina);
  const promette = /[Pp]uoi scaricare i tuoi dati/.test(info);
  assert.equal(promette, scarica, scarica
    ? "l'area sa scaricare i dati ma l'informativa non lo dice"
    : "l'informativa promette un download che nell'area non esiste piu: la copia si chiede scrivendo");
});

/* La home non spiega piu il servizio: chiede «che cosa ti serve» e apre due porte. Chi gestisce
   l'orchestra e Simone, e entra dal pulsante in alto — il login lo riconosce da se (staff → area
   dell'organizzazione, altrimenti → area musicista). Se una di queste strade si rompe, dalla home
   non ci si arriva piu: nessuna pagina lo direbbe, la home resterebbe bella e muta. */
test("la home apre le due porte e lascia entrare chi gestisce dal pulsante in alto", () => {
  const html = readFileSync(join(root, "orchestre/index.html"), "utf8");
  for (const [chi, dove] of [["Sono un musicista", "/orchestre/candidatura/"], ["Cerco musicisti", "/orchestre/richiedi/"]]) {
    assert.ok(html.includes(chi), "manca la porta «" + chi + "»");
    assert.ok(html.includes('href="' + dove + '"'), "la porta «" + chi + "» non porta a " + dove);
  }
  assert.ok(/id="topLogin"/.test(html) && html.includes('href="/orchestre/login/"'), "il pulsante d'accesso in alto e l'unica porta di chi gestisce: deve esserci");
  assert.ok(html.includes('href="/app/"'), "e il rimando all'editor del palco");
  /* la riga che dice cosa facciamo e l'h1 della pagina: senza, la home e muta per lo screen reader
     e per chi la indicizza, per quanto piena di bottoni sia */
  const h1 = (html.match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1] || "";
  assert.ok(h1.trim().length > 25, "la home deve avere un titolo che dica cosa facciamo, non una domanda o niente");
  assert.doesNotMatch(h1, /Che cosa ti serve/, "la domanda e stata tolta il 10/09: al suo posto il mestiere in una riga");
  assert.doesNotMatch(html, /Gestisco l'orchestra/, "la porta dello staff non sta in home: si entra dal pulsante in alto");
  /* le pagine di destinazione devono esistere davvero */
  for (const r of ["orchestre/candidatura", "orchestre/richiedi", "orchestre/login"]) {
    assert.ok(existsSync(join(root, r, "index.html")), r + ": la home ci manda ma la pagina non c'e");
  }
  const js = readFileSync(join(root, "orchestre/src/pages/home.js"), "utf8");
  assert.match(js, /getElementById\("pMusicista"\)/, "con la sessione la porta del musicista va ripuntata: senza, chi e gia dentro rilegge la spiegazione");
  assert.match(js, /BASE \+ "\/musicista\/"/, "e deve portarlo nella sua area");
});

/* «Pesi del matching» era il 38% delle impostazioni: sedici caselle numeriche che regolavano un punteggio,
   con sopra una spiegazione che descriveva una scala inesistente («0-100, 50 = neutro» mentre i campi
   andavano da -40 a 40). Tolta il 10/09 su segnalazione di Simone — «non l'ho capita». Il motore continua
   con i valori di partenza e le proposte continuano a dire perche; nel database pesi e versioni restano.
   Se un giorno torna, che torni comprensibile: questo test lo ricorda. */
test("le impostazioni non chiedono di regolare i pesi del motore", () => {
  const p = readFileSync(join(root, "orchestre/src/pages/impostazioni.js"), "utf8");
  assert.doesNotMatch(p, /<h2>Pesi del matching<\/h2>|WEIGHT_LABELS|saveRuleset|loadWeights/, "le sedici caselle non tornano cosi come erano");
  /* l'etichetta del registro resta: se in passato dei pesi sono stati salvati, la storia lo deve dire */
  assert.match(p, /matching\.ruleset/, "il registro continua a saper leggere le azioni gia scritte");
  const api = readFileSync(join(root, "orchestre/src/api/matching.js"), "utf8");
  assert.match(api, /activeRuleset/, "i pesi si leggono ancora: il punteggio ne ha bisogno");
  assert.doesNotMatch(api, /export async function saveRuleset/, "ma dall'interfaccia non si scrivono");
});

/* Le suite RLS girano in parallelo e ognuna si crea organizzazioni e utenti con un «stamp» nel nome.
   Finche lo stamp era solo Date.now(), due suite avviate nello stesso millisecondo generavano lo STESSO
   nome: `rls-inviti` e `rls-invitations` creano entrambe lo slug «inv-a-i<ms>», e la seconda sbatteva sul
   vincolo di unicita portandosi giu otto test. Un rosso raro, che nessuno riesce a riprodurre a comando:
   il peggior tipo. Da qui in avanti lo stamp porta anche del caso. */
test("ogni suite RLS si prende nomi suoi, anche se parte insieme a un'altra", () => {
  const dir = join(root, "orchestre/test");
  for (const f of readdirSync(dir).filter((n) => n.startsWith("rls") && n.endsWith(".test.mjs"))) {
    const src = readFileSync(join(dir, f), "utf8");
    const riga = (src.match(/const stamp = .*/) || [])[0];
    if (!riga) continue;
    assert.match(riga, /Math\.random\(\)/, f + ": lo stamp e solo l'orologio — due suite nello stesso millisecondo si contendono lo stesso nome");
  }
});

/* Un href non è un testo: se il valore lo scrive un'altra persona, `javascript:` è una URL valida e
   il clic la esegue con i permessi di chi guarda. Le pagine di Orchestre non hanno 'unsafe-inline',
   quindi oggi non esegue — ma quella difesa sta in un altro file e può cambiare. Qui si pretende che
   ogni href nasca da una costante nostra, da encodeURIComponent, o da safeHttpUrl. */
test("nessun href riceve una stringa esterna senza passare da safeHttpUrl", () => {
  const src = join(root, "orchestre", "src");
  const files = [];
  (function walk(d) { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else if (n.endsWith(".js")) files.push(f); } })(src);
  assert.ok(files.length > 10, "i sorgenti si trovano");
  const AMMESSO = /^\s*(safeHttpUrl\(|BASE\b|["'`]|.*encodeURIComponent\()/;
  const colpevoli = [];
  for (const f of files) {
    const righe = readFileSync(f, "utf8").split("\n");
    righe.forEach((r, i) => {
      for (const m of r.matchAll(/(?<!location)\.href\s*=\s*([^;]+);/g)) {
        if (!AMMESSO.test(m[1])) colpevoli.push(f.slice(root.length + 1) + ":" + (i + 1) + " → " + m[1].trim());
      }
    });
  }
  assert.deepEqual(colpevoli, [], "href da valore non verificato");
});

/* Il consenso è una prova: `orc_consents` accetta INSERT e SELECT, mai UPDATE né DELETE (0051). Il
   client però revocava con un UPDATE, e dal 09/09 al 10/09 il pulsante «Non ricevere più richieste»
   ha risposto 403 — il diritto esisteva nell'interfaccia e non funzionava. Un test sulla policy non
   lo avrebbe visto: guardava il database, non il pulsante. */
test("la revoca del consenso passa dalla RPC, non da un UPDATE che il database rifiuta", () => {
  const api = readFileSync(join(root, "orchestre/src/api/applications.js"), "utf8");
  const i = api.indexOf("export async function revokeConsent(");
  assert.ok(i > -1, "la funzione c'è");
  const fn = api.slice(i, api.indexOf("\n}", i));
  assert.ok(fn.indexOf('rpc("orc_consent_revoke"') > -1, "chiama la RPC");
  assert.ok(!/from\("orc_consents"\)[\s\S]*\.update\(/.test(fn), "e non prova a scrivere la riga da sé");
  assert.ok(!/from\("orc_consents"\)[\s\S]*\.delete\(/.test(fn), "né a cancellarla");
});

/* Un modulo con una parentesi in meno non lo prende nessun test di struttura: il file si legge benissimo
   come testo. Lo vede solo il browser, che smette di eseguire e lascia la pagina bianca — successo il
   10/09 tagliando un vecchio passo dell'onboarding. Qui si prova a IMPORTARLO davvero: in Node mancano
   document e le dipendenze, quindi un errore ci sta — ma un SyntaxError no. */
test("ogni modulo di Orchestre si parsa: niente parentesi perse", async () => {
  const dirs = ["orchestre/src", "orchestre/src/pages", "orchestre/src/api", "orchestre/src/domain"];
  const rotti = [];
  for (const d of dirs) {
    for (const f of readdirSync(join(root, d)).filter((n) => n.endsWith(".js"))) {
      try {
        await import(pathToFileURL(join(root, d, f)).href);
      } catch (e) {
        if (e instanceof SyntaxError) rotti.push(d + "/" + f + ": " + e.message);
      }
    }
  }
  assert.deepEqual(rotti, [], "moduli che non si parsano");
});

/* La candidatura si manda dal PRIMO passo: i sei campi obbligatori (nome, cognome, email, telefono,
   citta, strumento) piu il consenso stanno tutti li. Prima erano sparsi su quattro passi diversi e per
   candidarsi bisognava attraversarli tutti — chi si fermava a meta non risultava candidato da nessuna
   parte. Se qualcuno li rispande, questo test lo dice. */
test("ci si candida dal primo passo, e il browser compila quello che sa", () => {
  const src = readFileSync(join(root, "orchestre/src/pages/musicista.js"), "utf8");
  const i = src.indexOf('if (key === "candidatura")');
  const j = src.indexOf('} else if (key === "strumenti")');
  assert.ok(i > 0 && j > i, "il primo passo si chiama «candidatura»");
  const passo = src.slice(i, j);
  for (const campo of ["first_name", "last_name", "email", "phone", "city", "strPrinc"]) {
    assert.ok(passo.includes(campo), "il primo passo deve chiedere " + campo);
  }
  assert.match(passo, /consent/, "e il consenso, senza il quale la candidatura non parte");
  assert.match(passo, /bloccoInvio\(/, "e deve poter mandare da li, non alla fine di sette passi");
  /* gli autocomplete: il telefono e la citta li mette il browser, non le dita su un telefono */
  for (const a of ["given-name", "family-name", "tel", "address-level2"]) {
    assert.ok(passo.includes('autocomplete: "' + a + '"'), "manca l'autocomplete " + a + " (attenzione: «tel» compare anche in type)");
  }
  /* il livello dello strumento va da 1 a 5 (vincolo del database), non sulla scala 0-3 delle competenze */
  assert.doesNotMatch(passo, /lvl\("livello"/, "«lvl» e la scala 0-3 delle competenze: il livello sullo strumento e 1-5");
  /* chi ha gia mandato torna qui per correggere il telefono, non per candidarsi due volte: provato nel
     browser, col codice di prima partiva una seconda candidatura senza volerlo */
  const invio = src.slice(src.indexOf("function bloccoInvio"), src.indexOf("async function manda("));
  const iInviate = invio.indexOf("if (inviate.length");
  assert.ok(iInviate > 0, "il caso «ha gia mandato» deve venire prima di riproporre l'invio");
  assert.ok(invio.indexOf("Salva le modifiche") > iInviate, "e li il pulsante grande deve salvare, non mandare");
  assert.ok(invio.indexOf("Salva le modifiche") < invio.indexOf("Manda la candidatura a"), "«Salva» prima di «Manda»: e il caso normale di chi torna");
});
