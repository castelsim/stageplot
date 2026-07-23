-- Estende il lock ai campi documentali aggiunti dopo 0012.
-- File preparato localmente: non applicato automaticamente ad alcun ambiente.

create or replace function public.stageplot_projects_lock_guard()
returns trigger
language plpgsql
as $$
begin
  if old.is_locked and new.is_locked
     and (
       new.data is distinct from old.data
       or new.title is distinct from old.title
       or new.venue_image is distinct from old.venue_image
       or new.thumbnail is distinct from old.thumbnail
       or new.schema_version is distinct from old.schema_version
     ) then
    raise exception using
      errcode = '55000',
      message = 'stageplot: project is locked (read-only)';
  end if;
  return new;
end;
$$;

drop trigger if exists stageplot_projects_lock_guard on public.stageplot_projects;
create trigger stageplot_projects_lock_guard
  before update on public.stageplot_projects
  for each row execute function public.stageplot_projects_lock_guard();
