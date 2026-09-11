-- Le convocazioni dopo il collaudo a tre profili (11/09).
--
--   · IL MUSICISTA CONFERMATO NON LO SAPEVA. La conferma assegnava il posto e metteva
--     `notification_status = 'none'`: nessuna email. Idem la revoca di una conferma. Ora tutte e due
--     mettono in coda un avviso (`notification_kind` 'confirmed' / 'revoked'), che parte subito dalla
--     pagina (Edge Function `orc-invite-notify`) e, se no, al giro del worker.
--   · LA RISPOSTA CAMBIATA NON SI VEDEVA. Il link della convocazione è una chiave: chi lo riceve inoltrato
--     può cambiare la risposta. Non si può impedire senza chiedere un accesso a ogni musicista, ma si deve
--     vedere: `orc_invitations_list` porta quante volte ha risposto, e la pagina lo dice sulla riga.
--     Cambia il tipo restituito: si ricrea, stessi permessi.

alter table public.orc_invitations drop constraint if exists orc_invitations_kind_chk;
alter table public.orc_invitations add constraint orc_invitations_kind_chk check (notification_kind in ('invite','reminder','confirmed','revoked'));

create or replace function public.orc_invitation_action(invitation uuid, action text, reason text default '')
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  i public.orc_invitations; slot uuid; tok text;
begin
  select * into i from public.orc_invitations x where x.id = invitation;
  if i.id is null then raise exception 'invito inesistente' using errcode = 'P0002'; end if;
  if not public.orc_is_staff(i.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if action = 'confirm' then
    if i.status not in ('available','partial','reserve') then raise exception 'si conferma solo chi si è detto disponibile' using errcode = '22023'; end if;
    select s.id into slot from public.orc_staffing_slots s where s.role_id = i.role_id and s.status = 'open' order by s.seat_no limit 1;
    if slot is null then raise exception 'nessun posto scoperto in questo ruolo' using errcode = '23505'; end if;
    perform public.orc_assign_slot(slot, i.musician_id, coalesce(nullif(reason, ''), 'convocazione accettata'));
    /* e glielo si dice: prima notification_status = 'none', e il musicista confermato non riceveva niente */
    update public.orc_invitations x set status = 'confirmed', slot_id = slot, notification_kind = 'confirmed', notification_status = 'pending',
      notification_attempts = 0, notification_last_error = '', notification_claimed_at = null where x.id = invitation;
    insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (invitation, 'confirmed', 'staff', jsonb_build_object('slot_id', slot));
  elsif action = 'reserve' then
    if i.status not in ('available','partial') then raise exception 'in riserva va chi si è detto disponibile' using errcode = '22023'; end if;
    update public.orc_invitations x set status = 'reserve' where x.id = invitation;
    insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (invitation, 'reserve_set', 'staff', jsonb_build_object('reason', coalesce(reason, '')));
  elsif action = 'cancel' then
    if i.status in ('confirmed','cancelled','revoked') then raise exception 'non annullabile in questo stato' using errcode = '22023'; end if;
    update public.orc_invitations x set status = 'cancelled', notification_status = 'none' where x.id = invitation;
    delete from public.orc_invitation_secrets s where s.invitation_id = invitation;
    insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (invitation, 'cancelled', 'staff', jsonb_build_object('reason', coalesce(reason, '')));
  elsif action = 'remind' then
    if i.status not in ('sent','viewed') then raise exception 'il promemoria vale per chi non ha ancora risposto' using errcode = '22023'; end if;
    if i.notification_status in ('pending','sending') then raise exception 'una spedizione è già in coda' using errcode = '22023'; end if;
    tok := encode(gen_random_bytes(24), 'hex');
    update public.orc_invitations x set token_hash = encode(digest(tok, 'sha256'), 'hex'), notification_kind = 'reminder',
      notification_status = 'pending', notification_attempts = 0, notification_last_error = '', notification_claimed_at = null where x.id = invitation;
    insert into public.orc_invitation_secrets (invitation_id, token) values (invitation, tok) on conflict (invitation_id) do update set token = excluded.token, created_at = now();
    insert into public.orc_invitation_events (invitation_id, event, actor) values (invitation, 'reminder_queued', 'staff');
  elsif action = 'revoke' then
    if i.status <> 'confirmed' then raise exception 'si revoca solo una conferma' using errcode = '22023'; end if;
    if i.slot_id is not null then perform public.orc_release_slot(i.slot_id, 'revoked', coalesce(reason, '')); end if;
    update public.orc_invitations x set status = 'revoked', notification_kind = 'revoked', notification_status = 'pending',
      notification_attempts = 0, notification_last_error = '', notification_claimed_at = null where x.id = invitation;
    insert into public.orc_invitation_events (invitation_id, event, actor, meta) values (invitation, 'revoked', 'staff', jsonb_build_object('reason', coalesce(reason, '')));
  else
    raise exception 'azione non valida: %', action using errcode = '22023';
  end if;
end $$;

drop function if exists public.orc_invitations_list(uuid);
create or replace function public.orc_invitations_list(production uuid)
returns table (id uuid, role_id uuid, role_name text, musician_id uuid, musician_name text, musician_email text, wave integer, status text,
  deadline timestamptz, sent_at timestamptz, viewed_at timestamptz, responded_at timestamptz, note_musician text, note_admin text,
  notification_status text, notification_kind text, notification_last_error text, slot_seat integer,
  dates_yes bigint, dates_no bigint, dates_total bigint, created_at timestamptz, n_answers bigint)
language sql stable security definer set search_path = public as $$
  select i.id, i.role_id, r.name, i.musician_id, m.last_name || ' ' || m.first_name, m.email, i.wave, i.status,
    i.deadline, i.sent_at, i.viewed_at, i.responded_at, i.note_musician, i.note_admin,
    i.notification_status, i.notification_kind, i.notification_last_error, s.seat_no,
    (select count(*) from public.orc_invitation_dates d where d.invitation_id = i.id and d.available = true),
    (select count(*) from public.orc_invitation_dates d where d.invitation_id = i.id and d.available = false),
    (select count(*) from public.orc_invitation_dates d where d.invitation_id = i.id),
    i.created_at,
    (select count(*) from public.orc_invitation_events e where e.invitation_id = i.id and e.event = 'responded')
  from public.orc_invitations i
  join public.orc_staffing_roles r on r.id = i.role_id
  join public.orc_musicians m on m.id = i.musician_id
  left join public.orc_staffing_slots s on s.id = i.slot_id
  where i.production_id = production and public.orc_is_staff(public.orc_production_org(production))
  order by r.sort, i.wave, i.created_at
$$;

revoke all on function public.orc_invitations_list(uuid) from public, anon;
grant execute on function public.orc_invitations_list(uuid) to authenticated, service_role;
