-- supabase/migrations/0006_feedback.sql
-- Box feedback "Cosa manca?" — Blocco 1 instrumentation.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null,
  hint text,
  category text,
  status text not null default 'new',
  priority text,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  project_id uuid references public.stageplot_projects(id) on delete set null,
  app_version text,
  page_url text,
  user_agent text,
  viewport text,
  language text,
  tech_context jsonb not null default '{}'::jsonb,
  project_snapshot jsonb,
  admin_notes text
);

alter table public.feedback enable row level security;
-- Nessuna policy: accessibile solo via service role (Edge Function submit-feedback).

create table if not exists public.feedback_throttle (
  ip_hash text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (ip_hash, window_start)
);
alter table public.feedback_throttle enable row level security;

-- Incremento atomico del contatore nella finestra oraria corrente. Ritorna il nuovo count.
create or replace function public.feedback_throttle_hit(p_ip_hash text)
returns int language plpgsql security definer
set search_path = public as $$
declare v_window timestamptz := date_trunc('hour', now()); v_count int;
begin
  insert into public.feedback_throttle(ip_hash, window_start, count)
  values (p_ip_hash, v_window, 1)
  on conflict (ip_hash, window_start)
  do update set count = feedback_throttle.count + 1
  returning count into v_count;
  return v_count;
end $$;
