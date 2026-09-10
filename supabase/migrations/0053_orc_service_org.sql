-- Accende il servizio «Richiedi musicisti».
--
-- Le richieste dei clienti vanno a UNA organizzazione (`is_service_provider`, indice unico). Finché non è
-- accesa, il pulsante nell'editor porta a una pagina che dice «il servizio non è attivo»: peggio che non
-- avere il pulsante. Qui si accende, ma solo nel caso in cui non ci siano dubbi su quale sia:
--   — nessuna è già accesa, e
--   — ce n'è una sola.
-- Con più organizzazioni la scelta è di chi le gestisce, non di una migrazione: in quel caso non fa niente
-- e la riga da eseguire è quella in fondo, commentata.
--
-- Nessun dato reale qui dentro: né identificativi, né nomi. Il repo è pubblico.

update public.orc_organizations set is_service_provider = true
where not exists (select 1 from public.orc_organizations o where o.is_service_provider)
  and (select count(*) from public.orc_organizations) = 1;

-- Se le organizzazioni sono più d'una, scegliere a mano quale riceve le richieste:
--   update public.orc_organizations set is_service_provider = false;
--   update public.orc_organizations set is_service_provider = true where slug = '<lo slug giusto>';
