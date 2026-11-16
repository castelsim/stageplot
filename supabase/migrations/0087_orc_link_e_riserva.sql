-- 0087_orc_link_e_riserva.sql — Orchestre, lotto B (16/11/2026): link di convocazione copiabili dallo staff e
-- «riserva» chiesta dal musicista (decisioni 3 e 7 di Simone).
--
-- LINK. Il token esiste solo come hash: lo staff non può rimandare un invito finito in spam se non via
-- promemoria email. `orc_invitation_relink(invitation)` genera un link NUOVO e lo restituisce UNA volta allo staff
-- (per WhatsApp): il vecchio smette di valere (il token è una chiave, si cambia, non si duplica). Non si può
-- su bozze (l'email non è ancora partita) né su inviti chiusi. Il token in chiaro non si conserva: l'eventuale
-- email già in coda viene annullata (niente segreto da spedire) e l'evento resta nella storia.
--
-- RISERVA. «Ci sono, ma solo se manca qualcuno»: stessa risposta «sì» di sempre + il segno `reserve_only`.
-- Lo staff lo vede e può confermare o mettere in riserva come prima. Nessuna riscrittura di `orc_respond`: un
-- trigger azzera il segno a ogni risposta normale, e solo le due funzioni nuove lo accendono.
-- Non applicata: la lancia Simone (`supabase db push`); l'Edge Function `orc-respond` va ridistribuita.

alter table public.orc_invitations add column if not exists reserve_only boolean not null default false;

create or replace function public.orc_invitations_reserve_reset()
returns trigger language plpgsql as $$
begin
  if new.responded_at is distinct from old.responded_at and new.reserve_only is not distinct from old.reserve_only then
    new.reserve_only := false;
  end if;
  return new;
end $$;
drop trigger if exists orc_invitations_reserve_reset_trg on public.orc_invitations;
create trigger orc_invitations_reserve_reset_trg before update on public.orc_invitations
  for each row execute function public.orc_invitations_reserve_reset();

-- Link dalla Edge Function (service_role): dopo orc_respond(..., 'yes') accende il segno.
create or replace function public.orc_mark_reserve(token_hash_in text)
returns boolean language plpgsql security definer set search_path = public as $$
declare iid uuid;
begin
  update public.orc_invitations x set reserve_only = true
   where x.token_hash = token_hash_in and x.status = 'available' returning x.id into iid;
  if iid is null then return false; end if;
  insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (iid, 'reserve_offered', 'musician', '{}'::jsonb);
  return true;
end $$;
revoke all on function public.orc_mark_reserve(text) from public, anon, authenticated;
grant execute on function public.orc_mark_reserve(text) to service_role;

-- Dall'area del musicista (autenticato): come orc_respond_mine ma «sì, solo se manca qualcuno».
create or replace function public.orc_respond_reserve_mine(invitation uuid, note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text; r jsonb;
begin
  select i.token_hash into h from public.orc_invitations i join public.orc_musicians m on m.id = i.musician_id where i.id = invitation and m.user_id = auth.uid();
  if h is null then raise exception 'non autorizzato' using errcode = '42501'; end if;
  r := public.orc_respond_mine(invitation, 'yes', '{}'::jsonb, note);
  if coalesce(r ->> 'status', '') = 'available' then perform public.orc_mark_reserve(h); end if;
  return r;
end $$;
revoke all on function public.orc_respond_reserve_mine(uuid, text) from public, anon;
grant execute on function public.orc_respond_reserve_mine(uuid, text) to authenticated, service_role;

-- Nuovo link per un invito già partito (solo staff). Restituisce il token in chiaro: una volta, non si conserva.
create or replace function public.orc_invitation_relink(invitation uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare i public.orc_invitations; tok text;
begin
  select * into i from public.orc_invitations x where x.id = invitation;
  if i.id is null then raise exception 'invito inesistente' using errcode = 'P0002'; end if;
  if not public.orc_is_staff(i.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if i.status not in ('sent','viewed','available','partial','unavailable','no_reply','confirmed','reserve') then
    raise exception 'il link si rigenera solo per un invito già partito e ancora aperto' using errcode = '22023';
  end if;
  tok := encode(gen_random_bytes(24), 'hex');
  update public.orc_invitations x set token_hash = encode(digest(tok, 'sha256'), 'hex'),
    notification_status = case when x.notification_status in ('pending','sending') then 'none' else x.notification_status end,
    notification_claimed_at = null where x.id = invitation;
  delete from public.orc_invitation_secrets s where s.invitation_id = invitation;
  insert into public.orc_invitation_events (invitation_id, event, actor) values (invitation, 'link_regenerated', 'staff');
  return tok;
end $$;
revoke all on function public.orc_invitation_relink(uuid) from public, anon;
grant execute on function public.orc_invitation_relink(uuid) to authenticated, service_role;
