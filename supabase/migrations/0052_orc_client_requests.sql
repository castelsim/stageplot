-- Orchestre — «Richiedi musicisti»: la richiesta di un cliente che ha disegnato il palco.
--
-- Il cliente di StagePlot (un utente qualsiasi dell'editor, non membro di nessuna organizzazione) descrive
-- l'evento e dice per quali postazioni gli serve un musicista. La richiesta arriva alla società di servizi,
-- che poi sceglie le persone e fa il preventivo: qui c'è solo il pezzo che arriva.
--
-- Tre scelte che vale la pena spiegare:
--
-- 1. La COPIA del palco è funzionale, non il documento. Non si archivia il blob del progetto (che contiene
--    anche i contatti dei collaboratori del cliente): si archivia solo quello che serve a capire la richiesta
--    — titolo, luogo, misure del palco, elenco delle postazioni-persona con etichetta e strumento. Meno dati
--    personali per costruzione, e resta leggibile fra un anno.
-- 2. La copia è IMMUTABILE. Il cliente continua a disegnare dopo l'invio: quello che è arrivato deve restare
--    com'era, altrimenti la richiesta cambia sotto gli occhi di chi la sta lavorando. Un trigger vieta di
--    toccare la copia e i dati dichiarati; lo staff può cambiare solo lo stato e l'evento collegato.
-- 3. Il cliente NON entra nel gestionale. Vede la propria richiesta e basta: non l'organizzazione, non i
--    musicisti, non le note interne.

alter table public.orc_organizations
  add column if not exists is_service_provider boolean not null default false;
comment on column public.orc_organizations.is_service_provider is
  'L''organizzazione che riceve le richieste dei clienti di StagePlot. Ne basta una; si accende a mano.';
create unique index if not exists orc_organizations_service_uidx
  on public.orc_organizations(is_service_provider) where is_service_provider;

create table if not exists public.orc_client_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,                                   -- il progetto vivo, senza vincolo: e dell'altro dominio
  snapshot jsonb not null default '{}'::jsonb,       -- la copia congelata del palco (senza dati di terzi)
  contact_name text not null,
  contact_company text not null default '',
  contact_email text not null,
  contact_phone text not null default '',
  event_kind text not null default 'concerto',
  event_title text not null,
  event_when text not null default '',               -- anche provvisorio: «fine ottobre», «14/12 da confermare»
  event_place text not null default '',
  schedule text not null default '',                 -- orari, prove, soundcheck
  repertoire text not null default '',
  budget text not null default '',
  notes text not null default '',
  status text not null default 'new',
  production_id uuid references public.orc_productions(id) on delete set null,
  taken_by uuid,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notification_status text not null default 'pending',
  notification_attempts integer not null default 0,
  notification_last_error text,
  notification_claimed_at timestamptz,
  ack_status text not null default 'pending',        -- la conferma al cliente: e un invio a parte
  ack_attempts integer not null default 0,
  constraint orc_client_requests_status_chk check (status in ('new','taken','quoted','won','lost','closed')),
  constraint orc_client_requests_nstatus_chk check (notification_status in ('pending','sending','sent','failed','none')),
  constraint orc_client_requests_ack_chk check (ack_status in ('pending','sending','sent','failed','none')),
  constraint orc_client_requests_name_chk check (length(trim(contact_name)) > 1),
  constraint orc_client_requests_email_chk check (position('@' in contact_email) > 1),
  constraint orc_client_requests_title_chk check (length(trim(event_title)) > 1)
);
create index if not exists orc_client_requests_org_idx on public.orc_client_requests(org_id, status, created_at desc);
create index if not exists orc_client_requests_user_idx on public.orc_client_requests(user_id, created_at desc);
create index if not exists orc_client_requests_outbox_idx on public.orc_client_requests(notification_status, notification_attempts)
  where notification_status in ('pending','sending');

-- I posti chiesti: uno per postazione (o per gruppo, se il cliente chiede «4 violini»).
create table if not exists public.orc_client_request_slots (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.orc_client_requests(id) on delete cascade,
  item_id text not null default '',                  -- la postazione del disegno, se viene da lì
  label text not null default '',
  instrument_code text references public.orc_instruments(code),
  role_name text not null default '',
  qty integer not null default 1,
  covered boolean not null default false,            -- «questo lo copro io»
  note text not null default '',
  sort integer not null default 0,
  constraint orc_client_request_slots_qty_chk check (qty between 1 and 60)
);
create index if not exists orc_client_request_slots_idx on public.orc_client_request_slots(request_id, sort);

-- Quello che è arrivato resta com'è: si tocca solo la lavorazione (stato, evento, presa in carico).
create or replace function public.orc_client_requests_guard()
returns trigger language plpgsql as $$
begin
  if new.snapshot is distinct from old.snapshot
     or new.contact_name is distinct from old.contact_name or new.contact_email is distinct from old.contact_email
     or new.contact_company is distinct from old.contact_company or new.contact_phone is distinct from old.contact_phone
     or new.event_kind is distinct from old.event_kind or new.event_title is distinct from old.event_title
     or new.event_when is distinct from old.event_when or new.event_place is distinct from old.event_place
     or new.schedule is distinct from old.schedule or new.repertoire is distinct from old.repertoire
     or new.budget is distinct from old.budget or new.notes is distinct from old.notes
     or new.user_id is distinct from old.user_id or new.org_id is distinct from old.org_id
     or new.project_id is distinct from old.project_id or new.created_at is distinct from old.created_at then
    raise exception 'la richiesta ricevuta non si modifica' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists orc_client_requests_guard_trg on public.orc_client_requests;
create trigger orc_client_requests_guard_trg before update on public.orc_client_requests
  for each row execute function public.orc_client_requests_guard();

create or replace function public.orc_client_request_slots_guard()
returns trigger language plpgsql as $$
begin
  raise exception 'i posti della richiesta non si modificano' using errcode = '42501';
end $$;
drop trigger if exists orc_client_request_slots_guard_trg on public.orc_client_request_slots;
create trigger orc_client_request_slots_guard_trg before update or delete on public.orc_client_request_slots
  for each row execute function public.orc_client_request_slots_guard();

alter table public.orc_client_requests enable row level security;
alter table public.orc_client_request_slots enable row level security;

-- Il cliente vede solo la sua richiesta; la società vede quelle indirizzate a sé. Nessuno scrive
-- direttamente: si passa dalle RPC (la creazione valida il progetto, la lavorazione valida il ruolo).
drop policy if exists orc_cr_own_read on public.orc_client_requests;
create policy orc_cr_own_read on public.orc_client_requests for select using (user_id = auth.uid());
drop policy if exists orc_cr_staff_read on public.orc_client_requests;
create policy orc_cr_staff_read on public.orc_client_requests for select using (public.orc_is_staff(org_id));
drop policy if exists orc_crs_read on public.orc_client_request_slots;
create policy orc_crs_read on public.orc_client_request_slots for select using (
  exists (select 1 from public.orc_client_requests r where r.id = request_id and (r.user_id = auth.uid() or public.orc_is_staff(r.org_id))));

grant select on public.orc_client_requests, public.orc_client_request_slots to authenticated;
grant all on public.orc_client_requests, public.orc_client_request_slots to service_role;

-- Chi riceve le richieste: la società. Serve al client per sapere se il pulsante ha una destinazione.
create or replace function public.orc_service_org()
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.name from public.orc_organizations o where o.is_service_provider limit 1
$$;

-- La creazione. `slots` = [{item_id,label,instrument_code,role_name,qty,covered,note}]
create or replace function public.orc_client_request_create(project uuid, snap jsonb, fields jsonb, slots jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare org uuid; rid uuid; s jsonb; n int := 0; clean jsonb; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'serve un accesso' using errcode = '42501'; end if;
  select o.id into org from public.orc_organizations o where o.is_service_provider limit 1;
  if org is null then raise exception 'il servizio non e attivo' using errcode = '22023'; end if;
  -- il progetto, se indicato, dev'essere di chi manda la richiesta: non si allega il palco di un altro
  if project is not null and not exists (
    select 1 from public.stageplot_projects p where p.id = project and p.user_id = uid and p.deleted_at is null) then
    raise exception 'progetto non tuo' using errcode = '42501';
  end if;
  -- la copia porta solo quello che serve: niente contatti, niente rubrica, niente allegati del progetto
  clean := coalesce(snap, '{}'::jsonb) - 'contacts' - 'techContact' - 'pdfHeader' - 'rider' - 'approval';
  insert into public.orc_client_requests (org_id, user_id, project_id, snapshot,
    contact_name, contact_company, contact_email, contact_phone,
    event_kind, event_title, event_when, event_place, schedule, repertoire, budget, notes)
  values (org, uid, project, clean,
    left(trim(coalesce(fields ->> 'contact_name', '')), 80), left(coalesce(fields ->> 'contact_company', ''), 120),
    lower(left(trim(coalesce(fields ->> 'contact_email', '')), 160)), left(coalesce(fields ->> 'contact_phone', ''), 40),
    coalesce(nullif(fields ->> 'event_kind', ''), 'concerto'), left(trim(coalesce(fields ->> 'event_title', '')), 160),
    left(coalesce(fields ->> 'event_when', ''), 160), left(coalesce(fields ->> 'event_place', ''), 160),
    left(coalesce(fields ->> 'schedule', ''), 2000), left(coalesce(fields ->> 'repertoire', ''), 2000),
    left(coalesce(fields ->> 'budget', ''), 160), left(coalesce(fields ->> 'notes', ''), 4000))
  returning id into rid;
  if jsonb_typeof(coalesce(slots, 'null'::jsonb)) = 'array' then
    for s in select * from jsonb_array_elements(slots) loop
      n := n + 1;
      insert into public.orc_client_request_slots (request_id, item_id, label, instrument_code, role_name, qty, covered, note, sort)
      values (rid, left(coalesce(s ->> 'item_id', ''), 80), left(coalesce(s ->> 'label', ''), 80),
        (select i.code from public.orc_instruments i where i.code = s ->> 'instrument_code'),
        left(coalesce(s ->> 'role_name', ''), 80), greatest(1, least(60, coalesce((s ->> 'qty')::int, 1))),
        coalesce((s ->> 'covered')::boolean, false), left(coalesce(s ->> 'note', ''), 400), n);
    end loop;
  end if;
  return rid;
end $$;

-- Quello che il cliente rivede della propria richiesta (nessun dato interno).
drop function if exists public.orc_my_client_requests();
create or replace function public.orc_my_client_requests()
returns table (id uuid, event_title text, event_when text, event_place text, status text, created_at timestamptz, org_name text, n_needed integer)
language sql stable security definer set search_path = public as $$
  select r.id, r.event_title, r.event_when, r.event_place,
    case when r.status = 'new' then 'ricevuta' else 'in lavorazione' end,
    r.created_at, o.name,
    (select coalesce(sum(s.qty), 0)::int from public.orc_client_request_slots s where s.request_id = r.id and not s.covered)
  from public.orc_client_requests r join public.orc_organizations o on o.id = r.org_id
  where r.user_id = auth.uid()
  order by r.created_at desc
$$;

-- L'elenco per la società.
create or replace function public.orc_client_requests_list(org uuid)
returns table (id uuid, contact_name text, contact_company text, contact_email text, contact_phone text,
  event_kind text, event_title text, event_when text, event_place text, status text, created_at timestamptz,
  production_id uuid, n_slots bigint, n_needed integer, project_id uuid)
language sql stable security definer set search_path = public as $$
  select r.id, r.contact_name, r.contact_company, r.contact_email, r.contact_phone,
    r.event_kind, r.event_title, r.event_when, r.event_place, r.status, r.created_at, r.production_id,
    (select count(*) from public.orc_client_request_slots s where s.request_id = r.id),
    (select coalesce(sum(s.qty), 0)::int from public.orc_client_request_slots s where s.request_id = r.id and not s.covered),
    r.project_id
  from public.orc_client_requests r
  where r.org_id = org and public.orc_is_staff(org)
  order by case r.status when 'new' then 0 else 1 end, r.created_at desc
$$;

-- La lavorazione: solo lo stato, la presa in carico e l'evento collegato.
create or replace function public.orc_client_request_set_status(req uuid, new_status text, production uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.orc_client_requests;
begin
  select * into r from public.orc_client_requests where id = req;
  if r.id is null then raise exception 'richiesta inesistente' using errcode = '22023'; end if;
  if not public.orc_is_staff(r.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if new_status not in ('new','taken','quoted','won','lost','closed') then raise exception 'stato non valido' using errcode = '22023'; end if;
  if production is not null and public.orc_production_org(production) is distinct from r.org_id then
    raise exception 'la produzione non e di questa organizzazione' using errcode = '42501';
  end if;
  update public.orc_client_requests set status = new_status,
    production_id = coalesce(production, production_id),
    taken_by = case when new_status = 'new' then null else coalesce(taken_by, auth.uid()) end,
    taken_at = case when new_status = 'new' then null else coalesce(taken_at, now()) end
  where id = req;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (r.org_id, auth.uid(), 'client_request.status', 'orc_client_requests', req::text,
    jsonb_build_object('from', r.status, 'to', new_status, 'production_id', production));
end $$;

revoke all on function public.orc_client_request_create(uuid, jsonb, jsonb, jsonb), public.orc_my_client_requests(),
  public.orc_client_requests_list(uuid), public.orc_client_request_set_status(uuid, text, uuid), public.orc_service_org() from public, anon;
grant execute on function public.orc_client_request_create(uuid, jsonb, jsonb, jsonb), public.orc_my_client_requests(),
  public.orc_client_requests_list(uuid), public.orc_client_request_set_status(uuid, text, uuid), public.orc_service_org() to authenticated, service_role;
