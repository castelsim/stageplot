-- 0076 — Biglietteria: lo spazio delle locandine (specifica area §5, decisione D4).
--   · Lettura pubblica (le locandine stanno sulla pagina del pubblico).
--   · Scrittura solo da account ABILITATI, solo nella propria cartella, solo col nome casuale <uid>/<32 hex>.webp|jpg
--     (deciso nel browser con crypto.getRandomValues: non indovinabile prima della pubblicazione).
--   · Tipi solo image/webp e image/jpeg (niente SVG: porterebbe script), al massimo 1 MB (il browser manda ≤ 400 KB).
--   · Nessuna policy di update: un file pubblicato non si sovrascrive; se ne carica uno nuovo.
--   · Le policy chiamano bgl_abilitato() (senza argomenti, concessa ad authenticated): bgl_abilitato_uid è solo del servizio.
--   · I file non si cancellano in SQL (Supabase lo rifiuta, 0062): il browser li toglie con la Storage API e la purga
--     notturna (retention-purge) toglie quelli che nessuno cita più da 24 ore.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bgl-locandine', 'bgl-locandine', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists bgl_locandine_carica on storage.objects;
create policy bgl_locandine_carica on storage.objects for insert to authenticated
  with check (bucket_id = 'bgl-locandine'
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{32}\.(webp|jpg)$')
    and public.bgl_abilitato());

drop policy if exists bgl_locandine_proprie on storage.objects;
create policy bgl_locandine_proprie on storage.objects for select to authenticated
  using (bucket_id = 'bgl-locandine' and (storage.foldername(name))[1] = auth.uid()::text);

-- Un file citato da uno spettacolo o dal logo della pagina non si cancella (revisione T23): la scheda resterebbe con
-- un'immagine rotta. L'area lo toglie solo DOPO che il salvataggio o l'eliminazione hanno smesso di citarlo.
-- Risponde solo per i file della propria cartella (per gli altri dice sempre «citato»: niente da sapere sui nomi altrui).
create or replace function public.bgl_locandina_citata(p_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is null or coalesce((storage.foldername(p_name))[1], '') <> auth.uid()::text
      or exists (select 1 from public.bgl_eventi e where e.locandina_path = p_name)
      or exists (select 1 from public.bgl_organizzatori g where g.logo_path = p_name)
$$;
revoke all on function public.bgl_locandina_citata(text) from public, anon, authenticated;
grant execute on function public.bgl_locandina_citata(text) to authenticated, service_role;

drop policy if exists bgl_locandine_togli on storage.objects;
create policy bgl_locandine_togli on storage.objects for delete to authenticated
  using (bucket_id = 'bgl-locandine' and (storage.foldername(name))[1] = auth.uid()::text
    and not public.bgl_locandina_citata(name));

create or replace function public.bgl_locandine_orfane(p_prima timestamptz)
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(x.name order by x.name), '{}') from (
    select o.name from storage.objects o
     where o.bucket_id = 'bgl-locandine' and o.created_at < p_prima
       and not exists (select 1 from public.bgl_eventi e where e.locandina_path = o.name)
       and not exists (select 1 from public.bgl_organizzatori g where g.logo_path = o.name)
     order by o.created_at limit 1000) x
$$;
revoke all on function public.bgl_locandine_orfane(timestamptz) from public, anon, authenticated;
grant execute on function public.bgl_locandine_orfane(timestamptz) to service_role;
