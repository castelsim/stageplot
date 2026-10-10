/* Programma Fondatori (0080, 10/10/2026) — le regole provate sul Postgres LOCALE.
   L'utente inserisce e legge SOLO le sue richieste, scrive solo risposte/tipo/nome, non cambia stato né numero;
   approvare è del servizio; il tetto di 100 lo tiene il database; la lettura pubblica dà solo posti e nomi.
   Dati inventati: utenti @example.invalid. Il tetto si prova in una transazione annullata alla fine (niente resti). */
import assert from "node:assert/strict";
import { env, run, stamp, rest, rpc, admin, account, progetto, docSala, psql } from "./_bgl.mjs";

const S = stamp(), U = {};
const FRASE = (n) => "Il pannello dei monitor non trovava la mandata giusta, prova " + n;   /* piena: > 30 caratteri, > 5 parole */
const piena = (extra = {}) => ({ risposta_tempo: FRASE("uno " + S), risposta_manca: "Manca la pagina delle prese elettriche per il service " + S, ...extra });
const tabella = "fondatori_richieste";
const SEL = tabella + "?select=id,user_id,stato,numero_fondatore,decisa_il,nome_pubblico,consenso_nome";
const codice = (r) => r && r.d && r.d.code;
let RA;   /* la richiesta di A */

run("preparazione: tre account, uno con un progetto", async () => {
  U.a = await account("fond-a", S);
  U.b = await account("fond-b", S);
  U.c = await account("fond-c", S);
  await progetto(U.a, docSala(), "Progetto di prova");
});

run("anonimo: niente tabelle, solo la funzione pubblica: posti dell'ondata aperta, ondate, nomi — NIENT'ALTRO", async () => {
  const ins = await rest(env, env.ANON_KEY, tabella, { method: "POST", body: piena() });
  assert.equal(ins.ok, false, "l'anonimo non scrive: " + JSON.stringify(ins.d));
  const sel = await rest(env, env.ANON_KEY, SEL);
  assert.equal(sel.ok, false, "l'anonimo non legge la tabella: " + JSON.stringify(sel.d));
  const p = await rpc(env, env.ANON_KEY, "fondatori_pubblico", {});
  assert.equal(p.ok, true, JSON.stringify(p.d));
  assert.deepEqual(Object.keys(p.d).sort(), ["nomi", "ondata", "ondate", "posti_rimasti", "tipi"], "solo queste chiavi");
  assert.deepEqual([p.d.ondata.soglia_punti, p.d.ondata.soglia_tipi], [10, 2], "soglia dell'ondata 1: 10 punti, 2 tipi diversi");
  assert.deepEqual(p.d.tipi.map((t) => [t.codice, t.punti]),
    [["feedback", 3], ["segnalazione", 3], ["proposta", 5], ["prova", 4], ["recensione", 3], ["invito", 3], ["contenuto", 3]], "i modi di contribuire e i punti");
  assert.ok(p.d.tipi.every((t) => Object.keys(t).sort().join() === "codice,nome,punti"), "dei tipi solo codice, nome e punti");
  assert.equal(typeof p.d.posti_rimasti, "number");
  assert.deepEqual(p.d.ondata && [p.d.ondata.numero, p.d.ondata.nome, p.d.ondata.posti], [1, "Fondatore", 100], "aperta solo l'ondata 1, 100 posti");
  assert.deepEqual(p.d.ondate.map((o) => [o.numero, o.nome, o.posti, o.aperta]), [[1, "Fondatore", 100, true], [2, "Early adopter", 100, false]]);
  assert.ok(Array.isArray(p.d.nomi) && p.d.nomi.every((x) => Object.keys(x).sort().join() === "nome,ondata"),
    "di ogni nome solo il nome e l'ondata: " + JSON.stringify(p.d.nomi));
  for (const t of ["fondatori_ondate?select=numero", "fondatori_ondate?numero=eq.2", "fondatori_tipi_contributo?select=codice", "fondatori_contributi?select=id"]) {
    const w = await rest(env, env.ANON_KEY, t, t.includes("eq.2") ? { method: "PATCH", body: { aperta: true } } : {});
    assert.equal(w.ok, false, "le ondate non si leggono né si aprono da fuori: " + t + " " + JSON.stringify(w.d));
  }
});

run("il feedback deve avere contenuto: risposte banali, una sola piena o la stessa frase due volte → rifiutate (23514)", async () => {
  for (const [perche, corpo] of [
    ["bello, bravo", { risposta_tempo: "bello, bravo", risposta_manca: "bello", risposta_prossimo: "sì" }],
    ["una sola piena", { risposta_tempo: FRASE(1), risposta_manca: "niente" }],
    ["la stessa frase due volte", { risposta_tempo: FRASE(2), risposta_manca: "  " + FRASE(2).toUpperCase() }],
    ["29 caratteri", { risposta_tempo: FRASE(3), risposta_manca: "bbbb cccc dddd eeee ffff gggg" }],
  ]) {
    const r = await rest(env, U.a.tok, tabella, { method: "POST", body: corpo });
    assert.equal(r.ok, false, perche + ": " + JSON.stringify(r.d));
    assert.equal(codice(r), "23514", perche + " — il vincolo della soglia, non un altro errore: " + JSON.stringify(r.d));
  }
  /* il confine buono: 30 caratteri e 6 parole passano (poi la si cancella: serve il posto libero per il caso dopo) */
  const r = await rest(env, U.c.tok, tabella, { method: "POST", body: { risposta_tempo: FRASE(4), risposta_manca: "aaaa bbbb cccc dddd eeee fffff" } });
  assert.equal(r.ok, true, "30 caratteri e 6 parole: " + JSON.stringify(r.d));
  await rest(env, admin(env), tabella + "?id=eq." + r.d[0].id, { method: "DELETE" });
});

run("l'utente inserisce la SUA richiesta: in attesa, senza numero, legata al suo account", async () => {
  const r = await rest(env, U.a.tok, SEL.replace("?select=", "?select=").split("?")[0] + "?select=id,user_id,stato,numero_fondatore,decisa_il",
    { method: "POST", body: piena({ tipo_utente: "band", nome_pubblico: "Banda di prova " + S.slice(-4), consenso_nome: true }) });
  assert.equal(r.ok, true, JSON.stringify(r.d));
  RA = r.d[0];
  assert.deepEqual([RA.user_id, RA.stato, RA.numero_fondatore, RA.decisa_il], [U.a.uid, "in_attesa", null, null]);
});

run("non si scrivono stato, numero, date né l'account di un altro (privilegi per colonna → 42501)", async () => {
  for (const [perche, extra] of [
    ["stato", { stato: "approvato" }],
    ["numero", { numero_fondatore: 1 }],
    ["data della decisione", { decisa_il: new Date().toISOString() }],
    ["account di un altro", { user_id: U.a.uid }],
  ]) {
    const r = await rest(env, U.b.tok, tabella, { method: "POST", body: piena(extra) });
    assert.equal(r.ok, false, perche + ": " + JSON.stringify(r.d));
    assert.equal(codice(r), "42501", perche + " — permesso negato, non un altro errore: " + JSON.stringify(r.d));
  }
  const up = await rest(env, U.a.tok, tabella + "?id=eq." + RA.id, { method: "PATCH", body: { stato: "approvato", numero_fondatore: 1 } });
  assert.equal(up.ok, false, "la propria richiesta non si promuove da sé: " + JSON.stringify(up.d));
  assert.equal(codice(up), "42501", JSON.stringify(up.d));
  const del = await rest(env, U.a.tok, tabella + "?id=eq." + RA.id, { method: "DELETE" });
  assert.equal(del.ok, false, "né si cancella (si chiede scrivendo): " + JSON.stringify(del.d));
  const ora = (await rest(env, admin(env), SEL + "&id=eq." + RA.id)).d[0];
  assert.deepEqual([ora.stato, ora.numero_fondatore], ["in_attesa", null], "la riga è com'era");
});

run("nome pubblico e consenso vanno insieme (23514)", async () => {
  for (const [perche, extra] of [
    ["nome senza consenso", { nome_pubblico: "Qualcuno", consenso_nome: false }],
    ["consenso senza nome", { consenso_nome: true }],
    ["nome con spazi doppi", { nome_pubblico: "Due  spazi", consenso_nome: true }],
  ]) {
    const r = await rest(env, U.b.tok, tabella, { method: "POST", body: piena(extra) });
    assert.equal(codice(r), "23514", perche + ": " + JSON.stringify(r.d));
  }
});

run("ognuno legge solo le sue; una sola richiesta attiva per account (23505)", async () => {
  const rb = await rest(env, U.b.tok, tabella, { method: "POST", body: piena({ tipo_utente: "tecnico" }) });
  assert.equal(rb.ok, true, JSON.stringify(rb.d));
  U.b.rich = rb.d[0].id;
  const vedeA = (await rest(env, U.a.tok, SEL)).d.map((x) => x.user_id);
  const vedeB = (await rest(env, U.b.tok, SEL)).d.map((x) => x.user_id);
  assert.deepEqual([...new Set(vedeA)], [U.a.uid], "A vede solo le sue");
  assert.deepEqual([...new Set(vedeB)], [U.b.uid], "B vede solo le sue");
  assert.deepEqual((await rest(env, U.b.tok, SEL + "&id=eq." + RA.id)).d, [], "B non vede la richiesta di A nemmeno per id");
  const due = await rest(env, U.a.tok, tabella, { method: "POST", body: piena({ risposta_tempo: FRASE("seconda " + S) }) });
  assert.equal(codice(due), "23505", "la seconda attiva: " + JSON.stringify(due.d));
});

run("i punti li assegna SOLO il servizio; l'utente legge i propri contributi, non quelli degli altri", async () => {
  const ins = await rest(env, U.a.tok, "fondatori_contributi", { method: "POST", body: { user_id: U.a.uid, tipo: "proposta", punti: 50 } });
  assert.equal(ins.ok, false, "l'utente non si dà punti: " + JSON.stringify(ins.d));
  assert.equal(codice(ins), "42501", JSON.stringify(ins.d));
  for (const tok of [env.ANON_KEY, U.a.tok]) {
    for (const [fn, args] of [["fondatori_assegna", { p_chi: U.a.email, p_tipo: "proposta" }], ["fondatori_accetta_feedback", { p_id: RA.id }],
                              ["fondatori_stato", { p_chi: U.a.email }]]) {
      const r = await rpc(env, tok, fn, args);
      assert.equal(r.ok, false, fn + " da fuori: " + JSON.stringify(r.d));
    }
  }
  const acc = await rpc(env, admin(env), "fondatori_accetta_feedback", { p_id: RA.id });
  assert.deepEqual([acc.d.ok, acc.d.tipo, acc.d.punti, acc.d.tipi], [true, "feedback", 3, 1], "il modulo accettato vale 3 punti: " + JSON.stringify(acc.d));
  const due = await rpc(env, admin(env), "fondatori_accetta_feedback", { p_id: RA.id });
  assert.deepEqual([due.d.gia, due.d.punti], [true, 3], "accettarlo due volte non raddoppia");
  const miei = (await rest(env, U.a.tok, "fondatori_contributi?select=tipo,punti,nota,assegnato_da,user_id")).d;
  assert.deepEqual(miei.map((x) => [x.tipo, x.punti, x.assegnato_da, x.user_id]), [["feedback", 3, "Simone", U.a.uid]], "A legge il suo contributo");
  assert.deepEqual((await rest(env, U.b.tok, "fondatori_contributi?select=id&user_id=eq." + U.a.uid)).d, [], "B non legge quelli di A");
  const up = await rest(env, U.a.tok, "fondatori_contributi?user_id=eq." + U.a.uid, { method: "PATCH", body: { punti: 99 } });
  assert.equal(up.ok, false, "né li modifica: " + JSON.stringify(up.d));
  const sbagliato = await rpc(env, admin(env), "fondatori_assegna", { p_chi: U.a.email, p_tipo: "inventato" });
  assert.equal(sbagliato.d.errore, "tipo_inesistente");
  assert.equal((await rpc(env, admin(env), "fondatori_assegna", { p_chi: "nessuno@example.invalid", p_tipo: "prova" })).d.errore, "account_inesistente");
});

run("la SOGLIA: 10 punti con almeno 2 tipi diversi; prima resta in attesa, e nemmeno un update del servizio la scavalca", async () => {
  const sotto = await rpc(env, admin(env), "fondatori_approva", { p_id: RA.id });
  assert.deepEqual([sotto.d.ok, sotto.d.errore, sotto.d.punti, sotto.d.soglia_punti, sotto.d.soglia_tipi], [false, "soglia_non_raggiunta", 3, 10, 2], JSON.stringify(sotto.d));
  /* B: 10 punti ma un solo tipo (due proposte) → non approvabile */
  await rpc(env, admin(env), "fondatori_assegna", { p_chi: U.b.email, p_tipo: "proposta", p_nota: "prima proposta" });
  const b10 = await rpc(env, admin(env), "fondatori_assegna", { p_chi: U.b.email, p_tipo: "proposta", p_nota: "seconda proposta" });
  assert.deepEqual([b10.d.punti, b10.d.tipi], [10, 1]);
  const unTipo = await rpc(env, admin(env), "fondatori_approva", { p_id: U.b.rich });
  assert.equal(unTipo.d.errore, "soglia_non_raggiunta", "10 punti di un tipo solo non bastano: " + JSON.stringify(unTipo.d));
  /* il vincolo è nel database: un update a mano del servizio sotto soglia viene rifiutato */
  const forza = await rest(env, admin(env), tabella + "?id=eq." + U.b.rich, { method: "PATCH",
    body: { stato: "approvato", numero_fondatore: 99, ondata: 1, decisa_il: new Date().toISOString() } });
  assert.equal(forza.ok, false, "update sotto soglia: " + JSON.stringify(forza.d));
  assert.match(String(forza.d && forza.d.message), /soglia_non_raggiunta/);
  /* A: feedback 3 + proposta 5 = 8 punti, 2 tipi → ancora sotto; + segnalazione 3 = 11 punti, 3 tipi → approvabile */
  await rpc(env, admin(env), "fondatori_assegna", { p_chi: U.a.email, p_tipo: "proposta", p_nota: "vista ruotata" });
  assert.equal((await rpc(env, admin(env), "fondatori_approva", { p_id: RA.id })).d.errore, "soglia_non_raggiunta", "8 punti: no");
  await rpc(env, admin(env), "fondatori_assegna", { p_chi: U.a.uid, p_tipo: "segnalazione", p_nota: "per id dell'account" });
  const st = await rpc(env, admin(env), "fondatori_stato", { p_chi: U.a.email });
  assert.deepEqual([st.d.punti, st.d.tipi, st.d.contributi.length, st.d.richiesta.stato, st.d.ondata.soglia_punti], [11, 3, 3, "in_attesa", 10]);
  /* B: + feedback → 13 punti, 2 tipi: approvabile anche lui */
  await rpc(env, admin(env), "fondatori_accetta_feedback", { p_id: U.b.rich });
});

run("approvare e respingere: solo il servizio; il numero è il primo posto libero; il nome pubblico solo col consenso", async () => {
  for (const tok of [env.ANON_KEY, U.a.tok]) {
    for (const fn of ["fondatori_approva", "fondatori_respingi"]) {
      const r = await rpc(env, tok, fn, { p_id: RA.id });
      assert.equal(r.ok, false, fn + " da " + (tok === env.ANON_KEY ? "anonimo" : "utente") + ": " + JSON.stringify(r.d));
    }
    const l = await rpc(env, tok, "fondatori_lista", {});
    assert.equal(l.ok, false, "l'elenco con le email è solo del servizio: " + JSON.stringify(l.d));
    const o = await rpc(env, tok, "fondatori_ondata_apri", { p_numero: 2, p_aperta: true });
    assert.equal(o.ok, false, "aprire un'ondata è solo del servizio: " + JSON.stringify(o.d));
  }
  const prima = (await rpc(env, env.ANON_KEY, "fondatori_pubblico", {})).d;
  const lista = (await rpc(env, admin(env), "fondatori_lista", {})).d;
  const mia = lista.find((x) => x.id === RA.id);
  assert.ok(mia, "la richiesta di A è nell'elenco in attesa");
  assert.equal(mia.email, U.a.email); assert.equal(mia.progetti, 1, "con quanti progetti ha l'account");
  assert.match(mia.perso_tempo, /mandata giusta/);
  assert.deepEqual([mia.punti, mia.tipi, mia.feedback_accettato], [11, 3, true], "con i punti e il feedback accettato");
  const ap = await rpc(env, admin(env), "fondatori_approva", { p_id: RA.id });
  assert.equal(ap.d.ok, true, JSON.stringify(ap.d));
  assert.ok(Number.isInteger(ap.d.numero) && ap.d.numero >= 1 && ap.d.numero <= 100);
  assert.deepEqual([ap.d.ondata, ap.d.nome], [1, "Fondatore"], "nell'ondata aperta, la 1");
  const di_nuovo = await rpc(env, admin(env), "fondatori_approva", { p_id: RA.id });
  assert.deepEqual([di_nuovo.d.ok, di_nuovo.d.gia, di_nuovo.d.numero], [true, true, ap.d.numero], "riapprovare non cambia il numero");
  const dopo = (await rpc(env, env.ANON_KEY, "fondatori_pubblico", {})).d;
  assert.equal(dopo.posti_rimasti, prima.posti_rimasti - 1, "un posto in meno");
  assert.ok(dopo.nomi.some((x) => x.nome === "Banda di prova " + S.slice(-4) && x.ondata === 1), "il nome di chi ha acconsentito compare, con l'ondata");
  const vista = (await rest(env, U.a.tok, SEL + ",ondata&id=eq." + RA.id)).d[0];
  assert.deepEqual([vista.stato, vista.numero_fondatore, vista.ondata], ["approvato", ap.d.numero, 1], "A vede il suo numero e l'ondata");
  /* B: approvato senza consenso → nessun nome in più; poi una respinta non si può approvare */
  const nomiPrima = dopo.nomi.length;
  assert.equal((await rpc(env, admin(env), "fondatori_approva", { p_id: U.b.rich })).d.ok, true);
  assert.equal((await rpc(env, env.ANON_KEY, "fondatori_pubblico", {})).d.nomi.length, nomiPrima, "senza consenso il nome non esce");
  const rc = await rest(env, U.c.tok, tabella, { method: "POST", body: piena() });
  assert.equal(rc.ok, true, JSON.stringify(rc.d));
  assert.equal((await rpc(env, admin(env), "fondatori_respingi", { p_id: rc.d[0].id })).d.ok, true);
  assert.equal((await rpc(env, admin(env), "fondatori_approva", { p_id: rc.d[0].id })).d.errore, "non_in_attesa");
  /* dopo una respinta se ne può mandare un'altra, ma non più di tre in tutto */
  const r2 = await rest(env, U.c.tok, tabella, { method: "POST", body: piena({ risposta_tempo: FRASE("due " + S) }) });
  assert.equal(r2.ok, true, "seconda dopo la respinta: " + JSON.stringify(r2.d));
  await rpc(env, admin(env), "fondatori_respingi", { p_id: r2.d[0].id });
  const r3 = await rest(env, U.c.tok, tabella, { method: "POST", body: piena({ risposta_tempo: FRASE("tre " + S) }) });
  assert.equal(r3.ok, true, "terza: " + JSON.stringify(r3.d));
  await rpc(env, admin(env), "fondatori_respingi", { p_id: r3.d[0].id });
  const r4 = await rest(env, U.c.tok, tabella, { method: "POST", body: piena({ risposta_tempo: FRASE("quattro " + S) }) });
  assert.equal(r4.ok, false, "la quarta no: " + JSON.stringify(r4.d));
  assert.match(String(r4.d && r4.d.message), /troppe_richieste/);
});

run("il TETTO PER ONDATA lo tiene il database: 100 nell'ondata 1, poi in attesa finché non si apre la 2 (101, 102…)", async () => {
  /* Tutto in una transazione annullata: 103 account finti, approvati in fila. Le richieste di A e B (già approvate
     sopra) contano nell'ondata 1. */
  const r = await psql(`
begin;
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'sp-tetto-${S}-' || lpad(g::text, 3, '0') || '@example.invalid', now(), now() from generate_series(1, 103) g;
insert into public.fondatori_richieste (user_id, risposta_tempo, risposta_manca)
  select id, 'Il pannello dei monitor non trovava la mandata giusta ' || email, 'Manca la pagina delle prese per il service ' || email
    from auth.users where email like 'sp-tetto-${S}-%';
insert into public.fondatori_contributi (user_id, tipo, punti)
  select u.id, t.tipo, t.punti from auth.users u cross join (values ('proposta', 5), ('prova', 4), ('feedback', 3)) as t(tipo, punti)
   where u.email like 'sp-tetto-${S}-%';
create temp table esiti (fase text, ok int, esauriti int, chiuse int, dadecidere int);
create or replace function pg_temp.giro(fase text) returns void language plpgsql as $f$
declare r record; v jsonb; a int := 0; e int := 0; c int := 0; d int := 0; begin
  for r in select f.id from public.fondatori_richieste f join auth.users u on u.id = f.user_id
            where u.email like 'sp-tetto-${S}-%' and f.stato = 'in_attesa' order by u.email loop
    v := public.fondatori_approva(r.id);
    if (v->>'ok')::boolean then a := a + 1;
    elsif v->>'errore' = 'posti_esauriti' then e := e + 1;
    elsif v->>'errore' = 'nessuna_ondata_aperta' then c := c + 1;
    elsif v->>'errore' = 'soglia_da_decidere' then d := d + 1; end if;
  end loop;
  insert into esiti values (fase, a, e, c, d);
end $f$;
select pg_temp.giro('uno');
select 'o1=' || (select count(*) from public.fondatori_richieste where ondata = 1 and stato = 'approvato');
select 'o1max=' || (select max(numero_fondatore) from public.fondatori_richieste where ondata = 1);
select 'pubblico1=' || (public.fondatori_pubblico()->>'posti_rimasti') || '/' || (public.fondatori_pubblico()->'ondata'->>'numero');
select 'attesa1=' || (select esauriti from esiti where fase = 'uno');
select (public.fondatori_ondata_apri(2, true))->>'ok';
select pg_temp.giro('decidere');
select 'dadecidere=' || (select dadecidere from esiti where fase = 'decidere') || '/' || (select ok from esiti where fase = 'decidere');
update public.fondatori_ondate set soglia_punti = 10, soglia_tipi = 2 where numero = 2;
select pg_temp.giro('due');
select 'o2=' || (select string_agg(numero_fondatore::text, ',' order by numero_fondatore) from public.fondatori_richieste where ondata = 2);
select 'pubblico2=' || (public.fondatori_pubblico()->>'posti_rimasti') || '/' || (public.fondatori_pubblico()->'ondata'->>'nome');
do $$ begin
  update public.fondatori_richieste set numero_fondatore = 101
   where numero_fondatore = (select max(numero_fondatore) from public.fondatori_richieste where ondata = 1);
  raise notice 'TETTO_SUPERATO';
exception when check_violation then raise notice 'FUORI_ONDATA_RIFIUTATO';
end $$;
do $$ begin
  update public.fondatori_richieste set numero_fondatore = 1
   where numero_fondatore = (select max(numero_fondatore) from public.fondatori_richieste where ondata = 1);
  raise notice 'NUMERO_DOPPIO';
exception when unique_violation then raise notice 'NUMERO_DOPPIO_RIFIUTATO';
end $$;
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sp-zero-${S}@example.invalid', now(), now());
insert into public.fondatori_richieste (user_id, risposta_tempo, risposta_manca)
  select id, 'Il pannello dei monitor non trovava la mandata giusta zero', 'Manca la pagina delle prese per il service zero'
    from auth.users where email = 'sp-zero-${S}@example.invalid';
do $$ begin
  update public.fondatori_richieste set stato = 'approvato', numero_fondatore = 190, ondata = 2, decisa_il = now()
   where user_id = (select id from auth.users where email = 'sp-zero-${S}@example.invalid');
  raise notice 'SENZA_PUNTI_APPROVATO';
exception when check_violation then raise notice 'SENZA_PUNTI_RIFIUTATO';
end $$;
do $$ begin
  insert into public.fondatori_ondate (numero, nome, dal, al) values (3, 'Sovrapposta', 150, 250);
  raise notice 'ONDATE_SOVRAPPOSTE';
exception when exclusion_violation then raise notice 'SOVRAPPOSIZIONE_RIFIUTATA';
end $$;
rollback;
select 'dopo=' || (select count(*) from auth.users where email like 'sp-tetto-${S}-%' or email = 'sp-zero-${S}@example.invalid') || '/' ||
       (select aperta::text from public.fondatori_ondate where numero = 2);
`);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /o1=100\n/, "esattamente 100 approvati nell'ondata 1: " + r.out);
  assert.match(r.out, /o1max=100\n/, "numeri fino a 100: " + r.out);
  assert.match(r.out, /pubblico1=0\/1\n/, "ondata 1 piena: zero posti: " + r.out);
  assert.match(r.out, /attesa1=[1-9]\d*\n/, "con la 2 chiusa le altre restano in attesa (posti_esauriti): " + r.out);
  const o2 = (r.out.match(/o2=([\d,]+)\n/) || [])[1] || "";
  const nums = o2.split(",").map(Number);
  assert.ok(nums.length >= 1 && nums.every((n, k) => n === 101 + k), "aperta la 2, la numerazione continua da 101 senza buchi: " + o2);
  assert.match(r.out, /pubblico2=\d+\/Early adopter\n/, "i posti ora sono quelli dell'ondata 2: " + r.out);
  assert.match(r.err, /FUORI_ONDATA_RIFIUTATO/, "un numero fuori dall'intervallo della sua ondata lo rifiuta il database: " + r.err);
  assert.match(r.err, /NUMERO_DOPPIO_RIFIUTATO/, "lo stesso numero due volte no: " + r.err);
  assert.match(r.err, /SOVRAPPOSIZIONE_RIFIUTATA/, "due ondate non si dividono un numero: " + r.err);
  assert.match(r.out, /dadecidere=[1-9]\d*\/0\n/, "ondata 2 aperta ma con la soglia da decidere: nessuna approvazione: " + r.out);
  assert.match(r.err, /SENZA_PUNTI_RIFIUTATO/, "senza punti nemmeno il servizio approva a mano: " + r.err);
  assert.doesNotMatch(r.err, /SENZA_PUNTI_APPROVATO/, r.err);
  assert.doesNotMatch(r.err, /TETTO_SUPERATO|NUMERO_DOPPIO\b|ONDATE_SOVRAPPOSTE/, r.err);
  assert.match(r.out, /dopo=0\/false\n/, "la transazione non lascia resti: " + r.out);
});

run("tutte le ondate chiuse: nessuna approvazione, la richiesta resta in attesa", async () => {
  const d = await account("fond-d", S);
  const rd = await rest(env, d.tok, tabella, { method: "POST", body: piena() });
  assert.equal(rd.ok, true, JSON.stringify(rd.d));
  assert.equal((await rpc(env, admin(env), "fondatori_ondata_apri", { p_numero: 1, p_aperta: false })).d.ok, true);
  try {
    const a = await rpc(env, admin(env), "fondatori_approva", { p_id: rd.d[0].id });
    assert.equal(a.d.errore, "nessuna_ondata_aperta", JSON.stringify(a.d));
    assert.equal((await rest(env, admin(env), SEL + "&id=eq." + rd.d[0].id)).d[0].stato, "in_attesa");
    const p = (await rpc(env, env.ANON_KEY, "fondatori_pubblico", {})).d;
    assert.deepEqual([p.posti_rimasti, p.ondata], [0, null], "nessuna ondata aperta: zero posti");
  } finally {
    await rpc(env, admin(env), "fondatori_ondata_apri", { p_numero: 1, p_aperta: true });
    await rest(env, admin(env), tabella + "?id=eq." + rd.d[0].id, { method: "DELETE" });
  }
});

run("retention: le respinte da più di 12 mesi si cancellano, le altre restano", async () => {
  const mesi = (n) => new Date(Date.now() - n * 30.5 * 86_400_000).toISOString();
  const tutte = (await rest(env, admin(env), SEL + "&user_id=eq." + U.c.uid + "&stato=eq.respinto&order=decisa_il")).d;
  assert.equal(tutte.length, 3);
  await rest(env, admin(env), tabella + "?id=eq." + tutte[0].id, { method: "PATCH", body: { decisa_il: mesi(13) } });
  await rest(env, admin(env), tabella + "?id=eq." + tutte[1].id, { method: "PATCH", body: { decisa_il: mesi(11) } });
  const p = await rpc(env, admin(env), "stageplot_purge_expired", {});
  assert.equal(p.ok, true, JSON.stringify(p.d));
  assert.ok(p.d.fondatori_respinte >= 1, JSON.stringify(p.d));
  const restano = (await rest(env, admin(env), SEL + "&user_id=eq." + U.c.uid + "&stato=eq.respinto")).d.map((x) => x.id).sort();
  assert.deepEqual(restano, [tutte[1].id, tutte[2].id].sort(), "solo quella oltre i 12 mesi è sparita");
  const app = (await rest(env, admin(env), SEL + "&id=eq." + RA.id)).d;
  assert.equal(app.length, 1, "le approvate non si toccano");
});

run("un account che ha chiesto di diventare fondatore (o ha contribuito) non è «solo biglietteria»", async () => {
  /* B diventa «del pubblico» (riga in bgl_pubblico): senza la richiesta sarebbe cancellabile dalla pulizia a 12 mesi */
  await rest(env, admin(env), "bgl_pubblico", { method: "POST", body: { user_id: U.b.uid } });
  const r = await rpc(env, admin(env), "bgl_account_solo_biglietteria", { p_uid: U.b.uid });
  assert.equal(r.d, false, JSON.stringify(r.d));
  /* E: solo un contributo, nessuna richiesta */
  const e = await account("fond-e", S);
  await rest(env, admin(env), "bgl_pubblico", { method: "POST", body: { user_id: e.uid } });
  assert.equal((await rpc(env, admin(env), "bgl_account_solo_biglietteria", { p_uid: e.uid })).d, true, "prima del contributo: solo biglietteria");
  await rpc(env, admin(env), "fondatori_assegna", { p_chi: e.email, p_tipo: "recensione" });
  assert.equal((await rpc(env, admin(env), "bgl_account_solo_biglietteria", { p_uid: e.uid })).d, false, "con un contributo: no");
});
