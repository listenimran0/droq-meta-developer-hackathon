-- P2: squad race window + list active hunts for Home

alter table public.squad_hunts
  add column if not exists ends_at timestamptz;

comment on column public.squad_hunts.ends_at is 'Soft race window end (default 7 days from create)';

-- Backfill open-ended races to 7 days from creation
update public.squad_hunts
set ends_at = created_at + interval '7 days'
where ends_at is null;

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

  insert into public.squad_hunts (drop_id, host_id, ends_at)
  values (p_drop_id, uid, now() + interval '7 days')
  returning id into hunt_id;

  insert into public.squad_members (hunt_id, user_id, status)
  values (hunt_id, uid, 'joined');

  return hunt_id;
end;
$$;

revoke all on function public.create_squad_hunt(uuid) from public;
grant execute on function public.create_squad_hunt(uuid) to authenticated, service_role;

-- Active squad hunts for the signed-in user (joined or invited, not expired)
create or replace function public.list_my_squad_hunts(p_limit integer default 8)
returns table (
  hunt_id uuid,
  drop_id uuid,
  host_id uuid,
  status text,
  created_at timestamptz,
  ends_at timestamptz,
  drop_type public.drop_type,
  member_count integer,
  is_host boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.id as hunt_id,
    h.drop_id,
    h.host_id,
    m.status,
    h.created_at,
    h.ends_at,
    d.type as drop_type,
    (
      select count(*)::integer
      from public.squad_members m2
      where m2.hunt_id = h.id
        and m2.status in ('joined', 'invited')
    ) as member_count,
    (h.host_id = (select auth.uid())) as is_host
  from public.squad_hunts h
  join public.squad_members m on m.hunt_id = h.id and m.user_id = (select auth.uid())
  join public.drops d on d.id = h.drop_id
  where (select auth.uid()) is not null
    and m.status in ('joined', 'invited')
    and d.status = 'active'
    and (h.ends_at is null or h.ends_at > now())
  order by
    case when m.status = 'invited' then 0 else 1 end,
    h.created_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;

revoke all on function public.list_my_squad_hunts(integer) from public;
grant execute on function public.list_my_squad_hunts(integer) to authenticated, service_role;
