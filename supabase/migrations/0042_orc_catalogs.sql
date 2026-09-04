-- 0042_orc_catalogs.sql — Orchestre: cataloghi globali di strumenti e competenze.
--
-- Globali (nessuna org): sono vocabolario, non dati. Leggibili da chi è autenticato, scritti solo
-- da migrazione. stageplot_types = chiavi TYPES dell'editor che corrispondono allo strumento:
-- servono all'import delle postazioni (lotto 8). Idempotente.

create table if not exists public.orc_instruments (
  code text primary key,
  name text not null,
  family text not null,
  sort integer not null default 0,
  stageplot_types text[] not null default '{}',
  constraint orc_instruments_family_chk check (family in
    ('archi','legni','ottoni','percussioni','tastiere','corde','voci','direzione','ritmica'))
);
create table if not exists public.orc_skills (
  code text primary key,
  name text not null,
  kind text not null,
  sort integer not null default 0,
  constraint orc_skills_kind_chk check (kind in ('lettura','esecuzione','esperienza'))
);
-- grant espliciti (vedi 0041): solo lettura per chi è autenticato, niente per anon
grant select on public.orc_instruments, public.orc_skills to authenticated;
grant all on public.orc_instruments, public.orc_skills to service_role;
alter table public.orc_instruments enable row level security;
alter table public.orc_skills enable row level security;
drop policy if exists orc_instruments_read on public.orc_instruments;
create policy orc_instruments_read on public.orc_instruments for select to authenticated using (true);
drop policy if exists orc_skills_read on public.orc_skills;
create policy orc_skills_read on public.orc_skills for select to authenticated using (true);

insert into public.orc_instruments (code, name, family, sort, stageplot_types) values
 ('violino','Violino','archi',10,'{vlnpost,vln1x2,vln2x2}'),
 ('viola','Viola','archi',20,'{violapost,violax2}'),
 ('violoncello','Violoncello','archi',30,'{violoncello,cellix2}'),
 ('contrabbasso','Contrabbasso','archi',40,'{contrabbasso,cbx2}'),
 ('arpa','Arpa','archi',50,'{arpa}'),
 ('flauto','Flauto','legni',100,'{flauto}'),
 ('ottavino','Ottavino','legni',105,'{}'),
 ('oboe','Oboe','legni',110,'{oboe}'),
 ('corno_inglese','Corno inglese','legni',115,'{}'),
 ('clarinetto','Clarinetto','legni',120,'{clarinetto}'),
 ('clarinetto_basso','Clarinetto basso','legni',125,'{}'),
 ('fagotto','Fagotto','legni',130,'{fagotto}'),
 ('controfagotto','Controfagotto','legni',135,'{}'),
 ('sax_soprano','Sax soprano','legni',140,'{}'),
 ('sax_alto','Sax alto','legni',141,'{saxalto}'),
 ('sax_tenore','Sax tenore','legni',142,'{saxtenore}'),
 ('sax_baritono','Sax baritono','legni',143,'{saxbaritono}'),
 ('corno','Corno','ottoni',200,'{corno}'),
 ('tromba','Tromba','ottoni',210,'{tromba}'),
 ('trombone','Trombone','ottoni',220,'{trombone}'),
 ('trombone_basso','Trombone basso','ottoni',225,'{musTromboneBasso}'),
 ('tuba','Tuba','ottoni',230,'{tuba}'),
 ('eufonio','Eufonio','ottoni',235,'{}'),
 ('timpani','Timpani','percussioni',300,'{timpani}'),
 ('percussioni','Percussioni','percussioni',310,'{percussioni}'),
 ('batteria','Batteria','percussioni',320,'{batteria,edrums}'),
 ('glockenspiel','Glockenspiel','percussioni',330,'{glockenspiel}'),
 ('xilofono','Xilofono','percussioni',331,'{xilofono}'),
 ('vibrafono','Vibrafono','percussioni',332,'{vibrafono}'),
 ('marimba','Marimba','percussioni',333,'{marimba}'),
 ('pianoforte','Pianoforte','tastiere',400,'{grancoda,mezzacoda,pianoverticale,stagepiano}'),
 ('tastiere','Tastiere','tastiere',410,'{tastiera,doppiatastiera,controllermidi}'),
 ('organo_hammond','Organo Hammond','tastiere',420,'{organohammond,organoconsole}'),
 ('celesta','Celesta','tastiere',430,'{celesta}'),
 ('clavicembalo','Clavicembalo','tastiere',440,'{clavicembalo}'),
 ('fisarmonica','Fisarmonica','tastiere',450,'{musFisarmonica}'),
 ('chitarra_classica','Chitarra classica','corde',500,'{musChitClassica}'),
 ('chitarra_acustica','Chitarra acustica','corde',510,'{gtacustica}'),
 ('chitarra_elettrica','Chitarra elettrica','corde',520,'{gtstand}'),
 ('basso_elettrico','Basso elettrico','corde',530,'{bassstand}'),
 ('mandolino','Mandolino','corde',540,'{}'),
 ('soprano','Soprano','voci',600,'{}'),
 ('mezzosoprano','Mezzosoprano','voci',610,'{}'),
 ('contralto','Contralto','voci',620,'{}'),
 ('tenore','Tenore','voci',630,'{}'),
 ('baritono','Baritono','voci',640,'{}'),
 ('basso_voce','Basso (voce)','voci',650,'{}'),
 ('cantante','Cantante','voci',660,'{cantante}'),
 ('corista','Corista','voci',670,'{corista}'),
 ('direttore','Direttore','direzione',700,'{direttore}'),
 ('maestro_del_coro','Maestro del coro','direzione',710,'{}')
on conflict (code) do nothing;

insert into public.orc_skills (code, name, kind, sort) values
 ('lettura_prima_vista','Lettura a prima vista','lettura',10),
 ('lettura_partitura','Lettura della partitura','lettura',20),
 ('con_direttore','Lavoro con direttore','esecuzione',30),
 ('click','Esecuzione a click','esecuzione',40),
 ('sequenze','Esecuzione con sequenze','esecuzione',50),
 ('in_ear','In-ear monitor','esecuzione',60),
 ('improvvisazione','Improvvisazione','esecuzione',70),
 ('esp_orchestrale','Esperienza orchestrale','esperienza',80),
 ('esp_pop','Esperienza pop','esperienza',90),
 ('esp_live','Esperienza live','esperienza',100),
 ('esp_studio','Esperienza in studio','esperienza',110),
 ('esp_teatro_musical','Esperienza teatrale e musical','esperienza',120)
on conflict (code) do nothing;
