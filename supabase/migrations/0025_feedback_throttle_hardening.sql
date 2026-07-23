-- Chiude l'RPC SECURITY DEFINER del rate limit: soltanto la Edge Function con
-- service_role può invocarlo. Aggiunge validazione e retention delle impronte IP.
-- File preparato localmente: non applicato automaticamente.

create index if not exists feedback_throttle_window_idx
  on public.feedback_throttle (window_start);

create or replace function public.feedback_throttle_hit(p_ip_hash text)
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
      message = 'stageplot: invalid feedback throttle hash';
  end if;

  delete from public.feedback_throttle
  where window_start < v_window - interval '48 hours';

  insert into public.feedback_throttle as throttle(ip_hash, window_start, count)
  values (p_ip_hash, v_window, 1)
  on conflict (ip_hash, window_start)
  do update set count = throttle.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

revoke execute on function public.feedback_throttle_hit(text)
  from public, anon, authenticated;
grant execute on function public.feedback_throttle_hit(text)
  to service_role;
