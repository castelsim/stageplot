-- Il preventivo è pronto: il cliente lo deve sapere.
--
-- Il preventivo mandato compariva nell'area del cliente e basta: nessuno gli diceva che c'era. Il giro
-- si inceppava proprio lì — il cliente aspetta un'email, non torna a controllare una pagina.
--
-- Qui la coda d'invio, sullo stesso schema delle richieste: quando il preventivo parte, la sua riga
-- diventa «da avvisare»; la pagina chiama subito `orc-quote-notify`, e il worker delle notifiche ripassa
-- quello che non è partito (il cron di GitHub gira quando gli pare: il 10/09 fra un giro e l'altro
-- sono passate ore, ed è per questo che la strada normale è l'invio immediato).
--
-- `orc_quote_send` è la stessa di 0059_orc_preventivo.sql, con UNA riga in più: lo stato dell'avviso.
-- Le colonne nuove non sono nel guard dell'immutabilità, e va bene così: mandare l'avviso non cambia la
-- cifra che il cliente accetta.

alter table public.orc_quotes add column if not exists notify_status text not null default 'none';
alter table public.orc_quotes add column if not exists notify_attempts integer not null default 0;
alter table public.orc_quotes add column if not exists notify_claimed_at timestamptz;
alter table public.orc_quotes drop constraint if exists orc_quotes_notify_chk;
alter table public.orc_quotes add constraint orc_quotes_notify_chk check (notify_status in ('none','pending','sending','sent','failed'));
create index if not exists orc_quotes_outbox_idx on public.orc_quotes(notify_status) where notify_status in ('pending','sending');

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
  update public.orc_quotes x set status = 'sent', sent_at = now(), net_cents = netto, vat_cents = imposta, total_cents = netto + imposta,
    notify_status = 'pending', notify_attempts = 0
  where x.id = quote returning * into q;
  update public.orc_client_requests r set status = 'quoted' where r.id = q.request_id and r.status in ('new','taken','quoted');
  insert into public.orc_audit_log (org_id, actor_id, action, entity, entity_id, payload)
  values (q.org_id, auth.uid(), 'quote.send', 'orc_quotes', q.id::text, jsonb_build_object('total_cents', q.total_cents));
  return q;
end $$;
