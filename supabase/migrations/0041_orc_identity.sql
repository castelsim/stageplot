-- 0041_orc_identity.sql — StagePlot Orchestre, lotto 1: identità, organizzazioni, ruoli.
--
-- Orchestre è un'applicazione distinta (stageplot.it/orchestre) che condivide con l'editor SOLO
-- auth.users. Tutto il resto ha prefisso orc_. Scelte:
--  * NESSUN trigger su auth.users: un trigger che fallisse bloccherebbe il login di tutto StagePlot.
--    Il profilo lo crea il client al primo accesso con la RPC orc_ensure_profile().
--  * multi-organizzazione dal primo giorno: ogni dato di Orchestre appartiene a un'org, e ogni
--    policy passa da orc_member_role(org) (SECURITY DEFINER, STABLE: niente ricorsione RLS).
--  * i ruoli si cambiano SOLO via RPC: nessuna policy di insert/update/delete sul client per
--    orc_memberships. Un utente non può darsi un ruolo da solo.
--  * la prima organizzazione la crea orc_bootstrap_org(), eseguibile solo dal service_role
--    (ops/orc-bootstrap.sh): nessuna «prima org gratis» che un estraneo potrebbe prendersi.
-- Idempotente.

create table if not exists public.orc_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orc_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orc_organizations_name_chk check (length(trim(name)) between 2 and 120),
  constraint orc_organizations_slug_chk check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$')
);

create table if not exists public.orc_memberships (
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id),
  constraint orc_memberships_role_chk check (role in ('owner','admin','artistic','production','section','viewer'))
);
create index if not exists orc_memberships_user_idx on public.orc_memberships(user_id);

-- Registro delle azioni sensibili. Scritto solo dalle RPC (security definer): il client non ha
-- policy di insert.
create table if not exists public.orc_audit_log (
  id bigserial primary key,
  org_id uuid references public.orc_organizations(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text not null default '',
  payload jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists orc_audit_log_org_idx on public.orc_audit_log(org_id, at desc);

-- updated_at a ogni update: riusa public.touch_updated_at (0011)
drop trigger if exists orc_profiles_touch on public.orc_profiles;
create trigger orc_profiles_touch before update on public.orc_profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists orc_organizations_touch on public.orc_organizations;
create trigger orc_organizations_touch before update on public.orc_organizations
  for each row execute function public.touch_updated_at();
drop trigger if exists orc_memberships_touch on public.orc_memberships;
create trigger orc_memberships_touch before update on public.orc_memberships
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- grant di tabella
-- Espliciti: le immagini Postgres recenti di Supabase non danno più select/insert/update di default
-- ad anon/authenticated (verificato in locale il 04/09/2026: solo trigger/references). La RLS
-- restringe le righe; il grant dice cosa si può tentare. anon: niente.
grant select, update on public.orc_profiles to authenticated;
grant select, update on public.orc_organizations to authenticated;
grant select on public.orc_memberships to authenticated;
grant select on public.orc_audit_log to authenticated;
grant all on public.orc_profiles, public.orc_organizations, public.orc_memberships, public.orc_audit_log to service_role;
grant usage, select on sequence public.orc_audit_log_id_seq to service_role;

-- ---------------------------------------------------------------- helper per le policy
-- SECURITY DEFINER + STABLE: le policy di orc_memberships possono chiamarli senza ricorsione.
create or replace function public.orc_member_role(org uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.role from public.orc_memberships m where m.org_id = org and m.user_id = auth.uid()
$$;
create or replace function public.orc_is_staff(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.orc_member_role(org) in ('owner','admin','artistic','production'), false)
$$;
revoke all on function public.orc_member_role(uuid) from public, anon;
revoke all on function public.orc_is_staff(uuid) from public, anon;
grant execute on function public.orc_member_role(uuid) to authenticated, service_role;
grant execute on function public.orc_is_staff(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- RLS
alter table public.orc_profiles enable row level security;
alter table public.orc_organizations enable row level security;
alter table public.orc_memberships enable row level security;
alter table public.orc_audit_log enable row level security;

drop policy if exists orc_profiles_own_select on public.orc_profiles;
create policy orc_profiles_own_select on public.orc_profiles
  for select using (auth.uid() = id);
drop policy if exists orc_profiles_own_update on public.orc_profiles;
create policy orc_profiles_own_update on public.orc_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- insert: solo via orc_ensure_profile()

drop policy if exists orc_organizations_member_select on public.orc_organizations;
create policy orc_organizations_member_select on public.orc_organizations
  for select using (public.orc_member_role(id) is not null);
drop policy if exists orc_organizations_admin_update on public.orc_organizations;
create policy orc_organizations_admin_update on public.orc_organizations
  for update using (public.orc_member_role(id) in ('owner','admin'))
  with check (public.orc_member_role(id) in ('owner','admin'));
-- insert/delete: solo via RPC service_role

drop policy if exists orc_memberships_select on public.orc_memberships;
create policy orc_memberships_select on public.orc_memberships
  for select using (user_id = auth.uid() or public.orc_is_staff(org_id));
-- insert/update/delete: NESSUNA policy (solo RPC)

drop policy if exists orc_audit_log_staff_select on public.orc_audit_log;
create policy orc_audit_log_staff_select on public.orc_audit_log
  for select using (public.orc_member_role(org_id) in ('owner','admin'));

-- ---------------------------------------------------------------- RPC
-- Profilo: upsert dal JWT (nome Google → display_name), mai dal client. Un nome già scelto
-- dall'utente non viene sovrascritto.
create or replace function public.orc_ensure_profile()
returns public.orc_profiles language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  meta jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
  nome text;
  p public.orc_profiles;
begin
  if uid is null then raise exception 'non autenticato' using errcode = '28000'; end if;
  nome := coalesce(nullif(trim(meta ->> 'full_name'), ''), nullif(trim(meta ->> 'name'), ''),
                   split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1));
  insert into public.orc_profiles (id, display_name) values (uid, left(nome, 120))
  on conflict (id) do update set display_name = case
      when public.orc_profiles.display_name = '' then excluded.display_name
      else public.orc_profiles.display_name end
  returning * into p;
  return p;
end $$;

create or replace function public.orc_my_memberships()
returns table (org_id uuid, org_name text, org_slug text, role text)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.slug, m.role
  from public.orc_memberships m join public.orc_organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
  order by o.name
$$;

-- Membri dell'org con nome ed email: i profili altrui non sono leggibili per policy, quindi
-- l'elenco passa da qui, e solo per lo staff dell'org.
create or replace function public.orc_org_members(org uuid)
returns table (user_id uuid, role text, display_name text, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.role, coalesce(p.display_name, ''), u.email::text, m.created_at
  from public.orc_memberships m
  left join public.orc_profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where m.org_id = org and public.orc_is_staff(org)
  order by m.created_at
$$;

-- Cambio ruolo: solo owner/admin dell'org; il ruolo owner lo dà e lo toglie solo un owner;
-- l'ultimo owner non si può degradare; 'remove' toglie la membership.
create or replace function public.orc_set_member_role(org uuid, target uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me text := public.orc_member_role(org);
  old_role text;
  owners int;
begin
  if me is null or me not in ('owner','admin') then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if new_role not in ('owner','admin','artistic','production','section','viewer','remove') then
    raise exception 'ruolo non valido: %', new_role using errcode = '22023';
  end if;
  select m.role into old_role from public.orc_memberships m where m.org_id = org and m.user_id = target;
  if old_role is null then raise exception 'membro inesistente' using errcode = 'P0002'; end if;
  if (old_role = 'owner' or new_role = 'owner') and me <> 'owner' then
    raise exception 'solo un owner tocca il ruolo owner' using errcode = '42501';
  end if;
  if old_role = 'owner' and new_role <> 'owner' then
    select count(*) into owners from public.orc_memberships m where m.org_id = org and m.role = 'owner';
    if owners <= 1 then raise exception 'ultimo owner: non si può degradare' using errcode = '23514'; end if;
  end if;
  if new_role = 'remove' then
    delete from public.orc_memberships m where m.org_id = org and m.user_id = target;
  else
    update public.orc_memberships m set role = new_role where m.org_id = org and m.user_id = target;
  end if;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (org, auth.uid(), 'membership.role', 'orc_memberships', target::text,
          jsonb_build_object('from', old_role, 'to', new_role));
end $$;

-- Aggiunta membro per email: l'utente deve già esistere in auth.users (ha fatto almeno un login).
create or replace function public.orc_add_member_by_email(org uuid, member_email text, new_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me text := public.orc_member_role(org);
  uid uuid;
begin
  if me is null or me not in ('owner','admin') then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if new_role not in ('admin','artistic','production','section','viewer') then
    raise exception 'ruolo non valido: %', new_role using errcode = '22023';
  end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(member_email)) limit 1;
  if uid is null then
    raise exception 'nessun account con questa email: deve prima accedere una volta' using errcode = 'P0002';
  end if;
  insert into public.orc_memberships (org_id, user_id, role) values (org, uid, new_role)
  on conflict (org_id, user_id) do update set role = excluded.role;
  insert into public.orc_profiles (id) values (uid) on conflict do nothing;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (org, auth.uid(), 'membership.add', 'orc_memberships', uid::text, jsonb_build_object('role', new_role));
  return uid;
end $$;

-- Bootstrap: crea l'org e il suo owner. SOLO service_role (ops/orc-bootstrap.sh).
create or replace function public.orc_bootstrap_org(org_name text, org_slug text, owner_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  oid uuid;
begin
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(owner_email)) limit 1;
  if uid is null then raise exception 'nessun account con questa email' using errcode = 'P0002'; end if;
  insert into public.orc_organizations (name, slug, created_by) values (org_name, org_slug, uid) returning id into oid;
  insert into public.orc_memberships (org_id, user_id, role) values (oid, uid, 'owner');
  insert into public.orc_profiles (id) values (uid) on conflict do nothing;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id)
  values (oid, uid, 'org.bootstrap', 'orc_organizations', oid::text);
  return oid;
end $$;

revoke all on function public.orc_ensure_profile() from public, anon;
revoke all on function public.orc_my_memberships() from public, anon;
revoke all on function public.orc_org_members(uuid) from public, anon;
revoke all on function public.orc_set_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.orc_add_member_by_email(uuid, text, text) from public, anon;
revoke all on function public.orc_bootstrap_org(text, text, text) from public, anon, authenticated;
-- service_role: gli script operativi e i worker devono poterle chiamare (regola del repo)
grant execute on function public.orc_ensure_profile() to authenticated, service_role;
grant execute on function public.orc_my_memberships() to authenticated, service_role;
grant execute on function public.orc_org_members(uuid) to authenticated, service_role;
grant execute on function public.orc_set_member_role(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.orc_add_member_by_email(uuid, text, text) to authenticated, service_role;
grant execute on function public.orc_bootstrap_org(text, text, text) to service_role;
