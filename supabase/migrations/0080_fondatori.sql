-- 0080 — Programma Fondatori di stageplot.it (decisioni di Simone del 10/10/2026, tre passaggi nello stesso giorno).
--   · Si diventa fondatori CONTRIBUENDO alla crescita di StagePlot, con una soglia a punti; l'approvazione finale è di
--     Simone, a mano. I primi 100 approvati (ondata 1 «Fondatore») hanno accesso a vita a tutte le funzioni software,
--     presenti e future, esclusa la consulenza. Ondata 2 «Early adopter» (101–200): condizioni e soglia da decidere, chiusa.
--   · fondatori_tipi_contributo: i modi di contribuire e i loro punti (configurabili qui, non nel client).
--   · fondatori_contributi: il registro per utente (tipo, punti, nota, data, chi l'ha assegnato). Scrive SOLO il servizio
--     (ops/fondatori.sh); l'utente legge i propri.
--   · fondatori_ondate: nome, intervallo dei numeri (globali e progressivi), aperta/chiusa, SOGLIA (punti e tipi diversi).
--     Ondata 1: 10 punti con almeno 2 tipi diversi. Ondata 2: soglia nulla = da decidere.
--   · fondatori_richieste: la candidatura, con le risposte alle tre domande. Il modulo è il PRIMO contributo: vale i punti
--     del tipo «feedback» quando Simone lo accetta (fondatori_accetta_feedback). L'utente inserisce e legge SOLO le sue;
--     può scrivere solo risposte, tipo di utente e nome pubblico (privilegi per colonna).
--   · Lo garantisce il DATABASE, non l'interfaccia: un trigger rifiuta l'approvazione sotto la soglia dell'ondata (anche se
--     scrive il servizio) e un numero fuori dall'intervallo della sua ondata; il numero è unico. Così un'ondata non ha più
--     approvati dei suoi numeri e nessuno è approvato senza i punti.
--   · fondatori_approva: nella prima ondata APERTA con un posto libero, solo a soglia raggiunta; altrimenti la richiesta
--     resta in attesa (soglia_non_raggiunta / soglia_da_decidere / posti_esauriti / nessuna_ondata_aperta).
--   · fondatori_pubblico(): l'unica lettura pubblica: posti rimasti nell'ondata aperta, ondate con la soglia, tipi di
--     contributo con i punti, nomi di chi ha acconsentito con la sua ondata. Nessun altro dato.
--   · La qualità minima del modulo: almeno 2 risposte su 3 «piene» (≥ 30 caratteri e ≥ 5 parole, spazi compressi) e
--     diverse fra loro. La stessa soglia sta nell'editor (FONDATORI_SOGLIA): un test le confronta.
--   · Una sola richiesta attiva (in attesa o approvata) per account; al massimo 3 richieste in tutto.
--   · Retention: le richieste respinte si cancellano 12 mesi dopo la decisione (stageplot_purge_expired, in fondo).
--   · bgl_account_solo_biglietteria guarda anche queste tabelle (AGENTS §8: ogni tabella che punta a un account).

-- ─────────────────────────────────────────────────────────────────────────────── la soglia del feedback
-- Prima le funzioni, poi la tabella che le usa nel vincolo (AGENTS §8, 0074: il corpo `sql` si controlla alla creazione).
create or replace function public.fondatori_norm(t text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select regexp_replace(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g'), '^ | $', '', 'g')
$$;

create or replace function public.fondatori_risposta_piena(t text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select char_length(public.fondatori_norm(t)) >= 30
     and coalesce(array_length(string_to_array(public.fondatori_norm(t), ' '), 1), 0) >= 5
$$;

create or replace function public.fondatori_feedback_valido(a text, b text, c text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select count(distinct lower(public.fondatori_norm(x))) >= 2
    from unnest(array[a, b, c]) as x
   where public.fondatori_risposta_piena(x)
$$;


-- ─────────────────────────────────────────────────────────────────────────────── i modi di contribuire
create table public.fondatori_tipi_contributo (
  codice text primary key check (codice ~ '^[a-z_]{2,30}$'),
  nome   text not null check (char_length(nome) between 2 and 80),
  punti  int  not null check (punti between 0 and 100),
  ordine int  not null default 0,
  attivo boolean not null default true
);
insert into public.fondatori_tipi_contributo (codice, nome, punti, ordine) values
  ('feedback',    'Feedback completo (le tre domande)',                               3, 1),
  ('segnalazione','Segnalazione di un problema riprodotto e confermato',              3, 2),
  ('proposta',    'Proposta accolta e realizzata',                                    5, 3),
  ('prova',       'Prova guidata o intervista',                                       4, 4),
  ('recensione',  'Recensione pubblica',                                              3, 5),
  ('invito',      'Porta un utente che usa StagePlot davvero',                        3, 6),
  ('contenuto',   'Contenuto utile (foto di un palco vero, un esempio, una correzione)', 3, 7);
alter table public.fondatori_tipi_contributo enable row level security;
revoke all on table public.fondatori_tipi_contributo from public, anon, authenticated;
grant select, insert, update, delete on table public.fondatori_tipi_contributo to service_role;

-- ─────────────────────────────────────────────────────────────────────────────── le ondate
create table public.fondatori_ondate (
  numero       int  primary key check (numero >= 1),
  nome         text not null check (char_length(nome) between 2 and 40),   -- al singolare, come nel badge: «Fondatore n. 7»
  dal          int  not null check (dal >= 1),
  al           int  not null,
  aperta       boolean not null default false,
  soglia_punti int  check (soglia_punti is null or soglia_punti between 1 and 1000),   -- null = da decidere
  soglia_tipi  int  check (soglia_tipi is null or soglia_tipi between 1 and 20),
  check (al >= dal),
  check ((soglia_punti is null) = (soglia_tipi is null)),
  exclude using gist (int4range(dal, al, '[]') with &&)              -- due ondate non si dividono un numero
);
insert into public.fondatori_ondate (numero, nome, dal, al, aperta, soglia_punti, soglia_tipi) values
  (1, 'Fondatore', 1, 100, true, 10, 2),
  (2, 'Early adopter', 101, 200, false, null, null);
alter table public.fondatori_ondate enable row level security;
revoke all on table public.fondatori_ondate from public, anon, authenticated;
grant select, insert, update, delete on table public.fondatori_ondate to service_role;
comment on table public.fondatori_ondate is
  'Programma Fondatori (0080): le ondate, con la soglia (punti e tipi diversi). Ondata 1 = i primi 100 (accesso a vita, 10 punti e 2 tipi), ondata 2 = early adopter (101–200, soglia da decidere). Si cambiano solo dal servizio.';

-- ─────────────────────────────────────────────────────────────────────────────── le richieste (candidature)
create table public.fondatori_richieste (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  risposta_tempo    text not null default '' check (char_length(risposta_tempo) <= 2000),     -- «Cosa ti ha fatto perdere tempo?»
  risposta_manca    text not null default '' check (char_length(risposta_manca) <= 2000),     -- «Cosa manca perché tu lo possa mandare al service/locale?»
  risposta_prossimo text not null default '' check (char_length(risposta_prossimo) <= 2000),  -- «Lo useresti per il tuo prossimo concerto? Perché?»
  tipo_utente       text check (tipo_utente is null or tipo_utente in ('band', 'tecnico', 'scuola', 'altro')),
  nome_pubblico     text check (nome_pubblico is null
                                or (char_length(nome_pubblico) between 2 and 60 and nome_pubblico = public.fondatori_norm(nome_pubblico))),
  consenso_nome     boolean not null default false,
  stato             text not null default 'in_attesa' check (stato in ('in_attesa', 'approvato', 'respinto')),
  ondata            int references public.fondatori_ondate(numero) on update restrict on delete restrict,
  numero_fondatore  int unique check (numero_fondatore >= 1),   -- progressivo e globale: 1–100 fondatori, 101–200 early adopter
  creata_il         timestamptz not null default now(),
  decisa_il         timestamptz,
  check ((stato = 'approvato') = (numero_fondatore is not null)),
  check ((numero_fondatore is null) = (ondata is null)),
  check ((stato = 'in_attesa') = (decisa_il is null)),
  -- il nome pubblico esiste solo con il consenso, e il consenso senza nome non vuol dire niente
  check (consenso_nome = (nome_pubblico is not null)),
  check (public.fondatori_feedback_valido(risposta_tempo, risposta_manca, risposta_prossimo))
);
create unique index fondatori_una_attiva on public.fondatori_richieste (user_id) where stato in ('in_attesa', 'approvato');
create index fondatori_stato_idx on public.fondatori_richieste (stato, creata_il);
comment on table public.fondatori_richieste is
  'Programma Fondatori (0080): candidature con le tre risposte. Approvazione solo dal servizio, a soglia raggiunta, nella prima ondata aperta; il numero sta nell''intervallo della sua ondata (trigger) ed è unico.';

-- ─────────────────────────────────────────────────────────────────────────────── il registro dei contributi
create table public.fondatori_contributi (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  tipo          text not null references public.fondatori_tipi_contributo(codice) on update cascade on delete restrict,
  punti         int  not null check (punti between 0 and 100),   -- copiati dal tipo all'assegnazione: la storia non cambia
  nota          text check (nota is null or char_length(nota) <= 500),   -- la legge anche l'utente
  assegnato_da  text not null default 'Simone' check (char_length(assegnato_da) between 1 and 60),
  richiesta_id  uuid references public.fondatori_richieste(id) on delete set null,   -- per il feedback del modulo
  creato_il     timestamptz not null default now()
);
create index fondatori_contributi_user_idx on public.fondatori_contributi (user_id, creato_il);
create unique index fondatori_feedback_una_volta on public.fondatori_contributi (richiesta_id) where richiesta_id is not null;
alter table public.fondatori_contributi enable row level security;
revoke all on table public.fondatori_contributi from public, anon, authenticated;
grant select on table public.fondatori_contributi to authenticated;
grant select, insert, update, delete on table public.fondatori_contributi to service_role;
create policy fondatori_leggo_i_miei_contributi on public.fondatori_contributi
  for select to authenticated using (user_id = auth.uid());
comment on table public.fondatori_contributi is
  'Programma Fondatori (0080): il registro dei contributi per utente. Scrive solo il servizio (ops/fondatori.sh), l''utente legge i propri.';

-- I punti e i tipi diversi di un account: la base della soglia.
create or replace function public.fondatori_punti_di(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('punti', coalesce(sum(punti), 0), 'tipi', count(distinct tipo))
    from public.fondatori_contributi where user_id = p_uid
$$;
revoke all on function public.fondatori_punti_di(uuid) from public, anon, authenticated;
grant execute on function public.fondatori_punti_di(uuid) to service_role;

create or replace function public.fondatori_soglia_ok(p_uid uuid, p_ondata int)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select o.soglia_punti is not null
                      and (public.fondatori_punti_di(p_uid)->>'punti')::int >= o.soglia_punti
                      and (public.fondatori_punti_di(p_uid)->>'tipi')::int >= o.soglia_tipi
                     from public.fondatori_ondate o where o.numero = p_ondata), false)
$$;
revoke all on function public.fondatori_soglia_ok(uuid, int) from public, anon, authenticated;
grant execute on function public.fondatori_soglia_ok(uuid, int) to service_role;

-- IL VINCOLO: un numero sta dentro l'intervallo della sua ondata, e si diventa «approvato» solo a soglia raggiunta per
-- quell'ondata. Chiunque scriva (anche il servizio con un update a mano).
create or replace function public.fondatori_controlla_approvazione()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.numero_fondatore is not null and not exists (
       select 1 from public.fondatori_ondate o
        where o.numero = new.ondata and new.numero_fondatore between o.dal and o.al) then
    raise exception 'numero_fuori_ondata' using errcode = '23514';
  end if;
  if new.stato = 'approvato' and (tg_op = 'INSERT' or old.stato is distinct from 'approvato' or old.ondata is distinct from new.ondata)
     and not public.fondatori_soglia_ok(new.user_id, new.ondata) then
    raise exception 'soglia_non_raggiunta' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.fondatori_controlla_approvazione() from public, anon, authenticated;
create trigger fondatori_controlla_approvazione before insert or update of numero_fondatore, ondata, stato on public.fondatori_richieste
  for each row execute function public.fondatori_controlla_approvazione();

-- al massimo 3 richieste per account (una respinta si può rifare, non all'infinito)
create or replace function public.fondatori_limite_richieste()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('fondatori:' || new.user_id::text));
  if (select count(*) from public.fondatori_richieste where user_id = new.user_id) >= 3 then
    raise exception 'troppe_richieste' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.fondatori_limite_richieste() from public, anon, authenticated;
create trigger fondatori_limite_richieste before insert on public.fondatori_richieste
  for each row execute function public.fondatori_limite_richieste();

-- ─────────────────────────────────────────────────────────────────────────────── permessi e RLS delle richieste
alter table public.fondatori_richieste enable row level security;
revoke all on table public.fondatori_richieste from public, anon, authenticated;
grant select on table public.fondatori_richieste to authenticated;
-- solo queste colonne: user_id prende auth.uid() dal default, stato/numero/ondata/date i loro default
grant insert (risposta_tempo, risposta_manca, risposta_prossimo, tipo_utente, nome_pubblico, consenso_nome)
  on table public.fondatori_richieste to authenticated;
grant select, insert, update, delete on table public.fondatori_richieste to service_role;

create policy fondatori_leggo_le_mie on public.fondatori_richieste
  for select to authenticated using (user_id = auth.uid());
create policy fondatori_scrivo_la_mia on public.fondatori_richieste
  for insert to authenticated
  with check (user_id = auth.uid() and stato = 'in_attesa' and numero_fondatore is null and ondata is null and decisa_il is null);
-- niente update né delete per l'utente: la cancellazione si chiede scrivendo (privacy, sezione 10)

-- ─────────────────────────────────────────────────────────────────────────────── il servizio (ops/fondatori.sh)
-- L'account dall'email (o dall'id), per lo script.
create or replace function public.fondatori_account(p_chi text)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select id from auth.users
   where lower(email) = lower(btrim(p_chi))
      or (p_chi ~* '^[0-9a-f-]{36}$' and id = p_chi::uuid)
   limit 1
$$;
revoke all on function public.fondatori_account(text) from public, anon, authenticated;
grant execute on function public.fondatori_account(text) to service_role;

-- Assegnare un contributo: i punti si prendono dal tipo, in quel momento.
create or replace function public.fondatori_assegna(p_chi text, p_tipo text, p_nota text default null,
                                                    p_da text default 'Simone', p_richiesta uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := public.fondatori_account(p_chi); t public.fondatori_tipi_contributo;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'account_inesistente'); end if;
  select * into t from public.fondatori_tipi_contributo where codice = p_tipo and attivo;
  if not found then return jsonb_build_object('ok', false, 'errore', 'tipo_inesistente'); end if;
  insert into public.fondatori_contributi (user_id, tipo, punti, nota, assegnato_da, richiesta_id)
  values (uid, t.codice, t.punti, nullif(btrim(coalesce(p_nota, '')), ''), coalesce(nullif(btrim(p_da), ''), 'Simone'), p_richiesta);
  -- 'punti' e 'tipi' sono i totali dell'account dopo questo contributo; 'punti_contributo' quelli di questo
  return jsonb_build_object('ok', true, 'tipo', t.codice, 'punti_contributo', t.punti) || public.fondatori_punti_di(uid);
end $$;
revoke all on function public.fondatori_assegna(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.fondatori_assegna(text, text, text, text, uuid) to service_role;

-- Il modulo delle tre domande è il primo contributo: vale i punti del tipo «feedback» quando Simone lo accetta. Una volta.
create or replace function public.fondatori_accetta_feedback(p_id uuid, p_nota text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r public.fondatori_richieste;
begin
  select * into r from public.fondatori_richieste where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'errore', 'non_trovata'); end if;
  if exists (select 1 from public.fondatori_contributi where richiesta_id = p_id) then
    return jsonb_build_object('ok', true, 'gia', true) || public.fondatori_punti_di(r.user_id);
  end if;
  return public.fondatori_assegna(r.user_id::text, 'feedback', coalesce(p_nota, 'Le tre domande del modulo'), 'Simone', p_id);
end $$;
revoke all on function public.fondatori_accetta_feedback(uuid, text) from public, anon, authenticated;
grant execute on function public.fondatori_accetta_feedback(uuid, text) to service_role;

-- Il numero è il posto: il più piccolo libero nella prima ondata APERTA che ne ha ancora, e solo a soglia raggiunta per
-- quell'ondata. Il lucchetto sulla tabella mette in fila due approvazioni simultanee; unique + trigger restano l'ultima parola.
create or replace function public.fondatori_approva(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r public.fondatori_richieste; v_ond int; v_nome text; v_sp int; v_st int; n int; pt jsonb;
begin
  lock table public.fondatori_richieste in share row exclusive mode;
  select * into r from public.fondatori_richieste where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'errore', 'non_trovata'); end if;
  if r.stato = 'approvato' then
    return jsonb_build_object('ok', true, 'numero', r.numero_fondatore, 'ondata', r.ondata, 'gia', true);
  end if;
  if r.stato <> 'in_attesa' then return jsonb_build_object('ok', false, 'errore', 'non_in_attesa', 'stato', r.stato); end if;
  select x.numero, x.nome, x.soglia_punti, x.soglia_tipi, g into v_ond, v_nome, v_sp, v_st, n
    from public.fondatori_ondate x cross join lateral generate_series(x.dal, x.al) g
   where x.aperta and not exists (select 1 from public.fondatori_richieste f where f.numero_fondatore = g)
   order by x.numero, g limit 1;
  if n is null then
    -- resta in attesa: piena l'ondata aperta, o nessuna aperta. Simone apre la successiva e riprova.
    return jsonb_build_object('ok', false, 'errore',
      case when exists (select 1 from public.fondatori_ondate where aperta) then 'posti_esauriti' else 'nessuna_ondata_aperta' end);
  end if;
  pt := public.fondatori_punti_di(r.user_id);
  if v_sp is null then
    return jsonb_build_object('ok', false, 'errore', 'soglia_da_decidere', 'ondata', v_ond) || pt;
  end if;
  if not public.fondatori_soglia_ok(r.user_id, v_ond) then
    return jsonb_build_object('ok', false, 'errore', 'soglia_non_raggiunta', 'ondata', v_ond,
                              'soglia_punti', v_sp, 'soglia_tipi', v_st) || pt;
  end if;
  update public.fondatori_richieste set stato = 'approvato', numero_fondatore = n, ondata = v_ond, decisa_il = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'numero', n, 'ondata', v_ond, 'nome', v_nome) || pt;
end $$;
revoke all on function public.fondatori_approva(uuid) from public, anon, authenticated;
grant execute on function public.fondatori_approva(uuid) to service_role;

-- Aprire o chiudere un'ondata (ops/fondatori.sh apri-ondata / chiudi-ondata). Solo il servizio.
create or replace function public.fondatori_ondata_apri(p_numero int, p_aperta boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare o public.fondatori_ondate;
begin
  update public.fondatori_ondate set aperta = coalesce(p_aperta, false) where numero = p_numero returning * into o;
  if not found then return jsonb_build_object('ok', false, 'errore', 'ondata_inesistente'); end if;
  return jsonb_build_object('ok', true, 'numero', o.numero, 'nome', o.nome, 'aperta', o.aperta,
                            'soglia_punti', o.soglia_punti, 'soglia_tipi', o.soglia_tipi);
end $$;
revoke all on function public.fondatori_ondata_apri(int, boolean) from public, anon, authenticated;
grant execute on function public.fondatori_ondata_apri(int, boolean) to service_role;

create or replace function public.fondatori_respingi(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r public.fondatori_richieste;
begin
  select * into r from public.fondatori_richieste where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'errore', 'non_trovata'); end if;
  if r.stato <> 'in_attesa' then return jsonb_build_object('ok', false, 'errore', 'non_in_attesa', 'stato', r.stato); end if;
  update public.fondatori_richieste set stato = 'respinto', decisa_il = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fondatori_respingi(uuid) from public, anon, authenticated;
grant execute on function public.fondatori_respingi(uuid) to service_role;

-- L'elenco per Simone (ops/fondatori.sh lista): con l'email, i punti, i tipi e quanti progetti ha l'account.
create or replace function public.fondatori_lista(p_stato text default 'in_attesa')
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'email', u.email, 'creata_il', f.creata_il, 'stato', f.stato, 'numero', f.numero_fondatore, 'ondata', f.ondata,
           'tipo_utente', f.tipo_utente, 'nome_pubblico', f.nome_pubblico,
           'progetti', (select count(*) from public.stageplot_projects p where p.user_id = f.user_id and p.deleted_at is null),
           'feedback_accettato', exists (select 1 from public.fondatori_contributi c where c.richiesta_id = f.id),
           'perso_tempo', f.risposta_tempo, 'manca', f.risposta_manca, 'prossimo', f.risposta_prossimo)
           || public.fondatori_punti_di(f.user_id)
         order by f.creata_il), '[]'::jsonb)
    from public.fondatori_richieste f
    join auth.users u on u.id = f.user_id
   where p_stato is null or f.stato = p_stato
$$;
revoke all on function public.fondatori_lista(text) from public, anon, authenticated;
grant execute on function public.fondatori_lista(text) to service_role;

-- Lo stato di un account (ops/fondatori.sh stato): contributi, punti, tipi, richiesta e soglia dell'ondata aperta.
create or replace function public.fondatori_stato(p_chi text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with u as (select public.fondatori_account(p_chi) as id),
  c as (select * from public.fondatori_ondate where aperta order by numero limit 1)
  select case when (select id from u) is null then jsonb_build_object('ok', false, 'errore', 'account_inesistente') else
    jsonb_build_object('ok', true,
      'email', (select email from auth.users where id = (select id from u)),
      'contributi', coalesce((select jsonb_agg(jsonb_build_object('tipo', k.tipo, 'punti', k.punti, 'nota', k.nota,
                                 'assegnato_da', k.assegnato_da, 'il', k.creato_il) order by k.creato_il)
                                from public.fondatori_contributi k where k.user_id = (select id from u)), '[]'::jsonb),
      'richiesta', (select jsonb_build_object('id', f.id, 'stato', f.stato, 'numero', f.numero_fondatore, 'ondata', f.ondata)
                      from public.fondatori_richieste f where f.user_id = (select id from u) order by f.creata_il desc limit 1),
      'ondata', (select jsonb_build_object('numero', numero, 'nome', nome, 'soglia_punti', soglia_punti, 'soglia_tipi', soglia_tipi) from c))
    || public.fondatori_punti_di((select id from u)) end
$$;
revoke all on function public.fondatori_stato(text) from public, anon, authenticated;
grant execute on function public.fondatori_stato(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────── la sola lettura pubblica
-- L'ondata «corrente» è la prima aperta che ha ancora posti; se sono tutte piene, la prima aperta (posti 0).
create or replace function public.fondatori_pubblico()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with o as (
    select x.numero, x.nome, x.aperta, x.al - x.dal + 1 as posti, x.soglia_punti, x.soglia_tipi,
           (select count(*) from public.fondatori_richieste f where f.ondata = x.numero and f.stato = 'approvato') as presi
      from public.fondatori_ondate x),
  c as (select * from o where aperta order by (presi >= posti), numero limit 1)
  select jsonb_build_object(
    'posti_rimasti', coalesce((select greatest(0, posti - presi) from c), 0),
    'ondata', (select jsonb_build_object('numero', numero, 'nome', nome, 'posti', posti,
                                         'soglia_punti', soglia_punti, 'soglia_tipi', soglia_tipi) from c),
    'ondate', coalesce((select jsonb_agg(jsonb_build_object('numero', numero, 'nome', nome, 'posti', posti, 'aperta', aperta,
                                         'soglia_punti', soglia_punti, 'soglia_tipi', soglia_tipi) order by numero) from o), '[]'::jsonb),
    'tipi', coalesce((select jsonb_agg(jsonb_build_object('codice', codice, 'nome', nome, 'punti', punti) order by ordine, codice)
                        from public.fondatori_tipi_contributo where attivo), '[]'::jsonb),
    'nomi', coalesce((select jsonb_agg(jsonb_build_object('nome', nome_pubblico, 'ondata', ondata) order by numero_fondatore)
                        from public.fondatori_richieste
                       where stato = 'approvato' and consenso_nome and nome_pubblico is not null), '[]'::jsonb))
$$;
revoke all on function public.fondatori_pubblico() from public;
grant execute on function public.fondatori_pubblico() to anon, authenticated, service_role;

-- Le funzioni della soglia del modulo restano eseguibili da tutti: il vincolo le chiama con i permessi di chi inserisce, e
-- leggono solo il testo che ricevono (immutable, nessuna tabella).

-- ─────────────────────────────────────────────────────────────────────────────── account solo biglietteria
-- Copia di 0078 + fondatori_richieste: chi ha chiesto di diventare fondatore non è un account «solo biglietteria».
create or replace function public.bgl_account_solo_biglietteria(p_uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.bgl_pubblico where user_id = p_uid)
     and not exists (select 1 from public.stageplot_projects where user_id = p_uid)
     and not exists (select 1 from public.stageplot_contacts where user_id = p_uid)
     and not exists (select 1 from public.bgl_organizzatori where user_id = p_uid)
     and not exists (select 1 from public.bgl_eventi where user_id = p_uid)
     and not exists (select 1 from public.orc_profiles where id = p_uid)
     and not exists (select 1 from public.orc_memberships where user_id = p_uid)
     and not exists (select 1 from public.orc_musician_profiles where user_id = p_uid)
     -- e nessun altro dato che la cancellazione dell'account porterebbe via con sé (on delete cascade) o
     -- staccherebbe da lui: richieste, consensi, file, musicisti, reparti, consulenze. Meglio un «scrivici» in più
     -- che un dato di lavoro perso per una pulizia automatica.
     and not exists (select 1 from public.sp_requests where user_id = p_uid)
     and not exists (select 1 from public.orc_client_requests where user_id = p_uid)
     and not exists (select 1 from public.orc_consents where user_id = p_uid)
     and not exists (select 1 from public.orc_files where owner_user_id = p_uid)
     and not exists (select 1 from public.orc_musicians where user_id = p_uid)
     and not exists (select 1 from public.stageplot_dept_assign where user_id = p_uid)
     and not exists (select 1 from public.stageplot_item_contacts where user_id = p_uid)
     and not exists (select 1 from public.consultation_requests where user_id = p_uid)
     -- revisione T23: una segnalazione dall'editor (feedback, on delete set null) terrebbe l'email in chiaro staccata
     -- dall'account; e le colonne «creato da» di Orchestre. Un test controlla che ogni riferimento ad auth.users sia qui.
     and not exists (select 1 from public.feedback where user_id = p_uid)
     and not exists (select 1 from public.sp_request_versions where reopened_by = p_uid)
     and not exists (select 1 from public.orc_organizations where created_by = p_uid)
     and not exists (select 1 from public.orc_musicians where created_by = p_uid)
     and not exists (select 1 from public.orc_musician_exclusions where created_by = p_uid)
     and not exists (select 1 from public.orc_productions where created_by = p_uid)
     and not exists (select 1 from public.orc_matching_rulesets where created_by = p_uid)
     and not exists (select 1 from public.orc_matching_runs where ran_by = p_uid)
     and not exists (select 1 from public.orc_invitations where created_by = p_uid)
     and not exists (select 1 from public.orc_performance_feedback where author_id = p_uid)
     and not exists (select 1 from public.orc_evaluations where author_id = p_uid)
     and not exists (select 1 from public.orc_musician_invites where claimed_by = p_uid)
     -- 0080: un fondatore (o chi lo ha chiesto, o chi ha contribuito) non si cancella con una pulizia automatica
     and not exists (select 1 from public.fondatori_richieste where user_id = p_uid)
     and not exists (select 1 from public.fondatori_contributi where user_id = p_uid)
$$;
revoke all on function public.bgl_account_solo_biglietteria(uuid) from public, anon, authenticated;
grant execute on function public.bgl_account_solo_biglietteria(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────── retention
-- Copia di 0072 + le richieste respinte, cancellate 12 mesi dopo la decisione (privacy, sezione 9).
create or replace function public.stageplot_purge_expired()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a int; f int; l int; bp int; bi int; bt int; fr int;
begin
  delete from public.analytics_events  where created_at   < now() - interval '30 days';
  get diagnostics a = row_count;
  delete from public.feedback_throttle where window_start < now() - interval '7 days';
  get diagnostics f = row_count;
  delete from public.landing_throttle  where window_start < now() - interval '7 days';
  get diagnostics l = row_count;
  update public.bgl_prenotazioni p
     set nome = null, cognome = null, email = null, email_norm = null, token_hash = null, ip_hash = null,
         anonimizzata_il = now()
    from public.bgl_eventi e
   where p.evento_id = e.id and p.anonimizzata_il is null and e.inizio < now() - interval '30 days';
  get diagnostics bp = row_count;
  update public.bgl_prenotazioni p set ip_hash = null
    from public.bgl_eventi e
   where p.evento_id = e.id and p.ip_hash is not null and e.inizio < now() - interval '1 day';
  get diagnostics bi = row_count;
  delete from public.bgl_throttle where window_start < now() - interval '7 days';
  get diagnostics bt = row_count;
  delete from public.fondatori_richieste where stato = 'respinto' and decisa_il < now() - interval '12 months';
  get diagnostics fr = row_count;
  return jsonb_build_object('analytics_events', a, 'feedback_throttle', f, 'landing_throttle', l,
    'bgl_anonimizzate', bp, 'bgl_impronte', bi, 'bgl_throttle', bt, 'fondatori_respinte', fr);
end;
$$;

comment on function public.stageplot_purge_expired() is
  'Retention delle tabelle: analytics_events (>30gg), feedback_throttle, landing_throttle e bgl_throttle (>7gg), dati personali delle prenotazioni della biglietteria (30gg dopo l''evento), impronta della connessione sulle prenotazioni (1 giorno dopo l''evento), richieste dei fondatori respinte (12 mesi dopo la decisione). Le schermate delle segnalazioni le cancella la Edge Function retention-purge con la Storage API (0062).';

revoke all on function public.stageplot_purge_expired() from public, anon, authenticated;
grant execute on function public.stageplot_purge_expired() to service_role;
