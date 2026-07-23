-- Rende append-only il registro lifecycle anche se una prima bozza della 0024
-- (PK su payment_intent_id e soli stati refunded/disputed) fosse già stata applicata.
-- File preparato localmente: non applicato automaticamente.

alter table public.consultation_payment_lifecycle
  drop constraint if exists consultation_payment_lifecycle_status_check,
  drop constraint if exists consultation_payment_lifecycle_stripe_event_id_key,
  drop constraint if exists consultation_payment_lifecycle_pkey;

alter table public.consultation_payment_lifecycle
  add constraint consultation_payment_lifecycle_pkey
    primary key (stripe_event_id),
  add constraint consultation_payment_lifecycle_status_check
    check (
      status in ('partially_refunded', 'refunded', 'refund_failed', 'disputed')
    );

drop index if exists public.consultation_payment_lifecycle_occurred_idx;
create index if not exists consultation_payment_lifecycle_intent_idx
  on public.consultation_payment_lifecycle
    (payment_intent_id, status, occurred_at desc);
