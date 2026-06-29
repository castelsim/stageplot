-- supabase/migrations/0004_consultation_user_id.sql
-- Lega la richiesta all'utente Google loggato (flusso minimale: progetto + login pre-pagamento).
alter table public.consultation_requests
  add column if not exists user_id uuid references auth.users(id);
