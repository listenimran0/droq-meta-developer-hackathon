import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';

type Props = {
  /** Override label — default Close */
  label?: string;
  /** Custom dismiss; default router.back() with home fallback */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Tighter hit area when paired with ScreenHeader bar */
  compact?: boolean;
};

/**
 * Reliable one-tap dismiss control.
 * Large hit target + immediate press (no SoftLink delay/tiny area).
 */
export function CloseButton({ label = 'Close', onPress, style, compact }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        hit: {
          alignSelf: 'flex-start',
          minHeight: compact ? 36 : 44,
          minWidth: compact ? 56 : 72,
          paddingVertical: compact ? 6 : 10,
          paddingHorizontal: 4,
          justifyContent: 'center',
        },
        label: {
          fontFamily: typography.bodyMedium,
          fontSize: compact ? 12 : 13,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: colors.textMuted,
        },
        pressed: {
          opacity: 0.55,
        },
      }),
    [colors, compact],
  );

  const dismiss = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/home');
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={dismiss}
      hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed, style]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}
