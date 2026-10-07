-- 0075 — Biglietteria: pagina dell'organizzatore e scheda dello spettacolo (specifica area §1, §3.1).
-- Lettura pubblica (anon): stesso contratto di privacy della 0072 — escono dati dello spettacolo e dell'organizzatore,
-- mai di chi prenota. La scheda È bgl_evento_pubblico (una sola regola di privacy, non due).
-- Le bozze (pubblicato = false) non esistono per nessuna porta pubblica. Solo aggiunte; idempotente.

-- Contatto: SOLO quello che l'organizzatore ha scritto (revisione T23). Nessun ripiego sull'email dell'account, che è
-- spesso quella personale: il «predefinito = email dell'account» della specifica (§2.1, decisione 3 di Simone) lo fa la
-- «prima volta» precompilando il campo, così in pagina va solo ciò che l'organizzatore ha visto e salvato; svuotato =
-- nessuna email in pagina (anche sul vecchio link ?e=, che legge da qui).
create or replace function public.bgl_organizzatore_pubblico_json(o public.bgl_organizzatori)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('slug', o.slug, 'nome', o.nome, 'contatto', nullif(o.contatto_email, ''), 'logo', o.logo_path)
$$;
revoke all on function public.bgl_organizzatore_pubblico_json(public.bgl_organizzatori) from public, anon, authenticated;
grant execute on function public.bgl_organizzatore_pubblico_json(public.bgl_organizzatori) to service_role;

-- CONTRATTO DI PRIVACY (0072, invariato): chiavi dei posti libero/occupato, mai nomi, email, codici o id.
create or replace function public.bgl_evento_pubblico(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e public.bgl_eventi; o public.bgl_organizzatori; occ text[]; ris text[];
begin
  if p_slug is null or p_slug !~ '^[a-z2-9]{10}$' then
    return jsonb_build_object('ok', false, 'errore', 'evento_inesistente');
  end if;
  select * into e from public.bgl_eventi where slug = p_slug;
  if e.id is null or not e.pubblicato then return jsonb_build_object('ok', false, 'errore', 'evento_inesistente'); end if;
  select * into o from public.bgl_organizzatori where user_id = e.user_id and abilitato and slug is not null;
  select coalesce(array_agg(posto order by posto), '{}') into occ from public.bgl_posti where evento_id = e.id;
  select coalesce(array_agg(r order by r), '{}') into ris from unnest(e.riservati) r where not (r = any(occ));
  return jsonb_build_object(
    'ok', true,
    'evento', jsonb_build_object('slug', e.slug, 'titolo', e.titolo, 'inizio', e.inizio, 'chiusura', e.chiusura,
      'luogo', e.luogo, 'note', e.note, 'stato', public.bgl_stato_pubblico(e.stato, e.inizio, e.chiusura),
      'max_per_email', 4, 'descrizione', e.descrizione, 'locandina', e.locandina_path,
      's', case when o.user_id is not null then e.slug_breve end),
    'organizzatore', case when o.user_id is null then null else public.bgl_organizzatore_pubblico_json(o) end,
    'pianta', e.pianta,
    'occupati', to_jsonb(occ),
    'riservati', to_jsonb(ris),
    'liberi', greatest(e.posti_totali - cardinality(occ) - cardinality(ris), 0),
    'ora', now());
end $$;
revoke all on function public.bgl_evento_pubblico(text) from public, anon, authenticated;
grant execute on function public.bgl_evento_pubblico(text) to anon, authenticated, service_role;

-- Il limite di tutta internet si conta solo per spettacoli che esistono, sono PUBBLICATI e aperti (0072 + bozze).
create or replace function public.bgl_globale_hit(p_slug text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare e public.bgl_eventi;
begin
  if p_slug is null or p_slug !~ '^[a-z2-9]{10}$' then return jsonb_build_object('ok', false, 'errore', 'evento_inesistente'); end if;
  select * into e from public.bgl_eventi where slug = p_slug;
  if e.id is null or not e.pubblicato then return jsonb_build_object('ok', false, 'errore', 'evento_inesistente'); end if;
  if public.bgl_stato_pubblico(e.stato, e.inizio, e.chiusura) <> 'aperta' then
    return jsonb_build_object('ok', false, 'errore', 'prenotazioni_chiuse');
  end if;
  return jsonb_build_object('ok', true, 'n', public.bgl_throttle_hit(repeat('0', 64)));
end $$;
revoke all on function public.bgl_globale_hit(text) from public, anon, authenticated;
grant execute on function public.bgl_globale_hit(text) to service_role;

-- La pagina dell'organizzatore: gli spettacoli pubblicati in arrivo (o iniziati da meno di 12 ore), in ordine di data.
create or replace function public.bgl_organizzatore_pubblico(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare o public.bgl_organizzatori; v text := lower(btrim(coalesce(p_slug, '')));
begin
  if not public.bgl_slug_ok(v) then return jsonb_build_object('ok', false, 'errore', 'organizzatore_inesistente'); end if;
  select * into o from public.bgl_organizzatori where slug = v and abilitato;
  if o.user_id is null then return jsonb_build_object('ok', false, 'errore', 'organizzatore_inesistente'); end if;
  return jsonb_build_object('ok', true,
    'organizzatore', public.bgl_organizzatore_pubblico_json(o),
    'spettacoli', coalesce((
      select jsonb_agg(jsonb_build_object('s', e.slug_breve, 'titolo', e.titolo, 'inizio', e.inizio, 'luogo', e.luogo,
               'locandina', e.locandina_path, 'stato', public.bgl_stato_pubblico(e.stato, e.inizio, e.chiusura),
               'posti_totali', e.posti_totali, 'liberi', (public.bgl_conteggi(e))->'liberi')
             order by e.inizio, e.creato_il)
        from public.bgl_eventi e
       where e.user_id = o.user_id and e.pubblicato and e.slug_breve is not null
         and now() <= e.inizio + interval '12 hours'), '[]'::jsonb),
    'ora', now());
end $$;
revoke all on function public.bgl_organizzatore_pubblico(text) from public, anon, authenticated;
grant execute on function public.bgl_organizzatore_pubblico(text) to anon, authenticated, service_role;

create or replace function public.bgl_spettacolo_pubblico(p_org text, p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare o public.bgl_organizzatori; e public.bgl_eventi;
        vo text := lower(btrim(coalesce(p_org, ''))); vs text := lower(btrim(coalesce(p_slug, '')));
begin
  if not public.bgl_slug_ok(vo) then return jsonb_build_object('ok', false, 'errore', 'organizzatore_inesistente'); end if;
  select * into o from public.bgl_organizzatori where slug = vo and abilitato;
  if o.user_id is null then return jsonb_build_object('ok', false, 'errore', 'organizzatore_inesistente'); end if;
  if public.bgl_slug_ok(vs) then
    select * into e from public.bgl_eventi where user_id = o.user_id and slug_breve = vs and pubblicato;
  end if;
  if e.id is null then
    return jsonb_build_object('ok', false, 'errore', 'spettacolo_inesistente', 'organizzatore', public.bgl_organizzatore_pubblico_json(o));
  end if;
  return public.bgl_evento_pubblico(e.slug);
end $$;
revoke all on function public.bgl_spettacolo_pubblico(text, text) from public, anon, authenticated;
grant execute on function public.bgl_spettacolo_pubblico(text, text) to anon, authenticated, service_role;
