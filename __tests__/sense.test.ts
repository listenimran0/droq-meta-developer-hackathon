import {
  heuristicSenseProvider,
  partOfDay,
  pickSenseDrop,
  resolveSensePick,
  scoreSignal,
  toSenseSignals,
  type SenseCandidate,
} from '../services/sense';
import type { NearbyDrop } from '../types/drop';

const NOW = new Date('2026-10-26T12:00:00Z');

function drop(overrides: Partial<NearbyDrop> = {}): NearbyDrop {
  return {
    id: 'drop-1',
    type: 'memory',
    unlock_radius: 40,
    latitude: 23.7806,
    longitude: 90.407,
    unlock_at: null,
    expires_at: null,
    created_at: '2026-10-26T10:00:00Z',
    visibility: 'public',
    ...overrides,
  };
}

function candidate(
  id: string,
  distance: number,
  overrides: Partial<NearbyDrop> = {},
): SenseCandidate {
  return { drop: drop({ id, ...overrides }), distance };
}

describe('pickSenseDrop', () => {
  it('returns null for empty input', () => {
    expect(pickSenseDrop([], { now: NOW })).toBeNull();
  });

  it('picks the closest available drop by default', () => {
    const pick = pickSenseDrop(
      [candidate('far', 500), candidate('near', 60)],
      { now: NOW },
    );
    expect(pick?.dropId).toBe('near');
    expect(pick?.reasonKey).toBe('senseClose');
  });

  it('prefers a friend drop over a nearer public one', () => {
    const pick = pickSenseDrop(
      [
        candidate('public-near', 40),
        candidate('friend-far', 300, { visibility: 'friends' }),
      ],
      { now: NOW },
    );
    expect(pick?.dropId).toBe('friend-far');
    expect(pick?.reasonKey).toBe('senseFriend');
  });

  it('prefers the daily-theme type over a nearer off-theme drop', () => {
    const pick = pickSenseDrop(
      [
        candidate('plain', 100, { type: 'memory' }),
        candidate('themed', 300, { type: 'voice' }),
      ],
      { now: NOW, themeType: 'voice' },
    );
    expect(pick?.dropId).toBe('themed');
    expect(pick?.reasonKey).toBe('senseTheme');
  });

  it('excludes time-locked and expired drops', () => {
    const pick = pickSenseDrop(
      [
        candidate('locked', 10, { unlock_at: '2026-10-27T12:00:00Z' }),
        candidate('expired', 20, { expires_at: '2026-10-25T12:00:00Z' }),
        candidate('open', 400),
      ],
      { now: NOW },
    );
    expect(pick?.dropId).toBe('open');
  });

  it('returns null when nothing is discoverable', () => {
    expect(
      pickSenseDrop([candidate('locked', 5, { unlock_at: '2026-12-01T00:00:00Z' })], {
        now: NOW,
      }),
    ).toBeNull();
  });

  it('ignores invalid candidates without throwing', () => {
    expect(
      pickSenseDrop(
        [
          { drop: null as unknown as NearbyDrop, distance: 10 },
          candidate('nan', NaN),
          candidate('neg', -5),
          candidate('ok', 120),
        ],
        { now: NOW },
      )?.dropId,
    ).toBe('ok');
  });

  it('is deterministic, breaking ties by distance then id', () => {
    const input = [candidate('b', 200), candidate('a', 200)];
    const first = pickSenseDrop(input, { now: NOW });
    const second = pickSenseDrop(input, { now: NOW });
    expect(first).toEqual(second);
    expect(first?.dropId).toBe('a');
  });

  it('never leaks content, media, or coordinates', () => {
    const pick = pickSenseDrop([candidate('x', 50)], { now: NOW });
    const keys = Object.keys(pick ?? {});
    expect(keys).toEqual(
      expect.arrayContaining(['dropId', 'type', 'distanceM', 'reasonKey', 'score', 'version']),
    );
    expect(keys).not.toEqual(
      expect.arrayContaining(['content', 'media_path', 'latitude', 'longitude']),
    );
  });
});

describe('resolveSensePick (untrusted provider output)', () => {
  const candidates = [candidate('a', 100), candidate('b', 200)];

  it('accepts a valid known id', () => {
    const pick = resolveSensePick({ dropId: 'b' }, candidates, { now: NOW });
    expect(pick?.dropId).toBe('b');
  });

  it('rejects unknown ids and malformed payloads', () => {
    expect(resolveSensePick({ dropId: 'ghost' }, candidates, { now: NOW })).toBeNull();
    expect(resolveSensePick(null, candidates, { now: NOW })).toBeNull();
    expect(resolveSensePick({ dropId: 42 }, candidates, { now: NOW })).toBeNull();
    expect(resolveSensePick('b', candidates, { now: NOW })).toBeNull();
  });

  it('rejects ids that are no longer discoverable', () => {
    const locked = [candidate('a', 10, { unlock_at: '2026-12-01T00:00:00Z' })];
    expect(resolveSensePick({ dropId: 'a' }, locked, { now: NOW })).toBeNull();
  });
});

describe('provider seam', () => {
  it('exposes metadata-only signals (no coords or content)', () => {
    const signals = toSenseSignals([candidate('a', 80)], { now: NOW });
    expect(signals).toHaveLength(1);
    expect(Object.keys(signals[0]!)).toEqual(
      expect.arrayContaining([
        'id',
        'type',
        'visibility',
        'distanceM',
        'ageHours',
        'themeMatch',
        'isSocial',
      ]),
    );
    expect(Object.keys(signals[0]!)).not.toEqual(
      expect.arrayContaining(['latitude', 'longitude', 'content', 'media_path']),
    );
  });

  it('heuristic provider agrees with the local pick', async () => {
    const candidates = [candidate('a', 300), candidate('b', 90)];
    const signals = toSenseSignals(candidates, { now: NOW });
    const via = await heuristicSenseProvider(signals, {});
    expect(via?.dropId).toBe(pickSenseDrop(candidates, { now: NOW })?.dropId);
  });
});

describe('Sense scoring signals (recent types + time of day)', () => {
  const sig = (type: string) => ({
    id: 'x', type: type as never, visibility: 'public' as const,
    distanceM: 500, ageHours: 100, themeMatch: false, isSocial: false,
  });

  it('partOfDay buckets local hours', () => {
    expect(partOfDay(new Date(2026, 10, 5, 6))).toBe('morning');
    expect(partOfDay(new Date(2026, 10, 5, 13))).toBe('afternoon');
    expect(partOfDay(new Date(2026, 10, 5, 19))).toBe('evening');
    expect(partOfDay(new Date(2026, 10, 5, 23))).toBe('night');
    expect(partOfDay(new Date(2026, 10, 5, 3))).toBe('night');
  });

  it('novelty: unseen > seen once > keeps finding the same type', () => {
    const unseen = scoreSignal(sig('photo'), []);
    const once = scoreSignal(sig('photo'), ['photo']);
    const many = scoreSignal(sig('photo'), ['photo', 'photo', 'memory']);
    expect(unseen - once).toBe(10);
    expect(once - many).toBe(5);
  });

  it('time of day adds a bonus only for matching types and only when provided', () => {
    const base = scoreSignal(sig('secret'), []);
    expect(scoreSignal(sig('secret'), [], 'night') - base).toBe(8);
    expect(scoreSignal(sig('secret'), [], 'morning')).toBe(base);
    expect(scoreSignal(sig('photo'), [], 'night')).toBe(scoreSignal(sig('photo'), []));
  });

  it('flips the pick when everything else is equal', () => {
    const cands = [candidate('a', 300, { type: 'photo' }), candidate('b', 300, { type: 'secret' })];
    expect(pickSenseDrop(cands, { now: NOW, partOfDay: 'morning' })?.dropId).toBe('a');
    expect(pickSenseDrop(cands, { now: NOW, partOfDay: 'night' })?.dropId).toBe('b');
  });

  it('leaves scores unchanged without time-of-day (backward compatible)', () => {
    const cands = [candidate('a', 300, { type: 'photo' }), candidate('b', 300, { type: 'secret' })];
    const x = pickSenseDrop(cands, { now: NOW });
    const y = pickSenseDrop(cands, { now: NOW, recentTypes: [] });
    expect(x?.score).toBe(y?.score);
  });
});
