-- 0015 — Equipment Intelligence: DB prodotti globale (Deliverable B, docs/product-audit/equipment-intelligence/)
-- Elementi StagePlot = oggetti tecnici con dati verificati e provenienza (SourcedValue nel jsonb `data`).
-- DB GLOBALE curato dal team: lettura pubblica, scrittura SOLO service_role (nessuna policy di write).
-- Non tocca nessuna tabella esistente; i dati utente restano nel blob di stageplot_projects (modelId/override).
-- Nei metadati e nel jsonb ci sono SOLO dati + citazioni (doc/pagina), MAI i PDF (vincolo copyright, Deliverable C7).

-- Documenti dell'archivio (dal _MANIFEST). Metadati, non i PDF.
create table if not exists equip_document (
  id text primary key,                       -- slug: 'shure-sm57-guide'
  brand text, model_or_family text, category text, doc_type text,
  language text default 'en', title text, revision text, pub_date date,
  official_url text, filename text, sha256 text unique, pages int,
  product_status text default 'unknown',     -- current|previous|discontinued|unknown
  source_quality text, usage_rights text,
  created_at timestamptz default now()
);

-- Prodotti (oggetto tecnico). data jsonb = albero SourcedValue (valore+unità+reliability+source per campo).
create table if not exists equip_product (
  id text primary key,                       -- slug: 'shure-sm57'
  brand text not null, manufacturer text, model text not null, variant text,
  gen_year text, category text not null, subcategory text, short_desc text,
  commercial_status text default 'current',
  product_code text, icon_key text,          -- chiave LIB_ICONS (icons.js)
  primary_source_doc text references equip_document(id),
  variant_of text references equip_product(id),
  data jsonb not null default '{}',
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists equip_product_cat_idx   on equip_product(category);
create index if not exists equip_product_brand_idx on equip_product(brand);
create index if not exists equip_product_data_gin  on equip_product using gin (data);

-- M:N prodotto ↔ documento (un doc copre più modelli)
create table if not exists equip_product_document (
  product_id  text references equip_product(id)  on delete cascade,
  document_id text references equip_document(id) on delete cascade,
  primary key (product_id, document_id)
);

-- Connessioni normalizzate (per compatibilità/patch)
create table if not exists equip_connection (
  id bigserial primary key,
  product_id text references equip_product(id) on delete cascade,
  type text, qty int, dir text, domain text, level text, gender text,
  balanced boolean, protocol text, channels int, max_length_m numeric,
  cable_type text, power_over_cable boolean
);
create index if not exists equip_connection_product_idx on equip_connection(product_id);

-- Regole di compatibilità (dichiarative)
create table if not exists equip_compat_rule (
  id bigserial primary key,
  a_selector jsonb, b_selector jsonb,
  check_kind text,                           -- connector|protocol|sample_rate|phantom|power|max_devices
  result text,                               -- ok|needs_adapter|incompatible
  why text, source_doc text references equip_document(id)
);

-- Accessori (M:N con relazione)
create table if not exists equip_accessory (
  product_id   text references equip_product(id) on delete cascade,
  accessory_id text references equip_product(id) on delete cascade,
  relation text,                             -- requires|optional|affects_footprint
  primary key (product_id, accessory_id)
);

-- RLS: lettura pubblica, nessuna scrittura client (solo service_role, che bypassa RLS)
alter table equip_document         enable row level security;
alter table equip_product          enable row level security;
alter table equip_product_document enable row level security;
alter table equip_connection       enable row level security;
alter table equip_compat_rule      enable row level security;
alter table equip_accessory        enable row level security;

drop policy if exists equip_doc_read  on equip_document;
drop policy if exists equip_prod_read on equip_product;
drop policy if exists equip_pd_read   on equip_product_document;
drop policy if exists equip_conn_read on equip_connection;
drop policy if exists equip_rule_read on equip_compat_rule;
drop policy if exists equip_acc_read  on equip_accessory;

create policy equip_doc_read  on equip_document          for select using (true);
create policy equip_prod_read on equip_product           for select using (true);
create policy equip_pd_read   on equip_product_document  for select using (true);
create policy equip_conn_read on equip_connection        for select using (true);
create policy equip_rule_read on equip_compat_rule       for select using (true);
create policy equip_acc_read  on equip_accessory         for select using (true);
