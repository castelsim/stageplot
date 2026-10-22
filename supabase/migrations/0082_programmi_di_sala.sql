-- 0082 — Programma di sala: una pagina pubblica a indirizzo FISSO (/programma/<slug>) il cui contenuto cambia a ogni concerto.
--
-- PERCHÉ: un QR stampato su un roll-up non si può ristampare a ogni concerto. L'indirizzo (slug) resta, il programma dietro cambia.
-- Chi scrive: solo un account abilitato alla biglietteria (bgl_abilitato_uid, 0073). Chi legge: chiunque, ma solo se pubblicato.
--
-- Come la biglietteria: la tabella è chiusa ai client (RLS attiva, nessun insert/update/delete diretto; select solo del
-- proprietario); si scrive con prg_salva() e si legge in pubblico con prg_programma_pubblico(), entrambe security definer.
-- Mai email o user_id in uscita dalla funzione pubblica.
--
-- Account: user_id → auth.users on delete cascade, come bgl_organizzatori. Poiché la tabella punta a un account,
-- bgl_account_solo_biglietteria (0078) la guarda: chi ha un programma non è «solo biglietteria» e non viene pulito.
--
-- FORMATO di `dati` (v1; ≤ 100 KB; oggetto; v = 1 numero). Ogni campo è facoltativo tranne v; tipi sconosciuti ignorati.
--   {"v":1,
--    "intestazione":{"sopratitolo":"…","titolo":"…","titolo_corsivo":"…","righe":["…"],"quando":"…"},
--    "sezioni":[
--      {"tipo":"interpreti","etichetta":"…","titolo":"…","persone":[{"nome":"…","ruolo":"…"}],"nota":"…"},
--      {"tipo":"brani","etichetta":"…","titolo":"…","voci":[{"titolo":"…","dettaglio":"…","brani":"…","nota":"…"}]},
--      {"tipo":"testo","etichetta":"…","titolo":"…","paragrafi":["…"]}],
--    "link":[{"testo":"…","url":"https://…"}]}
-- La struttura fine la controlla la pagina (programma/prg.js, validaDati): il server garantisce forma, tetto e versione.
--
-- Trappola 0074: nessuna funzione `language sql` cita oggetti creati più sotto; ogni attrezzo è definito prima dell'uso.
-- Idempotente (si ripassa con psql durante lo sviluppo).

-- ───────────────────────────────────────────────────────────── attrezzo: parole riservate dell'indirizzo
-- stesse regole degli slug organizzatore (bgl_slug_ok, 0074) + le parole che sono file o pagine sotto /programma/
create or replace function public.prg_slug_riservato(p text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select public.bgl_slug_riservato(p) or p = any (array['programma','programmi','index','prg'])
$$;
revoke all on function public.prg_slug_riservato(text) from public, anon, authenticated;
grant execute on function public.prg_slug_riservato(text) to service_role;

-- ───────────────────────────────────────────────────────────── tabella
create table if not exists public.prg_programmi (
  slug       text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  dati       jsonb not null,
  pubblicato boolean not null default false,
  creato     timestamptz not null default now(),
  aggiornato timestamptz not null default now(),
  constraint prg_slug_formato check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and slug !~ '--'),
  -- coalesce: un CHECK con NULL PASSA (un oggetto senza «v» darebbe NULL e sarebbe accettato)
  constraint prg_dati_forma check (coalesce(jsonb_typeof(dati) = 'object' and jsonb_typeof(dati->'v') = 'number' and dati->>'v' = '1'
                                            and octet_length(dati::text) <= 102400, false))
);
create index if not exists prg_programmi_user_idx on public.prg_programmi (user_id);

alter table public.prg_programmi enable row level security;
revoke all on table public.prg_programmi from public, anon, authenticated;
grant select on table public.prg_programmi to authenticated;
grant all on table public.prg_programmi to service_role;

drop policy if exists prg_programmi_select_proprietario on public.prg_programmi;
create policy prg_programmi_select_proprietario on public.prg_programmi
  for select to authenticated using (user_id = (select auth.uid()));

-- ───────────────────────────────────────────────────────────── RPC: salva (solo abilitati)
create or replace function public.prg_salva(p_slug text, p_dati jsonb, p_pubblicato boolean)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v text := lower(btrim(coalesce(p_slug, ''))); r public.prg_programmi;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.bgl_abilitato_uid(uid) then return jsonb_build_object('ok', false, 'errore', 'non_abilitato'); end if;
  if not public.bgl_slug_ok(v) or public.prg_slug_riservato(v) then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'slug');
  end if;
  -- coalesce: con «v» mancante i confronti danno NULL e un «or» di NULL non rifiuterebbe niente
  if not coalesce(jsonb_typeof(p_dati) = 'object' and jsonb_typeof(p_dati->'v') = 'number' and p_dati->>'v' = '1'
                  and octet_length(p_dati::text) <= 102400, false) then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'dati');
  end if;
  if p_pubblicato is null then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'pubblicato'); end if;

  insert into public.prg_programmi (slug, user_id, dati, pubblicato) values (v, uid, p_dati, p_pubblicato)
  on conflict (slug) do nothing;
  if found then
    select * into r from public.prg_programmi where slug = v;
  else
    -- esisteva già: si aggiorna solo se è suo (la riga resta bloccata fino alla fine: due salvataggi non si pestano)
    update public.prg_programmi set dati = p_dati, pubblicato = p_pubblicato, aggiornato = now()
     where slug = v and user_id = uid returning * into r;
    if r.slug is null then return jsonb_build_object('ok', false, 'errore', 'slug_occupato'); end if;
  end if;
  return jsonb_build_object('ok', true, 'slug', r.slug, 'aggiornato', r.aggiornato);
end $$;
revoke all on function public.prg_salva(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.prg_salva(text, jsonb, boolean) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────── RPC pubblica: legge
create or replace function public.prg_programma_pubblico(p_slug text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('dati', g.dati, 'aggiornato', g.aggiornato)
    from public.prg_programmi g
   where g.slug = lower(btrim(coalesce(p_slug, ''))) and g.pubblicato
$$;
revoke all on function public.prg_programma_pubblico(text) from public, anon, authenticated;
grant execute on function public.prg_programma_pubblico(text) to anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────── pulizia account: la tabella punta ad auth.users
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
     and not exists (select 1 from public.prg_programmi where user_id = p_uid)
$$;
revoke all on function public.bgl_account_solo_biglietteria(uuid) from public, anon, authenticated;
grant execute on function public.bgl_account_solo_biglietteria(uuid) to service_role;
