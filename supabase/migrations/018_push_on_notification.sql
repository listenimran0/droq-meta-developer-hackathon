-- Remote Expo push when social notifications are inserted.
-- nearby_drop stays local-only (device already sounds for proximity).

create extension if not exists pg_net;

create or replace function public.notify_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  req_id bigint;
  endpoint text := 'https://ughruhvqqarlerxwzjoz.supabase.co/functions/v1/push';
  -- Public anon key is enough to pass Edge Function JWT gate; the function
  -- re-loads the row with the service role before sending.
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaHJ1aHZxcWFybGVyeHd6am96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NzE3NjQsImV4cCI6MjEwNDE0Nzc2NH0.WCEYzbzqJ_Cw-mDXOEy805desl7raQXnIppiD7l9xwA';
begin
  -- Skip proximity alerts — app fires local OS notification with sound.
  if new.kind = 'nearby_drop' then
    return new;
  end if;

  begin
    select net.http_post(
      url := endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'apikey', anon_key
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'notifications',
        'schema', 'public',
        'record', jsonb_build_object(
          'id', new.id,
          'user_id', new.user_id,
          'kind', new.kind,
          'title', new.title,
          'body', new.body,
          'drop_id', new.drop_id,
          'data', coalesce(new.data, '{}'::jsonb),
          'created_at', new.created_at
        )
      ),
      timeout_milliseconds := 5000
    ) into req_id;
  exception when others then
    -- Never block the notification insert if push dispatch fails
    raise warning 'notify_push_on_notification failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_push_on_notification on public.notifications;
create trigger trg_notify_push_on_notification
  after insert on public.notifications
  for each row
  execute function public.notify_push_on_notification();

revoke all on function public.notify_push_on_notification() from public, anon, authenticated;
