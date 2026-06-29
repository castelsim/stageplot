-- supabase/migrations/0002_consultation_share.sql
alter table public.consultation_requests
  add column if not exists project_id uuid references public.stageplot_projects(id),
  add column if not exists share_token text;
create unique index if not exists consultation_requests_share_token_key
  on public.consultation_requests(share_token) where share_token is not null;
