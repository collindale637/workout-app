-- Photos for 10 added exercises whose movement matches an existing free-exercise-db exercise.
-- Re-runnable; only fills exercises that have no photos yet.
update public.exercises e set images = v.images
from (values
  ('Dumbbell_Walking_Lunge', array['Dumbbell_Lunges/0.jpg', 'Dumbbell_Lunges/1.jpg']::text[]),
  ('Air_Bike_Cardio', array['Air_Bike/0.jpg', 'Air_Bike/1.jpg']::text[]),
  ('Spin_Bike', array['Bicycling_Stationary/0.jpg', 'Bicycling_Stationary/1.jpg']::text[]),
  ('EZ_Bar_Preacher_Curl', array['Preacher_Curl/0.jpg', 'Preacher_Curl/1.jpg']::text[]),
  ('Neutral-Grip_Pull-Up', array['V-Bar_Pullup/0.jpg', 'V-Bar_Pullup/1.jpg']::text[]),
  ('Alternating_Dumbbell_Bench_Press', array['Dumbbell_Bench_Press/0.jpg', 'Dumbbell_Bench_Press/1.jpg']::text[]),
  ('Single-Arm_Machine_Curl', array['Machine_Bicep_Curl/0.jpg', 'Machine_Bicep_Curl/1.jpg']::text[]),
  ('Hip_CARs', array['Standing_Hip_Circles/0.jpg', 'Standing_Hip_Circles/1.jpg']::text[]),
  ('Shoulder_CARs', array['Shoulder_Circles/0.jpg', 'Shoulder_Circles/1.jpg']::text[]),
  ('Arc_Trainer', array['Elliptical_Trainer/0.jpg', 'Elliptical_Trainer/1.jpg']::text[])
) as v(id, images)
where e.id = v.id and coalesce(array_length(e.images, 1), 0) = 0;
