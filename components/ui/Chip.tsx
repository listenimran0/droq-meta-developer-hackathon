import React, { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radii, typography } from '@/constants/theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Compact for dense grids */
  dense?: boolean;
};

/** Selectable brand chip — type / visibility / radius grids. */
export function Chip({
  label,
  selected,
  onPress,
  disabled,
  style,
  dense,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        base: {
          borderRadius: radii.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.borderStrong,
          backgroundColor: colors.bgElevated,
          paddingVertical: dense ? 10 : 14,
          paddingHorizontal: dense ? 12 : 14,
          minHeight: dense ? 44 : 50,
          justifyContent: 'center',
        },
        selected: {
          borderColor: colors.accent,
          backgroundColor: colors.accent,
          borderWidth: StyleSheet.hairlineWidth,
        },
        disabled: { opacity: 0.38 },
        label: {
          fontFamily: typography.bodyMedium,
          fontSize: dense ? 12 : 13,
          letterSpacing: 0.4,
          color: colors.textMuted,
        },
        labelSelected: {
          color: colors.ink,
        },
      }),
    [colors, dense],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}
