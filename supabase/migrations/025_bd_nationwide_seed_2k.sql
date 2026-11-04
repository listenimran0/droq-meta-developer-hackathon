-- Bangladesh nationwide seed pack (~2000 public drops)
-- Dense clusters in cities so NEARBY_RADIUS 1km finds something.
-- Idempotent via media_path marker. Creator = oldest profile (or seedbot if present).

do $$
declare
  seed_uid uuid;
  hub text[];
  i int;
  lat float8;
  lng float8;
  t public.drop_type;
  title text;
  body text;
  radius int;
  unlock_ts timestamptz;
  titles text[] := array['Left this for a stranger',
    'Tea stall pause',
    'After the rain',
    'Don’t check your phone yet',
    'For whoever walks here at dusk',
    'A quiet yes',
    'Stand still for ten seconds',
    'I almost stayed home',
    'Little courage note',
    'From someone who walked too',
    'Soft evening',
    'Between two CNGs',
    'Under this sky',
    'Keep going',
    'You found me',
    'Breathing room',
    'Not a reel — a place',
    'Slow down here',
    'Pocket of calm',
    'For tired feet',
    'Secret on the pavement',
    'Dusk feels different here',
    'Write your own next',
    'One honest line',
    'City hush',
    'If you made it on foot',
    'Rain-smell memory',
    'Hold this feeling',
    'A stranger’s kindness',
    'Look up once',
    'Leave the feed behind',
    'Small victory',
    'Tonight’s soft edge',
    'For the next walker',
    'Borrowed bravery',
    'This corner remembers',
    'Quiet flex',
    'Walk first, scroll later',
    'Hello from earlier today',
    'Only feet unlock this'];
  bodies text[] := array['I almost stayed home today. Glad I didn’t. If you’re reading this, you didn’t either.',
    'চায়ের কাপে একটু শান্তি। You found this by walking — that already matters.',
    'The horns feel softer from here. Stand still for ten seconds. Then go.',
    'Nobody clapped when you left the couch. But the street noticed.',
    'I left this because the light looked honest. Stay until it changes.',
    'If your legs brought you here, you’re already winning against the feed.',
    'একটু দাঁড়াও। এই জায়গাটা তোমার জন্য অপেক্ষা করছিল।',
    'A tiny secret for whoever showed up in person. Welcome.',
    'Rain left the air clean. Breathe once for me, then leave your own Drop nearby.',
    'I was nervous walking alone. Then I remembered — the city is full of quiet company.',
    'This isn’t content. It’s a place. You’re in it.',
    'Put your phone in your pocket for one block. You’ll thank yourself.',
    'Someone smiled at a stranger here yesterday. Be that someone today.',
    'তোমার পায়ে ধুলো থাকলেও পরোয়া নেই — বাইরে আসাটাই জয়।',
    'I came for groceries. I stayed for the sky. Weird how that works.',
    'If you’re tired, sit for a minute. The Drop will wait. The street will too.',
    'Proof you moved through the world today. Keep the receipt.',
    'The best notifications are birds and bus brakes. Listen.',
    'আমি আগে এখানে কাঁদছিলাম। এখন হাসছি। Places hold both.',
    'Leave something kinder than you found. That’s the whole game.',
    'You don’t need a map pin. You needed courage. You had it.',
    'Golden hour hits different when you’re not watching it through glass.',
    'I wrote this between meetings. Real life sneaks in the gaps.',
    'If this unlocked, you’re close enough to matter. That’s rare online.',
    'Take a photo if you want — but look with your eyes first.',
    'এখানে দাঁড়িয়ে মনে হয় পৃথিবী একটু ধীর। ভালো লাগে।',
    'For the version of you that almost turned back. You didn’t. Soft applause.',
    'The city is a scavenger hunt if you treat it like one.',
    'I hope your day gets a little lighter from standing here.',
    'No likes. No followers. Just you and a patch of ground.',
    'Walk one more block after this. Surprise yourself.',
    'Tonight the air smells like possibility. Or maybe just rain. Close enough.',
    'You’re not late. You’re outside. That’s the assignment.',
    'I left a piece of my afternoon here. Borrow it.',
    'If you’re with someone, read this out loud. If you’re alone — still counts.',
    'বাংলাদেশের রাস্তায় জাদু আছে। তুমি এখন তার ভিতরে।',
    'Small feet, big map. You’re redrawing your day.',
    'This Drop is a handshake from a stranger who believes in sidewalks.',
    'Pause. Notice one beautiful ugly thing. Then unlock kindness.',
    'May your next corner be softer than your last scroll.'];
  type_cycle public.drop_type[] := array['memory', 'message', 'secret', 'memory', 'message', 'challenge', 'memory', 'message', 'time_capsule', 'puzzle', 'memory', 'message', 'secret', 'memory', 'message']::public.drop_type[];
  hubs text[][] := array[
    array['Gulshan', '23.7806', '90.4193', '33'],
    array['Banani', '23.7937', '90.4066', '28'],
    array['Dhanmondi', '23.7461', '90.3742', '33'],
    array['Motijheel', '23.733', '90.4172', '24'],
    array['Uttara', '23.8759', '90.3795', '33'],
    array['Mirpur', '23.8223', '90.3654', '33'],
    array['Mohammadpur', '23.7658', '90.3588', '26'],
    array['Old Dhaka', '23.7104', '90.4074', '28'],
    array['Bashundhara', '23.8151', '90.4265', '26'],
    array['Farmgate', '23.7563', '90.3907', '24'],
    array['Tejgaon', '23.7639', '90.395', '21'],
    array['Badda', '23.7808', '90.4265', '24'],
    array['Khilgaon', '23.7505', '90.4255', '21'],
    array['Wari', '23.717', '90.42', '19'],
    array['Lalbagh', '23.719', '90.388', '19'],
    array['Rampura', '23.762', '90.4205', '21'],
    array['Malibagh', '23.7485', '90.412', '19'],
    array['Shyamoli', '23.7745', '90.365', '21'],
    array['Agargaon', '23.777', '90.3735', '19'],
    array['Mohakhali', '23.78', '90.4005', '21'],
    array['Baridhara', '23.801', '90.421', '19'],
    array['Niketan', '23.771', '90.41', '17'],
    array['Elephant Road', '23.7385', '90.387', '17'],
    array['New Market', '23.7335', '90.3845', '17'],
    array['Azimpur', '23.727', '90.3855', '17'],
    array['Hatirjheel', '23.7687', '90.4143', '26'],
    array['Science Lab', '23.7395', '90.3825', '15'],
    array['Paltan', '23.7355', '90.412', '17'],
    array['Kakrail', '23.74', '90.4085', '15'],
    array['Moghbazar', '23.749', '90.408', '17'],
    array['Jatrabari', '23.7105', '90.435', '21'],
    array['Demra', '23.723', '90.492', '15'],
    array['Keraniganj', '23.685', '90.345', '13'],
    array['Savar', '23.858', '90.266', '17'],
    array['Gazipur', '23.9999', '90.4203', '26'],
    array['Tongi', '23.897', '90.408', '19'],
    array['Narayanganj', '23.6238', '90.5', '24'],
    array['Fatullah', '23.653', '90.485', '13'],
    array['Agrabad', '22.328', '91.812', '26'],
    array['GEC Circle', '22.359', '91.8215', '24'],
    array['Chawkbazar CTG', '22.341', '91.838', '19'],
    array['Patenga', '22.235', '91.791', '17'],
    array['Halishahar', '22.336', '91.776', '17'],
    array['Pahartali', '22.365', '91.79', '15'],
    array['Kotwali CTG', '22.3355', '91.834', '15'],
    array['Nasirabad', '22.3665', '91.822', '17'],
    array['Zindabazar', '24.899', '91.872', '24'],
    array['Amberkhana', '24.9055', '91.868', '17'],
    array['Shahjalal University', '24.92', '91.832', '17'],
    array['Jaflong road', '25.035', '92.015', '11'],
    array['Shaheb Bazar', '24.374', '88.601', '21'],
    array['Padma garden', '24.365', '88.628', '15'],
    array['RU campus', '24.3705', '88.637', '15'],
    array['Sonadanga', '22.845', '89.54', '21'],
    array['Khalishpur', '22.87', '89.545', '15'],
    array['Boyra', '22.825', '89.555', '13'],
    array['Barishal sadar', '22.701', '90.3535', '21'],
    array['Band Road', '22.7055', '90.37', '13'],
    array['Rangpur city', '25.7439', '89.2752', '21'],
    array['Carmichael College', '25.755', '89.25', '11'],
    array['Mymensingh town', '24.7471', '90.4203', '21'],
    array['Agriculture University', '24.725', '90.437', '13'],
    array['Kandirpar', '23.461', '91.1805', '21'],
    array['Cumilla cantonment', '23.475', '91.125', '13'],
    array['Bogura sadar', '24.848', '89.373', '19'],
    array['Jashore town', '23.17', '89.214', '19'],
    array['Laboni beach', '21.4272', '91.9712', '24'],
    array['Kolatoli', '21.417', '91.982', '17'],
    array['Inani', '21.28', '92.045', '11'],
    array['Dinajpur', '25.627', '88.633', '15'],
    array['Pabna', '24.006', '89.237', '13'],
    array['Kushtia', '23.901', '89.122', '15'],
    array['Faridpur', '23.607', '89.843', '13'],
    array['Tangail', '24.251', '89.9165', '15'],
    array['Jamalpur', '24.937', '89.937', '13'],
    array['Netrokona', '24.883', '90.729', '11'],
    array['Kishoreganj', '24.444', '90.777', '13'],
    array['Brahmanbaria', '23.957', '91.112', '13'],
    array['Feni', '23.015', '91.398', '13'],
    array['Noakhali', '22.869', '91.1', '15'],
    array['Lakshmipur', '22.944', '90.83', '11'],
    array['Chandpur', '23.233', '90.671', '13'],
    array['Munshiganj', '23.542', '90.53', '13'],
    array['Manikganj', '23.861', '90', '11'],
    array['Narsingdi', '23.932', '90.715', '15'],
    array['Gopalganj', '23.005', '89.826', '11'],
    array['Madaripur', '23.164', '90.189', '11'],
    array['Shariatpur', '23.242', '90.35', '9'],
    array['Bhola', '22.685', '90.648', '11'],
    array['Patuakhali', '22.359', '90.33', '13'],
    array['Barguna', '22.152', '90.127', '9'],
    array['Pirojpur', '22.579', '89.975', '9'],
    array['Jhalokathi', '22.641', '90.199', '9'],
    array['Satkhira', '22.718', '89.07', '13'],
    array['Bagerhat', '22.651', '89.786', '11'],
    array['Narail', '23.172', '89.512', '9'],
    array['Magura', '23.485', '89.42', '9'],
    array['Jhenaidah', '23.544', '89.154', '11'],
    array['Chuadanga', '23.64', '88.848', '11'],
    array['Meherpur', '23.762', '88.632', '9'],
    array['Rajbari', '23.757', '89.645', '9'],
    array['Naogaon', '24.813', '88.932', '13'],
    array['Natore', '24.42', '89', '11'],
    array['Chapainawabganj', '24.596', '88.277', '11'],
    array['Joypurhat', '25.101', '89.027', '9'],
    array['Thakurgaon', '26.033', '88.462', '11'],
    array['Panchagarh', '26.333', '88.558', '9'],
    array['Nilphamari', '25.932', '88.856', '11'],
    array['Lalmonirhat', '25.917', '89.446', '9'],
    array['Kurigram', '25.805', '89.65', '9'],
    array['Gaibandha', '25.329', '89.541', '11'],
    array['Sirajganj', '24.453', '89.708', '13'],
    array['Sherpur', '25.019', '90.015', '9'],
    array['Habiganj', '24.375', '91.416', '13'],
    array['Moulvibazar', '24.482', '91.777', '13'],
    array['Sunamganj', '25.066', '91.407', '11'],
    array['Bandarban', '22.195', '92.218', '11'],
    array['Rangamati', '22.65', '92.18', '12'],
    array['Khagrachhari', '23.119', '91.98', '12'],
    array['Teknaf', '20.862', '92.306', '10'],
    array['Saint Martin', '20.628', '92.322', '9'],
    array['Kuakata', '21.816', '90.12', '12'],
    array['Srimangal', '24.306', '91.733', '14'],
    array['Jaflong', '25.163', '92.017', '10'],
    array['Sundarbans gate', '22.37', '89.65', '10'],
    array['END', '0', '0', '0']
  ];

begin
  select id into seed_uid
  from public.profiles
  where id = '1c0bc3c0-50f4-4f82-a709-2355ef4d8e23'
  limit 1;

  if seed_uid is null then
    select id into seed_uid
    from public.profiles
    order by created_at asc nulls last
    limit 1;
  end if;

  if seed_uid is null then
    raise notice 'No profiles — skip BD nationwide seed';
    return;
  end if;

  -- human-looking seed identity (safe upsert)
  update public.profiles
  set
    display_name = coalesce(nullif(display_name, ''), 'A walker'),
    username = coalesce(nullif(username, ''), 'walker')
  where id = seed_uid
    and (display_name is null or display_name = '' or username is null or username ilike '%seed%');

  delete from public.drops
  where creator_id = seed_uid
    and media_path = 'seed/bd-nationwide-v1';

  foreach hub slice 1 in array hubs loop
    if hub[1] = 'END' then
      continue;
    end if;

    for i in 1..hub[4]::int loop
      -- ~±900m jitter so many pins fall inside a 1km nearby circle
      lat := hub[2]::float8 + ((random() - 0.5) * 0.016);
      lng := hub[3]::float8 + ((random() - 0.5) * 0.016);
      t := type_cycle[1 + ((i + length(hub[1])) % array_length(type_cycle, 1))];
      title := titles[1 + floor(random() * array_length(titles, 1))::int];
      body := bodies[1 + floor(random() * array_length(bodies, 1))::int];
      -- lightly place-flavor the body without sounding templated
      if random() < 0.35 then
        body := body || E'\n\n— near ' || hub[1];
      end if;
      radius := case when t = 'secret' then 25 when t = 'challenge' then 50 else 40 end;
      unlock_ts := case
        when t = 'time_capsule' then
          (timezone('utc', now())::date + (3 + floor(random() * 18)::int))::timestamptz
            + interval '17 hours'
        else null
      end;

      insert into public.drops (
        creator_id, type, title, content, media_path,
        latitude, longitude, unlock_radius, visibility, status, unlock_at,
        puzzle_answer
      ) values (
        seed_uid, t, title, body, 'seed/bd-nationwide-v1',
        lat, lng, radius, 'public', 'active', unlock_ts,
        case when t = 'puzzle' then 'walk' else null end
      );
    end loop;
  end loop;

  raise notice 'BD nationwide seed planted for %', seed_uid;
end $$;

-- Make puzzle drops feel like real riddles
update public.drops
set
  title = 'Street riddle',
  content = 'Clue: what do your feet do that the feed cannot? Answer in one word.',
  puzzle_answer = 'walk'
where media_path = 'seed/bd-nationwide-v1'
  and type = 'puzzle';

update public.drops
set
  title = 'Add one line here',
  content = 'This place is evolving. Leave one honest sentence about why you came outside today.'
where media_path = 'seed/bd-nationwide-v1'
  and type = 'challenge';
