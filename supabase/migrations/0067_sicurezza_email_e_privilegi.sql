-- Sicurezza (audit dell'11/09, dopo il collaudo a tre profili).
--
-- 1. LE EMAIL AL CLIENTE PARTIVANO VERSO UN INDIRIZZO SCELTO DA LUI. La conferma della richiesta e
--    l'email del preventivo andavano a `contact_email`, il campo che il cliente scrive nel modulo. Chiunque
--    con un account Google poteva far arrivare, dal nostro dominio, un'email con un titolo e delle note
--    scritti da lui a una persona qualsiasi: phishing con il nostro nome, e spam che rovina la reputazione
--    del dominio che spedisce. Ora il database scrive in `account_email` l'indirizzo verificato
--    dell'account (quello del login Google, da auth.users) e le Edge Function spediscono solo lì — che è
--    anche l'unico indirizzo con cui si può aprire il preventivo. `contact_email` resta come informazione
--    per lo staff. La colonna entra nella guardia: una richiesta ricevuta non si modifica.
--    E un limite: cinque richieste al giorno per account.
--
-- 2. PRIVILEGI CHE NESSUNO USA. `anon` e `authenticated` avevano TRUNCATE, TRIGGER e REFERENCES su tutte
--    le tabelle (le concessioni di partenza di Supabase). L'API REST non espone TRUNCATE, quindi oggi non
--    si raggiunge; ma TRUNCATE svuota una tabella ignorando le policy, e una funzione scritta male domani
--    lo renderebbe raggiungibile. Seconda serratura: si tolgono, anche per le tabelle future.
--
-- 3. Una funzione trigger eseguibile da PUBLIC: non si chiama da fuori, ma non c'è motivo di concederla.

alter table public.orc_client_requests add column if not exists account_email text not null default '';
/* le richieste già arrivate: l'indirizzo del loro account. La guardia qui sotto rende la colonna immutabile;
   il riempimento la sospende solo per sé, così la migrazione resta rieseguibile */
alter table public.orc_client_requests disable trigger orc_client_requests_guard_trg;
update public.orc_client_requests r set account_email = lower(coalesce(u.email, ''))
  from auth.users u where u.id = r.user_id and r.account_email = '';
alter table public.orc_client_requests enable trigger orc_client_requests_guard_trg;

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
     or new.formation_unknown is distinct from old.formation_unknown
     or new.account_email is distinct from old.account_email then
    raise exception 'la richiesta ricevuta non si modifica' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.orc_client_request_create(project uuid, snap jsonb, fields jsonb, slots jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare org uuid; rid uuid; s jsonb; n int := 0; clean jsonb; uid uuid := auth.uid(); verificata text;
begin
  if uid is null then raise exception 'serve un accesso' using errcode = '42501'; end if;
  /* un limite: ogni richiesta manda due email (alla società e al cliente). Senza, un account poteva
     mandarne a centinaia — spam alla casella della società e al dominio che le spedisce */
  if (select count(*) from public.orc_client_requests x where x.user_id = uid and x.created_at > now() - interval '1 day') >= 5 then
    raise exception 'hai già mandato cinque richieste oggi: se ne serve un''altra scrivici';
  end if;
  select lower(coalesce(u.email, '')) into verificata from auth.users u where u.id = uid;
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
    event_kind, event_title, event_when, event_place, schedule, repertoire, budget, notes, formation_unknown, account_email)
  values (org, uid, project, clean,
    left(trim(coalesce(fields ->> 'contact_name', '')), 80), left(coalesce(fields ->> 'contact_company', ''), 120),
    lower(left(trim(coalesce(fields ->> 'contact_email', '')), 160)), left(coalesce(fields ->> 'contact_phone', ''), 40),
    coalesce(nullif(fields ->> 'event_kind', ''), 'concerto'), left(trim(coalesce(fields ->> 'event_title', '')), 160),
    left(coalesce(fields ->> 'event_when', ''), 160), left(coalesce(fields ->> 'event_place', ''), 160),
    left(coalesce(fields ->> 'schedule', ''), 2000), left(coalesce(fields ->> 'repertoire', ''), 2000),
    left(coalesce(fields ->> 'budget', ''), 160), left(coalesce(fields ->> 'notes', ''), 4000),
    coalesce((fields ->> 'formation_unknown')::boolean, false), coalesce(verificata, ''))
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

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

revoke execute on function public.orc_roles_sync_slots() from public, anon;
