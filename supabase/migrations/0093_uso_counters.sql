-- 0093 · Misure anonime d'uso dell'editor (23/11/2026, studio ORIZZONTE 01, mossa 1).
-- File preparato localmente: NON applicato. Lo lancia Simone: `supabase db push --linked` dal worktree
-- del ramo misure-anonime-23-11 (poi il deploy di track-landing: `supabase functions deploy track-landing`).
--
-- COSA. Un contatore GIORNALIERO per evento × lingua del browser × dispositivo × account (sì/no).
-- Domande a cui risponde: quanti aprono l'editor, quanti esportano un PDF (conversione), in che lingua.
--
-- COSA NON È. Nessuna riga per persona o per progetto, nessun IP, nessun user agent, nessun identificatore,
-- nessun cookie. «account» = nel browser c'è una sessione salvata (sì/no), non chi sia.
-- Stesso modello della 0036 (landing_counters): nessuna policy, il browser NON scrive; scrive solo la Edge
-- Function track-landing con la service key, dopo aver ricondotto ogni valore a un elenco chiuso.
-- Il numero di righe è limitato dalle combinazioni (giorno × 4 × 6 × 2 × 2): non si può gonfiare il database.
-- Non si purga: sono numeri aggregati che non riguardano nessuno e servono per il confronto fra settimane.

create table if not exists public.uso_counters (
  day date not null,
  event text not null,
  lang text not null,
  device text not null,
  account text not null,
  count int not null default 0,
  primary key (day, event, lang, device, account)
);
alter table public.uso_counters enable row level security;

alter table public.uso_counters drop constraint if exists uso_counters_shape;
alter table public.uso_counters
  add constraint uso_counters_shape
    check (
      event in ('editor_aperto', 'pdf_esportato', 'png_esportato', 'progetto_condiviso')
      and lang in ('it', 'en', 'de', 'fr', 'es', 'altro')
      and device in ('telefono', 'computer')
      and account in ('si', 'no')
      and count >= 0
    );

-- Incremento atomico di oggi; il giorno lo decide il server.
create or replace function public.uso_counter_hit(p_event text, p_lang text, p_device text, p_account text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.uso_counters as c (day, event, lang, device, account, count)
  values (current_date, p_event, p_lang, p_device, p_account, 1)
  on conflict (day, event, lang, device, account)
  do update set count = c.count + 1;
end;
$$;

revoke execute on function public.uso_counter_hit(text, text, text, text) from public, anon, authenticated;
grant execute on function public.uso_counter_hit(text, text, text, text) to service_role;

-- Come si leggono i numeri (script: ops/misure-uso.py, da sp-db.sh):
--   conversione 30 gg:  select sum(count) filter (where event='pdf_esportato')::float
--                              / nullif(sum(count) filter (where event='editor_aperto'),0)
--                       from public.uso_counters where day > current_date - 30;
--   lingue:             select lang, sum(count) from public.uso_counters
--                       where event='editor_aperto' and day > current_date - 30 group by lang order by 2 desc;
