-- 0044_orc_productions.sql — Orchestre, lotto 3: produzioni, date e organico.
--
-- Una produzione ha date, repertorio, sezioni e ruoli. Un RUOLO è l'esigenza aggregata («6 violini
-- secondi»); un POSTO (slot) è il singolo posto assegnabile: i posti nascono e muoiono con i seats del
-- ruolo (trigger), e non si toglie mai un posto occupato. Le assegnazioni vivono sullo slot; la STORIA
-- vive in orc_slot_events, append-only: una sostituzione è un evento, non una cancellazione.
-- Le scritture che cambiano stato (assegna, libera, modello, duplica) passano da RPC che ricontrollano
-- il ruolo sul server. Idempotente.

create table if not exists public.orc_productions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  title text not null,
  client text not null default '',
  description text not null default '',
  kind text not null default 'concerto',
  conductor text not null default '',
  manager text not null default '',
  venue text not null default '',
  address text not null default '',
  status text not null default 'draft',
  fee_note text not null default '',
  conditions text not null default '',
  dress_code text not null default '',
  reply_deadline timestamptz,
  notes text not null default '',
  stageplot_project_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint orc_productions_title_chk check (length(trim(title)) > 0),
  constraint orc_productions_status_chk check (status in
    ('draft','planning','staffing','collecting','partial','complete','confirmed','running','done','cancelled','archived')),
  constraint orc_productions_kind_chk check (kind in ('concerto','registrazione','teatro','tour','evento','altro'))
);
create index if not exists orc_productions_org_idx on public.orc_productions(org_id, status, updated_at desc);

create table if not exists public.orc_production_dates (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  kind text not null default 'rehearsal',
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text not null default '',
  note text not null default '',
  constraint orc_production_dates_kind_chk check (kind in ('rehearsal','concert','recording','travel','other')),
  constraint orc_production_dates_range_chk check (ends_at is null or ends_at >= starts_at)
);
create index if not exists orc_production_dates_idx on public.orc_production_dates(production_id, starts_at);

create table if not exists public.orc_production_repertoire (
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  repertoire_id uuid not null references public.orc_repertoire(id) on delete cascade,
  primary key (production_id, repertoire_id)
);

create table if not exists public.orc_staffing_sections (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  name text not null,
  sort integer not null default 0,
  constraint orc_staffing_sections_name_chk check (length(trim(name)) > 0)
);
create index if not exists orc_staffing_sections_idx on public.orc_staffing_sections(production_id, sort);

create table if not exists public.orc_staffing_roles (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  section_id uuid references public.orc_staffing_sections(id) on delete set null,
  instrument_code text references public.orc_instruments(code),
  name text not null,
  seats integer not null default 1,
  part text not null default 'tutti',
  min_level integer,
  fee text not null default '',
  notes text not null default '',
  sort integer not null default 0,
  constraint orc_staffing_roles_seats_chk check (seats between 0 and 200),
  constraint orc_staffing_roles_part_chk check (part in ('principal','tutti','solo')),
  constraint orc_staffing_roles_level_chk check (min_level is null or min_level between 1 and 5),
  constraint orc_staffing_roles_name_chk check (length(trim(name)) > 0)
);
create index if not exists orc_staffing_roles_idx on public.orc_staffing_roles(production_id, sort);

create table if not exists public.orc_role_requirements (
  role_id uuid not null references public.orc_staffing_roles(id) on delete cascade,
  skill_code text not null references public.orc_skills(code),
  required boolean not null default true,
  min_level integer not null default 1,
  primary key (role_id, skill_code),
  constraint orc_role_requirements_level_chk check (min_level between 0 and 3)
);

create table if not exists public.orc_staffing_slots (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.orc_staffing_roles(id) on delete cascade,
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  seat_no integer not null,
  musician_id uuid references public.orc_musicians(id) on delete set null,
  status text not null default 'open',
  updated_at timestamptz not null default now(),
  unique (role_id, seat_no),
  constraint orc_staffing_slots_status_chk check (status in ('open','invited','confirmed','reserve','replaced','cancelled'))
);
create index if not exists orc_staffing_slots_prod_idx on public.orc_staffing_slots(production_id, status);
create index if not exists orc_staffing_slots_mus_idx on public.orc_staffing_slots(musician_id) where musician_id is not null;

-- Storia dei posti: append-only. Chi ha fatto cosa, quando, perché.
create table if not exists public.orc_slot_events (
  id bigserial primary key,
  slot_id uuid not null references public.orc_staffing_slots(id) on delete cascade,
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  musician_id uuid references public.orc_musicians(id) on delete set null,
  event text not null,
  reason text not null default '',
  actor_id uuid,
  at timestamptz not null default now(),
  constraint orc_slot_events_event_chk check (event in
    ('proposed','invited','available','partial','unavailable','no_reply','confirmed','withdrew','replaced','revoked','reserve_set','override','cancelled'))
);
create index if not exists orc_slot_events_slot_idx on public.orc_slot_events(slot_id, at);
create index if not exists orc_slot_events_mus_idx on public.orc_slot_events(musician_id, at desc) where musician_id is not null;

create or replace function public.orc_slot_events_guard()
returns trigger language plpgsql as $$
begin
  raise exception 'orc_slot_events è append-only' using errcode = '55000';
end $$;
drop trigger if exists orc_slot_events_guard_trg on public.orc_slot_events;
create trigger orc_slot_events_guard_trg before update or delete on public.orc_slot_events
  for each row execute function public.orc_slot_events_guard();

-- l'esclusione (0043) ora può puntare a una produzione
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orc_musician_exclusions_production_fk') then
    alter table public.orc_musician_exclusions add constraint orc_musician_exclusions_production_fk
      foreign key (production_id) references public.orc_productions(id) on delete cascade;
  end if;
end $$;

drop trigger if exists orc_productions_touch on public.orc_productions;
create trigger orc_productions_touch before update on public.orc_productions
  for each row execute function public.touch_updated_at();
drop trigger if exists orc_staffing_slots_touch on public.orc_staffing_slots;
create trigger orc_staffing_slots_touch before update on public.orc_staffing_slots
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- posti = seats del ruolo
-- I posti seguono i seats: se ne aggiungono di aperti, si tolgono solo quelli aperti (dal numero più
-- alto). Se i posti occupati superano i seats richiesti, il cambio è rifiutato.
create or replace function public.orc_roles_sync_slots()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n_now int; n_busy int; i int;
begin
  select count(*) into n_now from public.orc_staffing_slots s where s.role_id = new.id;
  if n_now < new.seats then
    for i in n_now + 1 .. new.seats loop
      insert into public.orc_staffing_slots (role_id, production_id, seat_no) values (new.id, new.production_id, i);
    end loop;
  elsif n_now > new.seats then
    select count(*) into n_busy from public.orc_staffing_slots s where s.role_id = new.id and s.status <> 'open';
    if n_busy > new.seats then
      raise exception 'ci sono % posti occupati: prima liberali', n_busy using errcode = '23514';
    end if;
    delete from public.orc_staffing_slots s where s.role_id = new.id and s.status = 'open'
      and s.id in (select s2.id from public.orc_staffing_slots s2 where s2.role_id = new.id and s2.status = 'open'
                   order by s2.seat_no desc limit (n_now - new.seats));
    -- rinumera i posti rimasti, così i numeri restano 1..seats
    with ordered as (select s.id, row_number() over (order by s.seat_no) as rn from public.orc_staffing_slots s where s.role_id = new.id)
    update public.orc_staffing_slots s set seat_no = ordered.rn + 1000 from ordered where s.id = ordered.id;
    with ordered as (select s.id, row_number() over (order by s.seat_no) as rn from public.orc_staffing_slots s where s.role_id = new.id)
    update public.orc_staffing_slots s set seat_no = ordered.rn from ordered where s.id = ordered.id;
  end if;
  return new;
end $$;
drop trigger if exists orc_roles_sync_slots_trg on public.orc_staffing_roles;
create trigger orc_roles_sync_slots_trg after insert or update of seats on public.orc_staffing_roles
  for each row execute function public.orc_roles_sync_slots();

-- ---------------------------------------------------------------- grant
grant select, insert, update, delete on public.orc_productions, public.orc_production_dates,
  public.orc_production_repertoire, public.orc_staffing_sections, public.orc_staffing_roles,
  public.orc_role_requirements to authenticated;
grant select on public.orc_staffing_slots, public.orc_slot_events to authenticated;
grant all on public.orc_productions, public.orc_production_dates, public.orc_production_repertoire,
  public.orc_staffing_sections, public.orc_staffing_roles, public.orc_role_requirements,
  public.orc_staffing_slots, public.orc_slot_events to service_role;
grant usage, select on sequence public.orc_slot_events_id_seq to service_role;

-- ---------------------------------------------------------------- RLS
alter table public.orc_productions enable row level security;
alter table public.orc_production_dates enable row level security;
alter table public.orc_production_repertoire enable row level security;
alter table public.orc_staffing_sections enable row level security;
alter table public.orc_staffing_roles enable row level security;
alter table public.orc_role_requirements enable row level security;
alter table public.orc_staffing_slots enable row level security;
alter table public.orc_slot_events enable row level security;

create or replace function public.orc_production_org(pid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.org_id from public.orc_productions p where p.id = pid
$$;
create or replace function public.orc_role_org(rid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.org_id from public.orc_staffing_roles r join public.orc_productions p on p.id = r.production_id where r.id = rid
$$;
revoke all on function public.orc_production_org(uuid), public.orc_role_org(uuid) from public, anon;
grant execute on function public.orc_production_org(uuid), public.orc_role_org(uuid) to authenticated, service_role;

drop policy if exists orc_productions_staff on public.orc_productions;
create policy orc_productions_staff on public.orc_productions
  for all using (public.orc_is_staff(org_id)) with check (public.orc_is_staff(org_id));
drop policy if exists orc_production_dates_staff on public.orc_production_dates;
create policy orc_production_dates_staff on public.orc_production_dates
  for all using (public.orc_is_staff(public.orc_production_org(production_id)))
  with check (public.orc_is_staff(public.orc_production_org(production_id)));
drop policy if exists orc_production_repertoire_staff on public.orc_production_repertoire;
create policy orc_production_repertoire_staff on public.orc_production_repertoire
  for all using (public.orc_is_staff(public.orc_production_org(production_id)))
  with check (public.orc_is_staff(public.orc_production_org(production_id)));
drop policy if exists orc_staffing_sections_staff on public.orc_staffing_sections;
create policy orc_staffing_sections_staff on public.orc_staffing_sections
  for all using (public.orc_is_staff(public.orc_production_org(production_id)))
  with check (public.orc_is_staff(public.orc_production_org(production_id)));
drop policy if exists orc_staffing_roles_staff on public.orc_staffing_roles;
create policy orc_staffing_roles_staff on public.orc_staffing_roles
  for all using (public.orc_is_staff(public.orc_production_org(production_id)))
  with check (public.orc_is_staff(public.orc_production_org(production_id)));
drop policy if exists orc_role_requirements_staff on public.orc_role_requirements;
create policy orc_role_requirements_staff on public.orc_role_requirements
  for all using (public.orc_is_staff(public.orc_role_org(role_id)))
  with check (public.orc_is_staff(public.orc_role_org(role_id)));
-- posti ed eventi: si leggono; si scrivono solo con le RPC
drop policy if exists orc_staffing_slots_staff_select on public.orc_staffing_slots;
create policy orc_staffing_slots_staff_select on public.orc_staffing_slots
  for select using (public.orc_is_staff(public.orc_production_org(production_id)));
drop policy if exists orc_slot_events_staff_select on public.orc_slot_events;
create policy orc_slot_events_staff_select on public.orc_slot_events
  for select using (public.orc_is_staff(public.orc_production_org(production_id)));

-- ---------------------------------------------------------------- RPC
-- Elenco con i conteggi che servono alla lista: date, posti, occupati, scoperti.
create or replace function public.orc_productions_list(org uuid)
returns table (id uuid, title text, client text, kind text, status text, conductor text, venue text,
  first_date timestamptz, last_date timestamptz, n_dates bigint, n_seats bigint, n_filled bigint, n_open bigint, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.title, p.client, p.kind, p.status, p.conductor, p.venue,
    (select min(d.starts_at) from public.orc_production_dates d where d.production_id = p.id),
    (select max(coalesce(d.ends_at, d.starts_at)) from public.orc_production_dates d where d.production_id = p.id),
    (select count(*) from public.orc_production_dates d where d.production_id = p.id),
    (select count(*) from public.orc_staffing_slots s where s.production_id = p.id),
    (select count(*) from public.orc_staffing_slots s where s.production_id = p.id and s.status = 'confirmed'),
    (select count(*) from public.orc_staffing_slots s where s.production_id = p.id and s.status = 'open'),
    p.updated_at
  from public.orc_productions p
  where p.org_id = org and p.deleted_at is null and public.orc_is_staff(org)
  order by coalesce((select min(d.starts_at) from public.orc_production_dates d where d.production_id = p.id), p.created_at) desc
$$;

-- Assegnazione manuale di un musicista a un posto (conferma diretta, fuori dal giro delle convocazioni).
create or replace function public.orc_assign_slot(slot uuid, musician uuid, reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.orc_staffing_slots; org uuid; morg uuid;
begin
  select * into s from public.orc_staffing_slots x where x.id = slot;
  if s.id is null then raise exception 'posto inesistente' using errcode = 'P0002'; end if;
  org := public.orc_production_org(s.production_id);
  if not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  select m.org_id into morg from public.orc_musicians m where m.id = musician and m.deleted_at is null;
  if morg is null or morg <> org then raise exception 'musicista non di questa organizzazione' using errcode = '23503'; end if;
  if s.status <> 'open' and s.musician_id is not null then raise exception 'posto già occupato: prima liberalo' using errcode = '23505'; end if;
  if exists (select 1 from public.orc_staffing_slots x where x.production_id = s.production_id and x.musician_id = musician and x.status in ('confirmed','invited','reserve')) then
    raise exception 'il musicista ha già un posto in questa produzione' using errcode = '23505';
  end if;
  update public.orc_staffing_slots x set musician_id = musician, status = 'confirmed' where x.id = slot;
  insert into public.orc_slot_events (slot_id, production_id, musician_id, event, reason, actor_id)
  values (slot, s.production_id, musician, 'confirmed', coalesce(reason, ''), auth.uid());
end $$;

-- Libera un posto: revoca (decisione dell'org), rinuncia (del musicista) o annullamento. Il posto
-- torna aperto, l'evento resta.
create or replace function public.orc_release_slot(slot uuid, event text, reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.orc_staffing_slots;
begin
  select * into s from public.orc_staffing_slots x where x.id = slot;
  if s.id is null then raise exception 'posto inesistente' using errcode = 'P0002'; end if;
  if not public.orc_is_staff(public.orc_production_org(s.production_id)) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if event not in ('revoked','withdrew','cancelled') then raise exception 'evento non valido' using errcode = '22023'; end if;
  if s.musician_id is null then raise exception 'il posto è già libero' using errcode = '22023'; end if;
  insert into public.orc_slot_events (slot_id, production_id, musician_id, event, reason, actor_id)
  values (slot, s.production_id, s.musician_id, event, coalesce(reason, ''), auth.uid());
  update public.orc_staffing_slots x set musician_id = null, status = 'open' where x.id = slot;
end $$;

-- Organico da modello: [{section, roles:[{instrument, name, seats, part, min_level}]}]. Solo su una
-- produzione senza ruoli (non si sovrappone a un organico già costruito).
create or replace function public.orc_apply_staffing_template(production uuid, template jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  sec jsonb; rl jsonb; sid uuid; n int := 0; i int := 0; j int;
begin
  if not public.orc_is_staff(public.orc_production_org(production)) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if exists (select 1 from public.orc_staffing_roles r where r.production_id = production) then
    raise exception 'questa produzione ha già un organico' using errcode = '23505';
  end if;
  for sec in select * from jsonb_array_elements(template) loop
    i := i + 1;
    insert into public.orc_staffing_sections (production_id, name, sort) values (production, sec ->> 'section', i) returning id into sid;
    j := 0;
    for rl in select * from jsonb_array_elements(sec -> 'roles') loop
      j := j + 1;
      insert into public.orc_staffing_roles (production_id, section_id, instrument_code, name, seats, part, min_level, sort)
      values (production, sid, nullif(rl ->> 'instrument', ''), coalesce(nullif(rl ->> 'name', ''), rl ->> 'instrument'),
              coalesce((rl ->> 'seats')::int, 1), coalesce(nullif(rl ->> 'part', ''), 'tutti'), nullif(rl ->> 'min_level', '')::int, i * 100 + j);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- Duplica l'organico (sezioni, ruoli, requisiti) da un'altra produzione della stessa org. Niente persone.
create or replace function public.orc_duplicate_staffing(src uuid, dst uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  org uuid; sec record; rl record; sid uuid; rid uuid; n int := 0;
begin
  org := public.orc_production_org(dst);
  if org is null or not public.orc_is_staff(org) or public.orc_production_org(src) <> org then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if exists (select 1 from public.orc_staffing_roles r where r.production_id = dst) then
    raise exception 'questa produzione ha già un organico' using errcode = '23505';
  end if;
  for sec in select * from public.orc_staffing_sections s where s.production_id = src order by s.sort loop
    insert into public.orc_staffing_sections (production_id, name, sort) values (dst, sec.name, sec.sort) returning id into sid;
    for rl in select * from public.orc_staffing_roles r where r.production_id = src and r.section_id = sec.id order by r.sort loop
      insert into public.orc_staffing_roles (production_id, section_id, instrument_code, name, seats, part, min_level, fee, notes, sort)
      values (dst, sid, rl.instrument_code, rl.name, rl.seats, rl.part, rl.min_level, rl.fee, rl.notes, rl.sort) returning id into rid;
      insert into public.orc_role_requirements (role_id, skill_code, required, min_level)
        select rid, q.skill_code, q.required, q.min_level from public.orc_role_requirements q where q.role_id = rl.id;
      n := n + 1;
    end loop;
  end loop;
  -- ruoli senza sezione
  for rl in select * from public.orc_staffing_roles r where r.production_id = src and r.section_id is null order by r.sort loop
    insert into public.orc_staffing_roles (production_id, instrument_code, name, seats, part, min_level, fee, notes, sort)
    values (dst, rl.instrument_code, rl.name, rl.seats, rl.part, rl.min_level, rl.fee, rl.notes, rl.sort) returning id into rid;
    insert into public.orc_role_requirements (role_id, skill_code, required, min_level)
      select rid, q.skill_code, q.required, q.min_level from public.orc_role_requirements q where q.role_id = rl.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- L'organico di una produzione in una sola lettura: ruoli con posti e nomi.
create or replace function public.orc_staffing(production uuid)
returns table (role_id uuid, section_id uuid, section_name text, section_sort integer, role_name text, instrument_code text,
  instrument_name text, seats integer, part text, min_level integer, notes text, role_sort integer,
  slot_id uuid, seat_no integer, slot_status text, musician_id uuid, musician_name text)
language sql stable security definer set search_path = public as $$
  select r.id, s.id, s.name, s.sort, r.name, r.instrument_code, i.name, r.seats, r.part, r.min_level, r.notes, r.sort,
    sl.id, sl.seat_no, sl.status, sl.musician_id, case when m.id is null then null else m.last_name || ' ' || m.first_name end
  from public.orc_staffing_roles r
  left join public.orc_staffing_sections s on s.id = r.section_id
  left join public.orc_instruments i on i.code = r.instrument_code
  left join public.orc_staffing_slots sl on sl.role_id = r.id
  left join public.orc_musicians m on m.id = sl.musician_id
  where r.production_id = production and public.orc_is_staff(public.orc_production_org(production))
  order by coalesce(s.sort, 999), r.sort, sl.seat_no
$$;

revoke all on function public.orc_productions_list(uuid), public.orc_assign_slot(uuid, uuid, text),
  public.orc_release_slot(uuid, text, text), public.orc_apply_staffing_template(uuid, jsonb),
  public.orc_duplicate_staffing(uuid, uuid), public.orc_staffing(uuid) from public, anon;
grant execute on function public.orc_productions_list(uuid), public.orc_assign_slot(uuid, uuid, text),
  public.orc_release_slot(uuid, text, text), public.orc_apply_staffing_template(uuid, jsonb),
  public.orc_duplicate_staffing(uuid, uuid), public.orc_staffing(uuid) to authenticated, service_role;
