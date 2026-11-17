-- Inventario con QR: modulo di comodato (17/11/2026). Dopo la consegna fatta dalla pagina del QR, il browser compila il modulo (stampa / PDF).
-- Qui sta SOLO la configurazione dell'ente per inventario (intestazione, nome per esteso, luogo, piè, logo, versione): dati pubblici dell'associazione,
-- impostati dal proprietario e letti solo dai membri. Il repo è pubblico: nel codice non c'è nessun dato dell'ente.
-- NESSUN dato personale nuovo: nome/cognome/corso dell'allievo restano in inv_articoli.assegnato_a come prima; il modulo nasce nel browser e non passa dal server.
-- Funzioni pubbliche e RLS invariate: la pagina anonima del QR non vede niente di nuovo.

alter table public.inv_inventari add column if not exists modulo jsonb;
alter table public.inv_inventari drop constraint if exists inv_inventari_modulo_taglia;
alter table public.inv_inventari add constraint inv_inventari_modulo_taglia check (modulo is null or (jsonb_typeof(modulo) = 'object' and octet_length(modulo::text) <= 120000));

-- salva la configurazione (solo il proprietario). Chiavi ammesse e lunghezze come inv-modulo.js (pulisciModulo): le altre si scartano.
create or replace function public.inv_modulo_salva(p_inv uuid, p_modulo jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); r jsonb := '{}'::jsonb; k text; v text; el jsonb; pie jsonb := '[]'::jsonb;
  lim constant jsonb := '{"ente":120,"ente_breve":60,"registro":40,"intestazione":80,"luogo":60,"firma_ente":60,"versione":40}'::jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.inv_e_proprietario(p_inv) then return jsonb_build_object('ok', false, 'errore', 'non_autorizzato'); end if;
  if p_modulo is null or jsonb_typeof(p_modulo) <> 'object' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'modulo'); end if;
  for k in select jsonb_object_keys(lim) loop
    if p_modulo ? k then
      if jsonb_typeof(p_modulo -> k) <> 'string' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', k); end if;
      v := btrim(regexp_replace(p_modulo ->> k, '[\u0000-\u001f\u007f{}]', ' ', 'g'));
      if char_length(v) > (lim ->> k)::int then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', k); end if;
      r := r || jsonb_build_object(k, v);
    end if;
  end loop;
  if p_modulo ? 'colore' then
    v := coalesce(p_modulo ->> 'colore', '');
    if v <> '' and v !~ '^#[0-9a-fA-F]{6}$' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'colore'); end if;
    r := r || jsonb_build_object('colore', lower(v));
  end if;
  if p_modulo ? 'piede' then
    if jsonb_typeof(p_modulo -> 'piede') <> 'array' or jsonb_array_length(p_modulo -> 'piede') > 3 then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'piede'); end if;
    for el in select * from jsonb_array_elements(p_modulo -> 'piede') loop
      if jsonb_typeof(el) <> 'string' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'piede'); end if;
      v := btrim(regexp_replace(el #>> '{}', '[\u0000-\u001f\u007f{}]', ' ', 'g'));
      if char_length(v) > 140 then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'piede'); end if;
      if v <> '' then pie := pie || to_jsonb(v); end if;
    end loop;
    r := r || jsonb_build_object('piede', pie);
  end if;
  if p_modulo ? 'logo' then
    v := coalesce(p_modulo ->> 'logo', '');
    if v <> '' and (char_length(v) > 100000 or v !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+=*$') then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'logo'); end if;
    r := r || jsonb_build_object('logo', v);
  end if;
  update public.inv_inventari set modulo = r, aggiornato = now() where id = p_inv;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.inv_modulo_salva(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.inv_modulo_salva(uuid, jsonb) to authenticated, service_role;

-- la scheda riservata dei membri: stessa firma di prima, in più la configurazione del modulo (l'anonimo continua a ricevere null)
create or replace function public.inv_scheda_membro(p_slug text, p_codice text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a public.inv_articoli; inv_id uuid;
begin
  if (select auth.uid()) is null then return null; end if;
  select i.id into inv_id from public.inv_inventari i where i.slug = lower(btrim(coalesce(p_slug, '')));
  if inv_id is null or not public.inv_e_membro(inv_id) then return null; end if;
  select * into a from public.inv_articoli x where x.inventario_id = inv_id and x.codice = upper(btrim(coalesce(p_codice, '')));
  if a.id is null then return null; end if;
  return jsonb_build_object('stato', a.stato, 'assegnato_a', a.assegnato_a, 'data_consegna', a.data_consegna, 'data_rientro', a.data_rientro, 'note', a.note,
    'proprietario', public.inv_e_proprietario(inv_id),
    'modulo', (select i.modulo from public.inv_inventari i where i.id = inv_id),
    'movimenti', coalesce((select jsonb_agg(jsonb_build_object('tipo', m.tipo, 'a_chi', m.a_chi, 'data', m.data, 'nota', m.nota, 'autore', m.autore) order by m.creato desc, m.id desc)
                             from (select * from public.inv_movimenti where articolo_id = a.id order by creato desc, id desc limit 30) m), '[]'::jsonb));
end $$;
revoke all on function public.inv_scheda_membro(text, text) from public, anon, authenticated;
grant execute on function public.inv_scheda_membro(text, text) to authenticated, service_role;
