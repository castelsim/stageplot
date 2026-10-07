/* Biglietteria — area dell'organizzatore, logica pura (biglietteria/gestione/gst.js). node --test test/bgl-gestione.test.mjs
   Il fuso del processo è in California apposta: date e ore devono uscire in ora di Roma comunque. */
process.env.TZ = "America/Los_Angeles";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { loadApp, root } from "./sandbox.mjs";

const G = createRequire(import.meta.url)(join(root, "biglietteria/gestione/gst.js"));
const eq = assert.deepEqual;
const ok = assert.ok;

test("tenuti da parte scritti a mano: «A1-4, B5, C 7, Z9», tutta la fila, settori, andata e ritorno", () => {
  const chiavi = []; ["A", "B", "C", "D"].forEach((f) => { for (let n = 1; n <= 6; n++) chiavi.push("Platea|" + f + "|" + n); });
  let R = G.bglRiservatiDaTesto("A1-4, B5, C 7, Z9", chiavi);
  eq(R.chiavi, ["Platea|A|1", "Platea|A|2", "Platea|A|3", "Platea|A|4", "Platea|B|5"]);
  eq(R.sconosciuti, ["C 7", "Z9"]);
  R = G.bglRiservatiDaTesto("a1-4; b5\nC 6, tutta la fila D, fila a", chiavi);
  eq([R.chiavi.length, R.sconosciuti], [14, []]);
  eq(G.bglRiservatiDaTesto("A3-1", chiavi).chiavi, ["Platea|A|1", "Platea|A|2", "Platea|A|3"]);
  eq(G.bglRiservatiDaTesto("10.5, 2/5", ["Platea|1|5", "Platea|2|5", "Platea|10|5"]).chiavi, ["Platea|10|5", "Platea|2|5"]);
  const due = ["Platea|A|1", "Platea|A|2", "Balcone|A|1", "Balcone|B|1"];
  eq(G.bglRiservatiDaTesto("Balcone/A1", due).chiavi, ["Balcone|A|1"]);
  eq(G.bglRiservatiATesto(["Platea|A|1", "Platea|A|2", "Platea|A|3", "Platea|A|5", "Platea|B|2"], chiavi), "A1-3, A5, B2");
});

test("RF5: data e ora di Roma ovunque sia il computer; cambio d'ora; date impossibili", () => {
  const tz0 = process.env.TZ;
  try {
    for (const tz of ["Europe/Rome", "America/New_York", "Pacific/Auckland", "UTC"]) {
      process.env.TZ = tz;
      eq(G.bglInizioIso("2026-10-09", "21:00"), "2026-10-09T21:00:00+02:00", tz);
      eq(G.bglInizioIso("2026-10-25", "21:00"), "2026-10-25T21:00:00+01:00", "la sera del cambio d'ora (" + tz + ")");
      eq(G.bglDataOra("2026-10-09T19:00:00+00:00"), { data: "2026-10-09", ora: "21:00" }, tz);
      eq(G.bglQuando("2026-10-09T19:00:00+00:00"), "venerdì 9 ottobre 2026, ore 21:00", tz);
    }
  } finally { process.env.TZ = tz0; }
  eq([G.bglInizioIso("2026-11-31", "10:00"), G.bglInizioIso("2026-10-09", "25:00"), G.bglDataOra("boh")], [null, null, null]);
});

/* prenotazioni inventate per lista, CSV e PDF (le stesse del test dell'editor) */
function dati() {
  const posti = []; ["A", "B", "AA"].forEach((f) => [1, 2, 3].forEach((n) => posti.push({ k: "Platea|" + f + "|" + n, settore: "Platea", fila: f, posto: n,
    x: n * 60, y: f === "A" ? 1000 : f === "B" ? 1100 : 1200, w: 50, d: 53, rot: 180 })));
  const pr = (id, nome, cognome, ps, stato, codice, extra) => Object.assign({ id, nome, cognome, email: (nome || "x").toLowerCase() + "@example.invalid",
    posti: ps, posti_chiesti: ps.slice(), stato, codice, creata_il: "2026-10-07T16:02:00+00:00", chiusa_il: null }, extra || {});
  return { ok: true,
    evento: { slug: "abcdefghjk", titolo: "Concerto di prova", inizio: "2026-10-09T19:00:00+00:00", luogo: "Teatro di prova",
      riservati: ["Platea|A|1", "Platea|AA|3"], riservati_per: { "Platea|A|1": "Ospite" }, pianta: { v: 1, box: [0, 0, 400, 1400], palco: [], pedane: [], posti } },
    prenotazioni: [pr("1", "Mario", "Rossi", ["Platea|B|2", "Platea|B|1"], "attiva", "K7M4QX"), pr("2", "Álvaro", "Àlvarez", ["Platea|AA|1"], "attiva", "ZZ99AA"),
      pr("3", "Zita", "Bianchi", ["Platea|A|3", "Platea|A|2"], "attiva", "BB22CC"),
      pr("4", "Luca", "Verdi", [], "disdetta", "DD33EE", { posti_chiesti: ["Platea|B|3"], chiusa_il: "2026-10-08T10:00:00+00:00" }),
      pr("5", "Gina", "Neri", [], "annullata", "FF44GG", { posti_chiesti: ["Platea|AA|2"] }), pr("6", "=SOMMA(1)", "+Hacker", ["Platea|B|3"], "attiva", "HH55JJ")],
    conteggi: { totali: 9, prenotati: 6, riservati: 2, liberi: 1, prenotazioni_attive: 4 } };
}

test("lista per cognome e per fila: come nell'editor; il «per chi» dei tenuti da parte entra nella lista", () => {
  eq(G.bglListaIngresso(dati(), "cognome").map((r) => r.cognome), ["+Hacker", "Àlvarez", "Bianchi", "Rossi"]);
  const F = G.bglListaIngresso(dati(), "fila");
  eq(F.map((r) => r.fila + r.posto), ["A1", "A2", "A3", "B1", "B2", "B3", "AA1", "AA3"]);
  eq(F[0].chi, "Tenuto da parte — Ospite", "specifica §2.3: «per chi» stampato nella lista d'ingresso");
  eq(F[F.length - 1].chi, "Tenuto da parte");
});

test("CSV: una riga per posto, ora di Roma, formule disinnescate; identico al CSV dell'editor", () => {
  const righe = G.bglCsv(dati()).replace(/^﻿/, "").trim().split("\r\n");
  eq(righe[0], "Cognome;Nome;Email;Settore;Fila;Posto;Codice;Stato;Prenotato il");
  assert.ok(righe.includes("Rossi;Mario;mario@example.invalid;Platea;B;2;K7M4QX;Attiva;2026-10-07 18:02"));
  assert.ok(righe.some((r) => r.startsWith("'+Hacker;'=SOMMA(1);")));
  const A = loadApp(), h = ["a", "b"], rows = [["=1+1", "x;y"], ["\"virgolette\"", "a capo\nqui"]];
  eq(G.rowsToCsv(h, rows, ";", true), A.rowsToCsv(h, rows, ";", true), "la copia di rowsToCsv dà lo stesso testo dell'editor");
});

test("la lista per l'ingresso si legge in sala: righe ad almeno 11 pt, intestazioni ad almeno 10 (PDF su un documento finto)", () => {
  const scritte = []; let corpo = 0;
  const doc = new Proxy({}, { get: (t, k) => {
    if (k === "setFontSize") return (n) => { corpo = n; return doc; };
    if (k === "text") return (txt) => { (Array.isArray(txt) ? txt : [txt]).forEach((x) => scritte.push({ t: String(x), corpo })); return doc; };
    if (k === "getTextWidth") return (x) => String(x).length * corpo * 0.18;
    if (k === "splitTextToSize") return (x) => [String(x)];
    if (k === "internal") return { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    return () => doc; } });
  G.bglScriviLista(doc, dati(), "entrambe");
  for (const x of scritte.filter((s) => /Rossi|Bianchi|K7M4QX|Tenuto da parte/.test(s.t))) assert.ok(x.corpo >= 11, x.t + " a " + x.corpo);
  assert.ok(scritte.some((s) => /Tenuto da parte — Ospite/.test(s.t)), "il «per chi» c'è anche nel PDF");
});

test("riga dell'elenco: nomi scappati, «Stessa connessione», i bottoni in più (Sposta) accanto a «Disdici»", () => {
  const D = dati(); D.prenotazioni[0].connessione = 1;
  const r = G.bglRigaPrenotazione(D.prenotazioni[0], [{ az: "sposta", testo: "Sposta" }]);
  assert.match(r, /Stessa connessione 1/); assert.match(r, /data-az="disdici" data-id="1"/); assert.match(r, /data-az="sposta" data-id="1">Sposta</);
  assert.doesNotMatch(G.bglRigaPrenotazione(Object.assign({}, D.prenotazioni[0], { nome: "<img src=x onerror=alert(1)>" })), /<img/);
  assert.doesNotMatch(G.bglRigaPrenotazione(D.prenotazioni[3], [{ az: "sposta", testo: "Sposta" }]), /data-az=/, "una disdetta non si sposta né si disdice");
});

test("RF5 e indirizzi: la proposta è quella del database (stessa tabella di rls-bgl-area)", () => {
  const casi = [["Concerto di prova", "2026-10-09T19:00:00Z", "concerto-di-prova-9-ottobre"],
    ["Così fan tutte — prima", "2026-12-31T23:30:00Z", "cosi-fan-tutte-prima-1-gennaio"],
    ["!!!", "2026-10-25T20:00:00Z", "spettacolo-25-ottobre"],
    ["Àlvarez & Perché: una serata lunghissima di musica da camera", "2026-03-29T10:00:00Z", "alvarez-perche-una-serata-lungh-29-marzo"]];
  for (const [t, i, atteso] of casi) eq(G.slugProposto(t, i), atteso, t);
  eq(G.slugDaTesto("Teatro Nuovo — Città"), "teatro-nuovo-citta");
});

test("modulo: errori in parole, campo per campo; limiti 600 e 200; chiusura prima dell'inizio; i dati giusti per il database", () => {
  const base = { project_id: "p1", variante: "V1", titolo: " Concerto ", data: "2026-10-25", ora: "21:00", luogo: "Teatro", descrizione: "a\r\nb",
    note: "", chiusuraAllInizio: true, riservati: ["Platea|A|1"], riservatiPer: { "Platea|A|1": " Ospite ", "Platea|B|1": "no" } };
  const ok = G.datiModulo(base, { nuovo: true });
  eq(ok.errori, {});
  eq(ok.dati, { titolo: "Concerto", luogo: "Teatro", descrizione: "a\nb", note: null, inizio: "2026-10-25T21:00:00+01:00", chiusura: null,
    project_id: "p1", variante: "V1", riservati: ["Platea|A|1"], riservati_per: { "Platea|A|1": "Ospite" } });
  const no = G.datiModulo({ ...base, titolo: "", descrizione: "x".repeat(601), note: "y".repeat(201), project_id: null, chiusuraAllInizio: false,
    chiusuraData: "2026-10-26", chiusuraOra: "10:00" }, { nuovo: true });
  eq(Object.keys(no.errori).sort(), ["chiusura", "descrizione", "note", "sala", "titolo"]);
  assert.match(no.errori.descrizione, /600/); assert.match(no.errori.note, /200/);
  eq(Object.keys(G.datiModulo({ ...base, descrizione: "é".repeat(600) }, {}).errori), [], "600 lettere accentate passano (si contano i caratteri)");
});

test("modulo: un tab incollato da Word non fa rifiutare il salvataggio (il database vuole solo testo e a capo)", () => {
  // bgl_testo (titolo, luogo) rifiuta ogni carattere di controllo; bgl_testo_righe (descrizione, nota) tutti tranne l'a capo
  const r = G.datiModulo({ project_id: "p1", titolo: "Concerto\tdi prova", data: "2026-10-25", ora: "21:00", luogo: "Teatro\u0007di prova",
    descrizione: "Prima riga\tcon tab\r\nSeconda\u000briga", note: "porte\talle 20:30", chiusuraAllInizio: true }, { nuovo: true });
  eq(r.errori, {});
  eq([r.dati.titolo, r.dati.luogo, r.dati.descrizione, r.dati.note],
    ["Concerto di prova", "Teatro di prova", "Prima riga con tab\nSeconda riga", "porte alle 20:30"]);
});

test("elenco: stato e conti in parole; prossimi in alto, passati in fondo; luogo predefinito = l'ultimo usato", () => {
  eq(G.statoRiga({ pubblicato: false, stato_pubblico: "aperta" }).t, "bozza");
  eq(G.statoRiga({ pubblicato: true, stato_pubblico: "aperta" }).t, "aperte");
  eq(G.statoRiga({ pubblicato: true, stato_pubblico: "chiusa" }).t, "chiuse");
  eq(G.statoRiga({ pubblicato: true, stato_pubblico: "conclusa" }).t, "concluso");
  eq(G.contaRiga({ prenotati: 34, liberi: 62 }), "34 prenotati · 62 liberi");
  eq(G.contaRiga({ prenotati: 1, liberi: 1 }), "1 prenotato · 1 libero");
  const ora = Date.parse("2026-10-10T12:00:00Z");
  const L = [{ id: "a", inizio: "2026-10-09T19:00:00Z", luogo: "Vecchio", creato: 1 }, { id: "b", inizio: "2026-11-01T19:00:00Z", luogo: "Nuovo" },
    { id: "c", inizio: "2026-10-20T19:00:00Z", luogo: "Medio" }, { id: "d", inizio: "2026-10-10T08:00:00Z", luogo: "In corso" }];
  const D = G.dividiSpettacoli(L, ora);
  eq([D.prossimi.map((x) => x.id), D.passati.map((x) => x.id)], [["d", "c", "b"], ["a"]], "iniziato da meno di 12 ore: ancora fra i prossimi");
  eq(G.luogoPredefinito(L), "Nuovo");
});

test("sala in parole: «24 posti, file A–D», una fila, più settori", () => {
  const p = (file, settore = "Platea") => ({ posti: [...file].flatMap((f, i) => [1, 2, 3].map((n) => ({ settore, fila: f, posto: n, y: 100 + i * 90 }))) });
  eq(G.piantaRiassuntoBreve(p("ABCD")), "12 posti, file A–D");
  eq(G.piantaRiassuntoBreve(p("A")), "3 posti, fila A");
  const due = p("AB"); due.posti.push({ settore: "Galleria", fila: "A", posto: 1, y: 900 });
  eq(G.piantaRiassuntoBreve(due), "7 posti in 2 settori");
  eq(G.piantaRiassuntoBreve(null), "Nessun posto numerato");
});

test("messaggi per chi organizza: il testo della specifica per chi non è abilitato; codici nuovi; codice sconosciuto visibile", () => {
  eq(G.NON_ABILITATO, "La biglietteria è in prova solo su invito. Scrivi a info@stageplot.it");
  eq(G.messaggio({ errore: "non_abilitato" }), G.NON_ABILITATO);
  eq(G.messaggio({ errore: "posto_prenotato", posti: ["Platea|A|5"] }), "A 5 è già prenotato: prima disdici o sposta la prenotazione.");
  assert.match(G.messaggio({ errore: "slug_bloccato" }, "spettacolo"), /qualcuno ha già prenotato/);
  assert.match(G.messaggio({ errore: "slug_bloccato" }, "organizzatore"), /dal primo spettacolo pubblicato/,
    "decisione 1 del 06/10: il blocco resta anche se lo spettacolo poi si elimina, il messaggio non dice «c'è già»");
  assert.match(G.messaggio({ errore: "numero_diverso", prima: 2 }), /Scegli 2 posti/);
  assert.match(G.messaggio({ errore: "qualcosa_di_nuovo" }), /qualcosa_di_nuovo/);
});

test("chiamate: nomi e argomenti del contratto, mai un'eccezione, sessione scaduta = «accedi di nuovo»", async () => {
  const visti = [];
  G.api.trasporto = (fn, args) => { visti.push([fn, args]); return Promise.resolve({ data: { ok: true }, error: null }); };
  await G.api.organizzatoreMio(); await G.api.slugLibero("teatro-x"); await G.api.organizzatoreSalva({ nome: "T", slug: "teatro-x" });
  await G.api.progettiSala(); await G.api.spettacoloSalva(null, { titolo: "T" }); await G.api.spettacoloSalva("e1", { stato: "chiusa" });
  await G.api.prenotati("e1"); await G.api.annulla("p1"); await G.api.annulla("p1", ["Platea|A|1"]); await G.api.elimina("e1");
  await G.api.sposta("p1", ["Platea|C|1"]);
  eq(visti, [["bgl_organizzatore_mio", {}], ["bgl_slug_libero", { p_slug: "teatro-x" }], ["bgl_organizzatore_salva", { p_dati: { nome: "T", slug: "teatro-x" } }],
    ["bgl_progetti_sala", {}], ["bgl_spettacolo_salva", { p_id: null, p_dati: { titolo: "T" } }], ["bgl_spettacolo_salva", { p_id: "e1", p_dati: { stato: "chiusa" } }],
    ["bgl_prenotati", { p_evento_id: "e1" }], ["bgl_annulla", { p_prenotazione_id: "p1" }], ["bgl_annulla", { p_prenotazione_id: "p1", p_posti: ["Platea|A|1"] }],
    ["bgl_elimina", { p_evento_id: "e1" }], ["bgl_sposta", { p_prenotazione_id: "p1", p_posti: ["Platea|C|1"] }]]);
  const casi = [[() => Promise.resolve({ data: null, error: { code: "PGRST301", message: "JWT expired" } }), "non_autenticato"],
    [() => Promise.resolve({ data: null, error: { code: "42501", message: "permission denied" } }), "non_autenticato"],
    [() => Promise.resolve({ data: null, error: { code: "PGRST", message: "boom" } }), "rete"],
    [() => Promise.resolve({ data: "stringa", error: null }), "risposta_inattesa"], [() => Promise.reject(new Error("offline")), "rete"],
    [() => { throw new Error("subito"); }, "rete"]];
  for (const [tr, atteso] of casi) { G.api.trasporto = tr; const r = await G.api.prenotati("e1"); eq([r.ok, r.errore], [false, atteso], atteso); }
  G.api.trasporto = null;
  eq((await G.api.prenotati("e1")).errore, "non_autenticato");
});

test("revisione T23: l'email di contatto vuota = nessuna in pagina; il formato è lo stesso del server (niente < > \" ' ` , ;)", () => {
  eq(G.contattoOk(""), true, "vuota: si può");
  eq(G.contattoOk("info@teatro-prova.example.invalid"), true);
  for (const x of ['"><img/src=x/onerror=alert(1)>@x.it', "a<b@example.invalid", "o'brien@example.invalid", "a`b@example.invalid",
    "a@b", "due@@example.invalid", "a b@example.invalid", "a@example.invalid,b@example.invalid", "a;b@example.invalid"])
    eq(G.contattoOk(x), false, x);
  /* lo stesso schema della migrazione: si legge dal file, così i due non possono divergere */
  const sql = readFileSync(join(root, "supabase/migrations/0074_bgl_area_organizzatori.sql"), "utf8");
  const classe = sql.match(/v_contatto !~ '\^(\[\^.*?\])\+@/)[1].replace(/''/g, "'").replace("[:space:]", "\\s");
  eq(G.CONTATTO_RE.source.startsWith("^" + classe + "+@"), true, "stessa classe di caratteri: " + classe + " / " + G.CONTATTO_RE.source);
  const app = readFileSync(join(root, "biglietteria/gestione/gst-app.js"), "utf8");
  ok(!/si vede l'email del tuo account/.test(app), "l'aiuto non promette più l'email dell'account");
  ok(/vuoto[^"]*nessuna email/.test(app), "l'aiuto dice che vuoto = nessuna email in pagina");
  ok(/GST\.contattoOk\(/.test(app), "la prima volta controlla il formato prima di salvare");
});
