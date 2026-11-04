# DROQ

> The internet doesn’t have to live on a screen. It can exist everywhere around you.

DROQ is a mysterious digital layer over the physical world. Users leave digital Drops at real places. Others discover them by physically getting close — no social feed, no followers, no paid map API for the core loop.

## Hackathon submission: Meta Global AI Developer Hackathon (Startup track)

**Pitch.** DROQ is a location game: you leave hidden Drops at real places and others find them by walking, with every unlock verified on the server. For this hackathon we put Meta Muse inside the whole loop, so the app plans your walk, hints while you hunt, helps you write, and turns every find into a shareable card. We also built a Business layer: a café, bookshop or street-food stall can leave a Business drop, get *verified* footfall (people who physically showed up, not clicks), and receive Muse-written insights. The business model is paid placement: a verified Business drop can appear as the single, clearly labelled *Sponsored* stop in a walker's AI Quest.

**Existing before the hackathon.** Droq (core app, v1.2.x) existed before the hackathon: creating and finding Drops, server-verified proximity unlock, Supabase auth / Postgres / RLS / storage, friends, squad races, trails, notifications, English and Bangla UI.

**Built during the hackathon (Oct 26 - Nov 5):**
- **Sense**: one smart pick on Home, ranked locally (distance, theme, freshness, your recent finds, time of day) with a Muse-written reason.
- **Hunt Copilot**: escalating riddle hints while you hunt.
- **Ghost Writer**: clue ideas plus a safety pre-screen; an offer-teaser mode for Business drops.
- **Found Epilogue**: one warm line after you unlock a Drop.
- **Quest Agent with tool calling**: Muse plans a 1-3 stop walk using tools (`get_context`, `get_history`, `get_time`, `list_candidates`, `check_availability`, `submit_quest`), matched to mood, part of day and venue category, with a deterministic rules fallback.
- **Muse Image share card**: a branded 4:5 card (Muse image, headline, epilogue, tagline) captured in the app and shared as an image.
- **Business layer**: Business drops, Verified visits, Audience insights, the Sponsored funnel (suggested, opened, verified) and the Muse Business Brief.
- **Safety and cost controls**: database-backed per-user rate limits, global daily spend caps, server-side validation of every model response, and a non-AI fallback for every feature.
- **Production-readiness layer**: a database-backed circuit breaker around the model API, retry with backoff and `Retry-After`, a single-flight cache so identical concurrent requests share one model call, an atomic per-user rate limit, and call telemetry. Backed by a 26-scenario Muse eval suite (`scripts/muse-eval.mjs`, results in [docs/eval-results.md](docs/eval-results.md)) and a load test (`scripts/load-test.mjs`); the measurements are in the [Scaling and resilience](docs/how-it-works.md#scaling-and-resilience) and [Production telemetry](docs/how-it-works.md#production-telemetry) sections of docs/how-it-works.md. The Meta 429 and outage paths are covered by mocked tests, not live-tested.

The repository history was reset for this submission; the original private repo keeps the full history.

**How it works.** Step by step, with every Muse call and exactly what data it sees: [docs/how-it-works.md](docs/how-it-works.md). The AI feature table is in the [AI (Meta Muse)](#ai-meta-muse) section below.

**Demo video:** (link coming)

**How to try**
1. `npm install`, copy `.env.example` to `.env` and fill the Supabase URL and anon key.
2. `npx expo run:android` (a development build is required; Expo Go is not enough).
3. Sign up inside the app.
4. The Muse key lives **only** as a server-side Supabase secret (`MUSE_API_KEY`) used by the `ai-narrator` edge function. It is never in the client or in this repository. Without it, every AI feature falls back to local templates.

**Roadmap / not built yet**
- Paid billing for Business plans. The in-app plans card is a text-only preview ("Free during beta"); there is no payment flow.
- Meta glasses support.
- Server-side image sharing of the card is done on-device only; there is no web page for shared cards.

## Stack

- **Mobile:** React Native + Expo (SDK 57) + TypeScript + Expo Router
- **Backend:** Supabase (Auth, Postgres, Storage, RLS)
- **Location:** Native GPS + local Haversine distance
- **Maps:** None required for MVP

## Quick start

```bash
cp .env.example .env
# Fill EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY

npm install
npm start
```

### Supabase setup

1. Create a free Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL editor.
3. Run `supabase/migrations/002_storage.sql`.
4. (Optional) Create a user, then run `supabase/seed.sql`.
5. Copy the project URL + **anon** key into `.env`.
6. Never put the service-role key in the app.

### Testing the loop with two accounts

Nearby RPC excludes your own Drops. Create **Account A** to leave Drops, then **Account B** to discover them.

In Supabase Auth settings, disable “Confirm email” while developing so sign-up returns a session immediately.

In `__DEV__` builds, open **Discover** or **Settings** and cycle simulation modes:

- `nearby` → `approaching` → `found` → `time_locked` → `off`

Set `EXPO_PUBLIC_TEST_LOCATION_LAT` / `LNG` for seed-aligned testing.

## Core loop

Open → sense nearby mystery → walk → distance falls → unlock → experience → leave a Drop → repeat.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Expo dev server |
| `npm test` | Unit tests (Haversine, unlock, time locks) |
| `npm run typecheck` | TypeScript |

## Architecture notes

- Nearby query uses a SQL bounding box (`get_nearby_drops`) — PostGIS-ready later.
- Unlock uses server-side Haversine (`unlock_drop`) so client GPS isn’t trusted alone.
- Photos are compressed on-device before upload; voice capped at 30s; video disabled.
- Exact coordinates are never shown in the UI.
- Schema includes stubs for Ghost / Evolving / Chain Drops without implementing full product surfaces yet.

## Cost posture

Designed for Supabase free tier + native device APIs. No Google Maps, Places, Directions, or paid STT.

Full walkthrough of the owner → walker → verified visit → analytics flow, with every Muse call and the data it sees: [docs/how-it-works.md](docs/how-it-works.md).

## AI (Meta Muse)

All model calls run server-side in one Supabase Edge Function (`supabase/functions/ai-narrator`); the Muse key never ships in the app. The model only ever sees drop metadata (type, walking minutes, a social flag), never coordinates or locked content.

| Feature | Muse model | What it does |
| --- | --- | --- |
| **Quest Agent** | Muse Spark, tool calling | Matches walker mood (Chill/Curious/Brave), part of day, history and venue `business_category` via a deterministic fit score (`services/matching.ts`, mirrored in the edge function; the server falls back to a rules plan if the model is down). Each stop gets a *why this fits you* line. Agent loop with `get_context`, `get_history` (recent finds + streak, read server-side), `get_time` (local part of day), `list_candidates`, `check_availability` (server checks drops are active and not time-locked), `submit_quest`. Plans a 1-3 stop walk. Re-validated server-side: unavailable drops are dropped, and at most **one** stop may be a verified Business drop, labelled *Sponsored* in the UI (the paid-placement mechanism; never invented). The real tool trace is shown in the UI. |
| **Found Card** | Muse Image (`muse-image-1.0`) | Shareable AI illustration after you find a Drop. Fixed safe prompt built from drop type only. The on-screen card is a branded 4:5 composition (DROQ wordmark, headline, epilogue subtitle, type + optional Business tag, tagline, Muse credit) over the Muse image; **Share** captures exactly that card with `react-native-view-shot` and shares the PNG via `expo-sharing` (falls back to the raw image, WebP detected from the bytes, then text). *Share text + link* sends a one-line caption with droq.app. |
| **Sense** | Local scoring + Muse Spark | Ranks nearby drops (distance, social, theme, freshness) plus your recent found types (novelty) and the local time of day; Muse explains the pick. Scoring is pure and unit-tested. |
| **Hunt Copilot** | Muse Spark | Escalating riddle hints while you hunt. |
| **Ghost Writer** | Muse Spark | Clue ideas plus a safety pre-screen. With the Business switch on it writes enticing offer teasers instead (never inventing prices or discounts). |
| **Muse Business Brief** | Muse Spark | Summary, 3 tips and a *best time to post an offer* from aggregates only (counts, peak hour, weekday split, new vs returning, sponsored funnel; never visitors, titles or content) on the Verified visits screen. The model's best-time line is only shown if it agrees with the data; otherwise a deterministic line is used. Local template fallback, cached 30 min. |
| **Found Epilogue** | Muse Spark | One warm line after unlocking. |

Safety and cost: JWT verified, DB-backed per-user rate limits (`030_ai_rate_limit.sql`: text 40/min, quest 8/10 min, image 5/hour), output sanitized (no coordinates), and every feature falls back to local logic if the model is unavailable.

Set up: `supabase secrets set MUSE_API_KEY=...`, run migration 030, then `supabase functions deploy ai-narrator`. Check the API with `node scripts/muse-smoke.mjs`.

Provider swap (any OpenAI-compatible LLM): `supabase secrets set LLM_API_KEY=... LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai LLM_MODEL=gemini-2.5-flash IMAGE_MODEL=imagen-3.0-generate-002`. Back to Muse: `supabase secrets unset LLM_API_KEY LLM_BASE_URL LLM_MODEL IMAGE_MODEL`, then redeploy is not needed.
