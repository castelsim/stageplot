-- 0008_stageplot_projects_baseline.sql
--
-- AUDIT S2 (schema drift): la tabella `stageplot_projects` e le sue RLS — cuore
-- dell'isolamento multi-utente — erano state create DIRETTAMENTE nel DB remoto
-- (migration non versionate, tag remoti 20260628*), quindi non esistevano in nessun
-- file del repo: non auditabili, non riproducibili. Questa migration le mette sotto
-- version control replicando lo stato reale del DB (estratto il 2026-07-02 da
-- information_schema / pg_constraint / pg_indexes / pg_policies).
--
-- È IDEMPOTENTE: sul DB di produzione (dove tutto esiste già) non cambia nulla;
-- serve come fonte di verità versionata e per ricostruire il DB altrove.
--
-- Il prerequisito 0000 anticipa la CREATE per rendere riproducibili i riferimenti
-- presenti nelle migration precedenti. Questa baseline rimane intenzionalmente
-- idempotente per documentare lo schema/RLS storico e per non alterare la sequenza
-- già applicata agli ambienti esistenti.

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

-- Colonne aggiunte in tempi diversi (thumbnail = 0005, share_token = 0007):
-- idempotenza anche su un DB solo parzialmente allineato.
alter table public.stageplot_projects
  add column if not exists schema_version integer not null default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists thumbnail text,
  add column if not exists share_token text;

alter table public.stageplot_projects enable row level security;

-- Indici (riflettono lo stato reale del DB)
create index if not exists stageplot_projects_user_idx
  on public.stageplot_projects using btree (user_id, updated_at desc)
  where (deleted_at is null);
create unique index if not exists stageplot_projects_share_token_key
  on public.stageplot_projects using btree (share_token)
  where (share_token is not null);

-- RLS own-rows: ogni utente vede/modifica SOLO le proprie righe (auth.uid() = user_id).
-- Ruolo `public`: un anonimo ha auth.uid() = null, quindi (null = user_id) è null -> nessuna riga.
-- Le Edge Functions usano la service_role e bypassano queste policy per necessità (condivisione).
-- drop+create per idempotenza (ricrea la policy con la definizione versionata).
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
