-- Chiude le finestre di crash e replay dell'outbox finanziario:
-- - ogni checkout in valutazione lascia un marcatore recuperabile dal worker;
-- - gli eventi lifecycle che richiedono revisione nascono già in pending nella
--   stessa transazione che registra l'evento;
-- - i replay Stripe non riaprono alert già inviati o in lavorazione.
-- File preparato localmente: non applicato automaticamente.

alter table public.consultation_payments
  add column if not exists evaluation_started_at timestamptz,
  add column if not exists alert_reason text;

create index if not exists consultation_payments_stale_evaluation_idx
  on public.consultation_payments (evaluation_started_at, stripe_session_id)
  where alert_status = 'none'
    and association_status in ('received', 'evaluating')
    and evaluation_started_at is not null;

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
    updated_at,
    alert_status
  )
  values (
    p_stripe_event_id,
    p_payment_intent_id,
    p_status,
    p_occurred_at,
    now(),
    case
      when p_status in ('partially_refunded', 'refund_failed') then 'pending'
      else 'none'
    end
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
    set association_status = v_blocking_status,
        evaluation_started_at = null
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

-- Classifica e accoda un'anomalia nella stessa transazione, usando lo stesso
-- advisory lock del lifecycle. Refunded/disputed prevalgono in ogni ordine di
-- delivery e un replay non riapre mai un alert già lavorato.
create or replace function public.stageplot_record_payment_alert(
  p_stripe_session_id text,
  p_request_id uuid,
  p_request_reference text,
  p_payment_intent_id text,
  p_association_status text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_blocking_status text;
  v_canonical_payment_intent_id text;
  v_effective_status text;
  v_existing_payment_intent_id text;
begin
  if p_stripe_session_id is null
     or p_stripe_session_id !~ '^cs_[A-Za-z0-9_]{3,200}$'
     or (
       p_request_reference is not null
       and char_length(p_request_reference) > 200
     )
     or (
       p_payment_intent_id is not null
       and p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{3,200}$'
     )
     or p_association_status is null
     or p_association_status not in (
       'duplicate_payment',
       'invalid_request_id',
       'request_not_found',
       'request_unavailable',
       'payment_intent_missing',
       'payment_intent_mismatch',
       'project_unavailable',
       'invalid_product',
       'currency_mismatch',
       'amount_mismatch'
     ) then
    raise exception using
      errcode = '22023',
      message = 'stageplot: invalid payment alert';
  end if;

  select payment.payment_intent_id
  into v_existing_payment_intent_id
  from public.consultation_payments payment
  where payment.stripe_session_id = p_stripe_session_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'stageplot: payment not found';
  end if;

  v_canonical_payment_intent_id := coalesce(
    v_existing_payment_intent_id,
    p_payment_intent_id
  );

  if v_canonical_payment_intent_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_canonical_payment_intent_id, 0)
    );

    select case
      when bool_or(lifecycle.status = 'disputed') then 'disputed'
      when bool_or(lifecycle.status = 'refunded') then 'refunded'
      else null
    end
    into v_blocking_status
    from public.consultation_payment_lifecycle lifecycle
    where lifecycle.payment_intent_id = v_canonical_payment_intent_id;
  end if;

  v_effective_status := coalesce(
    v_blocking_status,
    p_association_status
  );

  update public.consultation_payments payment
  set request_id = coalesce(p_request_id, payment.request_id),
      request_reference = coalesce(
        p_request_reference,
        payment.request_reference
      ),
      payment_intent_id = coalesce(
        payment.payment_intent_id,
        p_payment_intent_id
      ),
      association_status = case
        when v_effective_status = 'disputed'
             or payment.association_status = 'disputed' then 'disputed'
        when v_effective_status = 'refunded'
             or payment.association_status = 'refunded' then 'refunded'
        else v_effective_status
      end,
      evaluation_started_at = null,
      alert_status = case
        when payment.alert_status = 'none' then 'pending'
        else payment.alert_status
      end,
      alert_reason = case
        when payment.alert_status = 'none'
             or (
               payment.alert_status = 'pending'
               and payment.alert_reason = 'evaluation_timeout'
             ) then p_association_status
        else payment.alert_reason
      end,
      alert_last_error = case
        when payment.alert_status = 'none'
             or (
               payment.alert_status = 'pending'
               and payment.alert_reason = 'evaluation_timeout'
             ) then null
        else payment.alert_last_error
      end,
      alert_claimed_at = case
        when payment.alert_status = 'none' then null
        else payment.alert_claimed_at
      end
  where payment.stripe_session_id = p_stripe_session_id
    and payment.payment_intent_id is not distinct from
      v_existing_payment_intent_id
  returning payment.association_status into v_effective_status;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'stageplot: payment changed during alert classification';
  end if;

  return v_effective_status;
end;
$$;

revoke execute on function public.stageplot_record_payment_alert(
  text,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.stageplot_record_payment_alert(
  text,
  uuid,
  text,
  text,
  text
) to service_role;
