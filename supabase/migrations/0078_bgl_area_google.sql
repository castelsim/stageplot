-- 0078 — Biglietteria: il pubblico con l'account Google (specifica area §3.3, §3.4, §6; decisioni D2, D9).
--   · bgl_prenotazioni.user_id: la prenotazione fatta con Google è legata all'account (on delete set null).
--   · bgl_pubblico: l'«origine biglietteria» di un account (D2) — riga scritta da bgl_prenota, nella stessa
--     transazione, solo se l'account non ha progetti. Chiusa come le altre: solo il servizio.
--   · bgl_prenota: + p_user_id (default null: le chiamate di prima con 7 argomenti funzionano uguali), tetto di 4 posti
--     anche per ACCOUNT (lucchetto per account fra quello della connessione e quello dell'email: sempre lo stesso ordine),
--     bozze rifiutate. La firma cambia: si toglie la vecchia e si crea la nuova nella stessa transazione.
--   · «Le mie prenotazioni», disdetta dall'account, stato dell'account, pulizia a 12 mesi (D9).
--   · ORDINE DI MESSA ONLINE: questa migrazione PRIMA della Edge Function che passa p_user_id (task 24).

alter table public.bgl_prenotazioni add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists bgl_prenotazioni_user_idx on public.bgl_prenotazioni (user_id) where user_id is not null;

create table if not exists public.bgl_pubblico (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  primo_il  timestamptz not null default now(),
  ultimo_il timestamptz not null default now()
);
alter table public.bgl_pubblico enable row level security;
revoke all on table public.bgl_pubblico from public, anon, authenticated;
grant select, insert, update, delete on table public.bgl_pubblico to service_role;

drop function if exists public.bgl_prenota(text, text[], text, text, text, text, text);
create or replace function public.bgl_prenota(p_slug text, p_posti text[], p_nome text, p_cognome text, p_email text,
                                              p_ip_hash text default null, p_token text default null, p_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  e public.bgl_eventi; v_posti text[]; v_nome text; v_cognome text; v_email text; v_email_norm text;
  v_chiavi text[]; v_mancanti text[]; v_riservati text[]; v_presi text[]; v_gia int; v_gia_ip int; v_gia_u int;
  v_codice text; v_token text; v_pid uuid; v_vincolo text; v_prima public.bgl_prenotazioni;
  v_mail_dest int; v_disdette int; v_mail boolean;
begin
  -- 1. normalizza e valida (seconda serratura dopo la Edge Function)
  select coalesce(array_agg(x order by i), '{}') into v_posti
    from (select distinct on (x) x, i from unnest(coalesce(p_posti, '{}')) with ordinality u(x, i) order by x, i) d;
  if cardinality(v_posti) = 0 then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'posti'); end if;
  if cardinality(v_posti) > 4 then return jsonb_build_object('ok', false, 'errore', 'troppi_posti'); end if;
  if exists (select 1 from unnest(v_posti) x where not public.bgl_chiave_ok(x)) then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'posti');
  end if;
  v_nome := public.bgl_testo(p_nome, 1, 60);
  if v_nome is null or not public.bgl_nome_ok(v_nome) then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'nome'); end if;
  v_cognome := public.bgl_testo(p_cognome, 1, 60);
  if v_cognome is null or not public.bgl_nome_ok(v_cognome) then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'cognome'); end if;
  v_email := public.bgl_testo(p_email, 3, 254);
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'email');
  end if;
  v_email_norm := public.bgl_email_norm(v_email);
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'connessione');
  end if;
  if p_token is not null and p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'token');
  end if;

  -- 2. lo spettacolo: esiste, è PUBBLICATO (0078) ed è aperto. FOR SHARE come nella 0072.
  if p_slug is null or p_slug !~ '^[a-z2-9]{10}$' then return jsonb_build_object('ok', false, 'errore', 'evento_inesistente'); end if;
  select * into e from public.bgl_eventi where slug = p_slug for share;
  if e.id is null or not e.pubblicato then return jsonb_build_object('ok', false, 'errore', 'evento_inesistente'); end if;
  if public.bgl_stato_pubblico(e.stato, e.inizio, e.chiusura) <> 'aperta' then
    return jsonb_build_object('ok', false, 'errore', 'prenotazioni_chiuse');
  end if;

  -- 3. posti della pianta e non tenuti da parte
  v_chiavi := public.bgl_chiavi(e.pianta);
  select coalesce(array_agg(x), '{}') into v_mancanti from unnest(v_posti) x where not (x = any(v_chiavi));
  if cardinality(v_mancanti) > 0 then
    return jsonb_build_object('ok', false, 'errore', 'posto_inesistente', 'posti', to_jsonb(v_mancanti));
  end if;
  select coalesce(array_agg(x), '{}') into v_riservati from unnest(v_posti) x where x = any(e.riservati);
  if cardinality(v_riservati) > 0 then
    return jsonb_build_object('ok', false, 'errore', 'posto_riservato', 'posti', to_jsonb(v_riservati));
  end if;

  -- 4. in fila: connessione, ACCOUNT, email (sempre in quest'ordine: niente stalli)
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended(e.id::text || '|ip|' || p_ip_hash, 0));
  end if;
  if p_user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(e.id::text || '|u|' || p_user_id::text, 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended(e.id::text || '|' || v_email_norm, 0));

  -- 5. la stessa richiesta ripetuta: stessa prenotazione (anche lo stesso account)
  if p_token is not null then
    select * into v_prima from public.bgl_prenotazioni where token_hash = public.bgl_impronta(p_token);
    if v_prima.id is not null then
      if v_prima.evento_id = e.id and v_prima.email_norm = v_email_norm and v_prima.stato = 'attiva'
         and v_prima.user_id is not distinct from p_user_id
         and (select array_agg(x order by x) from unnest(v_prima.posti) x) = (select array_agg(x order by x) from unnest(v_posti) x) then
        return jsonb_build_object('ok', true, 'ripetuta', true, 'mail', false, 'prenotazione_id', v_prima.id,
          'codice', v_prima.codice, 'token', p_token, 'posti', to_jsonb(v_prima.posti),
          'evento', jsonb_build_object('slug', e.slug, 'titolo', e.titolo, 'inizio', e.inizio, 'luogo', e.luogo, 'note', e.note),
          'nome', v_prima.nome, 'cognome', v_prima.cognome, 'email', v_prima.email);
      end if;
      return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'token');
    end if;
  end if;

  -- 6. tetto per email
  select count(*) into v_gia
    from public.bgl_posti b join public.bgl_prenotazioni p on p.id = b.prenotazione_id
   where b.evento_id = e.id and p.email_norm = v_email_norm and p.stato = 'attiva';
  if v_gia + cardinality(v_posti) > 4 then
    return jsonb_build_object('ok', false, 'errore', 'limite_email', 'gia', v_gia, 'max', 4);
  end if;

  -- 6b. tetto per ACCOUNT (0078): 4 posti per account e per spettacolo, qualunque email abbia scritto
  if p_user_id is not null then
    select count(*) into v_gia_u
      from public.bgl_posti b join public.bgl_prenotazioni p on p.id = b.prenotazione_id
     where b.evento_id = e.id and p.user_id = p_user_id and p.stato = 'attiva';
    if v_gia_u + cardinality(v_posti) > 4 then
      return jsonb_build_object('ok', false, 'errore', 'limite_account', 'gia', v_gia_u, 'max', 4);
    end if;
  end if;

  -- 7. tetto per connessione
  if p_ip_hash is not null then
    select count(*) into v_gia_ip
      from public.bgl_posti b join public.bgl_prenotazioni p on p.id = b.prenotazione_id
     where b.evento_id = e.id and p.ip_hash = p_ip_hash and p.stato = 'attiva';
    if v_gia_ip + cardinality(v_posti) > 8 then
      return jsonb_build_object('ok', false, 'errore', 'limite_connessione', 'gia', v_gia_ip, 'max', 8);
    end if;
  end if;

  -- 8. posti già presi
  select coalesce(array_agg(posto order by posto), '{}') into v_presi
    from public.bgl_posti where evento_id = e.id and posto = any(v_posti);
  if cardinality(v_presi) > 0 then
    return jsonb_build_object('ok', false, 'errore', 'posto_preso', 'presi', to_jsonb(v_presi));
  end if;

  -- 9. inserisce (con l'account, se c'è)
  for tentativo in 1..5 loop
    v_codice := public.bgl_casuale('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
    v_token := coalesce(p_token, replace(gen_random_uuid()::text, '-', ''));
    begin
      insert into public.bgl_prenotazioni (evento_id, codice, token_hash, nome, cognome, email, email_norm, posti, ip_hash, user_id)
      values (e.id, v_codice, public.bgl_impronta(v_token), v_nome, v_cognome, v_email, v_email_norm, v_posti, p_ip_hash, p_user_id)
      returning id into v_pid;
      insert into public.bgl_posti (evento_id, posto, prenotazione_id)
      select e.id, x, v_pid from unnest(v_posti) x;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_vincolo = constraint_name;
      v_pid := null;
      if v_vincolo = 'bgl_posti_pkey' then
        select coalesce(array_agg(posto order by posto), '{}') into v_presi
          from public.bgl_posti where evento_id = e.id and posto = any(v_posti);
        return jsonb_build_object('ok', false, 'errore', 'posto_preso', 'presi', to_jsonb(v_presi));
      end if;
      if v_vincolo = 'bgl_prenotazioni_token_hash_key' and p_token is not null then
        return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'token');
      end if;
    end;
  end loop;
  if v_pid is null then raise exception 'bgl_prenota: codice unico non trovato'; end if;

  -- 9b. l'origine «biglietteria» (D2): solo per chi non usa l'editor; l'ultimo uso serve alla pulizia dei 12 mesi
  if p_user_id is not null then
    insert into public.bgl_pubblico (user_id)
    select p_user_id where not exists (select 1 from public.stageplot_projects where user_id = p_user_id)
    on conflict (user_id) do update set ultimo_il = now();
  end if;

  -- 10. la mail (stesse regole della 0072)
  select count(*) into v_mail_dest from public.bgl_prenotazioni
   where email_norm = v_email_norm and creata_il > now() - interval '24 hours';
  v_disdette := 0;
  if p_ip_hash is not null then
    select count(*) into v_disdette from public.bgl_prenotazioni
     where ip_hash = p_ip_hash and stato = 'disdetta' and chiusa_il > now() - interval '1 hour';
  end if;
  v_mail := v_mail_dest <= 3 and v_disdette < 2;

  -- 11. l'unica volta in cui il token esce dal database
  return jsonb_build_object('ok', true, 'ripetuta', false, 'mail', v_mail, 'prenotazione_id', v_pid, 'codice', v_codice,
    'token', v_token, 'posti', to_jsonb(v_posti),
    'evento', jsonb_build_object('slug', e.slug, 'titolo', e.titolo, 'inizio', e.inizio, 'luogo', e.luogo, 'note', e.note),
    'nome', v_nome, 'cognome', v_cognome, 'email', v_email);
end $$;
revoke all on function public.bgl_prenota(text, text[], text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.bgl_prenota(text, text[], text, text, text, text, text, uuid) to service_role;

-- ───────────────────────────────────────────────────────────────────────── «Le mie prenotazioni»
create or replace function public.bgl_mie_prenotazioni()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  update public.bgl_pubblico set ultimo_il = now() where user_id = uid;
  return jsonb_build_object('ok', true, 'prenotazioni', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'codice', p.codice, 'stato', p.stato,
             'posti', case when p.stato = 'attiva'
                           then coalesce((select jsonb_agg(b.posto order by b.posto) from public.bgl_posti b where b.prenotazione_id = p.id), '[]'::jsonb)
                           else to_jsonb(p.posti) end,
             'disdicibile', p.stato = 'attiva' and now() < e.inizio,
             'evento', jsonb_build_object('titolo', e.titolo, 'inizio', e.inizio, 'luogo', e.luogo,
               'stato', public.bgl_stato_pubblico(e.stato, e.inizio, e.chiusura),
               'percorso', case when o.slug is not null and e.slug_breve is not null then o.slug || '/' || e.slug_breve else '?e=' || e.slug end))
           order by (e.inizio < now()), case when e.inizio >= now() then e.inizio end, e.inizio desc)
      from public.bgl_prenotazioni p
      join public.bgl_eventi e on e.id = p.evento_id
      left join public.bgl_organizzatori o on o.user_id = e.user_id and o.abilitato
     where p.user_id = uid), '[]'::jsonb));
end $$;
revoke all on function public.bgl_mie_prenotazioni() from public, anon, authenticated;
grant execute on function public.bgl_mie_prenotazioni() to authenticated, service_role;

create or replace function public.bgl_disdici_mia(p_prenotazione_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); p public.bgl_prenotazioni; e public.bgl_eventi; n int;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  select * into p from public.bgl_prenotazioni where id = p_prenotazione_id and user_id = uid for update;
  if p.id is null then return jsonb_build_object('ok', false, 'errore', 'non_tuo'); end if;
  if p.stato <> 'attiva' then return jsonb_build_object('ok', false, 'errore', 'gia_disdetta'); end if;
  select * into e from public.bgl_eventi where id = p.evento_id;
  if now() >= e.inizio then return jsonb_build_object('ok', false, 'errore', 'evento_concluso'); end if;
  delete from public.bgl_posti where prenotazione_id = p.id;
  get diagnostics n = row_count;
  update public.bgl_prenotazioni set stato = 'disdetta', chiusa_il = now() where id = p.id;
  return jsonb_build_object('ok', true, 'liberati', n);
end $$;
revoke all on function public.bgl_disdici_mia(uuid) from public, anon, authenticated;
grant execute on function public.bgl_disdici_mia(uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────── account solo biglietteria (D9) e pulizia
create or replace function public.bgl_account_solo_biglietteria(p_uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.bgl_pubblico where user_id = p_uid)
     and not exists (select 1 from public.stageplot_projects where user_id = p_uid)
     and not exists (select 1 from public.stageplot_contacts where user_id = p_uid)
     and not exists (select 1 from public.bgl_organizzatori where user_id = p_uid)
     and not exists (select 1 from public.bgl_eventi where user_id = p_uid)
     and not exists (select 1 from public.orc_profiles where id = p_uid)
     and not exists (select 1 from public.orc_memberships where user_id = p_uid)
     and not exists (select 1 from public.orc_musician_profiles where user_id = p_uid)
     -- e nessun altro dato che la cancellazione dell'account porterebbe via con sé (on delete cascade) o
     -- staccherebbe da lui: richieste, consensi, file, musicisti, reparti, consulenze. Meglio un «scrivici» in più
     -- che un dato di lavoro perso per una pulizia automatica.
     and not exists (select 1 from public.sp_requests where user_id = p_uid)
     and not exists (select 1 from public.orc_client_requests where user_id = p_uid)
     and not exists (select 1 from public.orc_consents where user_id = p_uid)
     and not exists (select 1 from public.orc_files where owner_user_id = p_uid)
     and not exists (select 1 from public.orc_musicians where user_id = p_uid)
     and not exists (select 1 from public.stageplot_dept_assign where user_id = p_uid)
     and not exists (select 1 from public.stageplot_item_contacts where user_id = p_uid)
     and not exists (select 1 from public.consultation_requests where user_id = p_uid)
     -- revisione T23: una segnalazione dall'editor (feedback, on delete set null) terrebbe l'email in chiaro staccata
     -- dall'account; e le colonne «creato da» di Orchestre. Un test controlla che ogni riferimento ad auth.users sia qui.
     and not exists (select 1 from public.feedback where user_id = p_uid)
     and not exists (select 1 from public.sp_request_versions where reopened_by = p_uid)
     and not exists (select 1 from public.orc_organizations where created_by = p_uid)
     and not exists (select 1 from public.orc_musicians where created_by = p_uid)
     and not exists (select 1 from public.orc_musician_exclusions where created_by = p_uid)
     and not exists (select 1 from public.orc_productions where created_by = p_uid)
     and not exists (select 1 from public.orc_matching_rulesets where created_by = p_uid)
     and not exists (select 1 from public.orc_matching_runs where ran_by = p_uid)
     and not exists (select 1 from public.orc_invitations where created_by = p_uid)
     and not exists (select 1 from public.orc_performance_feedback where author_id = p_uid)
     and not exists (select 1 from public.orc_evaluations where author_id = p_uid)
     and not exists (select 1 from public.orc_musician_invites where claimed_by = p_uid)
$$;
revoke all on function public.bgl_account_solo_biglietteria(uuid) from public, anon, authenticated;
grant execute on function public.bgl_account_solo_biglietteria(uuid) to service_role;

create or replace function public.bgl_account_stato()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  return jsonb_build_object('ok', true, 'solo_biglietteria', public.bgl_account_solo_biglietteria(uid),
    'prenotazioni_future', (select count(*) from public.bgl_prenotazioni p join public.bgl_eventi e on e.id = p.evento_id
                             where p.user_id = uid and p.stato = 'attiva' and e.inizio > now()));
end $$;
revoke all on function public.bgl_account_stato() from public, anon, authenticated;
grant execute on function public.bgl_account_stato() to authenticated, service_role;

-- Prima di cancellare un account (dall'utente o dalla pulizia): le prenotazioni future si disdicono (i posti tornano
-- liberi), nomi ed email di tutte si tolgono subito. Chi poi cancella l'account è la Edge Function, con l'Admin API (D3).
create or replace function public.bgl_account_prepara_eliminazione(p_uid uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n_d int; n_a int;
begin
  if not public.bgl_account_solo_biglietteria(p_uid) then return jsonb_build_object('ok', false, 'errore', 'account_in_uso'); end if;
  -- prima le sue prenotazioni FOR UPDATE (come bgl_disdici e bgl_sposta): uno «Sposta» in corso finisce, e la
  -- delete qui sotto, con una fotografia nuova, vede anche i posti che ha appena scritto
  perform 1 from public.bgl_prenotazioni where user_id = p_uid for update;
  delete from public.bgl_posti b using public.bgl_prenotazioni p, public.bgl_eventi e
   where b.prenotazione_id = p.id and p.evento_id = e.id and p.user_id = p_uid and p.stato = 'attiva' and e.inizio > now();
  update public.bgl_prenotazioni p set stato = 'disdetta', chiusa_il = now()
    from public.bgl_eventi e where e.id = p.evento_id and p.user_id = p_uid and p.stato = 'attiva' and e.inizio > now();
  get diagnostics n_d = row_count;
  update public.bgl_prenotazioni set nome = null, cognome = null, email = null, email_norm = null, token_hash = null,
         ip_hash = null, anonimizzata_il = now()
   where user_id = p_uid and anonimizzata_il is null;
  get diagnostics n_a = row_count;
  return jsonb_build_object('ok', true, 'disdette', n_d, 'anonimizzate', n_a);
end $$;
revoke all on function public.bgl_account_prepara_eliminazione(uuid) from public, anon, authenticated;
grant execute on function public.bgl_account_prepara_eliminazione(uuid) to service_role;

-- Gli account da cancellare nella purga giornaliera: «del pubblico», solo biglietteria, senza prenotazioni future,
-- fermi da 12 mesi (ultimo accesso, o ultimo uso della biglietteria, o creazione: il più recente).
create or replace function public.bgl_account_da_pulire(p_limite int default 200)
returns uuid[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(x.user_id), '{}') from (
    select b.user_id from public.bgl_pubblico b join auth.users u on u.id = b.user_id
     where greatest(u.last_sign_in_at, u.created_at, b.ultimo_il) < now() - interval '12 months'
       and public.bgl_account_solo_biglietteria(b.user_id)
       and not exists (select 1 from public.bgl_prenotazioni p join public.bgl_eventi e on e.id = p.evento_id
                        where p.user_id = b.user_id and p.stato = 'attiva' and e.inizio > now())
     order by b.ultimo_il
     limit greatest(1, least(coalesce(p_limite, 200), 1000))) x
$$;
revoke all on function public.bgl_account_da_pulire(int) from public, anon, authenticated;
grant execute on function public.bgl_account_da_pulire(int) to service_role;
