-- P3: place challenges (walk zones with find goals)

create table if not exists public.place_challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_m integer not null default 700
    check (radius_m > 0 and radius_m <= 5000),
  goal_count integer not null default 3
    check (goal_count > 0 and goal_count <= 50),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists place_challenges_active_idx
  on public.place_challenges (active)
  where active;

alter table public.place_challenges enable row level security;

drop policy if exists "Anyone authenticated can read active challenges" on public.place_challenges;
create policy "Anyone authenticated can read active challenges"
  on public.place_challenges for select
  to authenticated
  using (active = true);

grant select on public.place_challenges to authenticated;

-- Progress: discoveries whose Drop sits inside the challenge circle
create or replace function public.get_my_place_challenges()
returns table (
  id uuid,
  slug text,
  title text,
  subtitle text,
  center_lat double precision,
  center_lng double precision,
  radius_m integer,
  goal_count integer,
  found_count integer,
  complete boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with uid as (
    select auth.uid() as id
  ),
  scored as (
    select
      c.id,
      c.slug,
      c.title,
      c.subtitle,
      c.center_lat,
      c.center_lng,
      c.radius_m,
      c.goal_count,
      (
        select count(distinct dd.drop_id)::integer
        from public.drop_discoveries dd
        join public.drops d on d.id = dd.drop_id
        where dd.user_id = (select id from uid)
          and (
            2 * 6371000 * asin(sqrt(
              power(sin(radians(d.latitude - c.center_lat) / 2), 2) +
              cos(radians(c.center_lat)) * cos(radians(d.latitude)) *
              power(sin(radians(d.longitude - c.center_lng) / 2), 2)
            ))
          ) <= c.radius_m
      ) as found_count
    from public.place_challenges c
    where c.active = true
      and (select id from uid) is not null
  )
  select
    s.id,
    s.slug,
    s.title,
    s.subtitle,
    s.center_lat,
    s.center_lng,
    s.radius_m,
    s.goal_count,
    s.found_count,
    (s.found_count >= s.goal_count) as complete
  from scored s
  order by (s.found_count >= s.goal_count) asc, s.found_count desc, s.title asc;
$$;

revoke all on function public.get_my_place_challenges() from public;
grant execute on function public.get_my_place_challenges() to authenticated, service_role;

-- Seed Dhaka launch zones (idempotent by slug)
insert into public.place_challenges (
  slug, title, subtitle, center_lat, center_lng, radius_m, goal_count, active
) values
(
  'dhanmondi-lake',
  'Dhanmondi Lake',
  'Find 3 Drops around the water.',
  23.7462, 90.3745, 650, 3, true
),
(
  'hatirjheel',
  'Hatirjheel',
  'Find 3 Drops along the lakeside path.',
  23.7688, 90.4144, 700, 3, true
)
on conflict (slug) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  radius_m = excluded.radius_m,
  goal_count = excluded.goal_count,
  active = excluded.active;
