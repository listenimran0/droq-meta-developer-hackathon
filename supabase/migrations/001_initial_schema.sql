-- DROP MVP Schema
-- Cost-efficient: no PostGIS yet; bounding-box ready; PostGIS-migratable later.

-- Extensions
create extension if not exists "pgcrypto";

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  username text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Drops
create type public.drop_type as enum (
  'memory',
  'message',
  'photo',
  'voice',
  'video',
  'puzzle',
  'challenge',
  'secret',
  'time_capsule'
);

create type public.drop_visibility as enum ('public', 'friends', 'private');
create type public.drop_status as enum ('active', 'expired', 'hidden', 'removed');

create table if not exists public.drops (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  type public.drop_type not null,
  title text,
  content text,
  media_path text,
  latitude double precision not null,
  longitude double precision not null,
  unlock_radius integer not null default 25 check (unlock_radius between 5 and 200),
  visibility public.drop_visibility not null default 'public',
  unlock_at timestamptz, -- Ghost Drop / time lock (null = available now)
  expires_at timestamptz,
  status public.drop_status not null default 'active',
  -- Future: evolving / chain architecture (unused in MVP)
  parent_drop_id uuid references public.drops (id) on delete set null,
  next_drop_id uuid references public.drops (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint drops_lat_check check (latitude between -90 and 90),
  constraint drops_lng_check check (longitude between -180 and 180)
);

create index if not exists drops_created_at_idx on public.drops (created_at desc);
create index if not exists drops_creator_id_idx on public.drops (creator_id);
create index if not exists drops_visibility_idx on public.drops (visibility);
create index if not exists drops_status_idx on public.drops (status);
create index if not exists drops_unlock_at_idx on public.drops (unlock_at);
-- Bounding-box query helpers (PostGIS can replace later)
create index if not exists drops_lat_lng_idx on public.drops (latitude, longitude);
create index if not exists drops_nearby_active_idx
  on public.drops (status, visibility, latitude, longitude)
  where status = 'active';

-- Discoveries
create table if not exists public.drop_discoveries (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  discovered_at timestamptz not null default now(),
  -- Future anti-spoof: claimed location at unlock
  claimed_latitude double precision,
  claimed_longitude double precision,
  claimed_accuracy double precision,
  unique (drop_id, user_id)
);

create index if not exists drop_discoveries_user_id_idx on public.drop_discoveries (user_id);
create index if not exists drop_discoveries_drop_id_idx on public.drop_discoveries (drop_id);

-- Reports
create type public.report_reason as enum (
  'spam',
  'inappropriate',
  'unsafe_location',
  'harassment',
  'other'
);

create table if not exists public.drop_reports (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason public.report_reason not null,
  created_at timestamptz not null default now()
);

create index if not exists drop_reports_drop_id_idx on public.drop_reports (drop_id);
create index if not exists drop_reports_reporter_idx on public.drop_reports (reporter_id, created_at desc);

-- Future: evolving drop contributions (schema only)
create table if not exists public.drop_contributions (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  media_path text,
  created_at timestamptz not null default now()
);

-- Future: chain drops
create table if not exists public.drop_chains (
  id uuid primary key default gen_random_uuid(),
  title text,
  creator_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.drop_chain_items (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.drop_chains (id) on delete cascade,
  drop_id uuid not null references public.drops (id) on delete cascade,
  position integer not null,
  unique (chain_id, position),
  unique (chain_id, drop_id)
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
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

  insert into public.profiles (id, email, username, display_name)
  values (
    new.id,
    new.email,
    final_username,
    coalesce(new.raw_user_meta_data->>'display_name', base_username)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.drops enable row level security;
alter table public.drop_discoveries enable row level security;
alter table public.drop_reports enable row level security;
alter table public.drop_contributions enable row level security;
alter table public.drop_chains enable row level security;
alter table public.drop_chain_items enable row level security;

-- Profiles policies
create policy "Profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Drops: list nearby public/active without leaking private content via select of limited cols in RPC preferred.
-- Public drops readable if active (content gated client-side after discovery; media via storage).
create policy "Public active drops are readable"
  on public.drops for select
  to authenticated
  using (
    status = 'active'
    and (
      visibility = 'public'
      or creator_id = auth.uid()
      or exists (
        select 1 from public.drop_discoveries d
        where d.drop_id = drops.id and d.user_id = auth.uid()
      )
    )
  );

create policy "Users can create own drops"
  on public.drops for insert
  to authenticated
  with check (auth.uid() = creator_id);

create policy "Users can update own drops"
  on public.drops for update
  to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

create policy "Users can delete own drops"
  on public.drops for delete
  to authenticated
  using (auth.uid() = creator_id);

-- Discoveries
create policy "Users can read own discoveries"
  on public.drop_discoveries for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own discoveries"
  on public.drop_discoveries for insert
  to authenticated
  with check (auth.uid() = user_id);

-- No update/delete on discoveries (immutable)

-- Reports (rate limit enforced in app + optional RPC)
create policy "Users can create reports"
  on public.drop_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

create policy "Users can read own reports"
  on public.drop_reports for select
  to authenticated
  using (auth.uid() = reporter_id);

-- Storage bucket (run in dashboard or via API)
-- insert into storage.buckets (id, name, public) values ('drop-media', 'drop-media', false);

-- Bounding-box nearby helper (returns candidates without requiring PostGIS)
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
as $$
  -- Approximate degrees for bounding box (good enough for MVP; PostGIS later)
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
    and d.visibility = 'public'
    and d.latitude between b.min_lat and b.max_lat
    and d.longitude between b.min_lng and b.max_lng
    and (d.expires_at is null or d.expires_at > now())
    and d.creator_id <> auth.uid()
    and not exists (
      select 1 from public.drop_discoveries dd
      where dd.drop_id = d.id and dd.user_id = auth.uid()
    );
$$;

grant execute on function public.get_nearby_drops to authenticated;

-- Unlock / record discovery with claimed location (anti-spoof hooks later)
create or replace function public.unlock_drop(
  p_drop_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null
)
returns public.drops
language plpgsql
security invoker
as $$
declare
  d public.drops;
  dist_m double precision;
  earth_r constant double precision := 6371000;
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
  if d.unlock_at is not null and d.unlock_at > now() then
    raise exception 'Drop is time-locked';
  end if;
  if d.expires_at is not null and d.expires_at <= now() then
    raise exception 'Drop expired';
  end if;

  -- Haversine (server-side proximity verification)
  dist_m := 2 * earth_r * asin(sqrt(
    power(sin(radians(d.latitude - p_lat) / 2), 2) +
    cos(radians(p_lat)) * cos(radians(d.latitude)) *
    power(sin(radians(d.longitude - p_lng) / 2), 2)
  ));

  -- Allow small buffer for GPS inaccuracy
  if dist_m > (d.unlock_radius + coalesce(greatest(p_accuracy, 0), 25)) then
    raise exception 'Too far from Drop';
  end if;

  insert into public.drop_discoveries (
    drop_id, user_id, claimed_latitude, claimed_longitude, claimed_accuracy
  ) values (
    p_drop_id, auth.uid(), p_lat, p_lng, p_accuracy
  )
  on conflict (drop_id, user_id) do nothing;

  return d;
end;
$$;

grant execute on function public.unlock_drop to authenticated;
