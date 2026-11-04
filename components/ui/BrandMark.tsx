import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';
import { useI18n } from '@/hooks/useI18n';

type Props = {
  /** Wordmark size */
  size?: 'sm' | 'md' | 'lg';
  /** Hide the place+radius mark (text only) */
  textOnly?: boolean;
  style?: StyleProp<ViewStyle>;
};

const SIZES = {
  sm: { word: 22, tracking: 4, mark: 22 },
  md: { word: 28, tracking: 6, mark: 28 },
  lg: { word: 42, tracking: 10, mark: 40 },
} as const;

const MARK_DARK = require('../../assets/droq-brand-mark-transparent.png');
const MARK_LIGHT = require('../../assets/droq-brand-mark-on-light.png');

/** DROQ brand: place+radius mark + wordmark (theme-aware contrast). */
export function BrandMark({ size = 'md', textOnly = false, style }: Props) {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const s = SIZES[size];
  const isLight = scheme === 'light';

  return (
    <View style={[styles.row, style]}>
      {!textOnly ? (
        <Image
          source={isLight ? MARK_LIGHT : MARK_DARK}
          style={{ width: s.mark, height: s.mark, borderRadius: 5 }}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <Text
        style={{
          fontFamily: typography.brand,
          fontSize: s.word,
          letterSpacing: s.tracking,
          color: colors.text,
        }}
      >
        {t('brand')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
