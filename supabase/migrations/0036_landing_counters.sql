-- Contatori della landing: quante visite, da dove, e quanti aprono l'editor da quale bottone.
-- File preparato localmente: non applicato automaticamente.
--
-- PERCHÉ NON RIAPRE QUELLO CHE 0026 AVEVA CHIUSO.
-- La 0026 ha tolto l'INSERT anonimo su analytics_events: con la anon key pubblica (il repo è
-- pubblico) chiunque poteva scrivere righe arbitrarie e far crescere il database. Qui:
--   * la tabella NON ha policy: nessuno scrive dal browser, solo la Edge Function con service_role;
--   * non si accumulano eventi ma CONTATORI aggregati — il numero di righe è limitato dalle
--     combinazioni possibili (giorno × 2 eventi × 5 bottoni × ~20 provenienze), quindi non esiste
--     un modo di gonfiare il database, al massimo si gonfia un numero;
--   * non si salva nulla di riconducibile a una persona: né IP, né user agent, né identificatori.
-- Resta possibile, per chi trova l'endpoint, incrementare i conteggi: è un contatore, non una
-- fonte di verità contabile. In cambio non c'è niente da rubare e niente da riempire.

create table if not exists public.landing_counters (
  day date not null,
  event text not null,
  source text not null default '',
  ref text not null default 'diretto',
  count int not null default 0,
  primary key (day, event, source, ref)
);
alter table public.landing_counters enable row level security;

-- Secondo strato dopo la validazione della Edge Function: se un giorno quella cambiasse e
-- lasciasse passare un valore inventato, il database lo rifiuta comunque.
alter table public.landing_counters
  drop constraint if exists landing_counters_shape;
alter table public.landing_counters
  add constraint landing_counters_shape
    check (
      event in ('view', 'app_click')
      -- sette ingressi, non quattro: oltre ai bottoni contano la didascalia sotto la schermata,
      -- il link del prima/dopo e quello nelle domande (vedi SORGENTI in landing-metrics.ts)
      and source in ('', 'hero', 'hero-modello', 'nav', 'finale',
                     'hero-didascalia', 'confronto', 'domande')
      and (event = 'view') = (source = '')
      and ref ~ '^[a-z]+$'
      and char_length(ref) between 1 and 24
      and count >= 0
    );

-- Incremento atomico del contatore di oggi. Il giorno lo decide il server: se lo mandasse il
-- client, basterebbe una data falsa per sporcare lo storico.
create or replace function public.landing_counter_hit(p_event text, p_source text, p_ref text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.landing_counters as c (day, event, source, ref, count)
  values (current_date, p_event, p_source, p_ref, 1)
  on conflict (day, event, source, ref)
  do update set count = c.count + 1;
end;
$$;

revoke execute on function public.landing_counter_hit(text, text, text)
  from public, anon, authenticated;
grant execute on function public.landing_counter_hit(text, text, text)
  to service_role;

-- Rate limit con lo stesso schema già usato per il feedback: impronta dell'IP con salt, finestra
-- oraria, e cancellazione dopo 48 ore. L'IP in chiaro non viene mai scritto.
create table if not exists public.landing_throttle (
  ip_hash text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (ip_hash, window_start)
);
alter table public.landing_throttle enable row level security;

create index if not exists landing_throttle_window_idx
  on public.landing_throttle (window_start);

create or replace function public.landing_throttle_hit(p_ip_hash text)
returns int
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count int;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'stageplot: invalid landing throttle hash';
  end if;

  delete from public.landing_throttle
  where window_start < v_window - interval '48 hours';

  insert into public.landing_throttle as throttle(ip_hash, window_start, count)
  values (p_ip_hash, v_window, 1)
  on conflict (ip_hash, window_start)
  do update set count = throttle.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

revoke execute on function public.landing_throttle_hit(text)
  from public, anon, authenticated;
grant execute on function public.landing_throttle_hit(text)
  to service_role;

-- RETENTION. La 0033 ha centralizzato la pulizia in stageplot_purge_expired(), schedulata via
-- pg_cron: landing_throttle deve entrarci, altrimenti le impronte IP resterebbero fuori dalla
-- retention dichiarata nell'informativa. Si ricrea la funzione com'è, con una riga in più.
-- landing_counters NON si purga: sono numeri aggregati che non riguardano nessuno, e sono
-- esattamente lo storico che serve per confrontare un mese con l'altro.
create or replace function public.stageplot_purge_expired()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.analytics_events  where created_at   < now() - interval '30 days';
  delete from public.feedback_throttle where window_start < now() - interval '7 days';
  delete from public.landing_throttle  where window_start < now() - interval '7 days';
end;
$$;

comment on function public.stageplot_purge_expired() is
  'Audit M-13: purga analytics_events (>30gg), feedback_throttle e landing_throttle (>7gg). Schedulata via pg_cron (0033) o manualmente.';

-- Come si leggono i numeri (da ops/sp-db.sh):
--   select day, event, source, ref, count from public.landing_counters
--   where day > current_date - 30 order by day desc, count desc;
-- Quanti arrivano e da dove:
--   select ref, sum(count) from public.landing_counters
--   where event = 'view' and day > current_date - 30 group by ref order by 2 desc;
-- Quanti aprono l'editor, e da quale bottone:
--   select source, sum(count) from public.landing_counters
--   where event = 'app_click' and day > current_date - 30 group by source order by 2 desc;
