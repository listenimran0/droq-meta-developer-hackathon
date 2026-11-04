export function formatRelativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/** Future unlock countdown for Ghost / time capsules. */
export function formatUnlockCountdown(
  unlockAt: string | null | undefined,
  now = new Date(),
): string | null {
  if (!unlockAt) return null;
  const target = new Date(unlockAt).getTime();
  if (!Number.isFinite(target)) return null;
  const ms = target - now.getTime();
  if (ms <= 0) return null;
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `Opens in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `Opens in ${hours}h`;
  const days = Math.ceil(hours / 24);
  if (days < 14) return `Opens in ${days} day${days === 1 ? '' : 's'}`;
  return `Opens ${new Date(unlockAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: days > 200 ? 'numeric' : undefined,
  })}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
