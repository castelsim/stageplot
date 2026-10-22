/* Programma di sala, versione GRAFICA (0083) — prove pure (nessuna rete, nessun browser). Dati inventati. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);
const P = req(join(root, "programma/prg.js"));

class Nodo {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.className = ""; this.testo = null; this.props = {};
    this.style = { setProperty: (k, v) => { this.props[k] = v; } }; }
  appendChild(n) { this.children.push(n); return n; }
  setAttribute(k, v) { this.attrs[k] = v; }
  get textContent() { return this.testo !== null ? this.testo : this.children.map((c) => c.textContent).join(""); }
}
const doc = { createElement: (t) => new Nodo(t.toUpperCase()), createTextNode: (s) => { const n = new Nodo("#text"); n.testo = String(s); return n; } };
const tutti = (n, f = []) => { f.push(n); n.children.forEach((c) => tutti(c, f)); return f; };
const tag = (n, t) => tutti(n).filter((x) => x.tagName === t.toUpperCase());
const ser = (n) => n.tagName === "#text" ? JSON.stringify(n.testo) : n.tagName + (n.className ? "." + n.className.replace(/ /g, ".") : "")
  + Object.entries(n.attrs).map(([k, v]) => "[" + k + "=" + v + "]").join("") + "(" + n.children.map(ser).join(",") + ")";

const B = P.IMG_PROD, HEX = "0123456789abcdef0123456789abcdef", UID = "11111111-2222-3333-4444-555555555555";
const img = (n = 1, est = "webp") => `${B}${UID}/${HEX.slice(0, 31)}${n}.${est}`;
const LOCALE = "http://127.0.0.1:54321/storage/v1/object/public/prg-immagini/" + UID + "/" + HEX + ".png";

/* il documento v1 di prima della versione grafica (identico a ESEMPIO di programma-di-sala.test.mjs) e la sua resa di ALLORA,
   presa dal codice di origin/main d741b81 prima di toccare prg.js */
const V1 = {
  v: 1,
  intestazione: { sopratitolo: "Stagione di prova", titolo: "Concerto", titolo_corsivo: "d'esempio", righe: ["Orchestra di prova", "Direttore: Nome Inventato"], quando: "Sabato, ore 21" },
  sezioni: [
    { tipo: "interpreti", etichetta: "In scena", titolo: "Gli interpreti", persone: [{ nome: "Prima Persona", ruolo: "voce" }, { nome: "Seconda Persona", ruolo: "pianoforte" }], nota: "Una nota." },
    { tipo: "brani", etichetta: "Programma", titolo: "I brani", voci: [{ titolo: "Primo brano", dettaglio: "per orchestra" }, { titolo: "Secondo brano", brani: "a) uno\nb) due", nota: "Dalla suite" }] },
    { tipo: "testo", etichetta: "Note", titolo: "Due parole", paragrafi: ["Primo paragrafo.", "Secondo paragrafo."] },
    { tipo: "sconosciuto", titolo: "x" },
  ],
  link: [{ testo: "Il sito", url: "https://example.invalid/sito" }],
};
const ISTANTANEA_V1 = "DIV.prg-doc(HEADER.prg-testa(P.prg-sopra(\"Stagione di prova\"),H1.prg-titolo(\"Concerto\",\" \",EM(\"d'esempio\")),P.prg-riga(\"Orchestra di prova\"),P.prg-riga(\"Direttore: Nome Inventato\"),P.prg-quando(\"Sabato, ore 21\")),SECTION.prg-sez.prg-sez-interpreti(P.prg-etichetta(\"In scena\"),H2.prg-sez-titolo(\"Gli interpreti\"),UL.prg-persone(LI(SPAN.prg-nome(\"Prima Persona\"),SPAN.prg-ruolo(\"voce\")),LI(SPAN.prg-nome(\"Seconda Persona\"),SPAN.prg-ruolo(\"pianoforte\"))),P.prg-nota(\"Una nota.\")),SECTION.prg-sez.prg-sez-brani(P.prg-etichetta(\"Programma\"),H2.prg-sez-titolo(\"I brani\"),OL.prg-voci(LI(EM.prg-voce-titolo(\"Primo brano\"),SPAN.prg-dettaglio(\"per orchestra\")),LI(EM.prg-voce-titolo(\"Secondo brano\"),P.prg-brani(\"a) uno\"),P.prg-brani(\"b) due\"),P.prg-nota(\"Dalla suite\")))),SECTION.prg-sez.prg-sez-testo(P.prg-etichetta(\"Note\"),H2.prg-sez-titolo(\"Due parole\"),P.prg-par(\"Primo paragrafo.\"),P.prg-par(\"Secondo paragrafo.\")),NAV.prg-link(UL(LI(A[href=https://example.invalid/sito][rel=noopener noreferrer][target=_blank](\"Il sito\")))))";

const GRAFICO = {
  v: 1,
  tema: { stile: "notte", accento: "#FF8A1F", fondo: "#0a1830", fondo2: "#16345f", testo: "#f4f6fb" },
  copertina: { url: img(1), alt: "Copertina di prova" },
  intestazione: { sopratitolo: "Stagione di prova", titolo: "Serata", titolo_corsivo: "d'esempio", logo: { url: img(2, "png"), alt: "Logo di prova" }, nastro: "Ingresso libero",
    data: { giorno: "Sabato", numero: "07", mese: "Novembre 2026", ora: "Ore 19.00" }, luogo: { nome: "Teatro di prova", indirizzo: "Via Inventata 1" }, righe: ["Orchestra di prova"] },
  sezioni: [
    { tipo: "immagine", etichetta: "Il manifesto", titolo: "Locandina", url: img(3, "jpg"), alt: "Manifesto di prova", didascalia: "Una didascalia" },
    { tipo: "galleria", etichetta: "Foto", titolo: "Galleria", immagini: [{ url: img(4), alt: "Prima foto", didascalia: "Uno" }, { url: img(5, "jpg"), alt: "Seconda foto" }, { url: "https://example.invalid/x.png", alt: "esterna" }] },
  ],
};

test("un documento v1 senza campi nuovi: DOM identico a quello di prima (istantanea) e validazione senza chiavi nuove", () => {
  assert.equal(ser(P.costruisci(V1, doc)), ISTANTANEA_V1);
  const v = P.validaDati(V1);
  assert.deepEqual(Object.keys(v).sort(), ["intestazione", "link", "sezioni", "v"]);
  assert.deepEqual(Object.keys(v.intestazione).sort(), ["righe", "quando", "sopratitolo", "titolo", "titolo_corsivo"].sort());
  const r = P.costruisci(V1, doc);
  assert.equal(tag(r, "img").length, 0);
  assert.deepEqual(r.attrs, {}, "nessun data-stile");
  assert.deepEqual(r.props, {}, "nessuna variabile di colore");
});

test("URL immagine: solo il bucket prg-immagini (percorso <uid>/<32 hex>.webp|jpg|png); ogni altro è scartato", () => {
  const ok = (u, locale = false) => P.validaDati({ v: 1, copertina: { url: u } }, { locale }).copertina !== undefined;
  for (const e of ["webp", "jpg", "png"]) assert.ok(ok(img(1, e)), e);
  const male = [
    "https://example.invalid/a.png", "http://vsodplqkuvnsdiikvmjb.supabase.co/storage/v1/object/public/prg-immagini/" + UID + "/" + HEX + ".webp",
    img(1).replace("prg-immagini", "bgl-locandine"), img(1).replace("/public/", "/sign/"), img(1) + "?x=1", img(1) + "#a", img(1, "svg"), img(1, "gif"),
    img(1).replace(UID, "../x"), img(1).replace(UID + "/", ""), B + UID + "/nome-scelto.webp", B + UID + "/" + HEX + "0.webp",
    "https://vsodplqkuvnsdiikvmjb.supabase.co.evil.example/storage/v1/object/public/prg-immagini/" + UID + "/" + HEX + ".webp",
    "https://vsodplqkuvnsdiikvmjb.supabase.co@evil.example/storage/v1/object/public/prg-immagini/" + UID + "/" + HEX + ".webp",
    "data:image/png;base64,AAAA", "javascript:alert(1)", "//example.invalid/a.png", " " + img(1), B + UID + "/" + HEX + ".webp/..", B, "", 5, null, {}, [], undefined,
  ];
  for (const u of male) assert.equal(ok(u), false, String(u));
  assert.equal(ok(LOCALE, false), false, "lo stack locale vale solo da localhost");
  assert.equal(ok(LOCALE, true), true, "da localhost sì");
  assert.equal(ok("http://127.0.0.1:54321/storage/v1/object/public/bgl-locandine/" + UID + "/" + HEX + ".png", true), false, "ma solo il bucket giusto");
  assert.equal(P.validaDati({ v: 1, copertina: "x" }).copertina, undefined);
});

test("le immagini scartate: sezione immagine senza immagine valida sparisce, galleria tiene solo le valide e sparisce se vuota", () => {
  const v = P.validaDati({ v: 1, sezioni: [
    { tipo: "immagine", titolo: "A", url: "https://example.invalid/a.png" },
    { tipo: "immagine", titolo: "B", url: img(1) },
    { tipo: "galleria", titolo: "C", immagini: [{ url: "http://x.invalid/a.png" }, { url: img(2) }, null, 3] },
    { tipo: "galleria", titolo: "D", immagini: [{ url: "http://x.invalid/a.png" }] },
    { tipo: "galleria", titolo: "E", immagini: "no" }] });
  assert.deepEqual(v.sezioni.map((s) => s.titolo), ["B", "C"]);
  assert.equal(v.sezioni[1].immagini.length, 1);
  const logoKo = P.validaDati({ v: 1, intestazione: { titolo: "T", logo: { url: "https://example.invalid/l.png", alt: "x" } } });
  assert.equal(logoKo.intestazione.logo, undefined);
  const lunga = P.validaDati({ v: 1, sezioni: [{ tipo: "galleria", immagini: Array.from({ length: 100 }, () => ({ url: img(1) })) }] });
  assert.equal(lunga.sezioni[0].immagini.length, 30, "tetto di 30 immagini per galleria");
});

test("colori del tema: solo #RRGGBB (minuscolo in uscita), gli altri ignorati; stile sconosciuto = carta", () => {
  const t = (x) => P.validaDati({ v: 1, tema: x }).tema;
  assert.deepEqual(t({ stile: "notte", accento: "#FF8A1F", fondo: "#0a1830", fondo2: "#16345F", testo: "#F4F6FB" }),
    { stile: "notte", accento: "#ff8a1f", fondo: "#0a1830", fondo2: "#16345f", testo: "#f4f6fb" });
  assert.deepEqual(t({}), { stile: "carta" });
  assert.deepEqual(t({ stile: "neon" }), { stile: "carta" });
  for (const c of ["#fff", "#ff8a1", "#ff8a1fa", "ff8a1f", "red", "rgb(1,2,3)", "#gggggg", "#ff8a1f;background:url(x)", "url(x)", " #ff8a1f", 5, null, {}, []])
    assert.deepEqual(t({ accento: c, fondo: c, fondo2: c, testo: c }), { stile: "carta" }, String(c));
  assert.equal(P.validaDati({ v: 1, tema: "notte" }).tema, undefined);
  assert.equal(P.validaDati({ v: 1, tema: [] }).tema, undefined);
});

test("proprietaTema: nulla senza colori; con colori le variabili del CSS; testo sopra l'accento sempre leggibile (WCAG AA)", () => {
  assert.deepEqual(P.proprietaTema(P.validaDati({ v: 1, tema: { stile: "notte" } }).tema), [], "i colori di serie stanno nel CSS");
  const m = Object.fromEntries(P.proprietaTema(P.validaDati(GRAFICO).tema));
  assert.deepEqual([m["--accent"], m["--fondo"], m["--fondo2"], m["--text"]], ["#ff8a1f", "#0a1830", "#16345f", "#f4f6fb"]);
  assert.ok(m["--text-2"] && m["--border"] && m["--surface"]);
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((n) => (n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const rapporto = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const acc of ["#ff8a1f", "#ffffff", "#000000", "#0b7a70", "#ffd400", "#c0392b", "#3366ff", "#222222"])
    assert.ok(rapporto(acc, P.suColore(acc)) >= 4.5, acc + " → " + P.suColore(acc));
  /* i colori del notte di serie (CSS) hanno contrasto AA */
  const css = readFileSync(join(root, "programma/prg.css"), "utf8");
  assert.match(css, /--accent:#ff8a1f/);
  for (const [a, b] of [["#f4f6fb", "#0a1830"], ["#f4f6fb", "#16345f"], ["#cbd3e5", "#16345f"], ["#adb8d0", "#16345f"], ["#ff8a1f", "#16345f"], ["#ff8a1f", "#0a1830"], ["#0b1220", "#ff8a1f"]])
    assert.ok(rapporto(a, b) >= 4.5, a + " su " + b + " = " + rapporto(a, b).toFixed(2));
});

test("costruisci: logo al posto del titolo visibile (h1 nascosto), nastro, riquadro data, luogo, copertina", () => {
  const r = P.costruisci(GRAFICO, doc);
  assert.equal(r.attrs["data-stile"], "notte");
  assert.equal(r.props["--accent"], "#ff8a1f", "variabili via style.setProperty (CSP senza 'unsafe-inline')");
  assert.ok(tutti(r).every((n) => !("style" in n.attrs)), "mai un attributo style");
  assert.equal(r.children[0].className, "prg-copertina", "la copertina è la prima cosa");
  const h1 = tag(r, "h1")[0];
  assert.deepEqual([h1.className, h1.textContent], ["prg-titolo prg-nascosto", "Serata d'esempio"], "il testo resta, nascosto alla vista");
  const logo = tag(tag(r, "p").find((p) => p.className === "prg-logo"), "img")[0];
  assert.equal(logo.attrs.src, img(2, "png"));
  assert.equal(logo.attrs.alt, "", "con il titolo nell'h1 il logo è decorativo (niente doppia lettura)");
  const senzaTesto = P.costruisci({ v: 1, intestazione: { logo: { url: img(2), alt: "Logo di prova" } } }, doc);
  assert.equal(tag(senzaTesto, "img").find((i) => i.className === "prg-img").attrs.alt, "Logo di prova");
  assert.equal(tag(senzaTesto, "h1").length, 0);
  const nastro = tutti(r).find((n) => n.className === "prg-nastro");
  assert.equal(nastro.textContent, "Ingresso libero");
  const data = tutti(r).find((n) => n.className === "prg-data");
  assert.deepEqual(data.children.map((c) => [c.className, c.textContent]), [["prg-data-giorno", "Sabato"], ["prg-data-numero", "07"], ["prg-data-mese", "Novembre 2026"], ["prg-data-ora", "Ore 19.00"]]);
  assert.deepEqual(tutti(r).filter((n) => /^prg-luogo-/.test(n.className)).map((n) => n.textContent), ["Teatro di prova", "Via Inventata 1"]);
});

test("costruisci: immagine e galleria con alt, caricamento pigro, dimensioni; la galleria si raggiunge da tastiera", () => {
  const r = P.costruisci(GRAFICO, doc);
  const sez = tag(r, "section");
  const fig = tag(sez[0], "figure")[0];
  assert.equal(tag(fig, "figcaption")[0].textContent, "Una didascalia");
  const g = tag(sez[1], "ul")[0];
  assert.equal(g.className, "prg-galleria");
  assert.equal(g.attrs.tabindex, "0");
  const fotoG = tag(g, "img");
  assert.equal(fotoG.length, 2, "quella fuori dal bucket è scartata");
  assert.deepEqual(fotoG.map((i) => i.attrs.alt), ["Prima foto", "Seconda foto"]);
  for (const i of [...fotoG, tag(sez[0], "img")[0]]) {
    assert.equal(i.attrs.loading, "lazy"); assert.equal(i.attrs.decoding, "async");
    assert.ok(+i.attrs.width > 0 && +i.attrs.height > 0, "width/height: la pagina non salta");
    assert.equal(i.attrs.referrerpolicy, "no-referrer");
  }
  const cop = tag(r.children[0], "img")[0];
  assert.equal(cop.attrs.loading, undefined, "la copertina è la prima schermata: non pigra");
  assert.equal(cop.attrs.alt, "Copertina di prova");
  const senzaAlt = P.costruisci({ v: 1, sezioni: [{ tipo: "galleria", immagini: [{ url: img(1) }] }] }, doc);
  assert.equal(tag(senzaAlt, "img")[0].attrs.alt, "", "alt sempre presente (vuoto = decorativa)");
});

test("ESCAPING dei campi nuovi: markup nei testi resta testo; nessun elemento o attributo non previsto", () => {
  const X = '<img src=x onerror="alert(1)">';
  const sporco = { v: 1, tema: { stile: "notte" }, copertina: { url: img(1), alt: X },
    intestazione: { titolo: X, nastro: X, logo: { url: img(2), alt: X }, data: { giorno: X, numero: X, mese: X, ora: X }, luogo: { nome: X, indirizzo: X } },
    sezioni: [{ tipo: "immagine", etichetta: X, titolo: X, url: img(3), alt: X, didascalia: X },
      { tipo: "galleria", etichetta: X, titolo: X, immagini: [{ url: img(4), alt: X, didascalia: X }] }] };
  const r = P.costruisci(sporco, doc);
  const ammessi = new Set(["DIV", "HEADER", "P", "H1", "H2", "EM", "SECTION", "UL", "LI", "SPAN", "FIGURE", "FIGCAPTION", "IMG", "#text"]);
  const nodi = tutti(r);
  assert.ok(nodi.every((n) => ammessi.has(n.tagName)), [...new Set(nodi.map((n) => n.tagName))].join());
  assert.equal(tag(r, "img").length, 4, "solo i nostri 4 <img>, da URL del bucket");
  assert.ok(tag(r, "img").every((i) => i.attrs.src.startsWith(B)));
  assert.ok(nodi.every((n) => Object.keys(n.attrs).every((k) => ["data-stile", "src", "alt", "width", "height", "decoding", "loading", "referrerpolicy", "tabindex", "role", "aria-label"].includes(k))));
  assert.ok(nodi.filter((n) => n.tagName === "#text" && n.testo.includes(X)).length >= 11, "il markup è testo");
});

test("nessun innerHTML nel codice, nessun carattere o servizio esterno: CSP, font, @import, url() del CSS", () => {
  const js = readFileSync(join(root, "programma/prg.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|setAttribute\(\s*["']style["']/);
  const html = readFileSync(join(root, "programma/index.html"), "utf8");
  assert.match(html, /img-src 'self' data: https:\/\/vsodplqkuvnsdiikvmjb\.supabase\.co http:\/\/127\.0\.0\.1:54321;/);
  assert.match(html, /style-src 'self';/);
  assert.doesNotMatch(html, /unsafe-inline|fonts\.googleapis|<link[^>]+(?:preconnect|dns-prefetch)/);
  const css = readFileSync(join(root, "programma/prg.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /@import|@font-face|url\(/);
  assert.match(css, /"Avenir Next","Avenir","Montserrat",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  assert.match(css, /rotate\(-4deg\)/);
});

test("migrazione 0083: bucket pubblico, tipi e peso, percorso casuale, solo abilitati nella propria cartella, niente update; la 0082 non è toccata", () => {
  const m = readFileSync(join(root, "supabase/migrations/0083_programmi_immagini.sql"), "utf8");
  const sql = m.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").replace(/\s+/g, " ");
  assert.match(sql, /values \('prg-immagini', 'prg-immagini', true, 3145728, array\['image\/webp', 'image\/jpeg', 'image\/png'\]\)/);
  assert.doesNotMatch(sql, /svg/i);
  assert.match(sql, /for insert to authenticated with check \(bucket_id = 'prg-immagini' and name ~ \('\^' \|\| auth\.uid\(\)::text \|\| '\/\[0-9a-f\]\{32\}\\\.\(webp\|jpg\|png\)\$'\) and public\.bgl_abilitato\(\)\)/);
  assert.match(sql, /for delete to authenticated using \(bucket_id = 'prg-immagini' and \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text and public\.bgl_abilitato\(\)\)/);
  assert.doesNotMatch(sql, /for update|for all|to anon|to public|bgl_abilitato_uid|delete from storage/i, "nessun update, nessun anon, niente DELETE in SQL, niente funzione solo-servizio");
  assert.doesNotMatch(sql, /prg_programmi|prg_salva|alter table/i, "tabella e funzioni della 0082 invariate");
});

test("i workflow lanciano questa prova", () => {
  for (const f of ["pages.yml", "pr-controlli.yml"]) assert.match(readFileSync(join(root, ".github/workflows", f), "utf8"), /programma-di-sala\.test\.mjs test\/programma-grafica\.test\.mjs/, f);
});
