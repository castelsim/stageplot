-- 0045_orc_matching.sql — Orchestre, lotto 4: il matching.
--
-- Il punteggio lo calcola il client (orchestre/src/domain/matching.js: puro, deterministico, testato,
-- spiegabile). Il database fa tre cose: (1) raccoglie i FATTI per ogni candidato in una sola lettura
-- (orc_matching_candidates: strumenti, competenze, repertorio, storico, rinunce, carico, conflitti,
-- esclusioni); (2) conserva i pesi versionati per organizzazione (orc_matching_rulesets); (3) salva uno
-- SNAPSHOT di ogni corsa con i risultati e le spiegazioni (orc_matching_runs/results), così quando si
-- convoca si sa che cosa ha proposto il sistema e che cosa ha deciso l'umano (override con motivo).
-- Idempotente.

create table if not exists public.orc_matching_rulesets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  version integer not null,
  name text not null default '',
  weights jsonb not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, version)
);
create index if not exists orc_matching_rulesets_org_idx on public.orc_matching_rulesets(org_id, active, version desc);

create table if not exists public.orc_matching_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  role_id uuid not null references public.orc_staffing_roles(id) on delete cascade,
  ruleset_id uuid references public.orc_matching_rulesets(id) on delete set null,
  ruleset_version integer,
  weights jsonb not null,
  engine_version text not null default '1',
  ran_by uuid references auth.users(id) on delete set null,
  at timestamptz not null default now()
);
create index if not exists orc_matching_runs_role_idx on public.orc_matching_runs(role_id, at desc);

create table if not exists public.orc_matching_results (
  run_id uuid not null references public.orc_matching_runs(id) on delete cascade,
  musician_id uuid not null references public.orc_musicians(id) on delete cascade,
  eligible boolean not null,
  score integer not null,
  rank integer not null,
  reasons jsonb not null default '[]'::jsonb,
  missing jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  override_rank integer,
  override_reason text not null default '',
  override_by uuid,
  override_at timestamptz,
  primary key (run_id, musician_id)
);

grant select on public.orc_matching_rulesets, public.orc_matching_runs, public.orc_matching_results to authenticated;
grant all on public.orc_matching_rulesets, public.orc_matching_runs, public.orc_matching_results to service_role;

alter table public.orc_matching_rulesets enable row level security;
alter table public.orc_matching_runs enable row level security;
alter table public.orc_matching_results enable row level security;

create or replace function public.orc_run_org(rid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select r.org_id from public.orc_matching_runs r where r.id = rid
$$;
revoke all on function public.orc_run_org(uuid) from public, anon;
grant execute on function public.orc_run_org(uuid) to authenticated, service_role;

drop policy if exists orc_matching_rulesets_staff on public.orc_matching_rulesets;
create policy orc_matching_rulesets_staff on public.orc_matching_rulesets for select using (public.orc_is_staff(org_id));
drop policy if exists orc_matching_runs_staff on public.orc_matching_runs;
create policy orc_matching_runs_staff on public.orc_matching_runs for select using (public.orc_is_staff(org_id));
drop policy if exists orc_matching_results_staff on public.orc_matching_results;
create policy orc_matching_results_staff on public.orc_matching_results for select using (public.orc_is_staff(public.orc_run_org(run_id)));
-- scritture: solo via RPC

-- ---------------------------------------------------------------- pesi
-- Salva una nuova versione dei pesi e la rende attiva. Le vecchie restano (le corse le citano).
create or replace function public.orc_save_ruleset(org uuid, ruleset_name text, weights jsonb)
returns public.orc_matching_rulesets language plpgsql security definer set search_path = public as $$
declare v int; r public.orc_matching_rulesets;
begin
  if not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if jsonb_typeof(weights) <> 'object' then raise exception 'weights deve essere un oggetto' using errcode = '22023'; end if;
  select coalesce(max(x.version), 0) + 1 into v from public.orc_matching_rulesets x where x.org_id = org;
  update public.orc_matching_rulesets x set active = false where x.org_id = org and x.active;
  insert into public.orc_matching_rulesets (org_id, version, name, weights, active, created_by)
  values (org, v, coalesce(ruleset_name, ''), weights, true, auth.uid()) returning * into r;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (org, auth.uid(), 'matching.ruleset', 'orc_matching_rulesets', r.id::text, jsonb_build_object('version', v));
  return r;
end $$;

-- ---------------------------------------------------------------- i fatti per il matching
-- Per un ruolo di una produzione: il contesto (repertorio, compositori, direttore, cliente, tipologia,
-- date, requisiti del ruolo) e, per ogni musicista non archiviato dell'org, i fatti che il motore pesa.
create or replace function public.orc_matching_candidates(production uuid, role uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.orc_productions; r public.orc_staffing_roles; org uuid;
  p_title text; p_start timestamptz; p_end timestamptz;
  ctx jsonb; cands jsonb;
begin
  select * into p from public.orc_productions x where x.id = production;
  if p.id is null then raise exception 'produzione inesistente' using errcode = 'P0002'; end if;
  org := p.org_id;
  if not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  select * into r from public.orc_staffing_roles x where x.id = role and x.production_id = production;
  if r.id is null then raise exception 'ruolo inesistente' using errcode = 'P0002'; end if;
  p_title := lower(regexp_replace(trim(p.title), '\s*\d{4}\s*$', ''));
  select min(d.starts_at), max(coalesce(d.ends_at, d.starts_at)) into p_start, p_end from public.orc_production_dates d where d.production_id = production;

  ctx := jsonb_build_object(
    'production', jsonb_build_object('id', p.id, 'title', p.title, 'series', p_title, 'conductor', p.conductor, 'client', p.client, 'kind', p.kind,
      'starts_at', p_start, 'ends_at', p_end,
      'repertoire', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'name', x.name)) from public.orc_production_repertoire pr join public.orc_repertoire x on x.id = pr.repertoire_id where pr.production_id = production), '[]'::jsonb)),
    'role', jsonb_build_object('id', r.id, 'name', r.name, 'instrument_code', r.instrument_code, 'part', r.part, 'min_level', r.min_level, 'seats', r.seats,
      'open_slots', (select count(*) from public.orc_staffing_slots s where s.role_id = r.id and s.status = 'open'),
      'requirements', coalesce((select jsonb_agg(jsonb_build_object('skill_code', q.skill_code, 'required', q.required, 'min_level', q.min_level)) from public.orc_role_requirements q where q.role_id = r.id), '[]'::jsonb)));

  with done_prods as (
    select x.id, lower(regexp_replace(trim(x.title), '\s*\d{4}\s*$', '')) as series, x.conductor, x.client, x.kind,
      (select max(coalesce(d.ends_at, d.starts_at)) from public.orc_production_dates d where d.production_id = x.id) as ended,
      (select min(d.starts_at) from public.orc_production_dates d where d.production_id = x.id) as started
    from public.orc_productions x where x.org_id = org and x.id <> production and x.deleted_at is null
      and x.status in ('done','confirmed','running','complete')
  ),
  part as (
    select s.musician_id, dp.* from public.orc_staffing_slots s join done_prods dp on dp.id = s.production_id
    where s.status = 'confirmed' and s.musician_id is not null
  ),
  prep as (select pr.repertoire_id from public.orc_production_repertoire pr where pr.production_id = production),
  pcomp as (select x.id from public.orc_repertoire x join prep on prep.repertoire_id = x.id where x.kind = 'composer')
  select jsonb_agg(jsonb_build_object(
    'id', m.id, 'name', m.last_name || ' ' || m.first_name, 'status', m.status, 'city', m.city, 'province', m.province,
    'has_car', m.has_car, 'travel_ok', m.travel_ok, 'max_distance_km', m.max_distance_km,
    'instruments', coalesce((select jsonb_agg(jsonb_build_object('code', mi.instrument_code, 'level', mi.level, 'primary', mi.is_primary)) from public.orc_musician_instruments mi where mi.musician_id = m.id), '[]'::jsonb),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('code', ms.skill_code, 'level', ms.level, 'source', ms.source)) from public.orc_musician_skills ms where ms.musician_id = m.id), '[]'::jsonb),
    'repertoire', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'name', x.name, 'source', mr.source)) from public.orc_musician_repertoire mr join public.orc_repertoire x on x.id = mr.repertoire_id where mr.musician_id = m.id), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(t.tag) from public.orc_musician_tags t where t.musician_id = m.id), '[]'::jsonb),
    'n_collab', (select count(*) from part where part.musician_id = m.id),
    'n_same_series', (select count(*) from part where part.musician_id = m.id and part.series = p_title),
    'n_same_repertoire', (select count(distinct part.id) from part where part.musician_id = m.id and exists (select 1 from public.orc_production_repertoire pr2 where pr2.production_id = part.id and pr2.repertoire_id in (select repertoire_id from prep))),
    'n_same_composer_prod', (select count(distinct part.id) from part where part.musician_id = m.id and exists (select 1 from public.orc_production_repertoire pr2 where pr2.production_id = part.id and pr2.repertoire_id in (select id from pcomp))),
    'composer_declared', coalesce((select jsonb_agg(mr.source) from public.orc_musician_repertoire mr where mr.musician_id = m.id and mr.repertoire_id in (select id from pcomp)), '[]'::jsonb),
    'n_same_conductor', (select count(*) from part where part.musician_id = m.id and p.conductor <> '' and lower(part.conductor) = lower(p.conductor)),
    'n_same_client', (select count(*) from part where part.musician_id = m.id and p.client <> '' and lower(part.client) = lower(p.client)),
    'n_same_kind', (select count(*) from part where part.musician_id = m.id and part.kind = p.kind),
    'last_engagement', (select max(part.ended) from part where part.musician_id = m.id),
    'withdrawals', coalesce((select jsonb_agg(e.at order by e.at desc) from public.orc_slot_events e where e.musician_id = m.id and e.event = 'withdrew'), '[]'::jsonb),
    'recent_load', (select count(*) from public.orc_staffing_slots s join public.orc_productions x on x.id = s.production_id
        where s.musician_id = m.id and s.status = 'confirmed' and x.id <> production
          and exists (select 1 from public.orc_production_dates d where d.production_id = x.id and d.starts_at between now() - interval '60 days' and now() + interval '60 days')),
    'conflict', (p_start is not null and exists (select 1 from public.orc_staffing_slots s join public.orc_production_dates d on d.production_id = s.production_id
        where s.musician_id = m.id and s.status = 'confirmed' and s.production_id <> production
          and d.starts_at <= p_end and coalesce(d.ends_at, d.starts_at) >= p_start)),
    'in_production', exists (select 1 from public.orc_staffing_slots s where s.production_id = production and s.musician_id = m.id and s.status in ('confirmed','invited','reserve')),
    'excluded', (select coalesce(jsonb_agg(x.reason), '[]'::jsonb) from public.orc_musician_exclusions x where x.org_id = org and x.musician_id = m.id
        and (x.production_id is null or x.production_id = production) and (x.until is null or x.until >= current_date))
  ) order by m.last_name, m.first_name) into cands
  from public.orc_musicians m where m.org_id = org and m.deleted_at is null and m.status <> 'archived';

  return ctx || jsonb_build_object('candidates', coalesce(cands, '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- snapshot della corsa
-- results: [{musician_id, eligible, score, rank, reasons, missing, warnings}]
create or replace function public.orc_matching_save_run(production uuid, role uuid, weights jsonb, results jsonb, engine text default '1')
returns uuid language plpgsql security definer set search_path = public as $$
declare org uuid; rs public.orc_matching_rulesets; run uuid; x jsonb;
begin
  org := public.orc_production_org(production);
  if org is null or not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if not exists (select 1 from public.orc_staffing_roles r where r.id = role and r.production_id = production) then raise exception 'ruolo inesistente' using errcode = 'P0002'; end if;
  select * into rs from public.orc_matching_rulesets q where q.org_id = org and q.active order by q.version desc limit 1;
  insert into public.orc_matching_runs (org_id, production_id, role_id, ruleset_id, ruleset_version, weights, engine_version, ran_by)
  values (org, production, role, rs.id, rs.version, weights, coalesce(engine, '1'), auth.uid()) returning id into run;
  for x in select * from jsonb_array_elements(results) loop
    insert into public.orc_matching_results (run_id, musician_id, eligible, score, rank, reasons, missing, warnings)
    values (run, (x ->> 'musician_id')::uuid, coalesce((x ->> 'eligible')::boolean, false), coalesce((x ->> 'score')::int, 0),
            coalesce((x ->> 'rank')::int, 0), coalesce(x -> 'reasons', '[]'::jsonb), coalesce(x -> 'missing', '[]'::jsonb), coalesce(x -> 'warnings', '[]'::jsonb));
  end loop;
  return run;
end $$;

-- Override umano: una posizione decisa a mano, con il motivo. Resta nello snapshot e nel registro.
create or replace function public.orc_matching_override(run uuid, musician uuid, new_rank integer, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  org := public.orc_run_org(run);
  if org is null or not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if length(trim(coalesce(reason, ''))) < 3 then raise exception 'serve un motivo' using errcode = '22023'; end if;
  update public.orc_matching_results x set override_rank = new_rank, override_reason = trim(reason), override_by = auth.uid(), override_at = now()
  where x.run_id = run and x.musician_id = musician;
  if not found then raise exception 'risultato inesistente' using errcode = 'P0002'; end if;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (org, auth.uid(), 'matching.override', 'orc_matching_results', run::text, jsonb_build_object('musician_id', musician, 'rank', new_rank, 'reason', trim(reason)));
end $$;

revoke all on function public.orc_save_ruleset(uuid, text, jsonb), public.orc_matching_candidates(uuid, uuid),
  public.orc_matching_save_run(uuid, uuid, jsonb, jsonb, text), public.orc_matching_override(uuid, uuid, integer, text) from public, anon;
grant execute on function public.orc_save_ruleset(uuid, text, jsonb), public.orc_matching_candidates(uuid, uuid),
  public.orc_matching_save_run(uuid, uuid, jsonb, jsonb, text), public.orc_matching_override(uuid, uuid, integer, text) to authenticated, service_role;
