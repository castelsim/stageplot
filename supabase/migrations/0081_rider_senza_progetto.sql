-- 0081 — «Rider pronto» senza progetto StagePlot (10/10/2026).
--
-- Chi arriva con un vecchio rider in PDF o Word, una foto del palco o solo una descrizione non ha un progetto da scegliere.
-- Per il SOLO livello «Rider pronto» la richiesta può nascere senza progetto: il materiale arriva come allegati (bucket
-- privato `consultation-uploads`, già creato dalla 0001 e mai usato dal 2026-07) e/o come descrizione.
-- Tutto additivo: colonne nuove con default, vincoli nuovi, tipi di file in più nel bucket, una versione nuova della
-- funzione di associazione del pagamento che per le richieste con progetto si comporta come prima (0029).
--
--   · senza_progetto: dichiarato dal server alla creazione. NON si deduce da project_id nullo: la FK è «on delete set null»
--     (0003), quindi una consulenza normale il cui progetto è stato cancellato ha project_id nullo e deve restare
--     «project_unavailable» come oggi. Il vincolo garantisce che senza_progetto valga solo per rider-pronto.
--   · i file si caricano con un link firmato creato dalla Edge Function (create-consultation): nessuna policy su
--     storage.objects per questo bucket, quindi né l'anonimo né un account (nemmeno chi li ha caricati) li legge.
--     Li legge solo il servizio, che a pagamento avvenuto manda a Simone link firmati a scadenza.
--   · retention: gli allegati si cancellano 7 giorni dopo la richiesta se il pagamento non arriva, 90 giorni dopo il
--     pagamento altrimenti (stessa durata del link della consulenza, 0021). Il database sceglie, la Storage API cancella
--     (retention-purge), poi il database dimentica i riferimenti: mai DELETE su storage.objects in SQL (0062, AGENTS §8).

-- ─────────────────────────────────────────────────────────────── colonne
alter table public.consultation_requests
  add column if not exists senza_progetto boolean not null default false,
  add column if not exists rider_per text,
  add column if not exists event_date date,
  add column if not exists allegati_rimossi_at timestamptz;

comment on column public.consultation_requests.senza_progetto is
  'Richiesta «Rider pronto» nata senza progetto StagePlot: il materiale sta in attachments (bucket consultation-uploads) e/o in notes.';
comment on column public.consultation_requests.rider_per is 'Per chi è il rider (band, artista), scritto dal cliente.';
comment on column public.consultation_requests.event_date is 'Data dell''evento, se il cliente l''ha indicata.';
comment on column public.consultation_requests.allegati_rimossi_at is 'Quando retention-purge ha cancellato gli allegati dal bucket.';

-- ─────────────────────────────────────────────────────────────── grant (solo differenza fra ambienti)
-- Come la 0062 per analytics_events e feedback: in produzione la chiave di servizio legge e scrive già queste tabelle
-- (create-consultation, stripe-webhook e il worker delle notifiche lo fanno da luglio, e le consulenze arrivano); sul
-- Postgres locale ricreato da zero quel grant non c'è, e la catena richiesta → pagamento → mail non si può provare.
-- Non allarga niente: service_role scavalca già la RLS; anon e authenticated restano senza (0065).
grant select, insert, update, delete on public.consultation_requests, public.consultation_payments to service_role;
grant select, insert, update on public.consultation_payment_lifecycle to service_role;

-- ─────────────────────────────────────────────────────────────── vincoli
-- Solo «Rider pronto» può nascere senza progetto, e senza progetto vuol dire davvero nessun progetto.
alter table public.consultation_requests drop constraint if exists consultation_requests_senza_progetto_check;
alter table public.consultation_requests add constraint consultation_requests_senza_progetto_check
  check (not senza_progetto or (product = 'rider-pronto' and project_id is null));

-- Le colonne storiche (0001) possono avere dati vecchi: i vincoli nuovi valgono per le righe nuove (not valid).
alter table public.consultation_requests drop constraint if exists consultation_requests_allegati_check;
alter table public.consultation_requests add constraint consultation_requests_allegati_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 8) not valid;
alter table public.consultation_requests drop constraint if exists consultation_requests_rider_testi_check;
alter table public.consultation_requests add constraint consultation_requests_rider_testi_check
  check ((rider_per is null or char_length(rider_per) <= 120) and (notes is null or char_length(notes) <= 4000)) not valid;

-- ─────────────────────────────────────────────────────────────── il bucket privato
-- Stessi limiti della 0001 (10 MB a file, privato) più i documenti Word/LibreOffice/Excel e le foto HEIF dell'iPhone.
-- La stessa lista sta in _shared/rider-order.ts e in consulenza/index.html: un test le confronta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consultation-uploads', 'consultation-uploads', false, 10485760, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────── associazione del pagamento
-- Copia della 0029 con UNA differenza: una richiesta senza_progetto (solo rider-pronto, vincolo sopra) non ha un progetto
-- da bloccare; tutto il resto (lock advisory sul PaymentIntent, doppio pagamento, lifecycle, stati) è identico.
-- Il JSON della richiesta porta anche senza_progetto.
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
  v_project_ok boolean;
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

  if v_request.senza_progetto is true then
    -- Difesa in profondità oltre al vincolo: senza progetto solo il Rider pronto, e davvero senza progetto.
    v_project_ok := v_request.product = 'rider-pronto' and v_request.project_id is null;
  else
    perform 1
    from public.stageplot_projects project
    where project.id = v_request.project_id
      and project.deleted_at is null
    for update;
    v_project_ok := found;
  end if;

  if not v_project_ok then
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
      'senza_progetto', v_request.senza_progetto,
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
    'senza_progetto', v_request.senza_progetto,
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
  uuid, text, text, text, integer, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.stageplot_associate_consultation_payment(
  uuid, text, text, text, integer, timestamptz, timestamptz
) to service_role;

-- ─────────────────────────────────────────────────────────────── retention degli allegati
-- Quali richieste hanno allegati scaduti, con i loro percorsi. Solo percorsi della forma che crea la Edge Function
-- (rider/<id della richiesta>/...): un riferimento storto non arriva mai alla Storage API.
create or replace function public.stageplot_rider_allegati_scaduti(p_ora timestamptz, p_limite integer default 200)
returns table (request_id uuid, paths text[])
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  return query
  select r.id,
         coalesce((
           select array_agg(a.value ->> 'path' order by a.ordinality)
           from jsonb_array_elements(r.attachments) with ordinality as a(value, ordinality)
           where (a.value ->> 'path') like ('rider/' || r.id::text || '/%')
             and (a.value ->> 'path') !~ '\.\.'
         ), '{}'::text[])
  from public.consultation_requests r
  where r.allegati_rimossi_at is null
    and jsonb_typeof(r.attachments) = 'array'
    and jsonb_array_length(r.attachments) > 0
    and (
      (r.paid is not true and r.created_at < p_ora - interval '7 days')
      or (r.paid is true and coalesce(r.paid_at, r.created_at) < p_ora - interval '90 days')
    )
  order by r.created_at
  limit greatest(1, least(coalesce(p_limite, 200), 1000));
end;
$$;
revoke all on function public.stageplot_rider_allegati_scaduti(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.stageplot_rider_allegati_scaduti(timestamptz, integer) to service_role;

-- Dopo che la Storage API ha tolto i file: la richiesta smette di citarli. Restano nome ed email (obblighi fiscali).
create or replace function public.stageplot_rider_allegati_dimentica(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  n integer;
begin
  update public.consultation_requests r
  set attachments = '[]'::jsonb,
      allegati_rimossi_at = now()
  where r.id = any(coalesce(p_ids, '{}'::uuid[]))
    and r.allegati_rimossi_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.stageplot_rider_allegati_dimentica(uuid[]) from public, anon, authenticated;
grant execute on function public.stageplot_rider_allegati_dimentica(uuid[]) to service_role;
