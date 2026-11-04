import AsyncStorage from '@react-native-async-storage/async-storage';
import { acceptBestTime, localBrief, sanitizeBrief, toAggregates, type BusinessBrief, type BusinessInsights } from '@/services/insights';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { trackEvent } from './analytics';
import type { DropType } from '@/types/drop';
import { resolveRemoteQuest, type Quest } from './quest';
import type { SenseSignal } from './sense';

/**
 * Client for the ai-narrator edge function (Muse-powered copy).
 *
 * Rules: model text is untrusted — sanitize before render, cache per drop so
 * one hunt costs at most one call, and ALWAYS fall back to local template
 * copy on any failure (callers treat null as "use templates").
 */

const FN = 'ai-narrator';
const MAX_TEXT = 140;
const MAX_OPTION = 120;
const COORD_RE = /-?\d{1,3}\.\d{3,}/;
/** Model calls must never hang the UI — fall back instead. */
const INVOKE_TIMEOUT_MS = 15_000;

export type DistanceBucket = '<100' | '100-400' | '400+';

export function distanceBucket(meters: number): DistanceBucket {
  if (Number.isFinite(meters) && meters < 100) return '<100';
  if (Number.isFinite(meters) && meters <= 400) return '100-400';
  return '400+';
}

/** Reject non-strings, overlong text, and anything shaped like coordinates. */
export function sanitizeNarratorText(raw: unknown, max = MAX_TEXT): string | null {
  if (typeof raw !== 'string') return null;
  const line = raw.replace(/\s+/g, ' ').trim();
  if (!line || line.length > max) return null;
  if (COORD_RE.test(line)) return null;
  return line;
}

export type SafetyVerdict = 'ok' | 'risky' | 'blocked';

export type ClueAssist = {
  options: string[];
  safety: { verdict: SafetyVerdict; note?: string };
};

const reasonCache = new Map<string, string>();
const reasonInflight = new Map<string, Promise<string | null>>();

/**
 * Last server-side error code (`missing_key`, `model_http_401`, …).
 * Shown in dev toasts so a dead AI call is diagnosable on-device.
 * Never rendered in release builds.
 */
let lastServerError: string | null = null;
export function getLastNarratorError(): string | null {
  return lastServerError;
}

/** True when the last call was served degraded (Meta outage/429 or breaker open). */
let lastDegraded = false;
export function wasLastNarratorDegraded(): boolean {
  return lastDegraded;
}

async function invokeFn(
  body: Record<string, unknown>,
  timeoutMs: number = INVOKE_TIMEOUT_MS,
): Promise<{
  ok: boolean;
  fallback: boolean;
  text?: unknown;
  options?: unknown;
  safety?: unknown;
  error?: unknown;
  quest?: unknown;
  trace?: unknown;
  image?: unknown;
  brief?: unknown;
  engine?: unknown;
  degraded?: unknown;
} | null> {
  try {
    const res = await Promise.race([
      supabase.functions.invoke(FN, { body }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!res) {
      lastServerError = 'timeout';
      return null;
    }
    const { data, error } = res;
    const code =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null;
    if (error || !data || typeof data !== 'object') {
      lastServerError = code ?? 'invoke_error';
      return null;
    }
    lastServerError = (data as { fallback?: unknown }).fallback ? (code ?? 'fallback') : null;
    lastDegraded = (data as { degraded?: unknown }).degraded === true;
    return data as {
      ok: boolean;
      fallback: boolean;
      text?: unknown;
      options?: unknown;
      safety?: unknown;
      error?: unknown;
      quest?: unknown;
      trace?: unknown;
      image?: unknown;
      brief?: unknown;
      engine?: unknown;
      degraded?: unknown;
    };
  } catch {
    return null;
  }
}

export async function fetchSenseReason(input: {
  dropId: string;
  dropType: DropType;
  distanceM: number;
  isSocial: boolean;
  themeMatch: boolean;
  locale: 'en' | 'bn';
}): Promise<string | null> {
  if (!isSupabaseConfigured || !input.dropId) return null;
  const key = `reason:${input.dropId}:${input.locale}`;
  const cached = reasonCache.get(key);
  if (cached) return cached;
  const running = reasonInflight.get(key);
  if (running) return running;

  const job = (async () => {
    try {
      const data = await invokeFn({
        action: 'sense_reason',
        drop_id: input.dropId,
        drop_type: input.dropType,
        locale: input.locale,
        context: {
          distance_bucket: distanceBucket(input.distanceM),
          is_social: input.isSocial,
          theme_match: input.themeMatch,
        },
      });
      const text = sanitizeNarratorText(data?.text);
      if (text) reasonCache.set(key, text);
      return text;
    } finally {
      reasonInflight.delete(key);
    }
  })();
  reasonInflight.set(key, job);
  return job;
}

export async function fetchClueAssist(input: {
  draft: string;
  dropType: DropType;
  locale: 'en' | 'bn';
  /** Business switch on → the model writes an offer teaser instead of a clue. */
  business?: boolean;
  businessName?: string;
}): Promise<ClueAssist | null> {
  if (!isSupabaseConfigured || !input.draft || input.draft.trim().length < 2) {
    return null;
  }
  const data = await invokeFn({
    action: 'clue_options',
    draft: input.draft.slice(0, 500),
    drop_type: input.dropType,
    locale: input.locale,
    ...(input.business ? { business: true, business_name: (input.businessName ?? '').slice(0, 60) } : {}),
  });
  if (!data) {
    // Visible in analytics_events — silent failures become diagnosable.
    trackEvent('clue_failed', { error: 'invoke_null' }).catch(() => undefined);
    return null;
  }
  if (data.fallback) {
    trackEvent('clue_failed', {
      error: String(data.error ?? 'fallback'),
    }).catch(() => undefined);
    return null;
  }
  const options = (Array.isArray(data.options) ? data.options : [])
    .map((o) => sanitizeNarratorText(o, MAX_OPTION))
    .filter((o): o is string => o !== null)
    .slice(0, 3);
  const rawSafety = (data.safety ?? {}) as { verdict?: unknown; note?: unknown };
  const verdict: SafetyVerdict =
    rawSafety.verdict === 'blocked' || rawSafety.verdict === 'risky'
      ? rawSafety.verdict
      : 'ok';
  return {
    options,
    safety: { verdict, note: sanitizeNarratorText(rawSafety.note) ?? undefined },
  };
}

const hintCache = new Map<string, string>();
const hintInflight = new Map<string, Promise<string | null>>();

/** Escalating riddle-hints while hunting (1 playful → 4 final nudge). */
export async function fetchHuntHint(input: {
  dropId: string;
  dropType: DropType;
  level: number;
  locale: 'en' | 'bn';
}): Promise<string | null> {
  if (!isSupabaseConfigured || !input.dropId) return null;
  const level = Math.min(Math.max(Math.round(input.level) || 1, 1), 4);
  const key = `hint:${input.dropId}:${level}:${input.locale}`;
  const cached = hintCache.get(key);
  if (cached) return cached;
  const running = hintInflight.get(key);
  if (running) return running;

  const job = (async () => {
    try {
      const data = await invokeFn({
        action: 'hunt_hint',
        drop_id: input.dropId,
        drop_type: input.dropType,
        locale: input.locale,
        context: { hint_level: level },
      });
      const text = sanitizeNarratorText(data?.text);
      if (text) hintCache.set(key, text);
      else {
        // Visible in analytics_events — silent failures become diagnosable.
        trackEvent('hint_failed', {
          drop_id: input.dropId,
          level,
          error: String(data?.error ?? 'unknown'),
        }).catch(() => undefined);
      }
      return text;
    } finally {
      hintInflight.delete(key);
    }
  })();
  hintInflight.set(key, job);
  return job;
}

/** One warm AI line on the post-unlock celebration. Silent on failure. */
export async function fetchFoundLine(input: {
  dropId: string;
  dropType: DropType;
  locale: 'en' | 'bn';
}): Promise<string | null> {
  if (!isSupabaseConfigured || !input.dropId) return null;
  const key = `found:${input.dropId}:${input.locale}`;
  const cached = hintCache.get(key);
  if (cached) return cached;
  const running = hintInflight.get(key);
  if (running) return running;

  const job = (async () => {
    try {
      const data = await invokeFn({
        action: 'found_epilogue',
        drop_id: input.dropId,
        drop_type: input.dropType,
        locale: input.locale,
      });
      const text = sanitizeNarratorText(data?.text);
      if (text) hintCache.set(key, text);
      return text;
    } finally {
      hintInflight.delete(key);
    }
  })();
  hintInflight.set(key, job);
  return job;
}

/**
 * Quest Agent: Muse plans a 1–3 stop walk via tool calling on the server.
 * Only metadata leaves the device (id, type, rounded distance, social flag).
 * Returns null on any failure — callers fall back to `planQuestLocal`.
 */
export async function fetchQuestPlan(input: {
  signals: SenseSignal[];
  intent: string;
  minutes: number;
  locale: 'en' | 'bn';
  /** Local hour 0–23 (the server derives part of day for get_time). */
  localHour?: number;
  mood?: 'chill' | 'curious' | 'brave';
}): Promise<Quest | null> {
  if (!isSupabaseConfigured || input.signals.length === 0) return null;
  const data = await invokeFn(
    {
      action: 'quest_plan',
      locale: input.locale,
      intent: input.intent.slice(0, 80),
      minutes: input.minutes,
      local_hour: input.localHour,
      mood: input.mood,
      candidates: input.signals.slice(0, 12).map((s) => ({
        id: s.id,
        type: s.type,
        distance_m: Math.round(s.distanceM / 10) * 10,
        is_social: s.isSocial,
      })),
    },
    40_000,
  );
  if (!data || data.fallback) {
    trackEvent('quest_failed', { error: String(data?.error ?? 'invoke_null') }).catch(
      () => undefined,
    );
    return null;
  }
  const quest = resolveRemoteQuest(
    data.quest && typeof data.quest === 'object'
      ? { ...(data.quest as object), trace: data.trace }
      : null,
    input.signals,
  );
  if (quest) {
    // The server falls back to its deterministic rules engine when the model is down.
    quest.ai = data.engine !== 'rules';
    quest.title = sanitizeNarratorText(quest.title, 60) ?? undefined;
    quest.steps = quest.steps.map((st) => ({
      ...st,
      teaser: sanitizeNarratorText(st.teaser, 100) ?? undefined,
      business: st.business ? sanitizeNarratorText(st.business, 60) ?? undefined : undefined,
      why: st.why ? sanitizeNarratorText(st.why, 100) ?? undefined : undefined,
    }));
  }
  return quest;
}

const cardCache = new Map<string, string>();

/** Muse Image Found card → data URI or https URL. Null on failure. */
export async function fetchFoundCard(input: {
  dropId: string;
  dropType: DropType;
  locale: 'en' | 'bn';
}): Promise<string | null> {
  if (!isSupabaseConfigured || !input.dropId) return null;
  const cached = cardCache.get(input.dropId);
  if (cached) return cached;
  const data = await invokeFn(
    {
      action: 'found_card',
      drop_id: input.dropId,
      drop_type: input.dropType,
      locale: input.locale,
    },
    55_000,
  );
  const img = data?.image as { b64?: unknown; url?: unknown } | undefined;
  let uri: string | null = null;
  if (typeof img?.b64 === 'string' && /^[A-Za-z0-9+/=\s]+$/.test(img.b64)) {
    uri = `data:image/png;base64,${img.b64.replace(/\s/g, '')}`;
  } else if (typeof img?.url === 'string' && img.url.startsWith('https://')) {
    uri = img.url;
  }
  if (uri) cardCache.set(input.dropId, uri);
  else trackEvent('card_failed', { error: String(data?.error ?? 'invoke_null') }).catch(() => undefined);
  return uri;
}

/** Test seam — clear caches between tests. */
export function __clearNarratorCache(): void {
  briefCache.clear();
  reasonCache.clear();
  reasonInflight.clear();
  hintCache.clear();
  hintInflight.clear();
  cardCache.clear();
}

/**
 * Muse Business Brief: aggregates in, {summary, tips[3]} out. Falls back to a
 * deterministic template; `ai` tells the UI whether the model wrote it.
 */
const briefCache = new Map<string, { brief: BusinessBrief; ai: boolean }>();
const BRIEF_STORE = 'droq:brief:';

function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export async function fetchBusinessBrief(
  insights: BusinessInsights,
  locale: 'en' | 'bn',
): Promise<{ brief: BusinessBrief; ai: boolean }> {
  const fallbackBrief = { brief: localBrief(insights, locale), ai: false };
  if (!isSupabaseConfigured) return fallbackBrief;
  // One brief per owner, per day, per language and data snapshot: repeat views are instant and free.
  let owner = 'anon';
  try {
    const { data } = await supabase.auth.getSession();
    owner = data.session?.user.id ?? 'anon';
  } catch {
    /* keep anon */
  }
  const day = new Date().toISOString().slice(0, 10);
  const key = `${BRIEF_STORE}${owner}:${day}:${locale}:${hashStr(JSON.stringify(toAggregates(insights)))}`;
  const mem = briefCache.get(key);
  if (mem) return mem;
  try {
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      const v = JSON.parse(stored) as { brief: BusinessBrief; ai: boolean };
      if (v?.brief?.summary) {
        briefCache.set(key, v);
        return v;
      }
    }
  } catch {
    /* cache is best-effort */
  }
  const data = await invokeFn({ action: 'business_brief', locale, aggregates: toAggregates(insights) }, 45_000);
  if (!data || data.fallback) return fallbackBrief;
  const brief = sanitizeBrief(data.brief);
  if (!brief) return fallbackBrief;
  brief.bestTime = acceptBestTime(brief.bestTime, insights.audience, locale);
  const value = { brief, ai: true };
  briefCache.set(key, value);
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
  return value;
}
