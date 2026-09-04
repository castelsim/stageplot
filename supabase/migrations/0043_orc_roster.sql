-- 0043_orc_roster.sql — Orchestre, lotto 2: il pool dei musicisti di un'organizzazione.
--
-- orc_musicians è il rolodex dell'org: contatti, strumenti, competenze, repertorio eseguito, tag,
-- esclusioni. È per-organizzazione fin dall'inizio (una valutazione di A non riguarda B); il
-- collegamento a un account (user_id) e al profilo globale self-service (profile_id) arriva con le
-- candidature. Ogni policy passa da orc_is_staff(org): un musicista NON legge questa tabella
-- (le note private ci stanno dentro); l'area musicista avrà una vista dedicata.
-- L'import via CSV passa da orc_import_musicians(): una transazione, il controllo del ruolo sul
-- server, l'upsert per email dentro l'org. Idempotente.

create table if not exists public.orc_musicians (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  profile_id uuid,
  first_name text not null,
  last_name text not null,
  email text not null default '',
  phone text not null default '',
  city text not null default '',
  province text not null default '',
  area text not null default '',
  has_car boolean not null default false,
  max_distance_km integer,
  travel_ok boolean not null default true,
  tour_ok boolean not null default false,
  status text not null default 'active',
  source text not null default 'manual',
  bio text not null default '',
  notes_private text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint orc_musicians_status_chk check (status in ('active','reserve','suspended','archived')),
  constraint orc_musicians_source_chk check (source in ('import','application','manual')),
  constraint orc_musicians_name_chk check (length(trim(first_name)) > 0 and length(trim(last_name)) > 0),
  constraint orc_musicians_email_chk check (email = '' or email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);
create index if not exists orc_musicians_org_idx on public.orc_musicians(org_id, last_name, first_name);
create index if not exists orc_musicians_org_status_idx on public.orc_musicians(org_id, status);
create unique index if not exists orc_musicians_org_email_key on public.orc_musicians(org_id, lower(email)) where email <> '' and deleted_at is null;

create table if not exists public.orc_musician_instruments (
  musician_id uuid not null references public.orc_musicians(id) on delete cascade,
  instrument_code text not null references public.orc_instruments(code),
  is_primary boolean not null default false,
  level integer,
  doubling boolean not null default false,
  primary key (musician_id, instrument_code),
  constraint orc_musician_instruments_level_chk check (level is null or level between 1 and 5)
);
create index if not exists orc_musician_instruments_code_idx on public.orc_musician_instruments(instrument_code);

create table if not exists public.orc_musician_skills (
  musician_id uuid not null references public.orc_musicians(id) on delete cascade,
  skill_code text not null references public.orc_skills(code),
  level integer not null default 1,
  source text not null default 'declared',
  primary key (musician_id, skill_code),
  constraint orc_musician_skills_level_chk check (level between 0 and 3),
  constraint orc_musician_skills_source_chk check (source in ('declared','verified'))
);

create table if not exists public.orc_repertoire (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  kind text not null,
  name text not null,
  parent_id uuid references public.orc_repertoire(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint orc_repertoire_kind_chk check (kind in ('composer','work','program','genre')),
  constraint orc_repertoire_name_chk check (length(trim(name)) > 0)
);
create unique index if not exists orc_repertoire_org_key on public.orc_repertoire(org_id, kind, lower(name));

create table if not exists public.orc_musician_repertoire (
  musician_id uuid not null references public.orc_musicians(id) on delete cascade,
  repertoire_id uuid not null references public.orc_repertoire(id) on delete cascade,
  source text not null default 'declared',
  note text not null default '',
  primary key (musician_id, repertoire_id),
  constraint orc_musician_repertoire_source_chk check (source in ('declared','verified','history'))
);
create index if not exists orc_musician_repertoire_rep_idx on public.orc_musician_repertoire(repertoire_id);

create table if not exists public.orc_musician_tags (
  musician_id uuid not null references public.orc_musicians(id) on delete cascade,
  tag text not null,
  primary key (musician_id, tag),
  constraint orc_musician_tags_chk check (length(trim(tag)) between 1 and 40)
);

create table if not exists public.orc_musician_exclusions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  musician_id uuid not null references public.orc_musicians(id) on delete cascade,
  production_id uuid,
  reason text not null default '',
  until date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists orc_musician_exclusions_idx on public.orc_musician_exclusions(org_id, musician_id);

drop trigger if exists orc_musicians_touch on public.orc_musicians;
create trigger orc_musicians_touch before update on public.orc_musicians
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- grant (espliciti, vedi 0041)
grant select, insert, update, delete on public.orc_musicians, public.orc_musician_instruments,
  public.orc_musician_skills, public.orc_repertoire, public.orc_musician_repertoire,
  public.orc_musician_tags, public.orc_musician_exclusions to authenticated;
grant all on public.orc_musicians, public.orc_musician_instruments, public.orc_musician_skills,
  public.orc_repertoire, public.orc_musician_repertoire, public.orc_musician_tags,
  public.orc_musician_exclusions to service_role;

-- ---------------------------------------------------------------- RLS: solo lo staff dell'org
alter table public.orc_musicians enable row level security;
alter table public.orc_musician_instruments enable row level security;
alter table public.orc_musician_skills enable row level security;
alter table public.orc_repertoire enable row level security;
alter table public.orc_musician_repertoire enable row level security;
alter table public.orc_musician_tags enable row level security;
alter table public.orc_musician_exclusions enable row level security;

-- helper: l'org di un musicista, per le tabelle figlie (security definer: non ricade nella RLS di orc_musicians)
create or replace function public.orc_musician_org(mid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select m.org_id from public.orc_musicians m where m.id = mid
$$;
revoke all on function public.orc_musician_org(uuid) from public, anon;
grant execute on function public.orc_musician_org(uuid) to authenticated, service_role;

drop policy if exists orc_musicians_staff on public.orc_musicians;
create policy orc_musicians_staff on public.orc_musicians
  for all using (public.orc_is_staff(org_id)) with check (public.orc_is_staff(org_id));
drop policy if exists orc_repertoire_staff on public.orc_repertoire;
create policy orc_repertoire_staff on public.orc_repertoire
  for all using (public.orc_is_staff(org_id)) with check (public.orc_is_staff(org_id));
drop policy if exists orc_musician_exclusions_staff on public.orc_musician_exclusions;
create policy orc_musician_exclusions_staff on public.orc_musician_exclusions
  for all using (public.orc_is_staff(org_id)) with check (public.orc_is_staff(org_id));
drop policy if exists orc_musician_instruments_staff on public.orc_musician_instruments;
create policy orc_musician_instruments_staff on public.orc_musician_instruments
  for all using (public.orc_is_staff(public.orc_musician_org(musician_id)))
  with check (public.orc_is_staff(public.orc_musician_org(musician_id)));
drop policy if exists orc_musician_skills_staff on public.orc_musician_skills;
create policy orc_musician_skills_staff on public.orc_musician_skills
  for all using (public.orc_is_staff(public.orc_musician_org(musician_id)))
  with check (public.orc_is_staff(public.orc_musician_org(musician_id)));
drop policy if exists orc_musician_repertoire_staff on public.orc_musician_repertoire;
create policy orc_musician_repertoire_staff on public.orc_musician_repertoire
  for all using (public.orc_is_staff(public.orc_musician_org(musician_id)))
  with check (public.orc_is_staff(public.orc_musician_org(musician_id)));
drop policy if exists orc_musician_tags_staff on public.orc_musician_tags;
create policy orc_musician_tags_staff on public.orc_musician_tags
  for all using (public.orc_is_staff(public.orc_musician_org(musician_id)))
  with check (public.orc_is_staff(public.orc_musician_org(musician_id)));

-- ---------------------------------------------------------------- import
-- rows: array di oggetti {first_name,last_name,email,phone,city,province,area,has_car,max_distance_km,
--   travel_ok,tour_ok,status,bio,notes_private,
--   instruments:[{code,primary,level,doubling}], skills:[{code,level}],
--   repertoire:[{kind,name,source}], tags:[text]}
-- Upsert per email (se c'è) dentro l'org; senza email crea sempre. Strumenti/competenze/repertorio/tag
-- della riga SOSTITUISCONO quelli esistenti (l'import è la fonte per quel musicista).
create or replace function public.orc_import_musicians(org uuid, rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; ins jsonb; sk jsonb; rp jsonb; tg jsonb;
  mid uuid; rid uuid;
  n_new int := 0; n_upd int := 0; n_err int := 0;
  errs jsonb := '[]'::jsonb;
  em text; fn text; ln text; was_new boolean;
begin
  if not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if jsonb_typeof(rows) <> 'array' then raise exception 'rows deve essere un array' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    begin
      fn := trim(coalesce(r ->> 'first_name', '')); ln := trim(coalesce(r ->> 'last_name', ''));
      em := lower(trim(coalesce(r ->> 'email', '')));
      if fn = '' or ln = '' then raise exception 'nome o cognome mancante'; end if;
      mid := null;
      if em <> '' then
        select m.id into mid from public.orc_musicians m where m.org_id = org and lower(m.email) = em and m.deleted_at is null;
      end if;
      if mid is null then
        insert into public.orc_musicians (org_id, first_name, last_name, email, phone, city, province, area, has_car,
          max_distance_km, travel_ok, tour_ok, status, source, bio, notes_private, created_by)
        values (org, fn, ln, em, coalesce(r ->> 'phone', ''), coalesce(r ->> 'city', ''), coalesce(r ->> 'province', ''),
          coalesce(r ->> 'area', ''), coalesce((r ->> 'has_car')::boolean, false), nullif(r ->> 'max_distance_km', '')::int,
          coalesce((r ->> 'travel_ok')::boolean, true), coalesce((r ->> 'tour_ok')::boolean, false),
          coalesce(nullif(r ->> 'status', ''), 'active'), 'import', coalesce(r ->> 'bio', ''), coalesce(r ->> 'notes_private', ''), auth.uid())
        returning id into mid;
        was_new := true;
      else
        update public.orc_musicians set first_name = fn, last_name = ln,
          phone = coalesce(r ->> 'phone', phone), city = coalesce(r ->> 'city', city), province = coalesce(r ->> 'province', province),
          area = coalesce(r ->> 'area', area), has_car = coalesce((r ->> 'has_car')::boolean, has_car),
          max_distance_km = coalesce(nullif(r ->> 'max_distance_km', '')::int, max_distance_km),
          travel_ok = coalesce((r ->> 'travel_ok')::boolean, travel_ok), tour_ok = coalesce((r ->> 'tour_ok')::boolean, tour_ok),
          status = coalesce(nullif(r ->> 'status', ''), status), bio = coalesce(r ->> 'bio', bio),
          notes_private = coalesce(r ->> 'notes_private', notes_private)
        where id = mid;
        was_new := false;
      end if;
      if r ? 'instruments' then
        delete from public.orc_musician_instruments where musician_id = mid;
        for ins in select * from jsonb_array_elements(r -> 'instruments') loop
          insert into public.orc_musician_instruments (musician_id, instrument_code, is_primary, level, doubling)
          values (mid, ins ->> 'code', coalesce((ins ->> 'primary')::boolean, false), nullif(ins ->> 'level', '')::int, coalesce((ins ->> 'doubling')::boolean, false))
          on conflict (musician_id, instrument_code) do update set is_primary = excluded.is_primary, level = excluded.level, doubling = excluded.doubling;
        end loop;
      end if;
      if r ? 'skills' then
        delete from public.orc_musician_skills where musician_id = mid;
        for sk in select * from jsonb_array_elements(r -> 'skills') loop
          insert into public.orc_musician_skills (musician_id, skill_code, level, source)
          values (mid, sk ->> 'code', coalesce(nullif(sk ->> 'level', '')::int, 1), coalesce(nullif(sk ->> 'source', ''), 'declared'))
          on conflict (musician_id, skill_code) do update set level = excluded.level, source = excluded.source;
        end loop;
      end if;
      if r ? 'repertoire' then
        delete from public.orc_musician_repertoire where musician_id = mid;
        for rp in select * from jsonb_array_elements(r -> 'repertoire') loop
          select x.id into rid from public.orc_repertoire x where x.org_id = org and x.kind = (rp ->> 'kind') and lower(x.name) = lower(trim(rp ->> 'name'));
          if rid is null then
            insert into public.orc_repertoire (org_id, kind, name) values (org, rp ->> 'kind', trim(rp ->> 'name')) returning id into rid;
          end if;
          insert into public.orc_musician_repertoire (musician_id, repertoire_id, source, note)
          values (mid, rid, coalesce(nullif(rp ->> 'source', ''), 'declared'), coalesce(rp ->> 'note', ''))
          on conflict (musician_id, repertoire_id) do update set source = excluded.source, note = excluded.note;
        end loop;
      end if;
      if r ? 'tags' then
        delete from public.orc_musician_tags where musician_id = mid;
        for tg in select * from jsonb_array_elements(r -> 'tags') loop
          insert into public.orc_musician_tags (musician_id, tag) values (mid, trim(tg #>> '{}')) on conflict do nothing;
        end loop;
      end if;
      -- i contatori si toccano solo a riga completata: un errore più sotto annulla la sotto-transazione
      -- (musicista compreso), ma non le variabili
      if was_new then n_new := n_new + 1; else n_upd := n_upd + 1; end if;
    exception when others then
      n_err := n_err + 1;
      errs := errs || jsonb_build_object('row', coalesce(fn || ' ' || ln, '?'), 'error', sqlerrm);
    end;
  end loop;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, payload)
  values (org, auth.uid(), 'musicians.import', 'orc_musicians', jsonb_build_object('new', n_new, 'updated', n_upd, 'errors', n_err));
  return jsonb_build_object('new', n_new, 'updated', n_upd, 'errors', n_err, 'details', errs);
end $$;
revoke all on function public.orc_import_musicians(uuid, jsonb) from public, anon;
grant execute on function public.orc_import_musicians(uuid, jsonb) to authenticated, service_role;

-- Lista compatta per la pagina: un musicista per riga con strumenti e tag aggregati.
create or replace function public.orc_musicians_list(org uuid)
returns table (id uuid, first_name text, last_name text, email text, phone text, city text, province text,
  status text, primary_instrument text, primary_family text, instruments text[], tags text[], updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.first_name, m.last_name, m.email, m.phone, m.city, m.province, m.status,
    (select i.name from public.orc_musician_instruments mi join public.orc_instruments i on i.code = mi.instrument_code
       where mi.musician_id = m.id order by mi.is_primary desc, i.sort limit 1),
    (select i.family from public.orc_musician_instruments mi join public.orc_instruments i on i.code = mi.instrument_code
       where mi.musician_id = m.id order by mi.is_primary desc, i.sort limit 1),
    coalesce((select array_agg(i.name order by mi.is_primary desc, i.sort) from public.orc_musician_instruments mi
       join public.orc_instruments i on i.code = mi.instrument_code where mi.musician_id = m.id), '{}'),
    coalesce((select array_agg(t.tag order by t.tag) from public.orc_musician_tags t where t.musician_id = m.id), '{}'),
    m.updated_at
  from public.orc_musicians m
  where m.org_id = org and m.deleted_at is null and public.orc_is_staff(org)
  order by m.last_name, m.first_name
$$;
revoke all on function public.orc_musicians_list(uuid) from public, anon;
grant execute on function public.orc_musicians_list(uuid) to authenticated, service_role;
