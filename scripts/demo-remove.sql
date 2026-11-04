-- Removes EVERYTHING demo-seed.sql (v1 and v2) created, plus the demo customer
-- account if one was made (any email starting with demo-seed-). Safe to run repeatedly.
-- Run: Supabase dashboard -> SQL editor -> paste -> Run.
DELETE FROM public.analytics_events WHERE properties->>'demo' = 'true';
DELETE FROM public.analytics_events WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'demo-seed-%');
DELETE FROM public.drops WHERE title LIKE '[DEMO SEED]%';                 -- cascades discoveries
DELETE FROM auth.users WHERE email LIKE 'demo-seed-%';                    -- cascades profiles + discoveries
