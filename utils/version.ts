/** Semver-ish compare: a > b → 1, a < b → -1, equal → 0 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n.replace(/\D/g, ''), 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n.replace(/\D/g, ''), 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}
