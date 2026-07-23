-- Stato durevole della notifica: il webhook può essere ritentato senza perdere né duplicare
-- intenzionalmente il fulfillment. File preparato localmente, non applicato automaticamente.

alter table public.consultation_requests
  add column if not exists payment_event_id text,
  add column if not exists notification_status text not null default 'none',
  add column if not exists notification_attempts integer not null default 0,
  add column if not exists notification_last_error text,
  add column if not exists notification_claimed_at timestamptz,
  add column if not exists payment_intent_id text;

alter table public.consultation_payments
  add column if not exists currency text,
  add column if not exists stripe_event_id text,
  add column if not exists request_id uuid,
  add column if not exists request_reference text,
  add column if not exists payment_intent_id text,
  add column if not exists association_status text not null default 'received';

alter table public.consultation_payments
  drop constraint if exists consultation_payments_request_id_fkey,
  add constraint consultation_payments_request_id_fkey
    foreign key (request_id) references public.consultation_requests(id) on delete set null;

create unique index if not exists consultation_requests_payment_event_key
  on public.consultation_requests (payment_event_id)
  where payment_event_id is not null;

create unique index if not exists consultation_requests_payment_intent_key
  on public.consultation_requests (payment_intent_id)
  where payment_intent_id is not null;

create index if not exists consultation_payments_payment_intent_idx
  on public.consultation_payments (payment_intent_id)
  where payment_intent_id is not null;

create index if not exists consultation_payments_request_idx
  on public.consultation_payments (request_id, paid_at desc)
  where request_id is not null;
