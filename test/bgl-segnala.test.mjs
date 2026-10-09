/* Biglietteria — la casella delle segnalazioni (biglietteria/segnala.js, 07/10/2026).
   Parti pure: indirizzo pulito (MAI il codice di disdetta ?c=), corpo per submit-feedback, testi, tipi; e le pagine che la
   caricano. node --test test/bgl-segnala.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);
const SG = req(join(root, "biglietteria/segnala.js"));
const B = req(join(root, "biglietteria/bgl.js"));
const leggi = (p) => readFileSync(join(root, p), "utf8");
const TOKEN = "0123456789abcdef0123456789abcdef";

test("l'indirizzo della disdetta perde il codice ?c=: restano origine, percorso e lo spettacolo", () => {
  const u = SG.urlPulito(`https://stageplot.it/biglietteria/?e=abcdefgh23&c=${TOKEN}`);
  assert.equal(u, "https://stageplot.it/biglietteria/?e=abcdefgh23");
  assert.equal(u.indexOf(TOKEN), -1); assert.doesNotMatch(u, /[?&]c=/);
  /* in qualunque posizione, anche ripetuto, anche maiuscolo nel valore o col frammento */
  for (const h of [`https://stageplot.it/biglietteria/?c=${TOKEN}&e=abcdefgh23`, `https://stageplot.it/biglietteria/?e=abcdefgh23&c=${TOKEN}&c=${TOKEN}#c=${TOKEN}`,
    `https://stageplot.it/biglietteria/?e=abcdefgh23&C=${TOKEN}`, `https://stageplot.it/biglietteria/?e=abcdefgh23&c=${TOKEN.toUpperCase()}`]) {
    const p = SG.urlPulito(h);
    assert.equal(p.toLowerCase().indexOf(TOKEN), -1, h);
    assert.equal(p, "https://stageplot.it/biglietteria/?e=abcdefgh23", h);
  }
});

test("l'indirizzo pulito tiene solo o, s, e ben fatti; via tutto il resto", () => {
  assert.equal(SG.urlPulito("https://stageplot.it/biglietteria/?o=ava-sound&s=concerto-9-ott&utm_source=x&id=123#frammento"),
    "https://stageplot.it/biglietteria/?o=ava-sound&s=concerto-9-ott");
  assert.equal(SG.urlPulito("https://stageplot.it/biglietteria/?o=AVA-Sound"), "https://stageplot.it/biglietteria/?o=ava-sound", "come bgl.js: minuscolo");
  /* area dell'organizzatore: ?v=&id=&p= (p può essere una prenotazione) non escono */
  assert.equal(SG.urlPulito("https://stageplot.it/biglietteria/gestione/?v=sposta&id=9b2f&p=prenotazione-123"), "https://stageplot.it/biglietteria/gestione/");
  /* valori malformati: fuori (niente testo libero che passa per l'indirizzo) */
  assert.equal(SG.urlPulito("https://stageplot.it/biglietteria/?o=mario%40example.com&s=%3Cscript%3E&e=troppolungo123"), "https://stageplot.it/biglietteria/");
  /* le prove in locale portano ?api=&anon=: non escono nemmeno quelli */
  assert.equal(SG.urlPulito("http://127.0.0.1:8801/biglietteria/mie/?api=http://127.0.0.1:54321&anon=abc"), "http://127.0.0.1:8801/biglietteria/mie/");
  assert.equal(SG.urlPulito("non è un indirizzo"), "");
  assert.equal(SG.urlPulito("javascript:alert(1)"), "");
});

test("quale pagina: gestione, mie, disdetta, scheda (anche il vecchio ?e=), organizzatore", () => {
  assert.equal(SG.paginaDa("/biglietteria/gestione/", "?v=scheda&id=x"), "gestione");
  assert.equal(SG.paginaDa("/biglietteria/mie/", ""), "mie");
  assert.equal(SG.paginaDa("/biglietteria/", `?e=abcdefgh23&c=${TOKEN}`), "disdetta");
  assert.equal(SG.paginaDa("/biglietteria/", "?e=abcdefgh23"), "scheda");
  assert.equal(SG.paginaDa("/biglietteria/", "?o=ava-sound&s=concerto"), "scheda");
  assert.equal(SG.paginaDa("/biglietteria/", "?o=ava-sound"), "organizzatore");
  assert.equal(SG.paginaDa("/biglietteria/", ""), "ingresso");
});

test("il contesto tecnico: dove si è, mai nomi, email o codici", () => {
  const c = SG.contestoTecnico("scheda", { org: "ava-sound", spettacolo: "concerto-9-ott", slug: "abcdefgh23", schermata: "modulo",
    nome: "Maria", email: "maria@example.invalid", codice: "K7Q2", token: TOKEN });
  assert.deepEqual(c, { origine: "biglietteria", pagina: "scheda", org: "ava-sound", spettacolo: "concerto-9-ott", slug: "abcdefgh23", schermata: "modulo" });
  assert.deepEqual(SG.contestoTecnico("mie", {}), { origine: "biglietteria", pagina: "mie" });
  assert.deepEqual(SG.contestoTecnico("gestione", { org: "ava-sound", vista: "sposta" }), { origine: "biglietteria", pagina: "gestione", org: "ava-sound", vista: "sposta" });
  /* valori sbagliati non passano */
  assert.deepEqual(SG.contestoTecnico("scheda", { org: "maria@example.invalid", slug: TOKEN, vista: "qualunque", schermata: "x" }), { origine: "biglietteria", pagina: "scheda" });
});

test("il corpo per submit-feedback: i campi del server, l'indirizzo pulito, niente progetto né identità", () => {
  const b = SG.corpo({ messaggio: "  La pianta non si apre  ", hint: "bug", honeypot: "", screenshot: "data:image/jpeg;base64,AAAA",
    pagina: "disdetta", dove: { slug: "abcdefgh23" }, href: `https://stageplot.it/biglietteria/?e=abcdefgh23&c=${TOKEN}`,
    userAgent: "UA", viewport: "390x844", lingua: "it-IT" });
  assert.deepEqual(Object.keys(b).sort(), ["hint", "honeypot", "message", "meta", "screenshot", "tech_context"]);
  assert.equal(b.message, "La pianta non si apre");
  assert.equal(b.hint, "bug");
  assert.deepEqual(b.meta, { app_version: "biglietteria/disdetta", page_url: "https://stageplot.it/biglietteria/?e=abcdefgh23",
    user_agent: "UA", viewport: "390x844", language: "it-IT" });
  assert.deepEqual(b.tech_context, { origine: "biglietteria", pagina: "disdetta", slug: "abcdefgh23" });
  assert.equal(JSON.stringify(b).indexOf(TOKEN), -1, "il codice di disdetta non viaggia da nessuna parte");
  assert.equal(b.screenshot, "data:image/jpeg;base64,AAAA");
  /* tipi sconosciuti, schermate non immagini o troppo grandi: via */
  const c = SG.corpo({ messaggio: "ciao ciao", hint: "altro", screenshot: "data:text/html;base64,AAAA", href: "https://stageplot.it/biglietteria/mie/" });
  assert.equal(c.hint, null); assert.equal(c.screenshot, null);
  assert.equal(SG.corpo({ messaggio: "ciao ciao", screenshot: "data:image/jpeg;base64," + "A".repeat(SG.MAX_SHOT_CHARS) }).screenshot, null);
  assert.equal(SG.corpo({ messaggio: "x".repeat(1500) }).message.length, 1000);
  assert.equal(SG.corpo({ messaggio: "ciao ciao", honeypot: "bot" }).honeypot, "bot", "il honeypot si manda com'è: decide il server");
});

test("i testi: nell'area come nell'editor, al pubblico «Un problema? Scrivici»; i tipi sono quelli del server", () => {
  assert.equal(SG.testi("gestione").titolo, "Cosa manca? Bug? Idea?");
  for (const p of ["scheda", "organizzatore", "disdetta", "mie", "ingresso"]) assert.equal(SG.testi(p).titolo, "Un problema? Scrivici", p);
  assert.deepEqual(SG.testi("scheda").tipi.map((t) => t[1]), ["Bug", "Manca qualcosa", "Idea"]);
  const server = leggi("supabase/functions/_shared/feedback-validation.ts");
  const hints = JSON.parse((server.match(/const HINTS = (\[[^\]]+\])/) || [])[1]);
  assert.deepEqual(SG.testi("gestione").tipi.map((t) => t[0]), hints);
  assert.deepEqual(SG.HINTS, hints);
  assert.equal(SG.hintValido("missing"), "missing"); assert.equal(SG.hintValido("Bug"), null);
  assert.match(SG.testi("scheda").grazie, /Grazie, l'abbiamo ricevuto/);
  assert.equal(SG.testi("gestione").notaPubblico, "", "all'organizzatore niente rimando all'organizzatore");
});

test("limiti uguali al server: 5–1000 caratteri, schermata ≤ 2,8 milioni di caratteri", () => {
  const server = leggi("supabase/functions/_shared/feedback-validation.ts");
  assert.match(server, /message\.length < 5\b/); assert.match(server, /message\.length > 1000\b/);
  assert.match(server, /MAX_SHOT_CHARS = 2_800_000/); assert.equal(SG.MAX_SHOT_CHARS, 2800000);
  assert.match(SG.erroreMessaggio("ciao"), /almeno 5/);
  assert.match(SG.erroreMessaggio("   ciao   "), /almeno 5/, "gli spazi non contano");
  assert.equal(SG.erroreMessaggio("ciao!"), null);
  assert.equal(SG.erroreMessaggio("x".repeat(1000)), null);
  assert.match(SG.erroreMessaggio("x".repeat(1001)), /1000/);
});

test("le risposte in italiano semplice: grazie, troppi invii, rete", () => {
  assert.deepEqual(SG.esitoInvio(200, { ok: true }), { ok: true });
  assert.equal(SG.esitoInvio(200, {}).ok, false);
  assert.equal(SG.esitoInvio(429, { error: "troppi invii" }).testo, "Hai già scritto da poco, riprova più tardi.");
  assert.match(SG.esitoInvio(0).testo, /connessione.*riprova/);
  assert.match(SG.esitoInvio(500, { error: "errore interno" }).testo, /riprova/);
});

test("si manda alla stessa Edge Function dell'editor; in produzione l'indirizzo non si cambia da fuori", () => {
  const ed = leggi("index.template.html").match(/var SUBMIT_URL = "([^"]+)"/)[1];
  assert.equal(ed, "https://vsodplqkuvnsdiikvmjb.supabase.co/functions/v1/submit-feedback");
  assert.equal(SG.urlInvio(B.configura("stageplot.it", "?api=https://altro.example").api), ed);
  assert.equal(SG.urlInvio("http://127.0.0.1:54321/"), "http://127.0.0.1:54321/functions/v1/submit-feedback");
});

test("la schermata ridotta: lato lungo al massimo 1600, mai ingrandita", () => {
  assert.deepEqual(SG.misureRidotte(3200, 1800, 1600), { w: 1600, h: 900 });
  assert.deepEqual(SG.misureRidotte(1000, 4000, 1600), { w: 400, h: 1600 });
  assert.deepEqual(SG.misureRidotte(800, 600, 1600), { w: 800, h: 600 });
  assert.deepEqual(SG.misureRidotte(0, 600, 1600), { w: 0, h: 0 });
});

test("CORS di submit-feedback: ammette le pagine della biglietteria su stageplot.it (stessa origine)", () => {
  const cors = leggi("supabase/functions/_shared/cors.ts");
  const origine = (cors.match(/"Access-Control-Allow-Origin": "([^"]+)"/) || [])[1];
  assert.equal(origine, new URL(req(join(root, "biglietteria/indirizzi.js")).linkOrganizzatore("ava-sound")).origin);
  const h = (cors.match(/"Access-Control-Allow-Headers": "([^"]+)"/) || [])[1];
  for (const x of ["authorization", "content-type"]) assert.ok(h.split(/,\s*/).includes(x), x);
  assert.match(leggi("supabase/config.toml"), /\[functions\.submit-feedback\]\nverify_jwt = false/);
});

test("una regola sola decide computer o telefono: la stessa in segnala.js e in segnala.css", () => {
  assert.equal(SG.MEDIA_COMPUTER, "(min-width: 700px) and (hover: hover) and (pointer: fine)");
  const css = leggi("biglietteria/segnala.css");
  const regole = [...css.matchAll(/@media ([^{]+)\{/g)].map((m) => m[1].trim());
  assert.ok(regole.includes(SG.MEDIA_COMPUTER), "il riquadro vive sotto MEDIA_COMPUTER: " + JSON.stringify(regole));
  /* fuori da quella regola il pulsante del riquadro non si vede: sul telefono nulla di fisso a pannello chiuso */
  const base = css.slice(0, css.indexOf("@media " + SG.MEDIA_COMPUTER));
  assert.match(base, /\.sg-tasto\{display:none\}/);
  assert.doesNotMatch(base.replace(/\.sg-pannello\{[^}]*\}|\.sg-velo\{[^}]*\}/g, ""), /position:fixed/, "di base, fissi solo il pannello aperto e il velo");
  /* ogni altra @media che tocca il riquadro usa la stessa regola */
  for (const r of regole.filter((x) => /min-width/.test(x))) assert.ok(r.endsWith(SG.MEDIA_COMPUTER), r);
  const js = leggi("biglietteria/segnala.js");
  assert.match(js, /matchMedia\(MEDIA_COMPUTER\)/);
  assert.match(js, /var modale = !computer\.matches;/);
});

test("le tre pagine caricano la casella (dopo le librerie che usa) e la CSP lascia parlare con il backend", () => {
  for (const [f, pre] of [["biglietteria/index.html", ""], ["biglietteria/gestione/index.html", "../"], ["biglietteria/mie/index.html", "../"]]) {
    const h = leggi(f);
    assert.ok(h.includes(`<link rel="stylesheet" href="${pre}segnala.css?v=1">`), f + ": css");
    const s = h.indexOf(`<script src="${pre}segnala.js?v=1"></script>`);
    assert.ok(s > 0, f + ": js");
    for (const x of ["bgl.js", "accesso.js"]) assert.ok(h.indexOf(`src="${pre}${x}`) > 0 && h.indexOf(`src="${pre}${x}`) < s, f + ": " + x + " prima");
    assert.equal(h.lastIndexOf("<script src="), s, f + ": l'ultimo script");
    const csp = (h.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
    assert.match(csp, /connect-src https:\/\/vsodplqkuvnsdiikvmjb\.supabase\.co /, f);
  }
});

test("il codice della casella: niente cattura dello schermo, niente indirizzi scritti, niente progetto", () => {
  const js = leggi("biglietteria/segnala.js");
  assert.doesNotMatch(js, /getDisplayMedia/);
  assert.deepEqual([...js.matchAll(/https?:\/\/([a-z0-9.\-]+)/gi)].map((m) => m[1]), [], "tutto da cfg.api");
  assert.doesNotMatch(js, /project_snapshot:|project_id:|user_email:/);
  assert.match(js, /href: location\.href/, "l'indirizzo passa da corpo() → urlPulito()");
  assert.doesNotMatch(js, /page_url: location/);
});
