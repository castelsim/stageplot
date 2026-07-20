-- 0018 — Hub produzione, decisione 5A (20/07): pubblicazione selettiva sul rider.
-- Reparto + azienda vanno sul rider condiviso (info di lavoro, non personale). Le PERSONE restano
-- private nell'account e compaiono sul rider SOLO se pubblicate esplicitamente (opt-in, per referente).
-- Additiva: aggiunge un flag alla tabella delle assegnazioni (0017). Nessun dato esistente toccato.
alter table public.stageplot_dept_assign add column if not exists published boolean not null default false;
