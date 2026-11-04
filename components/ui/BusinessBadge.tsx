import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { radii, typography } from '@/constants/theme';

type Props = { name?: string | null; show?: boolean; category?: string | null };

const CAT_KEY = {
  cafe: 'catCafe', food: 'catFood', books: 'catBooks', shop: 'catShop', art: 'catArt', other: 'catOther',
} as const;

/** "Business · {name}" pill for Business drops. Renders nothing otherwise. */
export function BusinessBadge({ name, show, category }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const label = name?.trim();
  if (!show || !label) return null;
  const cat = category && category in CAT_KEY ? t(CAT_KEY[category as keyof typeof CAT_KEY]) : null;
  return (
    <View
      style={[styles.pill, { backgroundColor: colors.accentSoft, borderColor: colors.accentLine }]}
      accessibilityLabel={`${t('businessWord')} · ${label}${cat ? ` · ${cat}` : ''}`}
    >
      <Text style={[styles.text, { color: colors.accent }]} numberOfLines={1}>
        {t('businessWord')} · {label}{cat ? ` · ${cat}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
    maxWidth: '100%',
  },
  text: { fontFamily: typography.bodyMedium, fontSize: 12, letterSpacing: 0.4 },
});
