-- DEMO VIDEO ONLY (v2). Everything is labeled "[DEMO SEED]" / demo-seed-*.
-- Fictional venues only. Fully removable with scripts/demo-remove.sql.
--
-- Run:    Supabase dashboard -> SQL editor -> paste -> Run (edit v_email below).
-- Remove: run scripts/demo-remove.sql after filming.
--
-- Creates:
--   * 3 Business drops owned by v_email: a cafe, a bookshop, a street-food stall
--     (the cafe is ~75 m from the emulator test spot 23.7806, 90.4070)
--   * 16 fake visitor accounts (demo-seed-visitor-N@demo-seed.invalid, cannot log in)
--   * ~32 verified visits over 14 days (lunch vs evening, weekday vs weekend,
--     repeat visitors across venues) + their finds on 6 hidden filler drops
--   * analytics_events (quest/sense shown -> opened) so the sponsored funnel has data
--   * 1 hidden "venue" account that owns the filler drops
DO $$
DECLARE
  v_email   text := 'owner@example.com';   -- <<< the email of the account that should own the demo venues
  tz        constant text := 'Asia/Dhaka';
  v_owner   uuid;
  v_venue   uuid := gen_random_uuid();
  v_drops   uuid[];
  v_lat     double precision[] := array[23.7812, 23.7826, 23.7790];
  v_lng     double precision[] := array[90.4073, 90.4059, 90.4084];
  v_fill    uuid[] := '{}';
  v_ftypes  text[] := array['photo','voice','video','puzzle','time_capsule','challenge'];
  h_cafe    int[] := array[12,13,13,14,17,18,18,19];
  h_books   int[] := array[15,16,17,18,19,19];
  h_food    int[] := array[18,19,19,20,20,21];
  hrs       int[];
  wk        int[];
  v_id      uuid;
  v_visitor uuid;
  i int; j int; k int; di int; h int; m int; d int; nvis int;
  today_local timestamp := date_trunc('day', now() AT TIME ZONE tz);
  ts timestamptz; opened_at timestamptz; shown_at timestamptz;
BEGIN
  SELECT id INTO v_owner FROM public.profiles WHERE lower(email) = lower(v_email);
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'No profile with email % — edit v_email at the top.', v_email;
  END IF;
  IF EXISTS (SELECT 1 FROM public.drops WHERE title LIKE '[DEMO SEED]%') THEN
    RAISE EXCEPTION 'Demo data already present. Run scripts/demo-remove.sql first.';
  END IF;

  -- 3 fictional Business drops (realistic offers)
  v_drops := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  INSERT INTO public.drops (id, creator_id, type, title, content, latitude, longitude, unlock_radius,
                            visibility, status, is_business, business_name, business_category) VALUES
    (v_drops[1], v_owner, 'memory',  '[DEMO SEED] Lantern Alley Café',
     'Show this Drop at the counter and your second cup of tea is on us.', v_lat[1], v_lng[1], 25,
     'public', 'active', true, 'Lantern Alley Café', 'cafe'),
    (v_drops[2], v_owner, 'message', '[DEMO SEED] Paper Moth Books',
     'Mention this Drop this weekend for 10% off any paperback.', v_lat[2], v_lng[2], 25,
     'public', 'active', true, 'Paper Moth Books', 'books'),
    (v_drops[3], v_owner, 'secret',  '[DEMO SEED] Smoky Corner Fuchka',
     'Whisper the word "tamarind" to the vendor for one extra piece, free.', v_lat[3], v_lng[3], 25,
     'public', 'active', true, 'Smoky Corner Fuchka', 'food');

  -- hidden venue account + 6 hidden filler drops (variety for "what visitors also find")
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change)
  VALUES ('00000000-0000-0000-0000-000000000000', v_venue, 'authenticated', 'authenticated',
    'demo-seed-venue@demo-seed.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  FOR j IN 1..6 LOOP
    v_id := gen_random_uuid();
    INSERT INTO public.drops (id, creator_id, type, title, content, latitude, longitude, unlock_radius,
                              visibility, status)
    VALUES (v_id, v_venue, v_ftypes[j]::public.drop_type, '[DEMO SEED] filler ' || j, 'Demo filler.',
            23.9 + j * 0.001, 90.5 + j * 0.001, 25, 'public', 'hidden');
    v_fill := v_fill || v_id;
  END LOOP;

  -- weekend (Fri/Sat) day offsets inside the last 14 days, for the bookshop's weekend bias
  SELECT array_agg(o ORDER BY o) INTO wk FROM generate_series(0, 13) o
   WHERE extract(isodow FROM (today_local - o * interval '1 day')) IN (5, 6);

  FOR i IN 1..16 LOOP
    v_visitor := gen_random_uuid();
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change)
    VALUES ('00000000-0000-0000-0000-000000000000', v_visitor, 'authenticated', 'authenticated',
      format('demo-seed-visitor-%s@demo-seed.invalid', i), crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

    nvis := 1 + (i % 3);                      -- 1..3 distinct venues; 2+ = returning customer
    FOR k IN 1..nvis LOOP
      di := ((i + k) % 3) + 1;
      hrs := CASE di WHEN 1 THEN h_cafe WHEN 2 THEN h_books ELSE h_food END;
      h := hrs[1 + ((i * 7 + k * 3) % array_length(hrs, 1))];
      m := (i * 13 + k * 29) % 60;
      d := (i * 5 + k * 3) % 14;
      IF di = 2 AND array_length(wk, 1) > 0 THEN
        d := wk[1 + ((i + k) % array_length(wk, 1))];
      END IF;
      ts := ((today_local - d * interval '1 day') + h * interval '1 hour' + m * interval '1 minute') AT TIME ZONE tz;
      IF ts > now() THEN ts := ts - interval '1 day'; END IF;

      INSERT INTO public.drop_discoveries (drop_id, user_id, discovered_at, claimed_latitude, claimed_longitude, claimed_accuracy)
      VALUES (v_drops[di], v_visitor, ts, v_lat[di], v_lng[di], 8);

      IF (i + k) % 4 <> 0 THEN                 -- ~75% came via a Quest/Sense suggestion, the rest walked in
        opened_at := ts - ((20 + m % 25) * interval '1 minute');
        shown_at  := opened_at - ((1 + m % 9) * interval '1 minute');
        INSERT INTO public.analytics_events (user_id, event_name, properties, created_at) VALUES
          (v_visitor, CASE WHEN (i + k) % 2 = 0 THEN 'quest_step_shown' ELSE 'sense_shown' END,
           jsonb_build_object('drop_id', v_drops[di], 'sponsored', true, 'demo', true), shown_at),
          (v_visitor, CASE WHEN (i + k) % 2 = 0 THEN 'quest_step_opened' ELSE 'sense_opened' END,
           jsonb_build_object('drop_id', v_drops[di], 'demo', true), opened_at);
      END IF;
    END LOOP;

    -- suggestions that did not convert: shown twice more, opened for even visitors
    FOR k IN 1..2 LOOP
      di := ((i + k + 1) % 3) + 1;
      m := (i * 17 + k * 11) % 60;
      d := (i * 3 + k * 5) % 14;
      ts := ((today_local - d * interval '1 day') + (10 + (i + k) % 9) * interval '1 hour' + m * interval '1 minute') AT TIME ZONE tz;
      IF ts > now() THEN ts := ts - interval '1 day'; END IF;
      INSERT INTO public.analytics_events (user_id, event_name, properties, created_at)
      VALUES (v_visitor, CASE WHEN k = 1 THEN 'quest_step_shown' ELSE 'sense_shown' END,
              jsonb_build_object('drop_id', v_drops[di], 'sponsored', true, 'demo', true), ts);
      IF i % 2 = 0 AND k = 1 THEN
        INSERT INTO public.analytics_events (user_id, event_name, properties, created_at)
        VALUES (v_visitor, 'quest_step_opened', jsonb_build_object('drop_id', v_drops[di], 'demo', true), ts + interval '2 minutes');
      END IF;
    END LOOP;

    -- what these visitors also find elsewhere (feeds "top visitor interests")
    FOR j IN 0..(1 + i % 3) LOOP
      ts := now() - (((i * 3 + j * 4) % 14) * interval '1 day') - ((i + j) * interval '1 hour');
      INSERT INTO public.drop_discoveries (drop_id, user_id, discovered_at, claimed_latitude, claimed_longitude, claimed_accuracy)
      VALUES (v_fill[1 + ((i + j) % 6)], v_visitor, ts, 23.9, 90.5, 8)
      ON CONFLICT (drop_id, user_id) DO NOTHING;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Demo v2 seeded for %: 3 business drops, 16 visitors.', v_email;
END $$;
