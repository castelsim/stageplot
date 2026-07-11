-- 0011_projects_touch_updated_at.sql
--
-- GUARDIA DI VERSIONE (decisione 11/07/2026, opzione A — lab decisioni ciclo 1).
--
-- Problema: il salvataggio cloud era un UPDATE incondizionato → "ultimo che scrive
-- vince" silenzioso tra due tab/dispositivi sullo stesso progetto (perdita dati).
-- Il client ora salva in modo condizionale: UPDATE ... WHERE id = X AND updated_at = <rev letta>.
-- Perché funzioni, updated_at deve cambiare A OGNI update: questo trigger lo garantisce
-- lato server (il client non lo scrive mai direttamente).
--
-- Bonus: sistema anche l'ordinamento della lista progetti ("ultimo modificato in alto"),
-- che finora ordinava su un updated_at fermo alla creazione (nessun trigger esisteva).
--
-- Idempotente. Senza questa migration il client resta al comportamento precedente
-- (guardia inerte): nessuna rottura in nessun ordine di deploy.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stageplot_projects_touch on public.stageplot_projects;
create trigger stageplot_projects_touch
  before update on public.stageplot_projects
  for each row execute function public.touch_updated_at();
