import { useEffect } from 'react';
import { ADS_ENABLED } from '@/constants/ads';
import { isGoogleMobileAdsNativeReady } from '@/lib/adsNative';
import { preloadInterstitial } from '@/lib/ads/interstitial';

/**
 * Initializes the Google Mobile Ads SDK once at app start, then warms up the
 * interstitial so the first natural break isn't a cold load.
 * Never imports the JS package unless the native TurboModule is present
 * (avoids RNGoogleMobileAdsModule invariant crash on stale / Expo Go binaries).
 */
export function useAdsBootstrap() {
  useEffect(() => {
    if (!ADS_ENABLED || !isGoogleMobileAdsNativeReady()) return;
    let cancelled = false;
    (async () => {
      try {
        const mobileAds = (await import('react-native-google-mobile-ads')).default;
        if (cancelled) return;
        await mobileAds().initialize();
        if (cancelled) return;
        preloadInterstitial();
      } catch {
        // Native ads unavailable — banners stay hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
