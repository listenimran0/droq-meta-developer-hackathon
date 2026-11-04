-- Surface profile avatar_url on reaction / contribution feeds and squad distances

create or replace function public.list_drop_reactions_page(
  p_drop_id uuid,
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 50));
  r record;
  v_items jsonb := '[]'::jsonb;
  v_count int := 0;
  v_next jsonb := null;
begin
  for r in
    select
      rx.id,
      rx.drop_id,
      rx.user_id,
      rx.emoji,
      rx.note,
      rx.created_at,
      p.username,
      p.display_name,
      p.avatar_url
    from public.drop_reactions rx
    left join public.profiles p on p.id = rx.user_id
    where rx.drop_id = p_drop_id
      and (
        p_cursor_created_at is null
        or p_cursor_id is null
        or (rx.created_at, rx.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by rx.created_at desc, rx.id desc
    limit v_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > v_limit then
      exit;
    end if;
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'id', r.id,
        'drop_id', r.drop_id,
        'user_id', r.user_id,
        'emoji', r.emoji,
        'note', r.note,
        'created_at', r.created_at,
        'profiles', case
          when r.username is null and r.display_name is null and r.avatar_url is null then null
          else jsonb_build_object(
            'username', r.username,
            'display_name', r.display_name,
            'avatar_url', r.avatar_url
          )
        end
      )
    );
    v_next := jsonb_build_object('created_at', r.created_at, 'id', r.id);
  end loop;

  if v_count <= v_limit then
    v_next := null;
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

create or replace function public.list_drop_contributions_page(
  p_drop_id uuid,
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 50));
  r record;
  v_items jsonb := '[]'::jsonb;
  v_count int := 0;
  v_next jsonb := null;
begin
  for r in
    select
      c.id,
      c.drop_id,
      c.author_id,
      c.content,
      c.media_path,
      c.created_at,
      p.username,
      p.display_name,
      p.avatar_url
    from public.drop_contributions c
    left join public.profiles p on p.id = c.author_id
    where c.drop_id = p_drop_id
      and (
        p_cursor_created_at is null
        or p_cursor_id is null
        or (c.created_at, c.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by c.created_at desc, c.id desc
    limit v_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > v_limit then
      exit;
    end if;
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'id', r.id,
        'drop_id', r.drop_id,
        'author_id', r.author_id,
        'content', r.content,
        'media_path', r.media_path,
        'created_at', r.created_at,
        'profiles', case
          when r.username is null and r.display_name is null and r.avatar_url is null then null
          else jsonb_build_object(
            'username', r.username,
            'display_name', r.display_name,
            'avatar_url', r.avatar_url
          )
        end
      )
    );
    v_next := jsonb_build_object('created_at', r.created_at, 'id', r.id);
  end loop;

  if v_count <= v_limit then
    v_next := null;
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

drop function if exists public.get_squad_distances(uuid);

create or replace function public.get_squad_distances(p_hunt_id uuid)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
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
    p.avatar_url,
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

revoke all on function public.list_drop_reactions_page(uuid, integer, timestamptz, uuid) from public, anon;
revoke all on function public.list_drop_contributions_page(uuid, integer, timestamptz, uuid) from public, anon;
revoke all on function public.get_squad_distances(uuid) from public, anon;
grant execute on function public.list_drop_reactions_page(uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.list_drop_contributions_page(uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.get_squad_distances(uuid) to authenticated;
