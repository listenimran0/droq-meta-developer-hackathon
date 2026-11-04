-- Sync Google (and other OAuth) name + avatar into profiles on signup.
-- Google provides full_name / name / picture / avatar_url in raw_user_meta_data,
-- not our custom display_name / username keys.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
  pretty_name text;
  avatar text;
begin
  base_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    split_part(coalesce(new.email, 'wanderer'), '@', 1)
  );
  base_username := lower(regexp_replace(base_username, '[^a-z0-9_]', '', 'g'));
  if length(base_username) < 3 then
    base_username := 'wanderer';
  end if;
  final_username := base_username || '_' || substr(replace(new.id::text, '-', ''), 1, 6);

  pretty_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    base_username
  );

  avatar := coalesce(
    nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
    nullif(trim(new.raw_user_meta_data->>'picture'), '')
  );

  insert into public.profiles (id, email, username, display_name, avatar_url)
  values (
    new.id,
    new.email,
    final_username,
    pretty_name,
    avatar
  );
  return new;
end;
$$;

-- Backfill existing Google users who already have metadata but empty/auto profile fields.
update public.profiles p
set
  display_name = coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    p.display_name
  ),
  avatar_url = coalesce(
    nullif(trim(p.avatar_url), ''),
    nullif(trim(u.raw_user_meta_data->>'avatar_url'), ''),
    nullif(trim(u.raw_user_meta_data->>'picture'), '')
  )
from auth.users u
where u.id = p.id
  and (
    p.avatar_url is null
    or nullif(trim(p.avatar_url), '') is null
    or p.display_name is null
    or p.display_name = p.username
    or p.display_name = split_part(coalesce(p.email, ''), '@', 1)
  );
