import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';

type Props = {
  found: number;
  goal: number;
  title: string;
  subtitle?: string | null;
  inside?: boolean;
  complete?: boolean;
};

/** Quiet place-challenge progress — ring via text + bar, not a card stack. */
export function ChallengeProgress({
  found,
  goal,
  title,
  subtitle,
  inside,
  complete,
}: Props) {
  const { colors } = useTheme();
  const pct = goal > 0 ? Math.min(1, found / goal) : 0;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { gap: 8, width: '100%' },
        top: {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        },
        eyebrow: {
          fontFamily: typography.bodyMedium,
          fontSize: 10,
          letterSpacing: 2.4,
          textTransform: 'uppercase',
          color: complete ? colors.success : colors.accent,
        },
        count: {
          fontFamily: typography.brand,
          fontSize: 18,
          letterSpacing: -0.5,
          color: colors.text,
        },
        title: {
          fontFamily: typography.bodyMedium,
          fontSize: 14,
          color: colors.text,
        },
        sub: {
          fontFamily: typography.body,
          fontSize: 12,
          lineHeight: 17,
          color: colors.textDim,
        },
        track: {
          height: 3,
          borderRadius: 2,
          backgroundColor: colors.borderStrong,
          overflow: 'hidden',
        },
        fill: {
          height: 3,
          borderRadius: 2,
          backgroundColor: complete ? colors.success : colors.accent,
        },
      }),
    [colors, complete, pct],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Text style={styles.eyebrow}>
          {complete ? 'Complete' : inside ? 'In zone' : 'Place challenge'}
        </Text>
        <Text style={styles.count}>
          {found}/{goal}
        </Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
    </View>
  );
}
