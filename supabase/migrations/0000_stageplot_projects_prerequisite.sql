-- Prerequisito di replay: le migration 0002/0005/0006/0007 referenziano
-- stageplot_projects. La baseline completa resta anche in 0008 per compatibilità
-- con la storia già applicata; tutte le operazioni sono idempotenti.

create table if not exists public.stageplot_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  data jsonb not null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  thumbnail text,
  share_token text
);

alter table public.stageplot_projects enable row level security;

create index if not exists stageplot_projects_user_idx
  on public.stageplot_projects using btree (user_id, updated_at desc)
  where deleted_at is null;
create unique index if not exists stageplot_projects_share_token_key
  on public.stageplot_projects using btree (share_token)
  where share_token is not null;

drop policy if exists "Leggi propri progetti" on public.stageplot_projects;
create policy "Leggi propri progetti" on public.stageplot_projects
  for select using (auth.uid() = user_id);

drop policy if exists "Inserisci propri progetti" on public.stageplot_projects;
create policy "Inserisci propri progetti" on public.stageplot_projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "Aggiorna propri progetti" on public.stageplot_projects;
create policy "Aggiorna propri progetti" on public.stageplot_projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Elimina propri progetti" on public.stageplot_projects;
create policy "Elimina propri progetti" on public.stageplot_projects
  for delete using (auth.uid() = user_id);
