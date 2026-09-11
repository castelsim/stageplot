-- Dalla richiesta accettata all'evento, con un tasto.
--
-- Il cliente accetta il preventivo e la richiesta diventa «accettata». Da lì la società deve mettere in
-- piedi la produzione: evento, luogo, e i posti da coprire, per poi cercare i musicisti e convocarli.
-- Fin qui voleva dire ricopiare tutto a mano in una produzione nuova — il collegamento esisteva nel
-- database (`production_id` sulla richiesta, 0052) ma nessun pulsante lo usava.
--
-- `orc_production_from_request` crea la produzione da quello che la richiesta sa già:
--   · titolo, cliente, tipologia, luogo e — nelle note — quando, orari, repertorio, budget e note;
--   · il palco collegato, se il cliente l'aveva allegato;
--   · la descrizione del preventivo accettato, se c'è: è la formazione concordata;
--   · un ruolo per ogni posto chiesto e non coperto dal cliente, con il suo strumento — i posti veri li
--     genera il trigger dei ruoli, come quando si compone l'organico a mano. Se la formazione era «da
--     definire», i posti arrivano dalle righe del preventivo, senza strumento: si precisano poi.
--
-- È idempotente: se la richiesta ha già la sua produzione, la restituisce e non ne crea una seconda. Solo
-- lo staff dell'organizzazione che ha ricevuto la richiesta può chiamarla.

create or replace function public.orc_production_from_request(req uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.orc_client_requests; q public.orc_quotes; pid uuid; s record; l record; n int := 0; tipo text; nota text;
begin
  select * into r from public.orc_client_requests x where x.id = req;
  if r.id is null or not public.orc_is_staff(r.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if r.production_id is not null then return r.production_id; end if;

  select * into q from public.orc_quotes x where x.request_id = req and x.status in ('accepted', 'sent')
  order by case when x.status = 'accepted' then 0 else 1 end, x.sent_at desc limit 1;

  /* le tipologie della richiesta e quelle della produzione non coincidono del tutto */
  tipo := case r.event_kind when 'concerto' then 'concerto' when 'registrazione' then 'registrazione' when 'teatro' then 'teatro'
                            when 'tour' then 'tour' when 'matrimonio' then 'evento' when 'evento' then 'evento' else 'altro' end;
  nota := concat_ws(E'\n',
    case when r.event_when <> '' then 'Quando: ' || r.event_when end,
    case when r.schedule <> '' then 'Orari: ' || r.schedule end,
    case when r.repertoire <> '' then 'Repertorio: ' || r.repertoire end,
    case when r.budget <> '' then 'Budget indicato dal cliente: ' || r.budget end,
    case when r.formation_unknown then 'Il cliente non sapeva che formazione scegliere: la formazione è quella del preventivo.' end,
    case when r.notes <> '' then 'Note del cliente: ' || r.notes end);

  insert into public.orc_productions (org_id, title, client, description, kind, venue, notes, status, stageplot_project_id, created_by)
  values (r.org_id, r.event_title, concat_ws(' · ', nullif(r.contact_name, ''), nullif(r.contact_company, '')),
          coalesce(q.description, ''), tipo, r.event_place, left(coalesce(nota, ''), 4000), 'planning', r.project_id, auth.uid())
  returning id into pid;

  /* i posti: quelli chiesti e non coperti dal cliente, con il loro strumento */
  for s in select * from public.orc_client_request_slots x where x.request_id = req and not x.covered order by x.sort loop
    n := n + 1;
    insert into public.orc_staffing_roles (production_id, instrument_code, name, seats, sort)
    values (pid, s.instrument_code, coalesce(nullif(trim(s.label), ''), nullif(s.instrument_code, ''), 'Musicista'), greatest(1, least(200, s.qty)), n);
  end loop;
  /* formazione da definire: si parte dalle righe del preventivo, senza strumento — si precisa dopo */
  if n = 0 and q.id is not null then
    for l in select * from public.orc_quote_lines x where x.quote_id = q.id order by x.sort loop
      n := n + 1;
      insert into public.orc_staffing_roles (production_id, name, seats, sort)
      values (pid, coalesce(nullif(trim(l.label), ''), 'Musicista'), greatest(1, least(200, l.qty)), n);
    end loop;
  end if;

  update public.orc_client_requests x set production_id = pid where x.id = req;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (r.org_id, auth.uid(), 'request.production', 'orc_productions', pid::text, jsonb_build_object('request_id', req, 'ruoli', n));
  return pid;
end $$;

revoke all on function public.orc_production_from_request(uuid) from public, anon;
grant execute on function public.orc_production_from_request(uuid) to authenticated, service_role;
