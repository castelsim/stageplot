/* «Rider pronto» senza progetto (0081): database e Storage LOCALI. Dati inventati (@example.invalid, «I Prova»).
   - solo il Rider pronto nasce senza progetto (vincolo + funzione di associazione del pagamento);
   - una consulenza normale il cui progetto non c'è più resta «project_unavailable» come prima;
   - gli allegati: si caricano solo col link firmato del servizio, tipo e peso controllati dal bucket, nessuna
     sovrascrittura; l'anonimo, un altro account e NEMMENO chi li ha caricati li legge o li elenca; il servizio sì;
   - la retention: quali allegati scadono (7 giorni senza pagamento, 90 dal pagamento) e la richiesta che li dimentica. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { env, run, stamp, rest, rpc, admin, account, progetto, psql } from "./_bgl.mjs";

const S = stamp(), U = {};
const BUCKET = "consultation-uploads";
const serv = () => admin(env);

async function richiesta(campi) {
  const id = campi.id || randomUUID();
  const r = await rest(env, serv(), "consultation_requests", { method: "POST", body: {
    id, name: "Mario Prova", email: `cliente-${S}@example.invalid`, product: "rider-pronto", status: "new", paid: false,
    share_token: randomUUID(), ...campi } });
  return { id, ...r };
}
const firmaCaricamento = (path) => fetch(`${env.API_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: "POST",
  headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + serv(), "Content-Type": "application/json" }, body: "{}" })
  .then(async (r) => ({ status: r.status, d: await r.json().catch(() => null) }));
function caricaFirmato(path, token, { tipo = "application/pdf", byte = 2000 } = {}) {
  return fetch(`${env.API_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}?token=${encodeURIComponent(token)}`, { method: "PUT",
    headers: { apikey: env.ANON_KEY, "Content-Type": tipo, "x-upsert": "false" }, body: Buffer.alloc(byte, 37) })
    .then(async (r) => ({ ok: r.ok, status: r.status, testo: await r.text() }));
}
const scarica = (tok, path) => fetch(`${env.API_URL}/storage/v1/object/authenticated/${BUCKET}/${path}`, {
  headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + tok } }).then((r) => r.status);
const pubblico = (path) => fetch(`${env.API_URL}/storage/v1/object/public/${BUCKET}/${path}`).then((r) => r.status);
const elenco = (tok, prefix) => fetch(`${env.API_URL}/storage/v1/object/list/${BUCKET}`, { method: "POST",
  headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + tok, "Content-Type": "application/json" },
  body: JSON.stringify({ prefix, limit: 100 }) }).then(async (r) => (r.ok ? r.json() : []));
const caricaDiretto = (tok, path) => fetch(`${env.API_URL}/storage/v1/object/${BUCKET}/${path}`, { method: "POST",
  headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + tok, "Content-Type": "application/pdf" }, body: Buffer.alloc(100, 1) })
  .then((r) => r.status);
const associa = (id, n) => rpc(env, serv(), "stageplot_associate_consultation_payment", {
  p_request_id: id, p_stripe_session_id: `cs_test_prova${S}${n}`, p_payment_intent_id: `pi_test_prova${S}${n}`,
  p_stripe_event_id: `evt_test_prova${S}${n}`, p_amount: 5900, p_paid_at: new Date().toISOString(),
  p_share_expires_at: new Date(Date.now() + 90 * 86400e3).toISOString() });

run("preparazione", async () => {
  U.a = await account("rider-a", S);
  U.b = await account("rider-b", S);
});

run("solo il Rider pronto nasce senza progetto, e senza progetto vuol dire nessun progetto", async () => {
  const ok = await richiesta({ user_id: U.a.uid, senza_progetto: true, notes: "Quartetto di prova" });
  assert.ok(ok.ok, JSON.stringify(ok.d));
  for (const product of ["pro-review", "production-pack"]) {
    const r = await richiesta({ user_id: U.a.uid, product, senza_progetto: true });
    assert.equal(r.ok, false, product);
    assert.equal(r.d.code, "23514", product + ": " + JSON.stringify(r.d));
  }
  const prog = await progetto(U.a, { _v: 1, items: [] }, "Progetto rider di prova");
  const conProg = await richiesta({ user_id: U.a.uid, senza_progetto: true, project_id: prog });
  assert.equal(conProg.ok, false, "senza_progetto con un progetto");
  const nove = await richiesta({ user_id: U.a.uid, senza_progetto: true,
    attachments: Array.from({ length: 9 }, (_, i) => ({ path: `rider/x/${i}.pdf`, name: i + ".pdf" })) });
  assert.equal(nove.ok, false, "più di 8 allegati");
  const lunga = await richiesta({ user_id: U.a.uid, senza_progetto: true, notes: "x".repeat(4001) });
  assert.equal(lunga.ok, false, "descrizione oltre 4000 caratteri");
});

run("il pagamento si associa alla richiesta senza progetto; una consulenza senza progetto (cancellato) resta bloccata", async () => {
  const r = await richiesta({ user_id: U.a.uid, senza_progetto: true, notes: "Solo descrizione" });
  const a = await associa(r.id, "a");
  assert.equal(a.d.outcome, "associated", JSON.stringify(a.d));
  assert.equal(a.d.request.senza_progetto, true);
  const di = await rest(env, serv(), `consultation_requests?id=eq.${r.id}&select=paid,status,notification_status`);
  assert.deepEqual(di.d[0], { paid: true, status: "paid", notification_status: "pending" });
  assert.equal((await associa(r.id, "a")).d.outcome, "already_associated", "lo stesso evento due volte");
  assert.equal((await associa(r.id, "z")).d.outcome, "duplicate_payment", "un secondo pagamento sulla stessa richiesta");

  /* Rider pronto NON dichiarato senza progetto, con project_id nullo (progetto cancellato, FK set null): come prima */
  const orfana = await richiesta({ user_id: U.a.uid, senza_progetto: false });
  assert.equal((await associa(orfana.id, "b")).d.outcome, "project_unavailable");
  const pr = await richiesta({ user_id: U.a.uid, product: "pro-review" });
  assert.equal((await associa(pr.id, "c")).d.outcome, "project_unavailable", "una Consulenza Tecnica senza progetto");

  /* Col progetto: come prima */
  const prog = await progetto(U.a, { _v: 1, items: [] }, "Progetto rider di prova 2");
  const conProg = await richiesta({ user_id: U.a.uid, project_id: prog });
  assert.equal((await associa(conProg.id, "d")).d.outcome, "associated");
});

run("le funzioni del servizio non le chiama né l'anonimo né un account; le richieste non si leggono", async () => {
  const r = await richiesta({ user_id: U.a.uid, senza_progetto: true, notes: "x" });
  for (const tok of [env.ANON_KEY, U.a.tok]) {
    assert.notEqual((await rpc(env, tok, "stageplot_rider_allegati_scaduti", { p_ora: new Date().toISOString() })).status, 200);
    assert.notEqual((await rpc(env, tok, "stageplot_rider_allegati_dimentica", { p_ids: [r.id] })).status, 200);
    const l = await rest(env, tok, `consultation_requests?id=eq.${r.id}&select=id,notes,attachments`);
    assert.ok(!l.ok || !l.d.length, "la richiesta non si legge dal browser: " + l.status);
  }
  const x = await rpc(env, U.a.tok, "stageplot_associate_consultation_payment", { p_request_id: r.id, p_stripe_session_id: "cs_test_x123",
    p_payment_intent_id: "pi_test_x123", p_stripe_event_id: "evt_test_x123", p_amount: 5900, p_paid_at: new Date().toISOString(),
    p_share_expires_at: new Date(Date.now() + 1e9).toISOString() });
  assert.notEqual(x.status, 200, "un account non associa pagamenti");
});

run("allegati: si caricano solo col link firmato, tipo e peso controllati, niente sovrascritture", async () => {
  const id = randomUUID(), path = `rider/${id}/1-rider-di-prova.pdf`;
  assert.notEqual(await caricaDiretto(U.a.tok, path), 200, "un account non carica da solo");
  assert.notEqual(await caricaDiretto(env.ANON_KEY, path), 200, "l'anonimo nemmeno");
  const f = await firmaCaricamento(path);
  assert.equal(f.status, 200, JSON.stringify(f.d));
  const token = new URL(f.d.url, env.API_URL).searchParams.get("token");
  assert.ok(token);
  assert.equal((await caricaFirmato(path, token, { tipo: "text/html" })).ok, false, "html rifiutato dal bucket");
  assert.equal((await caricaFirmato(path, token, { byte: 10_485_761 })).ok, false, "oltre 10 MB rifiutato dal bucket");
  const giusto = await caricaFirmato(path, token);
  assert.ok(giusto.ok, giusto.status + " " + giusto.testo);
  assert.equal((await caricaFirmato(path, token, { byte: 10 })).ok, false, "lo stesso link non sovrascrive");
  const altro = `rider/${id}/2-altro.pdf`;
  assert.equal((await caricaFirmato(altro, token)).ok, false, "il link vale solo per il suo percorso");
  for (const [nome, est, tipo] of [["word", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["foto", "heic", "image/heic"]]) {
    const p = `rider/${id}/3-${nome}.${est}`, t = new URL((await firmaCaricamento(p)).d.url, env.API_URL).searchParams.get("token");
    assert.ok((await caricaFirmato(p, t, { tipo })).ok, nome);
  }
  U.file = path;
});

run("allegati: l'anonimo, un altro account e chi li ha caricati non li leggono né li elencano; il servizio sì", async () => {
  const path = U.file, cartella = path.split("/").slice(0, 2).join("/") + "/";
  assert.equal(await scarica(serv(), path), 200, "il servizio legge");
  for (const [chi, tok] of [["anonimo", env.ANON_KEY], ["chi l'ha caricato", U.a.tok], ["un altro account", U.b.tok]]) {
    assert.notEqual(await scarica(tok, path), 200, chi + " non legge");
    assert.deepEqual(await elenco(tok, cartella), [], chi + " non elenca");
    assert.deepEqual(await elenco(tok, "rider/"), [], chi + " non elenca la radice");
  }
  assert.notEqual(await pubblico(path), 200, "nessun indirizzo pubblico");
  const b = await fetch(`${env.API_URL}/storage/v1/bucket/${BUCKET}`, { headers: { apikey: serv(), Authorization: "Bearer " + serv() } }).then((r) => r.json());
  assert.equal(b.public, false, "bucket privato");
});

run("retention: 7 giorni senza pagamento, 90 dal pagamento; solo i percorsi della richiesta; poi la richiesta li dimentica", async () => {
  const mk = async (paid, giorni, extra = {}) => {
    const id = randomUUID();
    await richiesta({ id, user_id: U.a.uid, senza_progetto: true, attachments: [
      { path: `rider/${id}/1-a.pdf`, name: "a.pdf", type: "application/pdf", size: 1 },
      { path: `rider/altra/1-b.pdf`, name: "b.pdf", type: "application/pdf", size: 1 },
      { path: `rider/${id}/../../x.pdf`, name: "x.pdf", type: "application/pdf", size: 1 }], ...extra });
    const quando = `now() - interval '${giorni} days'`;
    const r = await psql(`update public.consultation_requests set created_at = ${quando}, paid = ${paid}, paid_at = ${paid ? quando : "null"} where id = '${id}';`);
    assert.equal(r.code, 0, r.err);
    return id;
  };
  const nonPagata8 = await mk(false, 8), nonPagata6 = await mk(false, 6), pagata91 = await mk(true, 91), pagata89 = await mk(true, 89);
  const s = await rpc(env, serv(), "stageplot_rider_allegati_scaduti", { p_ora: new Date().toISOString(), p_limite: 1000 });
  assert.equal(s.status, 200, JSON.stringify(s.d));
  const per = Object.fromEntries(s.d.map((x) => [x.request_id, x.paths]));
  assert.deepEqual(per[nonPagata8], [`rider/${nonPagata8}/1-a.pdf`], "non pagata da 8 giorni: solo il suo percorso pulito");
  assert.deepEqual(per[pagata91], [`rider/${pagata91}/1-a.pdf`], "pagata da 91 giorni");
  assert.equal(per[nonPagata6], undefined, "non pagata da 6 giorni: non ancora");
  assert.equal(per[pagata89], undefined, "pagata da 89 giorni: non ancora");
  const d = await rpc(env, serv(), "stageplot_rider_allegati_dimentica", { p_ids: [nonPagata8, pagata91] });
  assert.equal(d.d, 2);
  const dopo = await rest(env, serv(), `consultation_requests?id=in.(${nonPagata8},${pagata91})&select=attachments,allegati_rimossi_at`);
  for (const r of dopo.d) { assert.deepEqual(r.attachments, []); assert.ok(r.allegati_rimossi_at); }
  const s2 = await rpc(env, serv(), "stageplot_rider_allegati_scaduti", { p_ora: new Date().toISOString(), p_limite: 1000 });
  assert.ok(!s2.d.some((x) => x.request_id === nonPagata8 || x.request_id === pagata91), "una volta dimenticati non tornano");
});
