-- La pagina «Candidati come musicista» parlava di un mercato di orchestre fra cui scegliere, e a chi la
-- apriva diceva «Al momento nessuna organizzazione accetta candidature» (segnalazione di Simone, 10/09/2026).
-- Il modello vero è un altro: **una** società raccoglie i musicisti e risponde ai clienti. La pagina deve
-- dire a chi ci si candida, con che parole, e deve funzionare anche prima dell'accesso.
--
-- Qui: una funzione che chiunque può leggere (nome, presentazione e se sta raccogliendo candidature della
-- società di servizi) e l'accensione delle candidature, con lo stesso criterio prudente dell'accensione del
-- servizio: solo se non ci sono dubbi su quale sia l'organizzazione.

-- Il nome di chi raccoglie le candidature è pubblico per definizione: sta sulla pagina che invita a
-- candidarsi. Non esce nient'altro: né identificativi di persone, né numeri, né impostazioni.
create or replace function public.orc_service_org_public()
returns table (name text, application_intro text, accepting boolean)
language sql stable security definer set search_path = public as $$
  select o.name, o.application_intro, o.accepting_applications
  from public.orc_organizations o where o.is_service_provider limit 1
$$;
revoke all on function public.orc_service_org_public() from public;
grant execute on function public.orc_service_org_public() to anon, authenticated, service_role;

-- Le candidature si aprono sulla società di servizi. Come per 0053: solo se nessun dubbio, cioè se è
-- quella l'unica organizzazione. Con più organizzazioni la scelta resta a chi le gestisce (Impostazioni).
update public.orc_organizations set accepting_applications = true
where is_service_provider
  and (select count(*) from public.orc_organizations) = 1
  and not accepting_applications;
