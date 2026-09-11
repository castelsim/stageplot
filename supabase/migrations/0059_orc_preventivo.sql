-- Il preventivo: dalla richiesta del cliente a una cifra che il cliente può accettare.
--
-- Fino a qui la richiesta aveva uno stato «Preventivo inviato» e nient'altro: il preventivo si faceva
-- fuori, a mano, e il cliente lo riceveva per email senza che il sistema sapesse cosa conteneva.
--
-- Il modello (scelte di Simone, 11/09/2026):
--   · per ogni posto il CACHET del musicista, una QUANTITÀ, e un MARGINE percentuale unico sul totale;
--   · sopra l'imponibile, l'IVA (22% di norma);
--   · al cliente arriva SOLO il totale — con imponibile e IVA — e una descrizione della formazione.
--
-- Quello che conta di più è una regola di riservatezza, e sta qui nel database e non nell'interfaccia:
-- **il cliente non vede mai i cachet, né il margine, né le note interne**. Sulle due tabelle non ha
-- nessuna policy: quello che può leggere passa da `orc_my_quotes()`, che restituisce soltanto i campi
-- che gli spettano. Nascondere una colonna nella pagina non basterebbe — dalla console la leggerebbe.
--
-- Il preventivo mandato è IMMUTABILE, come la richiesta: il cliente accetta una cifra, e quella cifra
-- non deve poter cambiare dopo. I totali si CALCOLANO nel database al momento dell'invio (non si
-- fidano del client) e si congelano. Per cambiare qualcosa se ne fa uno nuovo; il vecchio diventa
-- «superato» e il cliente vede solo l'ultimo.
--
-- I conti: centesimi interi, un arrotondamento per passaggio — imponibile = round(costo × (1 + m/100)),
-- IVA = round(imponibile × iva/100) — gli stessi di `orchestre/src/domain/quote.js`, e un test lo prova.

create table if not exists public.orc_quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orc_organizations(id) on delete cascade,
  request_id uuid not null references public.orc_client_requests(id) on delete cascade,
  margin_pct numeric(6,2) not null default 25,
  vat_pct numeric(5,2) not null default 22,
  description text not null default '',            -- quello che legge il cliente: «Quartetto d'archi, 2 ore»
  notes_internal text not null default '',         -- mai al cliente
  status text not null default 'draft',
  net_cents bigint,                                 -- congelati all'invio: quello che il cliente accetta
  vat_cents bigint,
  total_cents bigint,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  answered_at timestamptz,
  constraint orc_quotes_status_chk check (status in ('draft','sent','accepted','declined','superseded')),
  constraint orc_quotes_margin_chk check (margin_pct between 0 and 500),
  constraint orc_quotes_vat_chk check (vat_pct between 0 and 100)
);
create index if not exists orc_quotes_request_idx on public.orc_quotes(request_id, created_at desc);
create unique index if not exists orc_quotes_one_draft_uidx on public.orc_quotes(request_id) where status = 'draft';

create table if not exists public.orc_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.orc_quotes(id) on delete cascade,
  label text not null default '',
  qty integer not null,
  fee_cents bigint not null,                        -- il cachet unitario: interno
  sort integer not null default 0,
  constraint orc_quote_lines_qty_chk check (qty between 1 and 200),
  constraint orc_quote_lines_fee_chk check (fee_cents >= 0)
);
create index if not exists orc_quote_lines_idx on public.orc_quote_lines(quote_id, sort);

-- Solo lo staff dell'organizzazione legge; nessuno scrive direttamente. Il cliente non ha policy qui.
alter table public.orc_quotes enable row level security;
alter table public.orc_quote_lines enable row level security;
drop policy if exists orc_quotes_staff_read on public.orc_quotes;
create policy orc_quotes_staff_read on public.orc_quotes for select using (public.orc_is_staff(org_id));
drop policy if exists orc_quote_lines_staff_read on public.orc_quote_lines;
create policy orc_quote_lines_staff_read on public.orc_quote_lines for select
  using (exists (select 1 from public.orc_quotes q where q.id = quote_id and public.orc_is_staff(q.org_id)));
grant select on public.orc_quotes, public.orc_quote_lines to authenticated;
grant all on public.orc_quotes, public.orc_quote_lines to service_role;

-- Quello che è partito non si tocca: né le righe, né gli importi, né il margine.
create or replace function public.orc_quotes_guard()
returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' and (
       new.margin_pct is distinct from old.margin_pct or new.vat_pct is distinct from old.vat_pct
    or new.description is distinct from old.description or new.net_cents is distinct from old.net_cents
    or new.vat_cents is distinct from old.vat_cents or new.total_cents is distinct from old.total_cents
    or new.request_id is distinct from old.request_id or new.org_id is distinct from old.org_id) then
    raise exception 'il preventivo mandato non si modifica: se ne fa uno nuovo' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists orc_quotes_guard on public.orc_quotes;
create trigger orc_quotes_guard before update on public.orc_quotes for each row execute function public.orc_quotes_guard();

create or replace function public.orc_quote_lines_guard()
returns trigger language plpgsql as $$
declare st text;
begin
  select q.status into st from public.orc_quotes q where q.id = coalesce(new.quote_id, old.quote_id);
  if st is not null and st <> 'draft' then
    raise exception 'il preventivo mandato non si modifica: se ne fa uno nuovo' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists orc_quote_lines_guard on public.orc_quote_lines;
create trigger orc_quote_lines_guard before insert or update or delete on public.orc_quote_lines
  for each row execute function public.orc_quote_lines_guard();

-- Preparare (o correggere) la bozza di una richiesta. Una sola bozza per richiesta: la si riscrive.
create or replace function public.orc_quote_save(request uuid, margin numeric, vat numeric, description text, notes text, lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.orc_client_requests; qid uuid; l jsonb; n int := 0;
begin
  select * into r from public.orc_client_requests x where x.id = request;
  if r.id is null or not public.orc_is_staff(r.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  select q.id into qid from public.orc_quotes q where q.request_id = request and q.status = 'draft';
  if qid is null then
    insert into public.orc_quotes (org_id, request_id, margin_pct, vat_pct, description, notes_internal, created_by)
    values (r.org_id, request, coalesce(margin, 25), coalesce(vat, 22), left(coalesce(orc_quote_save.description, ''), 600), left(coalesce(notes, ''), 2000), auth.uid())
    returning id into qid;
  else
    update public.orc_quotes q set margin_pct = coalesce(margin, 25), vat_pct = coalesce(vat, 22),
      description = left(coalesce(orc_quote_save.description, ''), 600), notes_internal = left(coalesce(notes, ''), 2000)
    where q.id = qid;
    delete from public.orc_quote_lines ql where ql.quote_id = qid;
  end if;
  if jsonb_typeof(coalesce(lines, 'null'::jsonb)) = 'array' then
    for l in select * from jsonb_array_elements(lines) loop
      n := n + 1;
      insert into public.orc_quote_lines (quote_id, label, qty, fee_cents, sort)
      values (qid, left(coalesce(l ->> 'label', ''), 80), (l ->> 'qty')::int, (l ->> 'fee_cents')::bigint, n);
    end loop;
  end if;
  return qid;
end $$;

-- Mandare: i totali si calcolano QUI, non si prendono dal browser, e si congelano. Il preventivo mandato
-- prima per la stessa richiesta diventa «superato»; la richiesta passa a «preventivo inviato».
create or replace function public.orc_quote_send(quote uuid)
returns public.orc_quotes language plpgsql security definer set search_path = public as $$
declare q public.orc_quotes; costo bigint; netto bigint; imposta bigint;
begin
  select * into q from public.orc_quotes x where x.id = quote;
  if q.id is null or not public.orc_is_staff(q.org_id) then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if q.status <> 'draft' then raise exception 'questo preventivo è già stato mandato' using errcode = '22023'; end if;
  select coalesce(sum(l.qty::bigint * l.fee_cents), 0) into costo from public.orc_quote_lines l where l.quote_id = quote;
  if costo <= 0 then raise exception 'il preventivo è vuoto: aggiungi almeno un posto con il suo cachet' using errcode = '22023'; end if;
  netto := round(costo * (1 + q.margin_pct / 100.0));
  imposta := round(netto * q.vat_pct / 100.0);
  update public.orc_quotes x set status = 'superseded' where x.request_id = q.request_id and x.status = 'sent';
  update public.orc_quotes x set status = 'sent', sent_at = now(), net_cents = netto, vat_cents = imposta, total_cents = netto + imposta
  where x.id = quote returning * into q;
  update public.orc_client_requests r set status = 'quoted' where r.id = q.request_id and r.status in ('new','taken','quoted');
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (q.org_id, auth.uid(), 'quote.send', 'orc_quotes', q.id::text, jsonb_build_object('total_cents', q.total_cents));
  return q;
end $$;

-- Quello che vede il cliente: solo i preventivi MANDATI delle sue richieste, e solo i campi che gli
-- spettano. Niente righe, niente cachet, niente margine, niente note interne.
create or replace function public.orc_my_quotes()
returns table (id uuid, request_id uuid, description text, net_cents bigint, vat_cents bigint, total_cents bigint,
  vat_pct numeric, status text, sent_at timestamptz, answered_at timestamptz)
language sql stable security definer set search_path = public as $$
  select q.id, q.request_id, q.description, q.net_cents, q.vat_cents, q.total_cents, q.vat_pct, q.status, q.sent_at, q.answered_at
  from public.orc_quotes q join public.orc_client_requests r on r.id = q.request_id
  where r.user_id = auth.uid() and q.status in ('sent', 'accepted', 'declined')
  order by q.sent_at desc
$$;

-- La risposta del cliente: accetta o no. Solo sul preventivo mandato, una volta sola.
create or replace function public.orc_quote_answer(quote uuid, accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare q public.orc_quotes; r public.orc_client_requests;
begin
  select * into q from public.orc_quotes x where x.id = quote;
  if q.id is null then raise exception 'non autorizzato' using errcode = '42501'; end if;
  select * into r from public.orc_client_requests x where x.id = q.request_id;
  if r.user_id is distinct from auth.uid() then raise exception 'non autorizzato' using errcode = '42501'; end if;
  if q.status <> 'sent' then raise exception 'a questo preventivo non si può più rispondere' using errcode = '22023'; end if;
  update public.orc_quotes x set status = case when accept then 'accepted' else 'declined' end, answered_at = now() where x.id = quote;
  update public.orc_client_requests x set status = case when accept then 'won' else 'lost' end where x.id = q.request_id;
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (q.org_id, auth.uid(), case when accept then 'quote.accepted' else 'quote.declined' end, 'orc_quotes', q.id::text, '{}'::jsonb);
  return case when accept then 'accepted' else 'declined' end;
end $$;

revoke all on function public.orc_quote_save(uuid, numeric, numeric, text, text, jsonb), public.orc_quote_send(uuid),
  public.orc_my_quotes(), public.orc_quote_answer(uuid, boolean) from public, anon;
grant execute on function public.orc_quote_save(uuid, numeric, numeric, text, text, jsonb), public.orc_quote_send(uuid),
  public.orc_my_quotes(), public.orc_quote_answer(uuid, boolean) to authenticated, service_role;
