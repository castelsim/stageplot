-- I legami account-only devono seguire il ciclo di vita del progetto.
-- File preparato localmente: prima dell'applicazione verificare e registrare il numero di orfani eliminati.

delete from public.stageplot_item_contacts link
where not exists (
  select 1 from public.stageplot_projects project where project.id = link.project_id
);

delete from public.stageplot_dept_assign link
where not exists (
  select 1 from public.stageplot_projects project where project.id = link.project_id
);

alter table public.stageplot_item_contacts
  drop constraint if exists stageplot_item_contacts_project_id_fkey,
  add constraint stageplot_item_contacts_project_id_fkey
    foreign key (project_id) references public.stageplot_projects(id) on delete cascade;

alter table public.stageplot_dept_assign
  drop constraint if exists stageplot_dept_assign_project_id_fkey,
  add constraint stageplot_dept_assign_project_id_fkey
    foreign key (project_id) references public.stageplot_projects(id) on delete cascade;

create index if not exists stageplot_item_contacts_project_idx
  on public.stageplot_item_contacts (project_id);

create index if not exists stageplot_dept_assign_project_idx
  on public.stageplot_dept_assign (project_id);
