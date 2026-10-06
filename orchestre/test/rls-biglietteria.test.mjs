/* Biglietteria (migrazione 0072): prenotazione gratuita dei posti numerati.
   Qui le prove che contano davvero, sul Postgres LOCALE: un posto non va a due persone nemmeno se
   prenotano nello stesso istante, un'email non supera 4 posti nemmeno in parallelo, il pubblico non
   legge mai nomi ed email, un organizzatore non vede gli eventi degli altri, la pianta pubblicata non si
   porta dietro niente della scena oltre ai posti, nomi ed email spariscono 30 giorni dopo l'evento.
   Ogni rifiuto si controlla sul CODICE dell'errore, non sul semplice «non è andata».
   Dati inventati: utenti @example.invalid, «Mario Rossi», «Concerto di prova». */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { localEnv, mkUser, login, rest, rpc, admin } from "./_local.mjs";

const env = localEnv();
const run = env ? test : process.env.ORC_RLS ? (n) => test(n, () => { throw new Error("Supabase locale spento"); }) : test.skip;
const stamp = "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = (n) => `sp-bgl-${n}-${stamp}@example.invalid`;
const pubblico = (n) => `pubblico-${n}-${stamp}@example.invalid`;
const U = {}, T = {};
let PROGETTO, PROGETTO_B;
const ORA = Date.now();
const fra = (ore) => new Date(ORA + ore * 3_600_000).toISOString();
const impronta = (t) => createHash("sha256").update(t, "utf8").digest("hex");

/* Una pianta come la manda l'editor: file A..H da `perFila` posti, palco in alto, una pedana. */
function pianta({ file = "ABCDEFGH", perFila = 12, settore = "Platea", extra = {} } = {}) {
  const posti = [];
  [...file].forEach((f, r) => {
    for (let n = 1; n <= perFila; n++) {
      posti.push({ settore, fila: f, posto: n, x: 100 + n * 55, y: 1000 + r * 90, w: 50, d: 53, rot: 0, ...extra });
    }
  });
  return { v: 1, box: [0, 0, 1400, 1900], palco: [[[100, 100], [1300, 100], [1300, 900], [100, 900]]],
    pedane: [[[500, 200], [700, 200], [700, 300], [500, 300]]], posti };
}
const evento = (o = {}) => ({ titolo: "Concerto di prova", inizio: fra(72), chiusura: fra(70), luogo: "Teatro di prova, Città",
  note: null, riservati: [], pianta: pianta(), ...o });
const apri = (tok, prog, o) => rpc(env, tok, "bgl_apri", { p_project_id: prog, p_evento: evento(o) });
const prenota = (slug, posti, n = 1, o = {}) => rpc(env, admin(env), "bgl_prenota", {
  p_slug: slug, p_posti: posti, p_nome: "Mario", p_cognome: "Rossi" + n, p_email: pubblico(n), ...o });
const pub = (slug) => rpc(env, env.ANON_KEY, "bgl_evento_pubblico", { p_slug: slug });
const errore = (r) => r.d && r.d.errore;
/* Per i casi di tempo (chiusura passata, evento concluso, purga) le date si spostano col servizio. */
const sposta = (id, campi) => rest(env, admin(env), "bgl_eventi?id=eq." + id, { method: "PATCH", body: campi });

run("preparazione: l'organizzatore con un progetto, un altro account con il suo", async () => {
  for (const n of ["org", "altro"]) { U[n] = await mkUser(env, mail(n)); T[n] = await login(env, mail(n)); }
  const p = await rest(env, T.org, "stageplot_projects", { method: "POST", body: { user_id: U.org, title: "Teatro " + stamp, data: { items: [] } } });
  assert.ok(p.ok, JSON.stringify(p.d)); PROGETTO = p.d[0].id;
  const q = await rest(env, T.altro, "stageplot_projects", { method: "POST", body: { user_id: U.altro, title: "Altro " + stamp, data: { items: [] } } });
  assert.ok(q.ok, JSON.stringify(q.d)); PROGETTO_B = q.d[0].id;
});

// ───────────────────────────────────────────────────────────────────────────── tabelle chiuse

run("le quattro tabelle non si leggono né si scrivono via REST: né l'anonimo, né un account, né il proprietario", async () => {
  for (const t of ["bgl_eventi", "bgl_prenotazioni", "bgl_posti", "bgl_throttle"]) {
    for (const [chi, tok] of [["anonimo", env.ANON_KEY], ["account", T.altro], ["organizzatore", T.org]]) {
      const r = await rest(env, tok, t + "?select=*");
      assert.equal(r.ok, false, `${chi} legge ${t}: ` + JSON.stringify(r.d).slice(0, 200));
      assert.equal(r.d && r.d.code, "42501", `${chi} su ${t}: dev'essere «permission denied», non un altro errore: ` + JSON.stringify(r.d));
      const w = await rest(env, tok, t, { method: "POST", body: {} });
      assert.equal(w.ok, false, `${chi} scrive ${t}`);
      assert.equal(w.d && w.d.code, "42501", `${chi} scrive ${t}: ` + JSON.stringify(w.d));
    }
  }
});

run("bgl_prenota e bgl_throttle_hit sono solo del servizio (403 «permission denied for function»)", async () => {
  for (const [chi, tok] of [["anonimo", env.ANON_KEY], ["account", T.altro]]) {
    const p = await rpc(env, tok, "bgl_prenota", { p_slug: "abcdefghij", p_posti: ["Platea|A|1"], p_nome: "Mario", p_cognome: "Rossi", p_email: pubblico("x") });
    assert.equal(p.ok, false, chi + " prenota saltando la Edge Function");
    assert.match(String(p.d && p.d.message), /permission denied for function/, chi + ": " + JSON.stringify(p.d));
    const t = await rpc(env, tok, "bgl_throttle_hit", { p_ip_hash: "a".repeat(64) });
    assert.equal(t.ok, false, chi + " gonfia il contatore");
    assert.match(String(t.d && t.d.message), /permission denied for function/, chi + ": " + JSON.stringify(t.d));
  }
  const h = impronta("ip-di-prova-" + stamp);
  const s = await rpc(env, admin(env), "bgl_throttle_hit", { p_ip_hash: h });
  assert.equal(s.d, 1, JSON.stringify(s.d));
  assert.equal((await rpc(env, admin(env), "bgl_throttle_hit", { p_ip_hash: h })).d, 2, "il contatore sale");
  assert.equal((await rpc(env, admin(env), "bgl_throttle_hit", { p_ip_hash: "non-esadecimale" })).ok, false, "un'impronta storta no");
});

run("le funzioni interne non sono raggiungibili da nessuno via REST", async () => {
  for (const fn of ["bgl_pianta_pulita"]) {
    for (const tok of [env.ANON_KEY, T.org]) {
      const r = await rpc(env, tok, fn, { p: pianta() });
      assert.equal(r.ok, false, fn + ": " + JSON.stringify(r.d).slice(0, 200));
    }
  }
  const t = await rpc(env, T.org, "bgl_testo", { p: "x", p_min: 1, p_max: 2 });
  assert.equal(t.ok, false, "bgl_testo: " + JSON.stringify(t.d));
});

// ───────────────────────────────────────────────────────────────────────────────────── pianta

run("pianta: si ricostruisce coi soli campi ammessi (un'etichetta con un nome non arriva al pubblico)", async () => {
  const sporca = pianta({ file: "AB", perFila: 3, extra: { label: "Mario Rossi", id: 17, colore: "#f00", k: "Platea|Z|99", nota: "mario.rossi@example.invalid" } });
  sporca.titolo = "Scena con dentro nomi"; sporca.contatti = ["mario.rossi@example.invalid"];
  sporca.palco[0].push([150, 150]);
  const a = await apri(T.org, PROGETTO, { pianta: sporca });
  assert.equal(a.d.ok, true, JSON.stringify(a.d));
  const r = await pub(a.d.slug);
  assert.equal(r.d.ok, true, JSON.stringify(r.d));
  const testo = JSON.stringify(r.d.pianta);
  assert.doesNotMatch(testo, /Mario|@|colore|label|nota|contatti|titolo|"id"/, "nessun campo estraneo: " + testo.slice(0, 300));
  assert.deepEqual(Object.keys(r.d.pianta).sort(), ["box", "palco", "pedane", "posti", "v"]);
  for (const p of r.d.pianta.posti) assert.deepEqual(Object.keys(p).sort(), ["d", "fila", "k", "posto", "rot", "settore", "w", "x", "y"]);
  assert.equal(r.d.pianta.posti[0].k, "Platea|A|1", "la chiave la ricalcola il server: quella del client (Platea|Z|99) non conta");
  assert.equal(r.d.pianta.posti.length, 6);
  /* anche l'organizzatore la rilegge pulita */
  const org = await rpc(env, T.org, "bgl_prenotati", { p_evento_id: a.d.id });
  assert.doesNotMatch(JSON.stringify(org.d.evento.pianta), /Mario|label/);
  assert.equal(org.d.evento.posti_totali, 6);
  assert.ok((await rpc(env, T.org, "bgl_elimina", { p_evento_id: a.d.id })).d.ok);
});

run("pianta: ogni rifiuto ha il suo motivo", async () => {
  const base = () => pianta({ file: "AB", perFila: 3 });
  const casi = [
    ["versione", (p) => { p.v = 2; }, /versione/],
    ["riquadro", (p) => { p.box = [0, 0, 0, 100]; }, /riquadro/],
    ["riquadro non numerico", (p) => { p.box = [0, 0, "mille", 100]; }, /riquadro/],
    ["posti doppi", (p) => { p.posti[1] = { ...p.posti[0] }; }, /stesso numero \(Platea A 1\)/],
    ["barra nel settore", (p) => { p.posti[0].settore = "Pla|tea"; }, /settore/],
    ["settore vuoto", (p) => { p.posti[0].settore = "  "; }, /settore/],
    ["fila storta", (p) => { p.posti[0].fila = "a"; }, /fila/],
    ["posto zero", (p) => { p.posti[0].posto = 0; }, /numero del posto/],
    ["posto non intero", (p) => { p.posti[0].posto = 1.5; }, /numero del posto/],
    ["posto fuori dal riquadro", (p) => { p.posti[0].x = 5000; }, /fuori dalla pianta/],
    ["coordinate mancanti", (p) => { delete p.posti[0].y; }, /posizione/],
    ["misure", (p) => { p.posti[0].w = 5; }, /misure/],
    ["rotazione", (p) => { p.posti[0].rot = 400; }, /rotazione/],
    ["palco con due punti", (p) => { p.palco = [[[0, 0], [10, 10]]]; }, /palco/],
    ["palco lontanissimo", (p) => { p.palco = [[[0, 0], [10, 10], [99999, 10]]]; }, /palco/],
    ["troppe pedane", (p) => { p.pedane = Array.from({ length: 201 }, () => [[0, 0], [1, 0], [1, 1]]); }, /pedane/],
    ["zero posti", (p) => { p.posti = []; }, /nessun posto/],
    ["2001 posti", (p) => { p.posti = Array.from({ length: 2001 }, (_, i) => ({ settore: "P", fila: "A", posto: i + 1, x: 1, y: 1, w: 50, d: 50, rot: 0 })); p.box = [0, 0, 100, 100]; p.palco = []; p.pedane = []; }, /2000/],
    ["non un oggetto", () => "pianta", /formato/],
  ];
  for (const [nome, guasta, motivo] of casi) {
    const p = base(); const q = guasta(p) ?? p;
    const r = await apri(T.org, PROGETTO, { pianta: q });
    assert.equal(errore(r), "pianta_non_valida", nome + ": " + JSON.stringify(r.d).slice(0, 200));
    assert.match(String(r.d.motivo), motivo, nome + ": " + r.d.motivo);
  }
  /* il caso buono appena sotto: 2000 posti esatti passano */
  const p = base(); p.box = [0, 0, 100, 100]; p.palco = []; p.pedane = [];
  p.posti = Array.from({ length: 2000 }, (_, i) => ({ settore: "P", fila: "A", posto: i + 1, x: 1, y: 1, w: 50, d: 50, rot: 0 }));
  const ok = await apri(T.org, PROGETTO, { pianta: p });
  assert.equal(ok.d.ok, true, JSON.stringify(ok.d).slice(0, 200));
  assert.ok((await rpc(env, T.org, "bgl_elimina", { p_evento_id: ok.d.id })).d.ok);
});

// ─────────────────────────────────────────────────────────────────────────────── organizzatore

let EV;   // l'evento principale: 8 file × 12 posti = 96
run("organizzatore: apre le prenotazioni sul suo progetto; slug e link nella forma giusta", async () => {
  const a = await apri(T.org, PROGETTO, { riservati: ["Platea|A|1", "Platea|A|2", "Platea|A|2", "Platea|Z|1"] });
  assert.equal(a.d.ok, true, JSON.stringify(a.d));
  assert.match(a.d.slug, /^[a-z2-9]{10}$/);
  assert.equal(a.d.link, "https://stageplot.it/biglietteria/?e=" + a.d.slug);
  EV = a.d;
  const l = await rpc(env, T.org, "bgl_eventi_progetto", { p_project_id: PROGETTO });
  const e = l.d.eventi.find((x) => x.id === EV.id);
  assert.deepEqual({ tot: e.posti_totali, pren: e.prenotati, ris: e.riservati, lib: e.liberi, st: e.stato, sp: e.stato_pubblico },
    { tot: 96, pren: 0, ris: 2, lib: 94, st: "aperta", sp: "aperta" }, "i tenuti da parte senza doppioni e solo se esistono");
  assert.deepEqual(Object.keys(e).sort(), ["chiusura", "id", "inizio", "liberi", "luogo", "note", "posti_totali", "prenotati", "riservati", "slug", "stato", "stato_pubblico", "titolo"].sort());
});

run("organizzatore: dati sbagliati all'apertura", async () => {
  assert.equal((await apri(T.org, PROGETTO, { titolo: "" })).d.campo, "titolo");
  assert.equal((await apri(T.org, PROGETTO, { luogo: "x".repeat(161) })).d.campo, "luogo");
  assert.equal((await apri(T.org, PROGETTO, { inizio: "domani" })).d.campo, "inizio");
  assert.equal((await apri(T.org, PROGETTO, { chiusura: fra(80) })).d.campo, "chiusura", "la chiusura non può essere dopo l'inizio");
  assert.equal((await apri(T.org, PROGETTO, { note: "n".repeat(501) })).d.campo, "note");
});

run("organizzatore: un altro account riceve sempre «non_tuo», l'anonimo non entra", async () => {
  const ris = await rpc(env, admin(env), "bgl_prenota", { p_slug: EV.slug, p_posti: ["Platea|H|12"], p_nome: "Anna", p_cognome: "Bianchi", p_email: pubblico("altrui") });
  assert.equal(ris.d.ok, true, JSON.stringify(ris.d));
  const chiamate = [
    ["bgl_apri", { p_project_id: PROGETTO, p_evento: evento() }],
    ["bgl_modifica", { p_evento_id: EV.id, p_campi: { stato: "chiusa" } }],
    ["bgl_eventi_progetto", { p_project_id: PROGETTO }],
    ["bgl_prenotati", { p_evento_id: EV.id }],
    ["bgl_annulla", { p_prenotazione_id: ris.d.prenotazione_id }],
    ["bgl_elimina", { p_evento_id: EV.id }],
  ];
  for (const [fn, args] of chiamate) {
    const r = await rpc(env, T.altro, fn, args);
    assert.equal(errore(r), "non_tuo", fn + ": " + JSON.stringify(r.d).slice(0, 200));
    const a = await rpc(env, env.ANON_KEY, fn, args);
    assert.notEqual(a.d && a.d.ok, true, "anonimo su " + fn + ": " + JSON.stringify(a.d).slice(0, 200));
  }
  /* un id che non esiste risponde come uno d'altri: non si scopre niente */
  assert.equal(errore(await rpc(env, T.org, "bgl_prenotati", { p_evento_id: "00000000-0000-4000-8000-000000000000" })), "non_tuo");
  /* e niente di quello che ha provato l'altro account ha avuto effetto */
  const dopo = await rpc(env, T.org, "bgl_prenotati", { p_evento_id: EV.id });
  assert.equal(dopo.d.evento.stato, "aperta");
  assert.equal(dopo.d.prenotazioni.find((p) => p.id === ris.d.prenotazione_id).stato, "attiva");
  /* il proprietario la vede, con nome ed email */
  const mia = dopo.d.prenotazioni.find((p) => p.id === ris.d.prenotazione_id);
  assert.equal(mia.nome, "Anna"); assert.equal(mia.email, pubblico("altrui")); assert.deepEqual(mia.posti, ["Platea|H|12"]);
  /* l'altro account non apre eventi sul progetto altrui, e sul suo sì */
  const sulSuo = await apri(T.altro, PROGETTO_B);
  assert.equal(sulSuo.d.ok, true, JSON.stringify(sulSuo.d));
  assert.equal((await rpc(env, T.altro, "bgl_elimina", { p_evento_id: sulSuo.d.id })).d.ok, true);
  assert.equal((await rpc(env, T.org, "bgl_annulla", { p_prenotazione_id: ris.d.prenotazione_id })).d.liberati, 1);
});

run("organizzatore: modifica stato, riservati e pianta; un posto prenotato non si toglie e non si tiene da parte", async () => {
  const p = await prenota(EV.slug, ["Platea|C|5"], 50);
  assert.equal(p.d.ok, true, JSON.stringify(p.d));
  const mod = (campi) => rpc(env, T.org, "bgl_modifica", { p_evento_id: EV.id, p_campi: campi });
  assert.equal(errore(await mod({ riservati: ["Platea|C|5"] })), "posto_prenotato");
  assert.deepEqual((await mod({ riservati: ["Platea|C|5"] })).d.posti, ["Platea|C|5"]);
  assert.equal(errore(await mod({ pianta: pianta({ file: "AB" }) })), "posto_prenotato", "la fila C sparirebbe con dentro una prenotazione");
  assert.equal(errore(await mod({ stato: "boh" })), "dati_non_validi");
  assert.equal(errore(await mod({ chiusura: fra(100) })), "dati_non_validi", "chiusura dopo l'inizio");
  assert.equal((await mod({ stato: "chiusa" })).d.ok, true);
  assert.equal((await pub(EV.slug)).d.evento.stato, "chiusa");
  assert.equal((await mod({ stato: "aperta", titolo: "Concerto di prova (nuovo titolo)" })).d.ok, true);
  assert.equal((await pub(EV.slug)).d.evento.titolo, "Concerto di prova (nuovo titolo)");
  /* pianta più grande che contiene ancora C5: si può; i tenuti da parte che non esistono più cadono */
  assert.equal((await mod({ riservati: ["Platea|A|1", "Platea|H|12"] })).d.ok, true);
  assert.equal((await mod({ pianta: pianta({ file: "ABCDEFG", perFila: 14 }) })).d.ok, true);
  const dopo = await rpc(env, T.org, "bgl_prenotati", { p_evento_id: EV.id });
  assert.deepEqual(dopo.d.evento.riservati, ["Platea|A|1"], "H12 non c'è più nella pianta nuova");
  assert.equal(dopo.d.evento.posti_totali, 98);
  /* si torna alla pianta di partenza per il resto delle prove */
  assert.equal((await mod({ pianta: pianta(), riservati: ["Platea|A|1", "Platea|A|2"] })).d.ok, true);
  assert.equal((await rpc(env, T.org, "bgl_annulla", { p_prenotazione_id: p.d.prenotazione_id })).d.liberati, 1);
});

// ──────────────────────────────────────────────────────────────────────── prenotazione atomica

run("prenotazione: forma della risposta; il token esce una volta e nel database c'è solo la sua impronta", async () => {
  const r = await prenota(EV.slug, ["Platea|B|5", "Platea|B|6", "Platea|B|5"], 60, { p_nome: "  Mario ", p_email: "  " + pubblico(60).toUpperCase() + " " });
  assert.equal(r.d.ok, true, JSON.stringify(r.d));
  assert.deepEqual(Object.keys(r.d).sort(), ["codice", "cognome", "email", "evento", "nome", "ok", "posti", "prenotazione_id", "token"]);
  assert.match(r.d.token, /^[0-9a-f]{32}$/);
  assert.match(r.d.codice, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.deepEqual(r.d.posti, ["Platea|B|5", "Platea|B|6"], "i doppioni si tolgono");
  assert.equal(r.d.nome, "Mario", "spazi tagliati");
  assert.deepEqual(Object.keys(r.d.evento).sort(), ["inizio", "luogo", "slug", "titolo"]);
  const riga = (await rest(env, admin(env), "bgl_prenotazioni?select=token_hash,email_norm&id=eq." + r.d.prenotazione_id)).d[0];
  assert.notEqual(riga.token_hash, r.d.token, "il token in chiaro non è salvato");
  assert.equal(riga.token_hash, impronta(r.d.token), "è salvata la sua impronta sha256");
  assert.equal(riga.email_norm, pubblico(60), "email normalizzata: minuscole, senza spazi");
});

run("CONCORRENZA: 30 prenotazioni nello stesso istante sullo stesso posto → ne vince UNA", async () => {
  /* tre giri su tre posti diversi: una gara sola può non cadere nel momento giusto */
  for (const posto of ["Platea|D|1", "Platea|D|2", "Platea|D|3"]) {
    const tutte = await Promise.all(Array.from({ length: 30 }, (_, i) => prenota(EV.slug, [posto], 100 + i)));
    const ok = tutte.filter((r) => r.d && r.d.ok === true);
    const presi = tutte.filter((r) => errore(r) === "posto_preso");
    assert.equal(ok.length, 1, posto + ": vincitori " + ok.length + " — " + JSON.stringify(tutte.map((r) => r.d && (r.d.errore || r.d.code || "ok"))));
    assert.equal(presi.length, 29, "gli altri 29 sentono «posto_preso», non un errore qualunque: " + JSON.stringify(tutte.filter((r) => errore(r) !== "posto_preso" && !(r.d && r.d.ok)).map((r) => r.d)));
    for (const r of presi) assert.deepEqual(r.d.presi, [posto]);
    const righe = (await rest(env, admin(env), "bgl_posti?select=prenotazione_id&posto=eq." + encodeURIComponent(posto) + "&evento_id=eq." + EV.id)).d;
    assert.equal(righe.length, 1, "una riga sola per quel posto");
    assert.equal(righe[0].prenotazione_id, ok[0].d.prenotazione_id);
    /* chi ha perso non ha lasciato una prenotazione orfana */
    const orfane = (await rest(env, admin(env), "bgl_prenotazioni?select=id&evento_id=eq." + EV.id + "&posti=cs.{" + encodeURIComponent(posto) + "}")).d;
    assert.equal(orfane.length, 1, "nessuna prenotazione senza posti: " + orfane.length);
  }
});

run("CONCORRENZA: gara mista su coppie che si sovrappongono → nessun posto con due proprietari, mai mezza prenotazione", async () => {
  /* E1-E2, E2-E3, ... E10-E11 tutte insieme */
  const coppie = Array.from({ length: 10 }, (_, i) => ["Platea|E|" + (i + 1), "Platea|E|" + (i + 2)]);
  const tutte = await Promise.all(coppie.map((c, i) => prenota(EV.slug, c, 200 + i)));
  const ok = tutte.filter((r) => r.d && r.d.ok);
  assert.ok(ok.length >= 1 && ok.length <= 5, "fra 1 e 5 vincitori: " + ok.length);
  for (const r of tutte) assert.ok((r.d && r.d.ok) || errore(r) === "posto_preso", JSON.stringify(r.d));
  const righe = (await rest(env, admin(env), "bgl_posti?select=posto,prenotazione_id&evento_id=eq." + EV.id + "&posto=like." + encodeURIComponent("Platea|E|*"))).d;
  const perPosto = new Map(righe.map((x) => [x.posto, x.prenotazione_id]));
  assert.equal(perPosto.size, righe.length, "nessun posto due volte");
  for (const r of ok) for (const p of r.d.posti) assert.equal(perPosto.get(p), r.d.prenotazione_id, "ogni vincitore ha TUTTI i suoi posti: " + p);
  assert.equal(righe.length, ok.length * 2, "e nessun posto di chi ha perso");
});

run("tetto per email: 4 posti in due richieste sì, la terza no; un'altra email sì", async () => {
  const mia = { p_email: pubblico("tetto") };
  assert.equal((await prenota(EV.slug, ["Platea|F|1", "Platea|F|2"], 300, mia)).d.ok, true);
  assert.equal((await prenota(EV.slug, ["Platea|F|3", "Platea|F|4"], 300, { p_email: pubblico("tetto").toUpperCase() })).d.ok, true);
  const no = await prenota(EV.slug, ["Platea|F|5"], 300, { p_email: "  " + pubblico("tetto") });
  assert.equal(errore(no), "limite_email", JSON.stringify(no.d));
  assert.equal(no.d.gia, 4); assert.equal(no.d.max, 4);
  assert.equal((await prenota(EV.slug, ["Platea|F|5"], 301)).d.ok, true, "un'altra email prenota");
  assert.equal(errore(await prenota(EV.slug, ["Platea|F|6", "Platea|F|7", "Platea|F|8", "Platea|F|9", "Platea|F|10"], 302)), "troppi_posti");
});

run("tetto per email IN PARALLELO: 3 richieste da 2 posti con la stessa email (maiuscole e spazi diversi) → al massimo 2", async () => {
  for (let giro = 0; giro < 3; giro++) {
    const em = pubblico("parallelo" + giro);
    const forme = [em, em.toUpperCase(), "  " + em + "  "];
    const [fila, base] = [["G", 1], ["G", 7], ["C", 7]][giro];
    const tutte = await Promise.all(forme.map((e, i) => prenota(EV.slug, ["Platea|" + fila + "|" + (base + i * 2), "Platea|" + fila + "|" + (base + i * 2 + 1)], 400 + giro, { p_email: e })));
    const ok = tutte.filter((r) => r.d && r.d.ok);
    assert.ok(ok.length <= 2, "giro " + giro + ": " + ok.length + " richieste passate, oltre il tetto di 4 posti");
    assert.equal(ok.length, 2, "e il tetto non blocca chi è sotto: " + JSON.stringify(tutte.map((r) => r.d)));
    for (const r of tutte.filter((x) => !(x.d && x.d.ok))) assert.equal(errore(r), "limite_email", JSON.stringify(r.d));
  }
});

run("prenotazione: riservati, inesistenti, dati non validi, evento che non c'è", async () => {
  const r = await prenota(EV.slug, ["Platea|A|1", "Platea|A|3"], 500);
  assert.equal(errore(r), "posto_riservato"); assert.deepEqual(r.d.posti, ["Platea|A|1"]);
  const i = await prenota(EV.slug, ["Platea|Z|1"], 500);
  assert.equal(errore(i), "posto_inesistente"); assert.deepEqual(i.d.posti, ["Platea|Z|1"]);
  assert.equal(errore(await prenota("zzzzzzzzzz", ["Platea|A|3"], 500)), "evento_inesistente");
  assert.equal(errore(await prenota("ZZ'; drop", ["Platea|A|3"], 500)), "evento_inesistente");
  const campo = async (o, atteso) => {
    const x = await prenota(EV.slug, ["Platea|A|3"], 500, o);
    assert.equal(errore(x), "dati_non_validi", JSON.stringify(o)); assert.equal(x.d.campo, atteso, JSON.stringify(o));
  };
  await campo({ p_nome: "" }, "nome");
  await campo({ p_nome: "x".repeat(61) }, "nome");
  await campo({ p_nome: "Ma\u0007rio" }, "nome");
  await campo({ p_cognome: "   " }, "cognome");
  await campo({ p_email: "senza-chiocciola" }, "email");
  await campo({ p_email: "a@b" }, "email");
  await campo({ p_email: "x".repeat(250) + "@example.invalid" }, "email");
  await campo({ p_posti: [] }, "posti");
  await campo({ p_posti: ["Platea|a|3"] }, "posti");
  await campo({ p_posti: ["Platea|A|0"] }, "posti");
  assert.equal((await pub(EV.slug)).d.occupati.includes("Platea|A|3"), false, "nessuno dei tentativi ha preso A3");
});

run("prenotazioni chiuse: con stato «chiusa» e dopo la data di chiusura", async () => {
  const a = await apri(T.org, PROGETTO);
  assert.equal(a.d.ok, true);
  assert.equal((await rpc(env, T.org, "bgl_modifica", { p_evento_id: a.d.id, p_campi: { stato: "chiusa" } })).d.ok, true);
  assert.equal(errore(await prenota(a.d.slug, ["Platea|A|5"], 600)), "prenotazioni_chiuse");
  assert.equal((await rpc(env, T.org, "bgl_modifica", { p_evento_id: a.d.id, p_campi: { stato: "aperta" } })).d.ok, true);
  assert.equal((await prenota(a.d.slug, ["Platea|A|5"], 600)).d.ok, true, "riaperta, si prenota");
  assert.ok((await sposta(a.d.id, { chiusura: fra(-1), inizio: fra(2) })).ok);
  assert.equal(errore(await prenota(a.d.slug, ["Platea|A|6"], 601)), "prenotazioni_chiuse", "la chiusura è passata");
  assert.equal((await pub(a.d.slug)).d.evento.stato, "chiusa");
  assert.ok((await sposta(a.d.id, { chiusura: fra(-20), inizio: fra(-13) })).ok);
  assert.equal((await pub(a.d.slug)).d.evento.stato, "conclusa", "12 ore dopo l'inizio è conclusa");
  assert.equal((await rpc(env, T.org, "bgl_elimina", { p_evento_id: a.d.id })).d.eliminate, 1);
});

// ──────────────────────────────────────────────────────────────────── lettura pubblica e disdetta

run("PRIVACY: la lettura pubblica non contiene nomi, email, codici o id di prenotazione", async () => {
  const r = await pub(EV.slug);
  assert.equal(r.ok, true); assert.equal(r.d.ok, true);
  assert.deepEqual(Object.keys(r.d).sort(), ["evento", "liberi", "occupati", "ok", "ora", "pianta", "riservati"]);
  assert.deepEqual(Object.keys(r.d.evento).sort(), ["chiusura", "inizio", "luogo", "max_per_email", "note", "slug", "stato", "titolo"]);
  const testo = JSON.stringify(r.d);
  assert.doesNotMatch(testo, /@/, "nessuna email");
  assert.doesNotMatch(testo, /Rossi|Mario|Bianchi|Anna/, "nessun nome");
  const tutte = (await rest(env, admin(env), "bgl_prenotazioni?select=id,codice&evento_id=eq." + EV.id)).d;
  assert.ok(tutte.length > 10);
  for (const p of tutte) {
    assert.ok(!testo.includes(p.codice), "nessun codice: " + p.codice);
    assert.ok(!testo.includes(p.id), "nessun id di prenotazione");
  }
  for (const k of r.d.occupati) assert.equal(typeof k, "string");
  /* i conti tornano con quelli dell'organizzatore */
  const org = await rpc(env, T.org, "bgl_prenotati", { p_evento_id: EV.id });
  assert.equal(r.d.occupati.length, org.d.conteggi.prenotati);
  assert.deepEqual(r.d.riservati, ["Platea|A|1", "Platea|A|2"]);
  assert.equal(r.d.liberi, 96 - r.d.occupati.length - 2);
  assert.equal(org.d.conteggi.liberi, r.d.liberi);
  assert.equal(r.d.evento.max_per_email, 4);
  /* anche un account qualsiasi legge lo stesso, e niente di più */
  assert.equal(JSON.stringify((await rpc(env, T.altro, "bgl_evento_pubblico", { p_slug: EV.slug })).d.occupati), JSON.stringify(r.d.occupati));
  assert.deepEqual((await pub("aaaaaaaaaa")).d, { ok: false, errore: "evento_inesistente" });
  assert.equal(errore(await pub("x")), "evento_inesistente");
});

run("disdetta: dal link si vede e si disdice; il posto torna prenotabile; token sbagliato o d'altri no", async () => {
  const p = await prenota(EV.slug, ["Platea|H|1", "Platea|H|2"], 700);
  assert.equal(p.d.ok, true, JSON.stringify(p.d));
  const mia = (tok, slug = EV.slug) => rpc(env, env.ANON_KEY, "bgl_mia_prenotazione", { p_slug: slug, p_token: tok });
  const disdici = (tok, slug = EV.slug) => rpc(env, env.ANON_KEY, "bgl_disdici", { p_slug: slug, p_token: tok });
  const v = await mia(p.d.token);
  assert.equal(v.d.ok, true, JSON.stringify(v.d));
  assert.deepEqual(Object.keys(v.d).sort(), ["codice", "evento", "ok", "posti", "stato"]);
  assert.deepEqual(v.d.posti, ["Platea|H|1", "Platea|H|2"]); assert.equal(v.d.codice, p.d.codice); assert.equal(v.d.stato, "attiva");
  assert.doesNotMatch(JSON.stringify(v.d), /@|Rossi|Mario/, "niente nome né email");
  /* token sbagliato, impronta al posto del token, token di un altro evento */
  assert.equal(errore(await mia("0".repeat(32))), "token_non_valido");
  assert.equal(errore(await disdici("0".repeat(32))), "token_non_valido");
  const salvata = (await rest(env, admin(env), "bgl_prenotazioni?select=token_hash&id=eq." + p.d.prenotazione_id)).d[0].token_hash;
  assert.equal(errore(await disdici(salvata)), "token_non_valido", "chi legge la tabella non disdice");
  const altro = await apri(T.org, PROGETTO);
  assert.equal(errore(await mia(p.d.token, altro.d.slug)), "token_non_valido", "il token vale solo per il suo evento");
  assert.equal(errore(await disdici(p.d.token, altro.d.slug)), "token_non_valido");
  /* l'organizzatore annulla un posto: la prenotazione resta attiva con l'altro */
  assert.equal((await rpc(env, T.org, "bgl_annulla", { p_prenotazione_id: p.d.prenotazione_id, p_posti: ["Platea|H|2"] })).d.liberati, 1);
  assert.deepEqual((await mia(p.d.token)).d.posti, ["Platea|H|1"]);
  /* disdetta vera */
  const d = await disdici(p.d.token);
  assert.deepEqual(d.d, { ok: true, liberati: 1 });
  assert.equal(errore(await disdici(p.d.token)), "gia_disdetta");
  assert.equal((await mia(p.d.token)).d.stato, "disdetta");
  assert.equal((await pub(EV.slug)).d.occupati.includes("Platea|H|1"), false, "H1 è di nuovo libero");
  assert.equal((await prenota(EV.slug, ["Platea|H|1"], 701)).d.ok, true, "e si riprenota");
  /* dopo l'inizio non si disdice più */
  const q = await prenota(altro.d.slug, ["Platea|B|1"], 702);
  assert.equal(q.d.ok, true);
  assert.ok((await sposta(altro.d.id, { chiusura: fra(-2), inizio: fra(-1) })).ok);
  assert.equal(errore(await disdici(q.d.token, altro.d.slug)), "evento_concluso");
  assert.equal((await rpc(env, T.org, "bgl_elimina", { p_evento_id: altro.d.id })).d.eliminate, 1);
});

run("organizzatore: il pannello ha tutto e l'annullamento completo chiude la prenotazione", async () => {
  const r = await rpc(env, T.org, "bgl_prenotati", { p_evento_id: EV.id });
  assert.equal(r.d.ok, true);
  assert.deepEqual(Object.keys(r.d).sort(), ["conteggi", "evento", "ok", "prenotazioni"]);
  assert.deepEqual(Object.keys(r.d.conteggi).sort(), ["liberi", "prenotati", "prenotazioni_attive", "riservati", "totali"]);
  const p = r.d.prenotazioni.find((x) => x.stato === "attiva");
  assert.deepEqual(Object.keys(p).sort(), ["chiusa_il", "codice", "cognome", "creata_il", "email", "id", "nome", "posti", "posti_chiesti", "stato"]);
  const a = await rpc(env, T.org, "bgl_annulla", { p_prenotazione_id: p.id });
  assert.equal(a.d.ok, true); assert.equal(a.d.liberati, p.posti.length);
  const dopo = (await rpc(env, T.org, "bgl_prenotati", { p_evento_id: EV.id })).d.prenotazioni.find((x) => x.id === p.id);
  assert.equal(dopo.stato, "annullata"); assert.ok(dopo.chiusa_il); assert.deepEqual(dopo.posti, []);
  assert.deepEqual(dopo.posti_chiesti, p.posti_chiesti, "la storia resta");
  assert.equal(errore(await rpc(env, T.org, "bgl_annulla", { p_prenotazione_id: p.id })), "gia_disdetta");
});

run("tetto: 50 eventi per account, il 51° no", async () => {
  const gia = (await rest(env, admin(env), "bgl_eventi?select=id&user_id=eq." + U.org)).d.length;
  const piccola = pianta({ file: "A", perFila: 2 });
  for (let i = gia; i < 50; i++) assert.equal((await apri(T.org, PROGETTO, { pianta: piccola, titolo: "Prova " + i })).d.ok, true, "evento " + i);
  assert.equal(errore(await apri(T.org, PROGETTO, { pianta: piccola })), "troppi_eventi");
  /* si torna sotto: si eliminano quelli di prova (non l'evento principale) */
  const tutti = (await rpc(env, T.org, "bgl_eventi_progetto", { p_project_id: PROGETTO })).d.eventi.filter((e) => e.id !== EV.id);
  for (const e of tutti) assert.equal((await rpc(env, T.org, "bgl_elimina", { p_evento_id: e.id })).d.ok, true);
  assert.equal((await apri(T.org, PROGETTO, { pianta: piccola })).d.ok, true, "eliminandone, si riparte");
});

// ─────────────────────────────────────────────────────────────────────────────────────── purga

run("purga: 30 giorni dopo l'evento nomi ed email spariscono; a 29 restano; impronte IP via dopo 7 giorni", async () => {
  const vecchio = await apri(T.org, PROGETTO, { pianta: pianta({ file: "A", perFila: 3 }) });
  const recente = await apri(T.org, PROGETTO, { pianta: pianta({ file: "A", perFila: 3 }) });
  const pv = await prenota(vecchio.d.slug, ["Platea|A|1"], 800);
  const pr = await prenota(recente.d.slug, ["Platea|A|1"], 801);
  assert.ok(pv.d.ok && pr.d.ok);
  const giorni = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
  assert.ok((await sposta(vecchio.d.id, { chiusura: giorni(31), inizio: giorni(31) })).ok);
  assert.ok((await sposta(recente.d.id, { chiusura: giorni(29), inizio: giorni(29) })).ok);
  const h8 = impronta("otto-giorni-" + stamp), h1 = impronta("un-giorno-" + stamp);
  const ora = (n) => { const d = new Date(Date.now() - n * 86_400_000); d.setUTCMinutes(0, 0, 0); return d.toISOString(); };
  assert.ok((await rest(env, admin(env), "bgl_throttle", { method: "POST", body: [{ ip_hash: h8, window_start: ora(8), count: 3 }, { ip_hash: h1, window_start: ora(1), count: 2 }] })).ok);

  const r = await rpc(env, admin(env), "stageplot_purge_expired", {});
  assert.ok(r.ok, JSON.stringify(r.d));
  assert.ok(r.d.bgl_anonimizzate >= 1, JSON.stringify(r.d));
  assert.ok(r.d.bgl_throttle >= 1, JSON.stringify(r.d));
  for (const k of ["analytics_events", "feedback_throttle", "landing_throttle"]) assert.equal(typeof r.d[k], "number", "la purga di prima c'è ancora: " + k);

  const riga = async (id) => (await rest(env, admin(env), "bgl_prenotazioni?select=nome,cognome,email,email_norm,token_hash,anonimizzata_il,codice,posti&id=eq." + id)).d[0];
  const v = await riga(pv.d.prenotazione_id);
  assert.deepEqual([v.nome, v.cognome, v.email, v.email_norm, v.token_hash], [null, null, null, null, null], "evento di 31 giorni fa: tutto via");
  assert.ok(v.anonimizzata_il); assert.equal(v.codice, pv.d.codice, "codice e posti restano: non dicono chi"); assert.deepEqual(v.posti, ["Platea|A|1"]);
  const n = await riga(pr.d.prenotazione_id);
  assert.equal(n.nome, "Mario"); assert.equal(n.email, pubblico(801)); assert.equal(n.anonimizzata_il, null, "evento di 29 giorni fa: intatto");
  const th = (await rest(env, admin(env), "bgl_throttle?select=ip_hash&ip_hash=in.(" + h8 + "," + h1 + ")")).d.map((x) => x.ip_hash);
  await rest(env, admin(env), "bgl_throttle?ip_hash=eq." + h1, { method: "DELETE" });
  assert.deepEqual(th, [h1], "l'impronta di 8 giorni fa è sparita, quella di ieri resta");
  /* l'organizzatore vede la prenotazione anonimizzata con i campi a null; il link di disdetta non vale più */
  const org = (await rpc(env, T.org, "bgl_prenotati", { p_evento_id: vecchio.d.id })).d.prenotazioni[0];
  assert.equal(org.nome, null); assert.equal(org.email, null);
  assert.equal(errore(await rpc(env, env.ANON_KEY, "bgl_mia_prenotazione", { p_slug: vecchio.d.slug, p_token: pv.d.token })), "token_non_valido");
  /* e una seconda passata non tocca di nuovo le stesse righe */
  const r2 = await rpc(env, admin(env), "stageplot_purge_expired", {});
  const v2 = await riga(pv.d.prenotazione_id);
  assert.equal(v2.anonimizzata_il, v.anonimizzata_il, "la data di anonimizzazione non cambia");
  assert.equal(typeof r2.d.bgl_anonimizzate, "number");
  for (const e of [vecchio, recente]) await rpc(env, T.org, "bgl_elimina", { p_evento_id: e.d.id });
});

run("pulizia: l'evento principale si elimina con tutte le sue prenotazioni", async () => {
  const n = (await rest(env, admin(env), "bgl_prenotazioni?select=id&evento_id=eq." + EV.id)).d.length;
  const r = await rpc(env, T.org, "bgl_elimina", { p_evento_id: EV.id });
  assert.deepEqual(r.d, { ok: true, eliminate: n });
  assert.equal((await rest(env, admin(env), "bgl_posti?select=posto&evento_id=eq." + EV.id)).d.length, 0);
  assert.equal(errore(await pub(EV.slug)), "evento_inesistente");
});
