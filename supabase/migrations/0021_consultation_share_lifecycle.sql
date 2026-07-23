-- I bearer link di consulenza non devono essere validi indefinitamente.
-- File preparato localmente: applicare la migration prima delle Edge Function che leggono questi campi.

alter table public.consultation_requests
  add column if not exists share_expires_at timestamptz,
  add column if not exists share_revoked_at timestamptz;

update public.consultation_requests
set share_expires_at = coalesce(paid_at, created_at, now()) + interval '90 days'
where share_expires_at is null;

-- Prima di rendere gli endpoint fail-closed, porta lo stato storico implicito nel nuovo contratto.
update public.consultation_requests
set status = 'paid'
where paid is true and lower(status) = 'new';

alter table public.consultation_requests
  alter column share_expires_at set default (now() + interval '90 days'),
  alter column share_expires_at set not null;

create index if not exists consultation_requests_active_share_idx
  on public.consultation_requests (share_token, share_expires_at)
  where share_token is not null and share_revoked_at is null;
