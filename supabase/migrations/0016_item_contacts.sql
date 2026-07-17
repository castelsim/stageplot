-- 0016 — Contatto sul musicista (17/07): assegnazione contatto ↔ elemento del progetto.
-- I dati delle persone stanno in stageplot_contacts (rubrica account, 0014); qui SOLO il legame.
-- Vive nell'ACCOUNT del proprietario, MAI nel blob del progetto → link condivisi, copie e PDF
-- non contengono nulla per costruzione (privacy by design, scelta Simone: condivisione opt-in futura).
create table if not exists public.stageplot_item_contacts (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  item_id text not null,
  contact_id uuid not null references public.stageplot_contacts(id) on delete cascade,
  updated_at timestamptz default now(),
  primary key (user_id, project_id, item_id)
);
alter table public.stageplot_item_contacts enable row level security;
drop policy if exists item_contacts_own on public.stageplot_item_contacts;
create policy item_contacts_own on public.stageplot_item_contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
