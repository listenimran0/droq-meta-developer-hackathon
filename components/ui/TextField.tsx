import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  /** Shorter field for toolbar / search rows */
  dense?: boolean;
};

export function TextField({ label, error, dense, style, onFocus, onBlur, ...rest }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          gap: dense ? 4 : 8,
        },
        label: {
          fontFamily: typography.bodyMedium,
          fontSize: 11,
          letterSpacing: 1.8,
          textTransform: 'uppercase',
          color: colors.textMuted,
        },
        input: {
          minHeight: dense ? 40 : 52,
          borderBottomWidth: 1.5,
          borderBottomColor: colors.border,
          color: colors.text,
          fontFamily: typography.body,
          fontSize: dense ? 15 : 17,
          paddingVertical: dense ? 8 : 12,
        },
        inputFocused: {
          borderBottomColor: colors.accentLine,
        },
        error: {
          fontFamily: typography.body,
          fontSize: 13,
          color: colors.danger,
        },
      }),
    [colors, dense],
  );

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textDim}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, focused && styles.inputFocused, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
