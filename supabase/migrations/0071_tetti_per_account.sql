-- 0071 — Tetti per account: nessuno riempie il database da solo.
--
-- PERCHÉ (verifica di sicurezza del 28/09/2026): chiunque abbia un account Google gratuito poteva
-- scrivere via REST progetti di decine di MB e milioni di eventi analytics. Se il piano ha una quota
-- di spazio, Supabase mette il database in sola lettura per TUTTI.
--
-- I numeri vengono dai dati veri (dump del 27/09, 70 progetti): documento più grande 159 KB,
-- anteprima 137 KB, planimetrie 4,2 MB, account più attivo 23 progetti, al massimo 57 eventi di un
-- account in un'ora. L'editor ferma già il documento a 5 MB e le planimetrie a 15 MB (DATA_MAX,
-- VENUE_MAX): i tetti qui stanno appena sopra, così nessun salvataggio legittimo cambia comportamento.
-- Valgono per le scritture DIRETTE degli utenti (ruolo authenticated); service role e funzioni no.

-- dimensioni: vincoli sulla riga (esistenti tutte ben sotto)
alter table public.stageplot_projects
  drop constraint if exists stageplot_projects_data_max,
  drop constraint if exists stageplot_projects_thumbnail_max,
  drop constraint if exists stageplot_projects_venue_max,
  drop constraint if exists stageplot_projects_title_max;
alter table public.stageplot_projects
  add constraint stageplot_projects_data_max check (octet_length(data::text) <= 6 * 1024 * 1024),
  add constraint stageplot_projects_thumbnail_max check (thumbnail is null or octet_length(thumbnail) <= 1024 * 1024),
  add constraint stageplot_projects_venue_max check (venue_image is null or octet_length(venue_image::text) <= 16 * 1024 * 1024),
  add constraint stageplot_projects_title_max check (char_length(title) <= 500);

-- numero di progetti vivi per account (oggi il massimo è 23)
create or replace function public.stageplot_projects_quota()
returns trigger language plpgsql set search_path = public as $$
declare n int;
begin
  if current_user <> 'authenticated' then return new; end if;
  select count(*) into n from (
    select 1 from public.stageplot_projects p
    where p.user_id = new.user_id and p.deleted_at is null limit 500
  ) x;
  if n >= 500 then
    raise exception using errcode = '54000',
      message = 'stageplot: troppi progetti su questo account (500): elimina quelli che non servono';
  end if;
  return new;
end $$;
revoke all on function public.stageplot_projects_quota() from public, anon, authenticated;
drop trigger if exists stageplot_projects_quota_trg on public.stageplot_projects;
create trigger stageplot_projects_quota_trg before insert on public.stageplot_projects
  for each row execute function public.stageplot_projects_quota();

-- Il permesso di scrivere eventi, dichiarato: la tabella è nata (0009) quando Supabase lo dava da solo a
-- «authenticated», e in produzione c'è (899 eventi scritti da utenti collegati). I database nuovi non lo
-- danno più, e il workflow RLS lo ha mostrato (28/09). Il filtro vero resta la policy di 0035: eventi e
-- proprietà in elenco chiuso, user_id = auth.uid(). Nessuna lettura per gli utenti.
grant insert on public.analytics_events to authenticated;

-- eventi analytics per account e per ora (oggi il massimo è 57). Oltre, il browser non se ne accorge:
-- l'invio degli eventi non aspetta risposta, e un evento perso non rompe niente.
-- SECURITY DEFINER: gli utenti non leggono gli eventi (nessuna policy di lettura), quindi un conteggio fatto
-- con i LORO permessi vedrebbe sempre 0 e il tetto non scatterebbe mai (visto nel workflow RLS, 28/09).
-- Dentro una funzione definer current_user è il proprietario: chi scrive si legge dal JWT della richiesta.
create or replace function public.analytics_events_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'authenticated' then
    return new;
  end if;
  select count(*) into n from (
    select 1 from public.analytics_events e
    where e.user_id = new.user_id and e.created_at > now() - interval '1 hour' limit 600
  ) x;
  if n >= 600 then
    raise exception using errcode = '54000', message = 'stageplot: troppi eventi in un''ora';
  end if;
  return new;
end $$;
revoke all on function public.analytics_events_quota() from public, anon, authenticated;
drop trigger if exists analytics_events_quota_trg on public.analytics_events;
create trigger analytics_events_quota_trg before insert on public.analytics_events
  for each row execute function public.analytics_events_quota();
