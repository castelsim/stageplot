-- 0033_data_retention_purge.sql
--
-- AUDIT M-13 — Enforcement della retention (prima: nessun job di purge, benché l'informativa
-- prometta la cancellazione degli analytics dopo 30 giorni).
--
-- Crea una funzione di manutenzione che applica la retention promessa e prova a schedularla via
-- pg_cron. La schedulazione è BEST-EFFORT in un blocco guardato: se pg_cron non è attivo sul
-- progetto, la migration NON fallisce (la funzione resta creata e va schedulata a mano dalla
-- dashboard, oppure chiamata dal worker cron esistente).
--
-- COSA viene purgato (solo dati non-business, con scadenza dichiarata):
--   • analytics_events  → oltre 30 giorni (coerente con l'informativa privacy);
--   • feedback_throttle → oltre 7 giorni (solo stato di rate-limit, non un dato utente).
-- COSA NON viene toccato (retention business/legale, gestita a parte — vedi docs/privacy/RETENTION.md):
--   feedback (messaggi), consultation_* e pagamenti, progetti utente.
--
-- Idempotente: create-or-replace della funzione; la (ri)schedulazione è tollerante agli errori.

create or replace function public.stageplot_purge_expired()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.analytics_events  where created_at   < now() - interval '30 days';
  delete from public.feedback_throttle where window_start < now() - interval '7 days';
end;
$$;

comment on function public.stageplot_purge_expired() is
  'Audit M-13: purga analytics_events (>30gg) e feedback_throttle (>7gg). Schedulata via pg_cron (0033) o manualmente.';

do $$
begin
  create extension if not exists pg_cron;
  -- rimuove un'eventuale schedulazione omonima preesistente, poi ricrea (idempotenza)
  begin perform cron.unschedule('stageplot-purge-expired'); exception when others then null; end;
  perform cron.schedule('stageplot-purge-expired', '17 3 * * *', 'select public.stageplot_purge_expired();');
  raise notice 'stageplot: retention schedulata via pg_cron (stageplot-purge-expired, 03:17 UTC).';
exception when others then
  raise notice 'stageplot: pg_cron non attivo (%). Schedulare public.stageplot_purge_expired() dalla dashboard o dal worker.', sqlerrm;
end;
$$;
