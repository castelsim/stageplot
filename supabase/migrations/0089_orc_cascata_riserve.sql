-- 0089_orc_cascata_riserve.sql — Orchestre, lotto Q (16/11/2026): cascata di riserve per posto e squadre tipo.
--
-- IL PROBLEMA (studio dell'app concerti, I1 e I2). Ogni rifiuto obbliga a scegliere e invitare il successivo a mano.
-- Simone (16/11): «sì» a una lista ordinata per posto con «Chiama il prossimo» a un tocco, SEMPRE a mano, MAI in automatico.
--
-- LA SOLUZIONE.
--   · `orc_role_candidates`: per ogni ruolo di una produzione, la lista ORDINATA di musicisti da chiamare. Non è un
--     invito: non parte nessuna email. Chi è in lista viene chiamato solo quando lo staff preme «Chiama il prossimo»,
--     che usa l'`orc_invite` di sempre (stesso link, stessa email, stessa storia). Lo stato di ognuno (da chiamare,
--     in corso, rifiutato, senza risposta, confermato…) NON si salva: lo ricava `orc_cascade_list` dagli inviti.
--   · `orc_teams` + `orc_team_members`: la «squadra tipo» = per ruolo, una lista ordinata di musicisti del pool, legata
--     (facoltativamente) a un modello di organico con `template_key`. Si salva da una produzione e si importa in
--     un'altra; si rinomina, duplica, cancella.
--   Nessuna scrittura diretta dal client: solo funzioni, che ricontrollano lo staff. Nessun invio, nessun automatismo.
--   Non applicata: la lancia Simone (`supabase db push`).

-- ---------------------------------------------------------------- tabelle
create table if not exists public.orc_role_candidates (
  role_id uuid not null references public.orc_staffing_roles(id) on delete cascade,
  musician_id uuid not null references public.orc_musicians(id) on delete cascade,
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  position integer not null,
  source text not null default 'manual',
  created_by uuid,   -- senza riferimento all'account (come l'audit): una pulizia di account non deve toccare le liste
  created_at timestamptz not null default now(),
  primary key (role_id, musician_id),
  constraint orc_role_candidates_source_chk check (source in ('manual','matching','team','production')),
  constraint orc_role_candidates_pos_chk check (position between 1 and 500)
);
create index if not exists orc_role_candidates_prod_idx on public.orc_role_candidates(production_id, role_id, position);
create index if not exists orc_role_candidates_mus_idx on public.orc_role_candidates(musician_id);

create table if not exists public.orc_teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  name text not null,
  template_key text not null default '',
  created_by uuid,   -- senza riferimento all'account (come l'audit): una pulizia di account non deve toccare le liste
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orc_teams_name_chk check (length(trim(name)) between 1 and 80),
  constraint orc_teams_key_chk check (template_key ~ '^[a-z0-9_]{0,40}$')
);
create index if not exists orc_teams_org_idx on public.orc_teams(org_id, name);
drop trigger if exists orc_teams_touch on public.orc_teams;
create trigger orc_teams_touch before update on public.orc_teams for each row execute function public.touch_updated_at();

create table if not exists public.orc_team_members (
  team_id uuid not null references public.orc_teams(id) on delete cascade,
  instrument_code text references public.orc_instruments(code),
  role_name text not null,
  musician_id uuid not null references public.orc_musicians(id) on delete cascade,
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  position integer not null,
  primary key (team_id, role_name, musician_id),
  constraint orc_team_members_name_chk check (length(trim(role_name)) between 1 and 120),
  constraint orc_team_members_pos_chk check (position between 1 and 500)
);
create index if not exists orc_team_members_mus_idx on public.orc_team_members(musician_id);

-- ---------------------------------------------------------------- grant e RLS: lettura allo staff, scrittura solo da funzioni
grant select on public.orc_role_candidates, public.orc_teams, public.orc_team_members to authenticated;
grant all on public.orc_role_candidates, public.orc_teams, public.orc_team_members to service_role;
alter table public.orc_role_candidates enable row level security;
alter table public.orc_teams enable row level security;
alter table public.orc_team_members enable row level security;
drop policy if exists orc_role_candidates_staff_select on public.orc_role_candidates;
create policy orc_role_candidates_staff_select on public.orc_role_candidates for select using (public.orc_is_staff(org_id));
drop policy if exists orc_teams_staff_select on public.orc_teams;
create policy orc_teams_staff_select on public.orc_teams for select using (public.orc_is_staff(org_id));
drop policy if exists orc_team_members_staff_select on public.orc_team_members;
create policy orc_team_members_staff_select on public.orc_team_members for select using (public.orc_is_staff(org_id));

-- ---------------------------------------------------------------- cascata: sostituire la lista di un ruolo (interna)
-- Senza controllo di ruolo: la chiamano solo le funzioni qui sotto, che l'hanno già fatto. Chiusa a tutti i client.
create or replace function public.orc_cascade_replace_internal(role uuid, musicians uuid[], src text, actor uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r public.orc_staffing_roles; org uuid; ids uuid[];
begin
  select * into r from public.orc_staffing_roles x where x.id = role;
  if r.id is null then raise exception 'ruolo inesistente' using errcode = 'P0002'; end if;
  org := public.orc_production_org(r.production_id);
  -- solo musicisti dell'organizzazione, non archiviati, senza doppioni, nell'ordine dato
  select coalesce(array_agg(u.mid order by u.first_pos), '{}') into ids from (
    select t.mid, min(t.ord) as first_pos from unnest(coalesce(musicians, '{}')) with ordinality as t(mid, ord)
    where exists (select 1 from public.orc_musicians m where m.id = t.mid and m.org_id = org and m.deleted_at is null and m.status <> 'archived')
    group by t.mid) u;
  if coalesce(array_length(ids, 1), 0) > 200 then raise exception 'troppe persone in lista (massimo 200)' using errcode = '22023'; end if;
  delete from public.orc_role_candidates c where c.role_id = role and not (c.musician_id = any(ids));
  insert into public.orc_role_candidates (role_id, musician_id, org_id, production_id, position, source, created_by)
  select role, t.mid, org, r.production_id, t.ord::int, src, actor from unnest(ids) with ordinality as t(mid, ord)
  on conflict (role_id, musician_id) do update set position = excluded.position, source = excluded.source;
  return coalesce(array_length(ids, 1), 0);
end $$;
revoke all on function public.orc_cascade_replace_internal(uuid, uuid[], text, uuid) from public, anon, authenticated;
grant execute on function public.orc_cascade_replace_internal(uuid, uuid[], text, uuid) to service_role;

-- La lista ordinata di un ruolo: sostituisce quella di prima (ordine = ordine dell'array).
create or replace function public.orc_cascade_set(role uuid, musicians uuid[], src text default 'manual')
returns integer language plpgsql security definer set search_path = public as $$
declare pid uuid; org uuid; n int;
begin
  select r.production_id into pid from public.orc_staffing_roles r where r.id = role;
  org := public.orc_production_org(pid);
  if org is null or not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if src not in ('manual','matching') then raise exception 'origine non valida' using errcode = '22023'; end if;
  n := public.orc_cascade_replace_internal(role, musicians, src, auth.uid());
  return n;
end $$;
revoke all on function public.orc_cascade_set(uuid, uuid[], text) from public, anon;
grant execute on function public.orc_cascade_set(uuid, uuid[], text) to authenticated, service_role;

-- La lista di tutti i ruoli di una produzione, con lo stato di ognuno ricavato dagli inviti e dai posti.
--   confermato · in_corso (invito vivo: bozza, inviato, visto, disponibile, parziale, riserva) · rifiutato ·
--   senza_risposta · gia_chiamato (annullato, revocato, sostituito) · archiviato · da_chiamare
create or replace function public.orc_cascade_list(production uuid)
returns table (role_id uuid, musician_id uuid, musician_name text, pos integer, source text, state text, invitation_id uuid, invitation_status text)
language sql stable security definer set search_path = public as $$
  select c.role_id, c.musician_id, m.last_name || ' ' || m.first_name, c.position, c.source,
    case
      when m.deleted_at is not null or m.status = 'archived' then 'archiviato'
      when i.status = 'confirmed' or exists (select 1 from public.orc_staffing_slots s where s.role_id = c.role_id and s.musician_id = c.musician_id and s.status = 'confirmed') then 'confermato'
      when i.status in ('draft','sent','viewed','available','partial','reserve') then 'in_corso'
      when i.status = 'unavailable' then 'rifiutato'
      when i.status in ('no_reply','expired') then 'senza_risposta'
      when i.status in ('cancelled','revoked','replaced') then 'gia_chiamato'
      else 'da_chiamare'
    end,
    i.id, i.status
  from public.orc_role_candidates c
  join public.orc_musicians m on m.id = c.musician_id
  left join lateral (select x.id, x.status from public.orc_invitations x where x.role_id = c.role_id and x.musician_id = c.musician_id order by x.created_at desc limit 1) i on true
  where c.production_id = production and public.orc_is_staff(c.org_id)
  order by c.role_id, c.position
$$;
revoke all on function public.orc_cascade_list(uuid) from public, anon;
grant execute on function public.orc_cascade_list(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- squadre tipo
create or replace function public.orc_teams_list(org uuid)
returns table (id uuid, name text, template_key text, roles bigint, people bigint, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.template_key,
    (select count(distinct m.role_name) from public.orc_team_members m where m.team_id = t.id),
    (select count(distinct m.musician_id) from public.orc_team_members m where m.team_id = t.id),
    t.updated_at
  from public.orc_teams t where t.org_id = org and public.orc_is_staff(org) order by t.name, t.created_at
$$;
revoke all on function public.orc_teams_list(uuid) from public, anon;
grant execute on function public.orc_teams_list(uuid) to authenticated, service_role;

create or replace function public.orc_team_detail(team uuid)
returns table (role_name text, instrument_code text, pos integer, musician_id uuid, musician_name text, archived boolean)
language sql stable security definer set search_path = public as $$
  select m.role_name, m.instrument_code, m.position, m.musician_id, x.last_name || ' ' || x.first_name, (x.deleted_at is not null or x.status = 'archived')
  from public.orc_team_members m join public.orc_musicians x on x.id = m.musician_id
  where m.team_id = team and public.orc_is_staff(m.org_id)
  order by m.role_name, m.position
$$;
revoke all on function public.orc_team_detail(uuid) from public, anon;
grant execute on function public.orc_team_detail(uuid) to authenticated, service_role;

-- «Salva come squadra tipo» dalla produzione: per ogni ruolo, prima chi è confermato (per posto), poi la lista della
-- cascata nel suo ordine, poi chiunque sia stato invitato e non è ancora dentro. Mai persone archiviate.
create or replace function public.orc_team_save(production uuid, team_name text, key text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare org uuid; tid uuid; r record;
begin
  org := public.orc_production_org(production);
  if org is null or not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if length(trim(coalesce(team_name, ''))) not between 1 and 80 then raise exception 'serve un nome (massimo 80 caratteri)' using errcode = '22023'; end if;
  if (select count(*) from public.orc_teams t where t.org_id = org) >= 50 then raise exception 'troppe squadre tipo (massimo 50): cancellane qualcuna' using errcode = '22023'; end if;
  insert into public.orc_teams (org_id, name, template_key, created_by) values (org, trim(team_name), coalesce(key, ''), auth.uid()) returning id into tid;
  for r in select * from public.orc_staffing_roles x where x.production_id = production loop
    insert into public.orc_team_members (team_id, instrument_code, role_name, musician_id, org_id, position)
    select tid, r.instrument_code, r.name, q.mid, org, (row_number() over (order by q.grp, q.ord))::int
    from (
      select distinct on (mid) mid, grp, ord from (
        select s.musician_id as mid, 1 as grp, s.seat_no as ord from public.orc_staffing_slots s where s.role_id = r.id and s.status = 'confirmed' and s.musician_id is not null
        union all select i.musician_id, 1, 1000 + extract(epoch from i.created_at)::int from public.orc_invitations i where i.role_id = r.id and i.status = 'confirmed'
        union all select c.musician_id, 2, c.position from public.orc_role_candidates c where c.role_id = r.id
        union all select i.musician_id, 3, extract(epoch from i.created_at)::int from public.orc_invitations i where i.role_id = r.id and i.status in ('reserve','available','partial','sent','viewed','draft')
      ) u order by mid, grp, ord
    ) q
    where exists (select 1 from public.orc_musicians m where m.id = q.mid and m.org_id = org and m.deleted_at is null and m.status <> 'archived')
    limit 500;
  end loop;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (org, auth.uid(), 'team.save', 'orc_teams', tid::text, jsonb_build_object('production', production, 'template_key', coalesce(key, '')));
  return tid;
end $$;
revoke all on function public.orc_team_save(uuid, text, text) from public, anon;
grant execute on function public.orc_team_save(uuid, text, text) to authenticated, service_role;

-- «Importa nella produzione»: ogni ruolo trova il suo gruppo nella squadra per nome (senza maiuscole) e strumento;
-- se il nome non c'è ma lo strumento ha UN solo ruolo da una parte e dall'altra, si abbinano per strumento.
-- Sostituisce la lista dei ruoli abbinati; gli altri non si toccano. Non invia niente. Torna i ruoli riempiti.
create or replace function public.orc_team_apply(team uuid, production uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare t public.orc_teams; r record; grp text; n int := 0; ids uuid[];
begin
  select * into t from public.orc_teams x where x.id = team;
  if t.id is null or not public.orc_is_staff(t.org_id) or public.orc_production_org(production) is distinct from t.org_id then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  for r in select * from public.orc_staffing_roles x where x.production_id = production loop
    grp := (select m.role_name from public.orc_team_members m where m.team_id = team and lower(trim(m.role_name)) = lower(trim(r.name)) and m.instrument_code is not distinct from r.instrument_code limit 1);
    if grp is null then grp := (select m.role_name from public.orc_team_members m where m.team_id = team and lower(trim(m.role_name)) = lower(trim(r.name)) limit 1); end if;
    if grp is null and r.instrument_code is not null
       and (select count(*) from public.orc_staffing_roles y where y.production_id = production and y.instrument_code = r.instrument_code) = 1
       and (select count(distinct m.role_name) from public.orc_team_members m where m.team_id = team and m.instrument_code = r.instrument_code) = 1 then
      grp := (select m.role_name from public.orc_team_members m where m.team_id = team and m.instrument_code = r.instrument_code limit 1);
    end if;
    if grp is null then continue; end if;
    select coalesce(array_agg(m.musician_id order by m.position), '{}') into ids from public.orc_team_members m where m.team_id = team and m.role_name = grp;
    perform public.orc_cascade_replace_internal(r.id, ids, 'team', auth.uid());
    n := n + 1;
  end loop;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (t.org_id, auth.uid(), 'team.apply', 'orc_teams', team::text, jsonb_build_object('production', production, 'roles', n));
  return n;
end $$;
revoke all on function public.orc_team_apply(uuid, uuid) from public, anon;
grant execute on function public.orc_team_apply(uuid, uuid) to authenticated, service_role;

create or replace function public.orc_team_rename(team uuid, new_name text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.orc_teams;
begin
  select * into t from public.orc_teams x where x.id = team;
  if t.id is null or not public.orc_is_staff(t.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if length(trim(coalesce(new_name, ''))) not between 1 and 80 then raise exception 'serve un nome (massimo 80 caratteri)' using errcode = '22023'; end if;
  update public.orc_teams x set name = trim(new_name) where x.id = team;
end $$;
revoke all on function public.orc_team_rename(uuid, text) from public, anon;
grant execute on function public.orc_team_rename(uuid, text) to authenticated, service_role;

create or replace function public.orc_team_duplicate(team uuid, new_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.orc_teams; tid uuid;
begin
  select * into t from public.orc_teams x where x.id = team;
  if t.id is null or not public.orc_is_staff(t.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if length(trim(coalesce(new_name, ''))) not between 1 and 80 then raise exception 'serve un nome (massimo 80 caratteri)' using errcode = '22023'; end if;
  if (select count(*) from public.orc_teams x where x.org_id = t.org_id) >= 50 then raise exception 'troppe squadre tipo (massimo 50): cancellane qualcuna' using errcode = '22023'; end if;
  insert into public.orc_teams (org_id, name, template_key, created_by) values (t.org_id, trim(new_name), t.template_key, auth.uid()) returning id into tid;
  insert into public.orc_team_members (team_id, instrument_code, role_name, musician_id, org_id, position)
  select tid, m.instrument_code, m.role_name, m.musician_id, m.org_id, m.position from public.orc_team_members m where m.team_id = team;
  return tid;
end $$;
revoke all on function public.orc_team_duplicate(uuid, text) from public, anon;
grant execute on function public.orc_team_duplicate(uuid, text) to authenticated, service_role;

create or replace function public.orc_team_delete(team uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.orc_teams;
begin
  select * into t from public.orc_teams x where x.id = team;
  if t.id is null or not public.orc_is_staff(t.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  delete from public.orc_teams x where x.id = team;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (t.org_id, auth.uid(), 'team.delete', 'orc_teams', team::text, '{}'::jsonb);
end $$;
revoke all on function public.orc_team_delete(uuid) from public, anon;
grant execute on function public.orc_team_delete(uuid) to authenticated, service_role;
