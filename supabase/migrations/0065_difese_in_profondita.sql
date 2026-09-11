-- 0065 — Due difese in profondità dall'audit di sicurezza del 10-11/09.
--
-- Nessuna delle due chiude una porta aperta: sono la seconda serratura dietro la prima.

-- ─────────────────────────────────────────── 1. L'impronta di un invito smette di essere la credenziale
-- La 0055 dichiarava: «chi guarda il database non trova niente con cui entrare». Per gli inviti ai
-- musicisti non era vero. Il browser calcolava lo sha-256 del token e `orc_musician_invite_claim` riceveva
-- direttamente l'IMPRONTA, confrontandola con `token_hash`: chi leggeva quella colonna poteva rivendicare
-- l'invito senza aver mai visto il link. Oggi la leggono solo lo staff della stessa organizzazione (che
-- gli inviti li crea comunque) e il service_role, quindi niente escalation — ma la promessa del commento
-- non era mantenuta, e le convocazioni (0046) la mantengono: lì l'impronta la calcola il server.
-- Ora arriva il token in chiaro e l'impronta la calcola il database. Token e impronta hanno la stessa
-- forma (64 esadecimali): chi passa l'impronta letta dalla tabella se la vede ricalcolare, e non entra.
--
-- Il parametro cambia nome (hash → token) e PostgREST sceglie la funzione per nome del parametro:
-- serve DROP + CREATE. Il DROP azzera i permessi — revoke e grant sono subito sotto.
drop function if exists public.orc_musician_invite_claim(text);

create function public.orc_musician_invite_claim(token text)
returns table (org_id uuid, org_name text, ok boolean, motivo text)
language plpgsql security definer set search_path = public, extensions as $$
declare inv public.orc_musician_invites; o public.orc_organizations;
begin
  if auth.uid() is null then return query select null::uuid, null::text, false, 'accesso'; return; end if;
  /* la forma del token si controlla prima di calcolare niente: un link storto non tocca la tabella */
  if token is null or token !~ '^[0-9a-f]{64}$' then return query select null::uuid, null::text, false, 'non valido'; return; end if;
  select * into inv from public.orc_musician_invites where token_hash = encode(extensions.digest(token, 'sha256'), 'hex');
  if inv.id is null then return query select null::uuid, null::text, false, 'non valido'; return; end if;
  if inv.status in ('revoked','expired') or inv.expires_at < now() then
    update public.orc_musician_invites set status = 'expired' where id = inv.id and status = 'open' and expires_at < now();
    return query select null::uuid, null::text, false, 'scaduto'; return;
  end if;
  /* già preso da un altro account: l'invito è personale, non si gira ad altri */
  if inv.claimed_by is not null and inv.claimed_by <> auth.uid() then
    return query select null::uuid, null::text, false, 'gia usato'; return;
  end if;
  if inv.claimed_by is null then
    update public.orc_musician_invites set claimed_by = auth.uid(), claimed_at = now(), status = 'claimed' where id = inv.id;
  end if;
  select * into o from public.orc_organizations where id = inv.org_id;
  return query select inv.org_id, o.name, true, ''::text;
end $$;

revoke all on function public.orc_musician_invite_claim(text) from public, anon;
grant execute on function public.orc_musician_invite_claim(text) to authenticated, service_role;

-- ─────────────────────────────────── 2. Le tabelle del solo server non si danno all'anonimo nemmeno in lettura
-- In produzione il progetto porta i grant di default storici: con la chiave pubblica, sette tabelle che
-- servono solo al server rispondevano `200 []` invece di `401`. La RLS le teneva vuote — zero policy —
-- ma era l'unica barriera, e fra loro c'è `orc_invitation_secrets`, dove stanno i token IN CHIARO delle
-- convocazioni. Se una migrazione disattivasse la RLS per sbaglio, uscirebbero.
-- Verificato l'11/09 prima di scrivere questa riga: nessuna è usata dal browser, nessuna policy di altre
-- tabelle le interroga, e ogni funzione che le tocca è `security definer`. Le Edge Function usano la
-- chiave di servizio, che questi revoke non toccano.
revoke all on public.orc_invitation_secrets, public.consultation_payments, public.consultation_payment_lifecycle,
  public.consultation_requests, public.feedback_throttle, public.landing_throttle, public.landing_counters
  from anon, authenticated;
