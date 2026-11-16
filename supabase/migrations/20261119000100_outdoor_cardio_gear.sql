-- Batch 1: outdoor cardio needs gear. Additive only, safe to re-run.
-- "Outdoor Bike Ride" and "Skating" used to need no equipment, so every gym could do them and the generator
-- could pick a bike ride for someone without a bike. They now need a bike / skates ticked in the gym's checklist.
-- (Also in scripts/catalog-data.mjs → the generated catalog seed; repeated here for databases that already ran it.)

insert into public.equipment (id, name, category, sort_order, common_at_home) values
  ('bicycle', 'Bike (road / mountain)', 'cardio', 65, false),
  ('skates', 'Skates (inline / roller)', 'cardio', 66, false)
on conflict (id) do update set name = excluded.name, category = excluded.category;

insert into public.exercise_equipment (exercise_id, option_group, equipment_id) values
  ('Bicycling', 1, 'bicycle'),
  ('Skating', 1, 'skates')
on conflict do nothing;
