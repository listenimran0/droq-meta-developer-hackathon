import { TurboModuleRegistry } from 'react-native';
import { ADS_ENABLED } from '@/constants/ads';

/** True only when the native AdMob binary is actually linked in this install. */
export function isGoogleMobileAdsNativeReady(): boolean {
  if (!ADS_ENABLED) return false;
  try {
    return TurboModuleRegistry.get('RNGoogleMobileAdsModule') != null;
  } catch {
    return false;
  }
}
