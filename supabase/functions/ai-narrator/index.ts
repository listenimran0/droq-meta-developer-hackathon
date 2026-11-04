import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { countsAsFailure as _cf, guardedCall, isDegraded, modelErrorCode, modelFetch, type FetchOpts } from "./resilience.ts";

/**
 * ai-narrator — Muse-powered copy for Sense + Ghost Writer.
 *
 * Deployed with verify_jwt = true: callers send their Supabase user JWT and
 * this function re-validates the drop against the DB before asking the model.
 * The model only ever sees metadata (type, distance bucket, locale, draft
 * text) — never coordinates, never locked content.
 *
 * Server env (never shipped to the client):
 *   MUSE_API_KEY   (secret — `supabase secrets set MUSE_API_KEY="..."`)
 *   MUSE_MODEL     (default "muse-spark-1.3")
 *   MUSE_BASE_URL  (from the Meta hackathon kit; OpenAI-compatible default)
 *
 * Any model failure returns { ok: true, fallback: true } so the client can
 * use its local templates — the demo survives dead networks and bad keys.
 */

const FN_VERSION = 11;

type Action =
  | "sense_reason"
  | "hunt_hint"
  | "clue_options"
  | "found_epilogue"
  | "quest_plan"
  | "found_card"
  | "business_brief";

type NarrateRequest = {
  action: Action;
  /** Drop the copy is about (sense_reason, hunt_hint) */
  drop_id?: string;
  /** User's rough words (clue_options) */
  draft?: string;
  drop_type?: string;
  locale?: "en" | "bn";
  /** Client-computed context, metadata only */
  context?: {
    distance_bucket?: "<100" | "100-400" | "400+";
    is_social?: boolean;
    theme_match?: boolean;
    hint_level?: number;
  };
  /** quest_plan: free-text mood + time budget + nearby candidate metadata */
  intent?: string;
  minutes?: number;
  candidates?: { id?: unknown; type?: unknown; distance_m?: unknown; is_social?: unknown }[];
  /** business_brief: aggregate counts only — never finder identities or drop content */
  aggregates?: unknown;
  /** quest_plan: client local hour 0-23 (part of day for get_time) */
  local_hour?: number;
  mood?: string;
  /** clue_options: Business switch is on → write an offer teaser, not a clue */
  business?: boolean;
  business_name?: string;
  /** load-test only: honoured solely for @loadtest.invalid users and routed to an isolated breaker */
  _sim?: "fail" | "ok";
};

type NarrateResponse = {
  ok: boolean;
  version: number;
  fallback: boolean;
  text?: string;
  options?: string[];
  /** Ghost Writer safety pre-screen rides on the same call */
  safety?: { verdict: "ok" | "risky" | "blocked"; note?: string };
  error?: string;
  /** quest_plan: validated multi-step plan + the tools the agent called */
  quest?: {
    title: string;
    steps: { drop_id: string; teaser: string; why?: string; sponsored?: boolean; business?: string }[];
    minutes: number;
  };
  /** quest_plan: 'agent' (Muse tool calling) or 'rules' (deterministic fallback) */
  engine?: "agent" | "rules";
  trace?: string[];
  /** found_card: Muse Image output (base64 PNG or hosted URL) */
  image?: { b64?: string; url?: string };
  /** business_brief: sanitized summary + exactly 3 tips */
  brief?: { summary: string; tips: string[]; best_time?: string };
  /** model unavailable (circuit open / timeouts) — a non-AI fallback was served */
  degraded?: boolean;
  cache?: "hit" | "miss" | "wait";
  tokens?: number;
};

function json(body: NarrateResponse, status = 200): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-ai-fb": body.fallback ? "1" : "0",
  };
  if (body.error) headers["x-ai-err"] = body.error;
  if (body.degraded) headers["x-ai-deg"] = "1";
  if (body.cache) headers["x-ai-cache"] = body.cache;
  if (body.tokens) headers["x-ai-tok"] = String(body.tokens);
  return new Response(JSON.stringify(body), { status, headers });
}

const base = (extra: Partial<NarrateResponse>): NarrateResponse => ({
  ok: true,
  version: FN_VERSION,
  fallback: false,
  ...extra,
});

const fallback = (): NarrateResponse => base({ fallback: true });

const MAX_TEXT = 140;
const MAX_OPTION = 120;
const COORD_RE = /-?\d{1,3}\.\d{3,}/;

/** Strip anything that looks like coordinates + enforce length. */
function cleanLine(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const line = s.replace(/\s+/g, " ").trim();
  if (!line || line.length > max) return null;
  if (COORD_RE.test(line)) return null;
  return line;
}

// Best-effort per-user throttle (per isolate; DB limits stay authoritative).
const hits = new Map<string, number[]>();
function throttled(userId: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(userId, arr);
  return arr.length > limit;
}

type Admin = ReturnType<typeof createClient>;
type Tally = { tokens: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rpcQuiet<T = unknown>(db: Admin, fn: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    const { data, error } = await db.rpc(fn, args);
    return error ? null : (data as T);
  } catch {
    return null;
  }
}

function addTokens(tally: Tally | undefined, data: unknown) {
  const t = (data as { usage?: { total_tokens?: unknown } } | null)?.usage?.total_tokens;
  if (tally && typeof t === "number" && Number.isFinite(t)) tally.tokens += t;
}

// ── circuit breaker (state in the database; see migration 034) ──
const CB = { threshold: 4, windowSecs: 30, openSecs: 25, probeSecs: 10 };

function guarded<T>(
  db: Admin | null, name: string, sim: string | null, fn: () => Promise<T>, simOk?: T,
): Promise<T> {
  const store = db
    ? {
        allow: async () =>
          ((await rpcQuiet<string>(db, "ai_circuit_allow", { p_name: name, p_probe_secs: CB.probeSecs })) ?? "closed") as "closed" | "open" | "probe",
        report: async (ok: boolean) => {
          await rpcQuiet(db, "ai_circuit_report", { p_name: name, p_ok: ok, p_threshold: CB.threshold, p_window_secs: CB.windowSecs, p_open_secs: CB.openSecs });
        },
      }
    : null;
  return guardedCall(store, sim, fn, simOk);
}

// ── response cache with single-flight (state in the database) ──
type CacheSpec = { key: string; scope: string; action: string; ttl: number };

async function withCache(
  db: Admin | null, spec: CacheSpec | null, produce: () => Promise<NarrateResponse>,
): Promise<NarrateResponse> {
  if (!db || !spec) return produce();
  const claim = await rpcQuiet<{ status?: string; value?: Partial<NarrateResponse> }>(db, "ai_cache_claim", {
    p_key: spec.key, p_scope: spec.scope, p_action: spec.action, p_ttl_secs: spec.ttl, p_lock_secs: 30,
  });
  if (!claim || claim.status === "bypass") return produce();
  if (claim.status === "hit" && claim.value) return base({ ...claim.value, cache: "hit" });
  if (claim.status === "wait") {
    const until = Date.now() + 25000;
    while (Date.now() < until) {
      await sleep(350);
      const v = await rpcQuiet<Partial<NarrateResponse>>(db, "ai_cache_get", { p_key: spec.key, p_scope: spec.scope });
      if (v) return base({ ...v, cache: "wait" });
    }
    return produce();
  }
  let out: NarrateResponse;
  try {
    out = await produce();
  } catch (e) {
    await rpcQuiet(db, "ai_cache_release", { p_key: spec.key });
    throw e;
  }
  if (!out.fallback && !out.degraded) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { ok: _o, version: _v, fallback: _f, cache: _c, tokens: _t, error: _e, ...value } = out;
    await rpcQuiet(db, "ai_cache_put", { p_key: spec.key, p_value: value, p_ttl_secs: spec.ttl });
    return { ...out, cache: "miss" };
  }
  await rpcQuiet(db, "ai_cache_release", { p_key: spec.key });
  return out;
}

function systemPrompt(locale: string): string {
  const lang = locale === "bn" ? "Bengali (Bangla)" : "English";
  return [
    "You write short outdoor-discovery copy for DROQ, an anonymous",
    "location game. Always reply with a single JSON object, no other text.",
    `Write in ${lang}. Warm, mysterious, no emojis.`,
    "NEVER include coordinates, distances in meters, addresses, or place names.",
    "NEVER reveal drop content — you are only given metadata.",
  ].join(" ");
}

function userPrompt(req: NarrateRequest): string {
  const c = req.context ?? {};
  switch (req.action) {
    case "sense_reason":
      return JSON.stringify({
        task: "sense_reason",
        format: { reason: "one line, max 25 words" },
        drop_type: req.drop_type ?? "memory",
        distance_bucket: c.distance_bucket ?? "400+",
        is_social: Boolean(c.is_social),
        theme_match: Boolean(c.theme_match),
      });
    case "hunt_hint": {
      const level = Math.min(Math.max(c.hint_level ?? 1, 1), 4);
      return JSON.stringify({
        task: "hunt_hint",
        format: { hint: "one riddle-like line, max 25 words" },
        drop_type: req.drop_type ?? "memory",
        hint_level: level,
        level_guide: "1 playful nudge, 2 warmer/colder energy, 3 almost-direct, 4 final nudge nearly-direct — but never coordinates or the exact spot",
      });
    }
    case "clue_options":
      return JSON.stringify({
        task: "clue_options",
        format: {
          options: req.business
            ? "exactly 3 enticing offer teasers for a local business, each max 20 words"
            : "exactly 3 clue strings, each max 20 words",
          safety: { verdict: "ok | risky | blocked", note: "short reason if not ok" },
        },
        ...(req.business
          ? {
              style: "business_offer",
              style_rules:
                "Write what a passer-by gains by finding this Drop (a treat, a secret menu item, a small perk) as a warm invitation. Only use what the draft implies; never invent prices, discounts, percentages or guarantees. No claims you cannot know.",
              business_name: (req.business_name ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
            }
          : {}),
        drop_type: req.drop_type ?? "memory",
        draft: (req.draft ?? "").slice(0, 500),
        safety_rules: "blocked: unsafe location, private home, harassment, hate. risky: vague danger, spam-like.",
      });
    case "business_brief":
      return JSON.stringify({
        task: "business_brief",
        format: {
          summary: "2 short sentences, max 45 words, plain and encouraging",
          tips: "exactly 3 concrete tips, each max 22 words",
          best_time: "one short line (max 25 words): the best day and time window to post an offer, chosen ONLY from audience.peak_hour and audience.weekday",
        },
        notes: "audience.peak_hour is a 0-23 local hour; audience.weekday has 7 counts, index 0 = Monday ... 6 = Sunday; funnel counts walkers who were suggested your drop, opened it, and made a verified visit.",
        rules: "Use only the numbers given. Never invent numbers, names, places or people. Never mention individual visitors. If a number is missing, do not guess it. Write every number as digits (0-9), never spelled out in words, so it can be checked against the data.",
        aggregates: req.aggregates,
      });
    case "found_epilogue":
      return JSON.stringify({
        task: "found_epilogue",
        format: { line: "one warm celebratory line, max 25 words" },
        drop_type: req.drop_type ?? "memory",
      });
  }
}

/** Tolerate ```json fences or stray prose around the single JSON object. */
function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new SyntaxError("model_parse");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

/**
 * Any OpenAI-compatible LLM works: set LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
 * (they override MUSE_*). Muse needs minimal reasoning + max_completion_tokens;
 * Gemini's OpenAI endpoint takes plain max_tokens.
 */
function tokenParams(baseUrl: string, maxTokens?: number): Record<string, unknown> {
  if (baseUrl.includes("generativelanguage.googleapis.com")) return { max_tokens: maxTokens ?? 1500 };
  if (baseUrl.includes("api.meta.ai")) return { reasoning_effort: "minimal", max_completion_tokens: maxTokens ?? 1200 };
  return { max_tokens: maxTokens ?? 1500 };
}

async function callMuse(
  baseUrl: string,
  apiKey: string,
  model: string,
  req: NarrateRequest,
  tally?: Tally,
  opts?: Partial<FetchOpts> & { maxTokens?: number },
): Promise<unknown> {
  const deadlineAt = opts?.deadlineAt ?? Date.now() + 20000;
  const attempt = async (repair: boolean): Promise<unknown> => {
    const res = await modelFetch(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt(req.locale ?? "en") + (repair ? " Reply with ONLY one compact JSON object. Keep your reasoning very short." : "") },
            { role: "user", content: userPrompt(req) },
          ],
          ...tokenParams(baseUrl, repair ? (opts?.maxTokens ?? 1200) * 2 : opts?.maxTokens),
          response_format: { type: "json_object" },
          temperature: repair ? 0.3 : 0.8,
        }),
      },
      { attemptMs: opts?.attemptMs ?? 12000, deadlineAt, retries: opts?.retries ?? 2, retry5xx: true },
    );
    const data = await res.json();
    addTokens(tally, data);
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string") {
      console.log(JSON.stringify({ ai_diag: "model_shape", action: req.action, repair, finish: choice?.finish_reason ?? null, usage: data?.usage ?? null }));
      throw new Error("model_shape");
    }
    try {
      return parseModelJson(content);
    } catch (e) {
      console.log(JSON.stringify({ ai_diag: "model_parse", action: req.action, repair, finish: choice?.finish_reason ?? null, len: content.length, head: content.slice(0, 160), tail: content.slice(-80) }));
      throw e;
    }
  };
  try {
    return await attempt(false);
  } catch (e) {
    const code = modelErrorCode(e);
    // ONE repair retry on an unusable answer (reasoning ate the token budget / truncated JSON).
    if ((code === "model_shape" || code === "model_parse") && deadlineAt - Date.now() > 4000) return await attempt(true);
    throw e;
  }
}

/** Lenient coercion of a model brief: strings or {text}, tips as array or a delimited string. */
function strOf(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return strOf(o.text ?? o.tip ?? o.summary ?? o.line ?? o.value);
  }
  return null;
}
function coerceBrief(o: Record<string, unknown>) {
  const tipsRaw: unknown[] = Array.isArray(o.tips)
    ? o.tips
    : typeof o.tips === "string"
      ? o.tips.split(/\n|•|\s\d\.\s/).map((x) => x.trim()).filter(Boolean)
      : [];
  return {
    summary: cleanLine(strOf(o.summary ?? o.overview), 320),
    tips: tipsRaw.map((t) => cleanLine(strOf(t), 180)).filter((t): t is string => t !== null).slice(0, 3),
    best_time: cleanLine(strOf(o.best_time ?? o.bestTime), 200) ?? undefined,
  };
}

type Candidate = { id: string; type: string; walk_minutes: number; social: boolean };
type Availability = { ok: boolean; reason: string | null; sponsored: boolean; business: string | null; category: string | null };
const DROP_TYPES = new Set([
  "memory", "message", "photo", "voice", "video", "puzzle",
  "challenge", "secret", "time_capsule",
]);

/** Model never sees coordinates; distance becomes whole walking minutes. */
function parseCandidates(raw: unknown): Candidate[] {
  if (!Array.isArray(raw)) return [];
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const c of raw.slice(0, 12)) {
    const o = c as Record<string, unknown>;
    const id = typeof o?.id === "string" ? o.id : "";
    const d = typeof o?.distance_m === "number" ? o.distance_m : NaN;
    if (!/^[0-9a-f-]{8,64}$/i.test(id) || seen.has(id) || !Number.isFinite(d) || d < 0) continue;
    seen.add(id);
    out.push({
      id,
      type: typeof o.type === "string" && DROP_TYPES.has(o.type) ? o.type : "memory",
      walk_minutes: Math.max(1, Math.round(d / 80)),
      social: Boolean(o.is_social),
    });
  }
  return out;
}

type Aggregates = {
  days: number;
  total_visits: number;
  unique_visitors: number;
  daily: number[];
  top_types: { type: string; visits: number }[];
  audience: { peak_hour: number | null; weekday: number[]; new_visitors: number; returning_visitors: number; interests: { type: string; visits: number }[] } | null;
  funnel: { shown: number; opened: number; verified: number } | null;
};

function parseAggregates(raw: unknown): Aggregates | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), max) : null;
  const days = num(o.days, 90);
  const total = num(o.total_visits, 1_000_000);
  const uniq = num(o.unique_visitors, 1_000_000);
  if (days === null || total === null || uniq === null || days < 1) return null;
  const daily = (Array.isArray(o.daily) ? o.daily : [])
    .slice(0, 90)
    .map((v) => num(v, 1_000_000) ?? 0);
  const top_types = (Array.isArray(o.top_types) ? o.top_types : [])
    .slice(0, 5)
    .map((t) => {
      const r = t as Record<string, unknown>;
      const type = typeof r?.type === "string" && DROP_TYPES.has(r.type) ? r.type : null;
      const visits = num(r?.visits, 1_000_000);
      return type && visits !== null ? { type, visits } : null;
    })
    .filter((t): t is { type: string; visits: number } => t !== null);
  const a = (o.audience && typeof o.audience === "object" ? o.audience : null) as Record<string, unknown> | null;
  const audience = a
    ? {
        peak_hour: typeof a.peak_hour === "number" && Number.isFinite(a.peak_hour) ? Math.min(Math.max(Math.round(a.peak_hour), 0), 23) : null,
        weekday: (Array.isArray(a.weekday) ? a.weekday : []).slice(0, 7).map((v) => num(v, 1_000_000) ?? 0),
        new_visitors: num(a.new_visitors, 1_000_000) ?? 0,
        returning_visitors: num(a.returning_visitors, 1_000_000) ?? 0,
        interests: (Array.isArray(a.interests) ? a.interests : []).slice(0, 5)
          .map((t) => {
            const r = t as Record<string, unknown>;
            const type = typeof r?.type === "string" && DROP_TYPES.has(r.type) ? r.type : null;
            const visits = num(r?.visits, 1_000_000);
            return type && visits !== null ? { type, visits } : null;
          })
          .filter((t): t is { type: string; visits: number } => t !== null),
      }
    : null;
  const f = (o.funnel && typeof o.funnel === "object" ? o.funnel : null) as Record<string, unknown> | null;
  const funnel = f
    ? { shown: num(f.shown, 1_000_000) ?? 0, opened: num(f.opened, 1_000_000) ?? 0, verified: num(f.verified, 1_000_000) ?? 0 }
    : null;
  return { days, total_visits: total, unique_visitors: Math.min(uniq, total), daily, top_types, audience, funnel };
}

// ── Visitor ↔ business matching (mirror of services/matching.ts — keep in sync) ──
type Mood = "chill" | "curious" | "brave";
type Part = "morning" | "afternoon" | "evening" | "night";
const CATS = ["cafe", "food", "books", "shop", "art", "other"];
const MOOD_CAT: Record<Mood, Record<string, number>> = {
  chill:   { cafe: 9, books: 8, art: 7, shop: 4, food: 4, other: 5 },
  curious: { art: 9, books: 8, shop: 7, food: 6, cafe: 5, other: 6 },
  brave:   { food: 9, shop: 6, art: 6, cafe: 4, books: 3, other: 6 },
};
const PART_CAT: Record<Part, Record<string, number>> = {
  morning:   { cafe: 9, books: 5, shop: 4, art: 4, food: 3, other: 4 },
  afternoon: { shop: 8, art: 7, books: 6, cafe: 6, food: 5, other: 5 },
  evening:   { food: 9, cafe: 6, art: 6, books: 5, shop: 5, other: 5 },
  night:     { food: 6, other: 5, cafe: 4, art: 4, books: 2, shop: 1 },
};
const MOOD_TYPE: Record<Mood, Record<string, number>> = {
  chill:   { memory: 8, photo: 8, voice: 7, message: 6, time_capsule: 6 },
  curious: { secret: 9, puzzle: 8, video: 7, time_capsule: 7, photo: 6 },
  brave:   { challenge: 9, puzzle: 8, secret: 7, video: 6 },
};
const TIME_AFF: Record<Part, string[]> = {
  morning: ["photo", "memory", "message"],
  afternoon: ["puzzle", "challenge", "video"],
  evening: ["voice", "time_capsule", "memory"],
  night: ["secret", "time_capsule", "message"],
};
const isMood = (v: unknown): v is Mood => v === "chill" || v === "curious" || v === "brave";
const asPart = (v: string): Part => (v === "morning" || v === "afternoon" || v === "evening" ? v : "night");

type WhyCode = "mood" | "part" | "novel" | "close";
function scoreFit(
  c: { type: string; walk_minutes: number }, category: string | null, mood: Mood, part: Part, recent: string[],
): { score: number; why: WhyCode } {
  const cat = category && CATS.includes(category) ? category : null;
  const m = cat ? MOOD_CAT[mood][cat] : (MOOD_TYPE[mood][c.type] ?? 4);
  const p = cat ? PART_CAT[part][cat] : (TIME_AFF[part].includes(c.type) ? 7 : 4);
  const seen = recent.filter((t) => t === c.type).length;
  const novelty = seen === 0 ? 3 : seen >= 2 ? -2 : 0;
  const close = Math.round(4 * (1 - Math.min(Math.max(c.walk_minutes, 0), 15) / 15));
  const parts: [WhyCode, number][] = [["mood", m], ["part", p], ["novel", novelty > 0 ? novelty * 3 : -1], ["close", close]];
  let best = parts[0];
  for (const x of parts) if (x[1] > best[1]) best = x;
  return { score: m + p + novelty + close, why: best[0] };
}

const WHY_TEXT: Record<"en" | "bn", Record<string, string>> = {
  en: {
    "mood:chill": "A calm spot for a slow, unhurried walk",
    "mood:curious": "Something unusual to be curious about",
    "mood:brave": "A bold find for an adventurous mood",
    "part:morning": "A good start to your morning",
    "part:afternoon": "A fitting afternoon stop",
    "part:evening": "Great for this time of evening",
    "part:night": "A quiet pick for tonight",
    novel: "Different from what you found lately",
    close: "Just a short walk away",
  },
  bn: {
    "mood:chill": "ধীরে, তাড়াহুড়ো ছাড়া হাঁটার জন্য শান্ত একটি জায়গা",
    "mood:curious": "কৌতূহল জাগানোর মতো অন্যরকম কিছু",
    "mood:brave": "সাহসী মেজাজের জন্য একটি জোরালো খোঁজ",
    "part:morning": "সকালটা শুরু করার জন্য ভালো",
    "part:afternoon": "বিকেলের জন্য মানানসই একটি স্টপ",
    "part:evening": "সন্ধ্যার এই সময়ের জন্য দারুণ",
    "part:night": "আজ রাতের জন্য একটি নিরিবিলি বাছাই",
    novel: "সম্প্রতি যা পেয়েছ তার থেকে আলাদা",
    close: "হাঁটা পথে একদম কাছেই",
  },
};
const whyText = (code: WhyCode, mood: Mood, part: Part, locale: string): string => {
  const t = WHY_TEXT[locale === "bn" ? "bn" : "en"];
  return code === "mood" ? t[`mood:${mood}`] : code === "part" ? t[`part:${part}`] : t[code];
};
const TEASER: Record<"en" | "bn", Record<string, string>> = {
  en: {
    memory: "A quiet memory waits just ahead", message: "Someone left a few words for you",
    photo: "A picture only this place can open", voice: "A voice is waiting to be heard",
    video: "A tiny screen hides a moment", puzzle: "A lock that wants a clever mind",
    challenge: "Others have added to this one", secret: "Something hidden in plain sight",
    time_capsule: "A little piece of time, kept for you",
  },
  bn: {
    memory: "একটি নিরিবিলি স্মৃতি সামনেই অপেক্ষা করছে", message: "কেউ তোমার জন্য কয়েকটি কথা রেখে গেছে",
    photo: "শুধু এই জায়গাই খুলতে পারে এমন একটি ছবি", voice: "একটি কণ্ঠস্বর শোনার অপেক্ষায়",
    video: "একটি ছোট্ট পর্দায় লুকানো এক মুহূর্ত", puzzle: "একটি তালা যা চায় চালাক মন",
    challenge: "অন্যরা এতে যোগ করেছে", secret: "চোখের সামনেই লুকানো কিছু",
    time_capsule: "সময়ের ছোট্ট একটি টুকরো, তোমার জন্য রাখা",
  },
};
const MOOD_TITLE: Record<"en" | "bn", Record<Mood, string>> = {
  en: { chill: "A Slow Gentle Walk", curious: "Curious Little Steps", brave: "A Bold Short Walk" },
  bn: { chill: "ধীরে হাঁটার পথ", curious: "কৌতূহলী ছোট পদক্ষেপ", brave: "সাহসী ছোট্ট হাঁটা" },
};

type FitInfo = { score: number; why: WhyCode };

const QUEST_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_context",
      description: "Walker mood, time budget, language.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_history",
      description: "Recently found drop types and streak.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_time",
      description: "Local part of day and hour.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_candidates",
      description:
        "Nearby drops: id, type, walk_minutes, sponsored, category, available, fit (higher = better match).",
      parameters: {
        type: "object",
        properties: {
          drop_type: { type: "string", description: "Optional drop type filter" },
          max_walk_minutes: { type: "number", description: "Optional max walking minutes" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Server check that drops are still active and not time-locked. Call with no ids for all.",
      parameters: {
        type: "object",
        properties: { drop_ids: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_quest",
      description:
        "Final quest: 1-3 stops from list_candidates that are available; teaser + why per stop. At most ONE sponsored. Call once, last.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Quest title, max 6 words" },
          steps: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                drop_id: { type: "string" },
                teaser: { type: "string", description: "max 15 words" },
                why: { type: "string", description: "max 14 words; never mention sponsorship" },
              },
              required: ["drop_id", "teaser", "why"],
            },
          },
        },
        required: ["title", "steps"],
      },
    },
  },
];

async function museChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: unknown[],
  tools: unknown[],
  tally: Tally,
  deadlineAt: number,
): Promise<Record<string, unknown>> {
  const res = await modelFetch(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto", ...tokenParams(baseUrl), temperature: 0.7 }),
    },
    { attemptMs: 15000, deadlineAt, retries: 2, retry5xx: true },
  );
  const data = await res.json();
  addTokens(tally, data);
  const msg = data?.choices?.[0]?.message;
  if (!msg || typeof msg !== "object") throw new Error("model_shape");
  return msg as Record<string, unknown>;
}

type QuestEnv = {
  availability: Map<string, Availability>;
  localHour: number | null;
  mood: Mood | null;
  fit: Map<string, FitInfo>;
  history: () => Promise<{ recent_types: string[]; recent_categories: string[]; streak_days: number }>;
  tally: Tally;
  deadlineAt: number;
};

function partOfDay(hour: number | null): string {
  if (hour === null) return "unknown";
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

async function runQuestAgent(
  baseUrl: string,
  apiKey: string,
  model: string,
  cands: Candidate[],
  intent: string,
  minutes: number,
  locale: string,
  env: QuestEnv,
): Promise<{ quest: NonNullable<NarrateResponse["quest"]>; trace: string[] }> {
  const lang = locale === "bn" ? "Bengali (Bangla)" : "English";
  const messages: unknown[] = [
    {
      role: "system",
      content: [
        "You are DROQ's Quest Agent. Plan a 1-3 stop walk of nearby mystery Drops.",
        "In ONE step call get_context, get_history, get_time, list_candidates and check_availability together (in parallel), then call submit_quest.",
        "Prefer higher `fit`, varied types, and stops that suit the mood and time; skip unavailable drops. At most ONE sponsored stop, only if it fits; never mention sponsorship or names.",
        "For each stop give a short teaser and a short why (max 14 words).",
        `Write in ${lang}, warm, no emojis, no coordinates, no place names. Never invent ids.`,
      ].join(" "),
    },
    { role: "user", content: "Plan my quest." },
  ];
  const trace: string[] = [];
  const byId = new Map(cands.map((c) => [c.id, c]));
  const shortOf = new Map(cands.map((c, i) => [c.id, `c${i + 1}`]));
  const fromShort = new Map(cands.map((c, i) => [`c${i + 1}`, c.id]));
  const resolveId = (x: string) => fromShort.get(x) ?? x;
  const okIds = (ids?: unknown): string[] => {
    const want = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string").map(resolveId) : [...byId.keys()];
    return want.filter((id) => byId.has(id));
  };

  for (let turn = 0; turn < 5; turn++) {
    if (Date.now() > env.deadlineAt) throw new Error("agent_deadline");
    const msg = await museChat(baseUrl, apiKey, model, messages, QUEST_TOOLS, env.tally, env.deadlineAt);
    const calls = Array.isArray(msg.tool_calls) ? (msg.tool_calls as Record<string, unknown>[]) : [];
    if (calls.length === 0) throw new Error("agent_no_tool");
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });

    for (const call of calls) {
      const fn = call.function as { name?: string; arguments?: string } | undefined;
      const name = fn?.name ?? "";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(fn?.arguments || "{}");
      } catch {
        args = {};
      }
      trace.push(name);

      if (name === "submit_quest") {
        const title = cleanLine(args.title, 60);
        const rawSteps = Array.isArray(args.steps) ? args.steps : [];
        const used = new Set<string>();
        const steps: { drop_id: string; teaser: string; why?: string; sponsored?: boolean; business?: string }[] = [];
        let sponsoredUsed = false;
        for (const s of rawSteps.slice(0, 10)) {
          if (steps.length >= 3) break;
          const o = s as Record<string, unknown>;
          const id = resolveId(typeof o?.drop_id === "string" ? o.drop_id : "");
          const teaser = cleanLine(o?.teaser, 100);
          const av = env.availability.get(id);
          // Server is authoritative: only real, available drops; at most one sponsored stop.
          if (!byId.has(id) || used.has(id) || !teaser || !av || !av.ok) continue;
          if (av.sponsored) {
            if (sponsoredUsed) continue;
            sponsoredUsed = true;
          }
          used.add(id);
          const f = env.fit.get(id);
          const why =
            cleanLine(o?.why, 100) ??
            (f && env.mood ? whyText(f.why, env.mood, asPart(partOfDay(env.localHour)), locale) : undefined);
          steps.push({
            drop_id: id,
            teaser,
            ...(why ? { why } : {}),
            ...(av.sponsored ? { sponsored: true, ...(av.business ? { business: av.business } : {}) } : {}),
          });
        }
        if (!title || steps.length === 0) throw new Error("agent_bad_plan");
        // Paid placement: if the model skipped an available sponsored stop that clearly fits
        // (top 3 by fit for this walker), include it. Never invented: it comes from the verified set.
        if (env.mood && !steps.some((st) => st.sponsored)) {
          const byFit = [...cands].sort((a, b) => (env.fit.get(b.id)?.score ?? 0) - (env.fit.get(a.id)?.score ?? 0));
          const best = byFit.find((c) => { const av = env.availability.get(c.id); return av?.ok && av.sponsored && !used.has(c.id); });
          const topScore = env.fit.get(byFit[0]?.id ?? "")?.score ?? 0;
          if (best && topScore - (env.fit.get(best.id)?.score ?? 0) <= 4) {
            const av = env.availability.get(best.id)!;
            const f = env.fit.get(best.id);
            const step = {
              drop_id: best.id,
              teaser: TEASER[locale === "bn" ? "bn" : "en"][best.type] ?? TEASER.en.memory,
              ...(f ? { why: whyText(f.why, env.mood, asPart(partOfDay(env.localHour)), locale) } : {}),
              sponsored: true,
              ...(av.business ? { business: av.business } : {}),
            };
            if (steps.length >= 3) steps.pop();
            steps.push(step);
            steps.sort((a, b) => byId.get(a.drop_id)!.walk_minutes - byId.get(b.drop_id)!.walk_minutes);
          }
        }
        const far = Math.max(...steps.map((s) => byId.get(s.drop_id)!.walk_minutes));
        return { quest: { title, steps, minutes: far }, trace };
      }

      let result: unknown;
      if (name === "get_context") {
        result = { mood: env.mood ?? (intent || "open to anything"), mood_text: intent || "open to anything", time_budget_minutes: minutes, language: lang };
      } else if (name === "get_history") {
        result = await env.history();
      } else if (name === "get_time") {
        result = { part_of_day: partOfDay(env.localHour), local_hour: env.localHour };
      } else if (name === "list_candidates") {
        const t = typeof args.drop_type === "string" ? args.drop_type : "";
        const mx = typeof args.max_walk_minutes === "number" ? args.max_walk_minutes : Infinity;
        result = cands
          .filter((c) => (!t || c.type === t) && c.walk_minutes <= mx)
          .map((c) => ({
            id: shortOf.get(c.id),
            type: c.type,
            walk_minutes: c.walk_minutes,
            available: env.availability.get(c.id)?.ok === true,
            sponsored: env.availability.get(c.id)?.sponsored === true,
            ...(env.availability.get(c.id)?.category ? { category: env.availability.get(c.id)!.category } : {}),
            fit: env.fit.get(c.id)?.score ?? null,
          }));
      } else if (name === "check_availability") {
        result = okIds(args.drop_ids).map((id) => {
          const av = env.availability.get(id);
          return { id: shortOf.get(id), available: av?.ok === true, reason: av?.reason ?? null };
        });
      } else {
        result = { error: "unknown_tool" };
      }
      messages.push({
        role: "tool",
        tool_call_id: typeof call.id === "string" ? call.id : name,
        content: JSON.stringify(result),
      });
    }
  }
  throw new Error("agent_no_submit");
}

/** Deterministic plan used when the model is unavailable: ranks by fit, at most 1 sponsored, varied types. */
function rulesPlan(
  cands: Candidate[], minutes: number, locale: string, env: QuestEnv,
): NonNullable<NarrateResponse["quest"]> | null {
  const mood: Mood = env.mood ?? "curious";
  const part = asPart(partOfDay(env.localHour));
  const ok = cands.filter((c) => env.availability.get(c.id)?.ok);
  if (ok.length === 0) return null;
  const inBudget = ok.filter((c) => c.walk_minutes <= minutes);
  const pool = inBudget.length ? inBudget : [[...ok].sort((a, b) => a.walk_minutes - b.walk_minutes)[0]];
  const ranked = [...pool].sort(
    (a, b) => (env.fit.get(b.id)?.score ?? 0) - (env.fit.get(a.id)?.score ?? 0) || a.walk_minutes - b.walk_minutes,
  );
  const picked: Candidate[] = [];
  let sponsored = false;
  for (const pass of [0, 1]) {
    for (const c of ranked) {
      if (picked.length >= 3 || picked.includes(c)) continue;
      if (pass === 0 && picked.some((p) => p.type === c.type)) continue;
      const av = env.availability.get(c.id)!;
      if (av.sponsored) { if (sponsored) continue; sponsored = true; }
      picked.push(c);
    }
  }
  const t = TEASER[locale === "bn" ? "bn" : "en"];
  const steps = picked
    .sort((a, b) => a.walk_minutes - b.walk_minutes)
    .map((c) => {
      const av = env.availability.get(c.id)!;
      const f = env.fit.get(c.id);
      return {
        drop_id: c.id,
        teaser: t[c.type] ?? t.memory,
        ...(f ? { why: whyText(f.why, mood, part, locale) } : {}),
        ...(av.sponsored ? { sponsored: true, ...(av.business ? { business: av.business } : {}) } : {}),
      };
    });
  return { title: MOOD_TITLE[locale === "bn" ? "bn" : "en"][mood], steps, minutes: Math.max(...picked.map((c) => c.walk_minutes)) };
}

const CARD_THEMES: Record<string, string> = {
  memory: "a glowing keepsake memory orb",
  message: "a sealed handwritten letter",
  photo: "a floating instant photograph",
  voice: "soft sound waves rising from the ground",
  video: "a tiny glowing cinema screen",
  puzzle: "an ornate lock with a golden key",
  challenge: "a growing constellation made by many hands",
  secret: "a tiny hidden door in a stone wall",
  time_capsule: "a vintage time capsule under moonlight",
};

/** Muse Image — fixed, safe prompt built from drop TYPE only (no content/coords). */
async function museImage(
  baseUrl: string,
  apiKey: string,
  dropType: string,
): Promise<{ b64?: string; url?: string }> {
  const imgModel = Deno.env.get("IMAGE_MODEL") || "muse-image-1.0";
  const isMuse = imgModel.startsWith("muse");
  const theme = CARD_THEMES[dropType] ?? CARD_THEMES.memory;
  const prompt =
    `Square poster-style illustration for a real-world treasure hunt app: someone has just found ${theme} ` +
    "hidden in a quiet city street at dusk. Cinematic, minimal, deep navy and teal with warm amber light, " +
    "soft film grain. No text, no letters, no logos, no faces.";
  // Image generation is billable and not idempotent: retry only a 429 (rejected, not processed), never 5xx/timeouts.
  const post = (extra: Record<string, unknown>) =>
    modelFetch(
      `${baseUrl}/images/generations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: imgModel,
          prompt,
          n: 1,
          ...(isMuse ? { size: "1024x1024" } : { response_format: "b64_json" }),
          ...extra,
        }),
      },
      { attemptMs: 40000, deadlineAt: Date.now() + 45000, retries: 1, retry5xx: false },
    );
  let res: Response;
  try {
    res = await post(
      isMuse
        ? { reasoning_strength: "low", tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false } }
        : {},
    );
  } catch (e) {
    if (isMuse && e instanceof Error && e.message === "model_http_400") res = await post({});
    else throw e;
  }
  const data = await res.json();
  const first = data?.data?.[0] as { b64_json?: unknown; url?: unknown } | undefined;
  if (typeof first?.b64_json === "string" && first.b64_json.length < 4_000_000) {
    return { b64: first.b64_json };
  }
  if (typeof first?.url === "string" && first.url.startsWith("https://")) return { url: first.url };
  throw new Error("model_shape");
}

async function dbRateOk(
  admin: ReturnType<typeof createClient>,
  userId: string,
  bucket: string,
  limit: number,
  windowSecs: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("ai_rate_check", {
    p_user: userId,
    p_bucket: bucket,
    p_limit: limit,
    p_window_secs: windowSecs,
  });
  if (error) return true;
  return data !== false;
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return json({ ...base({ fallback: true }), error: "missing_env" }, 500);
  }

  // Caller identity from their own JWT (verify_jwt=true on deploy).
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ ...fallback(), error: "missing_jwt" }, 401);
  const authed = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return json({ ...fallback(), error: "bad_jwt" }, 401);
  if (throttled(user.id)) return json({ ...fallback(), error: "rate_limited" }, 429);

  let body: NarrateRequest;
  try {
    body = await req.json();
  } catch {
    return json({ ...fallback(), error: "invalid_json" }, 400);
  }
  if (!["sense_reason", "hunt_hint", "clue_options", "found_epilogue", "quest_plan", "found_card", "business_brief"].includes(body.action)) {
    return json({ ...fallback(), error: "bad_action" }, 400);
  }
  const locale = body.locale === "bn" ? "bn" : "en";
  const J = (b: NarrateResponse, status = 200): Response => {
    const r = json(b, status);
    r.headers.set("x-ai-uid", user.id);
    r.headers.set("x-ai-act", body.action);
    return r;
  };
  // Test hook: honoured only for @loadtest.invalid users and routed to an isolated breaker.
  const sim = (user.email ?? "").endsWith("@loadtest.invalid") && (body._sim === "fail" || body._sim === "ok") ? body._sim : null;
  const cname = sim ? "meta-sim" : "meta";
  const tally: Tally = { tokens: 0 };

  // Shared DB-backed limits (per-isolate throttle above can't see other isolates).
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const limiter = svcKey
    ? createClient(supabaseUrl, svcKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  if (limiter) {
    const [bucket, limit, win] =
      body.action === "found_card" ? ["image", 5, 3600]
      : body.action === "quest_plan" ? ["quest", 8, 600]
      : body.action === "business_brief" ? ["brief", 10, 3600]
      : ["text", 40, 60];
    if (!(await dbRateOk(limiter, user.id, bucket as string, limit as number, win as number))) {
      return J({ ...fallback(), error: "rate_limited" }, 429);
    }
    // Global daily caps across ALL users: open signup must not be able to burn the model budget.
    const globalCap: Record<string, number> = { image: 300, quest: 1500, brief: 1000 };
    if (globalCap[bucket as string]) {
      const GLOBAL = "00000000-0000-0000-0000-000000000000";
      if (!(await dbRateOk(limiter, GLOBAL, `${bucket}_global`, globalCap[bucket as string], 86400))) {
        return J({ ...fallback(), error: "budget_cap" }, 429);
      }
    }
  }

  const apiKey0 = (Deno.env.get("LLM_API_KEY") || Deno.env.get("MUSE_API_KEY")) ?? "";
  const model0 = (Deno.env.get("LLM_MODEL") || Deno.env.get("MUSE_MODEL")) || "muse-spark-1.3";
  const base0 = ((Deno.env.get("LLM_BASE_URL") || Deno.env.get("MUSE_BASE_URL")) || "https://api.meta.ai/v1").replace(/\/$/, "");

  if (body.action === "quest_plan") {
    let cands = parseCandidates(body.candidates);
    if (cands.length === 0) return J({ ...fallback(), error: "no_candidates" }, 400);
    // Server truth for every candidate: exists, active, not time-locked/expired, business flag.
    const availability = new Map<string, Availability>();
    if (limiter) {
      const { data: rows } = await limiter
        .from("drops")
        .select("id,status,unlock_at,expires_at,is_business,business_name,business_category")
        .in("id", cands.map((c) => c.id));
      const now = Date.now();
      for (const r of (rows ?? []) as {
        id: string; status: string; unlock_at: string | null; expires_at: string | null;
        is_business: boolean | null; business_name: string | null; business_category: string | null;
      }[]) {
        const reason =
          r.status !== "active" ? "inactive"
          : r.unlock_at && new Date(r.unlock_at).getTime() > now ? "time_locked"
          : r.expires_at && new Date(r.expires_at).getTime() <= now ? "expired"
          : null;
        const business = r.is_business ? cleanLine(r.business_name, 60) : null;
        availability.set(r.id, {
          ok: reason === null,
          reason,
          sponsored: r.is_business === true && !!business,
          business,
          category: r.is_business && r.business_category && CATS.includes(r.business_category) ? r.business_category : r.is_business ? "other" : null,
        });
      }
      cands = cands.filter((c) => availability.has(c.id));
      if (cands.length === 0 || ![...availability.values()].some((a) => a.ok)) {
        return J({ ...fallback(), error: "bad_drop" }, 404);
      }
    } else {
      for (const c of cands) availability.set(c.id, { ok: true, reason: null, sponsored: false, business: null, category: null });
    }
    const minutes = Math.min(Math.max(Math.round(Number(body.minutes) || 30), 5), 180);
    const intent = (typeof body.intent === "string" ? body.intent : "").replace(/\s+/g, " ").trim().slice(0, 80);
    const localHour =
      typeof body.local_hour === "number" && Number.isFinite(body.local_hour)
        ? Math.min(Math.max(Math.round(body.local_hour), 0), 23)
        : null;
    const mood: Mood | null = isMood(body.mood) ? body.mood : null;
    // History (recent finds + streak) is loaded once: it feeds the fit scores and the get_history tool.
    let histCache: { recent_types: string[]; recent_categories: string[]; streak_days: number } | null = null;
    const loadHistory = async () => {
      if (histCache) return histCache;
      let recent: string[] = [];
      let cats: string[] = [];
      let streak = 0;
      try {
        if (limiter) {
          const { data } = await limiter
            .from("drop_discoveries")
            .select("discovered_at, drops(type, business_category)")
            .eq("user_id", user.id)
            .order("discovered_at", { ascending: false })
            .limit(10);
          type Row = { type?: string; business_category?: string | null };
          const rows = ((data ?? []) as unknown as { drops: Row | Row[] | null }[])
            .map((r) => (Array.isArray(r.drops) ? r.drops[0] : r.drops))
            .filter((r): r is Row => !!r);
          recent = rows.map((r) => r.type).filter((t): t is string => typeof t === "string" && DROP_TYPES.has(t));
          cats = rows.map((r) => r.business_category).filter((c): c is string => typeof c === "string" && CATS.includes(c));
        }
        const { data: st } = await authed.rpc("get_discovery_streak", {});
        if (typeof st === "number" && Number.isFinite(st)) streak = Math.max(0, Math.min(st, 3650));
      } catch {
        // history is optional context
      }
      histCache = { recent_types: recent, recent_categories: cats, streak_days: streak };
      return histCache;
    };
    const hist = await loadHistory();
    const part = asPart(partOfDay(localHour));
    const fit = new Map<string, FitInfo>();
    if (mood) {
      for (const c of cands) fit.set(c.id, scoreFit(c, availability.get(c.id)?.category ?? null, mood, part, hist.recent_types));
    }
    const env: QuestEnv = { availability, localHour, mood, fit, history: loadHistory, tally, deadlineAt: Date.now() + 45000 };

    const logShown = async (q: NonNullable<NarrateResponse["quest"]>) => {
      if (!limiter) return;
      try {
        for (const st of q.steps) {
          if (st.sponsored) {
            await limiter.from("analytics_events").insert({
              user_id: user.id, event_name: "quest_step_shown",
              properties: { drop_id: st.drop_id, sponsored: true, surface: "quest" },
            });
          }
        }
      } catch { /* analytics must never block */ }
    };

    // Short-TTL cache absorbs double taps; per-user scope, no coordinates in the key or value.
    const spec: CacheSpec | null =
      limiter && !sim
        ? {
            key: `quest:${user.id}:${await sha(JSON.stringify([
              cands.map((c) => [c.id, c.type, c.walk_minutes]).sort(), minutes, intent, mood,
              localHour === null ? null : Math.floor(localHour / 3), locale,
            ]))}`,
            scope: user.id, action: "quest_plan", ttl: 60,
          }
        : null;

    const produce = async (): Promise<NarrateResponse> => {
      try {
        if (!apiKey0) throw new Error("model_error");
        const { quest, trace } = await guarded(
          limiter, cname, sim, () => runQuestAgent(base0, apiKey0, model0, cands, intent, minutes, locale, env),
        );
        await logShown(quest);
        return base({ quest, trace, engine: "agent", tokens: tally.tokens });
      } catch (e) {
        const code = modelErrorCode(e);
        const rules = rulesPlan(cands, minutes, locale, env);
        if (rules) {
          await logShown(rules);
          return base({ quest: rules, trace: [], engine: "rules", degraded: true, error: !apiKey0 ? "missing_key" : code, tokens: tally.tokens });
        }
        return { ...fallback(), error: code, degraded: isDegraded(code) || undefined };
      }
    };
    return J(await withCache(limiter, spec, produce));
  }

  if (body.action === "business_brief") {
    const agg = parseAggregates(body.aggregates);
    if (!agg) return J({ ...fallback(), error: "bad_aggregates" }, 400);
    if (!apiKey0) return J({ ...fallback(), error: "missing_key" });
    // One brief per owner per day per language per data snapshot: repeat views are instant.
    const day = new Date().toISOString().slice(0, 10);
    const spec: CacheSpec | null =
      limiter && !sim
        ? { key: `brief:${user.id}:${day}:${locale}:${await sha(JSON.stringify(agg))}`, scope: user.id, action: "business_brief", ttl: 86400 }
        : null;
    const produce = async (): Promise<NarrateResponse> => {
      try {
        const parsedBrief = await guarded(
          limiter, cname, sim,
          () => callMuse(base0, apiKey0, model0, { ...body, locale, aggregates: agg }, tally, { attemptMs: 25000, deadlineAt: Date.now() + 30000, retries: 1, maxTokens: 2400 }),
          { summary: "sim", tips: ["a", "b", "c"] },
        );
        let c = coerceBrief((parsedBrief && typeof parsedBrief === "object" ? parsedBrief : {}) as Record<string, unknown>);
        if (!c.summary || c.tips.length < 3) {
          // schema miss: one repair retry with a bigger budget before giving up
          const again = await guarded(
            limiter, cname, sim,
            () => callMuse(base0, apiKey0, model0, { ...body, locale, aggregates: agg }, tally, { attemptMs: 25000, deadlineAt: Date.now() + 20000, retries: 0, maxTokens: 3000 }),
            { summary: "sim", tips: ["a", "b", "c"] },
          );
          c = coerceBrief((again && typeof again === "object" ? again : {}) as Record<string, unknown>);
        }
        const { summary, tips, best_time } = c;
        if (!summary || tips.length < 3) return { ...fallback(), error: "model_empty" };
        return base({ brief: { summary, tips, ...(best_time ? { best_time } : {}) }, tokens: tally.tokens });
      } catch (e) {
        const code = modelErrorCode(e);
        return { ...fallback(), error: code, degraded: isDegraded(code) || undefined };
      }
    };
    return J(await withCache(limiter, spec, produce));
  }

  if (body.action === "found_card") {
    if (!body.drop_id) return J({ ...fallback(), error: "missing_drop" }, 400);
    if (limiter) {
      const { data: d } = await limiter.from("drops").select("id,status").eq("id", body.drop_id).maybeSingle();
      if (!d || (d as { status: string }).status !== "active") {
        return J({ ...fallback(), error: "bad_drop" }, 404);
      }
    }
    if (!apiKey0) return J({ ...fallback(), error: "missing_key" });
    try {
      const image = await guarded(limiter, "meta", null, () => museImage(base0, apiKey0, typeof body.drop_type === "string" ? body.drop_type : "memory"));
      return J(base({ image }));
    } catch (e) {
      const code = modelErrorCode(e);
      return J({ ...fallback(), error: code, degraded: isDegraded(code) || undefined });
    }
  }

  // Re-validate the drop server-side (exists + active). Proximity stays
  // enforced by unlock_drop at unlock time, as today.
  if (body.action !== "clue_options") {
    if (!body.drop_id) return J({ ...fallback(), error: "missing_drop" }, 400);
    // Status-only lookup must see other creators' undiscovered drops (a Sense
    // pick is undiscovered by definition), so prefer the service-role key
    // (auto-injected env). Selects id+status only — still metadata, never
    // content or coords. Without it (local dev) this fails closed to templates.
    const checkerKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey;
    const admin = createClient(supabaseUrl, checkerKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: drop } = await admin
      .from("drops")
      .select("id,status,is_business")
      .eq("id", body.drop_id)
      .maybeSingle();
    if (!drop || (drop as { status: string }).status !== "active") {
      return J({ ...fallback(), error: "bad_drop" }, 404);
    }
    // Funnel: a Business drop was surfaced to this walker by Sense (server-side, trustworthy).
    if (body.action === "sense_reason" && (drop as { is_business?: boolean }).is_business && limiter) {
      try {
        await limiter.from("analytics_events").insert({
          user_id: user.id, event_name: "sense_shown",
          properties: { drop_id: body.drop_id, sponsored: true, surface: "sense" },
        });
      } catch { /* analytics must never block */ }
    }
  } else if (!body.draft || body.draft.trim().length < 2) {
    return J({ ...fallback(), error: "missing_draft" }, 400);
  }

  const apiKey = (Deno.env.get("LLM_API_KEY") || Deno.env.get("MUSE_API_KEY")) ?? "";
  // No key (local dev / CI) → client uses templates. Never fail the flow.
  if (!apiKey) return J({ ...fallback(), error: "missing_key" });

  const model = (Deno.env.get("LLM_MODEL") || Deno.env.get("MUSE_MODEL")) || "muse-spark-1.3";
  // Meta Muse API (dev.meta.ai/docs): OpenAI-compatible at api.meta.ai —
  // the OpenAI SDK pointed at this base calls /chat/completions.
  const baseUrl = ((Deno.env.get("LLM_BASE_URL") || Deno.env.get("MUSE_BASE_URL")) || "https://api.meta.ai/v1").replace(/\/$/, "");

  const level = Math.min(Math.max(body.context?.hint_level ?? 1, 1), 4);
  let spec: CacheSpec | null = null;
  if (limiter && !sim) {
    if (body.action === "hunt_hint") {
      spec = { key: `hint:${body.drop_id}:${level}:${locale}:${body.context?.distance_bucket ?? "na"}`, scope: "global", action: "hunt_hint", ttl: 600 };
    } else if (body.action === "clue_options") {
      spec = {
        key: `clue:${user.id}:${await sha(JSON.stringify([body.draft, body.drop_type, locale, body.business === true, body.business_name ?? ""]))}`,
        scope: user.id, action: "clue_options", ttl: 600,
      };
    }
  }

  const produce = async (): Promise<NarrateResponse> => {
    let parsed: unknown;
    try {
      parsed = await guarded(limiter, cname, sim, () => callMuse(baseUrl, apiKey, model, { ...body, locale }, tally), { reason: "ok", hint: "ok", line: "ok" });
    } catch (e) {
      const code = modelErrorCode(e);
      return { ...fallback(), error: code, degraded: isDegraded(code) || undefined };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ...fallback(), error: "model_parse" };
    }
    const obj = parsed as Record<string, unknown>;
    if (body.action === "clue_options") {
      const raw = Array.isArray(obj.options) ? obj.options : [];
      const options = raw
        .map((o) => cleanLine(o, MAX_OPTION))
        .filter((o): o is string => o !== null)
        .slice(0, 3);
      const sv = obj.safety as { verdict?: unknown; note?: unknown } | undefined;
      const verdict = sv?.verdict === "blocked" || sv?.verdict === "risky" ? sv.verdict : "ok";
      if (options.length === 0) return { ...fallback(), error: "model_empty" };
      return base({ options, safety: { verdict, note: cleanLine(sv?.note, MAX_TEXT) ?? undefined }, tokens: tally.tokens });
    }
    const text = cleanLine(obj.reason ?? obj.hint ?? obj.line, MAX_TEXT);
    if (!text) return { ...fallback(), error: "model_empty" };
    return base({ text, tokens: tally.tokens });
  };
  return J(await withCache(limiter, spec, produce));
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const res = await handle(req);
  const uid = res.headers.get("x-ai-uid");
  const action = res.headers.get("x-ai-act");
  if (uid && action) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      const latency = Date.now() - t0;
      const task = (async () => {
        try {
          const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
          await db.rpc("ai_call_log", {
            p_user: uid, p_action: action, p_latency_ms: latency,
            p_fallback: res.headers.get("x-ai-fb") === "1", p_cache: res.headers.get("x-ai-cache"),
            p_degraded: res.headers.get("x-ai-deg") === "1", p_error: res.headers.get("x-ai-err"),
            p_tokens: Number(res.headers.get("x-ai-tok") ?? 0) || null,
          });
          if (Math.random() < 0.01) await db.rpc("ai_cleanup");
        } catch { /* telemetry must never break a response */ }
      })();
      // deno-lint-ignore no-explicit-any
      const er = (globalThis as any).EdgeRuntime;
      if (er?.waitUntil) er.waitUntil(task);
      else await task;
    }
  }
  res.headers.delete("x-ai-uid");
  res.headers.delete("x-ai-act");
  return res;
});
