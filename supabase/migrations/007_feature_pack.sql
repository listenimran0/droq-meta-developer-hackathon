-- Feature pack: reactions, streak, hunt teaser, squad hunts

-- Notification kinds
do $$ begin
  alter type public.notification_kind add value if not exists 'drop_reaction';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.notification_kind add value if not exists 'squad_invite';
exception when duplicate_object then null;
end $$;

-- Reactions
create table if not exists public.drop_reactions (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  note text check (note is null or char_length(note) <= 120),
  created_at timestamptz not null default now(),
  unique (drop_id, user_id)
);

create index if not exists drop_reactions_drop_id_idx on public.drop_reactions (drop_id);
create index if not exists drop_reactions_user_id_idx on public.drop_reactions (user_id);

alter table public.drop_reactions enable row level security;

drop policy if exists "React after discovery" on public.drop_reactions;
create policy "React after discovery"
  on public.drop_reactions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.drop_discoveries dd
      where dd.drop_id = drop_reactions.drop_id and dd.user_id = (select auth.uid())
    )
  );

drop policy if exists "Read reactions as creator or self" on public.drop_reactions;
create policy "Read reactions as creator or self"
  on public.drop_reactions for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.drops d
      where d.id = drop_reactions.drop_id and d.creator_id = (select auth.uid())
    )
  );

drop policy if exists "Update own reaction" on public.drop_reactions;
create policy "Update own reaction"
  on public.drop_reactions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.notify_drop_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creator uuid;
  uname text;
begin
  select creator_id into creator from public.drops where id = new.drop_id;
  if creator is null or creator = new.user_id then
    return new;
  end if;
  select coalesce(nullif(display_name, ''), username) into uname
  from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, kind, title, body, drop_id, data)
  values (
    creator,
    'drop_reaction',
    coalesce(uname, 'Someone') || ' reacted ' || new.emoji,
    coalesce(new.note, 'Someone left a reaction on your Drop.'),
    new.drop_id,
    jsonb_build_object('drop_id', new.drop_id, 'emoji', new.emoji)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_drop_reaction on public.drop_reactions;
create trigger trg_notify_drop_reaction
  after insert on public.drop_reactions
  for each row execute function public.notify_drop_reaction();

-- Streak: consecutive calendar days (UTC) with a discovery
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
  has_today boolean;
begin
  if uid is null then
    return 0;
  end if;
  if uid <> (select auth.uid()) then
    raise exception 'Not allowed';
  end if;

  select exists (
    select 1 from public.drop_discoveries
    where user_id = uid
      and (timezone('utc', discovered_at))::date = expected
  ) into has_today;

  if not has_today then
    expected := expected - 1;
  end if;

  loop
    if exists (
      select 1 from public.drop_discoveries
      where user_id = uid
        and (timezone('utc', discovered_at))::date = expected
    ) then
      streak := streak + 1;
      expected := expected - 1;
    else
      exit;
    end if;
  end loop;

  return streak;
end;
$$;

revoke all on function public.get_discovery_streak(uuid) from public;
grant execute on function public.get_discovery_streak(uuid) to authenticated;

-- Hunt teaser: no coordinates / content
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
    )
    and (d.expires_at is null or d.expires_at > now());
$$;

revoke all on function public.get_hunt_teaser(uuid) from public;
grant execute on function public.get_hunt_teaser(uuid) to authenticated;

-- Lightweight nearby lookup for a focused drop (returns coords only if user may discover)
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
    )
    and (d.expires_at is null or d.expires_at > now())
    and not exists (
      select 1 from public.drop_discoveries dd
      where dd.drop_id = d.id and dd.user_id = (select auth.uid())
    );
$$;

revoke all on function public.get_nearby_drop_by_id(uuid, double precision, double precision) from public;
grant execute on function public.get_nearby_drop_by_id(uuid, double precision, double precision) to authenticated;

-- Squad hunts
create table if not exists public.squad_hunts (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.squad_members (
  hunt_id uuid not null references public.squad_hunts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined', 'left')),
  joined_at timestamptz not null default now(),
  primary key (hunt_id, user_id)
);

create index if not exists squad_hunts_drop_id_idx on public.squad_hunts (drop_id);
create index if not exists squad_members_user_id_idx on public.squad_members (user_id);

alter table public.squad_hunts enable row level security;
alter table public.squad_members enable row level security;

drop policy if exists "Squad hunts readable by members" on public.squad_hunts;
create policy "Squad hunts readable by members"
  on public.squad_hunts for select
  to authenticated
  using (
    host_id = (select auth.uid())
    or exists (
      select 1 from public.squad_members m
      where m.hunt_id = squad_hunts.id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "Host creates squad hunt" on public.squad_hunts;
create policy "Host creates squad hunt"
  on public.squad_hunts for insert
  to authenticated
  with check (host_id = (select auth.uid()));

drop policy if exists "Squad members readable by members" on public.squad_members;
create policy "Squad members readable by members"
  on public.squad_members for select
  to authenticated
  using (
    exists (
      select 1 from public.squad_hunts h
      where h.id = squad_members.hunt_id
        and (
          h.host_id = (select auth.uid())
          or exists (
            select 1 from public.squad_members m2
            where m2.hunt_id = h.id and m2.user_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "Host invites squad members" on public.squad_members;
create policy "Host invites squad members"
  on public.squad_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.squad_hunts h
      where h.id = hunt_id and h.host_id = (select auth.uid())
    )
    or user_id = (select auth.uid())
  );

drop policy if exists "Members update own squad status" on public.squad_members;
create policy "Members update own squad status"
  on public.squad_members for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.squad_hunts h
      where h.id = hunt_id and h.host_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.squad_hunts h
      where h.id = hunt_id and h.host_id = (select auth.uid())
    )
  );

create or replace function public.create_squad_hunt(p_drop_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  hunt_id uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not exists (
    select 1 from public.drops d
    where d.id = p_drop_id
      and d.status = 'active'
      and (
        d.creator_id = uid
        or exists (
          select 1 from public.drop_discoveries dd
          where dd.drop_id = d.id and dd.user_id = uid
        )
      )
  ) then
    raise exception 'Drop not available for squad';
  end if;

  insert into public.squad_hunts (drop_id, host_id)
  values (p_drop_id, uid)
  returning id into hunt_id;

  insert into public.squad_members (hunt_id, user_id, status)
  values (hunt_id, uid, 'joined');

  return hunt_id;
end;
$$;

revoke all on function public.create_squad_hunt(uuid) from public;
grant execute on function public.create_squad_hunt(uuid) to authenticated;

create or replace function public.invite_squad_friend(p_hunt_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  drop_ref uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not exists (
    select 1 from public.squad_hunts where id = p_hunt_id and host_id = uid
  ) then
    raise exception 'Only host can invite';
  end if;
  if not public.are_friends(uid, p_user_id) then
    raise exception 'You can only invite friends';
  end if;

  insert into public.squad_members (hunt_id, user_id, status)
  values (p_hunt_id, p_user_id, 'invited')
  on conflict (hunt_id, user_id) do update set status = 'invited';

  select drop_id into drop_ref from public.squad_hunts where id = p_hunt_id;

  insert into public.notifications (user_id, kind, title, body, drop_id, data)
  values (
    p_user_id,
    'squad_invite',
    'Squad hunt invite',
    'A friend invited you to hunt a Drop together.',
    drop_ref,
    jsonb_build_object('hunt_id', p_hunt_id, 'drop_id', drop_ref)
  );
end;
$$;

revoke all on function public.invite_squad_friend(uuid, uuid) from public;
grant execute on function public.invite_squad_friend(uuid, uuid) to authenticated;

create or replace function public.join_squad_hunt(p_hunt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not signed in'; end if;
  update public.squad_members
  set status = 'joined', joined_at = now()
  where hunt_id = p_hunt_id and user_id = uid;
  if not found then
    raise exception 'Invite not found';
  end if;
end;
$$;

revoke all on function public.join_squad_hunt(uuid) from public;
grant execute on function public.join_squad_hunt(uuid) to authenticated;

-- Distances for joined members; uses caller's lat/lng only for self row optional —
-- actually computes each member needs their own position. MVP: return drop distance
-- for caller only + list of joined member names (without their GPS).
-- Better MVP: store last_lat/lng on squad_members updated by client.
alter table public.squad_members
  add column if not exists last_lat double precision,
  add column if not exists last_lng double precision,
  add column if not exists last_seen_at timestamptz;

create or replace function public.ping_squad_location(
  p_hunt_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not signed in'; end if;
  update public.squad_members
  set last_lat = p_lat, last_lng = p_lng, last_seen_at = now(), status = 'joined'
  where hunt_id = p_hunt_id and user_id = uid;
  if not found then
    raise exception 'Not in this squad';
  end if;
end;
$$;

revoke all on function public.ping_squad_location(uuid, double precision, double precision) from public;
grant execute on function public.ping_squad_location(uuid, double precision, double precision) to authenticated;

create or replace function public.get_squad_distances(p_hunt_id uuid)
returns table (
  user_id uuid,
  display_name text,
  username text,
  distance_m double precision,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    coalesce(nullif(p.display_name, ''), p.username) as display_name,
    p.username,
    case
      when m.last_lat is null or m.last_lng is null then null
      else (2 * 6371000 * asin(sqrt(
        power(sin(radians(d.latitude - m.last_lat) / 2), 2) +
        cos(radians(m.last_lat)) * cos(radians(d.latitude)) *
        power(sin(radians(d.longitude - m.last_lng) / 2), 2)
      )))
    end as distance_m,
    m.status
  from public.squad_members m
  join public.squad_hunts h on h.id = m.hunt_id
  join public.drops d on d.id = h.drop_id
  join public.profiles p on p.id = m.user_id
  where m.hunt_id = p_hunt_id
    and (select auth.uid()) is not null
    and exists (
      select 1 from public.squad_members me
      where me.hunt_id = p_hunt_id and me.user_id = (select auth.uid())
    )
  order by distance_m nulls last;
$$;

revoke all on function public.get_squad_distances(uuid) from public;
grant execute on function public.get_squad_distances(uuid) to authenticated;

grant select, insert, update, delete on public.drop_reactions to authenticated;
grant select, insert, update, delete on public.squad_hunts to authenticated;
grant select, insert, update, delete on public.squad_members to authenticated;
