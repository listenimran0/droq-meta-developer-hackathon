import React, { useEffect, useMemo, useState, type ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import { ADS_ENABLED, ADMOB_BANNER_UNIT_ID } from '@/constants/ads';
import { loadAdsModule } from '@/lib/adsModule';
import { isGoogleMobileAdsNativeReady } from '@/lib/adsNative';
import { runWhenIdle } from '@/lib/runWhenIdle';
import { useAdFree } from '@/hooks/useAdFree';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  /** Extra top margin when sitting under content */
  spaced?: boolean;
};

type BannerProps = {
  unitId: string;
  size: string;
  onAdFailedToLoad?: () => void;
};

/**
 * Minimum clearance between an ad and the app content around it.
 *
 * AdMob asks that ads never sit flush against other interactive elements —
 * a banner crowding a button is an accidental-click complaint waiting to
 * happen. Every banner therefore keeps at least this much space above and
 * below itself, whatever the screen does.
 */
const AD_CLEARANCE = 12;

/**
 * Anchored adaptive banner. Never loads the AdMob JS package unless the native
 * module is registered — prevents TurboModule invariant crashes on stale APKs.
 * Hides itself while an ad-free session is active.
 */
export function BannerAdSlot({ spaced = true }: Props) {
  const { colors } = useTheme();
  const adFree = useAdFree();
  const [failed, setFailed] = useState(false);
  const [Banner, setBanner] = useState<ComponentType<BannerProps> | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
          // Floor only — the banner is never clipped, so its "Ad" label and
          // options affordance always stay fully visible.
          minHeight: 50,
          marginTop: AD_CLEARANCE,
          marginBottom: AD_CLEARANCE,
        },
        spaced: {
          marginTop: AD_CLEARANCE + 8,
        },
      }),
    [colors],
  );

  useEffect(() => {
    if (!ADS_ENABLED || !isGoogleMobileAdsNativeReady()) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    const task = runWhenIdle(() => {
      void (async () => {
        const ads = await loadAdsModule();
        if (cancelled) return;
        if (!ads) {
          setFailed(true);
          return;
        }
        setBanner(() => ads.BannerAd as unknown as ComponentType<BannerProps>);
        setSize(ads.BannerAdSize.ANCHORED_ADAPTIVE_BANNER);
        setUnitId(__DEV__ ? ads.TestIds.ADAPTIVE_BANNER : ADMOB_BANNER_UNIT_ID);
      })();
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, []);

  if (!ADS_ENABLED || adFree || failed || !Banner || !size || !unitId) {
    return null;
  }

  return (
    <View style={[styles.wrap, spaced && styles.spaced]} pointerEvents="box-none">
      <Banner unitId={unitId} size={size} onAdFailedToLoad={() => setFailed(true)} />
    </View>
  );
}
