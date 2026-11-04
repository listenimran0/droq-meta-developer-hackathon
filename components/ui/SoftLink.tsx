import React, { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Tertiary text CTA — quiet, precise, never shouty. */
export function SoftLink({ label, onPress, disabled, muted, style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          paddingVertical: 8,
          alignSelf: 'flex-start',
        },
        label: {
          fontFamily: typography.bodyMedium,
          fontSize: 13,
          letterSpacing: 0.2,
          color: muted ? colors.textDim : colors.accentBright,
        },
        disabled: { opacity: 0.38 },
      }),
    [colors, muted],
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => [
        styles.wrap,
        disabled && styles.disabled,
        pressed && { opacity: 0.55 },
        style,
      ]}
      accessibilityRole="button"
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}
