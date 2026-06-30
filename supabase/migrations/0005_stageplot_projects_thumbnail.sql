-- supabase/migrations/0005_stageplot_projects_thumbnail.sql
-- Miniatura del rendering reale del progetto (JPEG data URL), generata dal tool al salvataggio cloud.
-- Mostrata nell'anteprima dell'hero della pagina consulenza.
alter table public.stageplot_projects
  add column if not exists thumbnail text;
