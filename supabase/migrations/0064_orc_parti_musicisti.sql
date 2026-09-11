-- Le parti che un musicista sa coprire: fila, prima parte, solista.
--
-- Un ruolo dell'organico ha la sua parte (`orc_staffing_roles.part`, 0044): «Violini primi, prima parte».
-- Ma nessun dato diceva chi la prima parte la fa: il matching proponeva per un posto di spalla chiunque
-- suonasse il violino, e lo staff se lo ricordava a memoria (nei dati demo, con un tag «prima parte»).
--
--   · `parts` sul profilo (lo dichiara il musicista) e sulla scheda (lo tiene lo staff), con gli stessi
--     codici dei ruoli: 'tutti' (fila), 'principal' (prima parte), 'solo' (solista);
--   · `orc_application_accept` (testo di 0057) copia le parti dal profilo quando crea la scheda, e le
--     riempie su una scheda che già c'era solo se lì erano vuote: quello che ha scritto lo staff resta;
--   · `orc_matching_candidates` (testo di 0047) le passa al motore, che avvisa se il ruolo chiede una
--     parte che il candidato non ha indicato. Il punteggio non cambia: decide chi legge il perché.

alter table public.orc_musician_profiles add column if not exists parts text[] not null default '{}';
alter table public.orc_musician_profiles drop constraint if exists orc_musician_profiles_parts_chk;
alter table public.orc_musician_profiles add constraint orc_musician_profiles_parts_chk check (parts <@ array['tutti','principal','solo']::text[]);

alter table public.orc_musicians add column if not exists parts text[] not null default '{}';
alter table public.orc_musicians drop constraint if exists orc_musicians_parts_chk;
alter table public.orc_musicians add constraint orc_musicians_parts_chk check (parts <@ array['tutti','principal','solo']::text[]);

create or replace function public.orc_application_accept(app uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.orc_applications; p public.orc_musician_profiles; mid uuid; org uuid; vmail text;
begin
  select * into a from public.orc_applications x where x.id = app;
  if a.id is null then raise exception 'candidatura inesistente' using errcode = 'P0002'; end if;
  if a.musician_id is not null then return a.musician_id; end if;
  org := a.org_id;
    select * into p from public.orc_musician_profiles x where x.id = a.profile_id;
    /* AUDIT 10/09 — l'identità non si dichiara, si dimostra. `p.email` è un campo che l'utente
       scrive da sé (policy orc_mp_own, grant update): chiunque poteva metterci l'email di un
       musicista già in rubrica, candidarsi con un invito, e prendersi la sua riga — e con quella
       convocazioni, note dello staff e compensi, perché orc_my_invitations/_engagements/_respond_mine
       si agganciano a orc_musicians.user_id. Qui vale solo l'email con cui ha fatto l'accesso, come
       già fa orc_link_my_musician_rows. Chi è in rubrica con un altro indirizzo non si collega da
       solo: entra come riga nuova, e l'unione la decide una persona. */
    select u.email into vmail from auth.users u where u.id = p.user_id;
    select m.id into mid from public.orc_musicians m where m.org_id = org and m.deleted_at is null
      and (m.user_id = p.user_id or (coalesce(vmail, '') <> '' and lower(m.email) = lower(vmail))) limit 1;
    if mid is null then
      /* L'indirizzo dichiarato può essere già in rubrica su un'altra persona — è proprio il caso che
         il controllo qui sopra non lascia più passare. Senza questo blocco l'utente vedrebbe il
         23505 nudo dell'indice unico; e chi si è davvero registrato con un altro account merita di
         sapere che deve farsi collegare da una persona, non un errore di database. */
      begin
        insert into public.orc_musicians (org_id, user_id, profile_id, first_name, last_name, email, phone, city, province, area, has_car, max_distance_km, travel_ok, tour_ok, status, source, bio, parts, created_by)
        values (org, p.user_id, p.id, p.first_name, p.last_name, p.email, p.phone, p.city, p.province, p.area, p.has_car, p.max_distance_km, p.travel_ok, p.tour_ok, 'active', 'application', p.bio, p.parts, auth.uid())
        returning id into mid;
      exception when unique_violation then
        raise exception 'l''indirizzo dichiarato è già in elenco su un''altra scheda: chiedi a chi organizza di collegarti' using errcode = '23505';
      end;
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
      update public.orc_musicians m set user_id = coalesce(m.user_id, p.user_id), profile_id = coalesce(m.profile_id, p.id), status = case when m.status in ('archived','suspended') then 'active' else m.status end,
        parts = case when m.parts = '{}' then p.parts else m.parts end where m.id = mid;
    end if;
    update public.orc_applications x set musician_id = mid where x.id = app;
  return mid;
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
