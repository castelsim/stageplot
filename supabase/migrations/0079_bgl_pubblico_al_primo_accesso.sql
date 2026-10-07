-- 0079 — Biglietteria: l'«origine biglietteria» si scrive al primo accesso con Google, non solo alla prima prenotazione.
--
-- PERCHÉ (07/10/2026, scelta di Simone): chi entrava con Google dalla scheda e poi non prenotava non aveva la riga in
-- bgl_pubblico. La pulizia dei 12 mesi non lo vedeva e «Elimina il mio account» lo mandava a scrivere a info@.
-- Le pagine pubbliche della biglietteria chiamano bgl_pubblico_registra() appena trovano una sessione Google.
-- Stessa regola di bgl_prenota (0078): solo per chi non usa l'editor (nessun progetto) e non organizza.
-- La cancellazione resta protetta da bgl_account_solo_biglietteria, che guarda tutte le tabelle dell'account.

create or replace function public.bgl_pubblico_registra()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  insert into public.bgl_pubblico (user_id)
  select uid
   where not exists (select 1 from public.stageplot_projects where user_id = uid)
     and not exists (select 1 from public.bgl_organizzatori where user_id = uid)
  on conflict (user_id) do update set ultimo_il = now();
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'pubblico', n > 0);
end $$;
revoke all on function public.bgl_pubblico_registra() from public, anon, authenticated;
grant execute on function public.bgl_pubblico_registra() to authenticated, service_role;
