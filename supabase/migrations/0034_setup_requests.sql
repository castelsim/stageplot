-- 0034 — Richieste strutturate ai musicisti (R1: setup). Spec: docs/richieste/SPEC_R1.md
--
-- Modello GENERICO fin dal primo giorno: la stessa tabella regge setup, convocazioni, conferme e
-- chiarimenti cambiando request_type/schema_id. La richiesta è ancorata a (project_id, item_id):
-- l'elemento del blob È la postazione, come già fa stageplot_item_contacts (0016). La persona può
-- venire dalla rubrica (stageplot_contacts, 0014) ma nome e ruolo restano denormalizzati qui: il
-- musicista può non essere in rubrica, e il link deve funzionare anche se il contatto sparisce.
--
-- SICUREZZA
--  * il token del link NON è mai salvato in chiaro: solo token_hash (sha256 esadecimale, 64 char).
--    Il token vive nel link e nel client che l'ha generato. Chi legge il DB non può aprire i link.
--  * RLS: il tecnico proprietario vede e governa le sue richieste. L'anonimo NON ha policy: la
--    pagina del musicista passa esclusivamente dall'Edge Function con service role.
--  * le versioni inviate sono immutabili (trigger append-only, stesso principio di 0027).

create table if not exists public.sp_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.stageplot_projects(id) on delete cascade,
  item_id text not null default '',                 -- elemento del palco = postazione
  contact_id uuid references public.stageplot_contacts(id) on delete set null,
  request_type text not null default 'setup',
  schema_id text not null default 'electric_guitar_setup',
  recipient_name text not null default '',
  recipient_role text not null default '',
  technician_message text not null default '',
  status text not null default 'created',
  token_hash text not null,
  expires_at timestamptz,
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  opened_at timestamptz,
  submitted_at timestamptz,
  reopened_at timestamptz,
  reviewed_at timestamptz,
  implemented_at timestamptz,
  closed_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint sp_requests_status_chk check (status in
    ('created','sent','opened','in_progress','submitted','reopened','closed','expired','revoked')),
  constraint sp_requests_token_hash_chk check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint sp_requests_type_chk check (request_type in ('setup','call','confirm','clarification','other'))
);

-- il token è la chiave d'accesso: unico, e cercato per hash a ogni apertura del link
create unique index if not exists sp_requests_token_hash_key on public.sp_requests(token_hash);
create index if not exists sp_requests_project_idx on public.sp_requests(user_id, project_id, updated_at desc);
create index if not exists sp_requests_item_idx on public.sp_requests(project_id, item_id);

create table if not exists public.sp_request_versions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sp_requests(id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft',             -- draft | submitted
  answers jsonb not null default '{}'::jsonb,       -- risposte per chiave di domanda
  submitted_at timestamptz,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sp_request_versions_status_chk check (status in ('draft','submitted')),
  unique (request_id, version_number)
);
create index if not exists sp_request_versions_req_idx on public.sp_request_versions(request_id, version_number desc);

create table if not exists public.sp_request_events (
  id bigserial primary key,
  request_id uuid not null references public.sp_requests(id) on delete cascade,
  event text not null,
  actor text not null default 'system',             -- technician | recipient | system
  at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  constraint sp_request_events_actor_chk check (actor in ('technician','recipient','system'))
);
create index if not exists sp_request_events_req_idx on public.sp_request_events(request_id, at desc);

-- ---------------------------------------------------------------- immutabilità delle versioni
-- Una versione inviata è un documento storico: non si riscrive. Si può solo marcarla riaperta
-- (reopened_at/reopened_by), che è il gesto con cui il tecnico apre la versione SUCCESSIVA.
create or replace function public.sp_request_versions_guard()
returns trigger language plpgsql as $$
begin
  if old.status = 'submitted' then
    if new.answers is distinct from old.answers
       or new.status is distinct from old.status
       or new.version_number is distinct from old.version_number
       or new.submitted_at is distinct from old.submitted_at then
      raise exception 'versione già inviata: immutabile (request %, v%)', old.request_id, old.version_number;
    end if;
  end if;
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists sp_request_versions_guard_trg on public.sp_request_versions;
create trigger sp_request_versions_guard_trg
  before update on public.sp_request_versions
  for each row execute function public.sp_request_versions_guard();

create or replace function public.sp_requests_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists sp_requests_touch_trg on public.sp_requests;
create trigger sp_requests_touch_trg
  before update on public.sp_requests
  for each row execute function public.sp_requests_touch();

-- una versione non può appartenere a una richiesta di un altro utente: il legame è già FK, ma la
-- lettura passa sempre dalla richiesta (vedi policy sotto)

-- ---------------------------------------------------------------- RLS
alter table public.sp_requests enable row level security;
alter table public.sp_request_versions enable row level security;
alter table public.sp_request_events enable row level security;

drop policy if exists sp_requests_own on public.sp_requests;
create policy sp_requests_own on public.sp_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- versioni ed eventi: leggibili e scrivibili solo attraverso la richiesta di cui si è proprietari.
-- L'anonimo non ha NESSUNA policy: la pagina del musicista passa dall'Edge Function (service role).
drop policy if exists sp_request_versions_own on public.sp_request_versions;
create policy sp_request_versions_own on public.sp_request_versions
  for all using (exists (
      select 1 from public.sp_requests r where r.id = request_id and r.user_id = auth.uid()))
  with check (exists (
      select 1 from public.sp_requests r where r.id = request_id and r.user_id = auth.uid()));

drop policy if exists sp_request_events_own on public.sp_request_events;
create policy sp_request_events_own on public.sp_request_events
  for select using (exists (
      select 1 from public.sp_requests r where r.id = request_id and r.user_id = auth.uid()));
drop policy if exists sp_request_events_own_ins on public.sp_request_events;
create policy sp_request_events_own_ins on public.sp_request_events
  for insert with check (exists (
      select 1 from public.sp_requests r where r.id = request_id and r.user_id = auth.uid()));

comment on table public.sp_requests is
  'Richieste strutturate a una persona su una postazione (R1: setup musicista). Token solo hashato; accesso anonimo esclusivamente via Edge Function.';
