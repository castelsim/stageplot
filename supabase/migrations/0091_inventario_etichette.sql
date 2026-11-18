-- 0091 — Inventario: tracciamento delle etichette già fatte (stampate, plastificate, tagliate e consegnate in segreteria).
--
-- PERCHÉ: le etichette si stampano su un foglio A4, si plastificano, si tagliano e si consegnano in segreteria; il foglio si butta. Senza una traccia,
-- ogni volta si rischia di ristampare tutto o di dimenticare gli oggetti nuovi. Un solo dato per oggetto: la DATA in cui l'etichetta è stata
-- fatta e consegnata (null = da fare). Nessun nome, nessuna nota: resta un'informazione di servizio, riservata ai membri come il resto.
--
-- DECISIONI (Simone, 18/11/2026):
--  • «Segna come fatte e consegnate» è un clic esplicito di una persona abilitata (il dialogo di stampa non dice se la stampa è riuscita);
--  • il flag si può togliere (annulla / «rimetti da fare») e una ristampa singola non tocca le altre;
--  • si scrive SOLO con inv_etichette_segna() (security definer, membri abilitati): la colonna NON è nel grant update delle tabelle;
--  • le funzioni pubbliche (pagina del QR, elenco pubblico) non la leggono e non la mostrano mai.
-- Gli oggetti già presenti restano «da fare» (null): non si può sapere quali etichette esistano già. Se tutte quelle esistenti sono già state
-- consegnate, il proprietario lo dichiara una volta con l'istruzione commentata in fondo (vedi COMANDI_SIMONE).
--
-- Nessun nuovo riferimento ad auth.users (nessuna colonna «chi l'ha segnata»): la pulizia account (bgl_account_solo_biglietteria, 0085) resta com'è.

alter table public.inv_articoli add column if not exists etichetta_fatta date;

-- (nessun CHECK sulla data: la scrive solo inv_etichette_segna(), con la data di oggi; un CHECK con current_date non è immutabile e dà guai nei dump)

-- ───────────────────────────────────────────────────────────── RPC: segna / toglie la data di «etichetta fatta» per un gruppo di codici
-- p_fatta = true  → imposta la data di OGGI (Italia) agli oggetti indicati che non l'hanno ancora (una ristampa non cambia la data originale);
-- p_fatta = false → toglie la data («da fare»), anche per una sola etichetta rovinata o persa.
-- Lavora SOLO sugli oggetti dell'inventario p_inv: un codice di un altro inventario non viene toccato (e non si scopre se esiste).
-- Non tocca «aggiornato» (le pagine pubbliche non cambiano) né nessun altro campo.
create or replace function public.inv_etichette_segna(p_inv uuid, p_codici text[], p_fatta boolean)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); n integer; cod text[];
begin
  if uid is null then return jsonb_build_object('ok', false, 'errore', 'non_autenticato'); end if;
  if p_inv is null or not public.inv_e_membro(p_inv) then return jsonb_build_object('ok', false, 'errore', 'non_autorizzato'); end if;
  if p_fatta is null or p_codici is null or coalesce(array_length(p_codici, 1), 0) < 1 or array_length(p_codici, 1) > 2000 then
    return jsonb_build_object('ok', false, 'errore', 'dati_non_validi', 'campo', 'codici');
  end if;
  select coalesce(array_agg(distinct upper(btrim(c))), '{}') into cod from unnest(p_codici) as c where c is not null;
  if p_fatta then
    update public.inv_articoli set etichetta_fatta = (now() at time zone 'Europe/Rome')::date
     where inventario_id = p_inv and codice = any (cod) and etichetta_fatta is null and stato <> 'dismesso';
  else
    update public.inv_articoli set etichetta_fatta = null
     where inventario_id = p_inv and codice = any (cod) and etichetta_fatta is not null;
  end if;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'n', n);
end $$;
revoke all on function public.inv_etichette_segna(uuid, text[], boolean) from public, anon, authenticated;
grant execute on function public.inv_etichette_segna(uuid, text[], boolean) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────── OPZIONALE, da lanciare UNA volta dal proprietario (SQL editor) solo se
-- TUTTE le etichette degli oggetti già inseriti sono già state fatte e consegnate (altrimenti non lanciarlo: gli oggetti restano «da fare»):
--   update public.inv_articoli set etichetta_fatta = date '2026-11-18'
--    where inventario_id = (select id from public.inv_inventari where slug = 'ava') and etichetta_fatta is null and stato <> 'dismesso';

notify pgrst, 'reload schema';
