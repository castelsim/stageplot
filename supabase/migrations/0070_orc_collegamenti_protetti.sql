-- 0070 — Il collegamento fra una scheda e un musicista non si scrive a mano.
--
-- PERCHÉ (verifica di sicurezza del 28/09/2026): la policy orc_musicians_staff (0043) lascia allo staff
-- di un'organizzazione scrivere QUALSIASI colonna delle sue schede, compresi user_id e profile_id. Nessun
-- trigger lo impediva. Conseguenze:
--   · uno staff che conosce l'uuid di un profilo lo mette sulla sua scheda, e da lì il trigger di 0069
--     (orc_profile_to_musicians) gli copia telefono, città e bio del musicista a ogni modifica;
--   · azzerando profile_id si salta il controllo del consenso di orc_invite (0066);
--   · con user_id si fanno comparire convocazioni nell'area di un altro musicista.
-- I collegamenti legittimi nascono SOLO dentro funzioni security definer (candidatura accettata,
-- orc_link_my_musician_rows con l'email verificata) o dal service role: lì current_user non è
-- «authenticated». L'app non scrive mai queste due colonne (orchestre/src/api/musicians.js, FIELDS).
--
-- Regola: una scrittura fatta DIRETTAMENTE da un utente collegato (PostgREST, ruolo authenticated) non
-- può impostare user_id/profile_id su una scheda nuova, né cambiarli su una esistente.

create or replace function public.orc_musicians_collegamenti_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;   -- funzioni security definer, service role, migrazioni
  end if;
  if tg_op = 'INSERT' then
    if new.user_id is not null or new.profile_id is not null then
      raise exception using errcode = '42501',
        message = 'orchestre: il collegamento a un musicista nasce solo da una candidatura o dal suo account';
    end if;
  elsif new.user_id is distinct from old.user_id or new.profile_id is distinct from old.profile_id then
    raise exception using errcode = '42501',
      message = 'orchestre: il collegamento a un musicista non si cambia a mano';
  end if;
  return new;
end $$;
revoke all on function public.orc_musicians_collegamenti_guard() from public, anon, authenticated;

drop trigger if exists orc_musicians_collegamenti_guard_trg on public.orc_musicians;
create trigger orc_musicians_collegamenti_guard_trg before insert or update on public.orc_musicians
  for each row execute function public.orc_musicians_collegamenti_guard();
