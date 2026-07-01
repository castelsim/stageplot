-- supabase/migrations/0007_stageplot_projects_share.sql
-- Condivisione generica di un progetto: token pubblico per il link ?view= (sola lettura + copia).
-- Riusa la tabella esistente; nessuna nuova tabella (la copia è un normale insert).
alter table public.stageplot_projects
  add column if not exists share_token text;

create unique index if not exists stageplot_projects_share_token_key
  on public.stageplot_projects(share_token) where share_token is not null;
