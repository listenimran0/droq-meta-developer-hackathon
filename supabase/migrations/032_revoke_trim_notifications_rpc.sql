-- trim_user_notifications(uuid) takes an arbitrary user id and has no auth check.
-- It is only called from other SECURITY DEFINER functions (which run as owner),
-- so signed-in clients must not be able to call it via /rest/v1/rpc.
REVOKE ALL ON FUNCTION public.trim_user_notifications(uuid) FROM PUBLIC, anon, authenticated;
