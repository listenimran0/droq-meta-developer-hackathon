import type { DropType, NearbyDrop } from '@/types/drop';
import { isDropDiscoverable } from '@/utils/location';

/**
 * Sense — AI-powered pick of the moment for nearby discovery.
 *
 * Scores real nearby candidates (RPC metadata only: id, type, visibility,
 * unlock state, age, distance) and returns a structured pick with an i18n
 * reason key. The pick NEVER carries content, media paths, or coordinates,
 * so it is safe to render before unlock.
 *
 * Model seam: `SenseProvider` is the interface a future server-side model
 * will implement. Providers run off-device (edge function) — API keys must
 * never ship in the client. Provider output is untrusted: always pass it
 * through `resolveSensePick()` before use.
 */

export const SENSE_VERSION = 1;

export type SenseReasonKey =
  | 'senseFriend'
  | 'senseTheme'
  | 'senseClose'
  | 'senseFresh'
  | 'senseNearby';

export type SenseCandidate = {
  drop: NearbyDrop;
  /** Client-side meters; must be finite. Server distance_m preferred by callers. */
  distance: number;
};

export type SenseContext = {
  now?: Date;
  /** e.g. dailyTheme.preferredType — no extra fetch needed */
  themeType?: DropType;
  /** Types the user found recently, most recent first (optional novelty signal) */
  recentTypes?: DropType[];
  /** Local part of day (optional signal; absent → no time bonus, scores unchanged) */
  partOfDay?: PartOfDay;
};

export type PartOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/** Local part of day from a Date's local hour. */
export function partOfDay(date: Date): PartOfDay {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

/** Drop types that feel right at each part of day (a nudge, not a rule). */
export const TIME_AFFINITY: Record<PartOfDay, readonly DropType[]> = {
  morning: ['photo', 'memory', 'message'],
  afternoon: ['puzzle', 'challenge', 'video'],
  evening: ['voice', 'time_capsule', 'memory'],
  night: ['secret', 'time_capsule', 'message'],
};

export type SensePick = {
  dropId: string;
  type: DropType;
  distanceM: number;
  reasonKey: SenseReasonKey;
  score: number;
  version: number;
};

/** Minimal metadata a model provider may see — never coords or content. */
export type SenseSignal = {
  id: string;
  type: DropType;
  visibility: NearbyDrop['visibility'];
  distanceM: number;
  ageHours: number;
  themeMatch: boolean;
  isSocial: boolean;
};

export type SenseProvider = (
  signals: SenseSignal[],
  ctx: Pick<SenseContext, 'themeType'>,
) => Promise<{ dropId: string } | null>;

const SOCIAL_VISIBILITY: ReadonlySet<string> = new Set(['friends', 'direct']);

function toSignals(
  candidates: SenseCandidate[],
  ctx: SenseContext,
): { candidate: SenseCandidate; signal: SenseSignal }[] {
  const now = ctx.now ?? new Date();
  const out: { candidate: SenseCandidate; signal: SenseSignal }[] = [];
  for (const candidate of candidates) {
    const drop = candidate?.drop;
    if (!drop || typeof drop.id !== 'string' || !drop.id) continue;
    if (!Number.isFinite(candidate.distance) || candidate.distance < 0) continue;
    if (
      !isDropDiscoverable({
        unlockAt: drop.unlock_at,
        expiresAt: drop.expires_at,
        now,
      })
    ) {
      continue;
    }
    const createdMs = new Date(drop.created_at).getTime();
    const ageHours = Number.isFinite(createdMs)
      ? Math.max(0, (now.getTime() - createdMs) / 3_600_000)
      : Number.POSITIVE_INFINITY;
    out.push({
      candidate,
      signal: {
        id: drop.id,
        type: drop.type,
        visibility: drop.visibility,
        distanceM: candidate.distance,
        ageHours,
        themeMatch: ctx.themeType != null && drop.type === ctx.themeType,
        isSocial: SOCIAL_VISIBILITY.has(drop.visibility),
      },
    });
  }
  return out;
}

export function scoreSignal(
  signal: SenseSignal,
  recentTypes: DropType[],
  part?: PartOfDay,
): number {
  // Proximity base 0–50 with diminishing returns past ~1km.
  const proximity = 50 * (1 - Math.min(signal.distanceM, 1000) / 1000);
  let score = proximity;
  // Social drops are rare and personal — strongest single signal.
  if (signal.isSocial) score += 30;
  // Daily theme alignment gives the pick a "why today".
  if (signal.themeMatch) score += 20;
  // Fresh drops feel alive.
  if (signal.ageHours <= 24) score += 10;
  // Novelty: unseen +10, seen once 0, a type they keep finding −5.
  const seen = recentTypes.filter((t) => t === signal.type).length;
  if (seen === 0) score += 10;
  else if (seen >= 2) score -= 5;
  // Time of day nudge (only when the caller supplies it).
  if (part && TIME_AFFINITY[part].includes(signal.type)) score += 8;
  return score;
}

function reasonFor(signal: SenseSignal): SenseReasonKey {
  if (signal.isSocial) return 'senseFriend';
  if (signal.themeMatch) return 'senseTheme';
  if (signal.distanceM <= 100) return 'senseClose';
  if (signal.ageHours <= 24) return 'senseFresh';
  return 'senseNearby';
}

/**
 * Deterministic heuristic pick. Pure function — safe to unit test,
 * zero network, zero tokens. Higher score wins; ties break by distance,
 * then id, so output is stable for identical input.
 */
export function pickSenseDrop(
  candidates: SenseCandidate[],
  ctx: SenseContext = {},
): SensePick | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const recentTypes = Array.isArray(ctx.recentTypes) ? ctx.recentTypes : [];
  const scored = toSignals(candidates, ctx).map(({ candidate, signal }) => ({
    candidate,
    signal,
    score: scoreSignal(signal, recentTypes, ctx.partOfDay),
  }));
  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.signal.distanceM !== b.signal.distanceM) {
      return a.signal.distanceM - b.signal.distanceM;
    }
    return a.signal.id < b.signal.id ? -1 : a.signal.id > b.signal.id ? 1 : 0;
  });
  const winner = scored[0]!;
  return {
    dropId: winner.signal.id,
    type: winner.signal.type,
    distanceM: winner.signal.distanceM,
    reasonKey: reasonFor(winner.signal),
    score: winner.score,
    version: SENSE_VERSION,
  };
}

/**
 * Validate untrusted provider output against the live candidate set.
 * Returns a full SensePick or null — never throws on malformed input.
 */
export function resolveSensePick(
  raw: unknown,
  candidates: SenseCandidate[],
  ctx: SenseContext = {},
): SensePick | null {
  if (!raw || typeof raw !== 'object') return null;
  const dropId = (raw as { dropId?: unknown }).dropId;
  if (typeof dropId !== 'string' || !dropId) return null;
  const match = (Array.isArray(candidates) ? candidates : []).find(
    (c) => c?.drop?.id === dropId,
  );
  if (!match) return null;
  // Re-score locally so reason/score always reflect verified state.
  const rescored = pickSenseDrop([match], ctx);
  if (!rescored) return null;
  // Single-candidate rescore is only valid if the drop itself is eligible.
  return rescored.dropId === dropId ? rescored : null;
}

/** Default provider: heuristic engine, async-shaped for interchangeability. */
export const heuristicSenseProvider: SenseProvider = async (signals, ctx) => {
  void ctx;
  if (!Array.isArray(signals) || signals.length === 0) return null;
  const recentTypes: DropType[] = [];
  let best: SenseSignal | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const s of signals) {
    if (!s || typeof s.id !== 'string') continue;
    const score = scoreSignal(s, recentTypes);
    if (
      score > bestScore ||
      (score === bestScore && best && s.distanceM < best.distanceM) ||
      (score === bestScore && best && s.distanceM === best.distanceM && s.id < best.id)
    ) {
      best = s;
      bestScore = score;
    }
  }
  return best ? { dropId: best.id } : null;
};

/** Build provider-safe signals from live candidates (drops metadata only). */
export function toSenseSignals(
  candidates: SenseCandidate[],
  ctx: SenseContext = {},
): SenseSignal[] {
  if (!Array.isArray(candidates)) return [];
  return toSignals(candidates, ctx).map(({ signal }) => signal);
}
