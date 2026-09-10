-- Orchestre — collaudo del 10/09/2026 (quattro revisioni indipendenti: sicurezza, correttezza, esperienza
-- d'uso, qualità dei test). Qui le riparazioni che stanno nel database. Ognuna ha il suo test che, rimesso
-- il difetto, torna rossa.

-- ─────────────────────────────────────────────────────────────── 1. Il posto di una persona non si sposta
-- Difetto provato: una postazione con una persona confermata sparisce dal disegno; il suo legame diventava
-- «non più sul palco» AZZERANDO slot_id, così il posto risultava libero e la prima postazione nuova se lo
-- prendeva. Nel disegno la persona compariva su un'altra sedia, e l'interfaccia intanto prometteva
-- «il suo posto e la persona restano». Ora un legame che lascia il palco tiene il posto SE quel posto ha
-- qualcuno sopra: il posto resta suo finché non lo si ricollega o non lo si libera a mano. Un posto vuoto,
-- invece, torna disponibile come prima.
create or replace function public.orc_stageplot_import(production uuid, project uuid, variant text, groups jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org uuid; grp jsonb; pos jsonb; rid uuid; sid uuid; fam text; fam_label text; fam_rank int; icode text; rname text;
  k int; k2 int; s_id uuid; lid uuid; item text; seats_here int;
  n_created int := 0; n_grown int := 0; n_seats int := 0; n_linked int := 0; n_stale int := 0; now_ts timestamptz := now();
  grown uuid[] := '{}'; created uuid[] := '{}';
begin
  org := public.orc_production_org(production);
  if org is null or not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if project is null then raise exception 'manca il progetto' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(groups, 'null'::jsonb)) <> 'array' then raise exception 'gruppi non validi' using errcode = '22023'; end if;

  -- 1. i legami che non sono nel payload (o di un'altra scena) lasciano il palco. Il posto lo tengono solo
  --    se c'è una persona sopra: quello è il senso di «la persona resta dov'è».
  update public.orc_stageplot_links l set status = 'stale', synced_at = now_ts,
    slot_id = case when exists (select 1 from public.orc_staffing_slots s where s.id = l.slot_id and s.musician_id is not null) then l.slot_id else null end
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

    for pos in select * from jsonb_array_elements(grp -> 'positions') loop
      item := left(pos ->> 'item_id', 80);
      if item is null or item = '' then continue; end if;
      seats_here := greatest(1, least(2, coalesce((pos ->> 'seats')::int, 1)));
      -- una postazione a due che diventa singola lascia il secondo posto, con la stessa regola di sopra
      update public.orc_stageplot_links l set status = 'stale', synced_at = now_ts,
        slot_id = case when exists (select 1 from public.orc_staffing_slots s where s.id = l.slot_id and s.musician_id is not null) then l.slot_id else null end
      where l.production_id = production and l.variant_id = coalesce(variant, '') and l.item_id = item and l.seat_index > seats_here and l.status = 'linked';
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
        if (select slot_id from public.orc_stageplot_links where id = lid) is null then
          -- un posto libero: né annullato, né già di un'altra postazione (nemmeno di una che ha lasciato il palco)
          select s.id into s_id from public.orc_staffing_slots s
          where s.role_id = rid and s.status <> 'cancelled' and not exists (select 1 from public.orc_stageplot_links l where l.slot_id = s.id)
          order by s.seat_no limit 1;
          if s_id is null then
            update public.orc_staffing_roles set seats = seats + 1 where id = rid;
            n_seats := n_seats + 1;
            if not (rid = any(grown)) and not (rid = any(created)) then grown := grown || rid; end if;
            -- ANCHE qui il posto annullato non va bene: prima si prendeva il primo per seat_no, annullato compreso,
            -- e la postazione finiva su una sedia cancellata mentre quella appena creata restava vuota.
            select s.id into s_id from public.orc_staffing_slots s
            where s.role_id = rid and s.status <> 'cancelled' and not exists (select 1 from public.orc_stageplot_links l where l.slot_id = s.id)
            order by s.seat_no limit 1;
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

-- ─────────────────────────────────────────────────────────────── 2. Un file entra solo nel proprio dossier
-- Difetto: la policy validava solo `owner_user_id = auth.uid()`; `profile_id` e `path` restavano liberi.
-- Lo staff di un'organizzazione poteva infilare un PDF nel dossier di un candidato di un'altra, che se lo
-- sarebbe visto elencare come proprio CV. Ora il file deve essere del proprio profilo e stare nella propria
-- cartella dello storage.
drop policy if exists orc_files_own on public.orc_files;
drop policy if exists orc_files_own_read on public.orc_files;
create policy orc_files_own_read on public.orc_files for select using (owner_user_id = auth.uid());
drop policy if exists orc_files_own_write on public.orc_files;
create policy orc_files_own_write on public.orc_files for insert with check (
  owner_user_id = auth.uid()
  and public.orc_profile_owner(profile_id) = auth.uid()
  and path like 'profiles/' || auth.uid()::text || '/%');
drop policy if exists orc_files_own_del on public.orc_files;
create policy orc_files_own_del on public.orc_files for delete using (owner_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────── 3. Una valutazione resta nella sua org
-- Difetto: la `with check` guardava `org_id`, che lo sceglie il client. Con l'uuid di una candidatura di
-- un'altra organizzazione (sta nell'URL della scheda) si poteva scrivere una valutazione negativa dentro
-- il dossier altrui. Ora l'org della valutazione deve essere quella della candidatura.
drop policy if exists orc_ev_staff on public.orc_evaluations;
create policy orc_ev_staff on public.orc_evaluations for all
  using (public.orc_is_staff(org_id))
  with check (public.orc_is_staff(org_id) and org_id = public.orc_application_org(application_id));

-- Stessa cosa per il feedback di fine produzione: org, produzione e musicista devono coincidere.
drop policy if exists orc_pf_staff on public.orc_performance_feedback;
create policy orc_pf_staff on public.orc_performance_feedback for all
  using (public.orc_is_staff(org_id))
  with check (public.orc_is_staff(org_id)
    and org_id = public.orc_production_org(production_id)
    and org_id = (select m.org_id from public.orc_musicians m where m.id = musician_id));

-- ─────────────────────────────────────────────────────────────── 4. Lo stato interno resta interno
-- Difetto: il candidato aveva `select` sulla propria riga di `orc_applications`, quindi dalla console del
-- browser leggeva lo stato grezzo («colloquio da programmare», «sospesa», «riserva») e chi aveva deciso,
-- mentre l'interfaccia gli mostra la maschera pubblica. La maschera dev'essere nel database, non nel client:
-- il candidato passa da `orc_my_applications()`, che espone solo `orc_public_status`.
drop policy if exists orc_app_own_select on public.orc_applications;
revoke update on public.orc_applications from authenticated;
revoke usage, select on sequence public.orc_application_events_id_seq from authenticated;

-- ─────────────────────────────────────────────────────────────── 5. Il consenso è una prova, non una nota
-- Difetto: `for all` + grant CRUD lasciavano all'interessato di cancellare o retrodatare il proprio consenso.
-- Resta il diritto di leggerlo e di darlo; la revoca si scrive, non si cancella.
drop policy if exists orc_consents_own on public.orc_consents;
drop policy if exists orc_consents_own_read on public.orc_consents;
create policy orc_consents_own_read on public.orc_consents for select using (user_id = auth.uid());
drop policy if exists orc_consents_own_add on public.orc_consents;
create policy orc_consents_own_add on public.orc_consents for insert with check (user_id = auth.uid());
revoke update, delete on public.orc_consents from authenticated;

-- ─────────────────────────────────────────────────────────────── 6. Il registro delle candidature dice il vero
-- Difetto: `from_status` veniva riletto DOPO l'update, quindi ogni riga del registro append-only diceva
-- «da accettata ad accettata». In una contestazione non si ricostruiva niente.
create or replace function public.orc_application_set_status(app uuid, new_status text, note text default '', to_candidate text default null)
returns public.orc_applications language plpgsql security definer set search_path = public as $$
declare a public.orc_applications; p public.orc_musician_profiles; mid uuid; org uuid; prev text;
begin
  select * into a from public.orc_applications x where x.id = app;
  if a.id is null then raise exception 'candidatura inesistente' using errcode = 'P0002'; end if;
  org := a.org_id; prev := a.status;   /* lo stato PRIMA dell'update: dopo, la riga e' gia' cambiata */
  if not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if new_status not in ('evaluating','interview_to_schedule','interview_scheduled','audition_to_schedule','audition_scheduled','reserve','accepted','rejected','suspended','archived') then
    raise exception 'stato non valido: %', new_status using errcode = '22023';
  end if;
  if a.status = 'draft' then raise exception 'la candidatura non è stata inviata' using errcode = '22023'; end if;
  if new_status = 'accepted' and a.musician_id is null then
    select * into p from public.orc_musician_profiles x where x.id = a.profile_id;
    select m.id into mid from public.orc_musicians m where m.org_id = org and m.deleted_at is null and (m.user_id = p.user_id or (p.email <> '' and lower(m.email) = lower(p.email))) limit 1;
    if mid is null then
      insert into public.orc_musicians (org_id, user_id, profile_id, first_name, last_name, email, phone, city, province, area, has_car, max_distance_km, travel_ok, tour_ok, status, source, bio, created_by)
      values (org, p.user_id, p.id, p.first_name, p.last_name, p.email, p.phone, p.city, p.province, p.area, p.has_car, p.max_distance_km, p.travel_ok, p.tour_ok, 'active', 'application', p.bio, auth.uid())
      returning id into mid;
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
      update public.orc_musicians m set user_id = coalesce(m.user_id, p.user_id), profile_id = coalesce(m.profile_id, p.id), status = case when m.status in ('archived','suspended') then 'active' else m.status end where m.id = mid;
    end if;
    update public.orc_applications x set musician_id = mid where x.id = app;
  end if;
  if new_status = 'reserve' and a.musician_id is not null then update public.orc_musicians m set status = 'reserve' where m.id = a.musician_id; end if;
  update public.orc_applications x set status = new_status, decided_at = case when new_status in ('accepted','rejected','reserve') then now() else x.decided_at end,
    decided_by = case when new_status in ('accepted','rejected','reserve') then auth.uid() else x.decided_by end,
    note_to_candidate = coalesce(to_candidate, x.note_to_candidate) where x.id = app returning * into a;
  insert into public.orc_application_events (application_id, from_status, to_status, actor, note, actor_id) values (app, prev, new_status, 'staff', coalesce(note, ''), auth.uid());
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload) values (org, auth.uid(), 'application.status', 'orc_applications', app::text, jsonb_build_object('from', prev, 'to', new_status));
  return a;
end $$;

revoke all on function public.orc_stageplot_import(uuid, uuid, text, jsonb), public.orc_application_set_status(uuid, text, text, text) from public, anon;
grant execute on function public.orc_stageplot_import(uuid, uuid, text, jsonb), public.orc_application_set_status(uuid, text, text, text) to authenticated, service_role;
