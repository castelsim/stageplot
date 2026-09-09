-- 0047_orc_feedback.sql — Orchestre, lotto 6: storico e affidabilità.
--
-- Dopo una produzione lo staff registra, per ogni musicista confermato, che cosa è successo davvero
-- (presenza, puntualità, preparazione, qualità, professionalità, problemi) e un giudizio complessivo.
-- Gli indicatori aggregati NASCONO dagli eventi e dai feedback e portano sempre il numero di
-- osservazioni: un 5/5 su una sola produzione non è un 5/5 su venti. Gli eventi originali restano
-- (orc_slot_events, orc_invitation_events sono append-only): nessun punteggio li sovrascrive.
-- Il matching riceve anche tasso di risposta, valutazione verificata e assenze (orc_matching_candidates
-- rifatta). Idempotente.

create table if not exists public.orc_performance_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  musician_id uuid not null references public.orc_musicians(id) on delete cascade,
  slot_id uuid references public.orc_staffing_slots(id) on delete set null,
  attended boolean not null default true,
  punctuality integer,
  preparation integer,
  artistic integer,
  reading integer,
  professionalism integer,
  communication integer,
  collaboration integer,
  overall integer,
  rehire boolean,
  issues text not null default '',
  note text not null default '',
  author_id uuid references auth.users(id) on delete set null,
  at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_id, musician_id),
  constraint orc_pf_scores_chk check (
    (punctuality is null or punctuality between 1 and 5) and (preparation is null or preparation between 1 and 5) and
    (artistic is null or artistic between 1 and 5) and (reading is null or reading between 1 and 5) and
    (professionalism is null or professionalism between 1 and 5) and (communication is null or communication between 1 and 5) and
    (collaboration is null or collaboration between 1 and 5) and (overall is null or overall between 1 and 5))
);
create index if not exists orc_pf_mus_idx on public.orc_performance_feedback(musician_id, at desc);
create index if not exists orc_pf_prod_idx on public.orc_performance_feedback(production_id);

drop trigger if exists orc_pf_touch on public.orc_performance_feedback;
create trigger orc_pf_touch before update on public.orc_performance_feedback
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.orc_performance_feedback to authenticated;
grant all on public.orc_performance_feedback to service_role;
alter table public.orc_performance_feedback enable row level security;
drop policy if exists orc_pf_staff on public.orc_performance_feedback;
create policy orc_pf_staff on public.orc_performance_feedback
  for all using (public.orc_is_staff(org_id)) with check (public.orc_is_staff(org_id));

-- ---------------------------------------------------------------- indicatori aggregati (con il campione)
create or replace function public.orc_musician_stats(org uuid)
returns table (musician_id uuid, n_collab bigint, last_engagement timestamptz, n_feedback bigint, avg_overall numeric, avg_punctuality numeric,
  avg_professionalism numeric, n_absent bigint, n_rehire_no bigint, n_withdrawals bigint, n_invites bigint, n_replies bigint, n_no_reply bigint, reply_rate numeric)
language sql stable security definer set search_path = public as $$
  with done_prods as (
    select x.id, (select max(coalesce(d.ends_at, d.starts_at)) from public.orc_production_dates d where d.production_id = x.id) as ended
    from public.orc_productions x where x.org_id = org and x.deleted_at is null and x.status in ('done','confirmed','running','complete')
  ),
  part as (select s.musician_id, dp.id, dp.ended from public.orc_staffing_slots s join done_prods dp on dp.id = s.production_id where s.status = 'confirmed' and s.musician_id is not null),
  fb as (select f.musician_id, count(*) n, avg(f.overall) o, avg(f.punctuality) p, avg(f.professionalism) pr,
           count(*) filter (where not f.attended) absent, count(*) filter (where f.rehire = false) rehire_no
         from public.orc_performance_feedback f where f.org_id = org group by f.musician_id),
  wd as (select e.musician_id, count(*) n from public.orc_slot_events e join public.orc_productions x on x.id = e.production_id where x.org_id = org and e.event = 'withdrew' group by e.musician_id),
  inv as (select i.musician_id, count(*) filter (where i.status not in ('draft','cancelled')) n,
            count(*) filter (where i.status in ('available','partial','unavailable','confirmed','reserve','replaced','revoked') and i.responded_at is not null) replies,
            count(*) filter (where i.status in ('no_reply','expired')) no_reply
          from public.orc_invitations i where i.org_id = org group by i.musician_id)
  select m.id,
    (select count(*) from part where part.musician_id = m.id),
    (select max(part.ended) from part where part.musician_id = m.id),
    coalesce(fb.n, 0), round(fb.o, 2), round(fb.p, 2), round(fb.pr, 2), coalesce(fb.absent, 0), coalesce(fb.rehire_no, 0),
    coalesce(wd.n, 0), coalesce(inv.n, 0), coalesce(inv.replies, 0), coalesce(inv.no_reply, 0),
    case when coalesce(inv.n, 0) > 0 then round(coalesce(inv.replies, 0)::numeric / inv.n, 2) end
  from public.orc_musicians m
  left join fb on fb.musician_id = m.id
  left join wd on wd.musician_id = m.id
  left join inv on inv.musician_id = m.id
  where m.org_id = org and m.deleted_at is null and public.orc_is_staff(org)
$$;

-- Lo storico di un musicista: una riga per produzione a cui è stato assegnato o invitato.
create or replace function public.orc_musician_history(musician uuid)
returns table (production_id uuid, title text, status text, first_date timestamptz, role_name text, slot_status text,
  invitation_status text, withdrew boolean, feedback_overall integer, feedback_attended boolean, feedback_issues text, feedback_note text)
language sql stable security definer set search_path = public as $$
  select p.id, p.title, p.status, (select min(d.starts_at) from public.orc_production_dates d where d.production_id = p.id),
    coalesce(r.name, ri.name), s.status, i.status,
    exists (select 1 from public.orc_slot_events e where e.production_id = p.id and e.musician_id = musician and e.event = 'withdrew'),
    f.overall, f.attended, f.issues, f.note
  from public.orc_productions p
  left join public.orc_staffing_slots s on s.production_id = p.id and s.musician_id = musician
  left join public.orc_staffing_roles r on r.id = s.role_id
  left join lateral (select i2.* from public.orc_invitations i2 where i2.production_id = p.id and i2.musician_id = musician order by i2.created_at desc limit 1) i on true
  left join public.orc_staffing_roles ri on ri.id = i.role_id
  left join public.orc_performance_feedback f on f.production_id = p.id and f.musician_id = musician
  where p.deleted_at is null and p.org_id = public.orc_musician_org(musician) and public.orc_is_staff(p.org_id)
    and (s.id is not null or i.id is not null or exists (select 1 from public.orc_slot_events e where e.production_id = p.id and e.musician_id = musician))
  order by 4 desc nulls last
$$;

-- I musicisti confermati di una produzione, con il feedback se c'è: per la scheda Feedback.
create or replace function public.orc_production_roster(production uuid)
returns table (musician_id uuid, musician_name text, role_name text, seat_no integer, feedback_id uuid, attended boolean, punctuality integer,
  preparation integer, artistic integer, professionalism integer, overall integer, rehire boolean, issues text, note text)
language sql stable security definer set search_path = public as $$
  select m.id, m.last_name || ' ' || m.first_name, r.name, s.seat_no, f.id, f.attended, f.punctuality, f.preparation, f.artistic, f.professionalism, f.overall, f.rehire, f.issues, f.note
  from public.orc_staffing_slots s
  join public.orc_musicians m on m.id = s.musician_id
  join public.orc_staffing_roles r on r.id = s.role_id
  left join public.orc_performance_feedback f on f.production_id = production and f.musician_id = m.id
  where s.production_id = production and s.status = 'confirmed' and public.orc_is_staff(public.orc_production_org(production))
  order by r.sort, s.seat_no
$$;

revoke all on function public.orc_musician_stats(uuid), public.orc_musician_history(uuid), public.orc_production_roster(uuid) from public, anon;
grant execute on function public.orc_musician_stats(uuid), public.orc_musician_history(uuid), public.orc_production_roster(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- i fatti del matching, con affidabilità
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
      (select max(coalesce(d.ends_at, d.starts_at)) from public.orc_production_dates d where d.production_id = x.id) as ended
    from public.orc_productions x where x.org_id = org and x.id <> production and x.deleted_at is null
      and x.status in ('done','confirmed','running','complete')
  ),
  part as (
    select s.musician_id, dp.* from public.orc_staffing_slots s join done_prods dp on dp.id = s.production_id
    where s.status = 'confirmed' and s.musician_id is not null
  ),
  prep as (select pr.repertoire_id from public.orc_production_repertoire pr where pr.production_id = production),
  pcomp as (select x.id from public.orc_repertoire x join prep on prep.repertoire_id = x.id where x.kind = 'composer'),
  st as (select * from public.orc_musician_stats(org))
  select jsonb_agg(jsonb_build_object(
    'id', m.id, 'name', m.last_name || ' ' || m.first_name, 'status', m.status, 'city', m.city, 'province', m.province,
    'has_car', m.has_car, 'travel_ok', m.travel_ok, 'max_distance_km', m.max_distance_km,
    'instruments', coalesce((select jsonb_agg(jsonb_build_object('code', mi.instrument_code, 'level', mi.level, 'primary', mi.is_primary)) from public.orc_musician_instruments mi where mi.musician_id = m.id), '[]'::jsonb),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('code', ms.skill_code, 'level', ms.level, 'source', ms.source)) from public.orc_musician_skills ms where ms.musician_id = m.id), '[]'::jsonb),
    'repertoire', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'name', x.name, 'source', mr.source)) from public.orc_musician_repertoire mr join public.orc_repertoire x on x.id = mr.repertoire_id where mr.musician_id = m.id), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(t.tag) from public.orc_musician_tags t where t.musician_id = m.id), '[]'::jsonb),
    'n_collab', coalesce(st.n_collab, 0),
    'n_same_series', (select count(*) from part where part.musician_id = m.id and part.series = p_title),
    'n_same_repertoire', (select count(distinct part.id) from part where part.musician_id = m.id and exists (select 1 from public.orc_production_repertoire pr2 where pr2.production_id = part.id and pr2.repertoire_id in (select repertoire_id from prep))),
    'n_same_composer_prod', (select count(distinct part.id) from part where part.musician_id = m.id and exists (select 1 from public.orc_production_repertoire pr2 where pr2.production_id = part.id and pr2.repertoire_id in (select id from pcomp))),
    'composer_declared', coalesce((select jsonb_agg(mr.source) from public.orc_musician_repertoire mr where mr.musician_id = m.id and mr.repertoire_id in (select id from pcomp)), '[]'::jsonb),
    'n_same_conductor', (select count(*) from part where part.musician_id = m.id and p.conductor <> '' and lower(part.conductor) = lower(p.conductor)),
    'n_same_client', (select count(*) from part where part.musician_id = m.id and p.client <> '' and lower(part.client) = lower(p.client)),
    'n_same_kind', (select count(*) from part where part.musician_id = m.id and part.kind = p.kind),
    'last_engagement', st.last_engagement,
    'withdrawals', coalesce((select jsonb_agg(e.at order by e.at desc) from public.orc_slot_events e where e.musician_id = m.id and e.event = 'withdrew'), '[]'::jsonb),
    'n_feedback', coalesce(st.n_feedback, 0), 'avg_overall', st.avg_overall, 'n_absent', coalesce(st.n_absent, 0), 'n_rehire_no', coalesce(st.n_rehire_no, 0),
    'n_invites', coalesce(st.n_invites, 0), 'n_replies', coalesce(st.n_replies, 0), 'n_no_reply', coalesce(st.n_no_reply, 0), 'reply_rate', st.reply_rate,
    'recent_load', (select count(*) from public.orc_staffing_slots s join public.orc_productions x on x.id = s.production_id
        where s.musician_id = m.id and s.status = 'confirmed' and x.id <> production
          and exists (select 1 from public.orc_production_dates d where d.production_id = x.id and d.starts_at between now() - interval '60 days' and now() + interval '60 days')),
    'conflict', (p_start is not null and exists (select 1 from public.orc_staffing_slots s join public.orc_production_dates d on d.production_id = s.production_id
        where s.musician_id = m.id and s.status = 'confirmed' and s.production_id <> production
          and d.starts_at <= p_end and coalesce(d.ends_at, d.starts_at) >= p_start)),
    'in_production', exists (select 1 from public.orc_staffing_slots s where s.production_id = production and s.musician_id = m.id and s.status in ('confirmed','invited','reserve')),
    'invited_here', exists (select 1 from public.orc_invitations i where i.production_id = production and i.role_id = role and i.musician_id = m.id and i.status in ('draft','sent','viewed','available','partial','reserve')),
    'declined_here', exists (select 1 from public.orc_invitations i where i.production_id = production and i.musician_id = m.id and i.status in ('unavailable','no_reply','expired')),
    'excluded', (select coalesce(jsonb_agg(x.reason), '[]'::jsonb) from public.orc_musician_exclusions x where x.org_id = org and x.musician_id = m.id
        and (x.production_id is null or x.production_id = production) and (x.until is null or x.until >= current_date))
  ) order by m.last_name, m.first_name) into cands
  from public.orc_musicians m left join st on st.musician_id = m.id
  where m.org_id = org and m.deleted_at is null and m.status <> 'archived';

  return ctx || jsonb_build_object('candidates', coalesce(cands, '[]'::jsonb));
end $$;
