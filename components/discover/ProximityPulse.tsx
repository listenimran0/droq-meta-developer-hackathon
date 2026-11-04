import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';
import { formatDistance } from '@/utils/location';

export type NearbyBlip = {
  id: string;
  bucketLabel: string;
};

type Props = {
  distanceMeters: number | null;
  found?: boolean;
  locked?: boolean;
  message?: string;
  /** Degrees relative to device heading (−180…180). Shows needle when set. */
  compassOffset?: number | null;
  compassLabel?: string;
  /** Faint secondary signals (no exact pin / direction). */
  blips?: NearbyBlip[];
  /** Stage scale — home uses sm, discover lg */
  size?: 'sm' | 'md' | 'lg';
  /** Faster pulse when within unlock range */
  urgent?: boolean;
  /** Proximity-scaled heartbeat (quantized so the loop rarely restarts) */
  intensity?: 'far' | 'near' | 'close';
  /** Hide copy/distance — rings only (home stage) */
  ringsOnly?: boolean;
  /** Hide giant distance line (discover shows its own dock copy) */
  hideDistance?: boolean;
  paused?: boolean;
};

const SIZE = {
  sm: { stage: 168, wash: 148, outer: 148, ring: 104, core: 40, glow: 52 },
  md: { stage: 240, wash: 210, outer: 210, ring: 150, core: 58, glow: 72 },
  lg: { stage: 276, wash: 242, outer: 242, ring: 172, core: 64, glow: 80 },
} as const;

function blipPosition(index: number, stage: number): { top: number; left: number } {
  const s = stage / 240;
  const spots = [
    { top: 28 * s, left: 178 * s },
    { top: 168 * s, left: 28 * s },
    { top: 178 * s, left: 168 * s },
  ];
  return spots[index % spots.length];
}

function ProximityPulseComponent({
  distanceMeters,
  found,
  locked,
  message,
  compassOffset,
  compassLabel,
  blips = [],
  size = 'md',
  urgent = false,
  intensity = 'far',
  ringsOnly = false,
  hideDistance = false,
  paused = false,
}: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const pulse = useRef(new Animated.Value(0.85)).current;
  const pulse2 = useRef(new Animated.Value(0.7)).current;
  const dim = SIZE[size];
  const intensityScale = intensity === 'close' ? 0.65 : intensity === 'near' ? 0.85 : 1;
  const beat = (urgent || found ? 0.72 : 1) * intensityScale;

  useEffect(() => {
    if (paused) {
      pulse.stopAnimation();
      pulse2.stopAnimation();
      return;
    }
    const d1 = 1600 * beat;
    const d2 = 2200 * beat;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.14,
          duration: d1,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.85,
          duration: d1,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse2, {
          toValue: 1.28,
          duration: d2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse2, {
          toValue: 0.7,
          duration: d2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    loop2.start();
    return () => {
      loop.stop();
      loop2.stop();
    };
  }, [pulse, pulse2, beat, paused]);

  const proximity =
    distanceMeters == null
      ? 0
      : Math.max(0, Math.min(1, 1 - distanceMeters / 500));

  const ringColor = found
    ? colors.accentBright
    : locked
      ? colors.accentSoft
      : colors.accentLine;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          alignItems: 'center',
          gap: ringsOnly ? 0 : 18,
        },
        stage: {
          width: dim.stage,
          height: dim.stage,
          alignItems: 'center',
          justifyContent: 'center',
        },
        stageWash: {
          position: 'absolute',
          width: dim.wash,
          height: dim.wash,
          borderRadius: dim.wash / 2,
          backgroundColor: colors.glow,
          opacity: urgent || found ? 0.95 : 0.75,
        },
        ringOuter: {
          position: 'absolute',
          width: dim.outer,
          height: dim.outer,
          borderRadius: dim.outer / 2,
          borderWidth: 1,
        },
        ring: {
          position: 'absolute',
          width: dim.ring,
          height: dim.ring,
          borderRadius: dim.ring / 2,
          borderWidth: 1.5,
        },
        core: {
          width: dim.core,
          height: dim.core,
          borderRadius: dim.core / 2,
          borderWidth: 1.5,
        },
        glowRing: {
          position: 'absolute',
          width: dim.glow,
          height: dim.glow,
          borderRadius: dim.glow / 2,
          borderWidth: 1,
          borderColor: colors.accentBright,
          opacity: 0.45,
        },
        blip: {
          position: 'absolute',
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: colors.accentSoft,
          borderWidth: 1,
          borderColor: colors.accentLine,
          opacity: 0.55,
        },
        status: {
          fontFamily: typography.bodyMedium,
          fontSize: 11,
          letterSpacing: 3.2,
          color: colors.accent,
        },
        message: {
          fontFamily: typography.body,
          fontSize: size === 'lg' ? 19 : 17,
          lineHeight: size === 'lg' ? 28 : 25,
          color: colors.textMuted,
          textAlign: 'center',
          maxWidth: 300,
        },
        distance: {
          fontFamily: typography.brand,
          fontSize: size === 'lg' ? 56 : 48,
          letterSpacing: -1.5,
          color: colors.text,
        },
        blipRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 10,
          maxWidth: 280,
        },
        blipLabel: {
          fontFamily: typography.bodyMedium,
          fontSize: 11,
          letterSpacing: 1.2,
          color: colors.textDim,
        },
        compassWrap: {
          alignItems: 'center',
          gap: 10,
          marginTop: 8,
        },
        needle: {
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'flex-start',
        },
        needleTip: {
          width: 0,
          height: 0,
          borderLeftWidth: 8,
          borderRightWidth: 8,
          borderBottomWidth: 28,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: colors.accentBright,
        },
        compassLabel: {
          fontFamily: typography.bodyMedium,
          fontSize: 12,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: colors.accentBright,
        },
      }),
    [colors, dim, ringsOnly, urgent, found, size],
  );

  const visibleBlips = blips.slice(0, 3);

  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        <View style={styles.stageWash} />
        <Animated.View
          style={[
            styles.ringOuter,
            {
              transform: [{ scale: pulse2 }],
              opacity: pulse2.interpolate({
                inputRange: [0.7, 1.28],
                outputRange: [locked ? 0.25 : urgent ? 0.55 : 0.4, 0.06],
              }),
              borderColor: ringColor,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.ring,
            {
              transform: [{ scale: pulse }],
              opacity: pulse.interpolate({
                inputRange: [0.85, 1.14],
                outputRange: [urgent ? 0.85 : 0.7, 0.15],
              }),
              borderColor: ringColor,
            },
          ]}
        />
        {!ringsOnly
          ? visibleBlips.map((b, i) => {
              const pos = blipPosition(i, dim.stage);
              return (
                <View
                  key={b.id}
                  style={[styles.blip, { top: pos.top, left: pos.left }]}
                />
              );
            })
          : null}
        <Animated.View
          style={[
            styles.core,
            {
              backgroundColor: found ? colors.accent : colors.accentSoft,
              borderColor: found ? colors.accentBright : colors.accentLine,
              transform: [{ scale: 0.72 + proximity * 0.42 }],
            },
          ]}
        />
        {found ? <View style={styles.glowRing} /> : null}
      </View>

      {!ringsOnly ? (
        <>
          <Text style={styles.status}>
            {found
              ? t('pulseFound')
              : locked
                ? t('pulseLocked')
                : distanceMeters == null
                  ? t('pulseListening')
                  : urgent
                    ? t('pulseInRange')
                    : t('pulseTracking')}
          </Text>

          <Text style={styles.message}>
            {message ??
              (found
                ? 'You found something.'
                : locked
                  ? 'Something is waiting — but not yet.'
                  : 'Something is nearby.')}
          </Text>

          {distanceMeters != null && !found && !hideDistance ? (
            <Text style={styles.distance}>{formatDistance(distanceMeters)}</Text>
          ) : null}

          {visibleBlips.length > 0 && !found ? (
            <View style={styles.blipRow}>
              {visibleBlips.map((b) => (
                <Text key={b.id} style={styles.blipLabel}>
                  · {b.bucketLabel}
                </Text>
              ))}
            </View>
          ) : null}

          {compassOffset != null && !found && !locked ? (
            <View style={styles.compassWrap}>
              <View
                style={[
                  styles.needle,
                  { transform: [{ rotate: `${compassOffset}deg` }] },
                ]}
              >
                <View style={styles.needleTip} />
              </View>
              <Text style={styles.compassLabel}>{compassLabel ?? 'This way'}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export const ProximityPulse = React.memo(ProximityPulseComponent);
