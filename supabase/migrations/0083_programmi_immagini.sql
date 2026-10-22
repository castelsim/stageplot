-- 0083 — Programma di sala: lo spazio delle immagini (versione grafica: logo, copertina, immagini, gallerie).
--   · Bucket PUBBLICO `prg-immagini` (il programma lo legge chiunque dal QR): solo image/webp, image/jpeg, image/png
--     (niente SVG: porterebbe script), al massimo 3 MB per file.
--   · Percorso obbligatorio <auth.uid()>/<32 hex>.(webp|jpg|png), nome casuale deciso nel browser (non indovinabile).
--   · Carica e togli solo da account autenticati E abilitati, solo nella propria cartella. Lettura pubblica (bucket public).
--   · Nessuna policy di update: file immutabili, per cambiare un'immagine se ne carica una nuova con un nome nuovo.
--   · Le policy chiamano bgl_abilitato() (senza argomenti, concessa ad authenticated): bgl_abilitato_uid(uuid) è solo del
--     servizio e una policy che la chiamasse darebbe «permission denied» (stessa trappola della 0076).
--   · I file NON si cancellano in SQL (Supabase lo rifiuta, 0062): il browser li toglie con la Storage API.
--   · La tabella prg_programmi e le funzioni della 0082 non cambiano: nel documento le immagini sono solo URL (il tetto di
--     100 KB su `dati` resta); la pagina accetta solo URL di questo bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prg-immagini', 'prg-immagini', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists prg_immagini_carica on storage.objects;
create policy prg_immagini_carica on storage.objects for insert to authenticated
  with check (bucket_id = 'prg-immagini'
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{32}\.(webp|jpg|png)$')
    and public.bgl_abilitato());

-- elenco/ricerca dei soli file propri (serve anche alla Storage API per trovare il file da togliere)
drop policy if exists prg_immagini_proprie on storage.objects;
create policy prg_immagini_proprie on storage.objects for select to authenticated
  using (bucket_id = 'prg-immagini' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists prg_immagini_togli on storage.objects;
create policy prg_immagini_togli on storage.objects for delete to authenticated
  using (bucket_id = 'prg-immagini' and (storage.foldername(name))[1] = auth.uid()::text
    and public.bgl_abilitato());
