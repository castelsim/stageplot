-- 0037 — La schermata allegata alla segnalazione, e lo stato del suo triage.
--
-- Due cose che vanno insieme:
--   1. chi segnala può allegare il ritaglio del punto che non va (client: fbShotBtn / fbCrop);
--   2. chi legge le segnalazioni deve poter dire «questa l'ho guardata», o le rilegge tutte ogni volta.
--
-- Gli screenshot NON restano per sempre: 30 giorni (decisione di Simone, 17/08). La cancellazione
-- non dipende da nessuno che si ricordi di farla — si aggancia a stageplot_purge_expired(), la
-- funzione già schedulata da 0033 che purga analytics e throttle. Un allegato che sopravvive perché
-- «nessuno ha lanciato lo script» è esattamente il caso da evitare.

-- ---------------------------------------------------------------- 1. la colonna dell'allegato
alter table public.feedback
  add column if not exists screenshot_path text;

comment on column public.feedback.screenshot_path is
  'Percorso nel bucket feedback-shots. Cancellato dopo 30 giorni da stageplot_purge_expired(): la colonna torna null e l''oggetto sparisce da storage.';

-- ---------------------------------------------------------------- 2. lo stato del triage
do $$
begin
  if not exists (select 1 from pg_type where typname = 'feedback_stato') then
    create type public.feedback_stato as enum ('nuovo','in_lavorazione','fatto','scartato');
  end if;
end $$;

alter table public.feedback
  add column if not exists stato public.feedback_stato not null default 'nuovo',
  add column if not exists note_triage text,
  add column if not exists pr_url text,
  add column if not exists chiuso_il timestamptz;

comment on column public.feedback.stato is
  'Triage: nuovo → in_lavorazione → fatto/scartato. Senza questo si rileggono ogni volta le stesse segnalazioni.';
comment on column public.feedback.pr_url is 'La PR che chiude la segnalazione, quando c''è.';

-- indice per la domanda che si fa ogni volta: «cosa è arrivato di nuovo?»
create index if not exists feedback_stato_idx on public.feedback (stato, created_at desc);

-- ---------------------------------------------------------------- 3. il bucket, privato
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-shots', 'feedback-shots', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Nessuna policy di lettura pubblica: agli allegati si arriva solo con la service_role (la Edge
-- Function che li scrive, e ops/segnalazioni.sh che li legge). Il client NON li rilegge mai.

-- ---------------------------------------------------------------- 4. la scadenza, automatica
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

  -- Schermate delle segnalazioni: 30 giorni e via, chiuse o no. Prima l'oggetto, poi il riferimento:
  -- se il secondo passo fallisse resterebbe una riga che punta al nulla, e si vede; l'ordine inverso
  -- lascerebbe file orfani nel bucket, che non si vedono più.
  delete from storage.objects
   where bucket_id = 'feedback-shots'
     and created_at < now() - interval '30 days';

  update public.feedback
     set screenshot_path = null
   where screenshot_path is not null
     and created_at < now() - interval '30 days';
end;
$$;

comment on function public.stageplot_purge_expired() is
  'Purga analytics_events (>30gg), feedback_throttle e landing_throttle (>7gg) e le schermate delle segnalazioni (>30gg). Schedulata via pg_cron (0033).';

-- Come si legge il triage (da ops/sp-db.sh):
--   q feedback "select=id,created_at,hint,stato,message&stato=eq.nuovo&order=created_at.desc"
-- Quante schermate occupano spazio adesso:
--   select count(*), pg_size_pretty(sum((metadata->>'size')::bigint))
--     from storage.objects where bucket_id = 'feedback-shots';
