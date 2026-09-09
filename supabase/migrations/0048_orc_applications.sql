-- 0048_orc_applications.sql — Orchestre, lotto 7: candidature, profilo del musicista, valutazioni, privacy.
--
-- Il PROFILO è globale e del musicista (una sola identità, own-rows); la CANDIDATURA è verso una
-- organizzazione; le VALUTAZIONI sono private dell'org (il candidato non le legge mai: nessuna
-- policy). Lo stato interno e quello mostrato al candidato sono due cose diverse (orc_public_status).
-- L'accettazione crea o collega la riga in orc_musicians (il rolodex dell'org) copiando i dati
-- dichiarati: da lì in poi lo staff lavora sul musicista, il profilo resta del candidato.
-- I file (CV, audio) stanno nel bucket privato orc-files sotto profiles/<user_id>/...: li legge il
-- proprietario e lo staff delle org a cui si è candidato, con URL firmati; anon niente.
-- Consensi versionati; export e richiesta di cancellazione come RPC. Idempotente.

alter table public.orc_organizations add column if not exists accepting_applications boolean not null default false;
alter table public.orc_organizations add column if not exists application_intro text not null default '';

create table if not exists public.orc_musician_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  city text not null default '',
  province text not null default '',
  area text not null default '',
  bio text not null default '',
  website text not null default '',
  audio_url text not null default '',
  video_url text not null default '',
  education text not null default '',
  years_experience integer,
  exp_orchestral boolean not null default false,
  exp_pop boolean not null default false,
  exp_live boolean not null default false,
  exp_studio boolean not null default false,
  exp_theatre boolean not null default false,
  reading_sight integer not null default 0,
  reading_score integer not null default 0,
  with_conductor boolean not null default false,
  click boolean not null default false,
  sequences boolean not null default false,
  in_ear boolean not null default false,
  improvisation integer not null default 0,
  genres text[] not null default '{}',
  rehearsal_availability text not null default '',
  travel_ok boolean not null default true,
  tour_ok boolean not null default false,
  has_car boolean not null default false,
  max_distance_km integer,
  consent_privacy_version text not null default '',
  consent_privacy_at timestamptz,
  consent_requests boolean not null default false,
  step integer not null default 1,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orc_profiles_levels_chk check (reading_sight between 0 and 3 and reading_score between 0 and 3 and improvisation between 0 and 3),
  constraint orc_profiles_email_chk check (email = '' or email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

create table if not exists public.orc_profile_instruments (
  profile_id uuid not null references public.orc_musician_profiles(id) on delete cascade,
  instrument_code text not null references public.orc_instruments(code),
  is_primary boolean not null default false,
  level integer,
  doubling boolean not null default false,
  primary key (profile_id, instrument_code),
  constraint orc_profile_instruments_level_chk check (level is null or level between 1 and 5)
);

create table if not exists public.orc_profile_repertoire (
  profile_id uuid not null references public.orc_musician_profiles(id) on delete cascade,
  kind text not null default 'composer',
  name text not null,
  primary key (profile_id, kind, name),
  constraint orc_profile_repertoire_kind_chk check (kind in ('composer','work','program','genre')),
  constraint orc_profile_repertoire_name_chk check (length(trim(name)) between 1 and 120)
);

create table if not exists public.orc_files (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.orc_musician_profiles(id) on delete cascade,
  kind text not null default 'other',
  path text not null unique,
  name text not null default '',
  size integer not null default 0,
  mime text not null default '',
  created_at timestamptz not null default now(),
  constraint orc_files_kind_chk check (kind in ('cv','audio','video','other'))
);

create table if not exists public.orc_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  profile_id uuid not null references public.orc_musician_profiles(id) on delete cascade,
  status text not null default 'draft',
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  musician_id uuid references public.orc_musicians(id) on delete set null,
  message text not null default '',
  note_to_candidate text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, profile_id),
  constraint orc_applications_status_chk check (status in
    ('draft','submitted','evaluating','interview_to_schedule','interview_scheduled','audition_to_schedule','audition_scheduled','reserve','accepted','rejected','suspended','archived'))
);
create index if not exists orc_applications_org_idx on public.orc_applications(org_id, status, submitted_at desc);

create table if not exists public.orc_application_events (
  id bigserial primary key,
  application_id uuid not null references public.orc_applications(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text not null default 'staff',
  note text not null default '',
  actor_id uuid,
  at timestamptz not null default now(),
  constraint orc_application_events_actor_chk check (actor in ('staff','candidate','system'))
);
create index if not exists orc_application_events_idx on public.orc_application_events(application_id, at);
create or replace function public.orc_application_events_guard()
returns trigger language plpgsql as $$
begin raise exception 'orc_application_events è append-only' using errcode = '55000'; end $$;
drop trigger if exists orc_application_events_guard_trg on public.orc_application_events;
create trigger orc_application_events_guard_trg before update or delete on public.orc_application_events
  for each row execute function public.orc_application_events_guard();

create table if not exists public.orc_evaluations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  application_id uuid references public.orc_applications(id) on delete cascade,
  musician_id uuid references public.orc_musicians(id) on delete cascade,
  kind text not null default 'general',
  date date,
  outcome text not null default '',
  technical integer, intonation integer, timing integer, musicality integer, reading integer, versatility integer,
  preparation integer, experience integer, attitude integer, punctuality integer, communication integer, reliability integer, availability integer,
  strengths text not null default '',
  issues text not null default '',
  private_note text not null default '',
  overall integer,
  decision text not null default '',
  author_id uuid references auth.users(id) on delete set null,
  at timestamptz not null default now(),
  constraint orc_evaluations_kind_chk check (kind in ('interview','audition','general')),
  constraint orc_evaluations_target_chk check (application_id is not null or musician_id is not null),
  constraint orc_evaluations_scores_chk check (
    coalesce(technical, 3) between 1 and 5 and coalesce(intonation, 3) between 1 and 5 and coalesce(timing, 3) between 1 and 5 and
    coalesce(musicality, 3) between 1 and 5 and coalesce(reading, 3) between 1 and 5 and coalesce(versatility, 3) between 1 and 5 and
    coalesce(preparation, 3) between 1 and 5 and coalesce(experience, 3) between 1 and 5 and coalesce(attitude, 3) between 1 and 5 and
    coalesce(punctuality, 3) between 1 and 5 and coalesce(communication, 3) between 1 and 5 and coalesce(reliability, 3) between 1 and 5 and
    coalesce(availability, 3) between 1 and 5 and coalesce(overall, 3) between 1 and 5)
);
create index if not exists orc_evaluations_app_idx on public.orc_evaluations(application_id, at desc);
create index if not exists orc_evaluations_mus_idx on public.orc_evaluations(musician_id, at desc);

create table if not exists public.orc_consents (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint orc_consents_kind_chk check (kind in ('privacy','requests'))
);
create index if not exists orc_consents_user_idx on public.orc_consents(user_id, kind, granted_at desc);

-- touch
drop trigger if exists orc_musician_profiles_touch on public.orc_musician_profiles;
create trigger orc_musician_profiles_touch before update on public.orc_musician_profiles for each row execute function public.touch_updated_at();
drop trigger if exists orc_applications_touch on public.orc_applications;
create trigger orc_applications_touch before update on public.orc_applications for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- grant e RLS
grant select, insert, update on public.orc_musician_profiles to authenticated;
grant select, insert, update, delete on public.orc_profile_instruments, public.orc_profile_repertoire, public.orc_files, public.orc_consents to authenticated;
grant select, update on public.orc_applications to authenticated;
grant select on public.orc_application_events to authenticated;
grant select, insert, update, delete on public.orc_evaluations to authenticated;
grant all on public.orc_musician_profiles, public.orc_profile_instruments, public.orc_profile_repertoire, public.orc_files, public.orc_applications,
  public.orc_application_events, public.orc_evaluations, public.orc_consents to service_role;
grant usage, select on sequence public.orc_application_events_id_seq, public.orc_consents_id_seq to authenticated, service_role;

alter table public.orc_musician_profiles enable row level security;
alter table public.orc_profile_instruments enable row level security;
alter table public.orc_profile_repertoire enable row level security;
alter table public.orc_files enable row level security;
alter table public.orc_applications enable row level security;
alter table public.orc_application_events enable row level security;
alter table public.orc_evaluations enable row level security;
alter table public.orc_consents enable row level security;

-- lo staff vede i profili (e i loro figli) solo di chi si è candidato alla sua org
create or replace function public.orc_profile_visible_to_staff(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orc_applications a where a.profile_id = pid and a.status <> 'draft' and public.orc_is_staff(a.org_id))
$$;
create or replace function public.orc_profile_owner(pid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.user_id from public.orc_musician_profiles p where p.id = pid
$$;
create or replace function public.orc_application_org(aid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select a.org_id from public.orc_applications a where a.id = aid
$$;
revoke all on function public.orc_profile_visible_to_staff(uuid), public.orc_profile_owner(uuid), public.orc_application_org(uuid) from public, anon;
grant execute on function public.orc_profile_visible_to_staff(uuid), public.orc_profile_owner(uuid), public.orc_application_org(uuid) to authenticated, service_role;

drop policy if exists orc_mp_own on public.orc_musician_profiles;
create policy orc_mp_own on public.orc_musician_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists orc_mp_staff on public.orc_musician_profiles;
create policy orc_mp_staff on public.orc_musician_profiles for select using (public.orc_profile_visible_to_staff(id));

drop policy if exists orc_pi_own on public.orc_profile_instruments;
create policy orc_pi_own on public.orc_profile_instruments for all using (public.orc_profile_owner(profile_id) = auth.uid()) with check (public.orc_profile_owner(profile_id) = auth.uid());
drop policy if exists orc_pi_staff on public.orc_profile_instruments;
create policy orc_pi_staff on public.orc_profile_instruments for select using (public.orc_profile_visible_to_staff(profile_id));
drop policy if exists orc_pr_own on public.orc_profile_repertoire;
create policy orc_pr_own on public.orc_profile_repertoire for all using (public.orc_profile_owner(profile_id) = auth.uid()) with check (public.orc_profile_owner(profile_id) = auth.uid());
drop policy if exists orc_pr_staff on public.orc_profile_repertoire;
create policy orc_pr_staff on public.orc_profile_repertoire for select using (public.orc_profile_visible_to_staff(profile_id));

drop policy if exists orc_files_own on public.orc_files;
create policy orc_files_own on public.orc_files for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists orc_files_staff on public.orc_files;
create policy orc_files_staff on public.orc_files for select using (profile_id is not null and public.orc_profile_visible_to_staff(profile_id));

-- candidature: il candidato vede la sua (stato interno compreso: la maschera la fa orc_public_status nel client
-- via RPC); lo staff vede quelle della sua org; scritture solo via RPC
drop policy if exists orc_app_own_select on public.orc_applications;
create policy orc_app_own_select on public.orc_applications for select using (public.orc_profile_owner(profile_id) = auth.uid());
drop policy if exists orc_app_staff_select on public.orc_applications;
create policy orc_app_staff_select on public.orc_applications for select using (public.orc_is_staff(org_id));
drop policy if exists orc_ae_staff_select on public.orc_application_events;
create policy orc_ae_staff_select on public.orc_application_events for select using (public.orc_is_staff(public.orc_application_org(application_id)));

-- valutazioni: SOLO lo staff dell'org. Il candidato non ha nessuna policy.
drop policy if exists orc_ev_staff on public.orc_evaluations;
create policy orc_ev_staff on public.orc_evaluations for all using (public.orc_is_staff(org_id)) with check (public.orc_is_staff(org_id));

drop policy if exists orc_consents_own on public.orc_consents;
create policy orc_consents_own on public.orc_consents for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- storage: il bucket privato dei file
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('orc-files', 'orc-files', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp','audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- il proprietario carica, legge e cancella sotto profiles/<suo uid>/...; lo staff legge i file dei candidati alla sua org
drop policy if exists orc_files_owner_all on storage.objects;
create policy orc_files_owner_all on storage.objects for all to authenticated
  using (bucket_id = 'orc-files' and (storage.foldername(name))[1] = 'profiles' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'orc-files' and (storage.foldername(name))[1] = 'profiles' and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists orc_files_staff_read on storage.objects;
create policy orc_files_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'orc-files' and exists (select 1 from public.orc_files f where f.path = storage.objects.name and f.profile_id is not null and public.orc_profile_visible_to_staff(f.profile_id)));

-- ---------------------------------------------------------------- RPC del candidato
-- Lo stato mostrato al candidato: mai i dettagli interni.
create or replace function public.orc_public_status(s text)
returns text language sql immutable as $$
  select case s
    when 'draft' then 'draft' when 'submitted' then 'submitted'
    when 'evaluating' then 'evaluating' when 'interview_to_schedule' then 'evaluating' when 'audition_to_schedule' then 'evaluating'
    when 'interview_scheduled' then 'interview' when 'audition_scheduled' then 'audition'
    when 'reserve' then 'reserve' when 'accepted' then 'accepted' when 'rejected' then 'rejected'
    when 'suspended' then 'evaluating' when 'archived' then 'archived' else 'evaluating' end
$$;

-- Profilo: crea al primo accesso (nome ed email dal JWT), altrimenti torna quello che c'è.
create or replace function public.orc_ensure_musician_profile()
returns public.orc_musician_profiles language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); meta jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb); p public.orc_musician_profiles; nome text;
begin
  if uid is null then raise exception 'non autenticato' using errcode = '28000'; end if;
  select * into p from public.orc_musician_profiles x where x.user_id = uid;
  if p.id is not null then return p; end if;
  nome := coalesce(nullif(trim(meta ->> 'full_name'), ''), nullif(trim(meta ->> 'name'), ''), '');
  insert into public.orc_musician_profiles (user_id, first_name, last_name, email)
  values (uid, split_part(nome, ' ', 1), nullif(trim(substr(nome, length(split_part(nome, ' ', 1)) + 1)), ''), lower(coalesce(auth.jwt() ->> 'email', '')))
  returning * into p;
  return p;
end $$;

-- Le organizzazioni che accettano candidature: leggibili da chiunque sia autenticato.
create or replace function public.orc_open_organizations()
returns table (id uuid, name text, slug text, application_intro text)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.slug, o.application_intro from public.orc_organizations o where o.accepting_applications order by o.name
$$;

-- Candidarsi: crea la bozza (o la torna). L'invio vero è orc_submit_application.
create or replace function public.orc_apply(org uuid)
returns public.orc_applications language plpgsql security definer set search_path = public as $$
declare p public.orc_musician_profiles; a public.orc_applications;
begin
  p := public.orc_ensure_musician_profile();
  if not exists (select 1 from public.orc_organizations o where o.id = org and o.accepting_applications) then
    raise exception 'questa organizzazione non accetta candidature' using errcode = '42501';
  end if;
  select * into a from public.orc_applications x where x.org_id = org and x.profile_id = p.id;
  if a.id is not null then return a; end if;
  insert into public.orc_applications (org_id, profile_id, status) values (org, p.id, 'draft') returning * into a;
  insert into public.orc_application_events (application_id, from_status, to_status, actor, actor_id) values (a.id, null, 'draft', 'candidate', auth.uid());
  return a;
end $$;

-- Quel che manca per inviare: la stessa regola vale nel client (domain/applications.js) e qui.
create or replace function public.orc_profile_missing(pid uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when p.first_name = '' then 'first_name' end, case when p.last_name = '' then 'last_name' end,
    case when p.email = '' then 'email' end, case when p.phone = '' then 'phone' end, case when p.city = '' then 'city' end,
    case when not exists (select 1 from public.orc_profile_instruments i where i.profile_id = p.id and i.is_primary) then 'instrument' end,
    case when p.consent_privacy_version = '' then 'consent' end
  ], null) from public.orc_musician_profiles p where p.id = pid
$$;

create or replace function public.orc_submit_application(app uuid, msg text default '')
returns public.orc_applications language plpgsql security definer set search_path = public as $$
declare a public.orc_applications; missing text[];
begin
  select * into a from public.orc_applications x where x.id = app;
  if a.id is null or public.orc_profile_owner(a.profile_id) <> auth.uid() then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if a.status <> 'draft' then return a; end if;
  missing := public.orc_profile_missing(a.profile_id);
  if array_length(missing, 1) > 0 then raise exception 'profilo incompleto: %', array_to_string(missing, ', ') using errcode = '22023'; end if;
  update public.orc_applications x set status = 'submitted', submitted_at = now(), message = left(coalesce(msg, ''), 2000) where x.id = app returning * into a;
  insert into public.orc_application_events (application_id, from_status, to_status, actor, actor_id) values (app, 'draft', 'submitted', 'candidate', auth.uid());
  return a;
end $$;

-- Collega l'account al rolodex delle org che lo avevano già importato per email (nessun dato in più).
create or replace function public.orc_link_my_musician_rows()
returns integer language plpgsql security definer set search_path = public as $$
declare n int; em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or em = '' then return 0; end if;
  update public.orc_musicians m set user_id = auth.uid() where m.user_id is null and m.deleted_at is null and lower(m.email) = em;
  get diagnostics n = row_count;
  return n;
end $$;

-- Gli inviti e gli incarichi del musicista loggato (tutte le org che lo hanno collegato).
create or replace function public.orc_my_invitations()
returns table (id uuid, org_name text, production_id uuid, title text, role_name text, status text, deadline timestamptz, responded_at timestamptz,
  note_admin text, note_musician text, venue text, conductor text, fee_note text, first_date timestamptz,
  dates jsonb)
language sql stable security definer set search_path = public as $$
  select i.id, o.name, p.id, p.title, r.name, i.status, i.deadline, i.responded_at, i.note_admin, i.note_musician, p.venue, p.conductor, p.fee_note,
    (select min(d.starts_at) from public.orc_production_dates d where d.production_id = p.id),
    coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'venue', d.venue, 'available', x.available) order by d.starts_at)
      from public.orc_invitation_dates x join public.orc_production_dates d on d.id = x.date_id where x.invitation_id = i.id), '[]'::jsonb)
  from public.orc_invitations i
  join public.orc_musicians m on m.id = i.musician_id and m.user_id = auth.uid()
  join public.orc_productions p on p.id = i.production_id
  join public.orc_organizations o on o.id = i.org_id
  join public.orc_staffing_roles r on r.id = i.role_id
  where i.status not in ('draft','cancelled')
  order by i.created_at desc
$$;

create or replace function public.orc_my_engagements()
returns table (production_id uuid, org_name text, title text, role_name text, status text, venue text, conductor text, first_date timestamptz, last_date timestamptz,
  dates jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, o.name, p.title, r.name, p.status, p.venue, p.conductor,
    (select min(d.starts_at) from public.orc_production_dates d where d.production_id = p.id),
    (select max(coalesce(d.ends_at, d.starts_at)) from public.orc_production_dates d where d.production_id = p.id),
    coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'venue', d.venue, 'note', d.note) order by d.starts_at) from public.orc_production_dates d where d.production_id = p.id), '[]'::jsonb)
  from public.orc_staffing_slots s
  join public.orc_musicians m on m.id = s.musician_id and m.user_id = auth.uid()
  join public.orc_productions p on p.id = s.production_id
  join public.orc_organizations o on o.id = p.org_id
  join public.orc_staffing_roles r on r.id = s.role_id
  where s.status = 'confirmed' and p.deleted_at is null
  order by 8 desc nulls last
$$;

-- Rispondere dall'area personale (senza token): stessa RPC del link, ma con l'identità dell'account.
create or replace function public.orc_respond_mine(invitation uuid, answer text, dates jsonb default '{}'::jsonb, note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text;
begin
  select i.token_hash into h from public.orc_invitations i join public.orc_musicians m on m.id = i.musician_id where i.id = invitation and m.user_id = auth.uid();
  if h is null then raise exception 'non autorizzato' using errcode = '42501'; end if;
  return public.orc_respond(h, answer, dates, note);
end $$;

-- Privacy: export e richiesta di cancellazione.
create or replace function public.orc_export_my_data()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'id' from public.orc_musician_profiles p where p.user_id = auth.uid()),
    'instruments', coalesce((select jsonb_agg(to_jsonb(i) - 'profile_id') from public.orc_profile_instruments i join public.orc_musician_profiles p on p.id = i.profile_id where p.user_id = auth.uid()), '[]'::jsonb),
    'repertoire', coalesce((select jsonb_agg(to_jsonb(r) - 'profile_id') from public.orc_profile_repertoire r join public.orc_musician_profiles p on p.id = r.profile_id where p.user_id = auth.uid()), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(jsonb_build_object('kind', f.kind, 'name', f.name, 'size', f.size, 'created_at', f.created_at)) from public.orc_files f where f.owner_user_id = auth.uid()), '[]'::jsonb),
    'applications', coalesce((select jsonb_agg(jsonb_build_object('organization', o.name, 'status', public.orc_public_status(a.status), 'submitted_at', a.submitted_at, 'message', a.message)) from public.orc_applications a join public.orc_organizations o on o.id = a.org_id join public.orc_musician_profiles p on p.id = a.profile_id where p.user_id = auth.uid()), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' - 'id') from public.orc_consents c where c.user_id = auth.uid()), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object('organization', v.org_name, 'production', v.title, 'role', v.role_name, 'status', v.status, 'responded_at', v.responded_at)) from public.orc_my_invitations() v), '[]'::jsonb),
    'engagements', coalesce((select jsonb_agg(jsonb_build_object('organization', e.org_name, 'production', e.title, 'role', e.role_name, 'first_date', e.first_date)) from public.orc_my_engagements() e), '[]'::jsonb))
$$;

create or replace function public.orc_request_deletion()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orc_musician_profiles p set deletion_requested_at = coalesce(p.deletion_requested_at, now()) where p.user_id = auth.uid();
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id) values (null, auth.uid(), 'privacy.deletion_requested', 'orc_musician_profiles', auth.uid()::text);
end $$;

-- Le mie candidature, con lo stato pubblico.
create or replace function public.orc_my_applications()
returns table (id uuid, org_id uuid, org_name text, status text, public_status text, submitted_at timestamptz, note_to_candidate text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.org_id, o.name, case when a.status = 'draft' then 'draft' else 'sent' end, public.orc_public_status(a.status), a.submitted_at, a.note_to_candidate, a.created_at
  from public.orc_applications a join public.orc_organizations o on o.id = a.org_id join public.orc_musician_profiles p on p.id = a.profile_id
  where p.user_id = auth.uid() order by a.created_at desc
$$;

-- ---------------------------------------------------------------- RPC dello staff
create or replace function public.orc_applications_list(org uuid)
returns table (id uuid, profile_id uuid, first_name text, last_name text, email text, city text, province text, status text, submitted_at timestamptz,
  primary_instrument text, instruments text[], n_evaluations bigint, last_evaluation timestamptz, deletion_requested_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, p.id, p.first_name, p.last_name, p.email, p.city, p.province, a.status, a.submitted_at,
    (select i.name from public.orc_profile_instruments pi join public.orc_instruments i on i.code = pi.instrument_code where pi.profile_id = p.id order by pi.is_primary desc, i.sort limit 1),
    coalesce((select array_agg(i.name order by pi.is_primary desc, i.sort) from public.orc_profile_instruments pi join public.orc_instruments i on i.code = pi.instrument_code where pi.profile_id = p.id), '{}'),
    (select count(*) from public.orc_evaluations e where e.application_id = a.id),
    (select max(e.at) from public.orc_evaluations e where e.application_id = a.id),
    p.deletion_requested_at, a.updated_at
  from public.orc_applications a join public.orc_musician_profiles p on p.id = a.profile_id
  where a.org_id = org and a.status <> 'draft' and public.orc_is_staff(org)
  order by case a.status when 'submitted' then 0 when 'evaluating' then 1 else 2 end, a.submitted_at desc
$$;

-- Cambio di stato con nota (interna) e messaggio al candidato; 'accepted' crea o collega il musicista.
create or replace function public.orc_application_set_status(app uuid, new_status text, note text default '', to_candidate text default null)
returns public.orc_applications language plpgsql security definer set search_path = public as $$
declare a public.orc_applications; p public.orc_musician_profiles; mid uuid; org uuid;
begin
  select * into a from public.orc_applications x where x.id = app;
  if a.id is null then raise exception 'candidatura inesistente' using errcode = 'P0002'; end if;
  org := a.org_id;
  if not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if new_status not in ('evaluating','interview_to_schedule','interview_scheduled','audition_to_schedule','audition_scheduled','reserve','accepted','rejected','suspended','archived') then
    raise exception 'stato non valido: %', new_status using errcode = '22023';
  end if;
  if a.status = 'draft' then raise exception 'la candidatura non è stata inviata' using errcode = '22023'; end if;
  if new_status = 'accepted' and a.musician_id is null then
    select * into p from public.orc_musician_profiles x where x.id = a.profile_id;
    select m.id into mid from public.orc_musicians m where m.org_id = org and m.deleted_at is null and (m.user_id = p.user_id or (p.email <> '' and lower(m.email) = lower(p.email))) limit 1;
    if mid is null then
      insert into public.orc_musicians (org_id, user_id, profile_id, first_name, last_name, email, phone, city, province, area, has_car, max_distance_km, travel_ok, tour_ok, status, source, bio, created_by)
      values (org, p.user_id, p.id, p.first_name, p.last_name, p.email, p.phone, p.city, p.province, p.area, p.has_car, p.max_distance_km, p.travel_ok, p.tour_ok, 'active', 'application', p.bio, auth.uid())
      returning id into mid;
      insert into public.orc_musician_instruments (musician_id, instrument_code, is_primary, level, doubling)
        select mid, i.instrument_code, i.is_primary, i.level, i.doubling from public.orc_profile_instruments i where i.profile_id = p.id;
      insert into public.orc_musician_skills (musician_id, skill_code, level, source)
        select mid, s.code, s.level, 'declared' from (values
          ('lettura_prima_vista', p.reading_sight), ('lettura_partitura', p.reading_score), ('con_direttore', case when p.with_conductor then 2 else 0 end),
          ('click', case when p.click then 2 else 0 end), ('sequenze', case when p.sequences then 2 else 0 end), ('in_ear', case when p.in_ear then 2 else 0 end),
          ('improvvisazione', p.improvisation), ('esp_orchestrale', case when p.exp_orchestral then 2 else 0 end), ('esp_pop', case when p.exp_pop then 2 else 0 end),
          ('esp_live', case when p.exp_live then 2 else 0 end), ('esp_studio', case when p.exp_studio then 2 else 0 end), ('esp_teatro_musical', case when p.exp_theatre then 2 else 0 end)
        ) as s(code, level) where s.level > 0;
      insert into public.orc_repertoire (org_id, kind, name)
        select org, r.kind, r.name from public.orc_profile_repertoire r where r.profile_id = p.id on conflict do nothing;
      insert into public.orc_musician_repertoire (musician_id, repertoire_id, source)
        select mid, x.id, 'declared' from public.orc_profile_repertoire r join public.orc_repertoire x on x.org_id = org and x.kind = r.kind and lower(x.name) = lower(r.name) where r.profile_id = p.id
        on conflict do nothing;
    else
      update public.orc_musicians m set user_id = coalesce(m.user_id, p.user_id), profile_id = coalesce(m.profile_id, p.id), status = case when m.status in ('archived','suspended') then 'active' else m.status end where m.id = mid;
    end if;
    update public.orc_applications x set musician_id = mid where x.id = app;
  end if;
  if new_status = 'reserve' and a.musician_id is not null then update public.orc_musicians m set status = 'reserve' where m.id = a.musician_id; end if;
  update public.orc_applications x set status = new_status, decided_at = case when new_status in ('accepted','rejected','reserve') then now() else x.decided_at end,
    decided_by = case when new_status in ('accepted','rejected','reserve') then auth.uid() else x.decided_by end,
    note_to_candidate = coalesce(to_candidate, x.note_to_candidate) where x.id = app returning * into a;
  insert into public.orc_application_events (application_id, from_status, to_status, actor, note, actor_id) values (app, (select x.status from public.orc_applications x where x.id = app), new_status, 'staff', coalesce(note, ''), auth.uid());
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload) values (org, auth.uid(), 'application.status', 'orc_applications', app::text, jsonb_build_object('to', new_status));
  return a;
end $$;

-- Il dettaglio per lo staff: profilo dichiarato, strumenti, repertorio, file, eventi, valutazioni.
create or replace function public.orc_application_detail(app uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'application', to_jsonb(a),
    'profile', to_jsonb(p) - 'user_id',
    'instruments', coalesce((select jsonb_agg(jsonb_build_object('code', i.instrument_code, 'name', x.name, 'primary', i.is_primary, 'level', i.level, 'doubling', i.doubling) order by i.is_primary desc, x.sort) from public.orc_profile_instruments i join public.orc_instruments x on x.code = i.instrument_code where i.profile_id = p.id), '[]'::jsonb),
    'repertoire', coalesce((select jsonb_agg(jsonb_build_object('kind', r.kind, 'name', r.name)) from public.orc_profile_repertoire r where r.profile_id = p.id), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.name, 'path', f.path, 'size', f.size, 'mime', f.mime)) from public.orc_files f where f.profile_id = p.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('from', e.from_status, 'to', e.to_status, 'actor', e.actor, 'note', e.note, 'at', e.at) order by e.at) from public.orc_application_events e where e.application_id = a.id), '[]'::jsonb),
    'evaluations', coalesce((select jsonb_agg(to_jsonb(ev) order by ev.at desc) from public.orc_evaluations ev where ev.application_id = a.id), '[]'::jsonb))
  from public.orc_applications a join public.orc_musician_profiles p on p.id = a.profile_id
  where a.id = app and a.status <> 'draft' and public.orc_is_staff(a.org_id)
$$;

create or replace function public.orc_set_accepting(org uuid, accepting boolean, intro text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- coalesce: un non-membro ha ruolo NULL, e «NULL not in (...)» è NULL, non vero: l'eccezione non scatterebbe
  if coalesce(public.orc_member_role(org), '') not in ('owner','admin') then raise exception 'non autorizzato' using errcode = '42501'; end if;
  update public.orc_organizations o set accepting_applications = accepting, application_intro = coalesce(intro, o.application_intro) where o.id = org;
end $$;

revoke all on function public.orc_ensure_musician_profile(), public.orc_open_organizations(), public.orc_apply(uuid), public.orc_profile_missing(uuid),
  public.orc_submit_application(uuid, text), public.orc_link_my_musician_rows(), public.orc_my_invitations(), public.orc_my_engagements(),
  public.orc_respond_mine(uuid, text, jsonb, text), public.orc_export_my_data(), public.orc_request_deletion(), public.orc_public_status(text),
  public.orc_my_applications(), public.orc_applications_list(uuid), public.orc_application_set_status(uuid, text, text, text),
  public.orc_application_detail(uuid), public.orc_set_accepting(uuid, boolean, text) from public, anon;
grant execute on function public.orc_ensure_musician_profile(), public.orc_open_organizations(), public.orc_apply(uuid), public.orc_profile_missing(uuid),
  public.orc_submit_application(uuid, text), public.orc_link_my_musician_rows(), public.orc_my_invitations(), public.orc_my_engagements(),
  public.orc_respond_mine(uuid, text, jsonb, text), public.orc_export_my_data(), public.orc_request_deletion(), public.orc_public_status(text),
  public.orc_my_applications(), public.orc_applications_list(uuid), public.orc_application_set_status(uuid, text, text, text),
  public.orc_application_detail(uuid), public.orc_set_accepting(uuid, boolean, text) to authenticated, service_role;
