-- supabase/migrations/0009_analytics_events.sql
-- Analytics minimi (spec 2026-07-03): eventi d'uso privacy-friendly, zero terzi.
-- INSERT-only dal client (whitelist eventi via RLS); lettura solo service role / SQL editor.

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null,
  session_id text,            -- UUID effimero in sessionStorage: muore col tab, nessun tracking persistente degli anonimi
  user_id uuid,               -- solo se loggato (retention 30gg misurata sui loggati)
  props jsonb not null default '{}'::jsonb
);

alter table public.analytics_events enable row level security;

-- Anonimi: possono inserire solo eventi in whitelist e MAI attribuirli a un utente.
create policy "analytics insert anon" on public.analytics_events
  for insert to anon
  with check (
    event in ('app_open','project_activated','export','share_created','login_success','cloud_first_save')
    and user_id is null
  );

-- Loggati: stessi eventi, user_id assente o proprio (mai di altri).
create policy "analytics insert authenticated" on public.analytics_events
  for insert to authenticated
  with check (
    event in ('app_open','project_activated','export','share_created','login_success','cloud_first_save')
    and (user_id is null or user_id = auth.uid())
  );

-- Nessuna policy SELECT/UPDATE/DELETE: il client non legge né modifica nulla.

create index if not exists analytics_events_event_created_idx
  on public.analytics_events (event, created_at);
create index if not exists analytics_events_user_created_idx
  on public.analytics_events (user_id, created_at) where user_id is not null;
