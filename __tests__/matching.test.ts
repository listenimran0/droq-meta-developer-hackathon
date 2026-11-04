import {
  BUSINESS_CATEGORIES,
  MOOD_CATEGORY,
  PART_CATEGORY,
  isCategory,
  isMood,
  scoreFit,
  type BusinessCategory,
  type Mood,
} from '../services/matching';
import { planQuestLocal } from '../services/quest';
import type { PartOfDay, SenseSignal } from '../services/sense';

jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));

const fit = (category: BusinessCategory, mood: Mood, part: PartOfDay, walk = 3) =>
  scoreFit({ type: 'memory', category, mood, part, walkMinutes: walk });

describe('affinity matrices', () => {
  it('cover every category for every mood and part of day', () => {
    for (const m of Object.values(MOOD_CATEGORY)) for (const c of BUSINESS_CATEGORIES) expect(typeof m[c]).toBe('number');
    for (const p of Object.values(PART_CATEGORY)) for (const c of BUSINESS_CATEGORIES) expect(typeof p[c]).toBe('number');
  });
});

describe('scoreFit', () => {
  it('chill morning prefers a café over street food', () => {
    expect(fit('cafe', 'chill', 'morning').score).toBeGreaterThan(fit('food', 'chill', 'morning').score);
  });
  it('brave evening prefers street food over books', () => {
    expect(fit('food', 'brave', 'evening').score).toBeGreaterThan(fit('books', 'brave', 'evening').score);
  });
  it('curious afternoon prefers art or books over a café', () => {
    expect(fit('art', 'curious', 'afternoon').score).toBeGreaterThan(fit('cafe', 'curious', 'afternoon').score);
  });
  it('de-ranks shops and bookshops at night', () => {
    expect(fit('shop', 'curious', 'night').score).toBeLessThan(fit('shop', 'curious', 'afternoon').score);
    expect(fit('books', 'chill', 'night').score).toBeLessThan(fit('books', 'chill', 'afternoon').score);
  });
  it('rewards novelty and penalises a type found repeatedly', () => {
    const base = { type: 'photo' as const, mood: 'chill' as const, part: 'morning' as const, walkMinutes: 5 };
    const unseen = scoreFit({ ...base, recentTypes: [] }).score;
    const many = scoreFit({ ...base, recentTypes: ['photo', 'photo'] }).score;
    expect(unseen - many).toBe(5);
  });
  it('closer is better, capped at 15 min', () => {
    expect(fit('cafe', 'chill', 'morning', 1).score).toBeGreaterThan(fit('cafe', 'chill', 'morning', 14).score);
    expect(fit('cafe', 'chill', 'morning', 15).score).toBe(fit('cafe', 'chill', 'morning', 99).score);
  });
  it('explains with the dominant factor', () => {
    expect(fit('cafe', 'chill', 'morning', 14).whyKey).toBe('whyMoodChill');
    expect(scoreFit({ type: 'memory', category: 'other', mood: 'chill', part: 'night', walkMinutes: 1, recentTypes: [] }).whyKey).toBeDefined();
  });
  it('is deterministic', () => {
    expect(fit('food', 'brave', 'evening')).toEqual(fit('food', 'brave', 'evening'));
  });
  it('uses type affinity for plain (non-business) drops', () => {
    const secret = scoreFit({ type: 'secret', mood: 'curious', part: 'night', walkMinutes: 3 });
    const photo = scoreFit({ type: 'memory', mood: 'brave', part: 'morning', walkMinutes: 3 });
    expect(secret.score).toBeGreaterThan(photo.score);
  });
});

describe('guards', () => {
  it('isMood / isCategory', () => {
    expect(isMood('chill')).toBe(true);
    expect(isMood('angry')).toBe(false);
    expect(isCategory('books')).toBe(true);
    expect(isCategory('casino')).toBe(false);
  });
});

describe('planQuestLocal with mood + time', () => {
  const sig = (id: string, type: SenseSignal['type'], distanceM: number): SenseSignal => ({
    id, type, visibility: 'public', distanceM, ageHours: 5, themeMatch: false, isSocial: false,
  });
  const signals = [sig('a', 'memory', 100), sig('b', 'puzzle', 120), sig('c', 'challenge', 140), sig('d', 'photo', 160)];

  it('chill and brave pick different first stops', () => {
    const chill = planQuestLocal(signals, 30, { mood: 'chill', partOfDay: 'morning' });
    const brave = planQuestLocal(signals, 30, { mood: 'brave', partOfDay: 'afternoon' });
    expect(chill?.steps.map((s) => s.type)).toContain('memory');
    expect(brave?.steps.map((s) => s.type)).toContain('challenge');
    expect(chill?.steps.map((s) => s.dropId)).not.toEqual(brave?.steps.map((s) => s.dropId));
  });
  it('every stop carries a why key and no sponsored flag', () => {
    const q = planQuestLocal(signals, 30, { mood: 'curious', partOfDay: 'evening' });
    expect(q?.steps.every((s) => !!s.whyKey && !s.sponsored)).toBe(true);
  });
  it('without options behaves exactly as before (no why)', () => {
    const q = planQuestLocal(signals, 30);
    expect(q?.steps.every((s) => s.whyKey === undefined)).toBe(true);
  });
});
