-- 0088_orc_musicisti_archivio.sql — Orchestre, lotto C (16/11/2026): l'archivio dei musicisti si può ritrovare,
-- ripristinare e — solo dal proprietario — cancellare per sempre (decisione 5 di Simone).
--
-- IL PROBLEMA. «Archivia» imposta `deleted_at`: il musicista sparisce da elenco, filtri e scheda, e il testo dice
-- «nessun dato va perso»: vero, ma non si può né ritrovare né ripristinare, e non esiste la cancellazione vera (GDPR).
--
-- LA SOLUZIONE.
--   · `orc_musicians_archived(org)`: l'elenco degli archiviati (solo staff).
--   · `orc_musician_restore(musician)`: lo rimette nel pool (solo staff), con riga nel registro.
--   · `orc_musician_purge(musician, confirm_name)`: cancella DAVVERO (cascata sui dati della persona: strumenti,
--     inviti, candidature…). Solo il PROPRIETARIO, solo su un archiviato, e solo scrivendo il nome esatto. Il
--     registro (`orc_audit_log`) tiene che è successo, quando e chi: mai il nome né altri dati della persona.
--   Nessuna scrittura diretta nuova: tutto passa da funzioni. Non applicata: la lancia Simone (`supabase db push`).

create or replace function public.orc_musicians_archived(org uuid)
returns table (id uuid, first_name text, last_name text, email text, primary_instrument text, deleted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.first_name, m.last_name, m.email,
    (select i.name from public.orc_musician_instruments mi join public.orc_instruments i on i.code = mi.instrument_code
       where mi.musician_id = m.id order by mi.is_primary desc, i.sort limit 1),
    m.deleted_at
  from public.orc_musicians m
  where m.org_id = org and m.deleted_at is not null and public.orc_is_staff(org)
  order by m.deleted_at desc, m.last_name, m.first_name
$$;
revoke all on function public.orc_musicians_archived(uuid) from public, anon;
grant execute on function public.orc_musicians_archived(uuid) to authenticated, service_role;

create or replace function public.orc_musician_restore(musician uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.orc_musicians;
begin
  select * into m from public.orc_musicians x where x.id = musician;
  if m.id is null or not public.orc_is_staff(m.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if m.deleted_at is null then raise exception 'il musicista non è archiviato' using errcode = '22023'; end if;
  update public.orc_musicians x set deleted_at = null where x.id = musician;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (m.org_id, auth.uid(), 'musician.restore', 'orc_musicians', musician::text, jsonb_build_object('archived_at', m.deleted_at));
end $$;
revoke all on function public.orc_musician_restore(uuid) from public, anon;
grant execute on function public.orc_musician_restore(uuid) to authenticated, service_role;

-- Le tre storie «append-only» che toccano un musicista (inviti, posti, candidature) devono lasciar passare la
-- cascata SOLO dentro orc_musician_purge: la funzione accende un flag locale alla transazione, che nessun client
-- può impostare (non esistono funzioni esposte che lo facciano). Fuori da lì restano append-only come prima.
create or replace function public.orc_invitation_events_guard()
returns trigger language plpgsql as $$
begin
  if current_setting('orc.purge_musician', true) = 'on' then return case when tg_op = 'DELETE' then old else new end; end if;
  raise exception 'orc_invitation_events è append-only' using errcode = '55000';
end $$;
create or replace function public.orc_slot_events_guard()
returns trigger language plpgsql as $$
begin
  if current_setting('orc.purge_musician', true) = 'on' then return case when tg_op = 'DELETE' then old else new end; end if;
  raise exception 'orc_slot_events è append-only' using errcode = '55000';
end $$;
create or replace function public.orc_application_events_guard()
returns trigger language plpgsql as $$
begin
  if current_setting('orc.purge_musician', true) = 'on' then return case when tg_op = 'DELETE' then old else new end; end if;
  raise exception 'orc_application_events è append-only' using errcode = '55000';
end $$;

create or replace function public.orc_musician_purge(musician uuid, confirm_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.orc_musicians; n_inv integer;
begin
  select * into m from public.orc_musicians x where x.id = musician;
  if m.id is null or public.orc_member_role(m.org_id) is distinct from 'owner' then raise exception 'solo il proprietario può cancellare per sempre' using errcode = '42501'; end if;
  if m.deleted_at is null then raise exception 'si cancella solo un musicista già archiviato' using errcode = '22023'; end if;
  if lower(trim(coalesce(confirm_name, ''))) <> lower(m.last_name || ' ' || m.first_name) then raise exception 'il nome scritto non coincide' using errcode = '22023'; end if;
  select count(*) into n_inv from public.orc_invitations i where i.musician_id = musician;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (m.org_id, auth.uid(), 'musician.purge', 'orc_musicians', musician::text,
    jsonb_build_object('archived_at', m.deleted_at, 'had_account', m.user_id is not null, 'invitations', n_inv));
  perform set_config('orc.purge_musician', 'on', true);
  delete from public.orc_musicians x where x.id = musician;
  perform set_config('orc.purge_musician', 'off', true);
  return jsonb_build_object('ok', true, 'invitations', n_inv);
end $$;
revoke all on function public.orc_musician_purge(uuid, text) from public, anon;
grant execute on function public.orc_musician_purge(uuid, text) to authenticated, service_role;
