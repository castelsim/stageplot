-- 0073 — Biglietteria solo per gli account abilitati.
--
-- PERCHÉ (06/10/2026, decisione di Simone): la biglietteria per ora la usa solo lui; più avanti si apre a
-- tutti con un limite gratuito e Stripe. La 0072 lasciava aprire spettacoli a QUALUNQUE account StagePlot
-- con un progetto suo (e quindi far partire mail di conferma). Qui:
--   - bgl_organizzatori: chi è abilitato (la scrive solo il servizio; per ora nessuna interfaccia);
--   - bgl_apri rifiuta gli altri con 'non_abilitato' (stesso corpo della 0072 più un controllo in testa);
--   - un trigger su bgl_eventi fa lo stesso controllo su OGNI inserimento, per le funzioni future;
--   - bgl_abilitato(): l'editor la chiede per mostrare o no il pulsante.
-- Abilitati da subito: gli account che hanno già aperto uno spettacolo (al 06/10 solo quello di Simone).
-- Nessun indirizzo o id personale scritto qui: il repo è pubblico.

create table public.bgl_organizzatori (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  abilitato  boolean not null default false,
  creato_il  timestamptz not null default now()
);
alter table public.bgl_organizzatori enable row level security;
revoke all on table public.bgl_organizzatori from public, anon, authenticated;
grant all on table public.bgl_organizzatori to service_role;

insert into public.bgl_organizzatori (user_id, abilitato)
select distinct user_id, true from public.bgl_eventi
on conflict (user_id) do update set abilitato = true;

create function public.bgl_abilitato_uid(p_uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_uid is not null and exists (select 1 from public.bgl_organizzatori o where o.user_id = p_uid and o.abilitato);
$$;
revoke all on function public.bgl_abilitato_uid(uuid) from public, anon, authenticated;
grant execute on function public.bgl_abilitato_uid(uuid) to service_role;

-- per l'editor: «posso usare la biglietteria?» (solo per sé, mai per altri)
create function public.bgl_abilitato()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.bgl_abilitato_uid(auth.uid());
$$;
revoke all on function public.bgl_abilitato() from public, anon, authenticated;
grant execute on function public.bgl_abilitato() to authenticated, service_role;

-- difesa in profondità: nessuno spettacolo nasce per un account non abilitato, da qualunque funzione
create function public.bgl_eventi_solo_abilitati()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.bgl_abilitato_uid(new.user_id) then
    raise exception 'bgl: account non abilitato alla biglietteria' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.bgl_eventi_solo_abilitati() from public, anon, authenticated;
grant execute on function public.bgl_eventi_solo_abilitati() to service_role;
create trigger bgl_eventi_solo_abilitati before insert on public.bgl_eventi
  for each row execute function public.bgl_eventi_solo_abilitati();

create or replace function public.bgl_apri(p_project_id uuid, p_evento jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); v_titolo text; v_luogo text; v_note text; v_inizio timestamptz; v_chiusura timestamptz;
  v_pianta jsonb; v_chiavi text[]; v_ris text[]; v_slug text; v_id uuid; n int; v_motivo text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.bgl_abilitato_uid(uid) then return jsonb_build_object('ok', false, 'errore', 'non_abilitato'); end if;
  if p_project_id is null or not exists (select 1 from public.stageplot_projects
       where id = p_project_id and user_id = uid and deleted_at is null) then
    return jsonb_build_object('ok', false, 'errore', 'non_tuo');
  end if;
  if p_evento is null or jsonb_typeof(p_evento) <> 'object' then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'evento');
  end if;
  v_titolo := public.bgl_testo(p_evento->>'titolo', 1, 120);
  if v_titolo is null or jsonb_typeof(p_evento->'titolo') <> 'string' then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'titolo');
  end if;
  v_luogo := public.bgl_testo(p_evento->>'luogo', 1, 160);
  if v_luogo is null or jsonb_typeof(p_evento->'luogo') <> 'string' then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'luogo');
  end if;
  if coalesce(jsonb_typeof(p_evento->'note'), 'null') not in ('null', 'string') then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'note');
  end if;
  v_note := nullif(btrim(coalesce(p_evento->>'note', '')), '');
  if v_note is not null and (char_length(v_note) > 500 or v_note ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'note');
  end if;
  v_inizio := public.bgl_ts(p_evento->>'inizio');
  if v_inizio is null then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'inizio'); end if;
  v_chiusura := coalesce(public.bgl_ts(p_evento->>'chiusura'), v_inizio);
  if v_chiusura > v_inizio or (p_evento ? 'chiusura' and p_evento->>'chiusura' is not null
                           and public.bgl_ts(p_evento->>'chiusura') is null) then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'chiusura');
  end if;

  begin
    v_pianta := public.bgl_pianta_pulita(p_evento->'pianta');
  exception when sqlstate '22023' then
    get stacked diagnostics v_motivo = pg_exception_detail;
    return jsonb_build_object('ok', false, 'errore', 'pianta_non_valida', 'motivo', v_motivo);
  end;
  v_chiavi := public.bgl_chiavi(v_pianta);
  v_ris := public.bgl_riservati_puliti(p_evento->'riservati', v_chiavi);

  -- tetto: 50 eventi per account. Il lock evita che due aperture simultanee lo scavalchino.
  perform pg_advisory_xact_lock(hashtextextended('bgl_apri|' || uid::text, 0));
  select count(*) into n from public.bgl_eventi where user_id = uid;
  if n >= 50 then return jsonb_build_object('ok', false, 'errore', 'troppi_eventi'); end if;

  for i in 1..5 loop
    v_slug := public.bgl_casuale('abcdefghijkmnpqrstuvwxyz23456789', 10);
    exit when not exists (select 1 from public.bgl_eventi b where b.slug = v_slug);
  end loop;
  insert into public.bgl_eventi (slug, user_id, project_id, titolo, inizio, chiusura, luogo, note, pianta,
                                 posti_totali, riservati)
  values (v_slug, uid, p_project_id, v_titolo, v_inizio, v_chiusura, v_luogo, v_note, v_pianta, cardinality(v_chiavi), v_ris)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'slug', v_slug,
    'link', 'https://stageplot.it/biglietteria/?e=' || v_slug);
end $$;
revoke all on function public.bgl_apri(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bgl_apri(uuid, jsonb) to authenticated, service_role;
