-- Keep in-app update prompt aligned with shipped app version.
update public.app_release
set
  latest_version = '1.2.3',
  min_version = '1.0.0',
  android_version_code = 8,
  force_update = false,
  enabled = true,
  message = 'DROQ 1.2.3 — AI Sense pick of the moment, Inspire-me clue ideas, and a calmer Home.',
  updated_at = now()
where id = 1;
