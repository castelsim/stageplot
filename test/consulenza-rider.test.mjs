/* «Rider pronto» senza progetto (10/10/2026): i pezzi che stanno in file diversi devono dire la stessa cosa.
   La pagina /consulenza/, la Edge Function (_shared/rider-order.ts) e il bucket (migrazione 0081) hanno ciascuno la
   lista dei tipi di file ammessi: se una si allarga da sola, il cliente sceglie un file che poi viene rifiutato (o
   peggio, il bucket accetta un tipo che il server non controlla). Le prove del database sono in
   orchestre/test/rls-consulenza-rider.test.mjs, la catena intera nel browser in test/e2e-consulenza/. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const leggi = (p) => readFileSync(join(root, p), "utf8");
const pagina = leggi("consulenza/index.html");
const ordine = leggi("supabase/functions/_shared/rider-order.ts");
const migr = leggi("supabase/migrations/0081_rider_senza_progetto.sql");

function tipiPagina() {
  const m = /var RIDER_TIPI = (\{[\s\S]*?\});/.exec(pagina);
  assert.ok(m, "RIDER_TIPI nella pagina");
  return JSON.parse(m[1].replace(/\/\*[\s\S]*?\*\//g, ""));
}
function tipiServer() {
  const m = /export const TIPI_AMMESSI: Record<string, string\[\]> = (\{[\s\S]*?\});/.exec(ordine);
  assert.ok(m, "TIPI_AMMESSI nel server");
  return JSON.parse(m[1].replace(/,\s*\}/, "}"));
}
function tipiBucket() {
  const m = /'consultation-uploads', 'consultation-uploads', false, (\d+), array\[([\s\S]*?)\]\)/.exec(migr);
  assert.ok(m, "il bucket nella 0081");
  return { limite: Number(m[1]), tipi: [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]) };
}

test("la stessa lista di tipi nella pagina, nel server e nel bucket", () => {
  const p = tipiPagina(), s = tipiServer(), b = tipiBucket();
  const daServer = {};
  for (const [tipo, est] of Object.entries(s)) for (const e of est) daServer[e] = tipo;
  assert.deepEqual(Object.keys(p).sort(), Object.keys(daServer).sort(), "le stesse estensioni");
  for (const e of Object.keys(p)) assert.equal(p[e], daServer[e], "stesso tipo per ." + e);
  assert.deepEqual([...new Set(Object.values(p))].sort(), [...b.tipi].sort(), "il bucket ammette esattamente quei tipi");
  const accept = /id="odFiles"[^>]*accept="([^"]+)"/.exec(pagina);
  assert.ok(accept, "il campo file ha accept");
  const est = accept[1].split(",").filter((x) => x.startsWith(".")).map((x) => x.slice(1));
  assert.deepEqual(est.sort(), Object.keys(p).sort(), "il selettore propone le stesse estensioni");
  assert.ok(!/svg|html|javascript|octet-stream|zip/i.test(b.tipi.join(" ") + accept[1]), "niente tipi eseguibili o contenitori");
});

test("gli stessi limiti: 8 file da 10 MB, bucket privato", () => {
  const b = tipiBucket();
  assert.equal(b.limite, 10485760);
  assert.match(ordine, /export const MAX_FILE_BYTES = 10_485_760;/);
  assert.match(ordine, /export const MAX_FILES = 8;/);
  assert.match(pagina, /var RIDER_MAX_FILES = 8, RIDER_MAX_BYTES = 10485760;/);
  assert.match(migr, /jsonb_array_length\(attachments\) <= 8/);
  assert.match(migr, /on conflict \(id\) do update set public = false/);
  assert.ok(!/on storage\.objects/.test(migr), "nessuna policy: i file li legge solo il servizio");
});

test("il link di pagamento del Rider pronto resta vuoto nel repo (lo mette la sessione principale)", () => {
  assert.match(pagina, /"rider-pronto": "",/);
  assert.match(pagina, /if \(!PAY\[currentProduct\]\)/, "senza link non si crea nessuna richiesta");
});

test("senza progetto solo per il Rider pronto, anche nel database", () => {
  assert.match(migr, /check \(not senza_progetto or \(product = 'rider-pronto' and project_id is null\)\)/);
  assert.match(migr, /v_project_ok := v_request\.product = 'rider-pronto' and v_request\.project_id is null;/);
});

test("l'associazione del pagamento della 0081 contiene tutta quella della 0029 (stessi controlli)", () => {
  const corpo = (sql) => {
    const i = sql.indexOf("create or replace function public.stageplot_associate_consultation_payment(");
    return sql.slice(i, sql.indexOf("$$;", i));
  };
  const nuove = new Set(corpo(migr).split("\n").map((l) => l.trim()).filter(Boolean));
  const mancanti = corpo(leggi("supabase/migrations/0029_consultation_payment_atomic_association.sql"))
    .split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !nuove.has(l));
  assert.deepEqual(mancanti, [], "righe della 0029 sparite dalla 0081");
});

test("la pagina: senza progetto il rider manda il materiale, gli altri pacchetti chiedono ancora lo Stage Plot", () => {
  assert.match(pagina, /Mandaci quello che hai/);
  assert.match(pagina, /if \(pid\) body\.project_id = pid;/, "il progetto si manda solo se scelto");
  assert.match(pagina, /uploadToSignedUrl\(up\[i\]\.path, up\[i\]\.token, files\[i\]/, "i file passano dal link firmato");
  assert.match(pagina, /Seleziona prima uno Stage Plot\./, "gli altri pacchetti come prima");
  const iPaga = pagina.indexOf("vaiAlPagamento(o.j.request_id, email)"), iCarica = pagina.indexOf("uploadToSignedUrl(");
  assert.ok(iPaga > 0 && iCarica > 0, "carica e poi paga");
});

test("mail, notifiche e pulizia sanno del Rider senza progetto", () => {
  for (const f of ["stripe-webhook", "process-consultation-notifications"]) {
    const src = leggi(`supabase/functions/${f}/index.ts`);
    assert.match(src, /senza_progetto,rider_per,event_date,notes,attachments,allegati_rimossi_at/, f + ": legge il materiale");
    assert.match(src, /claimed\.senza_progetto === true\s*\?\s*null/, f + ": niente link vivo senza progetto");
    assert.match(src, /rider,\n/, f + ": passa il materiale alla mail");
  }
  assert.match(leggi("supabase/functions/retention-purge/index.ts"), /pulisciAllegatiRider\(\{ rpc, rimuovi \}/);
});

test("privacy: allegati privati e loro cancellazione", () => {
  const p = leggi("privacy/index.html");
  assert.match(p, /Per il «Rider pronto» il progetto non è obbligatorio/);
  assert.match(p, /90 giorni dopo il pagamento, oppure 7 giorni dopo la richiesta/);
  assert.match(ordine, /ALLEGATI_PAGATI_GIORNI = 90;/);
  assert.match(ordine, /ALLEGATI_NON_PAGATI_GIORNI = 7;/);
  assert.match(migr, /r\.created_at < p_ora - interval '7 days'/);
  assert.match(migr, /coalesce\(r\.paid_at, r\.created_at\) < p_ora - interval '90 days'/);
});
