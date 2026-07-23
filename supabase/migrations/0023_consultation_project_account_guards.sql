-- Impedisce che una richiesta pagabile perda il progetto e rende eliminabile l'account
-- quando non esistono consulenze attive. File preparato localmente: non applicato.

alter table public.consultation_requests
  drop constraint if exists consultation_requests_user_id_fkey,
  add constraint consultation_requests_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

create or replace function public.stageplot_guard_active_consultation_project()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  removing boolean := false;
begin
  if tg_op = 'DELETE' then
    removing := true;
  elsif tg_op = 'UPDATE' then
    removing := old.deleted_at is null and new.deleted_at is not null;
  end if;

  if removing and exists (
    select 1
    from public.consultation_requests request
    where request.project_id = old.id
      and request.share_revoked_at is null
      and (
        (
          request.paid is true
          and lower(request.status) in ('paid', 'in_progress', 'completed')
          and request.share_expires_at > now()
        )
        or (
          request.paid is false
          and lower(request.status) = 'new'
          and request.created_at > now() - interval '24 hours'
        )
      )
  ) then
    raise exception using
      errcode = '23503',
      message = 'stageplot: project has an active consultation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.stageplot_guard_active_consultation_project()
  from public;

drop trigger if exists stageplot_active_consultation_project_guard
  on public.stageplot_projects;
create trigger stageplot_active_consultation_project_guard
  before delete or update of deleted_at on public.stageplot_projects
  for each row execute function public.stageplot_guard_active_consultation_project();
