-- Due decisioni del collaudo a tre profili (11/09).
--
-- 1. IL COMPENSO PER RUOLO. C'era un solo campo per tutta la produzione, `fee_note`, e ogni convocato lo
--    leggeva: la violinista vedeva anche il cachet del violoncello («250 € violino, 280 € violoncello»).
--    E il cachet messo nel preventivo non arrivava alla convocazione. Ora ogni ruolo ha il suo compenso:
--    la pagina del link (`orc_invitation_open`, testo di 0046), l'area del musicista (`orc_my_invitations`,
--    testo di 0048) e l'email mostrano quello del SUO ruolo, e solo se manca quello uguale per tutti.
--    Creando l'evento da una richiesta (`orc_production_from_request`, testo di 0061) il compenso di ogni
--    ruolo si prende dalla riga del preventivo con la stessa etichetta.
--
-- 2. IL PROFILO CHE NON ARRIVAVA. Dopo l'accettazione la scheda dello staff era una copia fatta in quel
--    momento: se il musicista cambiava città, telefono, disponibilità o parti, la società e il matching non
--    lo vedevano mai. Ora un trigger porta alla scheda i campi che il musicista ha cambiato — solo quelli:
--    le correzioni dello staff sugli altri restano. Nome ed email no: sono l'identità e il collegamento
--    all'account, e li tiene lo staff. Il trigger tocca solo le schede collegate a QUEL profilo, e il
--    profilo lo modifica solo il suo proprietario (policy orc_mp_own).

alter table public.orc_staffing_roles add column if not exists fee_note text not null default '';
alter table public.orc_staffing_roles drop constraint if exists orc_staffing_roles_fee_len;
alter table public.orc_staffing_roles add constraint orc_staffing_roles_fee_len check (char_length(fee_note) <= 200);

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
      'fee_note', coalesce(nullif(r.fee_note, ''), p.fee_note), 'conditions', p.conditions, 'dress_code', p.dress_code, 'description', p.description),
    'role', jsonb_build_object('name', r.name, 'part', r.part, 'notes', r.notes),
    'note_admin', i.note_admin,
    'dates', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'venue', d.venue, 'note', d.note, 'available', x.available) order by d.starts_at)
      from public.orc_invitation_dates x join public.orc_production_dates d on d.id = x.date_id where x.invitation_id = i.id), '[]'::jsonb));
end $$;

create or replace function public.orc_my_invitations()
returns table (id uuid, org_name text, production_id uuid, title text, role_name text, status text, deadline timestamptz, responded_at timestamptz,
  note_admin text, note_musician text, venue text, conductor text, fee_note text, first_date timestamptz,
  dates jsonb)
language sql stable security definer set search_path = public as $$
  select i.id, o.name, p.id, p.title, r.name, i.status, i.deadline, i.responded_at, i.note_admin, i.note_musician, p.venue, p.conductor, coalesce(nullif(r.fee_note, ''), p.fee_note),
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

create or replace function public.orc_production_from_request(req uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.orc_client_requests; q public.orc_quotes; pid uuid; s record; l record; n int := 0; tipo text; nota text;
begin
  select * into r from public.orc_client_requests x where x.id = req;
  if r.id is null or not public.orc_is_staff(r.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if r.production_id is not null then return r.production_id; end if;

  select * into q from public.orc_quotes x where x.request_id = req and x.status in ('accepted', 'sent')
  order by case when x.status = 'accepted' then 0 else 1 end, x.sent_at desc limit 1;

  /* le tipologie della richiesta e quelle della produzione non coincidono del tutto */
  tipo := case r.event_kind when 'concerto' then 'concerto' when 'registrazione' then 'registrazione' when 'teatro' then 'teatro'
                            when 'tour' then 'tour' when 'matrimonio' then 'evento' when 'evento' then 'evento' else 'altro' end;
  nota := concat_ws(E'\n',
    case when r.event_when <> '' then 'Quando: ' || r.event_when end,
    case when r.schedule <> '' then 'Orari: ' || r.schedule end,
    case when r.repertoire <> '' then 'Repertorio: ' || r.repertoire end,
    case when r.budget <> '' then 'Budget indicato dal cliente: ' || r.budget end,
    case when r.formation_unknown then 'Il cliente non sapeva che formazione scegliere: la formazione è quella del preventivo.' end,
    case when r.notes <> '' then 'Note del cliente: ' || r.notes end);

  insert into public.orc_productions (org_id, title, client, description, kind, venue, notes, status, stageplot_project_id, created_by)
  values (r.org_id, r.event_title, concat_ws(' · ', nullif(r.contact_name, ''), nullif(r.contact_company, '')),
          coalesce(q.description, ''), tipo, r.event_place, left(coalesce(nota, ''), 4000), 'planning', r.project_id, auth.uid())
  returning id into pid;

  /* i posti: quelli chiesti e non coperti dal cliente, con il loro strumento */
  for s in select * from public.orc_client_request_slots x where x.request_id = req and not x.covered order by x.sort loop
    n := n + 1;
    insert into public.orc_staffing_roles (production_id, instrument_code, name, seats, sort, fee_note)
    values (pid, s.instrument_code, coalesce(nullif(trim(s.label), ''), nullif(s.instrument_code, ''), 'Musicista'), greatest(1, least(200, s.qty)), n,
      /* il cachet del preventivo per quel posto: la riga con la stessa etichetta (il preventivo parte dai posti chiesti) */
      coalesce((select replace(to_char(x.fee_cents / 100.0, 'FM999999990.00'), '.', ',') || ' € a persona' from public.orc_quote_lines x
        where x.quote_id = q.id and x.fee_cents > 0 and lower(trim(x.label)) = lower(trim(s.label)) order by x.sort limit 1), ''));
  end loop;
  /* formazione da definire: si parte dalle righe del preventivo, senza strumento — si precisa dopo */
  if n = 0 and q.id is not null then
    for l in select * from public.orc_quote_lines x where x.quote_id = q.id order by x.sort loop
      n := n + 1;
      insert into public.orc_staffing_roles (production_id, name, seats, sort, fee_note)
      values (pid, coalesce(nullif(trim(l.label), ''), 'Musicista'), greatest(1, least(200, l.qty)), n,
        case when l.fee_cents > 0 then replace(to_char(l.fee_cents / 100.0, 'FM999999990.00'), '.', ',') || ' € a persona' else '' end);
    end loop;
  end if;

  update public.orc_client_requests x set production_id = pid where x.id = req;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (r.org_id, auth.uid(), 'request.production', 'orc_productions', pid::text, jsonb_build_object('request_id', req, 'ruoli', n));
  return pid;
end $$;

create or replace function public.orc_profile_to_musicians()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.phone, new.city, new.province, new.area, new.has_car, new.max_distance_km, new.travel_ok, new.tour_ok, new.parts, new.bio)
     is not distinct from (old.phone, old.city, old.province, old.area, old.has_car, old.max_distance_km, old.travel_ok, old.tour_ok, old.parts, old.bio) then
    return new;
  end if;
  update public.orc_musicians m set
    phone = case when new.phone is distinct from old.phone then new.phone else m.phone end,
    city = case when new.city is distinct from old.city then new.city else m.city end,
    province = case when new.province is distinct from old.province then new.province else m.province end,
    area = case when new.area is distinct from old.area then new.area else m.area end,
    has_car = case when new.has_car is distinct from old.has_car then new.has_car else m.has_car end,
    max_distance_km = case when new.max_distance_km is distinct from old.max_distance_km then new.max_distance_km else m.max_distance_km end,
    travel_ok = case when new.travel_ok is distinct from old.travel_ok then new.travel_ok else m.travel_ok end,
    tour_ok = case when new.tour_ok is distinct from old.tour_ok then new.tour_ok else m.tour_ok end,
    parts = case when new.parts is distinct from old.parts then new.parts else m.parts end,
    bio = case when new.bio is distinct from old.bio then new.bio else m.bio end
  where m.profile_id = new.id and m.deleted_at is null;
  return new;
end $$;
revoke all on function public.orc_profile_to_musicians() from public, anon, authenticated;

drop trigger if exists orc_profile_to_musicians_trg on public.orc_musician_profiles;
create trigger orc_profile_to_musicians_trg after update on public.orc_musician_profiles
  for each row execute function public.orc_profile_to_musicians();
