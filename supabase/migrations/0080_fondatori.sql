-- 0080 — Programma Fondatori di stageplot.it (decisioni di Simone del 10/10/2026).
--   · I primi 100 fondatori APPROVATI hanno accesso a vita a tutte le funzioni software, presenti e future (esclusa la
--     consulenza). Si diventa fondatori lasciando un feedback costruttivo; Simone approva a mano ogni richiesta.
--   · fondatori_richieste: una riga per richiesta. L'utente inserisce e legge SOLO le sue (RLS); può scrivere solo le
--     risposte, il tipo di utente e il nome pubblico (privilegi per colonna): stato, numero e date non li tocca.
--   · A ONDATE (aggiornamento di Simone del 10/10): fondatori_ondate = una riga per ondata, con il nome, l'intervallo dei
--     numeri e se è aperta. Ondata 1 «Fondatore» = numeri 1–100 (accesso a vita), APERTA; ondata 2 «Early adopter» =
--     101–200 (condizioni agevolate, ancora da definire), CHIUSA. Il numero è progressivo e globale: l'intervallo dice
--     l'ondata. Le ondate successive si aggiungono con una riga (intervalli che non si sovrappongono: vincolo exclude).
--   · Il tetto lo garantisce il DATABASE, PER ONDATA: numero_fondatore è unico, e un trigger rifiuta un numero fuori
--     dall'intervallo della sua ondata (anche dal servizio). Stato = 'approvato' se e solo se ci sono numero e ondata.
--   · Approvare e respingere: solo il servizio (fondatori_approva / fondatori_respingi, usate da ops/fondatori.sh).
--     Si approva nella prima ondata APERTA con un posto libero; se non ce n'è, la richiesta resta in attesa
--     (posti_esauriti / nessuna_ondata_aperta) finché Simone non apre l'ondata dopo (fondatori_ondata_apri).
--   · fondatori_pubblico(): l'unica lettura pubblica. Restituisce SOLO i posti rimasti nell'ondata aperta, le ondate
--     (nome, posti, aperta: configurazione, non dati di persone) e i nomi di chi ha acconsentito, con la sua ondata.
--   · Il feedback deve avere contenuto: almeno 2 risposte su 3 «piene» (≥ 30 caratteri e ≥ 5 parole, spazi compressi)
--     e diverse fra loro. La stessa soglia sta nell'editor (FONDATORI_SOGLIA): un test le confronta.
--   · Una sola richiesta attiva (in attesa o approvata) per account; al massimo 3 richieste in tutto.
--   · Retention: le richieste respinte si cancellano 12 mesi dopo la decisione (stageplot_purge_expired, in fondo).
--   · bgl_account_solo_biglietteria guarda anche questa tabella (AGENTS §8: ogni tabella che punta a un account).

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

-- ─────────────────────────────────────────────────────────────────────────────── le ondate
create table public.fondatori_ondate (
  numero int  primary key check (numero >= 1),
  nome   text not null check (char_length(nome) between 2 and 40),   -- al singolare, come nel badge: «Fondatore n. 7»
  dal    int  not null check (dal >= 1),
  al     int  not null,
  aperta boolean not null default false,
  check (al >= dal),
  exclude using gist (int4range(dal, al, '[]') with &&)              -- due ondate non si dividono un numero
);
insert into public.fondatori_ondate (numero, nome, dal, al, aperta) values
  (1, 'Fondatore', 1, 100, true),
  (2, 'Early adopter', 101, 200, false);
alter table public.fondatori_ondate enable row level security;
revoke all on table public.fondatori_ondate from public, anon, authenticated;
grant select, insert, update, delete on table public.fondatori_ondate to service_role;
comment on table public.fondatori_ondate is
  'Programma Fondatori (0080): le ondate. Ondata 1 = i primi 100 (accesso a vita), ondata 2 = early adopter (101–200). Si aprono solo dal servizio.';

-- ─────────────────────────────────────────────────────────────────────────────── le richieste
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
  'Programma Fondatori (0080): richieste con il feedback. Approvazione solo dal servizio, nella prima ondata aperta; il numero sta nell''intervallo della sua ondata (trigger) ed è unico.';

-- IL TETTO PER ONDATA: un numero sta dentro l'intervallo della sua ondata, chiunque scriva (anche il servizio).
-- Con numero_fondatore unico, un'ondata non può avere più approvati dei suoi numeri.
create or replace function public.fondatori_numero_nell_ondata()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.numero_fondatore is not null and not exists (
       select 1 from public.fondatori_ondate o
        where o.numero = new.ondata and new.numero_fondatore between o.dal and o.al) then
    raise exception 'numero_fuori_ondata' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.fondatori_numero_nell_ondata() from public, anon, authenticated;
create trigger fondatori_numero_nell_ondata before insert or update of numero_fondatore, ondata on public.fondatori_richieste
  for each row execute function public.fondatori_numero_nell_ondata();

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

-- ─────────────────────────────────────────────────────────────────────────────── permessi e RLS
alter table public.fondatori_richieste enable row level security;
revoke all on table public.fondatori_richieste from public, anon, authenticated;
grant select on table public.fondatori_richieste to authenticated;
-- solo queste colonne: user_id prende auth.uid() dal default, stato/numero/date i loro default
grant insert (risposta_tempo, risposta_manca, risposta_prossimo, tipo_utente, nome_pubblico, consenso_nome)
  on table public.fondatori_richieste to authenticated;
grant select, insert, update, delete on table public.fondatori_richieste to service_role;

create policy fondatori_leggo_le_mie on public.fondatori_richieste
  for select to authenticated using (user_id = auth.uid());
create policy fondatori_scrivo_la_mia on public.fondatori_richieste
  for insert to authenticated
  with check (user_id = auth.uid() and stato = 'in_attesa' and numero_fondatore is null and ondata is null and decisa_il is null);
-- niente update né delete per l'utente: la cancellazione si chiede scrivendo (privacy, sezione 9)

-- ─────────────────────────────────────────────────────────────────────────────── approvare, respingere (servizio)
-- Il numero è il posto: il più piccolo libero nella prima ondata APERTA che ne ha ancora. Il lucchetto sulla tabella mette
-- in fila due approvazioni simultanee (leggerebbero lo stesso «primo libero»); unique + trigger restano l'ultima parola.
create or replace function public.fondatori_approva(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r public.fondatori_richieste; v_ond int; v_nome text; n int;
begin
  lock table public.fondatori_richieste in share row exclusive mode;
  select * into r from public.fondatori_richieste where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'errore', 'non_trovata'); end if;
  if r.stato = 'approvato' then
    return jsonb_build_object('ok', true, 'numero', r.numero_fondatore, 'ondata', r.ondata, 'gia', true);
  end if;
  if r.stato <> 'in_attesa' then return jsonb_build_object('ok', false, 'errore', 'non_in_attesa', 'stato', r.stato); end if;
  select x.numero, x.nome, g into v_ond, v_nome, n
    from public.fondatori_ondate x cross join lateral generate_series(x.dal, x.al) g
   where x.aperta and not exists (select 1 from public.fondatori_richieste f where f.numero_fondatore = g)
   order by x.numero, g limit 1;
  if n is null then
    -- resta in attesa: piena l'ondata aperta, o nessuna aperta. Simone apre la successiva e riprova.
    return jsonb_build_object('ok', false, 'errore',
      case when exists (select 1 from public.fondatori_ondate where aperta) then 'posti_esauriti' else 'nessuna_ondata_aperta' end);
  end if;
  update public.fondatori_richieste set stato = 'approvato', numero_fondatore = n, ondata = v_ond, decisa_il = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'numero', n, 'ondata', v_ond, 'nome', v_nome);
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
  return jsonb_build_object('ok', true, 'numero', o.numero, 'nome', o.nome, 'aperta', o.aperta);
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

-- L'elenco per Simone (ops/fondatori.sh lista): con l'email dell'account e quanti progetti ha, per decidere.
create or replace function public.fondatori_lista(p_stato text default 'in_attesa')
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'email', u.email, 'creata_il', f.creata_il, 'stato', f.stato, 'numero', f.numero_fondatore, 'ondata', f.ondata,
           'tipo_utente', f.tipo_utente, 'nome_pubblico', f.nome_pubblico,
           'progetti', (select count(*) from public.stageplot_projects p where p.user_id = f.user_id and p.deleted_at is null),
           'perso_tempo', f.risposta_tempo, 'manca', f.risposta_manca, 'prossimo', f.risposta_prossimo)
         order by f.creata_il), '[]'::jsonb)
    from public.fondatori_richieste f
    join auth.users u on u.id = f.user_id
   where p_stato is null or f.stato = p_stato
$$;
revoke all on function public.fondatori_lista(text) from public, anon, authenticated;
grant execute on function public.fondatori_lista(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────── la sola lettura pubblica
-- L'ondata «corrente» è la prima aperta che ha ancora posti; se sono tutte piene, la prima aperta (posti 0).
create or replace function public.fondatori_pubblico()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with o as (
    select x.numero, x.nome, x.aperta, x.al - x.dal + 1 as posti,
           (select count(*) from public.fondatori_richieste f where f.ondata = x.numero and f.stato = 'approvato') as presi
      from public.fondatori_ondate x),
  c as (select * from o where aperta order by (presi >= posti), numero limit 1)
  select jsonb_build_object(
    'posti_rimasti', coalesce((select greatest(0, posti - presi) from c), 0),
    'ondata', (select jsonb_build_object('numero', numero, 'nome', nome, 'posti', posti) from c),
    'ondate', coalesce((select jsonb_agg(jsonb_build_object('numero', numero, 'nome', nome, 'posti', posti, 'aperta', aperta)
                                         order by numero) from o), '[]'::jsonb),
    'nomi', coalesce((select jsonb_agg(jsonb_build_object('nome', nome_pubblico, 'ondata', ondata) order by numero_fondatore)
                        from public.fondatori_richieste
                       where stato = 'approvato' and consenso_nome and nome_pubblico is not null), '[]'::jsonb))
$$;
revoke all on function public.fondatori_pubblico() from public;
grant execute on function public.fondatori_pubblico() to anon, authenticated, service_role;

-- Le funzioni della soglia restano eseguibili da tutti: il vincolo le chiama con i permessi di chi inserisce, e
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
     -- 0080: un fondatore (o chi lo ha chiesto) ha scritto il suo feedback: non si cancella con una pulizia automatica
     and not exists (select 1 from public.fondatori_richieste where user_id = p_uid)
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
