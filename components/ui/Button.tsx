import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { radii, typography } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  label: string;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Fire light haptic on successful primary press */
  haptic?: boolean;
};

export function Button({
  label,
  variant = 'primary',
  loading,
  disabled,
  style,
  haptic = true,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        base: {
          minHeight: 52,
          borderRadius: radii.md,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 22,
        },
        primary: {
          backgroundColor: colors.accent,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.accentBright,
        },
        ghost: {
          backgroundColor: 'transparent',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.borderStrong,
        },
        danger: {
          backgroundColor: 'transparent',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.danger,
        },
        disabled: {
          opacity: 0.38,
        },
        label: {
          fontFamily: typography.bodyMedium,
          fontSize: 12,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: colors.ink,
        },
        labelGhost: {
          color: colors.text,
          letterSpacing: 1.4,
        },
        labelDanger: {
          color: colors.danger,
        },
      }),
    [colors],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const spinnerColor =
    variant === 'primary' ? colors.ink : variant === 'danger' ? colors.danger : colors.accent;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPressIn={(e) => {
        scale.value = withSpring(0.985, { damping: 22, stiffness: 420 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 18, stiffness: 320 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic && variant === 'primary' && !isDisabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        }
        onPress?.(e);
      }}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        isDisabled && styles.disabled,
        animatedStyle,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'ghost' && styles.labelGhost,
            variant === 'danger' && styles.labelDanger,
          ]}
        >
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}
