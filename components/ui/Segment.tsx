import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radii, typography } from '@/constants/theme';

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** Horizontal segment control — theme / language / similar. */
export function Segment<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          gap: 8,
          flexWrap: 'wrap',
        },
        cell: {
          flexGrow: 1,
          flexBasis: 0,
          minWidth: 88,
          minHeight: 44,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.bgElevated,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 12,
        },
        cellOn: {
          borderColor: colors.accentLine,
          backgroundColor: colors.accentSoft,
        },
        label: {
          fontFamily: typography.bodyMedium,
          fontSize: 12,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: colors.textMuted,
        },
        labelOn: {
          color: colors.accentBright,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.cell,
              on && styles.cellOn,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
