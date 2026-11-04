-- Feature expansion: notifications, friends, analytics, puzzle/chain/evolve/human

-- Push tokens
create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.user_push_tokens enable row level security;

create policy "Users manage own push tokens"
  on public.user_push_tokens for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- In-app + push notification feed
create type public.notification_kind as enum (
  'nearby_drop',
  'drop_discovered',
  'friend_request',
  'friend_accepted',
  'chain_progress',
  'system'
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text,
  drop_id uuid references public.drops (id) on delete set null,
  data jsonb default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users read own notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users update own notifications"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Discoverers may insert a discovery notification for the Drop creator
create policy "Insert discovery notifications for creators"
  on public.notifications for insert
  to authenticated
  with check (
    (
      kind = 'drop_discovered'
      and exists (
        select 1 from public.drops d
        where d.id = drop_id and d.creator_id = notifications.user_id
      )
    )
    or auth.uid() = user_id
  );

-- Friends
create type public.friendship_status as enum ('pending', 'accepted', 'blocked');

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);

alter table public.friendships enable row level security;

create policy "Users see own friendships"
  on public.friendships for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users create friend requests"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = requester_id);

create policy "Users update friendships they are in"
  on public.friendships for update
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users delete own friendships"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Puzzle answer + human-chain metadata on drops
alter table public.drops
  add column if not exists puzzle_answer text,
  add column if not exists chain_hint text,
  add column if not exists human_chain_root_id uuid references public.drops (id) on delete set null;

-- Analytics events (cheap append-only)
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  event_name text not null,
  properties jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_name_idx on public.analytics_events (event_name, created_at desc);

alter table public.analytics_events enable row level security;

create policy "Users insert own analytics"
  on public.analytics_events for insert
  to authenticated
  with check (auth.uid() = user_id or user_id is null);

create policy "Users cannot read analytics"
  on public.analytics_events for select
  to authenticated
  using (false);

-- Human chain hops
create table if not exists public.human_chain_hops (
  id uuid primary key default gen_random_uuid(),
  root_drop_id uuid not null references public.drops (id) on delete cascade,
  from_drop_id uuid references public.drops (id) on delete set null,
  to_drop_id uuid not null references public.drops (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create index if not exists human_chain_root_idx on public.human_chain_hops (root_drop_id, created_at);

alter table public.human_chain_hops enable row level security;

create policy "Authenticated can read human chains"
  on public.human_chain_hops for select
  to authenticated
  using (true);

create policy "Users insert own hops"
  on public.human_chain_hops for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Contributions policies (replace deny-all)
drop policy if exists "No access drop_contributions yet" on public.drop_contributions;

create policy "Read contributions for visible drops"
  on public.drop_contributions for select
  to authenticated
  using (
    exists (
      select 1 from public.drops d
      where d.id = drop_id
        and (
          d.creator_id = auth.uid()
          or d.visibility = 'public'
          or exists (
            select 1 from public.drop_discoveries dd
            where dd.drop_id = d.id and dd.user_id = auth.uid()
          )
        )
    )
  );

create policy "Discovered users can contribute"
  on public.drop_contributions for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.drop_discoveries dd
      where dd.drop_id = drop_id and dd.user_id = auth.uid()
    )
  );

-- Chain item policies
drop policy if exists "No access drop_chains yet" on public.drop_chains;
drop policy if exists "No access drop_chain_items yet" on public.drop_chain_items;

create policy "Read chains"
  on public.drop_chains for select to authenticated using (true);

create policy "Create chains"
  on public.drop_chains for insert to authenticated
  with check (auth.uid() = creator_id);

create policy "Read chain items"
  on public.drop_chain_items for select to authenticated using (true);

create policy "Create chain items as owner"
  on public.drop_chain_items for insert to authenticated
  with check (
    exists (
      select 1 from public.drop_chains c
      where c.id = chain_id and c.creator_id = auth.uid()
    )
  );

-- Helper: are two users friends?
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a)
      )
  );
$$;

grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- Update nearby drops to include friends visibility
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
security invoker
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
  where d.status = 'active'
    and (
      d.visibility = 'public'
      or (d.visibility = 'friends' and public.are_friends(auth.uid(), d.creator_id))
    )
    and d.latitude between b.min_lat and b.max_lat
    and d.longitude between b.min_lng and b.max_lng
    and (d.expires_at is null or d.expires_at > now())
    and d.creator_id <> auth.uid()
    and not exists (
      select 1 from public.drop_discoveries dd
      where dd.drop_id = d.id and dd.user_id = auth.uid()
    );
$$;

grant execute on function public.get_nearby_drops(double precision, double precision, double precision) to authenticated;

-- Stronger unlock with anti-spoof hooks + discovery notification
drop function if exists public.unlock_drop(uuid, double precision, double precision, double precision);

create or replace function public.unlock_drop(
  p_drop_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_puzzle_attempt text default null
)
returns public.drops
language plpgsql
security invoker
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
begin
  select * into d from public.drops where id = p_drop_id;
  if not found then
    raise exception 'Drop not found';
  end if;
  if d.status <> 'active' then
    raise exception 'Drop unavailable';
  end if;
  if d.visibility = 'private' and d.creator_id <> auth.uid() then
    raise exception 'Drop is private';
  end if;
  if d.visibility = 'friends' and d.creator_id <> auth.uid() and not public.are_friends(auth.uid(), d.creator_id) then
    raise exception 'Drop is friends-only';
  end if;
  if d.unlock_at is not null and d.unlock_at > now() then
    raise exception 'Drop is time-locked';
  end if;
  if d.expires_at is not null and d.expires_at <= now() then
    raise exception 'Drop expired';
  end if;

  -- Reject absurd GPS accuracy claims
  if p_accuracy is not null and p_accuracy > 150 then
    raise exception 'Location accuracy too low';
  end if;

  dist_m := 2 * earth_r * asin(sqrt(
    power(sin(radians(d.latitude - p_lat) / 2), 2) +
    cos(radians(p_lat)) * cos(radians(d.latitude)) *
    power(sin(radians(d.longitude - p_lng) / 2), 2)
  ));

  buffer_m := coalesce(least(greatest(p_accuracy, 0), 50), 25);
  if dist_m > (d.unlock_radius + buffer_m) then
    raise exception 'Too far from Drop';
  end if;

  -- Speed sanity vs last claimed discovery location
  select claimed_latitude, claimed_longitude, discovered_at
    into last_lat, last_lng, last_at
  from public.drop_discoveries
  where user_id = auth.uid()
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
    -- > 90 m/s (~324 km/h) is suspicious for walking discovery
    if speed_mps > 90 then
      raise exception 'Suspicious movement detected';
    end if;
  end if;

  -- Puzzle gate: must supply correct answer to unlock content path
  if d.type = 'puzzle' and d.puzzle_answer is not null then
    if p_puzzle_attempt is null or lower(trim(p_puzzle_attempt)) <> lower(trim(d.puzzle_answer)) then
      raise exception 'Incorrect puzzle answer';
    end if;
  end if;

  insert into public.drop_discoveries (
    drop_id, user_id, claimed_latitude, claimed_longitude, claimed_accuracy
  ) values (
    p_drop_id, auth.uid(), p_lat, p_lng, p_accuracy
  )
  on conflict (drop_id, user_id) do nothing;

  -- Notify creator (in-app)
  if d.creator_id <> auth.uid() then
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

grant execute on function public.unlock_drop(uuid, double precision, double precision, double precision, text) to authenticated;

-- Update drops select policy for friends
drop policy if exists "Public active drops are readable" on public.drops;

create policy "Readable drops by visibility"
  on public.drops for select
  to authenticated
  using (
    status = 'active'
    and (
      creator_id = auth.uid()
      or visibility = 'public'
      or (visibility = 'friends' and public.are_friends(auth.uid(), creator_id))
      or exists (
        select 1 from public.drop_discoveries d
        where d.drop_id = drops.id and d.user_id = auth.uid()
      )
    )
  );

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Friend notification inserts
drop policy if exists "Insert friend notifications" on public.notifications;
create policy "Insert friend notifications"
  on public.notifications for insert
  to authenticated
  with check (
    kind in (friend_request, friend_accepted)
    and (
      (kind = friend_request and exists (select 1 from public.friendships f where f.addressee_id = notifications.user_id and f.requester_id = auth.uid() and f.status = pending))
      or (kind = friend_accepted and exists (select 1 from public.friendships f where f.requester_id = notifications.user_id and f.addressee_id = auth.uid() and f.status = accepted))
    )
  );
