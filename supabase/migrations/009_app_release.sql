-- App release config for in-app update prompts (public read).
create table if not exists public.app_release (
  id smallint primary key default 1 check (id = 1),
  latest_version text not null,
  min_version text not null default '1.0.0',
  android_version_code integer not null default 1,
  force_update boolean not null default false,
  enabled boolean not null default true,
  message text,
  store_url_android text not null default 'https://play.google.com/store/apps/details?id=com.droq.app',
  store_url_ios text,
  updated_at timestamptz not null default now()
);

alter table public.app_release enable row level security;

drop policy if exists "Anyone can read app_release" on public.app_release;
create policy "Anyone can read app_release"
  on public.app_release
  for select
  to anon, authenticated
  using (true);

revoke all on table public.app_release from public;
grant select on table public.app_release to anon, authenticated;
grant all on table public.app_release to service_role;

insert into public.app_release (
  id,
  latest_version,
  min_version,
  android_version_code,
  force_update,
  enabled,
  message
) values (
  1,
  '1.0.0',
  '1.0.0',
  2,
  false,
  true,
  'A fresher DROQ is ready — smoother screens, better location, and a calmer experience.'
)
on conflict (id) do update set
  latest_version = excluded.latest_version,
  min_version = excluded.min_version,
  android_version_code = excluded.android_version_code,
  force_update = excluded.force_update,
  enabled = excluded.enabled,
  message = excluded.message,
  updated_at = now();
