-- Keep in-app update prompt aligned with shipped app version.
update public.app_release
set
  latest_version = '1.2.1',
  min_version = '1.0.0',
  android_version_code = 6,
  force_update = false,
  enabled = true,
  message = 'DROQ 1.2.1 — clearer create flow, friend Drops, push alerts, and a calmer brand.',
  updated_at = now()
where id = 1;
