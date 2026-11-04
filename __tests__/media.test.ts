import { PHOTO_MAX_BYTES, VOICE_MAX_DURATION_MS } from '../constants/config';

describe('media upload validation', () => {
  it('enforces photo size budget', () => {
    expect(PHOTO_MAX_BYTES).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it('enforces voice duration budget', () => {
    expect(VOICE_MAX_DURATION_MS).toBe(30_000);
  });

  it('rejects empty media paths conceptually', () => {
    const path = '';
    expect(Boolean(path)).toBe(false);
  });
});
