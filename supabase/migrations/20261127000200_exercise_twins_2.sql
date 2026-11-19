-- Exercise library: the remaining barbell / dumbbell twins (Dumbbell Front Squat, Push Press, Sumo Deadlift, Glute Bridge,
-- Preacher Curl, Barbell Overhead Triceps Extension). Mirrors scripts/catalog-data.mjs. Data only, safe to re-run.
-- Ids stay the same, so plans and logged history are untouched; only names, new rows and tags change.
-- 7 exercises: One_Arm_Dumbbell_Preacher_Curl, Preacher_Curl, Standing_Overhead_Barbell_Triceps_Extension, Dumbbell_Front_Squat, Dumbbell_Push_Press, Dumbbell_Sumo_Deadlift, Dumbbell_Glute_Bridge

insert into public.exercises (id, name, aliases, category, movement_pattern, mechanic, force, level, instructions, images, is_common, is_active, source) values
  ('One_Arm_Dumbbell_Preacher_Curl', 'Dumbbell Preacher Curl', array['One Arm Dumbbell Preacher Curl']::text[], 'strength', 'isolation', 'isolation', 'pull', 'beginner', array['Grab a dumbbell with the right arm and place the upper arm on top of the preacher bench or the incline bench. The dumbbell should be held at shoulder length. This will be your starting position.', 'As you breathe in, slowly lower the dumbbell until your upper arm is extended and the biceps is fully stretched.', 'As you exhale, use the biceps to curl the weight up until your biceps is fully contracted and the dumbbell is at shoulder height. Again, remember that to ensure full contraction you need to bring that small finger higher than the thumb.', 'Squeeze the biceps hard for a second at the contracted position and repeat for the recommended amount of repetitions.', 'Switch arms and repeat the movement.']::text[], array['One_Arm_Dumbbell_Preacher_Curl/0.jpg', 'One_Arm_Dumbbell_Preacher_Curl/1.jpg']::text[], true, true, 'free-exercise-db'),
  ('Preacher_Curl', 'Barbell Preacher Curl', array['Preacher Curl']::text[], 'strength', 'isolation', 'isolation', 'pull', 'beginner', array['To perform this movement you will need a preacher bench and an E-Z bar. Grab the E-Z curl bar at the close inner handle (either have someone hand you the bar which is preferable or grab the bar from the front bar rest provided by most preacher benches). The palm of your hands should be facing forward and they should be slightly tilted inwards due to the shape of the bar.', 'With the upper arms positioned against the preacher bench pad and the chest against it, hold the E-Z Curl Bar at shoulder length. This will be your starting position.', 'As you breathe in, slowly lower the bar until your upper arm is extended and the biceps is fully stretched.', 'As you exhale, use the biceps to curl the weight up until your biceps is fully contracted and the bar is at shoulder height. Squeeze the biceps hard and hold this position for a second.', 'Repeat for the recommended amount of repetitions.']::text[], array['Preacher_Curl/0.jpg', 'Preacher_Curl/1.jpg']::text[], true, true, 'free-exercise-db'),
  ('Standing_Overhead_Barbell_Triceps_Extension', 'Barbell Overhead Triceps Extension', array['Standing Overhead Barbell Triceps Extension']::text[], 'strength', 'isolation', 'isolation', 'push', 'beginner', array['To begin, stand up holding a barbell or e-z bar using a pronated grip (palms facing forward) with your hands closer than shoulder width apart from each other. Your feet should be about shoulder width apart.', 'Now elevate the barbell above your head until your arms are fully extended. Keep your elbows in. This will be your starting position.', 'Keeping your upper arms close to your head and elbows in, perpendicular to the floor, lower the resistance in a semicircular motion behind your head until your forearms touch your biceps. Tip: The upper arms should remain stationary and only the forearms should move. Breathe in as you perform this step.', 'Go back to the starting position by using the triceps to raise the barbell. Breathe out as you perform this step.', 'Repeat for the recommended amount of repetitions.']::text[], array['Standing_Overhead_Barbell_Triceps_Extension/0.jpg', 'Standing_Overhead_Barbell_Triceps_Extension/1.jpg']::text[], true, true, 'free-exercise-db'),
  ('Dumbbell_Front_Squat', 'Dumbbell Front Squat', '{}'::text[], 'strength', 'squat', 'compound', 'push', 'beginner', array['Hold a dumbbell in each hand at shoulder height, palms facing in, elbows pointing forward.', 'Squat down with your chest up and elbows high until your thighs are about parallel.', 'Drive through your whole foot to stand back up.']::text[], '{}'::text[], true, true, 'catalog'),
  ('Dumbbell_Push_Press', 'Dumbbell Push Press', '{}'::text[], 'strength', 'vertical_push', 'compound', 'push', 'intermediate', array['Hold a dumbbell at each shoulder, palms facing in or forward, feet shoulder-width apart.', 'Dip a few inches by bending your knees, then drive up through your legs and press the weights overhead in one motion.', 'Lower back to your shoulders with control and reset before the next rep.']::text[], '{}'::text[], true, true, 'catalog'),
  ('Dumbbell_Sumo_Deadlift', 'Dumbbell Sumo Deadlift', '{}'::text[], 'strength', 'hinge', 'compound', 'pull', 'beginner', array['Stand with feet wider than your shoulders, toes turned out, one heavy dumbbell hanging between your legs held with both hands.', 'Push your hips back and bend your knees to lower the weight with a flat back and chest up.', 'Drive through your feet and squeeze your glutes to stand tall.']::text[], '{}'::text[], true, true, 'catalog'),
  ('Dumbbell_Glute_Bridge', 'Dumbbell Glute Bridge', '{}'::text[], 'strength', 'hinge', 'compound', 'push', 'beginner', array['Lie on your back with knees bent and feet flat, a dumbbell resting across your hips.', 'Drive your hips up until your body is straight from shoulders to knees and squeeze your glutes.', 'Lower until your hips just touch the floor and repeat.']::text[], '{}'::text[], true, true, 'catalog')
on conflict (id) do update set name = excluded.name, aliases = excluded.aliases, category = excluded.category,
  movement_pattern = excluded.movement_pattern, mechanic = excluded.mechanic, force = excluded.force, level = excluded.level,
  instructions = excluded.instructions, images = excluded.images, is_common = excluded.is_common,
  is_active = excluded.is_active, source = excluded.source;

delete from public.exercise_muscles where exercise_id in ('One_Arm_Dumbbell_Preacher_Curl', 'Preacher_Curl', 'Standing_Overhead_Barbell_Triceps_Extension', 'Dumbbell_Front_Squat', 'Dumbbell_Push_Press', 'Dumbbell_Sumo_Deadlift', 'Dumbbell_Glute_Bridge');
delete from public.exercise_equipment where exercise_id in ('One_Arm_Dumbbell_Preacher_Curl', 'Preacher_Curl', 'Standing_Overhead_Barbell_Triceps_Extension', 'Dumbbell_Front_Squat', 'Dumbbell_Push_Press', 'Dumbbell_Sumo_Deadlift', 'Dumbbell_Glute_Bridge');

insert into public.exercise_muscles (exercise_id, muscle_id, role) values
  ('One_Arm_Dumbbell_Preacher_Curl', 'biceps', 'primary'),
  ('Preacher_Curl', 'biceps', 'primary'),
  ('Standing_Overhead_Barbell_Triceps_Extension', 'triceps', 'primary'),
  ('Standing_Overhead_Barbell_Triceps_Extension', 'front_delts', 'secondary'),
  ('Dumbbell_Front_Squat', 'quads', 'primary'),
  ('Dumbbell_Front_Squat', 'glutes', 'secondary'),
  ('Dumbbell_Front_Squat', 'adductors', 'secondary'),
  ('Dumbbell_Front_Squat', 'abs', 'secondary'),
  ('Dumbbell_Push_Press', 'front_delts', 'primary'),
  ('Dumbbell_Push_Press', 'side_delts', 'secondary'),
  ('Dumbbell_Push_Press', 'triceps', 'secondary'),
  ('Dumbbell_Push_Press', 'quads', 'secondary'),
  ('Dumbbell_Sumo_Deadlift', 'glutes', 'primary'),
  ('Dumbbell_Sumo_Deadlift', 'hamstrings', 'primary'),
  ('Dumbbell_Sumo_Deadlift', 'adductors', 'primary'),
  ('Dumbbell_Sumo_Deadlift', 'quads', 'secondary'),
  ('Dumbbell_Sumo_Deadlift', 'lower_back', 'secondary'),
  ('Dumbbell_Sumo_Deadlift', 'traps', 'secondary'),
  ('Dumbbell_Sumo_Deadlift', 'forearms', 'secondary'),
  ('Dumbbell_Glute_Bridge', 'glutes', 'primary'),
  ('Dumbbell_Glute_Bridge', 'hamstrings', 'secondary');

insert into public.exercise_equipment (exercise_id, option_group, equipment_id) values
  ('One_Arm_Dumbbell_Preacher_Curl', 1, 'dumbbells'),
  ('One_Arm_Dumbbell_Preacher_Curl', 2, 'preacher_bench'),
  ('One_Arm_Dumbbell_Preacher_Curl', 2, 'adjustable_bench'),
  ('Preacher_Curl', 1, 'barbell'),
  ('Preacher_Curl', 2, 'preacher_bench'),
  ('Preacher_Curl', 2, 'adjustable_bench'),
  ('Standing_Overhead_Barbell_Triceps_Extension', 1, 'barbell'),
  ('Dumbbell_Front_Squat', 1, 'dumbbells'),
  ('Dumbbell_Push_Press', 1, 'dumbbells'),
  ('Dumbbell_Sumo_Deadlift', 1, 'dumbbells'),
  ('Dumbbell_Sumo_Deadlift', 1, 'kettlebells'),
  ('Dumbbell_Glute_Bridge', 1, 'dumbbells'),
  ('Dumbbell_Glute_Bridge', 1, 'kettlebells'),
  ('Dumbbell_Glute_Bridge', 1, 'weight_plates');
