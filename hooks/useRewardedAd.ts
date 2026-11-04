import { useCallback, useEffect, useRef, useState } from 'react';
import { ADS_ENABLED, ADMOB_REWARDED_UNIT_ID, resolveAdUnit } from '@/constants/ads';
import type { AdsModule } from '@/lib/adsModule';
import { loadAdsModule } from '@/lib/adsModule';
import { isGoogleMobileAdsNativeReady } from '@/lib/adsNative';
import { runWhenIdle } from '@/lib/runWhenIdle';

type RewardedInstance = {
  load: () => void;
  show: () => Promise<void>;
  addAdEventsListener: (listener: (event: { type: string; payload: unknown }) => void) => () => void;
};

/** How long `show()` waits for a slow ad request before giving up. */
const LOAD_WAIT_MS = 8_000;
/** Safety net if the SDK never reports the ad as closed. */
const OUTCOME_TIMEOUT_MS = 180_000;

type RewardedAd = {
  /** A rewarded video finished loading and can be shown. */
  ready: boolean;
  /** A show request is in flight (load or playback). */
  busy: boolean;
  /** Shows the video — waits for load if needed. Resolves true on earned reward. */
  show: () => Promise<boolean>;
};

/**
 * Rewarded video. Loads in the background as soon as the screen mounts so the
 * video is ready before the user taps; never touches the native package on
 * binaries that don't ship it.
 */
export function useRewardedAd(): RewardedAd {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const readyRef = useRef(false);
  const earnedRef = useRef(false);
  const adRef = useRef<RewardedInstance | null>(null);
  const moduleRef = useRef<AdsModule | null>(null);
  const loadWaiters = useRef<Array<(loaded: boolean) => void>>([]);

  const markLoaded = useCallback((next: boolean) => {
    readyRef.current = next;
    setReady(next);
    if (next && loadWaiters.current.length) {
      const waiters = loadWaiters.current.splice(0, loadWaiters.current.length);
      for (const waiter of waiters) waiter(true);
    }
  }, []);

  useEffect(() => {
    if (!ADS_ENABLED || !isGoogleMobileAdsNativeReady()) return;
    let cancelled = false;
    const task = runWhenIdle(() => {
      void (async () => {
        try {
          const ads = await loadAdsModule();
          if (cancelled || !ads) return;
          const unitId = resolveAdUnit(ADMOB_REWARDED_UNIT_ID, ads.TestIds.REWARDED);
          if (!unitId) {
            console.warn('[ads] Rewarded unit missing — set ADMOB_REWARDED_UNIT_ID in constants/ads.ts');
            return;
          }
          const instance = ads.RewardedAd.createForAdRequest(unitId, {});
          instance.addAdEventsListener(({ type }) => {
            if (cancelled) return;
            if (type === ads.AdEventType.LOADED || type === ads.RewardedAdEventType.LOADED) {
              markLoaded(true);
            } else if (type === ads.AdEventType.CLOSED) {
              markLoaded(false);
              instance.load();
            } else if (type === ads.AdEventType.ERROR) {
              markLoaded(false);
            }
          });
          if (cancelled) return;
          moduleRef.current = ads;
          adRef.current = instance as unknown as RewardedInstance;
          instance.load();
        } catch {
          // Ad stays unavailable; the settings row keeps its normal state.
        }
      })();
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [markLoaded]);

  const waitForLoad = useCallback(async (): Promise<boolean> => {
    if (readyRef.current) return true;
    const ad = adRef.current;
    if (!ad) return false;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const settle = (loaded: boolean) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        loadWaiters.current = loadWaiters.current.filter((waiter) => waiter !== settle);
        resolve(loaded);
      };
      timer = setTimeout(() => settle(false), LOAD_WAIT_MS);
      loadWaiters.current.push(settle);
      ad.load(); // no-op when a request is already in flight
    });
  }, []);

  const show = useCallback(async (): Promise<boolean> => {
    const ads = moduleRef.current;
    const ad = adRef.current;
    if (busyRef.current || !ads || !ad) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      if (!(await waitForLoad())) return false;

      earnedRef.current = false;
      const earned = await new Promise<boolean>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const finish = (result: boolean) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          unsubscribe();
          resolve(result);
        };
        const unsubscribe = ad.addAdEventsListener(({ type }) => {
          if (type === ads.RewardedAdEventType.EARNED_REWARD) {
            earnedRef.current = true;
            finish(true);
          } else if (type === ads.AdEventType.CLOSED) {
            finish(earnedRef.current);
          } else if (type === ads.AdEventType.ERROR) {
            finish(false);
          }
        });
        timer = setTimeout(() => finish(earnedRef.current), OUTCOME_TIMEOUT_MS);
        try {
          void ad.show().catch(() => finish(false));
        } catch {
          finish(false);
        }
      });
      return earned;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [waitForLoad]);

  return { ready, busy, show };
}
