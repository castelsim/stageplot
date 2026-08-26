-- 0039_projects_locked_no_delete.sql
--
-- Un progetto BLOCCATO non si elimina: prima va sbloccato.
--
-- Perché. Il lucchetto (is_locked, 0012) rende il progetto read-only e il divieto di modifica è già
-- vero nel database: il trigger di 0032 rifiuta le scritture sul contenuto. L'eliminazione invece
-- passava, con la sola conferma dell'interfaccia — così il lucchetto si contraddiceva, perché si
-- poteva distruggere ciò che non si poteva nemmeno rinominare. E il progetto bloccato è per
-- definizione quello che non deve sparire: la versione approvata, quella già mandata al service.
--
-- L'interfaccia ora offre lo sblocco al posto dell'eliminazione, ma una regola che vive solo nel
-- client protegge dallo sbaglio e non dal guasto: basta una richiesta malformata, un client vecchio
-- in una scheda rimasta aperta, o uno script, e il progetto se ne va lo stesso. Qui la stessa regola
-- diventa vera per chiunque parli col database.
--
-- La transizione resta libera nei due sensi: sbloccare è un update di is_locked, permesso da 0012,
-- e dopo lo sblocco l'eliminazione funziona come su qualsiasi altro progetto. Nessun vicolo cieco.

drop policy if exists "Elimina propri progetti" on public.stageplot_projects;
create policy "Elimina propri progetti" on public.stageplot_projects
  for delete using (auth.uid() = user_id and coalesce(is_locked, false) = false);
