-- supabase/migrations/0003_consultation_fk_set_null.sql
-- La FK project_id era ON DELETE NO ACTION: un progetto usato in una consulenza
-- diventava non cancellabile dal tool (DELETE hard → errore 23503). Con SET NULL,
-- cancellare il progetto azzera il riferimento (il link "vivo" poi risponde 404).
alter table public.consultation_requests
  drop constraint if exists consultation_requests_project_id_fkey,
  add constraint consultation_requests_project_id_fkey
    foreign key (project_id) references public.stageplot_projects(id) on delete set null;
