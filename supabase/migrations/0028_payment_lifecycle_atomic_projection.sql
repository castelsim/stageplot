-- Serializza per PaymentIntent la registrazione degli eventi Stripe e la
-- proiezione operativa su richieste/pagamenti. Impedisce che l'ordine di delivery
-- lasci uno stato meno severo dopo una dispute o riapra la coda notifiche.
-- File preparato localmente: non applicato automaticamente.

create or replace function public.stageplot_record_payment_lifecycle(
  p_stripe_event_id text,
  p_payment_intent_id text,
  p_status text,
  p_occurred_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_blocking_status text;
begin
  if p_stripe_event_id is null
     or char_length(p_stripe_event_id) not between 5 and 255
     or p_payment_intent_id is null
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{3,200}$'
     or p_status is null
     or p_status not in (
       'partially_refunded',
       'refunded',
       'refund_failed',
       'disputed'
     )
     or p_occurred_at is null then
    raise exception using
      errcode = '22023',
      message = 'stageplot: invalid payment lifecycle event';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_payment_intent_id, 0)
  );

  insert into public.consultation_payment_lifecycle (
    stripe_event_id,
    payment_intent_id,
    status,
    occurred_at,
    updated_at
  )
  values (
    p_stripe_event_id,
    p_payment_intent_id,
    p_status,
    p_occurred_at,
    now()
  )
  on conflict (stripe_event_id) do nothing;

  select case
    when bool_or(lifecycle.status = 'disputed') then 'disputed'
    when bool_or(lifecycle.status = 'refunded') then 'refunded'
    else null
  end
  into v_blocking_status
  from public.consultation_payment_lifecycle lifecycle
  where lifecycle.payment_intent_id = p_payment_intent_id;

  if v_blocking_status is not null then
    update public.consultation_requests request
    set status = v_blocking_status,
        share_revoked_at = coalesce(request.share_revoked_at, now()),
        notification_status = 'blocked',
        notification_last_error = 'stripe_' || v_blocking_status,
        notification_claimed_at = null
    where request.payment_intent_id = p_payment_intent_id;

    update public.consultation_payments payment
    set association_status = v_blocking_status
    where payment.payment_intent_id = p_payment_intent_id;
  end if;

  return v_blocking_status;
end;
$$;

revoke execute on function public.stageplot_record_payment_lifecycle(
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.stageplot_record_payment_lifecycle(
  text,
  text,
  text,
  timestamptz
) to service_role;
