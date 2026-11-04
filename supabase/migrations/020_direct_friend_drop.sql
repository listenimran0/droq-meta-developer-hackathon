-- Direct friend Drop: column, constraints, nearby/unlock/teaser + RLS

alter table public.drops
  add column if not exists recipient_id uuid references public.profiles(id) on delete set null;

create index if not exists drops_recipient_id_idx
  on public.drops (recipient_id)
  where recipient_id is not null;

alter table public.drops drop constraint if exists drops_direct_recipient_chk;
alter table public.drops
  add constraint drops_direct_recipient_chk check (
    (visibility = 'direct' and recipient_id is not null)
    or (visibility <> 'direct' and recipient_id is null)
  );

create or replace function public.validate_direct_drop_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visibility = 'direct' then
    if new.recipient_id is null then
      raise exception 'Pick a friend for a direct Drop';
    end if;
    if new.recipient_id = new.creator_id then
      raise exception 'You can’t leave a direct Drop for yourself';
    end if;
    if not public.are_friends(new.creator_id, new.recipient_id) then
      raise exception 'You can only leave a direct Drop for a friend';
    end if;
  else
    new.recipient_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_direct_drop_recipient on public.drops;
create trigger trg_validate_direct_drop_recipient
  before insert or update on public.drops
  for each row
  execute function public.validate_direct_drop_recipient();

-- Notify recipient when a direct Drop is planted
create or replace function public.notify_direct_drop_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
begin
  if new.visibility <> 'direct' or new.recipient_id is null then
    return new;
  end if;
  select coalesce(nullif(display_name, ''), username) into uname
  from public.profiles where id = new.creator_id;
  insert into public.notifications (user_id, kind, title, body, drop_id, data)
  values (
    new.recipient_id,
    'system',
    coalesce(uname, 'A friend') || ' left something for you',
    'Only you can find it — walk until it unlocks. No map pin.',
    new.id,
    jsonb_build_object('drop_id', new.id, 'kind', 'direct_drop')
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_direct_drop_recipient on public.drops;
create trigger trg_notify_direct_drop_recipient
  after insert on public.drops
  for each row
  execute function public.notify_direct_drop_recipient();

-- RLS: recipients can read their direct Drops (metadata; content still via unlock flow)
drop policy if exists "Public active drops are readable" on public.drops;
create policy "Active drops are readable"
  on public.drops for select
  to authenticated
  using (
    status = 'active'
    and (
      visibility = 'public'
      or creator_id = (select auth.uid())
      or (
        visibility = 'friends'
        and public.are_friends((select auth.uid()), creator_id)
      )
      or (
        visibility = 'direct'
        and recipient_id = (select auth.uid())
        and public.are_friends((select auth.uid()), creator_id)
      )
      or exists (
        select 1 from public.drop_discoveries d
        where d.drop_id = drops.id and d.user_id = (select auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- get_nearby_drops
-- ---------------------------------------------------------------------------
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
        or (
          d.visibility = 'direct'
          and d.recipient_id = (select auth.uid())
          and public.are_friends((select auth.uid()), d.creator_id)
        )
      )
      and d.latitude between b.min_lat and b.max_lat
      and d.longitude between b.min_lng and b.max_lng
      and (d.expires_at is null or d.expires_at > now())
      and d.creator_id <> (select auth.uid())
      and not exists (
        select 1 from public.drop_discoveries dd
        where dd.drop_id = d.id and dd.user_id = (select auth.uid())
      )
      and not exists (
        select 1
        from public.drops pred
        where pred.next_drop_id = d.id
          and pred.status = 'active'
          and not exists (
            select 1 from public.drop_discoveries dd2
            where dd2.drop_id = pred.id
              and dd2.user_id = (select auth.uid())
          )
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

-- ---------------------------------------------------------------------------
-- get_nearby_count
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
      or (
        d.visibility = 'direct'
        and d.recipient_id = (select auth.uid())
        and public.are_friends((select auth.uid()), d.creator_id)
      )
    )
    and d.latitude between b.min_lat and b.max_lat
    and d.longitude between b.min_lng and b.max_lng
    and (d.expires_at is null or d.expires_at > now())
    and d.creator_id <> (select auth.uid())
    and not exists (
      select 1 from public.drop_discoveries dd
      where dd.drop_id = d.id and dd.user_id = (select auth.uid())
    )
    and not exists (
      select 1
      from public.drops pred
      where pred.next_drop_id = d.id
        and pred.status = 'active'
        and not exists (
          select 1 from public.drop_discoveries dd2
          where dd2.drop_id = pred.id
            and dd2.user_id = (select auth.uid())
        )
    )
    and (
      2 * 6371000 * asin(sqrt(
        power(sin(radians(d.latitude - p_lat) / 2), 2) +
        cos(radians(p_lat)) * cos(radians(d.latitude)) *
        power(sin(radians(d.longitude - p_lng) / 2), 2)
      ))
    ) <= p_radius_m;
$$;

-- ---------------------------------------------------------------------------
-- get_nearby_drop_by_id
-- ---------------------------------------------------------------------------
create or replace function public.get_nearby_drop_by_id(
  p_drop_id uuid,
  p_lat double precision,
  p_lng double precision
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
    (2 * 6371000 * asin(sqrt(
      power(sin(radians(d.latitude - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(d.latitude)) *
      power(sin(radians(d.longitude - p_lng) / 2), 2)
    ))) as distance_m
  from public.drops d
  where d.id = p_drop_id
    and (select auth.uid()) is not null
    and d.status = 'active'
    and d.creator_id <> (select auth.uid())
    and (
      d.visibility = 'public'
      or (d.visibility = 'friends' and public.are_friends((select auth.uid()), d.creator_id))
      or (
        d.visibility = 'direct'
        and d.recipient_id = (select auth.uid())
        and public.are_friends((select auth.uid()), d.creator_id)
      )
    )
    and (d.expires_at is null or d.expires_at > now())
    and not exists (
      select 1 from public.drop_discoveries dd
      where dd.drop_id = d.id and dd.user_id = (select auth.uid())
    );
$$;

-- ---------------------------------------------------------------------------
-- get_hunt_teaser
-- ---------------------------------------------------------------------------
create or replace function public.get_hunt_teaser(p_drop_id uuid)
returns table (
  id uuid,
  type public.drop_type,
  unlock_at timestamptz,
  locked boolean,
  visibility public.drop_visibility
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.type,
    d.unlock_at,
    (d.unlock_at is not null and d.unlock_at > now()) as locked,
    d.visibility
  from public.drops d
  where d.id = p_drop_id
    and d.status = 'active'
    and (select auth.uid()) is not null
    and (
      d.visibility = 'public'
      or d.creator_id = (select auth.uid())
      or (d.visibility = 'friends' and public.are_friends((select auth.uid()), d.creator_id))
      or (
        d.visibility = 'direct'
        and d.recipient_id = (select auth.uid())
        and public.are_friends((select auth.uid()), d.creator_id)
      )
    )
    and (d.expires_at is null or d.expires_at > now());
$$;

-- ---------------------------------------------------------------------------
-- unlock_drop
-- ---------------------------------------------------------------------------
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
  is_trail_stop boolean := false;
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
  if d.visibility = 'direct' then
    if d.creator_id <> uid and d.recipient_id <> uid then
      raise exception 'This Drop is for someone else';
    end if;
    if d.recipient_id = uid and not public.are_friends(uid, d.creator_id) then
      raise exception 'Drop is friends-only';
    end if;
  end if;
  if d.unlock_at is not null and d.unlock_at > now() then
    raise exception 'Drop is time-locked';
  end if;
  if d.expires_at is not null and d.expires_at <= now() then
    raise exception 'Drop expired';
  end if;

  if exists (
    select 1
    from public.drops pred
    where pred.next_drop_id = d.id
      and pred.status = 'active'
      and not exists (
        select 1 from public.drop_discoveries dd
        where dd.drop_id = pred.id and dd.user_id = uid
      )
  ) and d.creator_id <> uid then
    raise exception 'Complete the previous trail stop first';
  end if;

  select exists (
    select 1 from public.drops pred where pred.next_drop_id = d.id and pred.status = 'active'
  ) into is_trail_stop;

  if p_accuracy is not null and p_accuracy > 150 then
    raise exception 'Location accuracy too low';
  end if;

  dist_m := 2 * earth_r * asin(sqrt(
    power(sin(radians(d.latitude - p_lat) / 2), 2) +
    cos(radians(p_lat)) * cos(radians(d.latitude)) *
    power(sin(radians(d.longitude - p_lng) / 2), 2)
  ));

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

    if is_trail_stop or d.next_drop_id is not null then
      insert into public.notifications (user_id, kind, title, body, drop_id, data)
      values (
        d.creator_id,
        'chain_progress',
        'Someone is on your trail',
        coalesce(d.title, 'A finder unlocked the next stop.'),
        d.id,
        jsonb_build_object('drop_id', d.id, 'next_drop_id', d.next_drop_id)
      );
    end if;
  end if;

  return d;
end;
$$;
