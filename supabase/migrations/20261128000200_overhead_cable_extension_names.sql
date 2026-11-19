-- "Overhead Cable Tricep Extension" (and similar ways of writing it) now match Overhead Cable Extension, the rope overhead
-- triceps extension on a low pulley. Names only; mirrors scripts/catalog-data.mjs. Data only, safe to re-run.
-- Ids stay the same, so plans and logged history are untouched.
-- 1 exercise: Triceps_Overhead_Extension_with_Rope

update public.exercises
set aliases = array['Triceps Overhead Extension with Rope', 'Overhead Cable Tricep Extension', 'Overhead Cable Triceps Extension', 'Cable Overhead Tricep Extension', 'Cable Overhead Triceps Extension', 'Overhead Rope Tricep Extension']::text[]
where id = 'Triceps_Overhead_Extension_with_Rope';
