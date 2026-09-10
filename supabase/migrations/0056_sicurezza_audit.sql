-- 0056 — Le sei cose che l'audit di sicurezza del 10/09 ha trovato aperte.
--
-- Nessuna era una porta spalancata sull'esterno: l'anonimo continua a non poter leggere niente.
-- Sono difese che mancavano dietro la prima, più una revoca che l'ultimo giro di collaudo ha rotto.
-- In ordine di gravità, come sono state trovate.

-- ─────────────────────────────────────────────────────── 1. L'identità non si dichiara, si dimostra
-- Il difetto vero di questo giro. `orc_musician_profiles.email` la scrive l'utente (policy `orc_mp_own`
-- `for all` + grant update): non è l'email del token, è un campo di testo. `orc_application_accept`
-- collegava la candidatura a una riga di rubrica confrontando quel campo con `orc_musicians.email`,
-- e poi ci scriveva `user_id = coalesce(m.user_id, p.user_id)`.
--
-- Scenario: chi ha un link d'invito mette nel proprio profilo l'email di un violinista importato da
-- CSV (le righe da import hanno `user_id` nullo) e preme «manda». `orc_submit_application` accetta
-- da sé, senza revisione umana, e da quel momento `orc_my_invitations()`, `orc_my_engagements()` e
-- `orc_respond_mine()` gli danno le convocazioni di quel violinista — comprese le note dello staff
-- e i compensi — e la facoltà di rispondere al posto suo.
--
-- La forma giusta era già in casa: `orc_link_my_musician_rows` (0048) usa `auth.jwt() ->> 'email'`.
-- Qui non si può — la funzione la chiama anche lo staff da `orc_application_set_status`, e lì il
-- token è il suo — quindi si legge l'email verificata del titolare del profilo da `auth.users`.
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
        insert into public.orc_musicians (org_id, user_id, profile_id, first_name, last_name, email, phone, city, province, area, has_car, max_distance_km, travel_ok, tour_ok, status, source, bio, created_by)
        values (org, p.user_id, p.id, p.first_name, p.last_name, p.email, p.phone, p.city, p.province, p.area, p.has_car, p.max_distance_km, p.travel_ok, p.tour_ok, 'active', 'application', p.bio, auth.uid())
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
      update public.orc_musicians m set user_id = coalesce(m.user_id, p.user_id), profile_id = coalesce(m.profile_id, p.id), status = case when m.status in ('archived','suspended') then 'active' else m.status end where m.id = mid;
    end if;
    update public.orc_applications x set musician_id = mid where x.id = app;
  return mid;
end $$;

-- ─────────────────────────────────────────── 2. La purga di retention non è di chiunque passi di lì
-- `stageplot_purge_expired()` (0033) è `security definer` e non ha mai avuto né revoke né grant:
-- restava l'EXECUTE di default a PUBLIC. Con la sola anon key — che è pubblica, sta nel bundle —
-- chiunque poteva chiamare `POST /rest/v1/rpc/stageplot_purge_expired` quante volte voleva.
-- Il danno ai dati era nullo (il cron delle 03:17 fa già la stessa cosa), ma è una scrittura non
-- autenticata sul database e un DELETE a scansione ripetibile a piacere.
-- Il cron gira come `postgres` e non passa da questi grant.
revoke all on function public.stageplot_purge_expired() from public, anon, authenticated;
grant execute on function public.stageplot_purge_expired() to service_role;

-- ────────────────────────────────────────────────── 3. Lo stato interno resta interno, anche qui
-- Il collaudo (0051, punto 4) aveva tolto al candidato il `select` sulla propria riga di
-- `orc_applications`, perché la maschera dev'essere nel database e non nel client. La stessa
-- correzione non era stata portata su `orc_client_requests`: il cliente leggeva `status` grezzo
-- (`quoted`, `won`, `lost`), `taken_by` — chi in società ha preso in carico — e `production_id`,
-- mentre `orc_my_client_requests()` gli mostra «ricevuta» / «in lavorazione».
-- Il cliente passa già dall'RPC; lo staff ha `orc_cr_staff_read` e non perde niente.
drop policy if exists orc_cr_own_read on public.orc_client_requests;

-- ──────────────────────────────────────────────────── 4. La revoca del consenso torna a funzionare
-- Regressione di ieri (0051, punto 5): via la policy `for all` e `revoke update, delete`, giusto —
-- il consenso è una prova e non si cancella né si retrodata. Ma il client revoca con un UPDATE di
-- `revoked_at` (`orchestre/src/api/applications.js`), quindi il pulsante «Non ricevere più
-- richieste» rispondeva 403: il diritto di revoca esisteva nell'interfaccia e non funzionava.
-- La revoca si scrive, e la scrive il database: solo `revoked_at`, solo sulla propria riga, solo
-- se non è già revocata, sempre a `now()` — nessuna data la sceglie l'interessato.
create or replace function public.orc_consent_revoke(kind_in text)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'accesso' using errcode = '42501'; end if;
  update public.orc_consents c set revoked_at = now()
   where c.user_id = auth.uid() and c.kind = kind_in and c.revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.orc_consent_revoke(text) from public, anon;
grant execute on function public.orc_consent_revoke(text) to authenticated, service_role;

-- ──────────────────────────────────── 5. Chi riceve le richieste dei clienti non si sceglie da soli
-- `is_service_provider` (0052) decide quale organizzazione riceve TUTTE le richieste «Richiedi
-- musicisti»: nome, email, telefono, evento e copia del palco di chi le manda. `accepting_applications`
-- ha una RPC con controllo del ruolo (`orc_set_accepting`); questo flag no, e la policy
-- `orc_organizations_admin_update` non è ristretta per colonna. Oggi l'indice unico parziale tiene
-- (una sola riga accesa, e la `using` non lascia spegnere quella altrui), ma la difesa è un vincolo
-- di unicità, non un permesso: appena il flag risulta spento — una migrazione, un ripristino — il
-- primo admin che passa se lo prende.
--
-- ⚠️ Il primo tentativo era `revoke update (is_service_provider) ... from authenticated`, e NON
-- funzionava: in Postgres un GRANT UPDATE sull'intera tabella vale su tutte le colonne, e revocarne
-- una non lo scalfisce. Il test lo aveva pure dato per buono, ma passava per il motivo sbagliato —
-- il PATCH cadeva sull'indice unico (c'è già un'organizzazione accesa), non sul permesso.
-- Elencare le colonne consentite una per una è peggio: la prima che si dimentica rompe una schermata.
-- Qui il divieto è un trigger, che non dipende dai grant e nomina la sola cosa vietata.
-- ⚠️ NON `security definer`: dentro una funzione definer `current_user` diventa il proprietario
-- (postgres), quindi il controllo qui sotto sarebbe sempre falso e il trigger non bloccherebbe mai.
-- Trovato riprovando: il PATCH continuava a cadere sull'indice unico, non su questo divieto.
create or replace function public.orc_org_service_flag_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_service_provider is distinct from old.is_service_provider
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'chi riceve le richieste dei clienti si decide da chi amministra il progetto, non da qui'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists orc_org_service_flag_guard on public.orc_organizations;
create trigger orc_org_service_flag_guard before update on public.orc_organizations
  for each row execute function public.orc_org_service_flag_guard();

-- ──────────────────────────────────────────────── 6. Il palco importato dev'essere di chi lo importa
-- `orc_stageplot_import` verificava il ruolo sulla produzione, poi accettava `project` come uuid
-- qualsiasi: un'organizzazione poteva scrivere `stageplot_project_id` e righe `orc_stageplot_links`
-- che puntano al progetto di un estraneo. Non dava lettura del documento (le viste filtrano per
-- `orc_is_staff`), ma è un legame che l'altro non ha chiesto e non vede.
-- Il confronto era già in casa: `orc_client_request_create` (0052) verifica `p.user_id = uid`.
-- Qui passano il proprio progetto (è l'unico che la pagina offre, `myProjects()` legge sotto RLS)
-- e quello che un cliente ha allegato a una richiesta indirizzata a questa organizzazione.
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
  /* AUDIT 10/09 — il palco importato dev'essere di chi lo importa. Prima qui passava un uuid
     qualsiasi: si potevano scrivere `stageplot_project_id` e righe `orc_stageplot_links` che
     puntano al progetto di un estraneo. Passano il proprio progetto (l'unico che la pagina offra:
     `myProjects()` legge sotto RLS) e quello che un cliente ha allegato a una richiesta
     indirizzata a questa organizzazione. */
  if not exists (select 1 from public.stageplot_projects sp where sp.id = project and sp.user_id = auth.uid() and sp.deleted_at is null)
     and not exists (select 1 from public.orc_client_requests cr where cr.project_id = project and cr.org_id = org) then
    raise exception 'il progetto non è tuo' using errcode = '42501';
  end if;
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

-- ───────────────────────────────────────── 7. Le valutazioni senza candidatura tornano scrivibili
-- Non è sicurezza, è un effetto collaterale di 0051: la `with check` pretende
-- `org_id = orc_application_org(application_id)`, e con `application_id` nullo — caso previsto dal
-- vincolo `orc_evaluations_target_chk`, che ammette la valutazione legata al solo musicista —
-- l'espressione vale NULL e l'insert viene rifiutato. Oggi non si vede perché il client passa
-- sempre da una candidatura. Il controllo resta, per ciascuno dei due bersagli.
drop policy if exists orc_ev_staff on public.orc_evaluations;
create policy orc_ev_staff on public.orc_evaluations for all
  using (public.orc_is_staff(org_id))
  with check (
    public.orc_is_staff(org_id)
    and (application_id is null or org_id = public.orc_application_org(application_id))
    and (musician_id   is null or org_id = public.orc_musician_org(musician_id))
  );
