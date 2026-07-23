-- Associa pagamento, richiesta e progetto nella stessa transazione. Il lock
-- advisory condiviso con il lifecycle Stripe e il row lock sul progetto
-- impediscono associazioni a progetti eliminati e gare con refund/dispute.
-- File preparato localmente: non applicato automaticamente.

create or replace function public.stageplot_associate_consultation_payment(
  p_request_id uuid,
  p_stripe_session_id text,
  p_payment_intent_id text,
  p_stripe_event_id text,
  p_amount integer,
  p_paid_at timestamptz,
  p_share_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_request public.consultation_requests%rowtype;
  v_blocking_status text;
  v_request_json jsonb;
begin
  if p_request_id is null
     or p_stripe_session_id is null
     or p_stripe_session_id !~ '^cs_[A-Za-z0-9_]{3,200}$'
     or p_payment_intent_id is null
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{3,200}$'
     or p_stripe_event_id is null
     or char_length(p_stripe_event_id) not between 5 and 255
     or p_amount is null
     or p_amount < 0
     or p_amount > 100000000
     or p_paid_at is null
     or p_share_expires_at is null
     or p_share_expires_at <= p_paid_at then
    raise exception using
      errcode = '22023',
      message = 'stageplot: invalid payment association';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_payment_intent_id, 0)
  );

  select request.*
  into v_request
  from public.consultation_requests request
  where request.id = p_request_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'request_not_found');
  end if;

  if v_request.stripe_session_id is not null
     and v_request.stripe_session_id <> p_stripe_session_id then
    return pg_catalog.jsonb_build_object(
      'outcome', 'duplicate_payment',
      'previous_session_id', v_request.stripe_session_id,
      'name', v_request.name,
      'email', v_request.email
    );
  end if;

  if v_request.payment_intent_id is not null
     and v_request.payment_intent_id <> p_payment_intent_id then
    return pg_catalog.jsonb_build_object(
      'outcome', 'payment_intent_mismatch'
    );
  end if;

  if not (
       v_request.stripe_session_id = p_stripe_session_id
       and v_request.paid is true
     )
     and (
       v_request.share_revoked_at is not null
       or lower(v_request.status) not in ('new', 'payment_mismatch')
     ) then
    return pg_catalog.jsonb_build_object(
      'outcome', 'request_unavailable'
    );
  end if;

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
    set payment_intent_id = p_payment_intent_id,
        status = v_blocking_status,
        share_revoked_at = coalesce(request.share_revoked_at, now()),
        notification_status = 'blocked',
        notification_last_error = 'stripe_' || v_blocking_status,
        notification_claimed_at = null
    where request.id = p_request_id
    returning request.* into v_request;

    return pg_catalog.jsonb_build_object(
      'outcome', 'lifecycle_blocked',
      'blocking_status', v_blocking_status
    );
  end if;

  perform 1
  from public.stageplot_projects project
  where project.id = v_request.project_id
    and project.deleted_at is null
  for update;

  if not found then
    update public.consultation_requests request
    set status = 'project_unavailable',
        share_revoked_at = coalesce(request.share_revoked_at, now()),
        notification_status = 'blocked',
        notification_last_error = 'project_unavailable',
        notification_claimed_at = null
    where request.id = p_request_id;

    return pg_catalog.jsonb_build_object('outcome', 'project_unavailable');
  end if;

  if v_request.stripe_session_id = p_stripe_session_id
     and v_request.paid is true then
    v_request_json := pg_catalog.jsonb_build_object(
      'id', v_request.id,
      'name', v_request.name,
      'email', v_request.email,
      'product', v_request.product,
      'amount', v_request.amount,
      'project_id', v_request.project_id,
      'share_token', v_request.share_token,
      'paid', v_request.paid,
      'stripe_session_id', v_request.stripe_session_id,
      'payment_event_id', v_request.payment_event_id,
      'payment_intent_id', v_request.payment_intent_id,
      'notification_status', v_request.notification_status,
      'notification_attempts', v_request.notification_attempts,
      'notification_claimed_at', v_request.notification_claimed_at
    );
    return pg_catalog.jsonb_build_object(
      'outcome', 'already_associated',
      'request', v_request_json
    );
  end if;

  update public.consultation_requests request
  set paid = true,
      paid_at = p_paid_at,
      amount = p_amount,
      stripe_session_id = p_stripe_session_id,
      payment_intent_id = p_payment_intent_id,
      payment_event_id = p_stripe_event_id,
      status = 'paid',
      share_expires_at = p_share_expires_at,
      share_revoked_at = null,
      notification_status = 'pending',
      notification_last_error = null,
      notification_claimed_at = null
  where request.id = p_request_id
  returning request.* into v_request;

  v_request_json := pg_catalog.jsonb_build_object(
    'id', v_request.id,
    'name', v_request.name,
    'email', v_request.email,
    'product', v_request.product,
    'amount', v_request.amount,
    'project_id', v_request.project_id,
    'share_token', v_request.share_token,
    'paid', v_request.paid,
    'stripe_session_id', v_request.stripe_session_id,
    'payment_event_id', v_request.payment_event_id,
    'payment_intent_id', v_request.payment_intent_id,
    'notification_status', v_request.notification_status,
    'notification_attempts', v_request.notification_attempts,
    'notification_claimed_at', v_request.notification_claimed_at
  );

  return pg_catalog.jsonb_build_object(
    'outcome', 'associated',
    'request', v_request_json
  );
end;
$$;

revoke execute on function public.stageplot_associate_consultation_payment(
  uuid,
  text,
  text,
  text,
  integer,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.stageplot_associate_consultation_payment(
  uuid,
  text,
  text,
  text,
  integer,
  timestamptz,
  timestamptz
) to service_role;
