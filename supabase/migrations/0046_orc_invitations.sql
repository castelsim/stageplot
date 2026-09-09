-- 0046_orc_invitations.sql — Orchestre, lotto 5: le convocazioni.
--
-- Un INVITO è per (produzione, ruolo, musicista). Il musicista risponde da un link con token, senza
-- account (come /richiesta/?t=): il token vive nel link, il database conserva solo lo sha-256.
-- L'email la manda un worker (Edge Function orc-notify, service_role) che legge il token in chiaro da
-- orc_invitation_secrets — una tabella senza alcun grant al client — e lo CANCELLA appena spedito.
-- Un promemoria genera un token nuovo: il vecchio link smette di valere. Lo staff non vede mai il token.
-- La risposta passa dalla RPC orc_respond (solo service_role, chiamata da orc-respond). Ogni passaggio
-- di stato finisce in orc_invitation_events, append-only. Confermare un invito assegna un posto con la
-- stessa RPC del lotto 3: la storia dei posti resta una sola. Idempotente.

create table if not exists public.orc_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  role_id uuid not null references public.orc_staffing_roles(id) on delete cascade,
  musician_id uuid not null references public.orc_musicians(id) on delete cascade,
  slot_id uuid references public.orc_staffing_slots(id) on delete set null,
  matching_run_id uuid references public.orc_matching_runs(id) on delete set null,
  wave integer not null default 1,
  status text not null default 'draft',
  token_hash text not null,
  deadline timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  note_admin text not null default '',
  note_musician text not null default '',
  notification_kind text not null default 'invite',
  notification_status text not null default 'pending',
  notification_attempts integer not null default 0,
  notification_last_error text not null default '',
  notification_claimed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orc_invitations_status_chk check (status in
    ('draft','sent','viewed','available','partial','unavailable','no_reply','expired','confirmed','reserve','replaced','revoked','cancelled')),
  constraint orc_invitations_token_chk check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint orc_invitations_kind_chk check (notification_kind in ('invite','reminder')),
  constraint orc_invitations_nstatus_chk check (notification_status in ('pending','sending','sent','failed','none'))
);
create unique index if not exists orc_invitations_token_key on public.orc_invitations(token_hash);
create index if not exists orc_invitations_prod_idx on public.orc_invitations(production_id, status);
create index if not exists orc_invitations_mus_idx on public.orc_invitations(musician_id, created_at desc);
create index if not exists orc_invitations_outbox_idx on public.orc_invitations(notification_status, notification_attempts) where notification_status in ('pending','sending');
-- un solo invito vivo per (ruolo, musicista)
create unique index if not exists orc_invitations_live_key on public.orc_invitations(role_id, musician_id)
  where status in ('draft','sent','viewed','available','partial','confirmed','reserve');

create table if not exists public.orc_invitation_dates (
  invitation_id uuid not null references public.orc_invitations(id) on delete cascade,
  date_id uuid not null references public.orc_production_dates(id) on delete cascade,
  available boolean,
  primary key (invitation_id, date_id)
);

-- il token in chiaro, solo finché non è stato spedito. NESSUN grant a authenticated.
create table if not exists public.orc_invitation_secrets (
  invitation_id uuid primary key references public.orc_invitations(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.orc_invitation_events (
  id bigserial primary key,
  invitation_id uuid not null references public.orc_invitations(id) on delete cascade,
  event text not null,
  actor text not null default 'system',
  meta jsonb not null default '{}'::jsonb,
  at timestamptz not null default now(),
  constraint orc_invitation_events_actor_chk check (actor in ('staff','musician','system'))
);
create index if not exists orc_invitation_events_idx on public.orc_invitation_events(invitation_id, at);
create or replace function public.orc_invitation_events_guard()
returns trigger language plpgsql as $$
begin raise exception 'orc_invitation_events è append-only' using errcode = '55000'; end $$;
drop trigger if exists orc_invitation_events_guard_trg on public.orc_invitation_events;
create trigger orc_invitation_events_guard_trg before update or delete on public.orc_invitation_events
  for each row execute function public.orc_invitation_events_guard();

drop trigger if exists orc_invitations_touch on public.orc_invitations;
create trigger orc_invitations_touch before update on public.orc_invitations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- grant e RLS
grant select on public.orc_invitations, public.orc_invitation_dates, public.orc_invitation_events to authenticated;
grant all on public.orc_invitations, public.orc_invitation_dates, public.orc_invitation_events, public.orc_invitation_secrets to service_role;
grant usage, select on sequence public.orc_invitation_events_id_seq to service_role;

alter table public.orc_invitations enable row level security;
alter table public.orc_invitation_dates enable row level security;
alter table public.orc_invitation_secrets enable row level security;
alter table public.orc_invitation_events enable row level security;

create or replace function public.orc_invitation_org(iid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select i.org_id from public.orc_invitations i where i.id = iid
$$;
revoke all on function public.orc_invitation_org(uuid) from public, anon;
grant execute on function public.orc_invitation_org(uuid) to authenticated, service_role;

drop policy if exists orc_invitations_staff_select on public.orc_invitations;
create policy orc_invitations_staff_select on public.orc_invitations for select using (public.orc_is_staff(org_id));
drop policy if exists orc_invitation_dates_staff_select on public.orc_invitation_dates;
create policy orc_invitation_dates_staff_select on public.orc_invitation_dates for select using (public.orc_is_staff(public.orc_invitation_org(invitation_id)));
drop policy if exists orc_invitation_events_staff_select on public.orc_invitation_events;
create policy orc_invitation_events_staff_select on public.orc_invitation_events for select using (public.orc_is_staff(public.orc_invitation_org(invitation_id)));
-- orc_invitation_secrets: nessuna policy, nessun grant al client: solo service_role

-- ---------------------------------------------------------------- staff: invitare
-- Crea un invito per ogni musicista (dell'org, non archiviato) che non ne ha uno vivo per il ruolo.
-- Token: 24 byte casuali in esadecimale; nel DB solo lo sha-256; il chiaro in orc_invitation_secrets
-- finché il worker non spedisce. Torna il numero di inviti creati.
create or replace function public.orc_invite(production uuid, role uuid, musicians uuid[], deadline timestamptz default null, note text default '', run uuid default null)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare
  org uuid; m uuid; tok text; iid uuid; n int := 0; w int; dl timestamptz;
begin
  org := public.orc_production_org(production);
  if org is null or not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if not exists (select 1 from public.orc_staffing_roles r where r.id = role and r.production_id = production) then raise exception 'ruolo inesistente' using errcode = 'P0002'; end if;
  select coalesce(max(i.wave), 0) + 1 into w from public.orc_invitations i where i.role_id = role;
  dl := coalesce(deadline, (select p.reply_deadline from public.orc_productions p where p.id = production), now() + interval '7 days');
  foreach m in array musicians loop
    if not exists (select 1 from public.orc_musicians x where x.id = m and x.org_id = org and x.deleted_at is null and x.status <> 'archived') then continue; end if;
    if exists (select 1 from public.orc_invitations i where i.role_id = role and i.musician_id = m
               and i.status in ('draft','sent','viewed','available','partial','confirmed','reserve')) then continue; end if;
    tok := encode(gen_random_bytes(24), 'hex');
    insert into public.orc_invitations (org_id, production_id, role_id, musician_id, matching_run_id, wave, status, token_hash, deadline, note_admin, created_by)
    values (org, production, role, m, run, w, 'draft', encode(digest(tok, 'sha256'), 'hex'), dl, coalesce(note, ''), auth.uid())
    returning id into iid;
    insert into public.orc_invitation_secrets (invitation_id, token) values (iid, tok);
    insert into public.orc_invitation_dates (invitation_id, date_id) select iid, d.id from public.orc_production_dates d where d.production_id = production;
    insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (iid, 'created', 'staff', jsonb_build_object('wave', w));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Azioni dello staff su un invito: confirm | reserve | cancel | remind | revoke
create or replace function public.orc_invitation_action(invitation uuid, action text, reason text default '')
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  i public.orc_invitations; slot uuid; tok text;
begin
  select * into i from public.orc_invitations x where x.id = invitation;
  if i.id is null then raise exception 'invito inesistente' using errcode = 'P0002'; end if;
  if not public.orc_is_staff(i.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if action = 'confirm' then
    if i.status not in ('available','partial','reserve') then raise exception 'si conferma solo chi si è detto disponibile' using errcode = '22023'; end if;
    select s.id into slot from public.orc_staffing_slots s where s.role_id = i.role_id and s.status = 'open' order by s.seat_no limit 1;
    if slot is null then raise exception 'nessun posto scoperto in questo ruolo' using errcode = '23505'; end if;
    perform public.orc_assign_slot(slot, i.musician_id, coalesce(nullif(reason, ''), 'convocazione accettata'));
    update public.orc_invitations x set status = 'confirmed', slot_id = slot, notification_status = 'none' where x.id = invitation;
    insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (invitation, 'confirmed', 'staff', jsonb_build_object('slot_id', slot));
  elsif action = 'reserve' then
    if i.status not in ('available','partial') then raise exception 'in riserva va chi si è detto disponibile' using errcode = '22023'; end if;
    update public.orc_invitations x set status = 'reserve' where x.id = invitation;
    insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (invitation, 'reserve_set', 'staff', jsonb_build_object('reason', coalesce(reason, '')));
  elsif action = 'cancel' then
    if i.status in ('confirmed','cancelled','revoked') then raise exception 'non annullabile in questo stato' using errcode = '22023'; end if;
    update public.orc_invitations x set status = 'cancelled', notification_status = 'none' where x.id = invitation;
    delete from public.orc_invitation_secrets s where s.invitation_id = invitation;
    insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (invitation, 'cancelled', 'staff', jsonb_build_object('reason', coalesce(reason, '')));
  elsif action = 'remind' then
    if i.status not in ('sent','viewed') then raise exception 'il promemoria vale per chi non ha ancora risposto' using errcode = '22023'; end if;
    if i.notification_status in ('pending','sending') then raise exception 'una spedizione è già in coda' using errcode = '22023'; end if;
    tok := encode(gen_random_bytes(24), 'hex');
    update public.orc_invitations x set token_hash = encode(digest(tok, 'sha256'), 'hex'), notification_kind = 'reminder',
      notification_status = 'pending', notification_attempts = 0, notification_last_error = '', notification_claimed_at = null where x.id = invitation;
    insert into public.orc_invitation_secrets (invitation_id, token) values (invitation, tok) on conflict (invitation_id) do update set token = excluded.token, created_at = now();
    insert into public.orc_invitation_events (invitation_id, event, actor) values (invitation, 'reminder_queued', 'staff');
  elsif action = 'revoke' then
    if i.status <> 'confirmed' then raise exception 'si revoca solo una conferma' using errcode = '22023'; end if;
    if i.slot_id is not null then perform public.orc_release_slot(i.slot_id, 'revoked', coalesce(reason, '')); end if;
    update public.orc_invitations x set status = 'revoked' where x.id = invitation;
    insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (invitation, 'revoked', 'staff', jsonb_build_object('reason', coalesce(reason, '')));
  else
    raise exception 'azione non valida: %', action using errcode = '22023';
  end if;
end $$;

-- Elenco per la scheda Convocazioni.
create or replace function public.orc_invitations_list(production uuid)
returns table (id uuid, role_id uuid, role_name text, musician_id uuid, musician_name text, musician_email text, wave integer, status text,
  deadline timestamptz, sent_at timestamptz, viewed_at timestamptz, responded_at timestamptz, note_musician text, note_admin text,
  notification_status text, notification_kind text, notification_last_error text, slot_seat integer,
  dates_yes bigint, dates_no bigint, dates_total bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.role_id, r.name, i.musician_id, m.last_name || ' ' || m.first_name, m.email, i.wave, i.status,
    i.deadline, i.sent_at, i.viewed_at, i.responded_at, i.note_musician, i.note_admin,
    i.notification_status, i.notification_kind, i.notification_last_error, s.seat_no,
    (select count(*) from public.orc_invitation_dates d where d.invitation_id = i.id and d.available = true),
    (select count(*) from public.orc_invitation_dates d where d.invitation_id = i.id and d.available = false),
    (select count(*) from public.orc_invitation_dates d where d.invitation_id = i.id),
    i.created_at
  from public.orc_invitations i
  join public.orc_staffing_roles r on r.id = i.role_id
  join public.orc_musicians m on m.id = i.musician_id
  left join public.orc_staffing_slots s on s.id = i.slot_id
  where i.production_id = production and public.orc_is_staff(public.orc_production_org(production))
  order by r.sort, i.wave, i.created_at
$$;

-- ---------------------------------------------------------------- il musicista (solo service_role)
-- Apertura del link: torna il pacchetto per la pagina e marca «visualizzato».
create or replace function public.orc_invitation_open(token_hash_in text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.orc_invitations; p public.orc_productions; r public.orc_staffing_roles; o public.orc_organizations; m public.orc_musicians;
  expired boolean; mode text;
begin
  select * into i from public.orc_invitations x where x.token_hash = token_hash_in;
  if i.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if i.status in ('cancelled','revoked','replaced','draft') then return jsonb_build_object('error', 'revoked'); end if;
  expired := i.deadline is not null and i.deadline < now() and i.status in ('sent','viewed','expired','no_reply');
  if i.status = 'sent' then
    update public.orc_invitations x set status = 'viewed', viewed_at = coalesce(x.viewed_at, now()) where x.id = i.id and x.status = 'sent';
    insert into public.orc_invitation_events (invitation_id, event, actor) values (i.id, 'viewed', 'musician');
    i.status := 'viewed';
  end if;
  select * into p from public.orc_productions x where x.id = i.production_id;
  select * into r from public.orc_staffing_roles x where x.id = i.role_id;
  select * into o from public.orc_organizations x where x.id = i.org_id;
  select * into m from public.orc_musicians x where x.id = i.musician_id;
  mode := case when expired then 'expired' when i.status in ('confirmed','reserve') then 'locked' else 'write' end;
  return jsonb_build_object(
    'mode', mode, 'status', i.status, 'deadline', i.deadline, 'responded_at', i.responded_at, 'note', i.note_musician,
    'musician', jsonb_build_object('first_name', m.first_name),
    'organization', o.name,
    'production', jsonb_build_object('title', p.title, 'kind', p.kind, 'conductor', p.conductor, 'venue', p.venue, 'address', p.address,
      'fee_note', p.fee_note, 'conditions', p.conditions, 'dress_code', p.dress_code, 'description', p.description),
    'role', jsonb_build_object('name', r.name, 'part', r.part, 'notes', r.notes),
    'note_admin', i.note_admin,
    'dates', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'venue', d.venue, 'note', d.note, 'available', x.available) order by d.starts_at)
      from public.orc_invitation_dates x join public.orc_production_dates d on d.id = x.date_id where x.invitation_id = i.id), '[]'::jsonb));
end $$;

-- Risposta: yes | no | partial (con le date). Si può cambiare fino alla scadenza, finché lo staff non conferma.
create or replace function public.orc_respond(token_hash_in text, answer text, dates jsonb default '{}'::jsonb, note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.orc_invitations; d jsonb; yes int; no int; tot int; st text;
begin
  select * into i from public.orc_invitations x where x.token_hash = token_hash_in;
  if i.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if i.status in ('cancelled','revoked','replaced','draft') then return jsonb_build_object('error', 'revoked'); end if;
  if i.status in ('confirmed','reserve') then return jsonb_build_object('error', 'locked'); end if;
  if i.deadline is not null and i.deadline < now() then return jsonb_build_object('error', 'expired'); end if;
  if answer not in ('yes','no','partial') then return jsonb_build_object('error', 'bad_answer'); end if;
  if answer = 'yes' then update public.orc_invitation_dates x set available = true where x.invitation_id = i.id;
  elsif answer = 'no' then update public.orc_invitation_dates x set available = false where x.invitation_id = i.id;
  else
    for d in select * from jsonb_array_elements(coalesce(dates, '[]'::jsonb)) loop
      update public.orc_invitation_dates x set available = (d ->> 'available')::boolean where x.invitation_id = i.id and x.date_id = (d ->> 'id')::uuid;
    end loop;
  end if;
  select count(*) filter (where x.available), count(*) filter (where x.available = false), count(*) into yes, no, tot from public.orc_invitation_dates x where x.invitation_id = i.id;
  st := case when answer = 'no' or (tot > 0 and yes = 0) then 'unavailable' when answer = 'yes' or (tot > 0 and yes = tot) then 'available' else 'partial' end;
  update public.orc_invitations x set status = st, responded_at = now(), note_musician = left(coalesce(note, ''), 1000) where x.id = i.id;
  insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (i.id, 'responded', 'musician', jsonb_build_object('answer', st, 'yes', yes, 'no', no));
  return jsonb_build_object('ok', true, 'status', st);
end $$;

-- Scadenze: chi non ha risposto entro la scadenza passa a «nessuna risposta». Il worker la chiama.
create or replace function public.orc_expire_invitations()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with x as (update public.orc_invitations i set status = 'no_reply', notification_status = case when i.notification_status in ('pending','sending') then 'none' else i.notification_status end
             where i.status in ('sent','viewed') and i.deadline is not null and i.deadline < now() returning i.id)
  insert into public.orc_invitation_events (invitation_id, event, actor) select x.id, 'no_reply', 'system' from x;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.orc_invite(uuid, uuid, uuid[], timestamptz, text, uuid), public.orc_invitation_action(uuid, text, text),
  public.orc_invitations_list(uuid) from public, anon;
grant execute on function public.orc_invite(uuid, uuid, uuid[], timestamptz, text, uuid), public.orc_invitation_action(uuid, text, text),
  public.orc_invitations_list(uuid) to authenticated, service_role;
revoke all on function public.orc_invitation_open(text), public.orc_respond(text, text, jsonb, text), public.orc_expire_invitations() from public, anon, authenticated;
grant execute on function public.orc_invitation_open(text), public.orc_respond(text, text, jsonb, text), public.orc_expire_invitations() to service_role;
