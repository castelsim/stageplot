-- 0077 — Biglietteria: «Sposta» una prenotazione (specifica area §4.1, decisione D6) e l'avviso per mail.
-- Atomicità: lo spettacolo si prende FOR UPDATE (bgl_prenota lo legge FOR SHARE e aspetta), poi la prenotazione FOR
-- UPDATE (bgl_disdici e bgl_annulla la prendono FOR UPDATE e aspettano); vecchi posti via e nuovi dentro nello stesso
-- blocco: se un posto è preso, non cambia niente. Stesso numero di posti di adesso (il tetto di 4 non si scavalca).
-- Solo aggiunte; idempotente.

alter table public.bgl_prenotazioni
  add column if not exists spostata_il timestamptz,
  add column if not exists avvisi int not null default 0;

create or replace function public.bgl_sposta(p_prenotazione_id uuid, p_posti text[])
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); e public.bgl_eventi; p public.bgl_prenotazioni;
  v_posti text[]; v_ora text[]; v_chiavi text[]; v_mancanti text[]; v_presi text[];
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.bgl_abilitato_uid(uid) then return jsonb_build_object('ok', false, 'errore', 'non_abilitato'); end if;
  select e0.* into e from public.bgl_eventi e0
   where e0.id = (select q.evento_id from public.bgl_prenotazioni q where q.id = p_prenotazione_id) and e0.user_id = uid
   for update;
  if e.id is null then return jsonb_build_object('ok', false, 'errore', 'non_tuo'); end if;
  select * into p from public.bgl_prenotazioni where id = p_prenotazione_id for update;
  if p.stato <> 'attiva' then return jsonb_build_object('ok', false, 'errore', 'gia_disdetta'); end if;
  if public.bgl_stato_pubblico(e.stato, e.inizio, e.chiusura) = 'conclusa' then
    return jsonb_build_object('ok', false, 'errore', 'evento_concluso');
  end if;
  select coalesce(array_agg(x order by i), '{}') into v_posti
    from (select distinct on (x) x, i from unnest(coalesce(p_posti, '{}')) with ordinality u(x, i) order by x, i) d;
  if cardinality(v_posti) = 0 or exists (select 1 from unnest(v_posti) x where not public.bgl_chiave_ok(x)) then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'posti');
  end if;
  select coalesce(array_agg(posto order by posto), '{}') into v_ora from public.bgl_posti where prenotazione_id = p.id;
  if cardinality(v_posti) <> cardinality(v_ora) then
    return jsonb_build_object('ok', false, 'errore', 'numero_diverso', 'prima', cardinality(v_ora));
  end if;
  v_chiavi := public.bgl_chiavi(e.pianta);
  select coalesce(array_agg(x), '{}') into v_mancanti from unnest(v_posti) x where not (x = any(v_chiavi));
  if cardinality(v_mancanti) > 0 then return jsonb_build_object('ok', false, 'errore', 'posto_inesistente', 'posti', to_jsonb(v_mancanti)); end if;
  select coalesce(array_agg(posto order by posto), '{}') into v_presi
    from public.bgl_posti where evento_id = e.id and posto = any(v_posti) and prenotazione_id <> p.id;
  if cardinality(v_presi) > 0 then return jsonb_build_object('ok', false, 'errore', 'posto_preso', 'presi', to_jsonb(v_presi)); end if;
  begin
    delete from public.bgl_posti where prenotazione_id = p.id;
    insert into public.bgl_posti (evento_id, posto, prenotazione_id) select e.id, x, p.id from unnest(v_posti) x;
  exception when unique_violation then
    select coalesce(array_agg(posto order by posto), '{}') into v_presi
      from public.bgl_posti where evento_id = e.id and posto = any(v_posti) and prenotazione_id <> p.id;
    return jsonb_build_object('ok', false, 'errore', 'posto_preso', 'presi', to_jsonb(v_presi));
  end;
  update public.bgl_prenotazioni set posti = v_posti, spostata_il = now() where id = p.id;
  update public.bgl_eventi
     set riservati = coalesce((select array_agg(r order by i) from unnest(riservati) with ordinality u(r, i) where not (r = any(v_posti))), '{}'),
         riservati_per = riservati_per - v_posti, aggiornato_il = now()
   where id = e.id;
  return jsonb_build_object('ok', true, 'prima', to_jsonb(v_ora), 'posti', to_jsonb(v_posti));
end $$;
revoke all on function public.bgl_sposta(uuid, text[]) from public, anon, authenticated;
grant execute on function public.bgl_sposta(uuid, text[]) to authenticated, service_role;

-- I dati per la mail «posti cambiati»: la chiama SOLO la Edge Function bgl-avvisa, con lo uid ricavato dal token.
create or replace function public.bgl_avviso_spostamento(p_uid uuid, p_prenotazione_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare p public.bgl_prenotazioni; e public.bgl_eventi; o public.bgl_organizzatori; v_posti jsonb;
begin
  if not public.bgl_abilitato_uid(p_uid) then return jsonb_build_object('ok', false, 'errore', 'non_abilitato'); end if;
  select p0.* into p from public.bgl_prenotazioni p0 join public.bgl_eventi e0 on e0.id = p0.evento_id
   where p0.id = p_prenotazione_id and e0.user_id = p_uid for update of p0;
  if p.id is null then return jsonb_build_object('ok', false, 'errore', 'non_tuo'); end if;
  select * into e from public.bgl_eventi where id = p.evento_id;
  select * into o from public.bgl_organizzatori where user_id = e.user_id;
  if p.stato <> 'attiva' then return jsonb_build_object('ok', false, 'errore', 'gia_disdetta'); end if;
  if p.email is null then return jsonb_build_object('ok', false, 'errore', 'dati_cancellati'); end if;
  if p.spostata_il is null or p.spostata_il < now() - interval '1 hour' then
    return jsonb_build_object('ok', false, 'errore', 'non_spostata');
  end if;
  if p.avvisi >= 3 then return jsonb_build_object('ok', false, 'errore', 'troppi_avvisi'); end if;
  update public.bgl_prenotazioni set avvisi = avvisi + 1 where id = p.id;
  select coalesce(jsonb_agg(b.posto order by b.posto), '[]'::jsonb) into v_posti from public.bgl_posti b where b.prenotazione_id = p.id;
  return jsonb_build_object('ok', true, 'email', p.email, 'codice', p.codice, 'posti', v_posti,
    'evento', jsonb_build_object('titolo', e.titolo, 'inizio', e.inizio, 'luogo', e.luogo,
      'percorso', case when o.slug is not null and e.slug_breve is not null then o.slug || '/' || e.slug_breve else '?e=' || e.slug end));
end $$;
revoke all on function public.bgl_avviso_spostamento(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bgl_avviso_spostamento(uuid, uuid) to service_role;
