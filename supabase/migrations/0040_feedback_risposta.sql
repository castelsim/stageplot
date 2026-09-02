-- 0040 — La risposta a chi ha segnalato, e il modo di sapere che l'ha letta.
--
-- PERCHÉ. Il 01/09 un utente ha segnalato che non riusciva a collegare i cavi al proprio mixer.
-- È stato sistemato in giornata (PR #85, #86). Poi il problema vero: non c'era NESSUN modo di
-- diirglielo. Il box «Cosa manca?» non chiede la mail — quella che abbiamo viene dall'account
-- Google, e non l'ha lasciata lei/lui per essere ricontattato. La home però promette
-- «il box arriva a me, e rispondo io»: una promessa che finora non aveva un canale.
--
-- La decisione di Simone (02/09): la risposta si dà DENTRO il prodotto, quando quella persona
-- rientra. Non per mail.
--
-- COSA NON FA. Non manda niente, non scrive a nessuno: mette la risposta accanto alla
-- segnalazione e ricorda se è già stata vista. Chi non torna nell'app non riceve nulla, ed è
-- coerente con il fatto che non ci ha dato un recapito.

alter table public.feedback
  add column if not exists risposta text,
  add column if not exists risposta_il timestamptz,
  add column if not exists risposta_letta_il timestamptz;

comment on column public.feedback.risposta is
  'Il testo che l''utente legge nell''app quando rientra. Scritto solo dal triage (service_role): il client non ci arriva mai in scrittura.';
comment on column public.feedback.risposta_il is
  'Quando è stata scritta la risposta. Serve a distinguerla da quelle vecchie e a non riproporre in eterno una cosa di mesi fa.';
comment on column public.feedback.risposta_letta_il is
  'Quando l''utente l''ha vista. Null = da mostrare. Lo scrive la Edge Function, con il JWT di quella persona.';

-- La domanda che l'app fa a ogni avvio di un utente loggato: «c'è qualcosa per me da leggere?».
-- Senza indice sarebbe una scansione della tabella a ogni sessione.
create index if not exists feedback_risposta_da_leggere_idx
  on public.feedback (user_id, risposta_il desc)
  where risposta is not null and risposta_letta_il is null;

-- ------------------------------------------------------------------ segnare come letta
-- Perché una funzione e non una UPDATE dalla Edge Function: così il permesso è scritto QUI, in una
-- riga sola che si legge tutta insieme — si può segnare letta solo una riga PROPRIA, e solo quella
-- colonna. La Edge Function non può sbagliare a scrivere altro, perché non scrive lei.
--
-- security definer con search_path fissato: la tabella ha RLS senza policy (arriva solo la
-- service_role), quindi la funzione deve poterci entrare, ma solo per questo.
create or replace function public.feedback_segna_risposta_letta(p_id uuid, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_toccate int;
begin
  if p_id is null or p_user is null then return false; end if;
  update public.feedback
     set risposta_letta_il = now()
   where id = p_id
     and user_id = p_user            -- solo la propria: l'id di un altro non fa niente
     and risposta is not null
     and risposta_letta_il is null;  -- e una sola volta: la seconda chiamata non sposta la data
  get diagnostics v_toccate = row_count;
  return v_toccate > 0;
end $$;

-- Il permesso si toglie a tutti e si ridà SOLO alla service_role: la chiama la Edge Function, dopo
-- aver verificato il JWT. Senza il grant esplicito non la potrebbe chiamare nemmeno lei — `revoke
-- from public` toglie l'execute a ogni ruolo tranne l'owner, service_role compresa. È il pattern
-- della 0025 (feedback_throttle_hit), e va tenuto uguale.
revoke execute on function public.feedback_segna_risposta_letta(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.feedback_segna_risposta_letta(uuid, uuid)
  to service_role;

comment on function public.feedback_segna_risposta_letta(uuid, uuid) is
  'Segna letta UNA risposta, e solo se la segnalazione è di quell''utente. Il controllo sta qui e non nella Edge Function: è una riga sola da leggere invece di una condizione sparsa nel codice.';
