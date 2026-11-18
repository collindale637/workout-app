-- Hide the strongman "Crucifix" hold from the exercise list (it's a static dumbbell/plate hold, not a normal lift).
-- Data only, safe to re-run. Past workouts that used it keep working: the row stays, just inactive.
update public.exercises set is_active = false where id = 'Crucifix';
