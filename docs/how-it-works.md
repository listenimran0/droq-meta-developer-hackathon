# How DROQ works — the full business flow

Plain English, step by step. **Muse** marks every place Meta's models are used,
and says exactly what data they see. Everything runs inside the app; the only
web calls are the model API (server-side), Google sign-in, and the Play Store.

## The cast

- **Owner** — anyone who turns on the *Business drop* switch. No separate
  account type; it is just a flag on a drop.
- **Walker** — anyone nearby who plays. Walkers are anonymous to owners.
- **The server** — Supabase: the database, the `unlock_drop` check, and one
  edge function (`ai-narrator`) that is the only thing allowed to talk to Muse.
  The Muse key never ships in the app.

## 1. The owner creates a Business drop

1. Profile → Business → *Create a Business drop* (or the switch in Create).
2. They pick a business name and a **category** (café, street food, books,
   shop, art, other), write the offer, and leave the drop where they stand
   (GPS fix required, accuracy checked).
3. **Muse · Ghost Writer** (optional, `clue_options` with `business:true`):
   turns their rough words into three enticing *offer teasers* and runs a
   safety pre-screen.
   *Sees:* the draft text, the drop type, the business name. *Never sees:*
   coordinates or any walker data. It is told not to invent prices or discounts.

Stored: `drops.is_business`, `business_name`, `business_category`.

## 2. A walker gets matched (Quest + Sense)

The walker opens Home. The app already knows the nearby drops (metadata only:
id, type, rounded distance, social flag — no content, no coordinates sent on).

**Quest (Muse · tool-calling agent, `quest_plan`)** — the walker picks 15/30/60
minutes and a mood (Chill / Curious / Brave). The server then:

| Step | Who | What happens | Data the model sees |
| --- | --- | --- | --- |
| Verify | server (no model) | Looks up every candidate: still active? time-locked? business flag/name/category? | — |
| `get_context` | Muse calls, server answers | mood, time budget, language | mood word, minutes |
| `get_history` | Muse calls, server answers | the walker's last finds (types, business categories) and day streak | drop *types*, a number |
| `get_time` | Muse calls, server answers | part of day from the phone's local hour | morning/afternoon/evening/night |
| `list_candidates` | Muse calls, server answers | candidates with walking minutes, a `fit` score, and — for Business drops — category | type, minutes, category, fit |
| `check_availability` | Muse calls, server answers | which candidates are still available | ids + available yes/no |
| `submit_quest` | Muse | 1–3 stops, a one-line teaser and a *why this fits you* line per stop | its own output |

The **fit score** is deterministic: a category-by-mood table plus a
category-by-part-of-day table, plus novelty (types you keep finding score
lower) and proximity. The same tables live in the app
(`services/matching.ts`, unit-tested) and in the edge function. If the model is
down or returns a bad plan, the server returns a **rules plan** from the same
scores (`engine: "rules"`), so the feature never dies.

**Sponsored = paid placement.** The server alone decides which stop is
sponsored: a verified Business drop, **at most one per quest**, never
invented, never boosted in the score. The app labels it *Sponsored* and shows
the business name. Unavailable (time-locked) drops are dropped by the server
even if the model picks them.

**Sense (Muse · `sense_reason`)** — one smart pick on Home. The *ranking* is
local and deterministic (distance, social, theme, freshness, plus your recent
finds and the time of day); Muse only writes the one-line reason.
*Sees:* drop type, a distance bucket, two booleans.

Funnel logging happens **on the server**, so owners can trust it: when a
Business drop is surfaced by Quest or Sense the server records
`quest_step_shown` / `sense_shown`; when the walker taps through the app
records `quest_step_opened` / `sense_opened`.

## 3. The hunt

The walker taps a stop and the Discover screen shows a pulse that gets warmer
as they approach. No pin on a map — distance is the only hint.

**Muse · Hunt Copilot (`hunt_hint`)** — up to four escalating riddle hints.
*Sees:* drop type and hint level. Never coordinates.

## 4. Server-verified unlock

When the walker is close, they tap *Open it*. The `unlock_drop` database
function — not the app, not Muse — checks, in one transaction: signed in; drop
active and not expired or time-locked; visibility rules (friends/direct);
trail order; GPS accuracy ≤ 150 m; distance ≤ unlock radius + accuracy buffer;
no impossible movement (speed check); puzzle answer. If everything passes it
writes one row to `drop_discoveries`. **That row is the "verified visit."**
It also notifies the owner that *a* drop was found (not who found it).

## 5. The offer, the epilogue, the share card

1. The unlocked drop shows the owner's offer and a **Business · {name} ·
   {category}** badge.
2. **Muse · Found Epilogue (`found_epilogue`)** — one warm line.
   *Sees:* drop type only.
3. **Muse · Found Card (`found_card`, Muse Image)** — a fixed, safe prompt built
   from the drop *type* only ("a glowing memory orb in a quiet street at
   dusk"). No text, no faces, no places. Result: a WebP.
4. **The branded card** (4:5, 1080×1350) is composed in the app: the Muse
   image full-bleed, a dark gradient, the DROQ wordmark, the headline "I found
   a hidden Drop", the epilogue as subtitle, drop type (and Business tag), the
   tagline, and the credit "Image by Meta Muse Image". It contains **no
   coordinates, place names or personal data**. *Share* captures exactly that
   view to a PNG and hands the file to the system share sheet
   (`react-native-view-shot` + `expo-sharing`).

## 6. Owner analytics — "Verified visits"

Profile → Business → Verified visits. All numbers come from one SQL function,
`get_my_business_insights`, which only reads the caller's own drops and
returns **aggregates only**:

- Totals, unique visitors, a daily series (14 days).
- **Audience**: peak hour, weekday split, new vs returning (returning = visited
  two or more of your drops), and what visitors also find. Hours and weekdays
  are Asia/Dhaka local time. Hidden until there are at least 3 distinct
  visitors.
- **Sponsored funnel**: suggested → opened → verified visits (a visit counts
  only if that walker opened the drop within the previous 24 hours), with
  conversion %.

**Muse · Business Brief (`business_brief`)** writes a short summary, three
tips and a *best time to post an offer*.
*Sees:* only the numbers above (counts, hours, weekday counts, the funnel, drop
*types*). It never sees visitor ids, drop titles, business names, coordinates
or any content. Output is length-limited, coordinate-stripped, rate limited
(10/hour per user, 1000/day overall) and falls back to a local template.

## What each Muse call is allowed to see (summary)

| Feature | Model | Sees | Never sees |
| --- | --- | --- | --- |
| Ghost Writer (+ offer mode) | Muse Spark | draft, drop type, business name | coordinates, walkers |
| Quest agent | Muse Spark (tools) | mood, minutes, part of day, drop types, categories, fit, availability | coordinates, content, names, identities |
| Sense reason | Muse Spark | type, distance bucket, flags | coordinates, content |
| Hunt hint / Epilogue | Muse Spark | type, hint level | coordinates, content |
| Found Card | Muse Image | drop type → fixed prompt | everything else |
| Business Brief | Muse Spark | aggregate counts | identities, titles, names, content |

## Safety rails

- Every AI response is re-validated on the server and cleaned again in the app.
- Per-user and global daily limits live in the database (`ai_calls`).
- Every AI feature has a non-AI fallback; the demo survives a dead network.
- Owners can never see who visited — only counts.
