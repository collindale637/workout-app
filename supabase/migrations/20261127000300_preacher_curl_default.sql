-- A preacher curl written without gear now means the dumbbell version: "Preacher Curl" moves from Barbell Preacher Curl
-- to Dumbbell Preacher Curl as an alternate name (the barbell one gains "EZ-Bar Preacher Curl"). Data only, safe to re-run.
-- Ids stay the same, so plans and logged history are untouched; only names, new rows and tags change.
-- 2 exercises: One_Arm_Dumbbell_Preacher_Curl, Preacher_Curl

insert into public.exercises (id, name, aliases, category, movement_pattern, mechanic, force, level, instructions, images, is_common, is_active, source) values
  ('One_Arm_Dumbbell_Preacher_Curl', 'Dumbbell Preacher Curl', array['One Arm Dumbbell Preacher Curl', 'Preacher Curl']::text[], 'strength', 'isolation', 'isolation', 'pull', 'beginner', array['Grab a dumbbell with the right arm and place the upper arm on top of the preacher bench or the incline bench. The dumbbell should be held at shoulder length. This will be your starting position.', 'As you breathe in, slowly lower the dumbbell until your upper arm is extended and the biceps is fully stretched.', 'As you exhale, use the biceps to curl the weight up until your biceps is fully contracted and the dumbbell is at shoulder height. Again, remember that to ensure full contraction you need to bring that small finger higher than the thumb.', 'Squeeze the biceps hard for a second at the contracted position and repeat for the recommended amount of repetitions.', 'Switch arms and repeat the movement.']::text[], array['One_Arm_Dumbbell_Preacher_Curl/0.jpg', 'One_Arm_Dumbbell_Preacher_Curl/1.jpg']::text[], true, true, 'free-exercise-db'),
  ('Preacher_Curl', 'Barbell Preacher Curl', array['EZ-Bar Preacher Curl', 'EZ Bar Preacher Curl']::text[], 'strength', 'isolation', 'isolation', 'pull', 'beginner', array['To perform this movement you will need a preacher bench and an E-Z bar. Grab the E-Z curl bar at the close inner handle (either have someone hand you the bar which is preferable or grab the bar from the front bar rest provided by most preacher benches). The palm of your hands should be facing forward and they should be slightly tilted inwards due to the shape of the bar.', 'With the upper arms positioned against the preacher bench pad and the chest against it, hold the E-Z Curl Bar at shoulder length. This will be your starting position.', 'As you breathe in, slowly lower the bar until your upper arm is extended and the biceps is fully stretched.', 'As you exhale, use the biceps to curl the weight up until your biceps is fully contracted and the bar is at shoulder height. Squeeze the biceps hard and hold this position for a second.', 'Repeat for the recommended amount of repetitions.']::text[], array['Preacher_Curl/0.jpg', 'Preacher_Curl/1.jpg']::text[], true, true, 'free-exercise-db')
on conflict (id) do update set name = excluded.name, aliases = excluded.aliases, category = excluded.category,
  movement_pattern = excluded.movement_pattern, mechanic = excluded.mechanic, force = excluded.force, level = excluded.level,
  instructions = excluded.instructions, images = excluded.images, is_common = excluded.is_common,
  is_active = excluded.is_active, source = excluded.source;

delete from public.exercise_muscles where exercise_id in ('One_Arm_Dumbbell_Preacher_Curl', 'Preacher_Curl');
delete from public.exercise_equipment where exercise_id in ('One_Arm_Dumbbell_Preacher_Curl', 'Preacher_Curl');

insert into public.exercise_muscles (exercise_id, muscle_id, role) values
  ('One_Arm_Dumbbell_Preacher_Curl', 'biceps', 'primary'),
  ('Preacher_Curl', 'biceps', 'primary');

insert into public.exercise_equipment (exercise_id, option_group, equipment_id) values
  ('One_Arm_Dumbbell_Preacher_Curl', 1, 'dumbbells'),
  ('One_Arm_Dumbbell_Preacher_Curl', 2, 'preacher_bench'),
  ('One_Arm_Dumbbell_Preacher_Curl', 2, 'adjustable_bench'),
  ('Preacher_Curl', 1, 'barbell'),
  ('Preacher_Curl', 2, 'preacher_bench'),
  ('Preacher_Curl', 2, 'adjustable_bench');
