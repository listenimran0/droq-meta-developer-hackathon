import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { MIN_TOUCH, leading, radii, space, typography, type ThemeColors } from '@/constants/theme';
import { formatDistance } from '@/utils/location';
import type { DropType } from '@/types/drop';

type Props = {
  type: DropType;
  distanceM: number;
  /** Already resolved via t(reasonKey) by the caller */
  reason: string;
  onPress: () => void;
};

/**
 * Sense — the visible AI pick of the moment.
 * The AI pill is deliberate: this is the hackathon's flagship AI surface and
 * must read as AI at a glance. Shows type + distance + reason only — never
 * content or coordinates.
 */
export function SenseCard({ type, distanceM, reason, onPress }: Props) {
  const { colors } = useTheme();
  const { t, typeLabel, locale } = useI18n();
  const styles = useMemo(() => createStyles(colors, locale), [colors, locale]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('sense')}: ${reason}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.glyph}>✦</Text>
      <View style={styles.copy}>
        <View style={styles.eyebrowRow}>
          <View style={styles.aiPill}>
            <Text style={styles.aiPillText}>{t('aiBadge')}</Text>
          </View>
          <Text style={styles.eyebrow}>{t('sense')}</Text>
        </View>
        <Text style={styles.reason} numberOfLines={3}>
          {reason}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {typeLabel(type)} · {formatDistance(distanceM)}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, locale: 'en' | 'bn') {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      borderRadius: radii.md,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      minHeight: MIN_TOUCH,
      marginBottom: space.md,
    },
    glyph: { fontFamily: typography.bodyMedium, fontSize: 16, color: colors.accent },
    copy: { flex: 1, gap: space.xs },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    aiPill: {
      backgroundColor: colors.accent,
      borderRadius: radii.sm,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
    },
    aiPillText: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: locale === 'bn' ? 0 : 0.8,
      color: colors.bg,
    },
    eyebrow: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: locale === 'bn' ? 0 : 1.6,
      textTransform: 'uppercase',
      color: colors.accent,
    },
    reason: {
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      lineHeight: leading(locale, 15),
      color: colors.text,
    },
    meta: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: leading(locale, 13),
      color: colors.textMuted,
    },
    chevron: { fontFamily: typography.body, fontSize: 20, color: colors.textDim },
  });
}
