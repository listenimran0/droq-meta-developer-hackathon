-- ai-narrator resilience: response cache with single-flight, circuit breaker,
-- call telemetry on ai_calls, atomic rate limit, retention.

-- ── telemetry columns on ai_calls ────────────────────────────────────────────
ALTER TABLE public.ai_calls
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS latency_ms int,
  ADD COLUMN IF NOT EXISTS fallback boolean,
  ADD COLUMN IF NOT EXISTS cache text,
  ADD COLUMN IF NOT EXISTS degraded boolean,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS tokens int;
CREATE INDEX IF NOT EXISTS ai_calls_at_idx ON public.ai_calls (at);
CREATE INDEX IF NOT EXISTS ai_calls_action_at_idx ON public.ai_calls (action, at) WHERE action IS NOT NULL;

-- ── response cache (service role only) ───────────────────────────────────────
-- scope = user id for anything derived from a user's own content, 'global' for
-- type-only copy. Values never contain coordinates or locked content.
CREATE TABLE IF NOT EXISTS public.ai_cache (
  key text PRIMARY KEY,
  scope text NOT NULL,
  action text NOT NULL,
  value jsonb,
  lock_until timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_cache_expires_idx ON public.ai_cache (expires_at);
ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_cache FROM anon, authenticated;

-- Single-flight: exactly one caller gets 'claimed' per key; others get 'hit'
-- (value ready) or 'wait' (another caller is producing it).
CREATE OR REPLACE FUNCTION public.ai_cache_claim(
  p_key text, p_scope text, p_action text, p_ttl_secs int, p_lock_secs int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ai_cache%ROWTYPE;
BEGIN
  INSERT INTO public.ai_cache AS c (key, scope, action, value, lock_until, expires_at)
  VALUES (p_key, p_scope, p_action, NULL, now() + make_interval(secs => p_lock_secs), now() + make_interval(secs => p_ttl_secs))
  ON CONFLICT (key) DO UPDATE
    SET value = NULL, scope = excluded.scope, action = excluded.action,
        lock_until = excluded.lock_until, expires_at = excluded.expires_at
    WHERE c.expires_at <= now() OR (c.value IS NULL AND c.lock_until <= now())
  RETURNING c.* INTO r;
  IF FOUND THEN RETURN jsonb_build_object('status', 'claimed'); END IF;

  SELECT * INTO r FROM public.ai_cache WHERE key = p_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'bypass'); END IF;
  IF r.scope <> p_scope THEN RETURN jsonb_build_object('status', 'bypass'); END IF;
  IF r.value IS NOT NULL AND r.expires_at > now() THEN
    RETURN jsonb_build_object('status', 'hit', 'value', r.value);
  END IF;
  RETURN jsonb_build_object('status', 'wait');
END $$;

CREATE OR REPLACE FUNCTION public.ai_cache_get(p_key text, p_scope text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT value FROM public.ai_cache
  WHERE key = p_key AND scope = p_scope AND value IS NOT NULL AND expires_at > now();
$$;

CREATE OR REPLACE FUNCTION public.ai_cache_put(p_key text, p_value jsonb, p_ttl_secs int)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.ai_cache
     SET value = p_value, lock_until = NULL, expires_at = now() + make_interval(secs => p_ttl_secs)
   WHERE key = p_key;
$$;

CREATE OR REPLACE FUNCTION public.ai_cache_release(p_key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.ai_cache WHERE key = p_key AND value IS NULL;
$$;

-- ── circuit breaker (state lives in the DB; edge functions are stateless) ────
CREATE TABLE IF NOT EXISTS public.ai_circuit (
  name text PRIMARY KEY,
  failures int NOT NULL DEFAULT 0,
  window_start timestamptz,
  open_until timestamptz,
  probe_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_circuit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_circuit FROM anon, authenticated;

-- 'closed' | 'open' | 'probe'. The closed path takes no row lock.
CREATE OR REPLACE FUNCTION public.ai_circuit_allow(p_name text, p_probe_secs int DEFAULT 10)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.ai_circuit%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.ai_circuit WHERE name = p_name;
  IF NOT FOUND OR c.open_until IS NULL THEN RETURN 'closed'; END IF;
  IF c.open_until > now() THEN RETURN 'open'; END IF;
  -- half-open: exactly one probe at a time
  SELECT * INTO c FROM public.ai_circuit WHERE name = p_name FOR UPDATE;
  IF c.open_until IS NULL THEN RETURN 'closed'; END IF;
  IF c.open_until > now() THEN RETURN 'open'; END IF;
  IF c.probe_until IS NULL OR c.probe_until <= now() THEN
    UPDATE public.ai_circuit SET probe_until = now() + make_interval(secs => p_probe_secs), updated_at = now() WHERE name = p_name;
    RETURN 'probe';
  END IF;
  RETURN 'open';
END $$;

CREATE OR REPLACE FUNCTION public.ai_circuit_report(
  p_name text, p_ok boolean, p_threshold int, p_window_secs int, p_open_secs int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.ai_circuit%ROWTYPE;
BEGIN
  IF p_ok THEN
    UPDATE public.ai_circuit
       SET failures = 0, window_start = NULL, open_until = NULL, probe_until = NULL, updated_at = now()
     WHERE name = p_name AND (failures > 0 OR open_until IS NOT NULL);
    RETURN;
  END IF;
  INSERT INTO public.ai_circuit (name) VALUES (p_name) ON CONFLICT (name) DO NOTHING;
  SELECT * INTO c FROM public.ai_circuit WHERE name = p_name FOR UPDATE;
  IF c.open_until IS NOT NULL THEN
    -- failed half-open probe (or a straggler): stay open another cycle
    UPDATE public.ai_circuit SET open_until = now() + make_interval(secs => p_open_secs),
           probe_until = NULL, failures = 0, window_start = NULL, updated_at = now() WHERE name = p_name;
    RETURN;
  END IF;
  IF c.window_start IS NULL OR c.window_start < now() - make_interval(secs => p_window_secs) THEN
    c.failures := 1; c.window_start := now();
  ELSE
    c.failures := c.failures + 1;
  END IF;
  IF c.failures >= p_threshold THEN
    UPDATE public.ai_circuit SET open_until = now() + make_interval(secs => p_open_secs),
           probe_until = NULL, failures = 0, window_start = NULL, updated_at = now() WHERE name = p_name;
  ELSE
    UPDATE public.ai_circuit SET failures = c.failures, window_start = c.window_start, updated_at = now() WHERE name = p_name;
  END IF;
END $$;

-- ── telemetry + retention ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_call_log(
  p_user uuid, p_action text, p_latency_ms int, p_fallback boolean,
  p_cache text, p_degraded boolean, p_error text, p_tokens int
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.ai_calls (user_id, bucket, action, latency_ms, fallback, cache, degraded, error, tokens)
  VALUES (p_user, 'log', p_action, p_latency_ms, p_fallback, p_cache, p_degraded, p_error, p_tokens);
$$;

CREATE OR REPLACE FUNCTION public.ai_cleanup() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a int; b int;
BEGIN
  DELETE FROM public.ai_calls WHERE at < now() - interval '7 days';
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM public.ai_cache WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS b = ROW_COUNT;
  RETURN jsonb_build_object('calls_deleted', a, 'cache_deleted', b);
END $$;

-- ── rate limit: atomic per (user, bucket); pruning moved to ai_cleanup ───────
-- pg_advisory_xact_lock serialises concurrent calls for the same user+bucket,
-- so parallel requests cannot both slip under the limit. The old per-call
-- 1-day DELETE is gone (it hid 7-day telemetry and added write load).
CREATE OR REPLACE FUNCTION public.ai_rate_check(
  p_user uuid, p_bucket text, p_limit int, p_window_secs int
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recent int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_bucket, 0));
  SELECT count(*) INTO recent FROM public.ai_calls
   WHERE user_id = p_user AND bucket = p_bucket
     AND at > now() - make_interval(secs => p_window_secs);
  IF recent >= p_limit THEN RETURN false; END IF;
  INSERT INTO public.ai_calls (user_id, bucket) VALUES (p_user, p_bucket);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.ai_cache_claim(text,text,text,int,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_cache_get(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_cache_put(text,jsonb,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_cache_release(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_circuit_allow(text,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_circuit_report(text,boolean,int,int,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_call_log(uuid,text,int,boolean,text,boolean,text,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_cleanup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_rate_check(uuid,text,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_cache_claim(text,text,text,int,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_cache_get(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_cache_put(text,jsonb,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_cache_release(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_circuit_allow(text,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_circuit_report(text,boolean,int,int,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_call_log(uuid,text,int,boolean,text,boolean,text,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_cleanup() TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_rate_check(uuid,text,int,int) TO service_role;
