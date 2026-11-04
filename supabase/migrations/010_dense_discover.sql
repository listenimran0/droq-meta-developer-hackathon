-- Dense Discover: order/limit nearby, distance_m, count RPC, dual activity streak.
-- Keeps SECURITY DEFINER on nearby RPCs (RLS hides undiscovered public drop rows).

-- ---------------------------------------------------------------------------
-- get_nearby_drops: Haversine order, exclude discovered (already), return distance_m, limit
-- ---------------------------------------------------------------------------
drop function if exists public.get_nearby_drops(double precision, double precision, double precision);

create or replace function public.get_nearby_drops(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 1000,
  p_limit integer default 20
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
  visibility public.drop_visibility,
  distance_m double precision
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
  ),
  candidates as (
    select
      d.id,
      d.type,
      d.unlock_radius,
      d.latitude,
      d.longitude,
      d.unlock_at,
      d.expires_at,
      d.created_at,
      d.visibility,
      (
        2 * 6371000 * asin(sqrt(
          power(sin(radians(d.latitude - p_lat) / 2), 2) +
          cos(radians(p_lat)) * cos(radians(d.latitude)) *
          power(sin(radians(d.longitude - p_lng) / 2), 2)
        ))
      ) as distance_m
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
      )
  )
  select
    c.id,
    c.type,
    c.unlock_radius,
    c.latitude,
    c.longitude,
    c.unlock_at,
    c.expires_at,
    c.created_at,
    c.visibility,
    c.distance_m
  from candidates c
  where c.distance_m <= p_radius_m
  order by
    case when c.unlock_at is not null and c.unlock_at > now() then 1 else 0 end,
    c.distance_m asc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.get_nearby_drops(double precision, double precision, double precision, integer) from public;
grant execute on function public.get_nearby_drops(double precision, double precision, double precision, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_nearby_count: total waiting in radius (not capped by discover limit)
-- ---------------------------------------------------------------------------
create or replace function public.get_nearby_count(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 1000
)
returns integer
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
  select count(*)::integer
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
    )
    and (
      2 * 6371000 * asin(sqrt(
        power(sin(radians(d.latitude - p_lat) / 2), 2) +
        cos(radians(p_lat)) * cos(radians(d.latitude)) *
        power(sin(radians(d.longitude - p_lng) / 2), 2)
      ))
    ) <= p_radius_m;
$$;

revoke all on function public.get_nearby_count(double precision, double precision, double precision) from public;
grant execute on function public.get_nearby_count(double precision, double precision, double precision) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Dual streak: consecutive UTC days with a discovery OR a created Drop
-- ---------------------------------------------------------------------------
create or replace function public.get_discovery_streak(p_user_id uuid default null)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := coalesce(p_user_id, (select auth.uid()));
  streak int := 0;
  expected date := (timezone('utc', now()))::date;
  has_day boolean;
begin
  if uid is null then
    return 0;
  end if;
  if uid <> (select auth.uid()) then
    raise exception 'Not allowed';
  end if;

  has_day :=
    exists (
      select 1 from public.drop_discoveries
      where user_id = uid
        and (timezone('utc', discovered_at))::date = expected
    )
    or exists (
      select 1 from public.drops
      where creator_id = uid
        and (timezone('utc', created_at))::date = expected
    );

  if not has_day then
    expected := expected - 1;
  end if;

  loop
    has_day :=
      exists (
        select 1 from public.drop_discoveries
        where user_id = uid
          and (timezone('utc', discovered_at))::date = expected
      )
      or exists (
        select 1 from public.drops
        where creator_id = uid
          and (timezone('utc', created_at))::date = expected
      );

    if has_day then
      streak := streak + 1;
      expected := expected - 1;
    else
      exit;
    end if;
  end loop;

  return streak;
end;
$$;
