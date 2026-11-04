-- Re-harden get_days_outside_leaders: 026 re-created it after 021's revoke,
-- resetting grants to the PUBLIC default (flagged: anon can execute a
-- SECURITY DEFINER fn). Revoke again; grant back to authenticated only.
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
      AND p.proname = 'get_days_outside_leaders'
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
