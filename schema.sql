-- Fishing catch log schema (Postgres / Supabase)
-- Run in the Supabase SQL Editor.

------------------------------------------------------------
-- Reference tables (shared lookup data, small integer keys)
------------------------------------------------------------
create table species (
  id              bigint generated always as identity primary key,
  common_name     text not null unique,          -- 'Largemouth bass'
  scientific_name text,                          -- 'Micropterus salmoides'
  family          text,                          -- 'Centrarchidae'
  fish_group      text not null                  -- your own angler grouping: catfish, bass, sunfish...
);

create table lure_types (
  id   bigint generated always as identity primary key,
  name text not null unique
);

create table baits (
  id   bigint generated always as identity primary key,
  name text not null unique
);

create table rigs (
  id   bigint generated always as identity primary key,
  name text not null unique
);

------------------------------------------------------------
-- User-owned tables (uuid keys, one owner per row)
------------------------------------------------------------
create table locations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  water_type text check (water_type in ('lake','river','pond','creek','reservoir','other')),
  latitude   double precision,
  longitude  double precision,
  unique (user_id, name)
);

-- One row per outing, including outings where you caught nothing.
create table trips (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  location_id    uuid not null references locations on delete restrict,
  started_at     timestamptz not null,
  hours_fished   numeric(4,2) check (hours_fished > 0),
  air_temp_f     numeric(4,1),
  water_temp_f   numeric(4,1),
  pressure_inhg  numeric(4,2),
  wind_mph       numeric(4,1),
  cloud_cover_pct smallint check (cloud_cover_pct between 0 and 100),
  precipitation  text check (precipitation in ('none','drizzle','rain','storm')),
  moon_phase     numeric(3,2) check (moon_phase between 0 and 1),  -- 0 new, 0.5 full
  notes          text
);

-- What you were fishing with during part of a trip, caught anything or not.
-- This is what makes bait/lure/rig success rates computable.
create table setups (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  trip_id       uuid not null references trips on delete cascade,
  rig_id        bigint references rigs,
  lure_type_id  bigint references lure_types,
  lure_color    text,
  bait_id       bigint references baits,
  hours_fished  numeric(4,2) check (hours_fished > 0)
);

create table catches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  trip_id    uuid not null references trips on delete cascade,
  setup_id   uuid references setups on delete set null,
  species_id bigint not null references species,
  caught_at  timestamptz not null default now(),
  length_in  numeric(4,1) check (length_in > 0),
  weight_lb  numeric(5,2) check (weight_lb > 0),
  released   boolean not null default true,
  notes      text
);

create index on trips (user_id, started_at);
create index on trips (location_id);
create index on setups (trip_id);
create index on catches (trip_id);
create index on catches (species_id);
create index on catches (user_id, caught_at);

------------------------------------------------------------
-- Row-level security
------------------------------------------------------------
alter table species    enable row level security;
alter table lure_types enable row level security;
alter table baits      enable row level security;
alter table rigs       enable row level security;

create policy "read species"  on species    for select using (true);
create policy "read lures"    on lure_types  for select using (true);
create policy "read baits"    on baits       for select using (true);
create policy "read rigs"     on rigs        for select using (true);
create policy "add lures"     on lure_types  for insert to authenticated with check (true);
create policy "add baits"     on baits       for insert to authenticated with check (true);
create policy "add rigs"      on rigs        for insert to authenticated with check (true);

alter table locations enable row level security;
alter table trips     enable row level security;
alter table setups    enable row level security;
alter table catches   enable row level security;

create policy "own locations" on locations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own trips" on trips for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own setups" on setups for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own catches" on catches for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

------------------------------------------------------------
-- Seed data
------------------------------------------------------------
insert into species (common_name, scientific_name, family, fish_group) values
  ('Blue catfish',        'Ictalurus furcatus',         'Ictaluridae',    'catfish'),
  ('Channel catfish',     'Ictalurus punctatus',        'Ictaluridae',    'catfish'),
  ('Flathead catfish',    'Pylodictis olivaris',        'Ictaluridae',    'catfish'),
  ('Largemouth bass',     'Micropterus salmoides',      'Centrarchidae',  'bass'),
  ('Smallmouth bass',     'Micropterus dolomieu',       'Centrarchidae',  'bass'),
  ('Spotted bass',        'Micropterus punctulatus',    'Centrarchidae',  'bass'),
  ('Bluegill',            'Lepomis macrochirus',        'Centrarchidae',  'sunfish'),
  ('Redear sunfish',      'Lepomis microlophus',        'Centrarchidae',  'sunfish'),
  ('Green sunfish',       'Lepomis cyanellus',          'Centrarchidae',  'sunfish'),
  ('White crappie',       'Pomoxis annularis',          'Centrarchidae',  'crappie'),
  ('Black crappie',       'Pomoxis nigromaculatus',     'Centrarchidae',  'crappie'),
  ('White bass',          'Morone chrysops',            'Moronidae',      'striped bass'),
  ('Striped bass',        'Morone saxatilis',           'Moronidae',      'striped bass'),
  ('Hybrid striped bass', 'Morone chrysops x saxatilis','Moronidae',      'striped bass'),
  ('Common carp',         'Cyprinus carpio',            'Cyprinidae',     'carp'),
  ('Freshwater drum',     'Aplodinotus grunniens',      'Sciaenidae',     'drum'),
  ('Longnose gar',        'Lepisosteus osseus',         'Lepisosteidae',  'gar'),
  ('Alligator gar',       'Atractosteus spatula',       'Lepisosteidae',  'gar');

insert into lure_types (name) values
  ('Jig'), ('Crankbait'), ('Spinnerbait'), ('Soft plastic worm'), ('Swimbait'),
  ('Topwater'), ('Spoon'), ('Inline spinner'), ('Jerkbait'), ('Other');

insert into baits (name) values
  ('Fresh cut shad'), ('Frozen cut shad'), ('Live minnow'), ('Nightcrawler'),
  ('Cut bluegill'), ('Chicken liver'), ('Stinkbait'), ('Shrimp');

insert into rigs (name) values
  ('Texas rig'), ('Carolina rig'), ('Kentucky rig'), ('Drop shot'), ('Ned rig'),
  ('Wacky rig'), ('Split shot'), ('Slip bobber'), ('Free line'), ('Jigging'), ('Other');

------------------------------------------------------------
-- Views (security_invoker makes RLS apply to the caller)
------------------------------------------------------------
-- Flat table for the history page; filter by location, species, etc.
create view catch_history with (security_invoker = true) as
select
  c.id, c.caught_at, c.length_in, c.weight_lb, c.released,
  s.common_name as species, s.fish_group, s.scientific_name,
  l.name as location,
  r.name as rig, lt.name as lure_type, su.lure_color, b.name as bait,
  t.air_temp_f, t.water_temp_f, t.pressure_inhg, t.wind_mph,
  t.cloud_cover_pct, t.precipitation, t.moon_phase
from catches c
join species s   on s.id = c.species_id
join trips t     on t.id = c.trip_id
join locations l on l.id = t.location_id
left join setups su      on su.id = c.setup_id
left join rigs r         on r.id = su.rig_id
left join lure_types lt  on lt.id = su.lure_type_id
left join baits b        on b.id = su.bait_id;

create view catches_by_month with (security_invoker = true) as
select date_trunc('month', c.caught_at)::date as month,
       s.common_name as species, count(*) as fish
from catches c join species s on s.id = c.species_id
group by 1, 2;

create view avg_length_by_species with (security_invoker = true) as
select s.common_name as species, count(*) as fish,
       round(avg(c.length_in), 1) as avg_length_in,
       max(c.length_in) as max_length_in
from catches c join species s on s.id = c.species_id
where c.length_in is not null
group by s.common_name;
