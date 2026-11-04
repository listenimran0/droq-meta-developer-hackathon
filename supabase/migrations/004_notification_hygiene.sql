-- Deduplicate unread nearby rows before unique index
delete from public.notifications n
using public.notifications newer
where n.kind = 'nearby_drop'
  and n.read_at is null
  and n.drop_id is not null
  and newer.kind = 'nearby_drop'
  and newer.read_at is null
  and newer.drop_id = n.drop_id
  and newer.user_id = n.user_id
  and newer.created_at > n.created_at;

delete from public.notifications n
where n.ctid in (
  select ctid from (
    select ctid,
      row_number() over (
        partition by user_id, drop_id
        order by created_at desc, id desc
      ) as rn
    from public.notifications
    where kind = 'nearby_drop'
      and read_at is null
      and drop_id is not null
  ) d
  where rn > 1
);

-- Notification hygiene: dedupe nearby, retention caps, user cleanup RPCs

-- Faster unread badges
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- One unread "nearby" per user+drop (stops GPS-poll spam)
create unique index if not exists notifications_unique_unread_nearby
  on public.notifications (user_id, drop_id)
  where kind = 'nearby_drop' and read_at is null and drop_id is not null;


-- Users can delete their own alerts
drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id);

-- Keep each user lean: drop old read, hard-age, then hard cap
create or replace function public.trim_user_notifications(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where user_id = p_user_id
    and read_at is not null
    and created_at < now() - interval '14 days';

  delete from public.notifications
  where user_id = p_user_id
    and created_at < now() - interval '30 days';

  delete from public.notifications n
  where n.user_id = p_user_id
    and n.ctid in (
      select ctid
      from public.notifications
      where user_id = p_user_id
      order by created_at desc
      offset 60
    );
end;
$$;

revoke all on function public.trim_user_notifications(uuid) from public;
grant execute on function public.trim_user_notifications(uuid) to authenticated;

-- Upsert nearby notice instead of inserting a row every GPS tick
create or replace function public.record_nearby_notification(
  p_drop_id uuid,
  p_distance_label text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_body text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_drop_id is null then
    raise exception 'drop_id required';
  end if;

  v_body := format('Within %s. Walk closer to unlock.', coalesce(p_distance_label, '?'));

  select id into v_id
  from public.notifications
  where user_id = v_uid
    and kind = 'nearby_drop'
    and drop_id = p_drop_id
    and read_at is null
  order by created_at desc
  limit 1;

  if v_id is not null then
    update public.notifications
    set
      body = v_body,
      data = jsonb_build_object('drop_id', p_drop_id),
      created_at = now()
    where id = v_id;
    return v_id;
  end if;

  insert into public.notifications (user_id, kind, title, body, drop_id, data)
  values (
    v_uid,
    'nearby_drop',
    'Something is waiting nearby',
    v_body,
    p_drop_id,
    jsonb_build_object('drop_id', p_drop_id)
  )
  returning id into v_id;

  perform public.trim_user_notifications(v_uid);
  return v_id;
exception
  when unique_violation then
    -- Race: another insert won — refresh that row
    update public.notifications
    set
      body = v_body,
      data = jsonb_build_object('drop_id', p_drop_id),
      created_at = now()
    where user_id = v_uid
      and kind = 'nearby_drop'
      and drop_id = p_drop_id
      and read_at is null
    returning id into v_id;
    return v_id;
end;
$$;

revoke all on function public.record_nearby_notification(uuid, text) from public;
grant execute on function public.record_nearby_notification(uuid, text) to authenticated;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.notifications
  set read_at = now()
  where user_id = v_uid
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.clear_read_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.notifications
  where user_id = v_uid
    and read_at is not null;

  get diagnostics v_count = row_count;
  perform public.trim_user_notifications(v_uid);
  return v_count;
end;
$$;

revoke all on function public.clear_read_notifications() from public;
grant execute on function public.clear_read_notifications() to authenticated;

-- Trim current user on demand (open Alerts / app resume)
create or replace function public.purge_my_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_before integer;
  v_after integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select count(*) into v_before from public.notifications where user_id = v_uid;
  perform public.trim_user_notifications(v_uid);
  select count(*) into v_after from public.notifications where user_id = v_uid;
  return greatest(v_before - v_after, 0);
end;
$$;

revoke all on function public.purge_my_notifications() from public;
grant execute on function public.purge_my_notifications() to authenticated;

-- One-shot: clean existing backlog for everyone (safe, capped)
do $$
declare
  r record;
begin
  for r in select distinct user_id from public.notifications loop
    perform public.trim_user_notifications(r.user_id);
  end loop;
end $$;
