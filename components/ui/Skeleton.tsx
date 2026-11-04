import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  makeMutable,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { layout, radii, type ThemeColors } from '@/constants/theme';

type BoneProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * One shimmer for every skeleton in the app.
 *
 * The pulse used to run per bone — a seven-row list meant fourteen infinite
 * Reanimated animations, each with its own shared value and animated style.
 * That kept the UI thread busy and made scrolling and navigation feel heavy.
 * The bones always pulsed in sync anyway, so one animation on the container
 * gives the same look for a fraction of the cost.
 */
let sharedPulse: SharedValue<number> | null = null;
let pulseStarted = false;

function getSharedPulse(): SharedValue<number> {
  if (!sharedPulse) {
    sharedPulse = makeMutable(0);
  }
  return sharedPulse;
}

/** Shared shimmer for a whole skeleton. */
function useSkeletonPulse() {
  const pulse = getSharedPulse();

  useEffect(() => {
    if (pulseStarted) return;
    pulseStarted = true;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);

  return useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.38, 0.78]),
  }));
}

/** Soft shimmer bar — theme-aware, no hard spinner. */
export function SkeletonBone({ width = '100%', height = 14, radius = radii.md, style }: BoneProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.bgSoft,
        },
        style,
      ]}
    />
  );
}

/** Hairline list-row placeholders */
export function ListSkeleton({ rows = 6, padded = true }: { rows?: number; padded?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => listStyles(colors), [colors]);
  const pulse = useSkeletonPulse();

  return (
    <Animated.View style={[styles.wrap, padded && styles.padded, pulse]}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBone width={28} height={12} />
          <View style={styles.rowBody}>
            <SkeletonBone width={`${58 + (i % 3) * 10}%` as `${number}%`} height={14} />
            <SkeletonBone width={`${34 + (i % 2) * 12}%` as `${number}%`} height={11} style={styles.meta} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

/** Home hero stage while GPS / nearby settle */
export function HomeSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(() => homeStyles(colors), [colors]);
  const pulse = useSkeletonPulse();

  return (
    <Animated.View style={[styles.wrap, pulse]}>
      <SkeletonBone width={96} height={10} style={styles.center} />
      <SkeletonBone width="72%" height={18} style={[styles.center, styles.gap]} />
      <SkeletonBone width={140} height={64} radius={radii.lg} style={[styles.center, styles.gapLg]} />
      <SkeletonBone width="58%" height={12} style={[styles.center, styles.gap]} />
      <View style={styles.actions}>
        <SkeletonBone height={54} radius={radii.md} />
        <SkeletonBone height={54} radius={radii.md} style={styles.gap} />
      </View>
    </Animated.View>
  );
}

/** Profile header + stats + link rows */
export function ProfileSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(() => profileStyles(colors), [colors]);
  const pulse = useSkeletonPulse();

  return (
    <Animated.View style={[styles.wrap, pulse]}>
      <View style={styles.header}>
        <SkeletonBone width={68} height={68} radius={34} />
        <View style={styles.headerText}>
          <SkeletonBone width={40} height={8} />
          <SkeletonBone width="70%" height={22} style={styles.gapSm} />
          <SkeletonBone width="40%" height={12} style={styles.gapSm} />
        </View>
      </View>
      <View style={styles.stats}>
        <SkeletonBone width={48} height={28} />
        <SkeletonBone width={48} height={28} />
        <SkeletonBone width={48} height={28} />
      </View>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={styles.link}>
          <SkeletonBone width={24} height={12} />
          <SkeletonBone width={`${45 + (i % 3) * 8}%` as `${number}%`} height={13} />
        </View>
      ))}
    </Animated.View>
  );
}

/** Discover listening state (ring-shaped) */
export function DiscoverSkeleton() {
  const styles = useMemo(() => discoverStyles(), []);
  const pulse = useSkeletonPulse();

  return (
    <Animated.View style={[styles.wrap, pulse]}>
      <SkeletonBone width={180} height={180} radius={90} />
      <SkeletonBone width={88} height={10} style={styles.gap} />
      <SkeletonBone width="55%" height={16} style={styles.gap} />
      <SkeletonBone width={100} height={36} radius={radii.md} style={styles.gapLg} />
    </Animated.View>
  );
}

/** Friends / people rows with avatar circle */
export function PeopleSkeleton({ rows = 5 }: { rows?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => peopleStyles(colors), [colors]);
  const pulse = useSkeletonPulse();

  return (
    <Animated.View style={[styles.wrap, pulse]}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBone width={40} height={40} radius={20} />
          <View style={styles.body}>
            <SkeletonBone width={`${50 + (i % 3) * 12}%` as `${number}%`} height={14} />
            <SkeletonBone width="30%" height={11} style={styles.meta} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

function listStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 0 },
    padded: { paddingHorizontal: layout.gutter, paddingTop: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 18,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowBody: { flex: 1, gap: 8 },
    meta: { marginTop: 0 },
  });
}

function homeStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingVertical: 24,
      gap: 0,
    },
    center: { alignSelf: 'center' },
    gap: { marginTop: 14 },
    gapLg: { marginTop: 22 },
    actions: { marginTop: 36, gap: 12 },
  });
}

function profileStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { paddingTop: 4 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 28 },
    headerText: { flex: 1, gap: 0 },
    gapSm: { marginTop: 8 },
    stats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 22,
      marginBottom: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
    },
    link: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 18,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
  });
}

function discoverStyles() {
  return StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center', gap: 0, paddingVertical: 24 },
    gap: { marginTop: 16, alignSelf: 'center' },
    gapLg: { marginTop: 28, alignSelf: 'center' },
  });
}

function peopleStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: layout.gutter, paddingTop: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    body: { flex: 1, gap: 8 },
    meta: {},
  });
}
