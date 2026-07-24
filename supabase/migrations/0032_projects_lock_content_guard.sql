-- 0032_projects_lock_content_guard.sql
--
-- AUDIT M-14 — Il lock del progetto proteggeva solo `data` e `title`.
--
-- Un progetto "bloccato" (is_locked) è presentato all'utente come read-only, ma il trigger di
-- 0012 lasciava mutabili le colonne di CONTENUTO `venue_image` (la planimetria) e `thumbnail`
-- (l'anteprima, derivata dal contenuto). Un owner via Data API diretta — o un bug del client —
-- poteva quindi cambiare la planimetria di un progetto "read-only", tradendo la promessa.
--
-- Fix: il lock congela l'intero CONTENUTO dell'aggregato (`data`, `title`, `venue_image`,
-- `thumbnail`). Restano volutamente mutabili i METADATI AMMINISTRATIVI, perché sono azioni
-- amministrative legittime anche su un progetto bloccato (e sono la leva per gestirlo):
--   • `is_locked`      → BLOCCA/SBLOCCA (la transizione stessa);
--   • `share_token`, `share_expires_at`, `share_revoked_at` → creare/scadere/REVOCARE un link
--     di condivisione senza dover prima sbloccare il contenuto;
--   • `schema_version`, `updated_at` → metadati tecnici (una migrazione di schema che riscrive
--     `data` è comunque bloccata dal congelamento di `data`).
-- Questo è il "bloccare l'aggregato salvo unlock, separando i metadati amministrativi" del report.
--
-- Come 0012: la transizione BLOCCA (false→true) consente un ultimo salvataggio contestuale;
-- il congelamento vale solo mentre il progetto RESTA bloccato (old.is_locked AND new.is_locked).
-- Idempotente (create or replace). RLS invariata: solo il proprietario può bloccare/sbloccare.

create or replace function public.stageplot_projects_lock_guard()
returns trigger
language plpgsql
as $$
begin
  if old.is_locked and new.is_locked
     and (   new.data         is distinct from old.data
          or new.title        is distinct from old.title
          or new.venue_image  is distinct from old.venue_image
          or new.thumbnail    is distinct from old.thumbnail ) then
    raise exception 'stageplot: project is locked (read-only)';
  end if;
  return new;
end;
$$;

-- Il trigger di 0012 già punta a questa funzione; il create-or-replace lo aggiorna in loco.
-- (ricreato per idempotenza anche se applicato in ambiente pulito)
drop trigger if exists stageplot_projects_lock_guard on public.stageplot_projects;
create trigger stageplot_projects_lock_guard
  before update on public.stageplot_projects
  for each row execute function public.stageplot_projects_lock_guard();
