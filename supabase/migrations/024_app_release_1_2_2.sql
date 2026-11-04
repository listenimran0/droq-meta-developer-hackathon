-- Keep in-app update prompt aligned with closed-test / store build 1.2.2.
update public.app_release
set
  latest_version = '1.2.2',
  min_version = '1.0.0',
  android_version_code = 7,
  force_update = false,
  enabled = true,
  message = 'DROQ 1.2.2 — Found history cleanup, full-size photos, brand polish, and Play-ready legal links.',
  updated_at = now()
where id = 1;
