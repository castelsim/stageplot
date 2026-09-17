/* Accesso con Google da stageplot.it (/accedi/google/): Google deve mostrare il nostro dominio, e la
   pagina di ritorno non deve far entrare chi arriva con una risposta non chiesta. 17/09/2026. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const R = new URL("../../", import.meta.url);
const leggi = (p) => readFileSync(new URL(p, R), "utf8");
const ctx = { window: {} };
vm.runInNewContext(leggi("accedi/google/avvio.js"), ctx);
const G = ctx.window.spGoogle;

test("il ritorno resta dentro il sito", () => {
  assert.equal(G.ritornoSicuro("/orchestre/login/?next=%2Forchestre%2Fadmin%2F"), "/orchestre/login/?next=%2Forchestre%2Fadmin%2F");
  assert.equal(G.ritornoSicuro("/app/?view=x"), "/app/?view=x");
  for (const cattivo of ["//evil.example/", "https://evil.example/", "javascript:alert(1)", "/\\evil", "/a b", "", null, "/accedi/google/"])
    assert.equal(G.ritornoSicuro(cattivo), "/app/", "rifiutato: " + cattivo);
});

test("Google torna a stageplot.it, con l'impronta del nonce e lo state", () => {
  const u = new URL(G.urlGoogle("https://stageplot.it", "HASH", "STATO"));
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("redirect_uri"), "https://stageplot.it/accedi/google/");
  assert.equal(u.searchParams.get("response_type"), "id_token");
  assert.equal(u.searchParams.get("nonce"), "HASH");
  assert.equal(u.searchParams.get("state"), "STATO");
  assert.match(u.searchParams.get("scope"), /\bopenid\b/);
  assert.equal(u.searchParams.get("client_id"), G.CLIENT_ID);
});

test("la risposta si legge dal frammento", () => {
  const r = G.leggiRisposta("#state=abc&id_token=eyJ.a.b&authuser=0&prompt=none");
  assert.equal(r.state, "abc");
  assert.equal(r.id_token, "eyJ.a.b");
});

test("entra solo la risposta alla propria richiesta, fresca, e a Supabase va il nonce grezzo", () => {
  const ora = 1_000_000;
  const salvato = { nonce: "GREZZO", state: "S1", back: "/consulenza/", t: ora - 1000 };
  const ok = G.verificaRisposta({ state: "S1", id_token: "TOK" }, salvato, ora);
  assert.equal(ok.ok, true);
  assert.equal(ok.nonce, "GREZZO");
  assert.equal(ok.token, "TOK");
  assert.equal(ok.back, "/consulenza/");
  assert.equal(G.verificaRisposta({ state: "ALTRO", id_token: "TOK" }, salvato, ora).motivo, "state");
  assert.equal(G.verificaRisposta({ id_token: "TOK" }, salvato, ora).motivo, "state");
  assert.equal(G.verificaRisposta({ state: "S1", id_token: "TOK" }, null, ora).motivo, "sessione");
  assert.equal(G.verificaRisposta({ state: "S1", id_token: "TOK" }, salvato, ora + G.VALIDITA_MS).motivo, "scaduto");
  assert.equal(G.verificaRisposta({ state: "S1" }, salvato, ora).motivo, "token");
  assert.equal(G.verificaRisposta({ error: "access_denied", state: "S1" }, salvato, ora).motivo, "annullato");
  assert.equal(G.verificaRisposta({ state: "S1", id_token: "TOK" }, { ...salvato, back: "//evil.example" }, ora).back, "/app/");
});

test("la pagina di ritorno toglie il token dall'indirizzo e consuma la richiesta prima di entrare", () => {
  const js = leggi("accedi/google/ritorno.js");
  const pulisci = js.indexOf("history.replaceState");
  const consuma = js.indexOf("sessionStorage.removeItem(G.CHIAVE)");
  const entra = js.indexOf("signInWithIdToken");
  assert.ok(pulisci > 0 && consuma > 0 && entra > 0);
  assert.ok(pulisci < js.indexOf("spGoogle"), "il frammento si toglie per prima cosa");
  assert.ok(consuma < entra, "lo state vale una volta sola");
  assert.match(js, /nonce:\s*esito\.nonce/);
  const html = leggi("accedi/google/index.html");
  assert.doesNotMatch(html, /unsafe-inline/);
  assert.ok(html.indexOf("avvio.js") < html.indexOf("ritorno.js"));
});

test("editor, consulenza e Orchestre partono dal nuovo accesso, con il login di prima come riserva", () => {
  const editor = leggi("index.template.html");
  assert.match(editor, /<script defer src="\/accedi\/google\/avvio\.js"><\/script>/);
  const sEd = editor.slice(editor.indexOf("function signIn(){"), editor.indexOf("function signOut(){"));
  assert.ok(sEd.indexOf("g.accedi(") > 0 && sEd.indexOf("g.accedi(") < sEd.indexOf("signInWithOAuth"));
  const cons = leggi("consulenza/index.html");
  assert.match(cons, /<script src="\/accedi\/google\/avvio\.js"><\/script>/);
  const sCo = cons.slice(cons.indexOf("function startLogin("), cons.indexOf("function fillDrawer("));
  assert.ok(sCo.indexOf("g.accedi(") > 0 && sCo.indexOf("g.accedi(") < sCo.indexOf("signInWithOAuth"));
  const auth = leggi("orchestre/src/auth.js");
  const sOr = auth.slice(auth.indexOf("export async function signIn("), auth.indexOf("export async function signOut("));
  assert.ok(sOr.indexOf("g.accedi(") > 0 && sOr.indexOf("g.accedi(") < sOr.indexOf("signInWithOAuth"));
  for (const pg of ["login", "mie-richieste", "richiedi", "candidatura"]) {
    const h = leggi(`orchestre/${pg}/index.html`);
    assert.ok(h.includes('<script src="/accedi/google/avvio.js"></script>'), pg + " carica avvio.js");
    assert.ok(h.indexOf("avvio.js") < h.indexOf('type="module"'), pg + ": prima del modulo");
  }
});

test("la cartella si pubblica e il service worker non la mette in cache", () => {
  assert.match(leggi(".github/workflows/pages.yml"), /rsync[\s\S]*\baccedi\b[\s\S]*\.\/_site\//);
  const sw = leggi("sw.js");
  const esclusa = sw.indexOf('indexOf("/accedi/") === 0) return;');
  assert.ok(esclusa > 0 && esclusa < sw.indexOf("e.respondWith("));
});
