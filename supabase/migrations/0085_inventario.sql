-- 0085 — Inventario con QR: attrezzatura numerata (TAS-001, PAD-001…) con etichetta, pagina pubblica leggera, scheda per la segreteria.
--
-- PERCHÉ: una scuola, un service o una band ha strumenti da numerare e, a volte, da dare in prestito. Un'etichetta con QR si stampa,
-- si plastifica e si incolla UNA volta; scansionandola si apre https://stageplot.it/i/<slug>/<codice> (es. /i/scuola/TAS-003).
-- L'indirizzo (slug + codice) non cambia mai: la pagina dietro può cambiare, le etichette stampate restano valide.
-- https://stageplot.it/i/<slug> = elenco pubblico per tipo.
--
-- DUE LIVELLI (decisione del proprietario del progetto, 16/11/2026):
--  • PUBBLICO, senza login: codice, tipo, modello, nome dell'inventario (es. «Accademia Esempio»), stato «in sede / a casa» (se il
--    proprietario lo vuole), totale per tipo. MAI il nome di una persona, MAI le note. Solo con le funzioni inv_articolo_pubblico / inv_elenco_pubblico.
--  • MEMBRI (proprietario + email autorizzate dal proprietario, accesso con Google già presente su stageplot.it): vedono e scrivono i campi
--    riservati — assegnato a (nome + corso/classe: niente indirizzi né telefoni), data di consegna e di rientro, note — e lo storico dei
--    movimenti (consegna / rientro / rottura / smarrimento). L'appartenenza è riconosciuta dall'email del token (auth.jwt()), mai da un
--    parametro. Le tabelle sono chiuse ai client senza questa appartenenza (RLS); anon non ha accesso a nulla se non alle due funzioni pubbliche.
--
-- Le email dei membri NON stanno in questo file (il repo è pubblico): si inseriscono con un comando SQL lanciato dal proprietario
-- (inv_membro_aggiungi dall'app, oppure insert diretto da SQL editor).
--
-- Come biglietteria e programma di sala: si scrive dove serve atomicità (creare, aggiungere N articoli con numeri progressivi, movimenti)
-- con funzioni security definer; nessun insert diretto. Limiti contro l'abuso: 5 inventari per account, 2000 articoli, 200 per aggiunta, 20 membri.
-- Trappola 0074: nessuna funzione `language sql` cita oggetti creati più sotto. Idempotente.

-- ───────────────────────────────────────────────────────────── attrezzi
create or replace function public.inv_slug_riservato(p text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p = any (array['mie','gestione','nuovo','admin','api','app','aiuto','privacy','info','stageplot','www','test','accedi','esci','login',
                        'inventario','index','inv','indirizzo','i'])
$$;
revoke all on function public.inv_slug_riservato(text) from public, anon, authenticated;
grant execute on function public.inv_slug_riservato(text) to service_role;

-- ───────────────────────────────────────────────────────────── tabelle
create table if not exists public.inv_inventari (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,   -- il proprietario
  nome         text not null,                                               -- «Accademia Esempio»: compare nella pagina pubblica
  slug         text not null unique,                                        -- l'indirizzo leggibile: /i/<slug>/<codice>
  pubblico     boolean not null default true,    -- spento = scansionando il QR si vede «non disponibile»
  mostra_stato boolean not null default true,    -- spento = la pagina pubblica non dice «in sede / a casa»
  creato       timestamptz not null default now(),
  aggiornato   timestamptz not null default now(),
  constraint inv_nome_len check (char_length(btrim(nome)) between 1 and 80),
  constraint inv_slug_formato check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' and slug !~ '--' and not public.inv_slug_riservato(slug))
);
create index if not exists inv_inventari_user_idx on public.inv_inventari (user_id);

create table if not exists public.inv_membri (
  inventario_id uuid not null references public.inv_inventari(id) on delete cascade,
  email         text not null,                   -- minuscola; confrontata con l'email del token di accesso
  aggiunto      timestamptz not null default now(),
  primary key (inventario_id, email),
  constraint inv_email_formato check (email = lower(email) and char_length(email) <= 120 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create table if not exists public.inv_tipi (
  inventario_id uuid not null references public.inv_inventari(id) on delete cascade,
  prefisso      text not null,                   -- TAS, PAD, VLN…
  singolare     text not null,                   -- «Tastiera»
  plurale       text not null,                   -- «tastiere»
  prossimo      integer not null default 1,      -- prossimo numero da assegnare (mai riusato, anche se un articolo sparisce)
  primary key (inventario_id, prefisso),
  constraint inv_prefisso_formato check (prefisso ~ '^[A-Z]{2,5}$'),
  constraint inv_tipo_nomi check (char_length(btrim(singolare)) between 1 and 40 and char_length(btrim(plurale)) between 1 and 40),
  constraint inv_prossimo_range check (prossimo between 1 and 100000)
);

create table if not exists public.inv_articoli (
  id             uuid primary key default gen_random_uuid(),
  inventario_id  uuid not null references public.inv_inventari(id) on delete cascade,
  tipo           text not null,
  numero         integer not null,
  codice         text not null,                  -- TAS-003; il CHECK lo tiene uguale a tipo + numero
  modello        text not null default '',
  stato          text not null default 'in_sede',
  -- ── campi RISERVATI ai membri (mai nella funzione pubblica) ──
  assegnato_a    text not null default '',       -- nome + corso/classe; MAI indirizzi o telefoni
  data_consegna  date,
  data_rientro   date,
  note           text not null default '',
  creato         timestamptz not null default now(),
  aggiornato     timestamptz not null default now(),
  foreign key (inventario_id, tipo) references public.inv_tipi (inventario_id, prefisso) on delete cascade,
  unique (inventario_id, codice),
  constraint inv_numero_range check (numero between 1 and 99999),
  constraint inv_codice_coerente check (codice = tipo || '-' || lpad(numero::text, 3, '0')),
  constraint inv_modello_len check (char_length(modello) <= 120),
  constraint inv_assegnato_len check (char_length(assegnato_a) <= 120),
  constraint inv_note_len check (char_length(note) <= 500),
  constraint inv_stato_valido check (stato in ('in_sede', 'a_casa', 'in_riparazione', 'smarrito', 'dismesso'))
);
create index if not exists inv_articoli_inv_idx on public.inv_articoli (inventario_id, tipo, numero);

-- storico dei movimenti: solo membri; si scrive SOLO con inv_movimento()
create table if not exists public.inv_movimenti (
  id            bigint generated always as identity primary key,
  inventario_id uuid not null references public.inv_inventari(id) on delete cascade,
  articolo_id   uuid not null references public.inv_articoli(id) on delete cascade,
  tipo          text not null,
  a_chi         text not null default '',
  data          date not null default current_date,
  nota          text not null default '',
  autore        text not null default '',        -- email del membro che ha registrato
  creato        timestamptz not null default now(),
  constraint inv_mov_tipo check (tipo in ('consegna', 'rientro', 'rottura', 'smarrimento')),
  constraint inv_mov_len check (char_length(a_chi) <= 120 and char_length(nota) <= 500)
);
create index if not exists inv_movimenti_art_idx on public.inv_movimenti (articolo_id, creato desc);

-- ───────────────────────────────────────────────────────────── appartenenza (security definer: niente ricorsione nelle policy)
-- proprietario, oppure email del token fra i membri. L'email viene dal token firmato, non da un parametro.
create or replace function public.inv_e_proprietario(p_inv uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.inv_inventari i where i.id = p_inv and i.user_id = (select auth.uid()))
$$;
create or replace function public.inv_e_membro(p_inv uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.inv_e_proprietario(p_inv)
      or exists (select 1 from public.inv_membri m
                  where m.inventario_id = p_inv and m.email = lower(coalesce((select auth.jwt()) ->> 'email', '')))
$$;
revoke all on function public.inv_e_proprietario(uuid), public.inv_e_membro(uuid) from public, anon, authenticated;
grant execute on function public.inv_e_proprietario(uuid), public.inv_e_membro(uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────── permessi e RLS
alter table public.inv_inventari enable row level security;
alter table public.inv_membri    enable row level security;
alter table public.inv_tipi      enable row level security;
alter table public.inv_articoli  enable row level security;
alter table public.inv_movimenti enable row level security;
revoke all on table public.inv_inventari, public.inv_membri, public.inv_tipi, public.inv_articoli, public.inv_movimenti from public, anon, authenticated;
grant all on table public.inv_inventari, public.inv_membri, public.inv_tipi, public.inv_articoli, public.inv_movimenti to service_role;
-- nessun insert diretto per nessuno: limiti e numeri passano dalle funzioni
grant select on table public.inv_inventari, public.inv_membri, public.inv_tipi, public.inv_articoli, public.inv_movimenti to authenticated;
grant delete on table public.inv_inventari, public.inv_membri, public.inv_tipi, public.inv_articoli to authenticated;
grant update (nome, pubblico, mostra_stato, aggiornato) on public.inv_inventari to authenticated;
grant update (singolare, plurale) on public.inv_tipi to authenticated;
grant update (modello, stato, note, assegnato_a, data_consegna, data_rientro, aggiornato) on public.inv_articoli to authenticated;

-- inventari: li vedono proprietario e membri; li cambia e cancella solo il proprietario
drop policy if exists inv_inventari_select on public.inv_inventari;
create policy inv_inventari_select on public.inv_inventari for select to authenticated using (public.inv_e_membro(id));
drop policy if exists inv_inventari_update on public.inv_inventari;
create policy inv_inventari_update on public.inv_inventari for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists inv_inventari_delete on public.inv_inventari;
create policy inv_inventari_delete on public.inv_inventari for delete to authenticated using (user_id = (select auth.uid()));
-- membri: solo il proprietario li vede e li toglie (si aggiungono con inv_membro_aggiungi)
drop policy if exists inv_membri_select on public.inv_membri;
create policy inv_membri_select on public.inv_membri for select to authenticated using (public.inv_e_proprietario(inventario_id));
drop policy if exists inv_membri_delete on public.inv_membri;
create policy inv_membri_delete on public.inv_membri for delete to authenticated using (public.inv_e_proprietario(inventario_id));
-- tipi e articoli: i membri leggono e correggono i campi concessi; cancella il proprietario
drop policy if exists inv_tipi_select on public.inv_tipi;
create policy inv_tipi_select on public.inv_tipi for select to authenticated using (public.inv_e_membro(inventario_id));
drop policy if exists inv_tipi_update on public.inv_tipi;
create policy inv_tipi_update on public.inv_tipi for update to authenticated using (public.inv_e_proprietario(inventario_id)) with check (public.inv_e_proprietario(inventario_id));
drop policy if exists inv_tipi_delete on public.inv_tipi;
create policy inv_tipi_delete on public.inv_tipi for delete to authenticated using (public.inv_e_proprietario(inventario_id));
drop policy if exists inv_articoli_select on public.inv_articoli;
create policy inv_articoli_select on public.inv_articoli for select to authenticated using (public.inv_e_membro(inventario_id));
drop policy if exists inv_articoli_update on public.inv_articoli;
create policy inv_articoli_update on public.inv_articoli for update to authenticated using (public.inv_e_membro(inventario_id)) with check (public.inv_e_membro(inventario_id));
drop policy if exists inv_articoli_delete on public.inv_articoli;
create policy inv_articoli_delete on public.inv_articoli for delete to authenticated using (public.inv_e_proprietario(inventario_id));
-- storico: solo lettura ai membri
drop policy if exists inv_movimenti_select on public.inv_movimenti;
create policy inv_movimenti_select on public.inv_movimenti for select to authenticated using (public.inv_e_membro(inventario_id));

-- ───────────────────────────────────────────────────────────── RPC: crea un inventario (slug leggibile)
create or replace function public.inv_crea(p_nome text, p_slug text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); n text := btrim(coalesce(p_nome, '')); sl text := lower(btrim(coalesce(p_slug, ''))); r public.inv_inventari;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if char_length(n) < 1 or char_length(n) > 80 then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'nome'); end if;
  if sl !~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' or sl ~ '--' or public.inv_slug_riservato(sl) then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'slug'); end if;
  -- un account alla volta (due schede aperte non superano il tetto)
  perform pg_advisory_xact_lock(hashtextextended('inv_crea:' || uid::text, 0));
  if (select count(*) from public.inv_inventari where user_id = uid) >= 5 then return jsonb_build_object('ok', false, 'errore', 'troppi_inventari'); end if;
  insert into public.inv_inventari (user_id, nome, slug) values (uid, n, sl) on conflict (slug) do nothing returning * into r;
  if r.id is null then return jsonb_build_object('ok', false, 'errore', 'slug_occupato'); end if;
  return jsonb_build_object('ok', true, 'id', r.id, 'slug', r.slug);
end $$;
revoke all on function public.inv_crea(text, text) from public, anon, authenticated;
grant execute on function public.inv_crea(text, text) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────── RPC: membri (solo il proprietario)
create or replace function public.inv_membro_aggiungi(p_inv uuid, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); em text := lower(btrim(coalesce(p_email, '')));
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.inv_e_proprietario(p_inv) then return jsonb_build_object('ok', false, 'errore', 'non_trovato'); end if;
  if char_length(em) > 120 or em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'email'); end if;
  if (select count(*) from public.inv_membri where inventario_id = p_inv) >= 20 and not exists (select 1 from public.inv_membri where inventario_id = p_inv and email = em) then
    return jsonb_build_object('ok', false, 'errore', 'troppi_membri');
  end if;
  insert into public.inv_membri (inventario_id, email) values (p_inv, em) on conflict do nothing;
  return jsonb_build_object('ok', true, 'email', em);
end $$;
revoke all on function public.inv_membro_aggiungi(uuid, text) from public, anon, authenticated;
grant execute on function public.inv_membro_aggiungi(uuid, text) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────── RPC: crea o rinomina un tipo (prefisso)
create or replace function public.inv_tipo_salva(p_inv uuid, p_prefisso text, p_singolare text, p_plurale text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); pf text := upper(btrim(coalesce(p_prefisso, ''))); s text := btrim(coalesce(p_singolare, '')); p text := btrim(coalesce(p_plurale, ''));
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if not public.inv_e_proprietario(p_inv) then return jsonb_build_object('ok', false, 'errore', 'non_trovato'); end if;
  if pf !~ '^[A-Z]{2,5}$' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'prefisso'); end if;
  if char_length(s) not between 1 and 40 or char_length(p) not between 1 and 40 then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'nome_tipo'); end if;
  if (select count(*) from public.inv_tipi where inventario_id = p_inv) >= 40
     and not exists (select 1 from public.inv_tipi where inventario_id = p_inv and prefisso = pf) then
    return jsonb_build_object('ok', false, 'errore', 'troppi_tipi');
  end if;
  insert into public.inv_tipi (inventario_id, prefisso, singolare, plurale) values (p_inv, pf, s, p)
  on conflict (inventario_id, prefisso) do update set singolare = excluded.singolare, plurale = excluded.plurale;
  return jsonb_build_object('ok', true, 'prefisso', pf);
end $$;
revoke all on function public.inv_tipo_salva(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.inv_tipo_salva(uuid, text, text, text) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────── RPC: aggiunge N articoli con numeri progressivi (solo il proprietario)
-- I numeri non si riusano mai (inv_tipi.prossimo): un codice stampato non cambia significato.
create or replace function public.inv_aggiungi(p_inv uuid, p_prefisso text, p_qta integer, p_modello text, p_stato text, p_note text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); pf text := upper(btrim(coalesce(p_prefisso, ''))); q integer := p_qta; da integer;
        m text := btrim(coalesce(p_modello, '')); st text := coalesce(nullif(btrim(coalesce(p_stato, '')), ''), 'in_sede'); nt text := btrim(coalesce(p_note, ''));
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if q is null or q < 1 or q > 200 then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'quantita'); end if;
  if char_length(m) > 120 then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'modello'); end if;
  if char_length(nt) > 500 then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'note'); end if;
  if st not in ('in_sede', 'a_casa', 'in_riparazione', 'smarrito', 'dismesso') then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'stato'); end if;
  if not public.inv_e_proprietario(p_inv) then return jsonb_build_object('ok', false, 'errore', 'non_trovato'); end if;
  -- blocca la riga del tipo: due aggiunte insieme non assegnano lo stesso numero
  select prossimo into da from public.inv_tipi where inventario_id = p_inv and prefisso = pf for update;
  if da is null then return jsonb_build_object('ok', false, 'errore', 'tipo_mancante'); end if;
  if da + q - 1 > 99999 then return jsonb_build_object('ok', false, 'errore', 'numeri_esauriti'); end if;
  if (select count(*) from public.inv_articoli where inventario_id = p_inv) + q > 2000 then return jsonb_build_object('ok', false, 'errore', 'troppi_articoli'); end if;
  insert into public.inv_articoli (inventario_id, tipo, numero, codice, modello, stato, note)
  select p_inv, pf, n, pf || '-' || lpad(n::text, 3, '0'), m, st, nt from generate_series(da, da + q - 1) as n;
  update public.inv_tipi set prossimo = da + q where inventario_id = p_inv and prefisso = pf;
  return jsonb_build_object('ok', true, 'da', da, 'a', da + q - 1,
    'primo', pf || '-' || lpad(da::text, 3, '0'), 'ultimo', pf || '-' || lpad((da + q - 1)::text, 3, '0'));
end $$;
revoke all on function public.inv_aggiungi(uuid, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.inv_aggiungi(uuid, text, integer, text, text, text) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────── RPC pubbliche: la scheda dietro il QR e l'elenco per tipo
-- Mai: user_id, email, note, assegnato, date, id interni. Inventario non pubblico o codice inesistente: null (stessa risposta).
create or replace function public.inv_articolo_pubblico(p_slug text, p_codice text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
           'inventario', i.nome,
           'codice', a.codice,
           'numero', a.numero,
           'singolare', t.singolare,
           'plurale', t.plurale,
           'modello', a.modello,
           'stato', case when i.mostra_stato then a.stato else null end,
           'totale', (select count(*) from public.inv_articoli x where x.inventario_id = a.inventario_id and x.tipo = a.tipo and x.stato <> 'dismesso'),
           'aggiornato', a.aggiornato)
    from public.inv_inventari i
    join public.inv_articoli a on a.inventario_id = i.id
    join public.inv_tipi t on t.inventario_id = a.inventario_id and t.prefisso = a.tipo
   where i.slug = lower(btrim(coalesce(p_slug, ''))) and i.pubblico and a.codice = upper(btrim(coalesce(p_codice, '')))
$$;
revoke all on function public.inv_articolo_pubblico(text, text) from public, anon, authenticated;
grant execute on function public.inv_articolo_pubblico(text, text) to anon, authenticated, service_role;

create or replace function public.inv_elenco_pubblico(p_slug text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
           'inventario', i.nome,
           'tipi', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'prefisso', t.prefisso, 'singolare', t.singolare, 'plurale', t.plurale,
                      'totale', (select count(*) from public.inv_articoli x where x.inventario_id = t.inventario_id and x.tipo = t.prefisso and x.stato <> 'dismesso'),
                      'articoli', coalesce((select jsonb_agg(jsonb_build_object('codice', a.codice, 'numero', a.numero, 'modello', a.modello,
                                                                              'stato', case when i.mostra_stato then a.stato else null end) order by a.numero)
                                              from public.inv_articoli a where a.inventario_id = t.inventario_id and a.tipo = t.prefisso and a.stato <> 'dismesso'), '[]'::jsonb))
                    order by t.prefisso)
               from public.inv_tipi t where t.inventario_id = i.id), '[]'::jsonb))
    from public.inv_inventari i
   where i.slug = lower(btrim(coalesce(p_slug, ''))) and i.pubblico
$$;
revoke all on function public.inv_elenco_pubblico(text) from public, anon, authenticated;
grant execute on function public.inv_elenco_pubblico(text) to anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────── RPC per i membri: la scheda riservata e i movimenti
-- Chi non è membro riceve null (come «non trovato»): non si scopre nemmeno che esiste qualcosa di riservato.
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
    'movimenti', coalesce((select jsonb_agg(jsonb_build_object('tipo', m.tipo, 'a_chi', m.a_chi, 'data', m.data, 'nota', m.nota, 'autore', m.autore) order by m.creato desc, m.id desc)
                             from (select * from public.inv_movimenti where articolo_id = a.id order by creato desc, id desc limit 30) m), '[]'::jsonb));
end $$;
revoke all on function public.inv_scheda_membro(text, text) from public, anon, authenticated;
grant execute on function public.inv_scheda_membro(text, text) to authenticated, service_role;

-- registra un movimento e aggiorna la scheda (un'operazione sola: scheda e storico non possono divergere)
create or replace function public.inv_movimento(p_slug text, p_codice text, p_tipo text, p_a_chi text, p_data date, p_nota text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); inv_id uuid; a public.inv_articoli; ac text := btrim(coalesce(p_a_chi, '')); nt text := btrim(coalesce(p_nota, ''));
        d date := coalesce(p_data, current_date); autore text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  select i.id into inv_id from public.inv_inventari i where i.slug = lower(btrim(coalesce(p_slug, '')));
  if inv_id is null or not public.inv_e_membro(inv_id) then return jsonb_build_object('ok', false, 'errore', 'non_autorizzato'); end if;
  if p_tipo is null or p_tipo not in ('consegna', 'rientro', 'rottura', 'smarrimento') then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'tipo'); end if;
  if char_length(ac) > 120 or char_length(nt) > 500 then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'testo'); end if;
  if d < date '2000-01-01' or d > current_date + 366 then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'data'); end if;
  select * into a from public.inv_articoli x where x.inventario_id = inv_id and x.codice = upper(btrim(coalesce(p_codice, ''))) for update;
  if a.id is null then return jsonb_build_object('ok', false, 'errore', 'non_trovato'); end if;
  if p_tipo = 'consegna' then
    if ac = '' then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'a_chi'); end if;
    if a.assegnato_a <> '' then return jsonb_build_object('ok', false, 'errore', 'gia_assegnato', 'assegnato_a', a.assegnato_a); end if;
    if a.stato in ('dismesso', 'smarrito', 'in_riparazione') then return jsonb_build_object('ok', false, 'errore', 'non_disponibile', 'stato', a.stato); end if;   -- da riparare/perso non si consegna: prima si rimette «in sede» dalla scheda dell'area
    update public.inv_articoli set assegnato_a = ac, data_consegna = d, data_rientro = null, stato = 'a_casa', aggiornato = now() where id = a.id;
  elsif p_tipo = 'rientro' then
    if a.assegnato_a = '' then return jsonb_build_object('ok', false, 'errore', 'non_assegnato'); end if;
    ac := a.assegnato_a;   -- nello storico il rientro riporta chi lo aveva
    update public.inv_articoli set assegnato_a = '', data_rientro = d, stato = case when stato = 'a_casa' then 'in_sede' else stato end, aggiornato = now() where id = a.id;
  elsif p_tipo = 'rottura' then
    ac := a.assegnato_a;
    update public.inv_articoli set stato = 'in_riparazione', aggiornato = now() where id = a.id;
  else
    ac := a.assegnato_a;
    update public.inv_articoli set stato = 'smarrito', aggiornato = now() where id = a.id;
  end if;
  insert into public.inv_movimenti (inventario_id, articolo_id, tipo, a_chi, data, nota, autore) values (inv_id, a.id, p_tipo, ac, d, nt, autore);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.inv_movimento(text, text, text, text, date, text) from public, anon, authenticated;
grant execute on function public.inv_movimento(text, text, text, text, date, text) to authenticated, service_role;

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
     and not exists (select 1 from public.orc_condition_versions where changed_by = p_uid)
     and not exists (select 1 from public.inv_inventari where user_id = p_uid)
$$;
revoke all on function public.bgl_account_solo_biglietteria(uuid) from public, anon, authenticated;
grant execute on function public.bgl_account_solo_biglietteria(uuid) to service_role;

notify pgrst, 'reload schema';
