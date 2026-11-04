-- Dhaka launch seed pack: Dhanmondi Lake + Hatirjheel
-- Idempotent: removes prior [SEED] rows for the seed creator, then re-plants.
-- Uses the oldest profile as the seed creator (no auth.users lookup).

do $$
declare
  seed_uid uuid;
begin
  select id into seed_uid
  from public.profiles
  order by created_at asc nulls last
  limit 1;

  if seed_uid is null then
    raise notice 'No profiles — skip Dhaka seed pack';
    return;
  end if;

  delete from public.drops
  where creator_id = seed_uid
    and title like '[SEED]%';

  -- ---- Dhanmondi Lake (walkable ring) ----
  insert into public.drops (
    creator_id, type, title, content, latitude, longitude,
    unlock_radius, visibility, status, unlock_at
  ) values
  (
    seed_uid, 'memory',
    '[SEED] Lakeside hush',
    'Someone sat here and watched the water go still. Leave the noise behind for a breath.',
    23.74605, 90.37435, 40, 'public', 'active', null
  ),
  (
    seed_uid, 'message',
    '[SEED] Bridge whisper',
    'If you made it this far on foot, you’re already part of the story.',
    23.74655, 90.37510, 40, 'public', 'active', null
  ),
  (
    seed_uid, 'puzzle',
    '[SEED] Count the herons',
    'Clue: how many letters in the Bangla word for lake? (hint: think “pukur” energy, not the English word.)',
    23.74540, 90.37380, 40, 'public', 'active', null
  ),
  (
    seed_uid, 'secret',
    '[SEED] Under the trees',
    'A tiny secret for whoever stands exactly here.',
    23.74710, 90.37480, 25, 'public', 'active', null
  ),
  (
    seed_uid, 'time_capsule',
    '[SEED] Next Friday by the water',
    'Sealed for a future walker. Come back when the date opens.',
    23.74580, 90.37540, 40, 'public', 'active',
    (timezone('utc', now())::date + 7)::timestamptz + interval '18 hours'
  ),
  (
    seed_uid, 'challenge',
    '[SEED] Evolving lakeside',
    'Add one line about what this lake means to you.',
    23.74680, 90.37350, 50, 'public', 'active', null
  );

  -- puzzle answer for Count the herons — "pukur" is 5 letters in Latin; use simple answer
  update public.drops
  set puzzle_answer = '5'
  where creator_id = seed_uid and title = '[SEED] Count the herons';

  -- ---- Hatirjheel ----
  insert into public.drops (
    creator_id, type, title, content, latitude, longitude,
    unlock_radius, visibility, status, unlock_at
  ) values
  (
    seed_uid, 'memory',
    '[SEED] Hatirjheel dusk',
    'The lights come on one by one. Stay until the water mirrors them.',
    23.76870, 90.41430, 40, 'public', 'active', null
  ),
  (
    seed_uid, 'message',
    '[SEED] Expressway pause',
    'Cars rush. You walked. That already counts.',
    23.76940, 90.41510, 40, 'public', 'active', null
  ),
  (
    seed_uid, 'photo',
    '[SEED] Skyline scrap',
    'No photo attached — imagine the skyline and leave your own Drop nearby.',
    23.76790, 90.41360, 50, 'public', 'active', null
  ),
  (
    seed_uid, 'voice',
    '[SEED] Soft traffic hymn',
    'Listen to the city for ten seconds. Then leave a voice Drop of your own.',
    23.77010, 90.41480, 40, 'public', 'active', null
  ),
  (
    seed_uid, 'memory',
    '[SEED] Bridge midpoint',
    'Halfway across — look both ways. The city holds both shores.',
    23.76820, 90.41560, 40, 'public', 'active', null
  ),
  (
    seed_uid, 'challenge',
    '[SEED] Hatirjheel evolving',
    'Write one thing you hope this place keeps forever.',
    23.76900, 90.41300, 50, 'public', 'active', null
  );

  raise notice 'Dhaka seed pack planted for profile %', seed_uid;
end $$;
