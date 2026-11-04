-- DB-backed rate limit for the ai-narrator edge function.
-- The old per-isolate Map never tripped (each cold isolate starts empty), so
-- model spend was effectively unbounded. This counter is shared across all
-- isolates. Only the service role (edge function) can call it.
CREATE TABLE IF NOT EXISTS public.ai_calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  bucket text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_calls_user_bucket_at_idx
  ON public.ai_calls (user_id, bucket, at DESC);
ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY; -- no policies: deny all

-- Returns true and records the call when under the limit, false otherwise.
CREATE OR REPLACE FUNCTION public.ai_rate_check(
  p_user uuid,
  p_bucket text,
  p_limit int,
  p_window_secs int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent int;
BEGIN
  -- Serialize per user+bucket so concurrent calls can't both slip under.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_bucket, 0));
  DELETE FROM public.ai_calls WHERE user_id = p_user AND at < now() - interval '1 day';
  SELECT count(*) INTO recent FROM public.ai_calls
   WHERE user_id = p_user AND bucket = p_bucket
     AND at > now() - make_interval(secs => p_window_secs);
  IF recent >= p_limit THEN
    RETURN false;
  END IF;
  INSERT INTO public.ai_calls (user_id, bucket) VALUES (p_user, p_bucket);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_rate_check(uuid, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rate_check(uuid, text, int, int) TO service_role;
REVOKE ALL ON TABLE public.ai_calls FROM anon, authenticated;
