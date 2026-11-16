-- 0086_orc_organico_versioni.sql — Orchestre, lotto E (16/11/2026): versioni dell'organico per le stampe.
--
-- IL PROBLEMA. Il direttore di produzione porta in giro un foglio con l'organico e i nomi; se l'organico cambia
-- (un sostituto, un posto scoperto) nessuno sa quale foglio ha in mano. Regola di Simone (04/11 e 16/11):
-- «vN · data» su ogni foglio e MAI due fogli diversi con la stessa versione.
--
-- LA SOLUZIONE.
--   · `orc_staffing_versions`: una riga per versione, append-only. `snapshot` = l'organico com'era (sezione, ruolo,
--     posto, stato, persona), `fingerprint` = md5 dello snapshot.
--   · `orc_staffing_stamp(production)`: lo STAFF chiede «la versione di adesso». Lo snapshot lo costruisce il
--     SERVER dalle tabelle (il client non può dichiarare un organico che non esiste). Se l'impronta è uguale a
--     quella dell'ULTIMA versione si restituisce quella (stesso foglio = stessa versione); altrimenti nasce la
--     versione successiva. Restituisce anche la versione precedente per il «cambiato rispetto a prima».
--   · Lettura: solo staff (RLS). Nessuna scrittura dal client. Non applicata: la lancia Simone (`supabase db push`).

create table if not exists public.orc_staffing_versions (
  id bigserial primary key,
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  version integer not null,
  fingerprint text not null,
  snapshot jsonb not null,
  created_by uuid,   -- chi ha stampato; volutamente senza chiave verso auth.users (non entra nella pulizia degli account, 0078)
  created_at timestamptz not null default now(),
  constraint orc_staffing_versions_version_chk check (version >= 1)
);
create unique index if not exists orc_staffing_versions_key on public.orc_staffing_versions (production_id, version);
create index if not exists orc_staffing_versions_prod_idx on public.orc_staffing_versions (production_id, version desc);

create or replace function public.orc_staffing_versions_guard()
returns trigger language plpgsql as $$
begin
  raise exception 'orc_staffing_versions è append-only' using errcode = '55000';
end $$;
drop trigger if exists orc_staffing_versions_guard_trg on public.orc_staffing_versions;
create trigger orc_staffing_versions_guard_trg before update on public.orc_staffing_versions
  for each row execute function public.orc_staffing_versions_guard();

revoke all on public.orc_staffing_versions from anon, authenticated;
grant select on public.orc_staffing_versions to authenticated;
grant all on public.orc_staffing_versions to service_role;
grant usage, select on sequence public.orc_staffing_versions_id_seq to service_role;
alter table public.orc_staffing_versions enable row level security;
drop policy if exists orc_staffing_versions_staff_select on public.orc_staffing_versions;
create policy orc_staffing_versions_staff_select on public.orc_staffing_versions for select using (public.orc_is_staff(org_id));

create or replace function public.orc_staffing_stamp(production uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org uuid; snap jsonb; fp text; last_row public.orc_staffing_versions; prev_row public.orc_staffing_versions; v integer; created boolean := false;
begin
  org := public.orc_production_org(production);
  if org is null or not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('orc_staffing_stamp:' || production::text, 0));
  select coalesce(jsonb_agg(jsonb_build_object(
      'section', coalesce(s.name, ''), 'role', r.name, 'instrument', coalesce(i.name, ''), 'part', r.part,
      'seat', sl.seat_no, 'status', sl.status,
      'musician_id', sl.musician_id,
      'musician', case when m.id is null then null else m.last_name || ' ' || m.first_name end)
    order by coalesce(s.sort, 999), r.sort, r.id, sl.seat_no), '[]'::jsonb)
  into snap
  from public.orc_staffing_roles r
  left join public.orc_staffing_sections s on s.id = r.section_id
  left join public.orc_instruments i on i.code = r.instrument_code
  left join public.orc_staffing_slots sl on sl.role_id = r.id
  left join public.orc_musicians m on m.id = sl.musician_id
  where r.production_id = production;
  fp := md5(snap::text);
  select * into last_row from public.orc_staffing_versions x where x.production_id = production order by x.version desc limit 1;
  if last_row.id is not null and last_row.fingerprint = fp then
    v := last_row.version;
    select * into prev_row from public.orc_staffing_versions x where x.production_id = production and x.version = v - 1;
  else
    v := coalesce(last_row.version, 0) + 1;
    insert into public.orc_staffing_versions (org_id, production_id, version, fingerprint, snapshot, created_by)
    values (org, production, v, fp, snap, auth.uid());
    created := true;
    prev_row := last_row;
  end if;
  return jsonb_build_object('version', v, 'created', created, 'snapshot', snap,
    'at', (select x.created_at from public.orc_staffing_versions x where x.production_id = production and x.version = v),
    'previous', case when prev_row.id is null then null
      else jsonb_build_object('version', prev_row.version, 'at', prev_row.created_at, 'snapshot', prev_row.snapshot) end);
end $$;
revoke all on function public.orc_staffing_stamp(uuid) from public, anon;
grant execute on function public.orc_staffing_stamp(uuid) to authenticated, service_role;
