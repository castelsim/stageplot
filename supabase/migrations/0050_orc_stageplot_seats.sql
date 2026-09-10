-- Orchestre, lotto 9 (integrazione V1/a): il legame scende al POSTO FISICO.
-- Una postazione del disegno ↔ un posto dell'organico (una postazione a due ↔ due posti, seat_index 1 e 2).
-- L'import lavora per gruppi già decisi dal client (strumento + ruolo di destinazione, con anteprima): allarga
-- i ruoli quando servono posti, MAI li restringe, tiene i posti già collegati (e le persone sopra), marca
-- «non più sul palco» ciò che sparisce. L'editor legge nome e stato via orc_stage_view (solo staff): nel blob
-- del progetto non entra nulla.

alter table public.orc_stageplot_links
  add column if not exists slot_id uuid references public.orc_staffing_slots(id) on delete set null,
  add column if not exists seat_index integer not null default 1;
alter table public.orc_stageplot_links drop constraint if exists orc_stageplot_links_production_id_variant_id_item_id_key;
alter table public.orc_stageplot_links drop constraint if exists orc_stageplot_links_item_seat_key;
alter table public.orc_stageplot_links add constraint orc_stageplot_links_item_seat_key unique (production_id, variant_id, item_id, seat_index);
alter table public.orc_stageplot_links drop constraint if exists orc_stageplot_links_seat_index_chk;
alter table public.orc_stageplot_links add constraint orc_stageplot_links_seat_index_chk check (seat_index between 1 and 2);
create unique index if not exists orc_stageplot_links_slot_uidx on public.orc_stageplot_links(slot_id) where slot_id is not null;

-- Import per gruppi: groups = [{instrument_code, role_id|null, role_name, positions:[{item_id,item_type,label,seats}]}]
drop function if exists public.orc_stageplot_import(uuid, uuid, text, jsonb);
create or replace function public.orc_stageplot_import(production uuid, project uuid, variant text, groups jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org uuid; grp jsonb; pos jsonb; rid uuid; sid uuid; fam text; fam_label text; fam_rank int; icode text; rname text;
  k int; k2 int; s_id uuid; lid uuid; item text; seats_here int;
  n_created int := 0; n_grown int := 0; n_seats int := 0; n_linked int := 0; n_stale int := 0; now_ts timestamptz := now(); grown uuid[] := '{}'; created uuid[] := '{}';
begin
  org := public.orc_production_org(production);
  if org is null or not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if project is null then raise exception 'manca il progetto' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(groups, 'null'::jsonb)) <> 'array' then raise exception 'gruppi non validi' using errcode = '22023'; end if;

  -- 1. i legami che non sono nel payload (o di un'altra scena) lasciano il posto: restano in memoria come stale
  update public.orc_stageplot_links l set status = 'stale', slot_id = null, synced_at = now_ts
  where l.production_id = production and l.status = 'linked'
    and not exists (
      select 1 from jsonb_array_elements(groups) g, jsonb_array_elements(g -> 'positions') p
      where p ->> 'item_id' = l.item_id and coalesce(variant, '') = l.variant_id);
  get diagnostics n_stale = row_count;

  for grp in select * from jsonb_array_elements(groups) loop
    icode := nullif(grp ->> 'instrument_code', '');
    if icode is null or not exists (select 1 from public.orc_instruments i where i.code = icode) then continue; end if;
    if jsonb_typeof(grp -> 'positions') <> 'array' or jsonb_array_length(grp -> 'positions') = 0 then continue; end if;
    rname := left(coalesce(nullif(grp ->> 'role_name', ''), (select i.name from public.orc_instruments i where i.code = icode)), 80);

    -- 2. il ruolo di destinazione: quello scelto (se è della produzione) o uno nuovo nella sezione della famiglia
    rid := null;
    if nullif(grp ->> 'role_id', '') is not null then
      select r.id into rid from public.orc_staffing_roles r where r.id = (grp ->> 'role_id')::uuid and r.production_id = production;
    end if;
    if rid is null then
      select r.id into rid from public.orc_staffing_roles r where r.production_id = production and r.instrument_code = icode and r.name = rname order by r.sort limit 1;
    end if;
    if rid is null then
      select i.family into fam from public.orc_instruments i where i.code = icode;
      fam_label := case fam when 'archi' then 'Archi' when 'legni' then 'Legni' when 'ottoni' then 'Ottoni' when 'percussioni' then 'Percussioni'
        when 'tastiere' then 'Tastiere' when 'corde' then 'Corde' when 'voci' then 'Voci' when 'direzione' then 'Direzione' else initcap(coalesce(fam, 'Altro')) end;
      fam_rank := case fam when 'archi' then 1 when 'legni' then 2 when 'ottoni' then 3 when 'percussioni' then 4 when 'tastiere' then 5 when 'corde' then 6 when 'voci' then 7 when 'direzione' then 8 else 9 end;
      select s.id into sid from public.orc_staffing_sections s where s.production_id = production and s.name = fam_label limit 1;
      if sid is null then insert into public.orc_staffing_sections (production_id, name, sort) values (production, fam_label, fam_rank) returning id into sid; end if;
      insert into public.orc_staffing_roles (production_id, section_id, instrument_code, name, seats, part, sort)
      select production, sid, icode, rname, 0, 'tutti', fam_rank * 100 + i.sort from public.orc_instruments i where i.code = icode returning id into rid;
      n_created := n_created + 1; created := created || rid;
    end if;

    -- 3. ogni postazione tiene il posto che aveva (se è ancora di questo ruolo); le altre prendono posti liberi
    for pos in select * from jsonb_array_elements(grp -> 'positions') loop
      item := left(pos ->> 'item_id', 80);
      if item is null or item = '' then continue; end if;
      seats_here := greatest(1, least(2, coalesce((pos ->> 'seats')::int, 1)));
      -- legami di questa postazione oltre i posti che le servono (una doppia diventata singola) → stale
      update public.orc_stageplot_links set status = 'stale', slot_id = null, synced_at = now_ts
      where production_id = production and variant_id = coalesce(variant, '') and item_id = item and seat_index > seats_here and status = 'linked';
      get diagnostics k2 = row_count; n_stale := n_stale + k2;
      for k in 1..seats_here loop
        insert into public.orc_stageplot_links (org_id, production_id, project_id, variant_id, item_id, seat_index, item_type, item_label, instrument_code, role_id, seats, status, synced_at)
        values (org, production, project, coalesce(variant, ''), item, k, left(coalesce(pos ->> 'item_type', ''), 60), left(coalesce(pos ->> 'label', ''), 80), icode, rid, seats_here, 'linked', now_ts)
        on conflict (production_id, variant_id, item_id, seat_index) do update
          set project_id = excluded.project_id, item_type = excluded.item_type, item_label = excluded.item_label, instrument_code = excluded.instrument_code,
              role_id = excluded.role_id, seats = excluded.seats, status = 'linked', synced_at = now_ts,
              slot_id = case when exists (select 1 from public.orc_staffing_slots s where s.id = public.orc_stageplot_links.slot_id and s.role_id = excluded.role_id) then public.orc_stageplot_links.slot_id else null end
        returning id into lid;
        n_linked := n_linked + 1;
        -- serve un posto? prima uno libero del ruolo, altrimenti il ruolo si allarga di uno
        if (select slot_id from public.orc_stageplot_links where id = lid) is null then
          select s.id into s_id from public.orc_staffing_slots s
          where s.role_id = rid and s.status <> 'cancelled' and not exists (select 1 from public.orc_stageplot_links l where l.slot_id = s.id)
          order by s.seat_no limit 1;
          if s_id is null then
            update public.orc_staffing_roles set seats = seats + 1 where id = rid;
            n_seats := n_seats + 1;
            if not (rid = any(grown)) and not (rid = any(created)) then grown := grown || rid; end if;   /* un ruolo nato adesso non è «allargato» */
            select s.id into s_id from public.orc_staffing_slots s
            where s.role_id = rid and not exists (select 1 from public.orc_stageplot_links l where l.slot_id = s.id) order by s.seat_no limit 1;
          end if;
          update public.orc_stageplot_links set slot_id = s_id where id = lid;
        end if;
      end loop;
    end loop;
  end loop;
  n_grown := coalesce(array_length(grown, 1), 0);

  update public.orc_productions set stageplot_project_id = project, stageplot_variant_id = coalesce(variant, ''), stageplot_synced_at = now_ts where id = production;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (org, auth.uid(), 'stageplot.import', 'production', production::text,
          jsonb_build_object('project_id', project, 'variant', coalesce(variant, ''), 'roles_created', n_created, 'roles_grown', n_grown, 'seats_added', n_seats, 'linked', n_linked, 'stale', n_stale));
  return jsonb_build_object('roles_created', n_created, 'roles_grown', n_grown, 'seats_added', n_seats, 'linked', n_linked, 'stale', n_stale);
end $$;

-- Ricollega un legame «non più sul palco» a un'altra postazione (stessa scena): il posto e la persona restano.
create or replace function public.orc_stageplot_relink(link uuid, new_item_id text, new_item_type text default '', new_label text default '')
returns void language plpgsql security definer set search_path = public as $$
declare org uuid; l record;
begin
  select * into l from public.orc_stageplot_links where id = link;
  if l.id is null then raise exception 'legame inesistente' using errcode = '22023'; end if;
  org := l.org_id;
  if not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if nullif(new_item_id, '') is null then raise exception 'manca la postazione' using errcode = '22023'; end if;
  update public.orc_stageplot_links set item_id = left(new_item_id, 80), item_type = left(coalesce(new_item_type, ''), 60), item_label = left(coalesce(new_label, ''), 80), status = 'linked', synced_at = now()
  where id = link;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (org, auth.uid(), 'stageplot.relink', 'production', l.production_id::text, jsonb_build_object('from', l.item_id, 'to', new_item_id, 'slot_id', l.slot_id));
end $$;

-- La vista per l'editor: per ogni postazione collegata di un progetto, chi c'è e in che stato. Solo lo staff
-- delle org proprietarie delle produzioni collegate vede qualcosa; niente note, compensi, valutazioni.
create or replace function public.orc_stage_view(project uuid)
returns table (production_id uuid, production_title text, org_name text, variant_id text, item_id text, seat_index integer, link_id uuid,
  slot_id uuid, seat_no integer, slot_status text, role_name text, musician_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.title, o.name, l.variant_id, l.item_id, l.seat_index, l.id, l.slot_id, s.seat_no, s.status, r.name,
    case when m.id is null then null else m.first_name || ' ' || m.last_name end
  from public.orc_stageplot_links l
  join public.orc_productions p on p.id = l.production_id and p.deleted_at is null
  join public.orc_organizations o on o.id = p.org_id
  left join public.orc_staffing_slots s on s.id = l.slot_id
  left join public.orc_staffing_roles r on r.id = coalesce(s.role_id, l.role_id)
  left join public.orc_musicians m on m.id = s.musician_id
  where l.project_id = project and l.status = 'linked' and public.orc_is_staff(p.org_id)
  order by p.updated_at desc, l.item_id, l.seat_index
$$;

-- L'organico dice quale postazione copre ogni posto.
drop function if exists public.orc_staffing(uuid);
create or replace function public.orc_staffing(production uuid)
returns table (role_id uuid, section_id uuid, section_name text, section_sort integer, role_name text, instrument_code text,
  instrument_name text, seats integer, part text, min_level integer, notes text, role_sort integer,
  slot_id uuid, seat_no integer, slot_status text, musician_id uuid, musician_name text, item_label text, item_id text)
language sql stable security definer set search_path = public as $$
  select r.id, s.id, s.name, s.sort, r.name, r.instrument_code, i.name, r.seats, r.part, r.min_level, r.notes, r.sort,
    sl.id, sl.seat_no, sl.status, sl.musician_id, case when m.id is null then null else m.last_name || ' ' || m.first_name end,
    l.item_label, l.item_id
  from public.orc_staffing_roles r
  left join public.orc_staffing_sections s on s.id = r.section_id
  left join public.orc_instruments i on i.code = r.instrument_code
  left join public.orc_staffing_slots sl on sl.role_id = r.id
  left join public.orc_musicians m on m.id = sl.musician_id
  left join public.orc_stageplot_links l on l.slot_id = sl.id and l.status = 'linked'
  where r.production_id = production and public.orc_is_staff(public.orc_production_org(production))
  order by coalesce(s.sort, 999), r.sort, sl.seat_no
$$;

revoke all on function public.orc_stageplot_import(uuid, uuid, text, jsonb), public.orc_stageplot_relink(uuid, text, text, text),
  public.orc_stage_view(uuid), public.orc_staffing(uuid) from public, anon;
grant execute on function public.orc_stageplot_import(uuid, uuid, text, jsonb), public.orc_stageplot_relink(uuid, text, text, text),
  public.orc_stage_view(uuid), public.orc_staffing(uuid) to authenticated, service_role;
