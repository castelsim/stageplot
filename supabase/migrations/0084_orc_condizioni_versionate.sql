-- 0084_orc_condizioni_versionate.sql — Orchestre, V1/d: condizioni versionate e riconferma.
--
-- IL PROBLEMA. Compenso, luogo, abbigliamento, testo delle condizioni e date stanno come testo sulla
-- produzione e sul ruolo. Se cambiano DOPO che qualcuno ha risposto «sì» (o è già confermato) nessuno lo
-- sa e non resta traccia di cosa aveva accettato: il link mostra sempre le condizioni di adesso.
--
-- LA SOLUZIONE (piano: stage orchestra/note/PIANO_V1D.md).
--   · `orc_condition_versions`: versioni append-only. Un solo contatore per produzione (1, 2, 3…); ogni riga
--     è di «ambito produzione» (role_id nullo: compenso comune, luogo, abbigliamento, testo, date) o di
--     «ambito ruolo» (compenso di quel ruolo). La versione 0 è la fotografia alla prima convocazione.
--     `snapshot` contiene SOLO ciò che il musicista vede: mai le note interne.
--   · Le versioni le scrivono i trigger, e solo se qualcuno è già stato interpellato (nessun rumore mentre
--     si prepara la produzione) e solo se il contenuto cambia davvero.
--   · «Da riconfermare» è DERIVATO, non memorizzato: invito con accepted_version < versione corrente del
--     SUO ruolo e almeno un campo che il musicista vede diverso. Nessun flag da tenere allineato.
--   · `accepted_version` = ultima versione APERTA dal musicista (seen_version) quando risponde: se le
--     condizioni cambiano fra l'apertura e la risposta, resta «da riconfermare» (sbaglia per prudenza).
--   · Nessun effetto automatico sui posti: chi è confermato resta confermato finché non dice no. Lo staff
--     vede chi manca (`orc_reconfirm_needed`) e manda la richiesta (`orc_reconfirm_request`, email nuova
--     con link nuovo, scadenza a 3 giorni). Il confermato può riconfermare o rinunciare dal link.
--
-- NON tocca `orc_invite` (la fotografia iniziale la scrive un trigger sull'inserimento dell'invito).
-- Riscrive, dall'ultima migrazione che le ha toccate: `orc_invitation_open` (0069), `orc_respond` (0046),
-- `orc_respond_mine` (0048), `orc_invitations_list` (0068). Idempotente. Non applicata: la lancia Simone.

-- ---------------------------------------------------------------- versioni
create table if not exists public.orc_condition_versions (
  id bigserial primary key,
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  production_id uuid not null references public.orc_productions(id) on delete cascade,
  role_id uuid references public.orc_staffing_roles(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  changed text[] not null default '{}',
  material boolean not null default false,
  reason text not null default '',
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint orc_condition_versions_version_chk check (version >= 0),
  constraint orc_condition_versions_reason_len check (char_length(reason) <= 500)
);
create unique index if not exists orc_condition_versions_key
  on public.orc_condition_versions (production_id, coalesce(role_id, '00000000-0000-0000-0000-000000000000'::uuid), version);
create index if not exists orc_condition_versions_prod_idx on public.orc_condition_versions (production_id, version desc);

-- Append-only (come orc_invitation_events: le produzioni si archiviano, non si cancellano). Unica eccezione:
-- il MOTIVO, che lo staff può scrivere una volta sola su una riga che ne è priva (`orc_conditions_set_reason`).
create or replace function public.orc_condition_versions_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.reason = '' and new.reason <> '' and (to_jsonb(new) - 'reason') = (to_jsonb(old) - 'reason') then return new; end if;
  raise exception 'orc_condition_versions è append-only' using errcode = '55000';
end $$;
drop trigger if exists orc_condition_versions_guard_trg on public.orc_condition_versions;
create trigger orc_condition_versions_guard_trg before update or delete on public.orc_condition_versions
  for each row execute function public.orc_condition_versions_guard();

revoke all on public.orc_condition_versions from anon, authenticated;
grant select on public.orc_condition_versions to authenticated;
grant all on public.orc_condition_versions to service_role;
grant usage, select on sequence public.orc_condition_versions_id_seq to service_role;
alter table public.orc_condition_versions enable row level security;
drop policy if exists orc_condition_versions_staff_select on public.orc_condition_versions;
create policy orc_condition_versions_staff_select on public.orc_condition_versions for select using (public.orc_is_staff(org_id));
-- nessuna policy di scrittura: scrivono solo i trigger (security definer)

-- ---------------------------------------------------------------- colonne sugli inviti
alter table public.orc_invitations add column if not exists seen_version integer;
alter table public.orc_invitations add column if not exists accepted_version integer;
alter table public.orc_invitations add column if not exists reconfirm_requested_at timestamptz;
alter table public.orc_invitations add column if not exists reconfirm_note text not null default '';
alter table public.orc_invitations drop constraint if exists orc_invitations_reconfirm_note_len;
alter table public.orc_invitations add constraint orc_invitations_reconfirm_note_len check (char_length(reconfirm_note) <= 500);
alter table public.orc_invitations drop constraint if exists orc_invitations_kind_chk;
alter table public.orc_invitations add constraint orc_invitations_kind_chk check (notification_kind in ('invite','reminder','confirmed','revoked','reconfirm'));

-- ---------------------------------------------------------------- fotografie (helper interni)
-- Le date in UTC e in testo: lo stesso istante dà lo stesso JSON qualunque sia il fuso della sessione.
create or replace function public.orc_cond_dates(pid uuid)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', d.kind,
    'starts_at', to_char(d.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'ends_at', case when d.ends_at is null then null else to_char(d.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
    'venue', d.venue, 'note', d.note) order by d.starts_at, d.kind, d.venue, d.note), '[]'::jsonb)
  from public.orc_production_dates d where d.production_id = pid
$$;

create or replace function public.orc_cond_prod_snap(pid uuid, fee text, cond text, dress text, ven text, addr text)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('fee_note', coalesce(fee, ''), 'conditions', coalesce(cond, ''), 'dress_code', coalesce(dress, ''),
    'venue', coalesce(ven, ''), 'address', coalesce(addr, ''), 'dates', public.orc_cond_dates(pid))
$$;

-- Scrive una versione se serve. snap_old (può mancare) serve solo a creare la fotografia iniziale di un
-- ambito che non l'ha ancora (inviti anteriori a questa migrazione).
create or replace function public.orc_cond_record(pid uuid, rid uuid, snap_old jsonb, snap_new jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  org uuid; prev jsonb; v int; chg text[]; mat boolean;
begin
  select p.org_id into org from public.orc_productions p where p.id = pid;
  if org is null then return; end if;
  /* nessun rumore finché nessuno è stato interpellato */
  if not exists (select 1 from public.orc_invitations i where i.production_id = pid and (rid is null or i.role_id = rid)
                 and i.status in ('draft','sent','viewed','available','partial','confirmed','reserve')) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('orc_cond:' || pid::text, 0));
  select c.snapshot into prev from public.orc_condition_versions c
    where c.production_id = pid and c.role_id is not distinct from rid order by c.version desc limit 1;
  if prev is null and snap_old is not null then
    insert into public.orc_condition_versions (org_id, production_id, role_id, version, snapshot, reason, changed_by)
    values (org, pid, rid, 0, snap_old, 'Condizioni alla prima convocazione', null) on conflict do nothing;
    prev := snap_old;
  end if;
  if prev is not null and prev = snap_new then return; end if;
  chg := coalesce(array(select k from jsonb_object_keys(snap_new) k where prev is null or (snap_new -> k) is distinct from (prev -> k) order by k), '{}');
  if cardinality(chg) = 0 then return; end if;
  /* importanti: compenso, luogo, date. Abbigliamento e testo no (lo staff può chiedere lo stesso la riconferma) */
  mat := chg && array['fee_note','venue','address','dates'];
  select coalesce(max(c.version), 0) + 1 into v from public.orc_condition_versions c where c.production_id = pid;
  insert into public.orc_condition_versions (org_id, production_id, role_id, version, snapshot, changed, material, changed_by)
  values (org, pid, rid, v, snap_new, chg, mat, auth.uid());
end $$;

-- Fotografia iniziale: al primo invito di un ambito, se l'ambito non ha ancora righe.
create or replace function public.orc_cond_baseline_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.orc_productions; r public.orc_staffing_roles;
begin
  select * into p from public.orc_productions x where x.id = new.production_id;
  select * into r from public.orc_staffing_roles x where x.id = new.role_id;
  if p.id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('orc_cond:' || p.id::text, 0));
  if not exists (select 1 from public.orc_condition_versions c where c.production_id = p.id and c.role_id is null) then
    insert into public.orc_condition_versions (org_id, production_id, role_id, version, snapshot, reason)
    values (p.org_id, p.id, null, 0, public.orc_cond_prod_snap(p.id, p.fee_note, p.conditions, p.dress_code, p.venue, p.address), 'Condizioni alla prima convocazione')
    on conflict do nothing;
  end if;
  if r.id is not null and not exists (select 1 from public.orc_condition_versions c where c.production_id = p.id and c.role_id = r.id) then
    insert into public.orc_condition_versions (org_id, production_id, role_id, version, snapshot, reason)
    values (p.org_id, p.id, r.id, 0, jsonb_build_object('fee_note', coalesce(r.fee_note, '')), 'Condizioni alla prima convocazione')
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists orc_cond_baseline_trg on public.orc_invitations;
create trigger orc_cond_baseline_trg after insert on public.orc_invitations
  for each row execute function public.orc_cond_baseline_trg();

-- Produzione: compenso comune, condizioni, abbigliamento, luogo.
create or replace function public.orc_cond_prod_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fee_note is distinct from old.fee_note or new.conditions is distinct from old.conditions or new.dress_code is distinct from old.dress_code
     or new.venue is distinct from old.venue or new.address is distinct from old.address then
    perform public.orc_cond_record(new.id, null,
      public.orc_cond_prod_snap(old.id, old.fee_note, old.conditions, old.dress_code, old.venue, old.address),
      public.orc_cond_prod_snap(new.id, new.fee_note, new.conditions, new.dress_code, new.venue, new.address));
  end if;
  return null;
end $$;
drop trigger if exists orc_cond_prod_trg on public.orc_productions;
create trigger orc_cond_prod_trg after update of fee_note, conditions, dress_code, venue, address on public.orc_productions
  for each row execute function public.orc_cond_prod_trg();

-- Ruolo: il suo compenso.
create or replace function public.orc_cond_role_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fee_note is distinct from old.fee_note then
    perform public.orc_cond_record(new.production_id, new.id, jsonb_build_object('fee_note', coalesce(old.fee_note, '')), jsonb_build_object('fee_note', coalesce(new.fee_note, '')));
  end if;
  return null;
end $$;
drop trigger if exists orc_cond_role_trg on public.orc_staffing_roles;
create trigger orc_cond_role_trg after update of fee_note on public.orc_staffing_roles
  for each row execute function public.orc_cond_role_trg();

-- Date: aggiunta, cambio, tolta. Non si può ricostruire com'erano prima: la fotografia iniziale c'è già
-- (la scrive l'invito); per gli inviti anteriori a questa migrazione la prima modifica delle date non ha un «prima».
create or replace function public.orc_cond_dates_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid; p public.orc_productions;
begin
  if tg_op = 'DELETE' then pid := old.production_id; else pid := new.production_id; end if;
  select * into p from public.orc_productions x where x.id = pid;
  if p.id is null then return null; end if;   /* produzione in cancellazione a cascata */
  perform public.orc_cond_record(pid, null, null, public.orc_cond_prod_snap(pid, p.fee_note, p.conditions, p.dress_code, p.venue, p.address));
  return null;
end $$;
drop trigger if exists orc_cond_dates_trg on public.orc_production_dates;
create trigger orc_cond_dates_trg after insert or update or delete on public.orc_production_dates
  for each row execute function public.orc_cond_dates_trg();

-- ---------------------------------------------------------------- lettura delle versioni (helper interni)
-- versione corrente per un ruolo: l'ultima dell'ambito produzione o del suo ruolo
create or replace function public.orc_inv_version(pid uuid, rid uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(max(c.version), 0) from public.orc_condition_versions c where c.production_id = pid and (c.role_id is null or c.role_id = rid)
$$;

-- le condizioni come le vede QUEL ruolo alla versione v: ambito produzione + compenso del ruolo
-- (il compenso del ruolo, se c'è, vince su quello comune: come in orc_invitation_open)
create or replace function public.orc_inv_snapshot(pid uuid, rid uuid, v integer)
returns jsonb language sql stable security definer set search_path = public as $$
  with pr as (select c.snapshot s from public.orc_condition_versions c where c.production_id = pid and c.role_id is null and c.version <= v order by c.version desc limit 1),
       ro as (select c.snapshot ->> 'fee_note' f from public.orc_condition_versions c where c.production_id = pid and c.role_id = rid and c.version <= v order by c.version desc limit 1)
  select case when not exists (select 1 from pr) then '{}'::jsonb
    else (select pr.s from pr) || jsonb_build_object('fee_note', coalesce(nullif((select ro.f from ro), ''), (select pr.s ->> 'fee_note' from pr), '')) end
$$;

-- i campi che il musicista vede diversi fra due versioni
create or replace function public.orc_inv_changed(pid uuid, rid uuid, v_from integer, v_to integer)
returns text[] language sql stable security definer set search_path = public as $$
  with a as (select public.orc_inv_snapshot(pid, rid, v_from) s), b as (select public.orc_inv_snapshot(pid, rid, v_to) s)
  select coalesce(array(select k from jsonb_object_keys((select b.s from b)) k where ((select a.s from a) -> k) is distinct from ((select b.s from b) -> k) order by k), '{}')
$$;

-- da riconfermare = ha risposto con le versioni (accepted_version non nullo) e da allora è cambiato qualcosa che vede
create or replace function public.orc_inv_stale(i public.orc_invitations)
returns boolean language sql stable security definer set search_path = public as $$
  select i.accepted_version is not null
    and public.orc_inv_version(i.production_id, i.role_id) > i.accepted_version
    and cardinality(public.orc_inv_changed(i.production_id, i.role_id, i.accepted_version, public.orc_inv_version(i.production_id, i.role_id))) > 0
$$;

-- il cambiamento è importante (compenso, luogo, date) per questo invito?
create or replace function public.orc_inv_material(i public.orc_invitations)
returns boolean language sql stable security definer set search_path = public as $$
  select i.accepted_version is not null and exists (
    select 1 from public.orc_condition_versions c
    where c.production_id = i.production_id and (c.role_id is null or c.role_id = i.role_id) and c.version > i.accepted_version and c.material)
$$;

revoke all on function public.orc_cond_dates(uuid), public.orc_cond_prod_snap(uuid, text, text, text, text, text),
  public.orc_cond_record(uuid, uuid, jsonb, jsonb), public.orc_cond_baseline_trg(), public.orc_cond_prod_trg(), public.orc_cond_role_trg(),
  public.orc_cond_dates_trg(), public.orc_inv_version(uuid, uuid), public.orc_inv_snapshot(uuid, uuid, integer),
  public.orc_inv_changed(uuid, uuid, integer, integer), public.orc_inv_stale(public.orc_invitations), public.orc_inv_material(public.orc_invitations)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- staff: storia, chi manca, chiedere la riconferma
create or replace function public.orc_conditions_history(production uuid)
returns table (id bigint, version integer, role_id uuid, role_name text, changed text[], material boolean, reason text, changed_at timestamptz, snapshot jsonb)
language sql stable security definer set search_path = public as $$
  select c.id, c.version, c.role_id, r.name, c.changed, c.material, c.reason, c.changed_at, c.snapshot
  from public.orc_condition_versions c
  left join public.orc_staffing_roles r on r.id = c.role_id
  where c.production_id = production and public.orc_is_staff(c.org_id)
  order by c.version desc, c.id desc
$$;

-- il motivo di un cambio: una volta sola, lo scrive lo staff dopo aver salvato
create or replace function public.orc_conditions_set_reason(version_id bigint, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.orc_condition_versions;
begin
  select * into c from public.orc_condition_versions x where x.id = version_id;
  if c.id is null then raise exception 'versione inesistente' using errcode = 'P0002'; end if;
  if not public.orc_is_staff(c.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if c.reason <> '' then raise exception 'il motivo è già scritto' using errcode = '22023'; end if;
  if char_length(trim(coalesce(orc_conditions_set_reason.reason, ''))) = 0 then raise exception 'motivo vuoto' using errcode = '22023'; end if;
  update public.orc_condition_versions x set reason = left(trim(orc_conditions_set_reason.reason), 500) where x.id = version_id;
end $$;

create or replace function public.orc_reconfirm_needed(production uuid)
returns table (invitation_id uuid, role_id uuid, role_name text, musician_id uuid, musician_name text, status text,
  accepted_version integer, current_version integer, changed text[], material boolean, requested_at timestamptz, notification_status text)
language sql stable security definer set search_path = public as $$
  select i.id, i.role_id, r.name, i.musician_id, m.last_name || ' ' || m.first_name, i.status,
    i.accepted_version, public.orc_inv_version(i.production_id, i.role_id),
    public.orc_inv_changed(i.production_id, i.role_id, i.accepted_version, public.orc_inv_version(i.production_id, i.role_id)),
    public.orc_inv_material(i), i.reconfirm_requested_at, i.notification_status
  from public.orc_invitations i
  join public.orc_staffing_roles r on r.id = i.role_id
  join public.orc_musicians m on m.id = i.musician_id
  where i.production_id = production and public.orc_is_staff(public.orc_production_org(production))
    and i.status in ('available','partial','confirmed','reserve') and public.orc_inv_stale(i)
  order by r.sort, m.last_name, m.first_name
$$;

-- Chiede la riconferma: nuovo link (il vecchio smette di valere, come per il promemoria), email 'reconfirm',
-- scadenza a 3 giorni. Le date nuove entrano nell'invito (risposta da dare). Torna quante richieste sono partite.
create or replace function public.orc_reconfirm_request(production uuid, invitation_ids uuid[], note text default '')
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare org uuid; x uuid; i public.orc_invitations; tok text; n int := 0;
begin
  org := public.orc_production_org(production);
  if org is null or not public.orc_is_staff(org) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  foreach x in array coalesce(invitation_ids, '{}') loop
    select * into i from public.orc_invitations v where v.id = x and v.production_id = production;
    if i.id is null then continue; end if;
    if i.status not in ('available','partial','confirmed','reserve') then continue; end if;
    if i.notification_status in ('pending','sending') then continue; end if;
    tok := encode(gen_random_bytes(24), 'hex');
    update public.orc_invitations v set token_hash = encode(digest(tok, 'sha256'), 'hex'), notification_kind = 'reconfirm',
      notification_status = 'pending', notification_attempts = 0, notification_last_error = '', notification_claimed_at = null,
      reconfirm_requested_at = now(), reconfirm_note = left(trim(coalesce(note, '')), 500), deadline = now() + interval '3 days'
      where v.id = i.id;
    insert into public.orc_invitation_secrets (invitation_id, token) values (i.id, tok)
      on conflict (invitation_id) do update set token = excluded.token, created_at = now();
    insert into public.orc_invitation_dates (invitation_id, date_id)
      select i.id, d.id from public.orc_production_dates d where d.production_id = production
      and not exists (select 1 from public.orc_invitation_dates z where z.invitation_id = i.id and z.date_id = d.id);
    insert into public.orc_invitation_events (invitation_id, event, actor, meta)
      values (i.id, 'reconfirm_queued', 'staff', jsonb_build_object('version', public.orc_inv_version(i.production_id, i.role_id), 'note', left(trim(coalesce(note, '')), 500)));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Per il worker delle email (solo service_role): cosa è cambiato per QUESTO invito, prima e dopo.
create or replace function public.orc_invitation_changes(invitation uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i public.orc_invitations; cur int;
begin
  select * into i from public.orc_invitations x where x.id = invitation;
  if i.id is null or i.accepted_version is null then return jsonb_build_object('changed', '[]'::jsonb); end if;
  cur := public.orc_inv_version(i.production_id, i.role_id);
  return jsonb_build_object('changed', to_jsonb(public.orc_inv_changed(i.production_id, i.role_id, i.accepted_version, cur)),
    'before', public.orc_inv_snapshot(i.production_id, i.role_id, i.accepted_version), 'after', public.orc_inv_snapshot(i.production_id, i.role_id, cur));
end $$;

-- ---------------------------------------------------------------- il musicista (service_role)
-- Apertura del link (testo di 0069) + versioni. «reconfirm» = le condizioni sono cambiate da quando ha risposto,
-- oppure lo staff ha chiesto la riconferma: anche chi è già confermato può allora rispondere (sì / non posso più).
create or replace function public.orc_invitation_open(token_hash_in text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.orc_invitations; p public.orc_productions; r public.orc_staffing_roles; o public.orc_organizations; m public.orc_musicians;
  expired boolean; mode text; cur int; stale boolean; chg text[]; vers jsonb;
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
  cur := public.orc_inv_version(i.production_id, i.role_id);
  stale := public.orc_inv_stale(i);
  /* la versione vista: se cambia fra l'apertura e la risposta, resta «da riconfermare» */
  if i.seen_version is distinct from cur then
    update public.orc_invitations x set seen_version = cur where x.id = i.id;
  end if;
  select * into p from public.orc_productions x where x.id = i.production_id;
  select * into r from public.orc_staffing_roles x where x.id = i.role_id;
  select * into o from public.orc_organizations x where x.id = i.org_id;
  select * into m from public.orc_musicians x where x.id = i.musician_id;
  mode := case when expired then 'expired'
    when i.status in ('confirmed','reserve') and (stale or i.reconfirm_requested_at is not null) then 'reconfirm'
    when i.status in ('confirmed','reserve') then 'locked' else 'write' end;
  vers := jsonb_build_object('current', cur, 'accepted', i.accepted_version, 'stale', stale, 'requested', i.reconfirm_requested_at is not null,
    'note', i.reconfirm_note);
  if stale then
    chg := public.orc_inv_changed(i.production_id, i.role_id, i.accepted_version, cur);
    vers := vers || jsonb_build_object('changed', to_jsonb(chg), 'before', public.orc_inv_snapshot(i.production_id, i.role_id, i.accepted_version),
      'after', public.orc_inv_snapshot(i.production_id, i.role_id, cur));
  end if;
  return jsonb_build_object(
    'mode', mode, 'status', i.status, 'deadline', i.deadline, 'responded_at', i.responded_at, 'note', i.note_musician,
    'musician', jsonb_build_object('first_name', m.first_name),
    'organization', o.name,
    'production', jsonb_build_object('title', p.title, 'kind', p.kind, 'conductor', p.conductor, 'venue', p.venue, 'address', p.address,
      'fee_note', coalesce(nullif(r.fee_note, ''), p.fee_note), 'conditions', p.conditions, 'dress_code', p.dress_code, 'description', p.description),
    'role', jsonb_build_object('name', r.name, 'part', r.part, 'notes', r.notes),
    'note_admin', i.note_admin,
    'versions', vers,
    'dates', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'venue', d.venue, 'note', d.note, 'available', x.available) order by d.starts_at)
      from public.orc_invitation_dates x join public.orc_production_dates d on d.id = x.date_id where x.invitation_id = i.id), '[]'::jsonb));
end $$;

-- Risposta (testo di 0046): yes | no | partial. Novità: scrive accepted_version; il confermato o in riserva può
-- rispondere SOLO se le condizioni sono cambiate o lo staff ha chiesto la riconferma, e solo sì / no:
-- «sì» = riconferma (resta confermato), «no» = rinuncia (il posto torna scoperto, la storia dei posti lo registra).
create or replace function public.orc_respond(token_hash_in text, answer text, dates jsonb default '{}'::jsonb, note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.orc_invitations; d jsonb; yes int; no int; tot int; st text; cur int; acc int; reconf boolean := false;
begin
  select * into i from public.orc_invitations x where x.token_hash = token_hash_in;
  if i.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if i.status in ('cancelled','revoked','replaced','draft') then return jsonb_build_object('error', 'revoked'); end if;
  if answer not in ('yes','no','partial') then return jsonb_build_object('error', 'bad_answer'); end if;
  cur := public.orc_inv_version(i.production_id, i.role_id);
  acc := coalesce(i.seen_version, cur);
  if i.status in ('confirmed','reserve') then
    if not (i.reconfirm_requested_at is not null or public.orc_inv_stale(i)) then return jsonb_build_object('error', 'locked'); end if;
    if answer = 'partial' then return jsonb_build_object('error', 'locked'); end if;
    reconf := true;
  elsif i.deadline is not null and i.deadline < now() then return jsonb_build_object('error', 'expired'); end if;

  if reconf then
    if answer = 'yes' then
      update public.orc_invitation_dates x set available = true where x.invitation_id = i.id;
      update public.orc_invitations x set accepted_version = acc, reconfirm_requested_at = null, responded_at = now(), note_musician = left(coalesce(note, ''), 1000) where x.id = i.id;
      insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (i.id, 'reconfirmed', 'musician', jsonb_build_object('version', acc));
      return jsonb_build_object('ok', true, 'status', i.status, 'reconfirmed', true);
    end if;
    /* «non posso più»: il posto torna scoperto */
    update public.orc_invitation_dates x set available = false where x.invitation_id = i.id;
    if i.status = 'confirmed' and i.slot_id is not null then
      insert into public.orc_slot_events (slot_id, production_id, musician_id, event, reason, actor_id)
      values (i.slot_id, i.production_id, i.musician_id, 'withdrew', 'rinuncia dopo il cambio di condizioni', null);
      update public.orc_staffing_slots s set musician_id = null, status = 'open' where s.id = i.slot_id;
    end if;
    update public.orc_invitations x set status = 'unavailable', slot_id = null, accepted_version = acc, reconfirm_requested_at = null,
      responded_at = now(), note_musician = left(coalesce(note, ''), 1000) where x.id = i.id;
    insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (i.id, 'withdrew_after_change', 'musician', jsonb_build_object('version', acc, 'was', i.status));
    return jsonb_build_object('ok', true, 'status', 'unavailable', 'withdrew', true);
  end if;

  if answer = 'yes' then update public.orc_invitation_dates x set available = true where x.invitation_id = i.id;
  elsif answer = 'no' then update public.orc_invitation_dates x set available = false where x.invitation_id = i.id;
  else
    for d in select * from jsonb_array_elements(coalesce(dates, '[]'::jsonb)) loop
      update public.orc_invitation_dates x set available = (d ->> 'available')::boolean where x.invitation_id = i.id and x.date_id = (d ->> 'id')::uuid;
    end loop;
  end if;
  select count(*) filter (where x.available), count(*) filter (where x.available = false), count(*) into yes, no, tot from public.orc_invitation_dates x where x.invitation_id = i.id;
  st := case when answer = 'no' or (tot > 0 and yes = 0) then 'unavailable' when answer = 'yes' or (tot > 0 and yes = tot) then 'available' else 'partial' end;
  update public.orc_invitations x set status = st, responded_at = now(), note_musician = left(coalesce(note, ''), 1000),
    accepted_version = acc, reconfirm_requested_at = null where x.id = i.id;
  insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (i.id, 'responded', 'musician', jsonb_build_object('answer', st, 'yes', yes, 'no', no, 'version', acc));
  return jsonb_build_object('ok', true, 'status', st);
end $$;

-- Rispondere dall'area personale (testo di 0048): chi risponde da lì vede le condizioni di adesso.
create or replace function public.orc_respond_mine(invitation uuid, answer text, dates jsonb default '{}'::jsonb, note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text; pid uuid; rid uuid;
begin
  select i.token_hash, i.production_id, i.role_id into h, pid, rid from public.orc_invitations i join public.orc_musicians m on m.id = i.musician_id where i.id = invitation and m.user_id = auth.uid();
  if h is null then raise exception 'non autorizzato' using errcode = '42501'; end if;
  update public.orc_invitations x set seen_version = public.orc_inv_version(pid, rid) where x.id = invitation;
  return public.orc_respond(h, answer, dates, note);
end $$;

-- Elenco per la scheda Convocazioni (testo di 0068) + versioni.
drop function if exists public.orc_invitations_list(uuid);
create or replace function public.orc_invitations_list(production uuid)
returns table (id uuid, role_id uuid, role_name text, musician_id uuid, musician_name text, musician_email text, wave integer, status text,
  deadline timestamptz, sent_at timestamptz, viewed_at timestamptz, responded_at timestamptz, note_musician text, note_admin text,
  notification_status text, notification_kind text, notification_last_error text, slot_seat integer,
  dates_yes bigint, dates_no bigint, dates_total bigint, created_at timestamptz, n_answers bigint,
  accepted_version integer, current_version integer, stale boolean, reconfirm_requested_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.role_id, r.name, i.musician_id, m.last_name || ' ' || m.first_name, m.email, i.wave, i.status,
    i.deadline, i.sent_at, i.viewed_at, i.responded_at, i.note_musician, i.note_admin,
    i.notification_status, i.notification_kind, i.notification_last_error, s.seat_no,
    (select count(*) from public.orc_invitation_dates d where d.invitation_id = i.id and d.available = true),
    (select count(*) from public.orc_invitation_dates d where d.invitation_id = i.id and d.available = false),
    (select count(*) from public.orc_invitation_dates d where d.invitation_id = i.id),
    i.created_at,
    (select count(*) from public.orc_invitation_events e where e.invitation_id = i.id and e.event = 'responded'),
    i.accepted_version, public.orc_inv_version(i.production_id, i.role_id),
    (i.status in ('available','partial','confirmed','reserve') and public.orc_inv_stale(i)), i.reconfirm_requested_at
  from public.orc_invitations i
  join public.orc_staffing_roles r on r.id = i.role_id
  join public.orc_musicians m on m.id = i.musician_id
  left join public.orc_staffing_slots s on s.id = i.slot_id
  where i.production_id = production and public.orc_is_staff(public.orc_production_org(production))
  order by r.sort, i.wave, i.created_at
$$;

-- ---------------------------------------------------------------- pulizia account (test D9, rls-bgl-google)
-- orc_condition_versions.changed_by punta ad auth.users (on delete set null): chi ha modificato condizioni non è «solo biglietteria».
create or replace function public.bgl_account_solo_biglietteria(p_uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.bgl_pubblico where user_id = p_uid)
     and not exists (select 1 from public.stageplot_projects where user_id = p_uid)
     and not exists (select 1 from public.stageplot_contacts where user_id = p_uid)
     and not exists (select 1 from public.bgl_organizzatori where user_id = p_uid)
     and not exists (select 1 from public.bgl_eventi where user_id = p_uid)
     and not exists (select 1 from public.orc_profiles where id = p_uid)
     and not exists (select 1 from public.orc_memberships where user_id = p_uid)
     and not exists (select 1 from public.orc_musician_profiles where user_id = p_uid)
     -- e nessun altro dato che la cancellazione dell'account porterebbe via con sé (on delete cascade) o
     -- staccherebbe da lui: richieste, consensi, file, musicisti, reparti, consulenze. Meglio un «scrivici» in più
     -- che un dato di lavoro perso per una pulizia automatica.
     and not exists (select 1 from public.sp_requests where user_id = p_uid)
     and not exists (select 1 from public.orc_client_requests where user_id = p_uid)
     and not exists (select 1 from public.orc_consents where user_id = p_uid)
     and not exists (select 1 from public.orc_files where owner_user_id = p_uid)
     and not exists (select 1 from public.orc_musicians where user_id = p_uid)
     and not exists (select 1 from public.stageplot_dept_assign where user_id = p_uid)
     and not exists (select 1 from public.stageplot_item_contacts where user_id = p_uid)
     and not exists (select 1 from public.consultation_requests where user_id = p_uid)
     -- revisione T23: una segnalazione dall'editor (feedback, on delete set null) terrebbe l'email in chiaro staccata
     -- dall'account; e le colonne «creato da» di Orchestre. Un test controlla che ogni riferimento ad auth.users sia qui.
     and not exists (select 1 from public.feedback where user_id = p_uid)
     and not exists (select 1 from public.sp_request_versions where reopened_by = p_uid)
     and not exists (select 1 from public.orc_organizations where created_by = p_uid)
     and not exists (select 1 from public.orc_musicians where created_by = p_uid)
     and not exists (select 1 from public.orc_musician_exclusions where created_by = p_uid)
     and not exists (select 1 from public.orc_productions where created_by = p_uid)
     and not exists (select 1 from public.orc_matching_rulesets where created_by = p_uid)
     and not exists (select 1 from public.orc_matching_runs where ran_by = p_uid)
     and not exists (select 1 from public.orc_invitations where created_by = p_uid)
     and not exists (select 1 from public.orc_performance_feedback where author_id = p_uid)
     and not exists (select 1 from public.orc_evaluations where author_id = p_uid)
     and not exists (select 1 from public.orc_musician_invites where claimed_by = p_uid)
     and not exists (select 1 from public.prg_programmi where user_id = p_uid)
     and not exists (select 1 from public.orc_condition_versions where changed_by = p_uid)
$$;

-- ---------------------------------------------------------------- permessi
revoke all on function public.orc_conditions_history(uuid), public.orc_conditions_set_reason(bigint, text), public.orc_reconfirm_needed(uuid),
  public.orc_reconfirm_request(uuid, uuid[], text), public.orc_invitations_list(uuid) from public, anon;
grant execute on function public.orc_conditions_history(uuid), public.orc_conditions_set_reason(bigint, text), public.orc_reconfirm_needed(uuid),
  public.orc_reconfirm_request(uuid, uuid[], text), public.orc_invitations_list(uuid) to authenticated, service_role;
revoke all on function public.orc_invitation_open(text), public.orc_respond(text, text, jsonb, text), public.orc_invitation_changes(uuid) from public, anon, authenticated;
grant execute on function public.orc_invitation_open(text), public.orc_respond(text, text, jsonb, text), public.orc_invitation_changes(uuid) to service_role;
revoke all on function public.orc_respond_mine(uuid, text, jsonb, text) from public, anon;
grant execute on function public.orc_respond_mine(uuid, text, jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';
