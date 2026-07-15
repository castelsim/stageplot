-- 0014 — Rubrica contatti account (spec 2026-07-15-rubrica-contatti-design).
-- Contatti personali riusabili tra progetti; visibili SOLO al proprietario (RLS).
-- L'assegnazione a un progetto è uno snapshot nel blob (state.contacts): nessuna FK dai progetti.
create table if not exists public.stageplot_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default '',
  name text not null default '',
  contact text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stageplot_contacts_user_idx on public.stageplot_contacts(user_id, updated_at desc);

alter table public.stageplot_contacts enable row level security;

create policy "contacts_select_own" on public.stageplot_contacts
  for select using (auth.uid() = user_id);
create policy "contacts_insert_own" on public.stageplot_contacts
  for insert with check (auth.uid() = user_id);
create policy "contacts_update_own" on public.stageplot_contacts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contacts_delete_own" on public.stageplot_contacts
  for delete using (auth.uid() = user_id);
