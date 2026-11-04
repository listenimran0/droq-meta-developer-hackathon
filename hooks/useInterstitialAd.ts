import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  isInterstitialReady,
  preloadInterstitial,
  showInterstitial,
  subscribeInterstitial,
} from '@/lib/ads/interstitial';

/** Full-screen ad state for the current session. */
export function useInterstitialAd(): { ready: boolean; show: () => Promise<boolean> } {
  const [ready, setReady] = useState(isInterstitialReady());

  useEffect(() => {
    preloadInterstitial();
    return subscribeInterstitial(setReady);
  }, []);

  const show = useCallback(() => showInterstitial(), []);

  return { ready, show };
}

/**
 * Fires the (capped, ad-free-aware) interstitial on a natural break — use it
 * after the payoff of a screen, never in the middle of the hunt.
 *
 * The delay is deliberately long. The user just tapped something to land
 * here, and a full-screen ad that covers the fresh screen a second later
 * reads as an unexpected ad (AdMob policy). Waiting a few seconds lets the
 * result settle first, and the ad only shows while the app is in front.
 */
export function useInterstitialBreak(delayMs = 4_000): void {
  const { show } = useInterstitialAd();

  useEffect(() => {
    const timer = setTimeout(() => {
      // Never pop a full-screen ad over another app.
      if (AppState.currentState !== 'active') return;
      void show();
    }, delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, show]);
}
