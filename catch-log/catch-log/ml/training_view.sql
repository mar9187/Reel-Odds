-- Run once in the Supabase SQL Editor. One row per (fishing setup, species caught);
-- setups that caught nothing appear once with species = null and fish = 0.
-- Those zero-catch rows are what let the model learn what does NOT work.
create or replace view training_data with (security_invoker = true) as
select
  su.id  as setup_id,
  t.id   as trip_id,
  t.started_at,
  l.name as location,
  r.name as rig,
  lt.name as lure_type,
  su.lure_color,
  b.name as bait,
  coalesce(su.hours_fished, t.hours_fished) as hours_fished,
  t.air_temp_f, t.water_temp_f, t.pressure_inhg, t.wind_mph,
  t.cloud_cover_pct, t.precipitation, t.moon_phase,
  s.common_name as species,
  count(c.id) as fish
from setups su
join trips t       on t.id = su.trip_id
join locations l   on l.id = t.location_id
left join rigs r        on r.id = su.rig_id
left join lure_types lt on lt.id = su.lure_type_id
left join baits b       on b.id = su.bait_id
left join catches c     on c.setup_id = su.id
left join species s     on s.id = c.species_id
group by su.id, t.id, l.id, r.id, lt.id, b.id, s.id;

-- Then run:  select * from training_data;
-- and use "Download CSV" on the results to get training_data.csv.
