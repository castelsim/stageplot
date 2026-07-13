-- 0012_projects_is_locked.sql
--
-- BLOCCO PROGETTI APPROVATI (spec Simone 13/07/2026).
--
-- Un progetto può essere "bloccato" dal proprietario: resta apribile, condivisibile,
-- duplicabile ed esportabile, ma NON modificabile finché non viene sbloccato.
--
-- Colonna `is_locked` (default false → i progetti esistenti sono sbloccati).
--
-- Protezione NON aggirabile (anche via chiamate dirette alle API): un trigger BEFORE UPDATE
-- impedisce di cambiare `data` o `title` mentre il progetto RESTA bloccato
-- (old.is_locked AND new.is_locked). Le transizioni sono permesse:
--   • BLOCCA  (false → true): consente un ultimo salvataggio contestuale;
--   • SBLOCCA (true → false): consente di riattivare le modifiche.
-- L'autosave del client controlla comunque lo stato PRIMA di scrivere (difesa in profondità);
-- questo trigger è il backstop lato DB.
--
-- Idempotente. Coesiste con `stageplot_projects_touch` (0011, updated_at): entrambi BEFORE UPDATE.
-- RLS invariata: solo il proprietario (auth.uid() = user_id) può leggere/aggiornare le proprie righe,
-- quindi solo il proprietario può bloccare/sbloccare.

alter table public.stageplot_projects
  add column if not exists is_locked boolean not null default false;

create or replace function public.stageplot_projects_lock_guard()
returns trigger
language plpgsql
as $$
begin
  if old.is_locked and new.is_locked
     and (new.data is distinct from old.data or new.title is distinct from old.title) then
    raise exception 'stageplot: project is locked (read-only)';
  end if;
  return new;
end;
$$;

drop trigger if exists stageplot_projects_lock_guard on public.stageplot_projects;
create trigger stageplot_projects_lock_guard
  before update on public.stageplot_projects
  for each row execute function public.stageplot_projects_lock_guard();
