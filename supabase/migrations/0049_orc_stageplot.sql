-- Orchestre, lotto 8: collegamento a StagePlot.
-- Una produzione punta a un progetto dell'editor (`orc_productions.stageplot_project_id`, dal lotto 3, senza FK:
-- `stageplot_projects` è dell'altro dominio e chi non ne è proprietario non lo legge). L'importazione delle
-- postazioni-persona passa dal client (che legge il progetto con le SUE policy own-rows) a questa RPC, che
-- allarga l'organico e registra i collegamenti postazione → ruolo. Niente viene scritto nel blob del
-- progetto: link, copie e PDF di StagePlot non contengono nulla di Orchestre.

alter table public.orc_productions
  add column if not exists stageplot_variant_id text,
  add column if not exists stageplot_synced_at timestamptz;

create table if not exists public.orc_stageplot_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  project_id uuid not null,
  variant_id text not null default '',
  item_id text not null,
  item_type text not null default '',
  item_label text not null default '',
  instrument_code text references public.orc_instruments(code),
  role_id uuid references public.orc_staffing_roles(id) on delete set null,
  seats integer not null default 1,
  status text not null default 'linked',
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  unique (production_id, variant_id, item_id),
  constraint orc_stageplot_links_status_chk check (status in ('linked','stale')),
  constraint orc_stageplot_links_seats_chk check (seats between 1 and 4)
);
create index if not exists orc_stageplot_links_prod_idx on public.orc_stageplot_links(production_id, status);
create index if not exists orc_stageplot_links_proj_idx on public.orc_stageplot_links(project_id);

alter table public.orc_stageplot_links enable row level security;
drop policy if exists orc_stageplot_links_staff_read on public.orc_stageplot_links;
create policy orc_stageplot_links_staff_read on public.orc_stageplot_links for select to authenticated
  using (public.orc_is_staff(org_id));
grant select on public.orc_stageplot_links to authenticated;
grant all on public.orc_stageplot_links to service_role;

-- Importa le postazioni di una variante: allarga l'organico (mai restringerlo) e registra i collegamenti.
-- positions = [{item_id, item_type, label, instrument_code, seats}]
create or replace function public.orc_stageplot_import(production uuid, project uuid, variant text, positions jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org uuid; pos jsonb; grp record; rid uuid; sid uuid; have int; fam text; fam_label text; fam_rank int;
  n_created int := 0; n_grown int := 0; n_seats int := 0; n_linked int := 0; n_stale int := 0; now_ts timestamptz := now();
begin
  org := public.orc_production_org(production);
  if org is null or not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if project is null then raise exception 'manca il progetto' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(positions, 'null'::jsonb)) <> 'array' then raise exception 'postazioni non valide' using errcode = '22023'; end if;

  -- un gruppo per strumento
  for grp in
    select p ->> 'instrument_code' as code, sum(greatest(1, least(4, coalesce((p ->> 'seats')::int, 1))))::int as seats
    from jsonb_array_elements(positions) p
    where nullif(p ->> 'instrument_code', '') is not null and nullif(p ->> 'item_id', '') is not null
    group by p ->> 'instrument_code'
  loop
    if not exists (select 1 from public.orc_instruments i where i.code = grp.code) then continue; end if;
    select coalesce(sum(r.seats), 0) into have from public.orc_staffing_roles r where r.production_id = production and r.instrument_code = grp.code;
    if not exists (select 1 from public.orc_staffing_roles r where r.production_id = production and r.instrument_code = grp.code) then
      select i.family into fam from public.orc_instruments i where i.code = grp.code;
      fam_label := case fam when 'archi' then 'Archi' when 'legni' then 'Legni' when 'ottoni' then 'Ottoni' when 'percussioni' then 'Percussioni'
        when 'tastiere' then 'Tastiere' when 'corde' then 'Corde' when 'voci' then 'Voci' when 'direzione' then 'Direzione' else initcap(coalesce(fam, 'Altro')) end;
      fam_rank := case fam when 'archi' then 1 when 'legni' then 2 when 'ottoni' then 3 when 'percussioni' then 4 when 'tastiere' then 5 when 'corde' then 6 when 'voci' then 7 when 'direzione' then 8 else 9 end;
      select s.id into sid from public.orc_staffing_sections s where s.production_id = production and s.name = fam_label limit 1;
      if sid is null then
        insert into public.orc_staffing_sections (production_id, name, sort) values (production, fam_label, fam_rank) returning id into sid;
      end if;
      insert into public.orc_staffing_roles (production_id, section_id, instrument_code, name, seats, part, sort)
      select production, sid, grp.code, i.name, grp.seats, 'tutti', fam_rank * 100 + i.sort from public.orc_instruments i where i.code = grp.code
      returning id into rid;
      n_created := n_created + 1; n_seats := n_seats + grp.seats;
    elsif grp.seats > have then
      select r.id into rid from public.orc_staffing_roles r where r.production_id = production and r.instrument_code = grp.code order by r.sort, r.id limit 1;
      update public.orc_staffing_roles set seats = seats + (grp.seats - have) where id = rid;
      n_grown := n_grown + 1; n_seats := n_seats + (grp.seats - have);
    else
      select r.id into rid from public.orc_staffing_roles r where r.production_id = production and r.instrument_code = grp.code order by r.sort, r.id limit 1;
    end if;

    -- i collegamenti di questo strumento
    for pos in select p from jsonb_array_elements(positions) p where p ->> 'instrument_code' = grp.code and nullif(p ->> 'item_id', '') is not null loop
      insert into public.orc_stageplot_links (org_id, production_id, project_id, variant_id, item_id, item_type, item_label, instrument_code, role_id, seats, status, synced_at)
      values (org, production, project, coalesce(variant, ''), left(pos ->> 'item_id', 80), left(coalesce(pos ->> 'item_type', ''), 60), left(coalesce(pos ->> 'label', ''), 80),
              grp.code, rid, greatest(1, least(4, coalesce((pos ->> 'seats')::int, 1))), 'linked', now_ts)
      on conflict (production_id, variant_id, item_id) do update
        set project_id = excluded.project_id, item_type = excluded.item_type, item_label = excluded.item_label, instrument_code = excluded.instrument_code,
            role_id = excluded.role_id, seats = excluded.seats, status = 'linked', synced_at = now_ts;
      n_linked := n_linked + 1;
    end loop;
  end loop;

  -- quello che non è più sul palco (o è di un'altra variante) resta in memoria come stale
  update public.orc_stageplot_links l set status = 'stale', synced_at = now_ts
  where l.production_id = production and l.status = 'linked' and l.synced_at <> now_ts;
  get diagnostics n_stale = row_count;

  update public.orc_productions set stageplot_project_id = project, stageplot_variant_id = coalesce(variant, ''), stageplot_synced_at = now_ts where id = production;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (org, auth.uid(), 'stageplot.import', 'production', production::text,
          jsonb_build_object('project_id', project, 'variant', coalesce(variant, ''), 'roles_created', n_created, 'roles_grown', n_grown, 'seats_added', n_seats, 'linked', n_linked, 'stale', n_stale));
  return jsonb_build_object('roles_created', n_created, 'roles_grown', n_grown, 'seats_added', n_seats, 'linked', n_linked, 'stale', n_stale);
end $$;

-- Scollega: il puntatore torna vuoto e i collegamenti spariscono. L'organico resta com'è.
create or replace function public.orc_stageplot_unlink(production uuid)
returns void language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  org := public.orc_production_org(production);
  if org is null or not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  delete from public.orc_stageplot_links where production_id = production;
  update public.orc_productions set stageplot_project_id = null, stageplot_variant_id = null, stageplot_synced_at = null where id = production;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (org, auth.uid(), 'stageplot.unlink', 'production', production::text, '{}'::jsonb);
end $$;

-- Le produzioni delle MIE organizzazioni collegate a un progetto (per il bottone «Organico» dell'editor).
create or replace function public.orc_productions_for_project(project uuid)
returns table (id uuid, title text, status text, org_id uuid, org_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.title, p.status, p.org_id, o.name
  from public.orc_productions p join public.orc_organizations o on o.id = p.org_id
  where p.stageplot_project_id = project and p.deleted_at is null and public.orc_is_staff(p.org_id)
  order by p.updated_at desc
$$;

revoke all on function public.orc_stageplot_import(uuid, uuid, text, jsonb), public.orc_stageplot_unlink(uuid), public.orc_productions_for_project(uuid) from public, anon;
grant execute on function public.orc_stageplot_import(uuid, uuid, text, jsonb), public.orc_stageplot_unlink(uuid), public.orc_productions_for_project(uuid) to authenticated, service_role;

-- Parità con la produzione: lì `stageplot_projects` ha già questi privilegi (l'editor ci scrive dal 2026-06);
-- l'immagine Postgres locale non dà privilegi di default e senza questi la scheda «StagePlot» e i test RLS
-- non potrebbero leggere i progetti. Idempotente: in produzione non cambia nulla.
grant select, insert, update, delete on public.stageplot_projects to authenticated;
grant all on public.stageplot_projects to service_role;
