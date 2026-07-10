-- 0010_analytics_search_event.sql
-- Aggiunge 'search_no_results' alla whitelist eventi di analytics_events (RLS insert-only).
-- Serve per tracciare cosa cercano gli utenti nel catalogo e non trovano (segnale per il catalogo).
-- Il campo props.env ('prod'/'localhost'/'other') NON richiede migrazione: props è jsonb libero.
--
-- IDEMPOTENTE (drop+create). Applicare in produzione via SQL editor (lo storico CLI è disallineato).

drop policy if exists "analytics insert anon" on public.analytics_events;
create policy "analytics insert anon" on public.analytics_events
  for insert to anon
  with check (
    event in ('app_open','project_activated','export','share_created','login_success','cloud_first_save','search_no_results')
    and user_id is null
  );

drop policy if exists "analytics insert authenticated" on public.analytics_events;
create policy "analytics insert authenticated" on public.analytics_events
  for insert to authenticated
  with check (
    event in ('app_open','project_activated','export','share_created','login_success','cloud_first_save','search_no_results')
    and (user_id is null or user_id = auth.uid())
  );
