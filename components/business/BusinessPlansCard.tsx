import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { leading, space, typography, type ThemeColors } from '@/constants/theme';

/**
 * Text-only preview of planned Business plans. No purchase flow, no links:
 * everything is free during beta.
 */
export function BusinessPlansCard() {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const styles = useMemo(() => createStyles(colors, locale), [colors, locale]);
  const plans = [
    { name: t('planFreeName'), price: t('planFreePrice'), blurb: t('planFreeBlurb') },
    { name: t('planStarterName'), price: t('planStarterPrice'), blurb: t('planStarterBlurb') },
    { name: t('planGrowthName'), price: t('planGrowthPrice'), blurb: t('planGrowthBlurb') },
  ];
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('plansTitle')}</Text>
      <Text style={styles.beta}>{t('plansBeta')}</Text>
      {plans.map((p, i) => (
        <View key={p.name} style={[styles.plan, i > 0 && styles.planDivider]}>
          <View style={styles.planHead}>
            <Text style={styles.planName}>{p.name}</Text>
            <Text style={styles.planPrice}>{p.price}</Text>
          </View>
          <Text style={styles.planBlurb}>{p.blurb}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors: ThemeColors, locale: 'en' | 'bn') =>
  StyleSheet.create({
    wrap: {
      padding: space.lg,
      gap: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    title: {
      fontFamily: typography.display,
      fontSize: 18,
      lineHeight: leading(locale, 18, 1.25, 1.5),
      color: colors.text,
    },
    beta: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      lineHeight: leading(locale, 13),
      color: colors.accent,
    },
    plan: { gap: space.xs },
    planDivider: {
      paddingTop: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    planHead: { gap: space.xs },
    planName: {
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      lineHeight: leading(locale, 15),
      color: colors.text,
    },
    planPrice: {
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      lineHeight: leading(locale, 15),
      color: colors.accent,
    },
    planBlurb: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: leading(locale, 13, 1.45, 1.7),
      color: colors.textMuted,
    },
  });
