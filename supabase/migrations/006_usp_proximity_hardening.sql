-- USP hardening: content gated until unlock + aligned GPS buffer for unlock_drop.
-- get_nearby_drops / unlock_drop become SECURITY DEFINER so discovery still works
-- when RLS no longer exposes public drop content before unlock.

-- 1) Content only for creator or after discovery
drop policy if exists "Readable drops by visibility" on public.drops;

create policy "Drops readable by owner or after discovery"
  on public.drops for select
  to authenticated
  using (
    creator_id = (select auth.uid())
    or exists (
      select 1
      from public.drop_discoveries dd
      where dd.drop_id = drops.id
        and dd.user_id = (select auth.uid())
    )
  );

-- 2) Nearby metadata via definer (RLS would hide undiscovered public rows)
create or replace function public.get_nearby_drops(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 1000
)
returns table (
  id uuid,
  type public.drop_type,
  unlock_radius integer,
  latitude double precision,
  longitude double precision,
  unlock_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  visibility public.drop_visibility
)
language sql
stable
security definer
set search_path = public
as $$
  with box as (
    select
      p_lat - (p_radius_m / 111320.0) as min_lat,
      p_lat + (p_radius_m / 111320.0) as max_lat,
      p_lng - (p_radius_m / (111320.0 * cos(radians(p_lat)))) as min_lng,
      p_lng + (p_radius_m / (111320.0 * cos(radians(p_lat)))) as max_lng
  )
  select
    d.id,
    d.type,
    d.unlock_radius,
    d.latitude,
    d.longitude,
    d.unlock_at,
    d.expires_at,
    d.created_at,
    d.visibility
  from public.drops d, box b
  where (select auth.uid()) is not null
    and d.status = 'active'
    and (
      d.visibility = 'public'
      or (d.visibility = 'friends' and public.are_friends((select auth.uid()), d.creator_id))
    )
    and d.latitude between b.min_lat and b.max_lat
    and d.longitude between b.min_lng and b.max_lng
    and (d.expires_at is null or d.expires_at > now())
    and d.creator_id <> (select auth.uid())
    and not exists (
      select 1 from public.drop_discoveries dd
      where dd.drop_id = d.id and dd.user_id = (select auth.uid())
    );
$$;

revoke all on function public.get_nearby_drops(double precision, double precision, double precision) from public;
grant execute on function public.get_nearby_drops(double precision, double precision, double precision) to authenticated;

-- 3) Unlock: same GPS buffer as client utils/location.ts (20–60m, default 30)
create or replace function public.unlock_drop(
  p_drop_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_puzzle_attempt text default null
)
returns public.drops
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.drops;
  dist_m double precision;
  earth_r constant double precision := 6371000;
  last_lat double precision;
  last_lng double precision;
  last_at timestamptz;
  speed_mps double precision;
  buffer_m double precision;
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select * into d from public.drops where id = p_drop_id;
  if not found then
    raise exception 'Drop not found';
  end if;
  if d.status <> 'active' then
    raise exception 'Drop unavailable';
  end if;
  if d.visibility = 'private' and d.creator_id <> uid then
    raise exception 'Drop is private';
  end if;
  if d.visibility = 'friends' and d.creator_id <> uid and not public.are_friends(uid, d.creator_id) then
    raise exception 'Drop is friends-only';
  end if;
  if d.unlock_at is not null and d.unlock_at > now() then
    raise exception 'Drop is time-locked';
  end if;
  if d.expires_at is not null and d.expires_at <= now() then
    raise exception 'Drop expired';
  end if;

  if p_accuracy is not null and p_accuracy > 150 then
    raise exception 'Location accuracy too low';
  end if;

  dist_m := 2 * earth_r * asin(sqrt(
    power(sin(radians(d.latitude - p_lat) / 2), 2) +
    cos(radians(p_lat)) * cos(radians(d.latitude)) *
    power(sin(radians(d.longitude - p_lng) / 2), 2)
  ));

  -- Align with client gpsUnlockBuffer: clamp(accuracy, 20, 60), null → 30
  buffer_m := least(greatest(coalesce(p_accuracy, 30), 20), 60);
  if dist_m > (d.unlock_radius + buffer_m) then
    raise exception 'Too far from Drop';
  end if;

  select claimed_latitude, claimed_longitude, discovered_at
    into last_lat, last_lng, last_at
  from public.drop_discoveries
  where user_id = uid
  order by discovered_at desc
  limit 1;

  if last_lat is not null and last_at is not null and extract(epoch from (now() - last_at)) > 0 then
    speed_mps := (
      2 * earth_r * asin(sqrt(
        power(sin(radians(last_lat - p_lat) / 2), 2) +
        cos(radians(p_lat)) * cos(radians(last_lat)) *
        power(sin(radians(last_lng - p_lng) / 2), 2)
      ))
    ) / extract(epoch from (now() - last_at));
    if speed_mps > 90 then
      raise exception 'Suspicious movement detected';
    end if;
  end if;

  if d.type = 'puzzle' and d.puzzle_answer is not null then
    if p_puzzle_attempt is null or lower(trim(p_puzzle_attempt)) <> lower(trim(d.puzzle_answer)) then
      raise exception 'Incorrect puzzle answer';
    end if;
  end if;

  insert into public.drop_discoveries (
    drop_id, user_id, claimed_latitude, claimed_longitude, claimed_accuracy
  ) values (
    p_drop_id, uid, p_lat, p_lng, p_accuracy
  )
  on conflict (drop_id, user_id) do nothing;

  if d.creator_id <> uid then
    insert into public.notifications (user_id, kind, title, body, drop_id, data)
    values (
      d.creator_id,
      'drop_discovered',
      'A Drop you created was discovered',
      coalesce(d.title, 'Someone found what you left behind.'),
      d.id,
      jsonb_build_object('drop_id', d.id)
    );
  end if;

  return d;
end;
$$;

revoke all on function public.unlock_drop(uuid, double precision, double precision, double precision, text) from public;
grant execute on function public.unlock_drop(uuid, double precision, double precision, double precision, text) to authenticated;
