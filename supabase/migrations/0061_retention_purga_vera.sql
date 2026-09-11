-- 0061 — La retention promessa, eseguita davvero.
--
-- L'informativa promette: analytics cancellati dopo 30 giorni, schermate delle segnalazioni dopo 30,
-- stato dei rate-limit dopo 7. La 0033 aveva scritto la funzione e provato a schedularla con pg_cron,
-- «best-effort»: se pg_cron non c'era, un avviso e avanti. L'11/09/2026, in produzione:
--   · lo schema `cron` è VUOTO — pg_cron non è installato, la purga non è mai partita;
--   · il record più vecchio di analytics_events è del 18/07: 55 giorni, contro i 30 promessi;
--   · e anche chiamata a mano sarebbe fallita. La 0037 ci aveva aggiunto
--       delete from storage.objects where bucket_id = 'feedback-shots' ...
--     che Supabase rifiuta con il trigger `protect_objects_delete` — «Direct deletion from storage tables
--     is not allowed» — e l'eccezione annullava TUTTA la funzione, analytics compresi. Peggio: quel DELETE,
--     quando passava, toglieva la riga e lasciava il FILE nello storage sottostante. Non avrebbe mantenuto
--     la promessa nemmeno funzionando.
--
-- Da qui: il database pulisce solo le tabelle e dice quante righe ha tolto; le schermate le cancella
-- la Storage API, dalla Edge Function `retention-purge`, chiamata ogni giorno dal workflow omonimo.
--
-- Il tipo di ritorno cambia (void → jsonb), e per cambiarlo serve un DROP. Il DROP azzera i permessi:
-- la funzione tornerebbe eseguibile da PUBLIC — il difetto chiuso ieri dalla 0057. Revoke e grant
-- stanno quindi QUI, subito dopo, e il test di sicurezza di ieri li riprova.

drop function if exists public.stageplot_purge_expired();

create function public.stageplot_purge_expired()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a int; f int; l int;
begin
  delete from public.analytics_events  where created_at   < now() - interval '30 days';
  get diagnostics a = row_count;
  delete from public.feedback_throttle where window_start < now() - interval '7 days';
  get diagnostics f = row_count;
  delete from public.landing_throttle  where window_start < now() - interval '7 days';
  get diagnostics l = row_count;
  return jsonb_build_object('analytics_events', a, 'feedback_throttle', f, 'landing_throttle', l);
end;
$$;

comment on function public.stageplot_purge_expired() is
  'Retention delle tabelle: analytics_events (>30gg), feedback_throttle e landing_throttle (>7gg). Le schermate delle segnalazioni NON sono qui: le cancella la Edge Function retention-purge con la Storage API (0061).';

revoke all on function public.stageplot_purge_expired() from public, anon, authenticated;
grant execute on function public.stageplot_purge_expired() to service_role;

-- La chiave di servizio legge e scrive gli analytics, come fa già in produzione (l'11/09 `sp-db.sh` li ha
-- letti proprio con lei). Sul Postgres locale e in CI quel grant non c'era, e il test che prova che la
-- purga CANCELLA — il test che è mancato da luglio — non poteva nemmeno preparare un record scaduto.
-- Non allarga niente: service_role scavalca già la RLS, qui si toglie solo una differenza fra ambienti.
grant select, insert, delete on public.analytics_events to service_role;

-- Il secondo passo delle schermate: tolti i file, si tolgono i riferimenti. Sta nel database, non nella
-- Edge Function, perché così non dipende dai grant della tabella — che fra locale e produzione non
-- coincidono: la prima prova end-to-end è caduta proprio lì, «permission denied for table feedback».
--
-- Un confine, non una cartella: la function toglie PRIMA tutti i file scaduti e POI chiama questa una
-- volta sola, con l'ultimo giorno scaduto. Nella prima versione andava cartella per cartella, e la prova
-- ha mostrato il buco: un giro che toglie il file e cade sul riferimento lascia una cartella vuota, che
-- nello storage smette di esistere — e al giro dopo nessuno ritrova più quel riferimento. Così invece si
-- ripulisce da solo.
-- Si tocca solo un percorso nella forma delle cartelle del bucket (`AAAA-MM-GG/...`), e il confine
-- dev'essere una data vera: niente pattern, niente sorprese.
create or replace function public.stageplot_forget_screenshots(until_day text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if until_day is null or until_day !~ '^\d{4}-\d{2}-\d{2}$'
     or to_char(to_date(until_day, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> until_day then
    raise exception 'giorno non valido: %', coalesce(until_day, 'null') using errcode = '22023';
  end if;
  update public.feedback set screenshot_path = null
   where screenshot_path ~ '^\d{4}-\d{2}-\d{2}/'
     and left(screenshot_path, 10) <= until_day;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.stageplot_forget_screenshots(text) from public, anon, authenticated;
grant execute on function public.stageplot_forget_screenshots(text) to service_role;

-- Stessa differenza fra ambienti, sulle segnalazioni: in produzione la chiave di servizio le scrive già
-- (è quello che fa `submit-feedback`, e le segnalazioni arrivano) e le legge (`sp-db.sh q feedback`).
-- In locale e in CI no, e il test del confine qui sopra non poteva prepararsi una segnalazione.
grant select, insert, update, delete on public.feedback to service_role;
