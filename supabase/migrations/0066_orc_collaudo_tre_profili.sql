-- Le correzioni del collaudo a tre profili (11/09): un committente, una musicista e il fornitore hanno
-- fatto il giro completo, dalla richiesta alla conferma. Qui quello che toccava il database.
--
--   · IL CONSENSO ALLE CONVOCAZIONI non lo guardava nessuno. L'informativa promette «le richieste
--     professionali arrivano solo se lo hai scelto», il musicista può revocare dalla sua area — e veniva
--     convocato lo stesso. Ora `orc_invite` (testo di 0046) salta chi ha un profilo con il consenso
--     spento, e `orc_matching_candidates` (testo di 0064) lo dice al motore, che lo mette fra chi non si
--     può convocare, con il motivo. Chi è stato inserito a mano dallo staff non ha un profilo: vale
--     l'accordo che ha con la società.
--   · IL COMMITTENTE, dopo aver accettato o rifiutato il preventivo, leggeva ancora «in lavorazione»:
--     `orc_my_client_requests` (testo di 0056) distingue accettata, non andata e chiusa, e porta
--     l'elenco dei posti chiesti — prima le righe dicevano «3 musicisti» senza dire quali.
--     Cambia il tipo restituito: si ricrea, stessi permessi.

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
    /* chi ha un profilo e ha scelto di non ricevere proposte non si convoca: l'informativa lo promette */
    if exists (select 1 from public.orc_musicians x join public.orc_musician_profiles pr on pr.id = x.profile_id
               where x.id = m and not pr.consent_requests) then continue; end if;
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
    'parts', to_jsonb(m.parts),
    'no_requests', coalesce((select not pr.consent_requests from public.orc_musician_profiles pr where pr.id = m.profile_id), false),
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

drop function if exists public.orc_my_client_requests();
create or replace function public.orc_my_client_requests()
returns table (id uuid, event_title text, event_when text, event_place text, status text, created_at timestamptz, org_name text, n_needed integer, formation_unknown boolean, slots_summary text)
language sql stable security definer set search_path = public as $$
  select r.id, r.event_title, r.event_when, r.event_place,
    case r.status when 'new' then 'ricevuta' when 'won' then 'accettata' when 'lost' then 'non andata' when 'closed' then 'chiusa' else 'in lavorazione' end,
    r.created_at, o.name,
    (select coalesce(sum(s.qty), 0)::int from public.orc_client_request_slots s where s.request_id = r.id and not s.covered),
    r.formation_unknown,
    coalesce((select string_agg(coalesce(nullif(trim(s.label), ''), s.instrument_code, 'posto') || case when s.qty > 1 then ' ×' || s.qty else '' end, ', ' order by s.sort)
       from public.orc_client_request_slots s where s.request_id = r.id and not s.covered), '')
  from public.orc_client_requests r join public.orc_organizations o on o.id = r.org_id
  where r.user_id = auth.uid()
  order by r.created_at desc
$$;

revoke all on function public.orc_my_client_requests() from public, anon;
grant execute on function public.orc_my_client_requests() to authenticated, service_role;
