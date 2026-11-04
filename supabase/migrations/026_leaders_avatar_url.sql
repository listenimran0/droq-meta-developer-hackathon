-- Days-outside board: include avatar_url so leaders feel human

drop function if exists public.get_days_outside_leaders(integer);

create or replace function public.get_days_outside_leaders(p_limit integer default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  days_outside integer,
  is_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with uid as (
    select auth.uid() as id
  ),
  windowed as (
    select
      p.id as user_id,
      p.username,
      p.display_name,
      p.avatar_url,
      (
        select count(*)::integer from (
          select (timezone('utc', dd.discovered_at))::date as d
          from public.drop_discoveries dd
          where dd.user_id = p.id
            and dd.discovered_at >= (timezone('utc', now()) - interval '30 days')
          union
          select (timezone('utc', dr.created_at))::date as d
          from public.drops dr
          where dr.creator_id = p.id
            and dr.created_at >= (timezone('utc', now()) - interval '30 days')
        ) days
      ) as days_outside
    from public.profiles p
    where (select id from uid) is not null
      and (
        p.username is not null
        or p.display_name is not null
        or p.id = (select id from uid)
      )
  )
  select
    w.user_id,
    w.username,
    w.display_name,
    w.avatar_url,
    w.days_outside,
    (w.user_id = (select id from uid)) as is_me
  from windowed w
  where w.days_outside > 0
  order by w.days_outside desc, w.username nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.get_days_outside_leaders(integer) from public;
grant execute on function public.get_days_outside_leaders(integer) to authenticated, service_role;
