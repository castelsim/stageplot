-- Invitare un musicista che si conosce già, e la sua fotografia.
--
-- Fino a qui c'era solo la candidatura spontanea: uno arriva dalla pagina pubblica, compila, e la società
-- lo valuta. Ma quando è la società a scrivere «mandami il curriculum» a una persona che ha già scelto,
-- valutarla dopo è burocrazia: la fiducia l'ha già data invitandola. L'invito se la porta dietro, e chi
-- arriva da lì, appena manda il profilo, è **già** fra i musicisti dell'organizzazione.
--
-- Il token del link non passa mai dal server in chiaro: lo genera il browser di chi invita, che ne manda
-- solo l'impronta (sha-256) e mostra il link una volta sola — lo stesso schema delle richieste di setup
-- dell'editor. Chi perde il link ne fa un altro; quello vecchio si revoca.

alter table public.orc_files drop constraint if exists orc_files_kind_chk;
alter table public.orc_files add constraint orc_files_kind_chk check (kind in ('cv','audio','video','photo','other'));

alter table public.orc_musician_profiles
  add column if not exists photo_path text not null default '';
comment on column public.orc_musician_profiles.photo_path is
  'La fotografia nel bucket privato orc-files, come gli altri materiali. Vuota = nessuna foto.';

create table if not exists public.orc_musician_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  token_hash text not null unique,
  label text not null default '',                 -- per chi invita: «Anna, violino» — non lo vede l'invitato
  email text not null default '',                 -- facoltativa, solo come promemoria di chi si è invitato
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  musician_id uuid references public.orc_musicians(id) on delete set null,
  status text not null default 'open',
  constraint orc_musician_invites_status_chk check (status in ('open','claimed','done','revoked','expired'))
);
create index if not exists orc_musician_invites_org_idx on public.orc_musician_invites(org_id, status, created_at desc);
create index if not exists orc_musician_invites_claimed_idx on public.orc_musician_invites(claimed_by) where claimed_by is not null;

alter table public.orc_musician_invites enable row level security;
drop policy if exists orc_mi_staff_read on public.orc_musician_invites;
create policy orc_mi_staff_read on public.orc_musician_invites for select using (public.orc_is_staff(org_id));
grant select on public.orc_musician_invites to authenticated;
grant all on public.orc_musician_invites to service_role;

-- Creare l'invito: arriva già l'impronta, il link resta nel browser di chi invita.
create or replace function public.orc_musician_invite_create(org uuid, hash text, label text default '', email text default '', note text default '', days integer default 30)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  if not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if hash is null or length(hash) <> 64 then raise exception 'invito non valido' using errcode = '22023'; end if;
  insert into public.orc_musician_invites (org_id, token_hash, label, email, note, created_by, expires_at)
  values (org, lower(hash), left(coalesce(label, ''), 80), lower(left(coalesce(email, ''), 160)), left(coalesce(note, ''), 400),
          auth.uid(), now() + (greatest(1, least(365, coalesce(days, 30))) || ' days')::interval)
  returning public.orc_musician_invites.id into id;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (org, auth.uid(), 'musician_invite.create', 'orc_musician_invites', id::text, jsonb_build_object('label', label));
  return id;
end $$;

create or replace function public.orc_musician_invite_revoke(inv uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select org_id into o from public.orc_musician_invites where id = inv;
  if o is null or not public.orc_is_staff(o) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  update public.orc_musician_invites set status = 'revoked' where id = inv and status in ('open','claimed');
end $$;

-- Aprire l'invito (il musicista, dopo l'accesso): dice chi lo ha invitato, e lo prende in carico.
-- Non svela mai l'esistenza di un invito che non è valido: risposta identica in tutti i casi che non vanno.
create or replace function public.orc_musician_invite_claim(hash text)
returns table (org_id uuid, org_name text, ok boolean, motivo text)
language plpgsql security definer set search_path = public as $$
declare inv public.orc_musician_invites; o public.orc_organizations;
begin
  if auth.uid() is null then return query select null::uuid, null::text, false, 'accesso'; return; end if;
  select * into inv from public.orc_musician_invites where token_hash = lower(coalesce(hash, ''));
  if inv.id is null then return query select null::uuid, null::text, false, 'non valido'; return; end if;
  if inv.status in ('revoked','expired') or inv.expires_at < now() then
    update public.orc_musician_invites set status = 'expired' where id = inv.id and status = 'open' and expires_at < now();
    return query select null::uuid, null::text, false, 'scaduto'; return;
  end if;
  /* già preso da un altro account: l'invito è personale, non si gira ad altri */
  if inv.claimed_by is not null and inv.claimed_by <> auth.uid() then
    return query select null::uuid, null::text, false, 'gia usato'; return;
  end if;
  if inv.claimed_by is null then
    update public.orc_musician_invites set claimed_by = auth.uid(), claimed_at = now(), status = 'claimed' where id = inv.id;
  end if;
  select * into o from public.orc_organizations where id = inv.org_id;
  return query select inv.org_id, o.name, true, ''::text;
end $$;

-- Accettare una candidatura: creare (o ritrovare) la persona fra i musicisti, con quello che ha dichiarato.
-- Era scritto dentro `orc_application_set_status`, dove lo faceva solo lo staff a mano. Adesso serve anche
-- all'invito, che accetta da sé: sta qui una volta sola, e le due strade fanno esattamente la stessa cosa.
-- Non ha controlli di autorizzazione perché non è chiamabile da fuori: la revoca qui sotto lo impedisce, e
-- chi la chiama (set_status per lo staff, submit_application per l'invitato) ha già verificato chi è.
create or replace function public.orc_application_accept(app uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.orc_applications; p public.orc_musician_profiles; mid uuid; org uuid;
begin
  select * into a from public.orc_applications x where x.id = app;
  if a.id is null then raise exception 'candidatura inesistente' using errcode = 'P0002'; end if;
  if a.musician_id is not null then return a.musician_id; end if;
  org := a.org_id;
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
  return mid;
end $$;

-- E `orc_application_set_status` adesso chiama quella, invece di tenersene una copia. Per il resto è quella
-- di 0051, riga per riga: `prev` compreso, che è la correzione del registro trovata al collaudo.
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
    mid := public.orc_application_accept(app);
  end if;
  if new_status = 'reserve' and a.musician_id is not null then update public.orc_musicians m set status = 'reserve' where m.id = a.musician_id; end if;
  update public.orc_applications x set status = new_status, decided_at = case when new_status in ('accepted','rejected','reserve') then now() else x.decided_at end,
    decided_by = case when new_status in ('accepted','rejected','reserve') then auth.uid() else x.decided_by end,
    note_to_candidate = coalesce(to_candidate, x.note_to_candidate) where x.id = app returning * into a;
  insert into public.orc_application_events (application_id, from_status, to_status, actor, note, actor_id) values (app, prev, new_status, 'staff', coalesce(note, ''), auth.uid());
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload) values (org, auth.uid(), 'application.status', 'orc_applications', app::text, jsonb_build_object('from', prev, 'to', new_status));
  return a;
end $$;

-- L'invio del profilo. Se chi manda ha un invito in corso per quell'organizzazione, la candidatura non
-- passa dalla valutazione: nasce accettata, e la persona compare fra i musicisti. Altrimenti, come prima.
create or replace function public.orc_submit_application(app uuid, msg text default '')
returns public.orc_applications language plpgsql security definer set search_path = public as $$
declare a public.orc_applications; missing text[]; inv public.orc_musician_invites; mid uuid;
begin
  select * into a from public.orc_applications x where x.id = app;
  if a.id is null or public.orc_profile_owner(a.profile_id) <> auth.uid() then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if a.status <> 'draft' then return a; end if;
  missing := public.orc_profile_missing(a.profile_id);
  if array_length(missing, 1) > 0 then raise exception 'profilo incompleto: %', array_to_string(missing, ', ') using errcode = '22023'; end if;
  update public.orc_applications x set status = 'submitted', submitted_at = now(), message = left(coalesce(msg, ''), 2000) where x.id = app returning * into a;
  insert into public.orc_application_events (application_id, from_status, to_status, actor, actor_id) values (app, 'draft', 'submitted', 'candidate', auth.uid());

  select * into inv from public.orc_musician_invites i
  where i.org_id = a.org_id and i.claimed_by = auth.uid() and i.status = 'claimed' and i.expires_at >= now()
  order by i.claimed_at desc limit 1;
  if inv.id is not null then
    /* invitato da loro: dentro subito. orc_application_accept crea o collega la riga in orc_musicians
       e ci copia strumenti, competenze e repertorio dichiarati. */
    mid := public.orc_application_accept(app);
    update public.orc_applications x set status = 'accepted', musician_id = mid, decided_at = now() where x.id = app returning * into a;
    insert into public.orc_application_events (application_id, from_status, to_status, actor, note, actor_id)
    values (app, 'submitted', 'accepted', 'system', 'entrata con invito', auth.uid());
    update public.orc_musician_invites set status = 'done', musician_id = mid where id = inv.id;
    insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
    values (a.org_id, auth.uid(), 'musician_invite.done', 'orc_musicians', mid::text, jsonb_build_object('invite_id', inv.id));
  end if;
  return a;
end $$;

-- Chi accede con un profilo Google senza nome e cognome (succede: account aziendali, profili scarni) non
-- riusciva nemmeno a creare il profilo: `last_name` restava NULL e la colonna non lo ammette. Il musicista
-- vedeva un errore del database e non poteva fare niente. Il cognome si chiede dopo, nel primo passo.
create or replace function public.orc_ensure_musician_profile()
returns public.orc_musician_profiles language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); meta jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb); p public.orc_musician_profiles; nome text;
begin
  if uid is null then raise exception 'non autenticato' using errcode = '28000'; end if;
  select * into p from public.orc_musician_profiles x where x.user_id = uid;
  if p.id is not null then return p; end if;
  nome := coalesce(nullif(trim(meta ->> 'full_name'), ''), nullif(trim(meta ->> 'name'), ''), '');
  insert into public.orc_musician_profiles (user_id, first_name, last_name, email)
  values (uid, split_part(nome, ' ', 1), coalesce(nullif(trim(substr(nome, length(split_part(nome, ' ', 1)) + 1)), ''), ''),
          lower(coalesce(auth.jwt() ->> 'email', '')))
  returning * into p;
  return p;
end $$;

-- L'invito che ho in corso, per me che l'ho aperto. Serve perché la pagina del musicista non se lo
-- dimentichi appena si ricarica: chi arriva da un link deve continuare a leggere «X ti ha invitato,
-- appena mandi sei dentro» fino a quando manda, non solo nel primo secondo. Non svela niente di nuovo:
-- dice a una persona una cosa che riguarda lei.
create or replace function public.orc_my_invite()
returns table (org_id uuid, org_name text)
language sql stable security definer set search_path = public as $$
  select i.org_id, o.name
  from public.orc_musician_invites i join public.orc_organizations o on o.id = i.org_id
  where i.claimed_by = auth.uid() and i.status = 'claimed' and i.expires_at >= now()
  order by i.claimed_at desc limit 1
$$;

-- Gli inviti aperti, per chi li ha mandati.
create or replace function public.orc_musician_invites_list(org uuid)
returns table (id uuid, label text, email text, note text, status text, created_at timestamptz, expires_at timestamptz,
  claimed_at timestamptz, musician_id uuid, musician_name text)
language sql stable security definer set search_path = public as $$
  select i.id, i.label, i.email, i.note,
    case when i.status = 'open' and i.expires_at < now() then 'expired' else i.status end,
    i.created_at, i.expires_at, i.claimed_at, i.musician_id,
    case when m.id is null then null else m.last_name || ' ' || m.first_name end
  from public.orc_musician_invites i
  left join public.orc_musicians m on m.id = i.musician_id
  where i.org_id = org and public.orc_is_staff(org)
  order by case when i.status in ('open','claimed') then 0 else 1 end, i.created_at desc
$$;

revoke all on function public.orc_application_accept(uuid) from public, anon, authenticated;
grant execute on function public.orc_application_accept(uuid) to service_role;
revoke all on function public.orc_ensure_musician_profile() from public, anon;
grant execute on function public.orc_ensure_musician_profile() to authenticated, service_role;
revoke all on function public.orc_musician_invite_create(uuid, text, text, text, text, integer),
  public.orc_musician_invite_revoke(uuid), public.orc_musician_invite_claim(text), public.orc_my_invite(),
  public.orc_musician_invites_list(uuid), public.orc_submit_application(uuid, text) from public, anon;
grant execute on function public.orc_musician_invite_create(uuid, text, text, text, text, integer),
  public.orc_musician_invite_revoke(uuid), public.orc_musician_invite_claim(text), public.orc_my_invite(),
  public.orc_musician_invites_list(uuid), public.orc_submit_application(uuid, text) to authenticated, service_role;
