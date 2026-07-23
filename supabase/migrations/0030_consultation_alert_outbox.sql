-- Estende l'outbox alle anomalie finanziarie (orfani, doppi pagamenti,
-- rimborsi parziali/falliti), così gli alert non dipendono dai soli retry Stripe.
-- File preparato localmente: non applicato automaticamente.

alter table public.consultation_payments
  add column if not exists alert_status text not null default 'none',
  add column if not exists alert_attempts integer not null default 0,
  add column if not exists alert_last_error text,
  add column if not exists alert_claimed_at timestamptz;

alter table public.consultation_payment_lifecycle
  add column if not exists alert_status text not null default 'none',
  add column if not exists alert_attempts integer not null default 0,
  add column if not exists alert_last_error text,
  add column if not exists alert_claimed_at timestamptz;

create index if not exists consultation_payments_pending_alert_idx
  on public.consultation_payments (paid_at, stripe_session_id)
  where alert_status in ('pending', 'sending');

create index if not exists consultation_lifecycle_pending_alert_idx
  on public.consultation_payment_lifecycle (occurred_at, stripe_event_id)
  where alert_status in ('pending', 'sending');
