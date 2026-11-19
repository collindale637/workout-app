-- Exercise library, Nov 28 batch (Collin's imported plans that only matched loosely): EZ-Bar Preacher Curl, Close-Grip
-- EZ-Bar Preacher Curl, Twisting Hanging Knee Raise, Prisoner Squat, Bodyweight Reverse Lunge, Single-Leg Calf Raise and
-- Lying Leg Raise are new; "Cable Tricep Extension(s)" becomes an alternate name for Tricep Pushdown; Barbell Preacher
-- Curl gives up its "EZ-Bar" aliases to the new EZ-bar exercise. Mirrors scripts/catalog-data.mjs. Data only, safe to re-run.
-- Ids stay the same for existing exercises, so plans and logged history are untouched; only names, new rows and tags change.
-- 9 exercises: EZ_Bar_Preacher_Curl, Close_Grip_EZ_Bar_Preacher_Curl, Twisting_Hanging_Knee_Raise, Prisoner_Squat, Bodyweight_Reverse_Lunge, Single_Leg_Calf_Raise, Lying_Leg_Raise, Preacher_Curl, Triceps_Pushdown

insert into public.exercises (id, name, aliases, category, movement_pattern, mechanic, force, level, instructions, images, is_common, is_active, source) values
  ('Preacher_Curl', 'Barbell Preacher Curl', '{}'::text[], 'strength', 'isolation', 'isolation', 'pull', 'beginner', array['To perform this movement you will need a preacher bench and an E-Z bar. Grab the E-Z curl bar at the close inner handle (either have someone hand you the bar which is preferable or grab the bar from the front bar rest provided by most preacher benches). The palm of your hands should be facing forward and they should be slightly tilted inwards due to the shape of the bar.', 'With the upper arms positioned against the preacher bench pad and the chest against it, hold the E-Z Curl Bar at shoulder length. This will be your starting position.', 'As you breathe in, slowly lower the bar until your upper arm is extended and the biceps is fully stretched.', 'As you exhale, use the biceps to curl the weight up until your biceps is fully contracted and the bar is at shoulder height. Squeeze the biceps hard and hold this position for a second.', 'Repeat for the recommended amount of repetitions.']::text[], array['Preacher_Curl/0.jpg', 'Preacher_Curl/1.jpg']::text[], true, true, 'free-exercise-db'),
  ('Triceps_Pushdown', 'Tricep Pushdown', array['Triceps Pushdown', 'Cable Tricep Extension', 'Cable Tricep Extensions', 'Cable Triceps Extension']::text[], 'strength', 'isolation', 'isolation', 'push', 'beginner', array['Attach a straight or angled bar to a high pulley and grab with an overhand grip (palms facing down) at shoulder width.', 'Standing upright with the torso straight and a very small inclination forward, bring the upper arms close to your body and perpendicular to the floor. The forearms should be pointing up towards the pulley as they hold the bar. This is your starting position.', 'Using the triceps, bring the bar down until it touches the front of your thighs and the arms are fully extended perpendicular to the floor. The upper arms should always remain stationary next to your torso and only the forearms should move. Exhale as you perform this movement.', 'After a second hold at the contracted position, bring the bar slowly up to the starting point. Breathe in as you perform this step.', 'Repeat for the recommended amount of repetitions.']::text[], array['Triceps_Pushdown/0.jpg', 'Triceps_Pushdown/1.jpg']::text[], true, true, 'free-exercise-db'),
  ('EZ_Bar_Preacher_Curl', 'EZ-Bar Preacher Curl', array['EZ Bar Preacher Curl', 'EZ Curl Bar Preacher Curl']::text[], 'strength', 'isolation', 'isolation', 'pull', 'beginner', array['Sit at a preacher bench with your chest and the backs of your upper arms against the pad. Hold an EZ bar on the angled inner grips, palms up.', 'Lower the bar slowly until your arms are almost straight and your biceps are stretched.', 'Curl the bar up to shoulder height, squeeze the biceps, and repeat.']::text[], '{}'::text[], true, true, 'catalog'),
  ('Close_Grip_EZ_Bar_Preacher_Curl', 'Close-Grip EZ-Bar Preacher Curl', array['Close Grip Preacher Curl', 'Close-Grip Preacher Curl', 'Close Grip EZ Bar Preacher Curl']::text[], 'strength', 'isolation', 'isolation', 'pull', 'beginner', array['Sit at a preacher bench with your chest and the backs of your upper arms against the pad. Hold an EZ bar on the inner grips, hands close together, palms up.', 'Lower the bar slowly until your arms are almost straight and your biceps are stretched.', 'Curl the bar up to shoulder height without letting your elbows drift off the pad, then repeat.']::text[], '{}'::text[], true, true, 'catalog'),
  ('Twisting_Hanging_Knee_Raise', 'Twisting Hanging Knee Raise', array['Hanging Knee Raise Twist', 'Hanging Oblique Knee Raise', 'Hanging Knee Twist']::text[], 'strength', 'core', 'isolation', 'pull', 'intermediate', array['Hang from a pull-up bar with your arms straight and your legs together.', 'Bend your knees and bring them up toward your chest while twisting your hips so the knees point to one side.', 'Lower slowly with control, then twist to the other side on the next rep. Avoid swinging.']::text[], '{}'::text[], true, true, 'catalog'),
  ('Prisoner_Squat', 'Prisoner Squat', array['Prisoner Squats', 'Hands Behind Head Squat']::text[], 'strength', 'squat', 'compound', 'push', 'beginner', array['Stand with your feet about shoulder width apart and your hands behind your head, elbows wide.', 'Squat down with your chest up until your thighs are about parallel to the floor.', 'Drive through your whole foot to stand back up.']::text[], '{}'::text[], true, true, 'catalog'),
  ('Bodyweight_Reverse_Lunge', 'Bodyweight Reverse Lunge', array['Reverse Lunge', 'Reverse Lunges', 'Reverse Lunge (per leg)']::text[], 'strength', 'lunge', 'compound', 'push', 'beginner', array['Stand tall with your hands on your hips or in front of your chest.', 'Step one foot back and lower until your back knee nearly touches the floor.', 'Drive through the front foot to stand back up. Alternate legs, or finish one side first.']::text[], '{}'::text[], true, true, 'catalog'),
  ('Single_Leg_Calf_Raise', 'Single-Leg Calf Raise', array['Single Leg Calf Raise', 'One-Leg Calf Raise', 'Single-Leg Calf Raise (per leg)']::text[], 'strength', 'isolation', 'isolation', 'push', 'beginner', array['Stand on one foot, ideally with the ball of the foot on a step, and hold a wall or rail for balance.', 'Rise as high as you can onto your toes, then lower slowly until your heel is below the step.', 'Finish all reps, then switch legs.']::text[], '{}'::text[], true, true, 'catalog'),
  ('Lying_Leg_Raise', 'Lying Leg Raise', array['Lying Leg Raises', 'Floor Leg Raise']::text[], 'strength', 'core', 'isolation', 'pull', 'beginner', array['Lie on your back with your legs straight and your hands under your hips or at your sides.', 'Keeping your legs straight, raise them until they point at the ceiling.', 'Lower slowly without letting your lower back arch off the floor, and repeat.']::text[], '{}'::text[], true, true, 'catalog')
on conflict (id) do update set name = excluded.name, aliases = excluded.aliases, category = excluded.category,
  movement_pattern = excluded.movement_pattern, mechanic = excluded.mechanic, force = excluded.force, level = excluded.level,
  instructions = excluded.instructions, images = excluded.images, is_common = excluded.is_common,
  is_active = excluded.is_active, source = excluded.source;

delete from public.exercise_muscles where exercise_id in ('EZ_Bar_Preacher_Curl', 'Close_Grip_EZ_Bar_Preacher_Curl', 'Twisting_Hanging_Knee_Raise', 'Prisoner_Squat', 'Bodyweight_Reverse_Lunge', 'Single_Leg_Calf_Raise', 'Lying_Leg_Raise');
delete from public.exercise_equipment where exercise_id in ('EZ_Bar_Preacher_Curl', 'Close_Grip_EZ_Bar_Preacher_Curl', 'Twisting_Hanging_Knee_Raise', 'Prisoner_Squat', 'Bodyweight_Reverse_Lunge', 'Single_Leg_Calf_Raise', 'Lying_Leg_Raise');

insert into public.exercise_muscles (exercise_id, muscle_id, role) values
  ('EZ_Bar_Preacher_Curl', 'biceps', 'primary'),
  ('EZ_Bar_Preacher_Curl', 'forearms', 'secondary'),
  ('Close_Grip_EZ_Bar_Preacher_Curl', 'biceps', 'primary'),
  ('Close_Grip_EZ_Bar_Preacher_Curl', 'forearms', 'secondary'),
  ('Twisting_Hanging_Knee_Raise', 'abs', 'primary'),
  ('Twisting_Hanging_Knee_Raise', 'obliques', 'primary'),
  ('Twisting_Hanging_Knee_Raise', 'forearms', 'secondary'),
  ('Prisoner_Squat', 'quads', 'primary'),
  ('Prisoner_Squat', 'glutes', 'primary'),
  ('Prisoner_Squat', 'hamstrings', 'secondary'),
  ('Prisoner_Squat', 'adductors', 'secondary'),
  ('Prisoner_Squat', 'lower_back', 'secondary'),
  ('Bodyweight_Reverse_Lunge', 'quads', 'primary'),
  ('Bodyweight_Reverse_Lunge', 'glutes', 'primary'),
  ('Bodyweight_Reverse_Lunge', 'hamstrings', 'secondary'),
  ('Bodyweight_Reverse_Lunge', 'adductors', 'secondary'),
  ('Single_Leg_Calf_Raise', 'calves', 'primary'),
  ('Lying_Leg_Raise', 'abs', 'primary');

insert into public.exercise_equipment (exercise_id, option_group, equipment_id) values
  ('EZ_Bar_Preacher_Curl', 1, 'ez_bar'),
  ('EZ_Bar_Preacher_Curl', 2, 'preacher_bench'),
  ('EZ_Bar_Preacher_Curl', 2, 'adjustable_bench'),
  ('Close_Grip_EZ_Bar_Preacher_Curl', 1, 'ez_bar'),
  ('Close_Grip_EZ_Bar_Preacher_Curl', 2, 'preacher_bench'),
  ('Close_Grip_EZ_Bar_Preacher_Curl', 2, 'adjustable_bench'),
  ('Twisting_Hanging_Knee_Raise', 1, 'pull_up_bar');
