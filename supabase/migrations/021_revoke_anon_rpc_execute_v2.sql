-- Harden: revoke anon/PUBLIC execute on SECURITY DEFINER RPCs
-- (post-008 functions reintroduced PUBLIC defaults).

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
        'get_days_outside_leaders',
        'get_discovery_streak',
        'get_hunt_teaser',
        'get_my_place_challenges',
        'get_nearby_count',
        'get_nearby_drop_by_id',
        'get_nearby_drops',
        'get_squad_distances',
        'invite_squad_friend',
        'join_squad_hunt',
        'list_my_squad_hunts',
        'mark_all_notifications_read',
        'notify_direct_drop_recipient',
        'notify_drop_contribution',
        'notify_drop_reaction',
        'ping_squad_location',
        'purge_my_notifications',
        'record_nearby_notification',
        'trim_user_notifications',
        'unlock_drop',
        'validate_direct_drop_recipient'
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
