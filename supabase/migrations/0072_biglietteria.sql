-- 0072 — Biglietteria gratuita con prenotazione dei posti.
--
-- Il pubblico apre stageplot.it/biglietteria/?e=<slug>, sceglie fino a 4 posti numerati e li prenota con
-- nome, cognome ed email. L'organizzatore apre le prenotazioni dall'editor, su un progetto suo.
--
-- Scelte che reggono tutto il resto:
--   · Le quattro tabelle hanno la RLS attiva e NESSUNA policy: da REST non si legge e non si scrive niente.
--     Tutto passa da funzioni `security definer` che restituiscono campi scelti. La privacy della lettura
--     pubblica si decide in UN posto (bgl_evento_pubblico), non in policy sparse.
--   · «Un posto, una persona» lo garantisce la chiave primaria di bgl_posti(evento_id, posto): due
--     prenotazioni simultanee sullo stesso posto, una vince e l'altra prende unique_violation.
--   · Il tetto di 4 posti per email si protegge con un advisory lock su (evento, email): due richieste
--     con la stessa email si mettono in fila e non scavalcano il tetto in parallelo.
--   · Il token per disdire esce dal database una volta sola (la risposta di bgl_prenota): si salva solo
--     la sua impronta sha256.
--   · La pianta arriva dall'editor ma il server la RICOSTRUISCE con i soli campi ammessi: nessuna etichetta,
--     nome o contatto della scena può finire sulla pagina pubblica, nemmeno per errore del client.
--   · Supabase dà EXECUTE ad anon/authenticated sulle funzioni nuove (trappola della 0057): ogni funzione
--     ha il suo revoke + grant scritto a mano, subito sotto.
--   · Nomi ed email si cancellano 30 giorni dopo l'evento: stageplot_purge_expired() (0062) estesa in fondo.

-- ─────────────────────────────────────────────────────────────────────────────────────────── tabelle

-- l'evento: nessun dato personale
create table public.bgl_eventi (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z2-9]{10}$'),
  user_id       uuid not null references auth.users(id) on delete cascade,
  project_id    uuid references public.stageplot_projects(id) on delete set null,
  titolo        text not null check (char_length(titolo) between 1 and 120),
  inizio        timestamptz not null,
  chiusura      timestamptz not null,
  luogo         text not null check (char_length(luogo) between 1 and 160),
  note          text check (note is null or char_length(note) <= 500),
  stato         text not null default 'aperta' check (stato in ('aperta','chiusa')),
  pianta        jsonb not null check (octet_length(pianta::text) <= 300000),
  posti_totali  int  not null check (posti_totali between 1 and 2000),
  riservati     text[] not null default '{}' check (cardinality(riservati) <= 2000),
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  check (chiusura <= inizio)
);
create index bgl_eventi_user_idx on public.bgl_eventi (user_id, inizio desc);
create index bgl_eventi_project_idx on public.bgl_eventi (project_id);

-- la prenotazione: QUI stanno i dati personali (nome, cognome, email)
create table public.bgl_prenotazioni (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.bgl_eventi(id) on delete cascade,
  codice          text not null check (codice ~ '^[A-HJ-NP-Z2-9]{6}$'),
  token_hash      text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  nome            text check (nome is null or char_length(nome) between 1 and 60),
  cognome         text check (cognome is null or char_length(cognome) between 1 and 60),
  email           text check (email is null or char_length(email) <= 254),
  email_norm      text,
  posti           text[] not null check (cardinality(posti) between 1 and 4),  -- quelli chiesti (storia)
  stato           text not null default 'attiva' check (stato in ('attiva','disdetta','annullata')),
  creata_il       timestamptz not null default now(),
  chiusa_il       timestamptz,          -- disdetta (dal pubblico) o annullata (dall'organizzatore)
  anonimizzata_il timestamptz,          -- purga a 30 giorni dall'evento
  unique (evento_id, codice),
  check (anonimizzata_il is not null
         or (nome is not null and cognome is not null and email is not null
             and email_norm is not null and token_hash is not null))
);
create index bgl_prenotazioni_email_idx on public.bgl_prenotazioni (evento_id, email_norm);

-- i posti OCCUPATI adesso: una riga per posto. La chiave primaria È la garanzia «un posto, una persona».
create table public.bgl_posti (
  evento_id       uuid not null references public.bgl_eventi(id) on delete cascade,
  posto           text not null,
  prenotazione_id uuid not null references public.bgl_prenotazioni(id) on delete cascade,
  creato_il       timestamptz not null default now(),
  primary key (evento_id, posto)
);
create index bgl_posti_prenotazione_idx on public.bgl_posti (prenotazione_id);

-- limite di richieste per impronta di IP (come feedback_throttle)
create table public.bgl_throttle (
  ip_hash      text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  count        int not null default 1,
  primary key (ip_hash, window_start)
);
create index bgl_throttle_window_idx on public.bgl_throttle (window_start);

-- ───────────────────────────────────────────────────────────── permessi delle tabelle (trappola 0057)
alter table public.bgl_eventi       enable row level security;
alter table public.bgl_prenotazioni enable row level security;
alter table public.bgl_posti        enable row level security;
alter table public.bgl_throttle     enable row level security;
-- Nessuna policy, di proposito. In produzione i grant di default storici darebbero `select` all'anonimo
-- (vedi 0065): si tolgono qui, così la barriera non è la sola RLS.
revoke all on public.bgl_eventi, public.bgl_prenotazioni, public.bgl_posti, public.bgl_throttle
  from public, anon, authenticated;
grant select, insert, update, delete on public.bgl_eventi, public.bgl_prenotazioni, public.bgl_posti, public.bgl_throttle
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────── piccoli attrezzi interni

-- Stato visto dal pubblico. Aperta ⇔ stato='aperta' e prima della chiusura; conclusa 12 ore dopo l'inizio.
create function public.bgl_stato_pubblico(p_stato text, p_inizio timestamptz, p_chiusura timestamptz)
returns text language sql stable set search_path = public, pg_temp as $$
  select case
    when now() > p_inizio + interval '12 hours' then 'conclusa'
    when p_stato = 'aperta' and now() < p_chiusura then 'aperta'
    else 'chiusa'
  end
$$;
revoke all on function public.bgl_stato_pubblico(text, timestamptz, timestamptz) from public, anon, authenticated;

-- Testo libero dell'utente o dell'organizzatore: tagliato, senza caratteri di controllo, entro i limiti.
-- null se non va bene (chi chiama decide il codice d'errore).
create function public.bgl_testo(p text, p_min int, p_max int)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p is null then null
    when btrim(p) ~ '[[:cntrl:]]' then null
    when char_length(btrim(p)) between p_min and p_max then btrim(p)
    else null
  end
$$;
revoke all on function public.bgl_testo(text, int, int) from public, anon, authenticated;

-- Una data dal JSON del client: null se manca o non si legge (mai un'eccezione verso chi chiama).
create function public.bgl_ts(p text)
returns timestamptz language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return p::timestamptz;
exception when others then
  return null;
end $$;
revoke all on function public.bgl_ts(text) from public, anon, authenticated;

-- Caratteri a caso da un alfabeto: byte casuali di gen_random_uuid (si saltano i byte 6 e 8, che portano
-- versione e variante). Per il codice l'alfabeto ha 32 lettere: 256/32, nessuno sbilanciamento.
create function public.bgl_casuale(p_alfabeto text, p_n int)
returns text language plpgsql volatile set search_path = public, pg_temp as $$
declare b bytea; out text := ''; i int; pos int[] := array[0,1,2,3,4,5,7,9,10,11,12,13,14,15];
begin
  while char_length(out) < p_n loop
    b := uuid_send(gen_random_uuid());
    foreach i in array pos loop
      exit when char_length(out) >= p_n;
      out := out || substr(p_alfabeto, 1 + get_byte(b, i) % char_length(p_alfabeto), 1);
    end loop;
  end loop;
  return out;
end $$;
revoke all on function public.bgl_casuale(text, int) from public, anon, authenticated;

-- Impronta del token di disdetta: è l'unica cosa che il database conserva del token.
create function public.bgl_impronta(p_token text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;
revoke all on function public.bgl_impronta(text) from public, anon, authenticated;

-- Il formato della chiave di un posto: settore|fila|posto, es. «Platea|A|5».
create function public.bgl_chiave_ok(p text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p is not null and p ~ '^[^|]{1,24}\|[0-9A-Z]{1,4}\|[1-9][0-9]{0,3}$' and p !~ '[[:cntrl:]]'
$$;
revoke all on function public.bgl_chiave_ok(text) from public, anon, authenticated;

-- Le chiavi dei posti di una pianta già pulita.
create function public.bgl_chiavi(p_pianta jsonb)
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(x->>'k'), '{}') from jsonb_array_elements(p_pianta->'posti') x
$$;
revoke all on function public.bgl_chiavi(jsonb) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────── pianta: si ricostruisce, non si copia
-- Formato «foto» v1 (specifica §2.5). Qualunque campo che non sia fra questi si scarta: la pianta salvata
-- e mostrata al pubblico contiene SOLO v, box, palco, pedane e, per ogni posto, k/settore/fila/posto/x/y/w/d/rot.
-- Un rifiuto solleva 22023 con message 'pianta_non_valida' e il motivo (in parole) nel detail.
create function public.bgl_pianta_pulita(p jsonb)
returns jsonb language plpgsql immutable set search_path = public, pg_temp as $$
declare
  w int; h int; poligoni jsonb; out_palco jsonb := '[]'; out_pedane jsonb := '[]'; out_posti jsonb := '[]';
  el jsonb; pt jsonb; poly jsonb; punti jsonb; viste text[] := '{}'; quale text; nome_parte text;
  s text; f text; n numeric; x int; y int; pw int; pd int; r int; k text;
begin
  /* Ogni controllo è un IF a sé: in SQL un OR non garantisce l'ordine, e un cast su un valore che non è un
     numero solleverebbe un errore diverso da «pianta_non_valida». */
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'formato non riconosciuto';
  end if;
  if octet_length(p::text) > 300000 then
    raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'pianta troppo grande';
  end if;
  if (p->'v') is distinct from '1'::jsonb then
    raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'versione non riconosciuta';
  end if;
  if (case when jsonb_typeof(p->'box') is distinct from 'array' then true
          when jsonb_array_length(p->'box') <> 4 then true
          else exists (select 1 from jsonb_array_elements(p->'box') b where jsonb_typeof(b) <> 'number') end) then
    raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'riquadro non valido';
  end if;
  if (p->'box'->>0)::numeric <> 0 or (p->'box'->>1)::numeric <> 0
     or round((p->'box'->>2)::numeric) not between 1 and 100000
     or round((p->'box'->>3)::numeric) not between 1 and 100000 then
    raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'riquadro non valido';
  end if;
  w := round((p->'box'->>2)::numeric)::int;
  h := round((p->'box'->>3)::numeric)::int;

  -- palco e pedane: poligoni di punti, con un margine di 10 m attorno al riquadro
  foreach quale in array array['palco', 'pedane'] loop
    nome_parte := case when quale = 'palco' then 'sagoma del palco non valida' else 'pedane non valide' end;
    poligoni := coalesce(p->quale, '[]'::jsonb);
    if (case when jsonb_typeof(poligoni) <> 'array' then true
            else jsonb_array_length(poligoni) > (case when quale = 'palco' then 16 else 200 end) end) then
      raise exception using errcode = '22023', message = 'pianta_non_valida', detail = nome_parte;
    end if;
    for poly in select value from jsonb_array_elements(poligoni) loop
      if (case when jsonb_typeof(poly) <> 'array' then true else jsonb_array_length(poly) not between 3 and 64 end) then
        raise exception using errcode = '22023', message = 'pianta_non_valida', detail = nome_parte;
      end if;
      punti := '[]';
      for pt in select value from jsonb_array_elements(poly) loop
        if (case when jsonb_typeof(pt) <> 'array' then true else jsonb_array_length(pt) <> 2 end) then
          raise exception using errcode = '22023', message = 'pianta_non_valida', detail = nome_parte;
        end if;
        if jsonb_typeof(pt->0) <> 'number' or jsonb_typeof(pt->1) <> 'number' then
          raise exception using errcode = '22023', message = 'pianta_non_valida', detail = nome_parte;
        end if;
        x := round((pt->>0)::numeric)::int; y := round((pt->>1)::numeric)::int;
        if x not between -1000 and w + 1000 or y not between -1000 and h + 1000 then
          raise exception using errcode = '22023', message = 'pianta_non_valida', detail = nome_parte;
        end if;
        punti := punti || jsonb_build_array(jsonb_build_array(x, y));
      end loop;
      if quale = 'palco' then out_palco := out_palco || jsonb_build_array(punti);
      else out_pedane := out_pedane || jsonb_build_array(punti); end if;
    end loop;
  end loop;

  -- posti: ognuno RICOSTRUITO campo per campo (mai copiato: è qui che un'etichetta resterebbe attaccata)
  if (case when jsonb_typeof(p->'posti') is distinct from 'array' then true else jsonb_array_length(p->'posti') = 0 end) then
    raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'nessun posto numerato';
  end if;
  if jsonb_array_length(p->'posti') > 2000 then
    raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'più di 2000 posti';
  end if;
  for el in select value from jsonb_array_elements(p->'posti') loop
    if jsonb_typeof(el) <> 'object' then
      raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'posto non valido';
    end if;
    if jsonb_typeof(el->'settore') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'nome del settore non valido';
    end if;
    s := btrim(el->>'settore');
    if s ~ '[|[:cntrl:]]' or char_length(s) not between 1 and 24 then
      raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'nome del settore non valido';
    end if;
    if (case when jsonb_typeof(el->'fila') is distinct from 'string' then true else (el->>'fila') !~ '^[0-9A-Z]{1,4}$' end) then
      raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'nome della fila non valido';
    end if;
    f := el->>'fila';
    if jsonb_typeof(el->'posto') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'numero del posto non valido';
    end if;
    n := (el->>'posto')::numeric;
    if n <> trunc(n) or n not between 1 and 9999 then
      raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'numero del posto non valido';
    end if;
    if jsonb_typeof(el->'x') is distinct from 'number' or jsonb_typeof(el->'y') is distinct from 'number'
       or jsonb_typeof(el->'w') is distinct from 'number' or jsonb_typeof(el->'d') is distinct from 'number'
       or jsonb_typeof(coalesce(el->'rot', '0'::jsonb)) <> 'number' then
      raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'posizione di un posto non valida';
    end if;
    x := round((el->>'x')::numeric)::int; y := round((el->>'y')::numeric)::int;
    pw := round((el->>'w')::numeric)::int; pd := round((el->>'d')::numeric)::int;
    r := round(coalesce((el->>'rot')::numeric, 0))::int;
    if x not between 0 and w or y not between 0 and h then
      raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'un posto è fuori dalla pianta';
    end if;
    if pw not between 10 and 300 or pd not between 10 and 300 then
      raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'misure di un posto non valide';
    end if;
    if r not between -180 and 180 then
      raise exception using errcode = '22023', message = 'pianta_non_valida', detail = 'rotazione di un posto non valida';
    end if;
    -- la chiave la calcola il server: quella del client, se c'è, non conta
    k := s || '|' || f || '|' || n::int::text;
    if k = any(viste) then
      raise exception using errcode = '22023', message = 'pianta_non_valida',
        detail = 'due posti hanno lo stesso numero (' || replace(k, '|', ' ') || ')';
    end if;
    viste := viste || k;
    out_posti := out_posti || jsonb_build_array(jsonb_build_object(
      'k', k, 'settore', s, 'fila', f, 'posto', n::int, 'x', x, 'y', y, 'w', pw, 'd', pd, 'rot', r));
  end loop;

  return jsonb_build_object('v', 1, 'box', jsonb_build_array(0, 0, w, h),
    'palco', out_palco, 'pedane', out_pedane, 'posti', out_posti);
end $$;
revoke all on function public.bgl_pianta_pulita(jsonb) from public, anon, authenticated;

-- I tenuti da parte: solo chiavi che esistono nella pianta, senza doppioni, nell'ordine dato.
create function public.bgl_riservati_puliti(p jsonb, p_chiavi text[])
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(k order by ord), '{}')
  from (
    select distinct on (x.value #>> '{}') x.value #>> '{}' as k, x.ordinality as ord
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality x
    where jsonb_typeof(x.value) = 'string' and (x.value #>> '{}') = any(p_chiavi)
    order by x.value #>> '{}', x.ordinality
  ) d
$$;
revoke all on function public.bgl_riservati_puliti(jsonb, text[]) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────── pubblico: lettura e disdetta

-- Lo stato pubblico di un evento. CONTRATTO DI PRIVACY: qui escono solo chiavi di posti (libero/occupato),
-- mai nomi, cognomi, email, codici o id di prenotazione. Un test lo prova, con la sua mutazione.
create function public.bgl_evento_pubblico(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e public.bgl_eventi; occ text[]; ris text[];
begin
  if p_slug is null or p_slug !~ '^[a-z2-9]{10}$' then
    return jsonb_build_object('ok', false, 'errore', 'evento_inesistente');
  end if;
  select * into e from public.bgl_eventi where slug = p_slug;
  if e.id is null then return jsonb_build_object('ok', false, 'errore', 'evento_inesistente'); end if;
  select coalesce(array_agg(posto order by posto), '{}') into occ from public.bgl_posti where evento_id = e.id;
  select coalesce(array_agg(r order by r), '{}') into ris from unnest(e.riservati) r where not (r = any(occ));
  return jsonb_build_object(
    'ok', true,
    'evento', jsonb_build_object('slug', e.slug, 'titolo', e.titolo, 'inizio', e.inizio, 'chiusura', e.chiusura,
      'luogo', e.luogo, 'note', e.note, 'stato', public.bgl_stato_pubblico(e.stato, e.inizio, e.chiusura),
      'max_per_email', 4),
    'pianta', e.pianta,
    'occupati', to_jsonb(occ),
    'riservati', to_jsonb(ris),
    'liberi', greatest(e.posti_totali - cardinality(occ) - cardinality(ris), 0),
    'ora', now());
end $$;
revoke all on function public.bgl_evento_pubblico(text) from public, anon, authenticated;
grant execute on function public.bgl_evento_pubblico(text) to anon, authenticated, service_role;

-- La mia prenotazione, dal link della mail. Niente nome né email: chi ha il link ha già quelli.
create function public.bgl_mia_prenotazione(p_slug text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e public.bgl_eventi; p public.bgl_prenotazioni; tenuti text[];
begin
  if p_slug is null or p_slug !~ '^[a-z2-9]{10}$' or p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'errore', 'token_non_valido');
  end if;
  select * into e from public.bgl_eventi where slug = p_slug;
  if e.id is null then return jsonb_build_object('ok', false, 'errore', 'token_non_valido'); end if;
  select * into p from public.bgl_prenotazioni
   where evento_id = e.id and token_hash = public.bgl_impronta(p_token);
  if p.id is null then return jsonb_build_object('ok', false, 'errore', 'token_non_valido'); end if;
  select coalesce(array_agg(x order by i), '{}') into tenuti
    from unnest(p.posti) with ordinality u(x, i)
   where exists (select 1 from public.bgl_posti b where b.evento_id = e.id and b.posto = x and b.prenotazione_id = p.id);
  return jsonb_build_object('ok', true,
    'evento', jsonb_build_object('titolo', e.titolo, 'inizio', e.inizio, 'luogo', e.luogo,
      'stato', public.bgl_stato_pubblico(e.stato, e.inizio, e.chiusura)),
    'codice', p.codice, 'posti', to_jsonb(tenuti), 'stato', p.stato);
end $$;
revoke all on function public.bgl_mia_prenotazione(text, text) from public, anon, authenticated;
grant execute on function public.bgl_mia_prenotazione(text, text) to anon, authenticated, service_role;

-- Disdetta dal link della mail: libera i posti. Ammessa fino all'inizio dell'evento.
create function public.bgl_disdici(p_slug text, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare e public.bgl_eventi; p public.bgl_prenotazioni; n int;
begin
  if p_slug is null or p_slug !~ '^[a-z2-9]{10}$' or p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'errore', 'token_non_valido');
  end if;
  select * into e from public.bgl_eventi where slug = p_slug;
  if e.id is null then return jsonb_build_object('ok', false, 'errore', 'token_non_valido'); end if;
  select * into p from public.bgl_prenotazioni
   where evento_id = e.id and token_hash = public.bgl_impronta(p_token) for update;
  if p.id is null then return jsonb_build_object('ok', false, 'errore', 'token_non_valido'); end if;
  if p.stato <> 'attiva' then return jsonb_build_object('ok', false, 'errore', 'gia_disdetta'); end if;
  if now() >= e.inizio then return jsonb_build_object('ok', false, 'errore', 'evento_concluso'); end if;
  delete from public.bgl_posti where prenotazione_id = p.id;
  get diagnostics n = row_count;
  update public.bgl_prenotazioni set stato = 'disdetta', chiusa_il = now() where id = p.id;
  return jsonb_build_object('ok', true, 'liberati', n);
end $$;
revoke all on function public.bgl_disdici(text, text) from public, anon, authenticated;
grant execute on function public.bgl_disdici(text, text) to anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────── prenotazione: SOLO dalla Edge Function

-- Contatore orario per impronta (copia di feedback_throttle_hit, sulla sua tabella).
create function public.bgl_throttle_hit(p_ip_hash text)
returns int language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count int;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'stageplot: impronta non valida';
  end if;
  delete from public.bgl_throttle where window_start < v_window - interval '48 hours';
  insert into public.bgl_throttle as t (ip_hash, window_start, count)
  values (p_ip_hash, v_window, 1)
  on conflict (ip_hash, window_start) do update set count = t.count + 1
  returning count into v_count;
  return v_count;
end $$;
revoke all on function public.bgl_throttle_hit(text) from public, anon, authenticated;
grant execute on function public.bgl_throttle_hit(text) to service_role;

-- La prenotazione atomica (specifica §2.4). Tutto in una transazione:
--   valida → evento aperto → posti esistenti e non tenuti da parte → lock (evento, email) → tetto per email
--   → posti liberi → inserisce prenotazione + righe di bgl_posti in un blocco che, se un'altra transazione
--   ha preso un posto nel frattempo (unique_violation sulla chiave primaria), annulla anche la prenotazione.
create function public.bgl_prenota(p_slug text, p_posti text[], p_nome text, p_cognome text, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  e public.bgl_eventi; v_posti text[]; v_nome text; v_cognome text; v_email text; v_email_norm text;
  v_chiavi text[]; v_mancanti text[]; v_riservati text[]; v_presi text[]; v_gia int;
  v_codice text; v_token text; v_pid uuid; v_vincolo text;
begin
  -- 1. normalizza e valida (la Edge Function l'ha già fatto: qui è la seconda serratura)
  select coalesce(array_agg(x order by i), '{}') into v_posti
    from (select distinct on (x) x, i from unnest(coalesce(p_posti, '{}')) with ordinality u(x, i) order by x, i) d;
  if cardinality(v_posti) = 0 then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'posti'); end if;
  if cardinality(v_posti) > 4 then return jsonb_build_object('ok', false, 'errore', 'troppi_posti'); end if;
  if exists (select 1 from unnest(v_posti) x where not public.bgl_chiave_ok(x)) then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'posti');
  end if;
  v_nome := public.bgl_testo(p_nome, 1, 60);
  if v_nome is null then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'nome'); end if;
  v_cognome := public.bgl_testo(p_cognome, 1, 60);
  if v_cognome is null then return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'cognome'); end if;
  v_email := public.bgl_testo(p_email, 3, 254);
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'email');
  end if;
  v_email_norm := lower(v_email);

  -- 2. l'evento, e che sia aperto
  if p_slug is null or p_slug !~ '^[a-z2-9]{10}$' then return jsonb_build_object('ok', false, 'errore', 'evento_inesistente'); end if;
  select * into e from public.bgl_eventi where slug = p_slug;
  if e.id is null then return jsonb_build_object('ok', false, 'errore', 'evento_inesistente'); end if;
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

  -- 4. due richieste con la stessa email si mettono in fila: il tetto non si scavalca in parallelo
  perform pg_advisory_xact_lock(hashtextextended(e.id::text || '|' || v_email_norm, 0));

  -- 5. tetto per email: posti tenuti ADESSO da quella email in questo evento
  select count(*) into v_gia
    from public.bgl_posti b join public.bgl_prenotazioni p on p.id = b.prenotazione_id
   where b.evento_id = e.id and p.email_norm = v_email_norm and p.stato = 'attiva';
  if v_gia + cardinality(v_posti) > 4 then
    return jsonb_build_object('ok', false, 'errore', 'limite_email', 'gia', v_gia, 'max', 4);
  end if;

  -- 6. posti già presi (il caso comune; la gara vera la decide il punto 7)
  select coalesce(array_agg(posto order by posto), '{}') into v_presi
    from public.bgl_posti where evento_id = e.id and posto = any(v_posti);
  if cardinality(v_presi) > 0 then
    return jsonb_build_object('ok', false, 'errore', 'posto_preso', 'presi', to_jsonb(v_presi));
  end if;

  -- 7. inserisce. Un unique_violation sulla chiave dei posti = un'altra transazione ha vinto: il blocco
  --    annulla anche la prenotazione appena scritta. Su codice o token (rarissimo) si ritenta.
  for tentativo in 1..5 loop
    v_codice := public.bgl_casuale('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
    v_token := replace(gen_random_uuid()::text, '-', '');
    begin
      insert into public.bgl_prenotazioni (evento_id, codice, token_hash, nome, cognome, email, email_norm, posti)
      values (e.id, v_codice, public.bgl_impronta(v_token), v_nome, v_cognome, v_email, v_email_norm, v_posti)
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
    end;
  end loop;
  if v_pid is null then raise exception 'bgl_prenota: codice unico non trovato'; end if;

  -- 8. l'unica volta in cui il token esce dal database
  return jsonb_build_object('ok', true, 'prenotazione_id', v_pid, 'codice', v_codice, 'token', v_token,
    'posti', to_jsonb(v_posti),
    'evento', jsonb_build_object('slug', e.slug, 'titolo', e.titolo, 'inizio', e.inizio, 'luogo', e.luogo),
    'nome', v_nome, 'cognome', v_cognome, 'email', v_email);
end $$;

revoke all on function public.bgl_prenota(text, text[], text, text, text) from public, anon, authenticated;
grant execute on function public.bgl_prenota(text, text[], text, text, text) to service_role;

-- ───────────────────────────────────────────────────────────────────────────── organizzatore
-- Ogni funzione: auth.uid() nullo → non_autenticato; evento inesistente o d'altri → lo stesso `non_tuo`
-- (non si scopre che un id esiste).

-- I conteggi di un evento: prenotati, tenuti da parte (non occupati), liberi.
create function public.bgl_conteggi(p_evento public.bgl_eventi)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  with occ as (select count(*)::int n from public.bgl_posti where evento_id = p_evento.id),
       ris as (select count(*)::int n from unnest(p_evento.riservati) r
                where not exists (select 1 from public.bgl_posti b where b.evento_id = p_evento.id and b.posto = r))
  select jsonb_build_object('totali', p_evento.posti_totali, 'prenotati', occ.n, 'riservati', ris.n,
    'liberi', greatest(p_evento.posti_totali - occ.n - ris.n, 0))
  from occ, ris
$$;
revoke all on function public.bgl_conteggi(public.bgl_eventi) from public, anon, authenticated;

create function public.bgl_evento_json(p_evento public.bgl_eventi)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p_evento.id, 'slug', p_evento.slug, 'titolo', p_evento.titolo,
    'inizio', p_evento.inizio, 'chiusura', p_evento.chiusura, 'luogo', p_evento.luogo, 'note', p_evento.note,
    'stato', p_evento.stato,
    'stato_pubblico', public.bgl_stato_pubblico(p_evento.stato, p_evento.inizio, p_evento.chiusura),
    'posti_totali', p_evento.posti_totali,
    'prenotati', c->'prenotati', 'riservati', c->'riservati', 'liberi', c->'liberi')
  from (select public.bgl_conteggi(p_evento) c) x
$$;
revoke all on function public.bgl_evento_json(public.bgl_eventi) from public, anon, authenticated;

-- Apre le prenotazioni su un progetto dell'utente. La pianta si ricostruisce coi soli campi ammessi.
create function public.bgl_apri(p_project_id uuid, p_evento jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); v_titolo text; v_luogo text; v_note text; v_inizio timestamptz; v_chiusura timestamptz;
  v_pianta jsonb; v_chiavi text[]; v_ris text[]; v_slug text; v_id uuid; n int; v_motivo text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
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
grant execute on function public.bgl_apri(uuid, jsonb) to authenticated;

-- Cambia titolo/inizio/chiusura/luogo/note/stato/riservati/pianta. Un posto prenotato non si tiene da
-- parte e non sparisce dalla pianta: prima si disdice.
create function public.bgl_modifica(p_evento_id uuid, p_campi jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); e public.bgl_eventi; v text; occ text[]; conflitto text[]; chiavi text[];
  motivo text; nuova jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
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
    v := nullif(btrim(coalesce(p_campi->>'note', '')), '');
    if v is not null and (char_length(v) > 500 or v ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') then
      return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'note');
    end if;
    e.note := v;
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
grant execute on function public.bgl_modifica(uuid, jsonb) to authenticated;

-- Gli eventi di un progetto dell'utente, con i conteggi.
create function public.bgl_eventi_progetto(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if p_project_id is null or not exists (select 1 from public.stageplot_projects
       where id = p_project_id and user_id = uid) then
    return jsonb_build_object('ok', false, 'errore', 'non_tuo');
  end if;
  return jsonb_build_object('ok', true, 'eventi', coalesce((
    select jsonb_agg(public.bgl_evento_json(e) order by e.inizio desc, e.creato_il desc)
      from public.bgl_eventi e where e.project_id = p_project_id and e.user_id = uid), '[]'::jsonb));
end $$;
revoke all on function public.bgl_eventi_progetto(uuid) from public, anon, authenticated;
grant execute on function public.bgl_eventi_progetto(uuid) to authenticated;

-- Tutto per il pannello: le prenotazioni con nome, cognome, email, posti e codice. SOLO al proprietario.
create function public.bgl_prenotati(p_evento_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); e public.bgl_eventi; c jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  select * into e from public.bgl_eventi where id = p_evento_id and user_id = uid;
  if e.id is null then return jsonb_build_object('ok', false, 'errore', 'non_tuo'); end if;
  c := public.bgl_conteggi(e);
  return jsonb_build_object('ok', true,
    'evento', public.bgl_evento_json(e) || jsonb_build_object('riservati', to_jsonb(e.riservati), 'pianta', e.pianta),
    'prenotazioni', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'codice', p.codice, 'nome', p.nome, 'cognome', p.cognome,
        'email', p.email,
        'posti', (select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
                    from unnest(p.posti) with ordinality u(x, i)
                   where exists (select 1 from public.bgl_posti b
                                  where b.evento_id = e.id and b.posto = x and b.prenotazione_id = p.id)),
        'posti_chiesti', to_jsonb(p.posti), 'stato', p.stato, 'creata_il', p.creata_il, 'chiusa_il', p.chiusa_il)
        order by p.creata_il, p.codice)
      from public.bgl_prenotazioni p where p.evento_id = e.id), '[]'::jsonb),
    'conteggi', c || jsonb_build_object('prenotazioni_attive',
      (select count(*) from public.bgl_prenotazioni p where p.evento_id = e.id and p.stato = 'attiva')));
end $$;
revoke all on function public.bgl_prenotati(uuid) from public, anon, authenticated;
grant execute on function public.bgl_prenotati(uuid) to authenticated;

-- L'organizzatore disdice per conto di qualcuno: tutta la prenotazione, o alcuni posti.
create function public.bgl_annulla(p_prenotazione_id uuid, p_posti text[] default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); p public.bgl_prenotazioni; n int; resto int;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  select p0.* into p from public.bgl_prenotazioni p0 join public.bgl_eventi e on e.id = p0.evento_id
   where p0.id = p_prenotazione_id and e.user_id = uid for update of p0;
  if p.id is null then return jsonb_build_object('ok', false, 'errore', 'non_tuo'); end if;
  if p.stato <> 'attiva' then return jsonb_build_object('ok', false, 'errore', 'gia_disdetta'); end if;
  if p_posti is null then
    delete from public.bgl_posti where prenotazione_id = p.id;
  else
    delete from public.bgl_posti where prenotazione_id = p.id and posto = any(p_posti);
  end if;
  get diagnostics n = row_count;
  select count(*) into resto from public.bgl_posti where prenotazione_id = p.id;
  if resto = 0 then
    update public.bgl_prenotazioni set stato = 'annullata', chiusa_il = now() where id = p.id;
  end if;
  return jsonb_build_object('ok', true, 'liberati', n);
end $$;
revoke all on function public.bgl_annulla(uuid, text[]) from public, anon, authenticated;
grant execute on function public.bgl_annulla(uuid, text[]) to authenticated;

-- Cancella l'evento e le sue prenotazioni (errori, prove).
create function public.bgl_elimina(p_evento_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); eid uuid; n int;
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  select id into eid from public.bgl_eventi where id = p_evento_id and user_id = uid for update;
  if eid is null then return jsonb_build_object('ok', false, 'errore', 'non_tuo'); end if;
  select count(*) into n from public.bgl_prenotazioni where evento_id = eid;
  delete from public.bgl_eventi where id = eid;
  return jsonb_build_object('ok', true, 'eliminate', n);
end $$;
revoke all on function public.bgl_elimina(uuid) from public, anon, authenticated;
grant execute on function public.bgl_elimina(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────── retention: la purga della 0062, estesa
-- Stessa firma (returns jsonb): `create or replace` tiene i permessi, ma si riscrivono lo stesso.
-- In più: nomi, cognomi, email e token delle prenotazioni diventano null 30 giorni dopo l'evento (posti e
-- codici restano: non dicono chi); le impronte degli IP della biglietteria si tolgono dopo 7 giorni.
-- La Edge Function `retention-purge` e il workflow giornaliero non cambiano.
create or replace function public.stageplot_purge_expired()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a int; f int; l int; bp int; bt int;
begin
  delete from public.analytics_events  where created_at   < now() - interval '30 days';
  get diagnostics a = row_count;
  delete from public.feedback_throttle where window_start < now() - interval '7 days';
  get diagnostics f = row_count;
  delete from public.landing_throttle  where window_start < now() - interval '7 days';
  get diagnostics l = row_count;
  update public.bgl_prenotazioni p
     set nome = null, cognome = null, email = null, email_norm = null, token_hash = null, anonimizzata_il = now()
    from public.bgl_eventi e
   where p.evento_id = e.id and p.anonimizzata_il is null and e.inizio < now() - interval '30 days';
  get diagnostics bp = row_count;
  delete from public.bgl_throttle where window_start < now() - interval '7 days';
  get diagnostics bt = row_count;
  return jsonb_build_object('analytics_events', a, 'feedback_throttle', f, 'landing_throttle', l,
    'bgl_anonimizzate', bp, 'bgl_throttle', bt);
end;
$$;

comment on function public.stageplot_purge_expired() is
  'Retention delle tabelle: analytics_events (>30gg), feedback_throttle, landing_throttle e bgl_throttle (>7gg), dati personali delle prenotazioni della biglietteria (30gg dopo l''evento). Le schermate delle segnalazioni le cancella la Edge Function retention-purge con la Storage API (0062).';

revoke all on function public.stageplot_purge_expired() from public, anon, authenticated;
grant execute on function public.stageplot_purge_expired() to service_role;
