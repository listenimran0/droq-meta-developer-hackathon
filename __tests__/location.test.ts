import {
  calculateDistance,
  canUnlockAtDistance,
  formatDistanceBucket,
  getBoundingBox,
  gpsUnlockBuffer,
  isDropDiscoverable,
  isDropExpired,
  isDropTimeLocked,
  isGpsSettlingForUnlock,
  isWithinRadius,
} from '../utils/location';

describe('calculateDistance (Haversine)', () => {
  it('returns ~0 for identical points', () => {
    expect(calculateDistance(23.78, 90.4, 23.78, 90.4)).toBeLessThan(0.01);
  });

  it('computes short urban distances reasonably', () => {
    // ~55–70m between these points
    const d = calculateDistance(23.7806, 90.4070, 23.7810, 90.4075);
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(100);
  });

  it('rejects invalid coordinates', () => {
    expect(() => calculateDistance(NaN, 0, 0, 0)).toThrow(/Invalid/);
    expect(() => calculateDistance(100, 0, 0, 0)).toThrow(/Latitude/);
    expect(() => calculateDistance(0, 200, 0, 0)).toThrow(/Longitude/);
  });
});

describe('isWithinRadius', () => {
  it('unlocks when inside radius', () => {
    expect(isWithinRadius(12, 25)).toBe(true);
    expect(isWithinRadius(25, 25)).toBe(true);
  });

  it('does not unlock when outside radius', () => {
    expect(isWithinRadius(26, 25)).toBe(false);
  });

  it('handles invalid values', () => {
    expect(isWithinRadius(NaN, 25)).toBe(false);
    expect(isWithinRadius(10, -1)).toBe(false);
  });
});

describe('GPS unlock buffer (same-spot reliability)', () => {
  it('adds accuracy buffer so two phones at one place can unlock', () => {
    // 40m away, 25m drop radius, ±30m GPS → effective 55m → unlock
    expect(canUnlockAtDistance(40, 25, 30)).toBe(true);
    // 90m away should still fail
    expect(canUnlockAtDistance(90, 25, 30)).toBe(false);
  });

  it('clamps buffer between 20 and 60', () => {
    expect(gpsUnlockBuffer(5)).toBe(20);
    expect(gpsUnlockBuffer(100)).toBe(60);
    expect(gpsUnlockBuffer(null)).toBe(30);
  });
});

describe('GPS settling gate', () => {
  it('blocks unlock UI when accuracy is worse than unlock radius', () => {
    expect(isGpsSettlingForUnlock(50, 40)).toBe(true);
    expect(isGpsSettlingForUnlock(30, 40)).toBe(false);
    expect(isGpsSettlingForUnlock(null, 40)).toBe(false);
  });
});

describe('time locks', () => {
  it('detects future Ghost Drops', () => {
    expect(isDropTimeLocked('2030-01-01T00:00:00.000Z', new Date('2026-01-01'))).toBe(true);
    expect(isDropTimeLocked('2020-01-01T00:00:00.000Z', new Date('2026-01-01'))).toBe(false);
    expect(isDropTimeLocked(null)).toBe(false);
  });

  it('detects expired Drops', () => {
    expect(isDropExpired('2020-01-01T00:00:00.000Z', new Date('2026-01-01'))).toBe(true);
    expect(isDropExpired('2030-01-01T00:00:00.000Z', new Date('2026-01-01'))).toBe(false);
  });

  it('combines discoverability rules', () => {
    expect(
      isDropDiscoverable({
        unlockAt: '2030-01-01T00:00:00.000Z',
        expiresAt: null,
        status: 'active',
        now: new Date('2026-01-01'),
      }),
    ).toBe(false);

    expect(
      isDropDiscoverable({
        unlockAt: null,
        expiresAt: null,
        status: 'active',
      }),
    ).toBe(true);

    expect(
      isDropDiscoverable({
        unlockAt: null,
        expiresAt: null,
        status: 'removed',
      }),
    ).toBe(false);
  });
});

describe('bounding box', () => {
  it('creates a box around a point', () => {
    const box = getBoundingBox(23.78, 90.4, 1000);
    expect(box.minLat).toBeLessThan(23.78);
    expect(box.maxLat).toBeGreaterThan(23.78);
    expect(box.minLng).toBeLessThan(90.4);
    expect(box.maxLng).toBeGreaterThan(90.4);
  });
});

describe('formatDistanceBucket', () => {
  it('coarsens distances without leaking exact meters', () => {
    expect(formatDistanceBucket(40)).toBe('~50m');
    expect(formatDistanceBucket(120)).toBe('~100m');
    expect(formatDistanceBucket(250)).toBe('~200m');
    expect(formatDistanceBucket(500)).toBe('~500m');
    expect(formatDistanceBucket(900)).toBe('~800m');
    expect(formatDistanceBucket(1500)).toBe('far');
  });
});
