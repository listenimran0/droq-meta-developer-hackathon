import { useEffect, useState } from 'react';
import { adFreeRemainingMs, isAdFree, subscribeAdFree } from '@/lib/ads/adFree';

/** Live ad-free state — true while a rewarded ad (or grant) has removed ads. */
export function useAdFree(): boolean {
  const [adFree, setAdFree] = useState(isAdFree());

  useEffect(() => subscribeAdFree(setAdFree), []);

  return adFree;
}

/** Remaining ad-free time, in minutes, for display purposes. */
export function useAdFreeMinutes(): number {
  const adFree = useAdFree();
  if (!adFree) return 0;
  return Math.max(1, Math.ceil(adFreeRemainingMs() / 60_000));
}
