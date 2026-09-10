-- Un account, più ruoli: dove può andare chi ha appena fatto l'accesso.
--
-- Lo stesso indirizzo email può essere tre cose insieme: un musicista che si è candidato, un cliente che
-- ha chiesto dei musicisti per un evento, e (per Simone) chi gestisce l'organizzazione. Fin qui il login
-- smistava in modo secco — staff al gestionale, tutti gli altri all'area musicista — e chi era **anche**
-- cliente non aveva nessuna strada per rivedere le proprie richieste: la funzione per leggerle esisteva
-- (`orc_my_client_requests`, 0052) ma non c'era una pagina che la chiamasse.
--
-- Qui una sola domanda al database: «di che cosa sono, io?». Serve al login per decidere se portare
-- dritto da qualche parte o offrire un bivio, e alla barra in alto per il cambio d'area senza uscire.
--
-- Cosa NON è: un elenco di permessi. I permessi restano dove sono sempre stati — nelle policy e nelle
-- funzioni, che continuano a decidere riga per riga. Questa dice soltanto quali porte ha senso mostrare;
-- se qualcuno la falsificasse otterrebbe una porta che poi non lo lascia entrare.
--
-- «Musicista» non è chiunque abbia un profilo: il profilo nasce da solo al primo accesso all'area, quindi
-- lo avrebbe chiunque ci passi. È chi si è candidato almeno una volta, o chi sta già nel pool di
-- un'organizzazione (magari importato da un CSV e collegato dopo).

create or replace function public.orc_my_areas()
returns table (musicista boolean, cliente boolean, staff boolean)
language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from public.orc_applications a
      join public.orc_musician_profiles p on p.id = a.profile_id
      where p.user_id = auth.uid() and a.status <> 'draft'
    ) or exists (
      select 1 from public.orc_musicians m where m.user_id = auth.uid() and m.deleted_at is null
    ),
    exists (select 1 from public.orc_client_requests r where r.user_id = auth.uid()),
    exists (
      select 1 from public.orc_memberships m
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'artistic', 'production')
    )
$$;

revoke all on function public.orc_my_areas() from public, anon;
grant execute on function public.orc_my_areas() to authenticated, service_role;
