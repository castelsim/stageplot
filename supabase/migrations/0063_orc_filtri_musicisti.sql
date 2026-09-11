-- I filtri dell'elenco musicisti: genere, lettura a prima vista, esperienza, zona, tag.
--
-- L'elenco filtrava per famiglia e stato, più una ricerca libera su nome, strumento, città e tag. Per
-- trovare «un violino che legge bene a prima vista, ha fatto pop, sta in provincia di Vicenza» servivano
-- i dati che la lista non restituiva. `orc_musicians_list` è quella di 0043 (testo vivo, invariato da
-- allora) con qualche colonna in più:
--   · area, auto, trasferte e tournée — la zona e la mobilità;
--   · genres — quelli che il musicista ha dichiarato nel suo profilo UNITI a quelli del repertorio in
--     scheda. I primi finora non arrivavano allo staff: `orc_application_accept` copia letture ed
--     esperienze nelle competenze, ma i generi del profilo no. Qui si leggono dal profilo collegato, così
--     restano aggiornati se il musicista li cambia;
--   · reading — il livello di lettura a prima vista (0-3), dalle competenze;
--   · experiences — i codici delle esperienze (esp_*) con livello > 0.
--
-- Cambia il tipo restituito, quindi si ricrea: stesso nome, stessi permessi, stessa regola (solo lo staff
-- dell'organizzazione vede qualcosa).

drop function if exists public.orc_musicians_list(uuid);

create function public.orc_musicians_list(org uuid)
returns table (id uuid, first_name text, last_name text, email text, phone text, city text, province text, area text, status text,
  primary_instrument text, primary_family text, instruments text[], tags text[], genres text[], reading integer, experiences text[],
  has_car boolean, travel_ok boolean, tour_ok boolean, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.first_name, m.last_name, m.email, m.phone, m.city, m.province, coalesce(m.area, ''), m.status,
    (select i.name from public.orc_musician_instruments mi join public.orc_instruments i on i.code = mi.instrument_code
       where mi.musician_id = m.id order by mi.is_primary desc, i.sort limit 1),
    (select i.family from public.orc_musician_instruments mi join public.orc_instruments i on i.code = mi.instrument_code
       where mi.musician_id = m.id order by mi.is_primary desc, i.sort limit 1),
    coalesce((select array_agg(i.name order by mi.is_primary desc, i.sort) from public.orc_musician_instruments mi
       join public.orc_instruments i on i.code = mi.instrument_code where mi.musician_id = m.id), '{}'),
    coalesce((select array_agg(t.tag order by t.tag) from public.orc_musician_tags t where t.musician_id = m.id), '{}'),
    coalesce((select array_agg(distinct g.nome order by g.nome) from (
        select lower(trim(x)) as nome from public.orc_musician_profiles pr, unnest(pr.genres) as x where pr.id = m.profile_id
        union
        select lower(trim(r.name)) from public.orc_musician_repertoire mr join public.orc_repertoire r on r.id = mr.repertoire_id
          where mr.musician_id = m.id and r.kind = 'genre'
      ) g where g.nome <> ''), '{}'),
    coalesce((select max(s.level) from public.orc_musician_skills s where s.musician_id = m.id and s.skill_code = 'lettura_prima_vista'), 0)::integer,
    coalesce((select array_agg(s.skill_code order by s.skill_code) from public.orc_musician_skills s
       where s.musician_id = m.id and s.skill_code like 'esp\_%' and s.level > 0), '{}'),
    m.has_car, m.travel_ok, m.tour_ok,
    m.updated_at
  from public.orc_musicians m
  where m.org_id = org and m.deleted_at is null and public.orc_is_staff(org)
  order by m.last_name, m.first_name
$$;

revoke all on function public.orc_musicians_list(uuid) from public, anon;
grant execute on function public.orc_musicians_list(uuid) to authenticated, service_role;
