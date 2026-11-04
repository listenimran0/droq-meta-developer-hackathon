import React, { useEffect, useMemo } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { layout } from '@/constants/theme';
import { outdoorBand, outdoorGlowBoost } from '@/constants/voice';

type Props = {
  variant?: 'default' | 'hero' | 'auth';
  /** Cancel drift loops when screen is covered */
  paused?: boolean;
};

/** Soft atmosphere — ink depth + drifting brass glow. Hour of day nudges warmth. */
export function AmbientBackground({ variant = 'default', paused = false }: Props) {
  const { colors, scheme } = useTheme();
  const drift = useSharedValue(0);
  const breathe = useSharedValue(0.85);
  const isLight = scheme === 'light';
  const glowBoost = outdoorGlowBoost(outdoorBand());

  useEffect(() => {
    if (paused) {
      cancelAnimation(drift);
      cancelAnimation(breathe);
      return;
    }

    const start = () => {
      drift.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 9000, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
      breathe.value = withDelay(
        400,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }),
            withTiming(0.82, { duration: 4200, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
          false,
        ),
      );
    };

    start();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        start();
      } else {
        cancelAnimation(drift);
        cancelAnimation(breathe);
      }
    });

    return () => {
      sub.remove();
      cancelAnimation(drift);
      cancelAnimation(breathe);
    };
  }, [breathe, drift, paused]);

  const brassStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift.value * 18 },
      { translateY: drift.value * -12 },
      { scale: breathe.value * (0.92 + glowBoost * 0.08) },
    ],
    opacity:
      ((isLight ? 0.35 : 0.55) + breathe.value * (isLight ? 0.15 : 0.25)) * glowBoost,
  }));

  const mistStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift.value * -22 },
      { translateY: drift.value * 16 },
    ],
    opacity: (isLight ? 0.25 : 0.4) + (1 - drift.value) * (isLight ? 0.12 : 0.25),
  }));

  const heroBoost = variant === 'hero' || variant === 'auth';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        base: {
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        },
        washTop: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '42%',
          backgroundColor: colors.bgWash,
          opacity: isLight ? 0.7 : 0.9,
        },
        washBottom: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '38%',
          backgroundColor: isLight ? colors.bgSoft : colors.ink,
          opacity: isLight ? 0.45 : 0.85,
        },
        orb: {
          position: 'absolute',
          borderRadius: 999,
        },
        brassOrb: {
          width: 280,
          height: 280,
          top: -80,
          right: -60,
          backgroundColor: colors.glow,
        },
        brassOrbHero: {
          width: 340,
          height: 340,
          backgroundColor: colors.accentSoft,
        },
        mistOrb: {
          width: 320,
          height: 320,
          bottom: -100,
          left: -90,
          backgroundColor: colors.mist,
        },
        horizon: {
          position: 'absolute',
          left: layout.gutter,
          right: layout.gutter,
          bottom: '30%',
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.accentLine,
          opacity: isLight ? 0.5 : 0.35,
        },
      }),
    [colors, isLight],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.base, { backgroundColor: colors.bg }]} />
      <View style={styles.washTop} />
      <View style={styles.washBottom} />

      <Animated.View
        style={[
          styles.orb,
          styles.brassOrb,
          heroBoost && styles.brassOrbHero,
          brassStyle,
        ]}
      />
      <Animated.View style={[styles.orb, styles.mistOrb, mistStyle]} />

      {variant === 'hero' ? <View style={styles.horizon} /> : null}
    </View>
  );
}
