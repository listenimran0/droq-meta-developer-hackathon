import { compareVersions } from '@/utils/version';

describe('compareVersions', () => {
  it('orders semver strings', () => {
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.1.0', '1.1.0')).toBe(0);
    expect(compareVersions('1.1.0', '1.0.9')).toBe(1);
  });
});
