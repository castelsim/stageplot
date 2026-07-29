-- equip-seed-luci.sql — fari teatrali (categoria 'faro'). Idempotente (upsert).
-- Eseguire nel SQL editor Supabase DOPO la 0015.
--
-- PROVENIENZA (29/07/2026): i dati di questo primo record vengono dalla TARGHETTA dell'apparecchio,
-- letta dall'utente — non da un documento ufficiale del produttore. Perciò reliability='declared'
-- e source=null con la nota che dice da dove arriva: la regola del DB è «niente dato senza fonte,
-- null = non disponibile, mai inventato».
-- Dimensioni e peso NON sono dichiarati: non risultano dalla targhetta e non si inventano.
-- Quando si trova la scheda tecnica Proel, aggiungere il record equip_document e rialzare
-- reliability a 'official' citando pagina e frase.
begin;

insert into equip_product (id, brand, manufacturer, model, category, subcategory, short_desc, commercial_status, product_code, data)
values (
  'proel-plft50pcn', 'Proel', 'Proel S.p.A.', 'PLFT50PCN', 'faro', 'pc',
  'Proiettore teatrale PC alogeno 300/500 W, corpo nero, dimmerabile da dimmer esterno.',
  'current', 'PLFT50PCN',
  $eq${
    "id":"proel-plft50pcn","brand":"Proel","model":"PLFT50PCN","category":"faro",
    "nameplate":{"value":"Theatre Projector 300/500","unit_orig":null,"reliability":"declared","source":null,
      "note":"Dicitura riportata sulla targhetta dell'apparecchio (utente, 29/07/2026)."},
    "fixture_type":{"value":"pc","unit_orig":null,"reliability":"declared","source":null,
      "note":"Proiettore teatrale a lente piano-convessa (PC)."},
    "lamp_type":{"value":"halogen","unit_orig":null,"reliability":"declared","source":null,
      "note":"Lampada alogena; il tipo di zoccolo non è dichiarato in targhetta."},
    "watt":{"value":500,"unit_orig":"W","reliability":"declared","source":null,
      "note":"Potenza massima 500 W. La targhetta indica lampada 300/500 W: con lampada da 300 W il carico è 300 W."},
    "watt_options":{"value":[300,500],"unit_orig":"W","reliability":"declared","source":null,
      "note":"Le due lampade previste dalla targhetta."},
    "voltage":{"value":230,"unit_orig":"V","reliability":"declared","source":null,"note":"Alimentazione 230 V."},
    "ip_rating":{"value":"IP20","unit_orig":null,"reliability":"declared","source":null,
      "note":"Solo uso interno e al riparo: IP20 non protegge dall'acqua."},
    "color":{"value":"nero","unit_orig":null,"reliability":"declared","source":null},
    "control":{"value":"dimmer_esterno","unit_orig":null,"reliability":"declared","source":null,
      "note":"Nessun controllo DMX a bordo: l'apparecchio si regola alimentandolo da un dimmer esterno. L'eventuale indirizzo DMX appartiene al dimmer, non al faro."},
    "dmx":{"value":false,"unit_orig":null,"reliability":"declared","source":null},
    "weight_g":{"value":null,"unit_orig":null,"reliability":"declared","source":null,
      "note":"Non dichiarato: assente dalla targhetta, non stimato."},
    "dimensions_mm":{"value":null,"unit_orig":null,"reliability":"declared","source":null,
      "note":"Non dichiarate: assenti dalla targhetta, non stimate. L'ingombro usato sul disegno è quello TIPICO di un PC 500 W, non quello di questo modello."}
  }$eq$::jsonb
)
on conflict (id) do update set
  brand=excluded.brand, manufacturer=excluded.manufacturer, model=excluded.model,
  category=excluded.category, subcategory=excluded.subcategory, short_desc=excluded.short_desc,
  commercial_status=excluded.commercial_status, product_code=excluded.product_code,
  data=excluded.data, updated_at=now();

commit;
