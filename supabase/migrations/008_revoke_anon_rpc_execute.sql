-- Closed-test hardening: revoke anon EXECUTE on SECURITY DEFINER RPCs.
-- Applied remotely as revoke_anon_rpc_execute.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'clear_read_notifications',
        'create_squad_hunt',
        'get_discovery_streak',
        'get_hunt_teaser',
        'get_nearby_drop_by_id',
        'get_nearby_drops',
        'get_squad_distances',
        'invite_squad_friend',
        'join_squad_hunt',
        'mark_all_notifications_read',
        'notify_drop_reaction',
        'ping_squad_location',
        'purge_my_notifications',
        'record_nearby_notification',
        'trim_user_notifications',
        'unlock_drop'
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon;',
      r.name,
      r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;',
      r.name,
      r.args
    );
  END LOOP;
END $$;
