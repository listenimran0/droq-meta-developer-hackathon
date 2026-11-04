-- Business category + audience/funnel aggregates for the owner's insights.
ALTER TABLE public.drops
  ADD COLUMN IF NOT EXISTS business_category text;
ALTER TABLE public.drops DROP CONSTRAINT IF EXISTS drops_business_category_chk;
ALTER TABLE public.drops
  ADD CONSTRAINT drops_business_category_chk
  CHECK (business_category IS NULL OR business_category IN ('cafe','food','books','shop','art','other'));

-- Funnel lookups read analytics_events by drop id.
CREATE INDEX IF NOT EXISTS analytics_events_drop_idx
  ON public.analytics_events ((properties->>'drop_id'), event_name);

-- Aggregates for the caller's OWN drops only; never returns finder identities.
-- A "verified visit" is a drop_discoveries row (unlock_drop already checked the
-- visitor was inside the unlock radius). Owner's own unlocks are excluded.
-- Hours / weekdays are Asia/Dhaka local time. Audience lists are suppressed
-- until there are at least 3 distinct visitors (small-group privacy).
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
  tz constant text := 'Asia/Dhaka';
  since timestamptz;
  result jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  since := (date_trunc('day', now() AT TIME ZONE tz) - ((days - 1) * interval '1 day')) AT TIME ZONE tz;

  WITH mine AS (
    SELECT id, is_business FROM public.drops WHERE creator_id = uid
  ),
  visits AS (
    SELECT dd.drop_id, dd.user_id, dd.discovered_at
    FROM public.drop_discoveries dd
    JOIN mine m ON m.id = dd.drop_id
    WHERE dd.user_id <> uid AND dd.discovered_at >= since
  ),
  per_drop AS (
    SELECT d.id AS drop_id, d.title, d.type::text AS type, d.is_business, d.business_name,
           d.business_category,
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
           (SELECT count(*)::int FROM visits v WHERE (v.discovered_at AT TIME ZONE tz)::date = gs::date) AS visits
    FROM generate_series((since AT TIME ZONE tz)::date, (now() AT TIME ZONE tz)::date, interval '1 day') AS gs
  ),
  vis_users AS (SELECT DISTINCT user_id FROM visits),
  -- returning = visited 2+ different drops of mine (lifetime), new = otherwise
  lifetime AS (
    SELECT dd.user_id, count(DISTINCT dd.drop_id) AS n
    FROM public.drop_discoveries dd JOIN mine m ON m.id = dd.drop_id
    WHERE dd.user_id IN (SELECT user_id FROM vis_users)
    GROUP BY dd.user_id
  ),
  hours AS (
    SELECT h, (SELECT count(*)::int FROM visits v WHERE extract(hour FROM v.discovered_at AT TIME ZONE tz)::int = h) AS n
    FROM generate_series(0, 23) AS h
  ),
  wdays AS (
    SELECT w, (SELECT count(*)::int FROM visits v WHERE extract(isodow FROM v.discovered_at AT TIME ZONE tz)::int = w) AS n
    FROM generate_series(1, 7) AS w
  ),
  vtypes AS (
    SELECT d.type::text AS type, count(*)::int AS n
    FROM public.drop_discoveries dd
    JOIN public.drops d ON d.id = dd.drop_id
    WHERE dd.user_id IN (SELECT user_id FROM vis_users) AND dd.discovered_at >= since
    GROUP BY d.type
    ORDER BY n DESC, d.type
    LIMIT 5
  ),
  biz AS (SELECT id FROM mine WHERE is_business),
  ev AS (
    SELECT e.event_name, e.user_id, e.created_at, (e.properties->>'drop_id')::uuid AS drop_id
    FROM public.analytics_events e
    WHERE e.event_name IN ('quest_step_shown','sense_shown','quest_step_opened','sense_opened')
      AND e.created_at >= since
      AND e.properties->>'drop_id' ~ '^[0-9a-fA-F-]{36}$'
      AND (e.properties->>'drop_id')::uuid IN (SELECT id FROM biz)
  ),
  opened AS (SELECT * FROM ev WHERE event_name IN ('quest_step_opened','sense_opened')),
  verified AS (
    SELECT v.user_id, v.drop_id
    FROM visits v
    WHERE v.drop_id IN (SELECT id FROM biz)
      AND EXISTS (
        SELECT 1 FROM opened o
        WHERE o.user_id = v.user_id AND o.drop_id = v.drop_id
          AND o.created_at <= v.discovered_at
          AND o.created_at >= v.discovered_at - interval '24 hours'
      )
  ),
  stats AS (
    SELECT
      (SELECT count(*)::int FROM ev WHERE event_name IN ('quest_step_shown','sense_shown')) AS shown,
      (SELECT count(*)::int FROM opened) AS opened,
      (SELECT count(*)::int FROM verified) AS verified,
      (SELECT count(*)::int FROM vis_users) AS uniq
  )
  SELECT jsonb_build_object(
    'days', days,
    'total_visits', (SELECT count(*)::int FROM visits),
    'unique_visitors', (SELECT uniq FROM stats),
    'top_drops', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM per_drop p), '[]'::jsonb),
    'daily', coalesce((SELECT jsonb_agg(jsonb_build_object('day', s.day, 'visits', s.visits) ORDER BY s.day) FROM series s), '[]'::jsonb),
    'audience',
      CASE WHEN (SELECT uniq FROM stats) >= 3 THEN jsonb_build_object(
        'by_hour', (SELECT jsonb_agg(n ORDER BY h) FROM hours),
        'peak_hour', (SELECT h FROM hours ORDER BY n DESC, h LIMIT 1),
        'weekday', (SELECT jsonb_agg(n ORDER BY w) FROM wdays),
        'new_visitors', (SELECT count(*)::int FROM vis_users u LEFT JOIN lifetime l USING (user_id) WHERE coalesce(l.n, 1) < 2),
        'returning_visitors', (SELECT count(*)::int FROM vis_users u JOIN lifetime l USING (user_id) WHERE l.n >= 2),
        'top_visitor_types', coalesce((SELECT jsonb_agg(jsonb_build_object('type', type, 'visits', n)) FROM vtypes), '[]'::jsonb)
      ) ELSE NULL END,
    'funnel', jsonb_build_object(
      'shown', (SELECT shown FROM stats),
      'opened', (SELECT opened FROM stats),
      'verified', (SELECT verified FROM stats)
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_business_insights(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_business_insights(int) TO authenticated;
