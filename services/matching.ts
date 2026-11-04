import type { DropType } from '@/types/drop';
import { TIME_AFFINITY, type PartOfDay } from '@/services/sense';

/**
 * Visitor ↔ business matching. Pure and deterministic: used for the local
 * Quest fallback and mirrored 1:1 in the ai-narrator edge function (rules
 * fallback + the `fit` score the agent sees). Keep the two tables in sync.
 */

export type Mood = 'chill' | 'curious' | 'brave';
export type BusinessCategory = 'cafe' | 'food' | 'books' | 'shop' | 'art' | 'other';

export const BUSINESS_CATEGORIES: readonly BusinessCategory[] = [
  'cafe', 'food', 'books', 'shop', 'art', 'other',
];

/** How well a venue category suits a mood (0–9). */
export const MOOD_CATEGORY: Record<Mood, Record<BusinessCategory, number>> = {
  chill:   { cafe: 9, books: 8, art: 7, shop: 4, food: 4, other: 5 },
  curious: { art: 9, books: 8, shop: 7, food: 6, cafe: 5, other: 6 },
  brave:   { food: 9, shop: 6, art: 6, cafe: 4, books: 3, other: 6 },
};

/** How well a venue category suits a part of day (0–9). Shops/books are shut at night. */
export const PART_CATEGORY: Record<PartOfDay, Record<BusinessCategory, number>> = {
  morning:   { cafe: 9, books: 5, shop: 4, art: 4, food: 3, other: 4 },
  afternoon: { shop: 8, art: 7, books: 6, cafe: 6, food: 5, other: 5 },
  evening:   { food: 9, cafe: 6, art: 6, books: 5, shop: 5, other: 5 },
  night:     { food: 6, other: 5, cafe: 4, art: 4, books: 2, shop: 1 },
};

/** Plain (non-business) drops: which drop types suit a mood (0–9). */
export const MOOD_TYPE: Record<Mood, Partial<Record<DropType, number>>> = {
  chill:   { memory: 8, photo: 8, voice: 7, message: 6, time_capsule: 6 },
  curious: { secret: 9, puzzle: 8, video: 7, time_capsule: 7, photo: 6 },
  brave:   { challenge: 9, puzzle: 8, secret: 7, video: 6 },
};

export type WhyKey = 'whyMoodChill' | 'whyMoodCurious' | 'whyMoodBrave'
  | 'whyPartMorning' | 'whyPartAfternoon' | 'whyPartEvening' | 'whyPartNight'
  | 'whyNovel' | 'whyClose';

export type Fit = { score: number; whyKey: WhyKey };

export type FitInput = {
  type: DropType;
  category?: BusinessCategory | null;
  walkMinutes: number;
  mood: Mood;
  part: PartOfDay;
  /** Types the walker found recently, newest first */
  recentTypes?: DropType[];
};

const MOOD_WHY: Record<Mood, WhyKey> = {
  chill: 'whyMoodChill', curious: 'whyMoodCurious', brave: 'whyMoodBrave',
};
const PART_WHY: Record<PartOfDay, WhyKey> = {
  morning: 'whyPartMorning', afternoon: 'whyPartAfternoon', evening: 'whyPartEvening', night: 'whyPartNight',
};

/** Score 0–~30 and the strongest reason. Ties favour mood → part → novelty → distance. */
export function scoreFit(i: FitInput): Fit {
  const mood = i.category ? MOOD_CATEGORY[i.mood][i.category] : (MOOD_TYPE[i.mood][i.type] ?? 4);
  const part = i.category
    ? PART_CATEGORY[i.part][i.category]
    : (TIME_AFFINITY[i.part].includes(i.type) ? 7 : 4);
  const seen = (i.recentTypes ?? []).filter((t) => t === i.type).length;
  const novelty = seen === 0 ? 3 : seen >= 2 ? -2 : 0;
  const close = Math.round(4 * (1 - Math.min(Math.max(i.walkMinutes, 0), 15) / 15));
  const parts: [WhyKey, number][] = [
    [MOOD_WHY[i.mood], mood],
    [PART_WHY[i.part], part],
    [novelty > 0 ? 'whyNovel' : MOOD_WHY[i.mood], novelty > 0 ? novelty * 3 : -1],
    ['whyClose', close],
  ];
  let best = parts[0];
  for (const p of parts) if (p[1] > best[1]) best = p;
  return { score: mood + part + novelty + close, whyKey: best[0] };
}

export function isMood(v: unknown): v is Mood {
  return v === 'chill' || v === 'curious' || v === 'brave';
}
export function isCategory(v: unknown): v is BusinessCategory {
  return typeof v === 'string' && (BUSINESS_CATEGORIES as readonly string[]).includes(v);
}
