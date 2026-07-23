-- Disabilita l'ingest analytics anonimo e limita struttura/dimensione dei record.
-- File preparato localmente: non applicato automaticamente.

alter table public.analytics_events
  drop constraint if exists analytics_events_event_shape;
alter table public.analytics_events
  add constraint analytics_events_event_shape
    check (
      char_length(event) between 1 and 40
      and session_id is not null
      and char_length(session_id) between 1 and 80
      and session_id ~ '^[A-Za-z0-9._:-]+$'
      and jsonb_typeof(props) = 'object'
      and pg_column_size(props) <= 2048
    ) not valid;

drop policy if exists "analytics insert anon" on public.analytics_events;
drop policy if exists "analytics insert authenticated"
  on public.analytics_events;
create policy "analytics insert authenticated"
  on public.analytics_events
  for insert
  to authenticated
  with check (
    event in (
      'app_open',
      'project_activated',
      'export',
      'export_csv',
      'share_created',
      'login_success',
      'cloud_first_save',
      'search_no_results',
      'rubrica_save',
      'rubrica_pick'
    )
    and user_id = auth.uid()
    and props - array[
      'logged',
      'mobile',
      'app_version',
      'env',
      'q',
      'format',
      'rows'
    ]::text[] = '{}'::jsonb
  );

create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at);
