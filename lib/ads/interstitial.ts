import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ADS_ENABLED,
  ADMOB_INTERSTITIAL_UNIT_ID,
  INTERSTITIAL_MAX_PER_DAY,
  INTERSTITIAL_MIN_GAP_MS,
  INTERSTITIAL_RETRY_MS,
  resolveAdUnit,
} from '@/constants/ads';
import type { AdsModule } from '@/lib/adsModule';
import { loadAdsModule } from '@/lib/adsModule';
import { isGoogleMobileAdsNativeReady } from '@/lib/adsNative';
import { isAdFree } from '@/lib/ads/adFree';

type InterstitialInstance = {
  load: () => void;
  show: () => Promise<void>;
};

const CAP_KEY = '@droq/interstitial_cap';

type Cap = { day: string; count: number; last: number };

const listeners = new Set<(ready: boolean) => void>();

let adsModule: AdsModule | null = null;
let ad: InterstitialInstance | null = null;
let ready = false;
let starting = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let cap: Cap | null = null;

function dayKey(now = new Date()): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function setReady(next: boolean): void {
  if (ready === next) return;
  ready = next;
  for (const listener of [...listeners]) listener(ready);
}

function emitNow(listener: (ready: boolean) => void): void {
  listener(ready);
}

export function isInterstitialReady(): boolean {
  return ready;
}

/** Fires immediately with the current state, then on every change. */
export function subscribeInterstitial(listener: (ready: boolean) => void): () => void {
  listeners.add(listener);
  emitNow(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function loadCap(): Promise<Cap> {
  if (cap) return cap;
  try {
    const raw = await AsyncStorage.getItem(CAP_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Cap>) : null;
    cap = {
      day: parsed?.day ?? dayKey(),
      count: typeof parsed?.count === 'number' ? parsed.count : 0,
      last: typeof parsed?.last === 'number' ? parsed.last : 0,
    };
  } catch {
    cap = { day: dayKey(), count: 0, last: 0 };
  }
  return cap;
}

async function saveCap(next: Cap): Promise<void> {
  cap = next;
  try {
    await AsyncStorage.setItem(CAP_KEY, JSON.stringify(next));
  } catch {
    // Losing the counter only relaxes the cap for one session.
  }
}

function scheduleRetry(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    ad?.load();
  }, INTERSTITIAL_RETRY_MS);
}

/**
 * Preloads the interstitial once per session. Safe to call from any screen —
 * no-ops while a load is already pending or the unit is unconfigured.
 */
export function preloadInterstitial(): void {
  if (!ADS_ENABLED || !isGoogleMobileAdsNativeReady() || ad || starting) return;
  starting = true;
  void (async () => {
    try {
      const ads = await loadAdsModule();
      if (!ads) return;
      const unitId = resolveAdUnit(ADMOB_INTERSTITIAL_UNIT_ID, ads.TestIds.INTERSTITIAL);
      if (!unitId) {
        console.warn('[ads] Interstitial unit missing — set ADMOB_INTERSTITIAL_UNIT_ID in constants/ads.ts');
        return;
      }
      const instance = ads.InterstitialAd.createForAdRequest(unitId, {});
      instance.addAdEventsListener(({ type }) => {
        if (type === ads.AdEventType.LOADED) setReady(true);
        else if (type === ads.AdEventType.CLOSED) {
          setReady(false);
          instance.load();
        } else if (type === ads.AdEventType.ERROR) {
          setReady(false);
          scheduleRetry();
        }
      });
      adsModule = ads;
      ad = instance;
      instance.load();
    } catch {
      // Ads stay hidden; banners keep working independently.
    } finally {
      starting = false;
    }
  })();
}

/**
 * Shows the interstitial when it is loaded, the user is not in an ad-free
 * session, and both frequency caps (per day, minimum gap) allow it.
 * Returns whether an impression was actually requested.
 */
export async function showInterstitial(): Promise<boolean> {
  if (!ADS_ENABLED || !isGoogleMobileAdsNativeReady() || !adsModule || !ad || !ready) return false;
  if (isAdFree()) return false;

  const now = Date.now();
  const current = await loadCap();
  const today = dayKey(new Date(now));
  const session =
    current.day === today ? current : { day: today, count: 0, last: current.last };
  if (session.count >= INTERSTITIAL_MAX_PER_DAY) return false;
  if (session.last && now - session.last < INTERSTITIAL_MIN_GAP_MS) return false;

  setReady(false);
  try {
    void ad.show().catch(() => undefined);
  } catch {
    ad.load();
    return false;
  }
  void saveCap({ ...session, count: session.count + 1, last: Date.now() });
  return true;
}
