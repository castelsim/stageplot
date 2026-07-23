-- Registro durevole degli eventi Stripe di revoca o revisione manuale. Serve anche
-- quando refund/dispute arriva prima di checkout.session.completed.
-- File preparato localmente: non applicato automaticamente.

create table if not exists public.consultation_payment_lifecycle (
  stripe_event_id text primary key,
  payment_intent_id text not null,
  status text not null
    check (
      status in ('partially_refunded', 'refunded', 'refund_failed', 'disputed')
    ),
  occurred_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.consultation_payment_lifecycle enable row level security;

-- Nessuna policy: il registro è accessibile soltanto tramite service role.
create index if not exists consultation_payment_lifecycle_intent_idx
  on public.consultation_payment_lifecycle
    (payment_intent_id, status, occurred_at desc);
