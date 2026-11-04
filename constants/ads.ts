import { Platform } from 'react-native';

/** AdMob Android app ID (from AdMob console). */
export const ADMOB_ANDROID_APP_ID = 'ca-app-pub-5822607086908086~7579854490';

/**
 * iOS AdMob app not created yet — Google sample ID keeps the plugin valid.
 * Replace when you add an iOS app in AdMob.
 */
export const ADMOB_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

/** Production banner unit (Android). */
export const ADMOB_BANNER_UNIT_ID = 'ca-app-pub-5822607086908086/7934348768';

/**
 * Full-screen units — create them in AdMob (Apps → DROQ → Ad units) and paste
 * the IDs here. Empty = format stays off in release builds (dev still runs
 * Google test ads), so the app never serves an invalid unit id.
 */
export const ADMOB_INTERSTITIAL_UNIT_ID = '';
export const ADMOB_REWARDED_UNIT_ID = '';

/**
 * Interstitial caps: enough lift to matter, gentle enough to protect retention
 * and stay clear of "intrusive advertising" policy territory.
 */
export const INTERSTITIAL_MAX_PER_DAY = 3;
export const INTERSTITIAL_MIN_GAP_MS = 90_000;
export const INTERSTITIAL_RETRY_MS = 20_000;

/** What a finished rewarded video buys the user (temporary ad removal). */
export const AD_FREE_REWARD_MS = 60 * 60 * 1000;

export const ADS_ENABLED = Platform.OS === 'android' || Platform.OS === 'ios';

/**
 * Google test unit while developing, production unit in release builds.
 * Returns null when the production unit has not been configured yet.
 */
export function resolveAdUnit(prodUnitId: string, testUnitId: string): string | null {
  if (__DEV__) return testUnitId || null;
  return prodUnitId.trim() ? prodUnitId.trim() : null;
}
