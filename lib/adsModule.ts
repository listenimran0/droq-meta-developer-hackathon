export type AdsModule = typeof import('react-native-google-mobile-ads');

let adsModulePromise: Promise<AdsModule | null> | null = null;

/**
 * Lazily imports the AdMob JS package exactly once. Resolves null when the
 * package is unavailable, so callers can hide ads instead of crashing on a
 * missing TurboModule (Expo Go / stale APK) — same contract as BannerAdSlot.
 */
export function loadAdsModule(): Promise<AdsModule | null> {
  if (!adsModulePromise) {
    adsModulePromise = import('react-native-google-mobile-ads').catch(() => null);
  }
  return adsModulePromise;
}
