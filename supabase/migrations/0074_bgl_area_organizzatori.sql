-- 0074 — Biglietteria: l'organizzatore e lo spettacolo dell'area (specifica area §2, §6; decisioni D1, D5, D7).
--
-- SOLO AGGIUNTE, compatibili con quello che è online (editor col pannello, pagina ?e=, QR stampati):
--   · bgl_organizzatori (0073) prende nome, indirizzo della pagina (slug), contatto, logo;
--   · bgl_eventi prende indirizzo breve, descrizione, locandina, variante, bozza (pubblicato), «per chi» dei tenuti;
--     pubblicato vale true per gli spettacoli che ci sono già (sono aperti), false per le bozze dell'area.
--   · L'organizzatore di uno spettacolo è bgl_eventi.user_id (D1): nessuna colonna organizzatore_id.
--   · L'indirizzo della pagina si BLOCCA dal primo spettacolo pubblicato e resta bloccato anche se quello spettacolo
--     poi si elimina o torna bozza (D7 + decisione di Simone del 06/10: i QR della pagina sono già in giro).
--   · Chi SCRIVE deve essere abilitato (non_abilitato); leggere, disdire ed eliminare restano al proprietario (D5).
--   · Idempotente: si ripassa con psql durante lo sviluppo. Ogni funzione: revoke + grant scritti a mano (0057).

-- ───────────────────────────────────────────────────────────── attrezzi (servono anche ai vincoli: prima di tutto)
create or replace function public.bgl_slug_ok(p text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p is not null and p ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and p !~ '--'
$$;
revoke all on function public.bgl_slug_ok(text) from public, anon, authenticated;
grant execute on function public.bgl_slug_ok(text) to service_role;

create or replace function public.bgl_slug_riservato(p text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p = any (array['mie','gestione','nuovo','admin','api','app','aiuto','privacy','info','stageplot',
                        'biglietteria','www','test','accedi','esci','login'])
$$;
revoke all on function public.bgl_slug_riservato(text) from public, anon, authenticated;
grant execute on function public.bgl_slug_riservato(text) to service_role;

-- «Così fan tutte — prima» → «cosi-fan-tutte-prima». La stessa tabella di gst.js (slugDaTesto): un test le confronta.
create or replace function public.bgl_slug_da_testo(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'àáâãäåèéêëìíîïòóôõöùúûüýÿçñÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÇÑ',
    'aaaaaaeeeeiiiiooooouuuuyycnaaaaaaeeeeiiiiooooouuuuycn')), '[^a-z0-9]+', '-', 'g'), '-')
$$;
revoke all on function public.bgl_slug_da_testo(text) from public, anon, authenticated;
grant execute on function public.bgl_slug_da_testo(text) to service_role;

-- titolo + giorno e mese DI ROMA: «concerto-di-prova-9-ottobre» (≤ 40 caratteri, RF5)
create or replace function public.bgl_slug_proposto(p_titolo text, p_inizio timestamptz)
returns text language plpgsql stable set search_path = public, pg_temp as $$
declare l timestamp; coda text; base text;
begin
  l := p_inizio at time zone 'Europe/Rome';
  coda := extract(day from l)::int::text || '-' || (array['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio',
    'agosto','settembre','ottobre','novembre','dicembre'])[extract(month from l)::int];
  base := public.bgl_slug_da_testo(p_titolo);
  if base = '' then base := 'spettacolo'; end if;
  base := btrim(left(base, 40 - char_length(coda) - 1), '-');
  return base || '-' || coda;
end $$;
revoke all on function public.bgl_slug_proposto(text, timestamptz) from public, anon, authenticated;
grant execute on function public.bgl_slug_proposto(text, timestamptz) to service_role;

-- se l'indirizzo è già usato dallo stesso organizzatore: -2, -3…
create or replace function public.bgl_slug_unico(p_uid uuid, p_base text, p_escludi uuid)
returns text language plpgsql stable set search_path = public, pg_temp as $$
declare s text := p_base; i int := 1; coda text;
begin
  while exists (select 1 from public.bgl_eventi where user_id = p_uid and slug_breve = s and id is distinct from p_escludi) loop
    i := i + 1;
    if i > 200 then return null; end if;
    coda := '-' || i::text;
    s := btrim(left(p_base, 40 - char_length(coda)), '-') || coda;
  end loop;
  return s;
end $$;
revoke all on function public.bgl_slug_unico(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.bgl_slug_unico(uuid, text, uuid) to service_role;

-- Testo con gli a capo (descrizione, nota): '' se vuoto; null se troppo lungo o con caratteri di controllo che non
-- siano l'a capo. \r\n diventa \n.
create or replace function public.bgl_testo_righe(p text, p_max int)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p is null then ''
    when replace(p, E'\r\n', E'\n') ~ '[\x01-\x09\x0b-\x1f\x7f]' then null
    when char_length(btrim(replace(p, E'\r\n', E'\n'))) > p_max then null
    else btrim(replace(p, E'\r\n', E'\n'))
  end
$$;
revoke all on function public.bgl_testo_righe(text, int) from public, anon, authenticated;
grant execute on function public.bgl_testo_righe(text, int) to service_role;

create or replace function public.bgl_uuid(p text)
returns uuid language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p is null or p !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return p::uuid;
end $$;
revoke all on function public.bgl_uuid(text) from public, anon, authenticated;
grant execute on function public.bgl_uuid(text) to service_role;

-- Una locandina (o un logo) si accetta solo se è un file del PROPRIO account, col nome casuale, e c'è davvero.
-- Lo spazio bgl-locandine nasce nella 0076: prima di allora nessun file c'è, e la risposta è false.
create or replace function public.bgl_locandina_ok(p_uid uuid, p_path text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_uid is not null and p_path is not null
     and p_path ~ ('^' || p_uid::text || '/[0-9a-f]{32}\.(webp|jpg)$')
     and exists (select 1 from storage.objects o where o.bucket_id = 'bgl-locandine' and o.name = p_path)
$$;
revoke all on function public.bgl_locandina_ok(uuid, text) from public, anon, authenticated;
grant execute on function public.bgl_locandina_ok(uuid, text) to service_role;

-- Un file (locandina o logo) che qualche spettacolo o organizzatore cita ancora. Le funzioni che rispondono «questo
-- file non serve più, toglilo» (bgl_elimina, locandina_vecchia, logo_vecchio) lo dicono solo se nessuno lo cita:
-- il browser lo cancella subito (D4) e una locandina condivisa sparirebbe anche dall'altro spettacolo.
create or replace function public.bgl_file_citato(p_path text)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select p_path is not null
     and (exists (select 1 from public.bgl_eventi where locandina_path = p_path)
          or exists (select 1 from public.bgl_organizzatori where logo_path = p_path))
$$;
revoke all on function public.bgl_file_citato(text) from public, anon, authenticated;
grant execute on function public.bgl_file_citato(text) to service_role;

-- Le sedie numerate di uno stato salvato dall'editor (la stessa regola di postoNumerato)
create or replace function public.bgl_conta_posti(p_state jsonb)
returns int language sql immutable set search_path = public, pg_temp as $$
  select count(*)::int
    from jsonb_array_elements(case when jsonb_typeof(p_state->'items') = 'array' then p_state->'items' else '[]'::jsonb end) it
   where it->>'type' = 'sediapubblico' and jsonb_typeof(it->'fila') = 'string' and (it->>'fila') <> ''
     and jsonb_typeof(it->'posto') = 'number' and (it->>'posto')::numeric > 0
$$;
revoke all on function public.bgl_conta_posti(jsonb) from public, anon, authenticated;
grant execute on function public.bgl_conta_posti(jsonb) to service_role;

-- «per chi» dei tenuti da parte: solo chiavi tenute da parte, valori di testo
create or replace function public.bgl_riservati_per_puliti(p jsonb, p_ris text[])
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(x.key, x.value), '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) x
   where x.key = any(coalesce(p_ris, '{}')) and jsonb_typeof(x.value) = 'string'
$$;
revoke all on function public.bgl_riservati_per_puliti(jsonb, text[]) from public, anon, authenticated;
grant execute on function public.bgl_riservati_per_puliti(jsonb, text[]) to service_role;

-- ──────────────────────────────────────────────────────────────────────────────── colonne nuove
alter table public.bgl_organizzatori
  add column if not exists slug text,
  add column if not exists nome text,
  add column if not exists contatto_email text,
  add column if not exists logo_path text,
  add column if not exists aggiornato_il timestamptz not null default now(),
  add column if not exists indirizzo_bloccato_il timestamptz;   -- dal primo spettacolo pubblicato (D7): non torna null
create unique index if not exists bgl_organizzatori_slug_key on public.bgl_organizzatori (slug) where slug is not null;

alter table public.bgl_eventi
  add column if not exists slug_breve text,
  add column if not exists descrizione text,
  add column if not exists locandina_path text,
  add column if not exists variante text,
  add column if not exists pubblicato boolean not null default true,
  add column if not exists riservati_per jsonb not null default '{}'::jsonb;
create unique index if not exists bgl_eventi_slug_breve_key on public.bgl_eventi (user_id, slug_breve) where slug_breve is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bgl_organizzatori_area_ok') then
    alter table public.bgl_organizzatori add constraint bgl_organizzatori_area_ok check (
      (slug is null or (public.bgl_slug_ok(slug) and not public.bgl_slug_riservato(slug)))
      and (nome is null or char_length(nome) between 1 and 80)
      and (contatto_email is null or char_length(contatto_email) between 3 and 254)
      and (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/[0-9a-f]{32}\.(webp|jpg)$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bgl_eventi_area_ok') then
    alter table public.bgl_eventi add constraint bgl_eventi_area_ok check (
      (slug_breve is null or public.bgl_slug_ok(slug_breve))
      and (descrizione is null or char_length(descrizione) <= 600)
      and (variante is null or char_length(variante) between 1 and 80)
      and (locandina_path is null or locandina_path ~ '^[0-9a-f-]{36}/[0-9a-f]{32}\.(webp|jpg)$')
      and jsonb_typeof(riservati_per) = 'object' and octet_length(riservati_per::text) <= 200000);
  end if;
end $$;

-- D7: il primo spettacolo pubblicato (con il suo indirizzo breve) blocca l'indirizzo della pagina, per sempre.
-- Un trigger e non le singole funzioni: vale per ogni strada che pubblica (area, collegamento degli eventi dell'editor).
create or replace function public.bgl_blocca_indirizzo()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.pubblicato and new.slug_breve is not null then
    update public.bgl_organizzatori set indirizzo_bloccato_il = now()
     where user_id = new.user_id and slug is not null and indirizzo_bloccato_il is null;
  end if;
  return new;
end $$;
revoke all on function public.bgl_blocca_indirizzo() from public, anon, authenticated;
grant execute on function public.bgl_blocca_indirizzo() to service_role;
drop trigger if exists bgl_eventi_blocca_indirizzo on public.bgl_eventi;
create trigger bgl_eventi_blocca_indirizzo after insert or update of pubblicato, slug_breve on public.bgl_eventi
  for each row execute function public.bgl_blocca_indirizzo();

-- ─────────────────────────────────────────────────────────────────── letture dell'organizzatore
create or replace function public.bgl_organizzatore_json(o public.bgl_organizzatori)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('slug', o.slug, 'nome', o.nome, 'contatto_email', o.contatto_email, 'logo_path', o.logo_path)
$$;
revoke all on function public.bgl_organizzatore_json(public.bgl_organizzatori) from public, anon, authenticated;
grant execute on function public.bgl_organizzatore_json(public.bgl_organizzatori) to service_role;

create or replace function public.bgl_evento_json(p_evento public.bgl_eventi)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p_evento.id, 'slug', p_evento.slug, 'titolo', p_evento.titolo,
    'inizio', p_evento.inizio, 'chiusura', p_evento.chiusura, 'luogo', p_evento.luogo, 'note', p_evento.note,
    'stato', p_evento.stato,
    'stato_pubblico', public.bgl_stato_pubblico(p_evento.stato, p_evento.inizio, p_evento.chiusura),
    'posti_totali', p_evento.posti_totali,
    'prenotati', c->'prenotati', 'riservati', c->'riservati', 'liberi', c->'liberi',
    'slug_breve', p_evento.slug_breve, 'descrizione', p_evento.descrizione, 'locandina_path', p_evento.locandina_path,
    'variante', p_evento.variante, 'pubblicato', p_evento.pubblicato, 'project_id', p_evento.project_id)
  from (select public.bgl_conteggi(p_evento) c) x
$$;
revoke all on function public.bgl_evento_json(public.bgl_eventi) from public, anon, authenticated;
grant execute on function public.bgl_evento_json(public.bgl_eventi) to service_role;

-- Gli spettacoli senza indirizzo breve (nati nell'editor) ne prendono uno: «entrano nell'area da soli».
create or replace function public.bgl_collega_eventi(p_uid uuid)
returns int language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select id, titolo, inizio from public.bgl_eventi where user_id = p_uid and slug_breve is null order by inizio, creato_il loop
    update public.bgl_eventi set slug_breve = public.bgl_slug_unico(p_uid, public.bgl_slug_proposto(r.titolo, r.inizio), r.id) where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.bgl_collega_eventi(uuid) from public, anon, authenticated;
grant execute on function public.bgl_collega_eventi(uuid) to service_role;

create or replace function public.bgl_organizzatore_mio()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); o public.bgl_organizzatori; v_email text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.bgl_abilitato_uid(uid) then return jsonb_build_object('ok', false, 'errore', 'non_abilitato'); end if;
  select * into o from public.bgl_organizzatori where user_id = uid;
  select email into v_email from auth.users where id = uid;
  if o.slug is not null then perform public.bgl_collega_eventi(uid); end if;
  return jsonb_build_object('ok', true, 'email_account', coalesce(v_email, ''),
    'organizzatore', case when o.slug is null then null else public.bgl_organizzatore_json(o) end,
    'spettacoli', coalesce((select jsonb_agg(public.bgl_evento_json(e) order by e.inizio, e.creato_il)
                              from public.bgl_eventi e where e.user_id = uid), '[]'::jsonb));
end $$;
revoke all on function public.bgl_organizzatore_mio() from public, anon, authenticated;
grant execute on function public.bgl_organizzatore_mio() to authenticated, service_role;

create or replace function public.bgl_slug_libero(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v text := lower(btrim(coalesce(p_slug, '')));
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.bgl_abilitato_uid(uid) then return jsonb_build_object('ok', false, 'errore', 'non_abilitato'); end if;
  if not public.bgl_slug_ok(v) then return jsonb_build_object('ok', true, 'libero', false, 'motivo', 'formato'); end if;
  if public.bgl_slug_riservato(v) then return jsonb_build_object('ok', true, 'libero', false, 'motivo', 'riservato'); end if;
  if exists (select 1 from public.bgl_organizzatori where slug = v and user_id <> uid) then
    return jsonb_build_object('ok', true, 'libero', false, 'motivo', 'occupato');
  end if;
  return jsonb_build_object('ok', true, 'libero', true, 'motivo', null);
end $$;
revoke all on function public.bgl_slug_libero(text) from public, anon, authenticated;
grant execute on function public.bgl_slug_libero(text) to authenticated, service_role;

-- Nome, indirizzo della pagina (D7: si cambia solo finché nessuno spettacolo è pubblicato), contatto, logo.
create or replace function public.bgl_organizzatore_salva(p_dati jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); o public.bgl_organizzatori; v_nome text; v_slug text; v_contatto text; v_logo text; v_vecchio text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.bgl_abilitato_uid(uid) then return jsonb_build_object('ok', false, 'errore', 'non_abilitato'); end if;
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'dati'); end if;
  select * into o from public.bgl_organizzatori where user_id = uid for update;
  v_nome := public.bgl_testo(p_dati->>'nome', 1, 80);
  if v_nome is null or jsonb_typeof(p_dati->'nome') <> 'string' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'nome'); end if;
  v_slug := lower(btrim(coalesce(p_dati->>'slug', '')));
  if not public.bgl_slug_ok(v_slug) or public.bgl_slug_riservato(v_slug) then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'slug');
  end if;
  if o.slug is not null and v_slug <> o.slug
     and (o.indirizzo_bloccato_il is not null
          or exists (select 1 from public.bgl_eventi where user_id = uid and pubblicato and slug_breve is not null)) then
    return jsonb_build_object('ok', false, 'errore', 'slug_bloccato');
  end if;
  v_contatto := o.contatto_email;
  if p_dati ? 'contatto_email' then
    if jsonb_typeof(p_dati->'contatto_email') = 'null' or btrim(coalesce(p_dati->>'contatto_email', '')) = '' then v_contatto := null;
    else
      v_contatto := public.bgl_testo(p_dati->>'contatto_email', 3, 254);
      -- formato di un'email e niente segni da pagina web (< > " ' `) né separatori di più indirizzi (, ;): le pagine
      -- scappano tutto, ma un indirizzo vero non li contiene e finisce in un mailto: (revisione T23)
      if v_contatto is null or v_contatto !~ '^[^[:space:]@<>"''`,;]+@[^[:space:]@<>"''`,;]+\.[^[:space:]@<>"''`,;]+$' then
        return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'contatto_email');
      end if;
    end if;
  end if;
  v_vecchio := o.logo_path; v_logo := o.logo_path;
  if p_dati ? 'logo_path' then
    if jsonb_typeof(p_dati->'logo_path') = 'null' then v_logo := null;
    elsif not public.bgl_locandina_ok(uid, p_dati->>'logo_path') then
      return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'logo_path');
    else v_logo := p_dati->>'logo_path'; end if;
  end if;
  begin
    update public.bgl_organizzatori set slug = v_slug, nome = v_nome, contatto_email = v_contatto, logo_path = v_logo,
           aggiornato_il = now() where user_id = uid;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'errore', 'slug_occupato');
  end;
  perform public.bgl_collega_eventi(uid);
  select * into o from public.bgl_organizzatori where user_id = uid;
  return jsonb_build_object('ok', true, 'organizzatore', public.bgl_organizzatore_json(o),
    'logo_vecchio', case when v_vecchio is distinct from v_logo and not public.bgl_file_citato(v_vecchio) then v_vecchio end);
end $$;
revoke all on function public.bgl_organizzatore_salva(jsonb) from public, anon, authenticated;
grant execute on function public.bgl_organizzatore_salva(jsonb) to authenticated, service_role;

-- I progetti dell'account che hanno posti numerati, con le loro varianti (solo quelle con posti).
create or replace function public.bgl_progetti_sala()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.bgl_abilitato_uid(uid) then return jsonb_build_object('ok', false, 'errore', 'non_abilitato'); end if;
  return jsonb_build_object('ok', true, 'progetti', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'titolo', p.title, 'aggiornato_il', p.updated_at, 'varianti', v.varianti)
                     order by p.updated_at desc)
      from public.stageplot_projects p
      cross join lateral (
        select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'nome', w.nome, 'posti', w.posti, 'attiva', w.attiva) order by w.ord), '[]'::jsonb) varianti,
               coalesce(sum(w.posti), 0) tot
          from (
            select vv.value->>'id' id, coalesce(vv.value->>'name', 'Variante') nome, public.bgl_conta_posti(vv.value->'state') posti,
                   (vv.value->>'id') is not distinct from (p.data->>'active') attiva, vv.ordinality ord
              from jsonb_array_elements(case when jsonb_typeof(p.data->'variants') = 'array' then p.data->'variants' else '[]'::jsonb end)
                   with ordinality vv
            union all
            select null, 'Variante 1', public.bgl_conta_posti(p.data), true, 1
             where jsonb_typeof(p.data->'variants') is distinct from 'array'
          ) w
         where w.posti > 0
      ) v
     where p.user_id = uid and p.deleted_at is null and v.tot > 0), '[]'::jsonb));
end $$;
revoke all on function public.bgl_progetti_sala() from public, anon, authenticated;
grant execute on function public.bgl_progetti_sala() to authenticated, service_role;

-- ────────────────────────────────────────────── nuovo spettacolo / modifica (specifica area §2.3, una sola funzione)
create or replace function public.bgl_spettacolo_salva(p_id uuid, p_dati jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); o public.bgl_organizzatori; e public.bgl_eventi; nuovo boolean := p_id is null;
  v text; v_pid uuid; v_pianta jsonb; v_chiavi text[]; occ text[]; conflitto text[]; v_motivo text; n int;
  v_vecchia text; v_ha_pren boolean := false; v_vincolo text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.bgl_abilitato_uid(uid) then return jsonb_build_object('ok', false, 'errore', 'non_abilitato'); end if;
  -- la riga dell'organizzatore per prima, FOR UPDATE: stesso ordine dei lucchetti di bgl_organizzatore_salva
  -- (organizzatore → spettacoli; il trigger D7 scrive l'organizzatore): niente stalli fra due schede aperte.
  select * into o from public.bgl_organizzatori where user_id = uid for update;
  if o.slug is null then return jsonb_build_object('ok', false, 'errore', 'organizzatore_mancante'); end if;
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'dati');
  end if;

  if nuovo then
    foreach v in array array['project_id', 'titolo', 'inizio', 'luogo', 'pianta'] loop
      if not (p_dati ? v) then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', v); end if;
    end loop;
    e.user_id := uid; e.stato := 'aperta'; e.pubblicato := false; e.riservati := '{}'; e.riservati_per := '{}'::jsonb;
  else
    select * into e from public.bgl_eventi where id = p_id and user_id = uid for update;
    if e.id is null then return jsonb_build_object('ok', false, 'errore', 'non_tuo'); end if;
    v_vecchia := e.locandina_path;
    v_ha_pren := exists (select 1 from public.bgl_prenotazioni where evento_id = e.id);
  end if;

  if p_dati ? 'project_id' then
    v_pid := public.bgl_uuid(p_dati->>'project_id');
    if v_pid is null or not exists (select 1 from public.stageplot_projects where id = v_pid and user_id = uid and deleted_at is null) then
      return jsonb_build_object('ok', false, 'errore', 'non_tuo');
    end if;
    e.project_id := v_pid;
  end if;
  if p_dati ? 'titolo' then
    v := public.bgl_testo(p_dati->>'titolo', 1, 120);
    if v is null or jsonb_typeof(p_dati->'titolo') <> 'string' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'titolo'); end if;
    e.titolo := v;
  end if;
  if p_dati ? 'luogo' then
    v := public.bgl_testo(p_dati->>'luogo', 1, 160);
    if v is null or jsonb_typeof(p_dati->'luogo') <> 'string' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'luogo'); end if;
    e.luogo := v;
  end if;
  if p_dati ? 'note' then
    if jsonb_typeof(p_dati->'note') not in ('null', 'string') then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'note'); end if;
    v := public.bgl_testo_righe(p_dati->>'note', 200);
    if v is null then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'note'); end if;
    e.note := nullif(v, '');
  end if;
  if p_dati ? 'descrizione' then
    if jsonb_typeof(p_dati->'descrizione') not in ('null', 'string') then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'descrizione'); end if;
    v := public.bgl_testo_righe(p_dati->>'descrizione', 600);
    if v is null then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'descrizione'); end if;
    e.descrizione := nullif(v, '');
  end if;
  if p_dati ? 'inizio' then
    e.inizio := public.bgl_ts(p_dati->>'inizio');
    if e.inizio is null then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'inizio'); end if;
  end if;
  if p_dati ? 'chiusura' and jsonb_typeof(p_dati->'chiusura') <> 'null' then
    e.chiusura := public.bgl_ts(p_dati->>'chiusura');
    if e.chiusura is null then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'chiusura'); end if;
  elsif nuovo or p_dati ? 'chiusura' then
    e.chiusura := e.inizio;      -- predefinita: all'inizio dello spettacolo (specifica §2.3)
  end if;
  if e.chiusura > e.inizio then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'chiusura'); end if;
  if p_dati ? 'stato' then
    if (p_dati->>'stato') is null or (p_dati->>'stato') not in ('aperta', 'chiusa') then
      return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'stato');
    end if;
    e.stato := p_dati->>'stato';
  end if;
  if p_dati ? 'variante' then
    if jsonb_typeof(p_dati->'variante') = 'null' then e.variante := null;
    else
      v := public.bgl_testo(p_dati->>'variante', 1, 80);
      if v is null or jsonb_typeof(p_dati->'variante') <> 'string' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'variante'); end if;
      e.variante := v;
    end if;
  end if;
  if p_dati ? 'locandina_path' then
    if jsonb_typeof(p_dati->'locandina_path') = 'null' then e.locandina_path := null;
    elsif jsonb_typeof(p_dati->'locandina_path') <> 'string' or not public.bgl_locandina_ok(uid, p_dati->>'locandina_path') then
      return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'locandina_path');
    else e.locandina_path := p_dati->>'locandina_path'; end if;
  end if;
  if p_dati ? 'pubblicato' then
    if jsonb_typeof(p_dati->'pubblicato') <> 'boolean' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'pubblicato'); end if;
    if not (p_dati->>'pubblicato')::boolean and e.pubblicato and v_ha_pren then
      return jsonb_build_object('ok', false, 'errore', 'ha_prenotazioni');
    end if;
    e.pubblicato := (p_dati->>'pubblicato')::boolean;
  end if;
  if p_dati ? 'slug_breve' then
    v := lower(btrim(coalesce(p_dati->>'slug_breve', '')));
    if not public.bgl_slug_ok(v) then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'slug_breve'); end if;
    if not nuovo and v is distinct from e.slug_breve and v_ha_pren then return jsonb_build_object('ok', false, 'errore', 'slug_bloccato'); end if;
    if exists (select 1 from public.bgl_eventi where user_id = uid and slug_breve = v and id is distinct from e.id) then
      return jsonb_build_object('ok', false, 'errore', 'slug_occupato');
    end if;
    e.slug_breve := v;
  elsif e.slug_breve is null then
    e.slug_breve := public.bgl_slug_unico(uid, public.bgl_slug_proposto(e.titolo, e.inizio), e.id);
  end if;

  select coalesce(array_agg(posto order by posto), '{}') into occ from public.bgl_posti where evento_id = e.id;
  if p_dati ? 'pianta' then
    begin
      v_pianta := public.bgl_pianta_pulita(p_dati->'pianta');
    exception when sqlstate '22023' then
      get stacked diagnostics v_motivo = pg_exception_detail;
      return jsonb_build_object('ok', false, 'errore', 'pianta_non_valida', 'motivo', v_motivo);
    end;
    v_chiavi := public.bgl_chiavi(v_pianta);
    select coalesce(array_agg(x order by x), '{}') into conflitto from unnest(occ) x where not (x = any(v_chiavi));
    if cardinality(conflitto) > 0 then return jsonb_build_object('ok', false, 'errore', 'posto_prenotato', 'posti', to_jsonb(conflitto)); end if;
    e.pianta := v_pianta; e.posti_totali := cardinality(v_chiavi);
    e.riservati := public.bgl_riservati_puliti(to_jsonb(e.riservati), v_chiavi);
  end if;
  if p_dati ? 'riservati' then
    e.riservati := public.bgl_riservati_puliti(p_dati->'riservati', public.bgl_chiavi(e.pianta));
    select coalesce(array_agg(x order by x), '{}') into conflitto from unnest(e.riservati) x where x = any(occ);
    if cardinality(conflitto) > 0 then return jsonb_build_object('ok', false, 'errore', 'posto_prenotato', 'posti', to_jsonb(conflitto)); end if;
  end if;
  if p_dati ? 'riservati_per' then
    if jsonb_typeof(p_dati->'riservati_per') <> 'object'
       or exists (select 1 from jsonb_each(p_dati->'riservati_per') x
                   where jsonb_typeof(x.value) <> 'string' or public.bgl_testo(x.value #>> '{}', 1, 60) is null) then
      return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'riservati_per');
    end if;
    e.riservati_per := (select coalesce(jsonb_object_agg(x.key, to_jsonb(public.bgl_testo(x.value #>> '{}', 1, 60))), '{}'::jsonb)
                          from jsonb_each(p_dati->'riservati_per') x);
  end if;
  e.riservati_per := public.bgl_riservati_per_puliti(e.riservati_per, e.riservati);

  begin
    if nuovo then
      perform pg_advisory_xact_lock(hashtextextended('bgl_apri|' || uid::text, 0));   -- lo stesso lucchetto di bgl_apri
      select count(*) into n from public.bgl_eventi where user_id = uid;
      if n >= 50 then return jsonb_build_object('ok', false, 'errore', 'troppi_eventi'); end if;
      for i in 1..5 loop
        e.slug := public.bgl_casuale('abcdefghijkmnpqrstuvwxyz23456789', 10);
        exit when not exists (select 1 from public.bgl_eventi b where b.slug = e.slug);
      end loop;
      insert into public.bgl_eventi (slug, user_id, project_id, titolo, inizio, chiusura, luogo, note, stato, pianta, posti_totali,
                                     riservati, slug_breve, descrizione, locandina_path, variante, pubblicato, riservati_per)
      values (e.slug, uid, e.project_id, e.titolo, e.inizio, e.chiusura, e.luogo, e.note, e.stato, e.pianta, e.posti_totali,
              e.riservati, e.slug_breve, e.descrizione, e.locandina_path, e.variante, e.pubblicato, e.riservati_per)
      returning id into e.id;
    else
      update public.bgl_eventi set project_id = e.project_id, titolo = e.titolo, inizio = e.inizio, chiusura = e.chiusura,
             luogo = e.luogo, note = e.note, stato = e.stato, pianta = e.pianta, posti_totali = e.posti_totali,
             riservati = e.riservati, slug_breve = e.slug_breve, descrizione = e.descrizione, locandina_path = e.locandina_path,
             variante = e.variante, pubblicato = e.pubblicato, riservati_per = e.riservati_per, aggiornato_il = now()
       where id = e.id;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_vincolo = constraint_name;
    if v_vincolo = 'bgl_eventi_slug_breve_key' then return jsonb_build_object('ok', false, 'errore', 'slug_occupato'); end if;
    raise;
  end;
  return jsonb_build_object('ok', true, 'id', e.id, 'slug', e.slug, 'slug_breve', e.slug_breve,
    'link', 'https://stageplot.it/biglietteria/' || o.slug || '/' || e.slug_breve,
    'locandina_vecchia', case when v_vecchia is distinct from e.locandina_path and not public.bgl_file_citato(v_vecchia) then v_vecchia end);
end $$;
revoke all on function public.bgl_spettacolo_salva(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bgl_spettacolo_salva(uuid, jsonb) to authenticated, service_role;

-- ───────────────────────────────────────────────── tre funzioni della 0072, riscritte (stessa firma)
-- bgl_prenotati: in più il «per chi» dei tenuti da parte (solo all'organizzatore: è nella lista d'ingresso).
create or replace function public.bgl_prenotati(p_evento_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); e public.bgl_eventi; c jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  select * into e from public.bgl_eventi where id = p_evento_id and user_id = uid;
  if e.id is null then return jsonb_build_object('ok', false, 'errore', 'non_tuo'); end if;
  c := public.bgl_conteggi(e);
  return jsonb_build_object('ok', true,
    'evento', public.bgl_evento_json(e) || jsonb_build_object('riservati', to_jsonb(e.riservati), 'pianta', e.pianta,
      'riservati_per', public.bgl_riservati_per_puliti(e.riservati_per, e.riservati)),
    'prenotazioni', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'codice', p.codice, 'nome', p.nome, 'cognome', p.cognome,
        'email', p.email,
        'posti', (select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
                    from unnest(p.posti) with ordinality u(x, i)
                   where exists (select 1 from public.bgl_posti b
                                  where b.evento_id = e.id and b.posto = x and b.prenotazione_id = p.id)),
        'posti_chiesti', to_jsonb(p.posti), 'stato', p.stato, 'creata_il', p.creata_il, 'chiusa_il', p.chiusa_il,
        'connessione', g.n)
        order by p.creata_il, p.codice)
      from public.bgl_prenotazioni p
      left join (select q.ip_hash, row_number() over (order by min(q.creata_il), q.ip_hash)::int n
                   from public.bgl_prenotazioni q
                  where q.evento_id = e.id and q.ip_hash is not null
                  group by q.ip_hash having count(*) >= 2) g on g.ip_hash = p.ip_hash
      where p.evento_id = e.id), '[]'::jsonb),
    'conteggi', c || jsonb_build_object('prenotazioni_attive',
      (select count(*) from public.bgl_prenotazioni p where p.evento_id = e.id and p.stato = 'attiva')));
end $$;
revoke all on function public.bgl_prenotati(uuid) from public, anon, authenticated;
grant execute on function public.bgl_prenotati(uuid) to authenticated, service_role;

-- bgl_elimina: dice anche quale locandina togliere (il file lo toglie il browser, D4). Resta al proprietario anche
-- se l'abilitazione è tolta (D5): chi ha raccolto dati personali deve poterli cancellare.
create or replace function public.bgl_elimina(p_evento_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); eid uuid; v_loc text; n int;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  select id, locandina_path into eid, v_loc from public.bgl_eventi where id = p_evento_id and user_id = uid for update;
  if eid is null then return jsonb_build_object('ok', false, 'errore', 'non_tuo'); end if;
  select count(*) into n from public.bgl_prenotazioni where evento_id = eid;
  delete from public.bgl_eventi where id = eid;
  -- il file della locandina lo toglie il browser con la Storage API (D4); se non ci riesce, la purga di notte
  return jsonb_build_object('ok', true, 'eliminate', n,
    'locandina', case when not public.bgl_file_citato(v_loc) then v_loc end);   -- citata altrove: resta
end $$;
revoke all on function public.bgl_elimina(uuid) from public, anon, authenticated;
grant execute on function public.bgl_elimina(uuid) to authenticated, service_role;

-- bgl_modifica: corpo della 0072 con il controllo dell'abilitazione (come la 0073 per bgl_apri): chi scrive
-- dev'essere abilitato (D5).
create or replace function public.bgl_modifica(p_evento_id uuid, p_campi jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); e public.bgl_eventi; v text; occ text[]; conflitto text[]; chiavi text[];
  motivo text; nuova jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.bgl_abilitato_uid(uid) then return jsonb_build_object('ok', false, 'errore', 'non_abilitato'); end if;
  select * into e from public.bgl_eventi where id = p_evento_id and user_id = uid for update;
  if e.id is null then return jsonb_build_object('ok', false, 'errore', 'non_tuo'); end if;
  if p_campi is null or jsonb_typeof(p_campi) <> 'object' then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'campi');
  end if;

  if p_campi ? 'titolo' then
    v := public.bgl_testo(p_campi->>'titolo', 1, 120);
    if v is null or jsonb_typeof(p_campi->'titolo') <> 'string' then
      return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'titolo');
    end if;
    e.titolo := v;
  end if;
  if p_campi ? 'luogo' then
    v := public.bgl_testo(p_campi->>'luogo', 1, 160);
    if v is null or jsonb_typeof(p_campi->'luogo') <> 'string' then
      return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'luogo');
    end if;
    e.luogo := v;
  end if;
  if p_campi ? 'note' then
    if jsonb_typeof(p_campi->'note') not in ('null', 'string') then
      return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'note');
    end if;
    -- le stesse regole di bgl_spettacolo_salva (revisione T23): 200 caratteri, a capo sì, \r da solo no (finirebbe
    -- crudo nel file .ics del pubblico)
    v := public.bgl_testo_righe(p_campi->>'note', 200);
    if v is null then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'note'); end if;
    e.note := nullif(v, '');
  end if;
  if p_campi ? 'inizio' then
    e.inizio := public.bgl_ts(p_campi->>'inizio');
    if e.inizio is null then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'inizio'); end if;
  end if;
  if p_campi ? 'chiusura' then
    e.chiusura := public.bgl_ts(p_campi->>'chiusura');
    if e.chiusura is null then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'chiusura'); end if;
  end if;
  if e.chiusura > e.inizio then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'chiusura');
  end if;
  if p_campi ? 'stato' then
    if (p_campi->>'stato') is null or (p_campi->>'stato') not in ('aperta', 'chiusa') then
      return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'stato');
    end if;
    e.stato := p_campi->>'stato';
  end if;

  select coalesce(array_agg(posto order by posto), '{}') into occ from public.bgl_posti where evento_id = e.id;

  if p_campi ? 'pianta' then
    begin
      nuova := public.bgl_pianta_pulita(p_campi->'pianta');
    exception when sqlstate '22023' then
      get stacked diagnostics motivo = pg_exception_detail;
      return jsonb_build_object('ok', false, 'errore', 'pianta_non_valida', 'motivo', motivo);
    end;
    chiavi := public.bgl_chiavi(nuova);
    select coalesce(array_agg(x order by x), '{}') into conflitto from unnest(occ) x where not (x = any(chiavi));
    if cardinality(conflitto) > 0 then
      return jsonb_build_object('ok', false, 'errore', 'posto_prenotato', 'posti', to_jsonb(conflitto));
    end if;
    e.pianta := nuova;
    e.posti_totali := cardinality(chiavi);
    -- i tenuti da parte che non esistono più cadono
    e.riservati := public.bgl_riservati_puliti(to_jsonb(e.riservati), chiavi);
  end if;
  if p_campi ? 'riservati' then
    chiavi := public.bgl_chiavi(e.pianta);
    e.riservati := public.bgl_riservati_puliti(p_campi->'riservati', chiavi);
    select coalesce(array_agg(x order by x), '{}') into conflitto from unnest(e.riservati) x where x = any(occ);
    if cardinality(conflitto) > 0 then
      return jsonb_build_object('ok', false, 'errore', 'posto_prenotato', 'posti', to_jsonb(conflitto));
    end if;
  end if;

  update public.bgl_eventi set titolo = e.titolo, luogo = e.luogo, note = e.note, inizio = e.inizio,
         chiusura = e.chiusura, stato = e.stato, pianta = e.pianta, posti_totali = e.posti_totali,
         riservati = e.riservati, aggiornato_il = now()
   where id = e.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.bgl_modifica(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.bgl_modifica(uuid, jsonb) to authenticated, service_role;
