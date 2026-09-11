-- «Non so quale formazione scegliere», e la richiesta che parte anche senza un palco disegnato.
--
-- Fino a qui «Richiedi musicisti» presupponeva due cose: che il cliente avesse disegnato il palco, e che
-- sapesse dire quanti musicisti gli servono e di quale strumento. Chi organizza un matrimonio, o chi vuole
-- «qualcosa di bello per l'inaugurazione», non sa nessuna delle due — e si fermava sulla soglia.
--
-- Il palco era già facoltativo nel database (`project_id` e `snapshot` ammettono il vuoto): mancava
-- l'interfaccia, ed è quella la parte grossa di questo lotto. Qui c'è solo il pezzo che serve al database:
-- una richiesta può dichiarare che la formazione è **da definire**, e allora l'assenza di posti non è una
-- dimenticanza del cliente ma una domanda esplicita alla società: «dimmi tu cosa serve».
--
-- Resta com'era il resto: la richiesta arriva nella STESSA coda delle altre (decisione di Simone, 10/09) e
-- si legge «formazione da definire»; quello che è arrivato non si modifica; il cliente non vede altro che
-- la propria richiesta.

alter table public.orc_client_requests
  add column if not exists formation_unknown boolean not null default false;
comment on column public.orc_client_requests.formation_unknown is
  'Il cliente ha detto «non so quale formazione serve»: i posti mancano perché li propone la società, non per dimenticanza.';

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
     or new.project_id is distinct from old.project_id or new.created_at is distinct from old.created_at
     or new.formation_unknown is distinct from old.formation_unknown then
    raise exception 'la richiesta ricevuta non si modifica' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

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
    event_kind, event_title, event_when, event_place, schedule, repertoire, budget, notes, formation_unknown)
  values (org, uid, project, clean,
    left(trim(coalesce(fields ->> 'contact_name', '')), 80), left(coalesce(fields ->> 'contact_company', ''), 120),
    lower(left(trim(coalesce(fields ->> 'contact_email', '')), 160)), left(coalesce(fields ->> 'contact_phone', ''), 40),
    coalesce(nullif(fields ->> 'event_kind', ''), 'concerto'), left(trim(coalesce(fields ->> 'event_title', '')), 160),
    left(coalesce(fields ->> 'event_when', ''), 160), left(coalesce(fields ->> 'event_place', ''), 160),
    left(coalesce(fields ->> 'schedule', ''), 2000), left(coalesce(fields ->> 'repertoire', ''), 2000),
    left(coalesce(fields ->> 'budget', ''), 160), left(coalesce(fields ->> 'notes', ''), 4000),
    coalesce((fields ->> 'formation_unknown')::boolean, false))
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

drop function if exists public.orc_my_client_requests();
create or replace function public.orc_my_client_requests()
returns table (id uuid, event_title text, event_when text, event_place text, status text, created_at timestamptz, org_name text, n_needed integer, formation_unknown boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.event_title, r.event_when, r.event_place,
    case when r.status = 'new' then 'ricevuta' else 'in lavorazione' end,
    r.created_at, o.name,
    (select coalesce(sum(s.qty), 0)::int from public.orc_client_request_slots s where s.request_id = r.id and not s.covered),
    r.formation_unknown
  from public.orc_client_requests r join public.orc_organizations o on o.id = r.org_id
  where r.user_id = auth.uid()
  order by r.created_at desc
$$;

drop function if exists public.orc_client_requests_list(uuid);
create or replace function public.orc_client_requests_list(org uuid)
returns table (id uuid, contact_name text, contact_company text, contact_email text, contact_phone text,
  event_kind text, event_title text, event_when text, event_place text, status text, created_at timestamptz,
  production_id uuid, n_slots bigint, n_needed integer, project_id uuid, formation_unknown boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.contact_name, r.contact_company, r.contact_email, r.contact_phone,
    r.event_kind, r.event_title, r.event_when, r.event_place, r.status, r.created_at, r.production_id,
    (select count(*) from public.orc_client_request_slots s where s.request_id = r.id),
    (select coalesce(sum(s.qty), 0)::int from public.orc_client_request_slots s where s.request_id = r.id and not s.covered),
    r.project_id, r.formation_unknown
  from public.orc_client_requests r
  where r.org_id = org and public.orc_is_staff(org)
  order by case r.status when 'new' then 0 else 1 end, r.created_at desc
$$;

-- il drop si porta via anche i permessi: si rimettono, o le due letture smettono di funzionare
revoke all on function public.orc_my_client_requests(), public.orc_client_requests_list(uuid) from public, anon;
grant execute on function public.orc_my_client_requests(), public.orc_client_requests_list(uuid) to authenticated, service_role;
