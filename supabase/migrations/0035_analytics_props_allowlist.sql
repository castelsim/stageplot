-- Riallinea l'allowlist delle chiavi `props` a quelle che il client invia davvero.
--
-- PERCHÉ: la policy di 0026 esige `props - <allowlist> = '{}'`, cioè rifiuta l'intero INSERT se
-- compare anche una sola chiave non elencata. Dal 24/07/2026 il client ne aggiunge di nuove e
-- l'INSERT viene respinto in silenzio (il client ignora il ramo di errore della promise):
--   build_id  · c954b3b, 24/07 — identità immutabile della release (audit L-03)
--   founder   · 843fd6c, 24/07 — marca gli eventi del fondatore per escluderli dalle metriche
--   from      · 117a957, 09/08 — porta d'ingresso dai CTA della landing
-- Effetto misurato sul dump 20260811-1128: ultimo evento registrato 24/07 12:45 con la build
-- precedente, e nessun evento in tutto il database contiene build_id, founder o from. Diciotto
-- giorni di analytics persi, non recuperabili: gli eventi rifiutati non sono stati messi in coda.
--
-- Il resto della policy resta identico a 0026: stessi dieci eventi, stesso vincolo user_id.
-- L'allowlist non è un dettaglio da allargare a piacere — è ciò che impedisce a un client
-- compromesso di scrivere campi arbitrari in una tabella pubblica in scrittura.

drop policy if exists "analytics insert authenticated"
  on public.analytics_events;
create policy "analytics insert authenticated"
  on public.analytics_events
  for insert
  to authenticated
  with check (
    event in (
      'app_open',
      'project_activated',
      'export',
      'export_csv',
      'share_created',
      'login_success',
      'cloud_first_save',
      'search_no_results',
      'rubrica_save',
      'rubrica_pick'
    )
    and user_id = auth.uid()
    and props - array[
      'logged',
      'mobile',
      'app_version',
      'env',
      'q',
      'format',
      'rows',
      'build_id',   -- 0035
      'founder',    -- 0035
      'from'        -- 0035
    ]::text[] = '{}'::jsonb
  );
