-- 0017 — Hub produzione, decisione 3A (18/07): responsabilità dei reparti.
-- Reparto → 1 azienda + N responsabili. Aziende e persone nella rubrica account (stageplot_contacts);
-- qui SOLO il legame (progetto, reparto) → contatto, con ruolo. Vive nell'ACCOUNT del proprietario,
-- MAI nel blob → link condivisi, copie e PDF non contengono nulla (privacy by design, coerente 0016).

-- (1) le aziende riusano la rubrica persone: distinguiamo con "kind" (person|company).
alter table public.stageplot_contacts add column if not exists kind text not null default 'person';

-- (2) assegnazioni reparto → contatto. role: '__azienda__' per l'azienda principale del reparto,
--     altrimenti il ruolo del responsabile (Capo reparto / Tecnico / Runner / …).
create table if not exists public.stageplot_dept_assign (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  dept_key text not null,                 -- 'audio','monitor','rf','rete','power' o id reparto extra
  contact_id uuid not null references public.stageplot_contacts(id) on delete cascade,
  role text not null default '',           -- '__azienda__' | ruolo del responsabile
  updated_at timestamptz default now(),
  unique (user_id, project_id, dept_key, contact_id)
);
create index if not exists dept_assign_proj on public.stageplot_dept_assign (user_id, project_id);
alter table public.stageplot_dept_assign enable row level security;
drop policy if exists dept_assign_own on public.stageplot_dept_assign;
create policy dept_assign_own on public.stageplot_dept_assign
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
