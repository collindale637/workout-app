-- Catalog batch 1 (exercise library audit, Nov 20 2026): common names for existing lifts, equipment fixes and options, duplicates hidden.
-- Mirrors scripts/catalog-data.mjs (ALIASES, RENAMES, EQUIPMENT_OVERRIDES, EQUIPMENT_ADD_GROUPS, EQUIPMENT_OPTIONS, INACTIVE) and the regenerated seed.
-- Data only, safe to re-run. Ids stay the same, so plans and logged history are untouched; hidden exercises stay in old plans and history.
-- 40 aliased, 39 with equipment changes, 3 hidden, 1 renamed.

-- Names
update public.exercises set name = 'Bicycle Crunch' where id = 'Air_Bike'; -- the floor ab exercise; the cardio machine stays Air Bike (Air_Bike_Cardio)

-- Other names people search for (added to whatever is already there)
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['OHP']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Standing_Military_Press';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Yates Row']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Reverse_Grip_Bent-Over_Rows';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Seal Row', 'Barbell Seal Row']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Lying_Cambered_Barbell_Row';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Meadows Row']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'One-Arm_Long_Bar_Row';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Gorilla Row']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Alternating_Kettlebell_Row';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Ring Row']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Suspended_Row';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Australian Pull-Up', 'Bodyweight Row']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Inverted_Row';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Wide-Grip Pull-Up']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Pullups';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Single-Arm Landmine Press']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Single-Arm_Linear_Jammer';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Log Press']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Log_Lift';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Rear Delt Fly Machine', 'Machine Rear Delt Fly']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Reverse_Machine_Flyes';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Dumbbell Spider Curl']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Dumbbell_Prone_Incline_Curl';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['High-Bar Squat']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Olympic_Squat';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Jumping Lunge', 'Jump Lunge']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Split_Jump';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Snatch-Grip Deadlift']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Snatch_Deadlift';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Nordic Curl', 'Nordic Hamstring Curl']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Natural_Glute_Ham_Raise';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Sliding Leg Curl']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Platform_Hamstring_Slides';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Banded Glute Bridge']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Hip_Lift_with_Band';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Band Glute Kickback']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Hip_Extension_with_Bands';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Donkey Kick', 'Quadruped Kickback']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Glute_Kickback';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['V-Up']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Jackknife_Sit-Up';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['TRX Knee Tuck']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Suspended_Reverse_Crunch';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Medicine Ball Russian Twist']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Medicine_Ball_Full_Twist';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Low-to-High Cable Woodchop']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Standing_Cable_Lift';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Skater Jump']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Lateral_Bound';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Broad Jump']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Standing_Long_Jump';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Push Jerk']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Power_Jerk';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Cat-Cow']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Cat_Stretch';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Leg Swings']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Front_Leg_Raises';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Figure-4 Stretch']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Ankle_On_The_Knee';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Doorway Pec Stretch']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Chest_And_Front_Of_Shoulder_Stretch';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Dumbbell Squeeze Press']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Close-Grip_Dumbbell_Press';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Diamond Push-Up']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Push-Ups_-_Close_Triceps_Position';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Smith Machine Bulgarian Split Squat']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Smith_Single-Leg_Split_Squat';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['RDL', 'Barbell RDL']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Romanian_Deadlift';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['45-Degree Back Extension']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Hyperextensions_Back_Extensions';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Incline Walk', 'Incline Treadmill Walk']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Walking_Treadmill';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Vertical Knee Raise']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Knee_Hip_Raise_On_Parallel_Bars';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Machine Fly', 'Chest Fly Machine']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Butterfly';
update public.exercises set aliases = aliases || coalesce((select array_agg(x) from unnest(array['Hammer Grip Incline DB Bench Press']::text[]) x where x <> all(aliases)), '{}'::text[]) where id = 'Incline_Dumbbell_Bench_With_Palms_Facing_In';

-- Hide duplicates and a jump that was filed as a stretch
update public.exercises set is_active = false where id in ('Decline_Push-Up', 'Hammer_Grip_Incline_DB_Bench_Press', 'Split_Squats');

-- Equipment: replace the whole list where the old tag was wrong
delete from public.exercise_equipment where exercise_id = 'Drag_Curl';
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) values ('Drag_Curl', 1, 'barbell') on conflict do nothing;
delete from public.exercise_equipment where exercise_id = 'Calf-Machine_Shoulder_Shrug';
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) values ('Calf-Machine_Shoulder_Shrug', 1, 'standing_calf_machine') on conflict do nothing;
delete from public.exercise_equipment where exercise_id = 'Sledgehammer_Swings';
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) values ('Sledgehammer_Swings', 1, 'sledgehammer') on conflict do nothing;
delete from public.exercise_equipment where exercise_id = 'Weighted_Bench_Dip';
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) values ('Weighted_Bench_Dip', 1, 'flat_bench'), ('Weighted_Bench_Dip', 1, 'adjustable_bench'), ('Weighted_Bench_Dip', 2, 'weight_plates'), ('Weighted_Bench_Dip', 2, 'dumbbells') on conflict do nothing;
delete from public.exercise_equipment where exercise_id = 'Chin_To_Chest_Stretch';
delete from public.exercise_equipment where exercise_id = 'Body_Tricep_Press';
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) values ('Body_Tricep_Press', 1, 'smith_machine'), ('Body_Tricep_Press', 1, 'power_rack'), ('Body_Tricep_Press', 1, 'squat_stand') on conflict do nothing;
delete from public.exercise_equipment where exercise_id = 'Smith_Single-Leg_Split_Squat';
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) values ('Smith_Single-Leg_Split_Squat', 1, 'smith_machine'), ('Smith_Single-Leg_Split_Squat', 2, 'flat_bench'), ('Smith_Single-Leg_Split_Squat', 2, 'adjustable_bench'), ('Smith_Single-Leg_Split_Squat', 2, 'plyo_box') on conflict do nothing;

-- Equipment: extra requirement groups (bands for banded lifts, benches that were missing)
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Squat_with_Bands', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Squat_with_Bands'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Squat_with_Bands')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Squat_with_Bands' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Box_Squat_with_Bands', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Box_Squat_with_Bands'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Box_Squat_with_Bands')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Box_Squat_with_Bands' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Deadlift_with_Bands', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Deadlift_with_Bands'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Deadlift_with_Bands')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Deadlift_with_Bands' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Rack_Pull_with_Bands', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Rack_Pull_with_Bands'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Rack_Pull_with_Bands')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Rack_Pull_with_Bands' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Sumo_Deadlift_with_Bands', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Sumo_Deadlift_with_Bands'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Sumo_Deadlift_with_Bands')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Sumo_Deadlift_with_Bands' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Reverse_Band_Bench_Press', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Reverse_Band_Bench_Press'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Reverse_Band_Bench_Press')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Reverse_Band_Bench_Press' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Reverse_Band_Box_Squat', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Reverse_Band_Box_Squat'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Reverse_Band_Box_Squat')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Reverse_Band_Box_Squat' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Reverse_Band_Deadlift', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Reverse_Band_Deadlift'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Reverse_Band_Deadlift')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Reverse_Band_Deadlift' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Reverse_Band_Power_Squat', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Reverse_Band_Power_Squat'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Reverse_Band_Power_Squat')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Reverse_Band_Power_Squat' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Reverse_Band_Sumo_Deadlift', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Reverse_Band_Sumo_Deadlift'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Reverse_Band_Sumo_Deadlift')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Reverse_Band_Sumo_Deadlift' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Close-Grip_EZ-Bar_Curl_with_Band', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Close-Grip_EZ-Bar_Curl_with_Band'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Close-Grip_EZ-Bar_Curl_with_Band')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Close-Grip_EZ-Bar_Curl_with_Band' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Band_Assisted_Pull-Up', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Band_Assisted_Pull-Up'), e from unnest(array['resistance_bands']::text[]) e
  where exists (select 1 from public.exercises where id = 'Band_Assisted_Pull-Up')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Band_Assisted_Pull-Up' and equipment_id = 'resistance_bands')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Decline_Crunch', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Decline_Crunch'), e from unnest(array['decline_bench', 'adjustable_bench']::text[]) e
  where exists (select 1 from public.exercises where id = 'Decline_Crunch')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Decline_Crunch' and equipment_id = 'decline_bench')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Decline_Oblique_Crunch', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Decline_Oblique_Crunch'), e from unnest(array['decline_bench', 'adjustable_bench']::text[]) e
  where exists (select 1 from public.exercises where id = 'Decline_Oblique_Crunch')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Decline_Oblique_Crunch' and equipment_id = 'decline_bench')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Decline_Reverse_Crunch', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Decline_Reverse_Crunch'), e from unnest(array['decline_bench', 'adjustable_bench']::text[]) e
  where exists (select 1 from public.exercises where id = 'Decline_Reverse_Crunch')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Decline_Reverse_Crunch' and equipment_id = 'decline_bench')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Incline_Cable_Flye', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Incline_Cable_Flye'), e from unnest(array['adjustable_bench']::text[]) e
  where exists (select 1 from public.exercises where id = 'Incline_Cable_Flye')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Incline_Cable_Flye' and equipment_id = 'adjustable_bench')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Incline_Cable_Chest_Press', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Incline_Cable_Chest_Press'), e from unnest(array['adjustable_bench']::text[]) e
  where exists (select 1 from public.exercises where id = 'Incline_Cable_Chest_Press')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Incline_Cable_Chest_Press' and equipment_id = 'adjustable_bench')
  on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id)
  select 'Cable_Incline_Triceps_Extension', (select coalesce(max(option_group), 0) + 1 from public.exercise_equipment where exercise_id = 'Cable_Incline_Triceps_Extension'), e from unnest(array['adjustable_bench']::text[]) e
  where exists (select 1 from public.exercises where id = 'Cable_Incline_Triceps_Extension')
    and not exists (select 1 from public.exercise_equipment where exercise_id = 'Cable_Incline_Triceps_Extension' and equipment_id = 'adjustable_bench')
  on conflict do nothing;

-- Equipment: another way to do it, in the same group (kettlebell for dumbbell, EZ bar for barbell, band for cable)
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'ez_bar' from public.exercise_equipment where exercise_id = 'Standing_Overhead_Barbell_Triceps_Extension' and equipment_id = 'barbell' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'ez_bar' from public.exercise_equipment where exercise_id = 'Reverse_Barbell_Curl' and equipment_id = 'barbell' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'ez_bar' from public.exercise_equipment where exercise_id = 'Upright_Barbell_Row' and equipment_id = 'barbell' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'kettlebells' from public.exercise_equipment where exercise_id = 'Plie_Dumbbell_Squat' and equipment_id = 'dumbbells' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'kettlebells' from public.exercise_equipment where exercise_id = 'Dumbbell_Lunges' and equipment_id = 'dumbbells' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'kettlebells' from public.exercise_equipment where exercise_id = 'Dumbbell_Rear_Lunge' and equipment_id = 'dumbbells' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'kettlebells' from public.exercise_equipment where exercise_id = 'Dumbbell_Walking_Lunge' and equipment_id = 'dumbbells' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'kettlebells' from public.exercise_equipment where exercise_id = 'Split_Squat_with_Dumbbells' and equipment_id = 'dumbbells' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'kettlebells' from public.exercise_equipment where exercise_id = 'Dumbbell_Step_Ups' and equipment_id = 'dumbbells' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'kettlebells' from public.exercise_equipment where exercise_id = 'Stiff-Legged_Dumbbell_Deadlift' and equipment_id = 'dumbbells' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'kettlebells' from public.exercise_equipment where exercise_id = 'Dumbbell_Shrug' and equipment_id = 'dumbbells' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'kettlebells' from public.exercise_equipment where exercise_id = 'Standing_Dumbbell_Calf_Raise' and equipment_id = 'dumbbells' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'resistance_bands' from public.exercise_equipment where exercise_id = 'Pallof_Press' and equipment_id = 'cable_crossover' on conflict do nothing;
insert into public.exercise_equipment (exercise_id, option_group, equipment_id) select exercise_id, option_group, 'resistance_bands' from public.exercise_equipment where exercise_id = 'Standing_Cable_Wood_Chop' and equipment_id = 'cable_crossover' on conflict do nothing;
