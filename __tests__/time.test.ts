import { formatRelativeTime, formatUnlockCountdown } from '../utils/time';

describe('formatUnlockCountdown', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');

  it('returns null when unlocked or missing', () => {
    expect(formatUnlockCountdown(null, now)).toBeNull();
    expect(formatUnlockCountdown('2026-09-09T11:00:00.000Z', now)).toBeNull();
  });

  it('formats near-term countdowns', () => {
    expect(formatUnlockCountdown('2026-09-09T12:45:00.000Z', now)).toBe('Opens in 45m');
    expect(formatUnlockCountdown('2026-09-10T00:00:00.000Z', now)).toMatch(/^Opens in \d+h$/);
    expect(formatUnlockCountdown('2026-09-12T12:00:00.000Z', now)).toBe('Opens in 3 days');
  });
});

describe('formatRelativeTime', () => {
  it('formats past times', () => {
    const now = new Date('2026-09-09T12:00:00.000Z');
    expect(formatRelativeTime('2026-09-09T11:59:30.000Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-09-09T10:00:00.000Z', now)).toBe('2h ago');
  });
});
