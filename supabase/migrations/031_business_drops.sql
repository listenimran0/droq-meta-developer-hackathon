-- Business drops + aggregate-only "Verified visits" insights for creators.
ALTER TABLE public.drops
  ADD COLUMN IF NOT EXISTS is_business boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_name text;

ALTER TABLE public.drops
  DROP CONSTRAINT IF EXISTS drops_business_name_len;
ALTER TABLE public.drops
  ADD CONSTRAINT drops_business_name_len
  CHECK (business_name IS NULL OR char_length(business_name) <= 60);

-- Aggregates for the caller's OWN drops only. Never returns finder identities.
-- A "verified visit" is a drop_discoveries row, i.e. unlock_drop already
-- verified the visitor was within the unlock radius. The creator's own
-- unlocks are excluded.
CREATE OR REPLACE FUNCTION public.get_my_business_insights(p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := (select auth.uid());
  days int := least(greatest(coalesce(p_days, 7), 1), 90);
  since timestamptz;
  result jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  since := date_trunc('day', now()) - ((days - 1) * interval '1 day');

  WITH visits AS (
    SELECT dd.drop_id, dd.user_id, dd.discovered_at
    FROM public.drop_discoveries dd
    JOIN public.drops d ON d.id = dd.drop_id
    WHERE d.creator_id = uid
      AND dd.user_id <> uid
      AND dd.discovered_at >= since
  ),
  per_drop AS (
    SELECT d.id AS drop_id,
           d.title,
           d.type::text AS type,
           d.is_business,
           d.business_name,
           count(v.*)::int AS unlock_count,
           count(DISTINCT v.user_id)::int AS unique_visitors,
           max(v.discovered_at) AS last_unlock_at
    FROM public.drops d
    JOIN visits v ON v.drop_id = d.id
    WHERE d.creator_id = uid
    GROUP BY d.id
    ORDER BY unlock_count DESC, last_unlock_at DESC
    LIMIT 20
  ),
  series AS (
    SELECT gs::date AS day,
           (SELECT count(*)::int FROM visits v WHERE v.discovered_at::date = gs::date) AS visits
    FROM generate_series(since::date, now()::date, interval '1 day') AS gs
  )
  SELECT jsonb_build_object(
    'days', days,
    'total_visits', (SELECT count(*)::int FROM visits),
    'unique_visitors', (SELECT count(DISTINCT user_id)::int FROM visits),
    'top_drops', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM per_drop p), '[]'::jsonb),
    'daily', coalesce((SELECT jsonb_agg(jsonb_build_object('day', s.day, 'visits', s.visits) ORDER BY s.day) FROM series s), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_business_insights(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_business_insights(int) TO authenticated;
