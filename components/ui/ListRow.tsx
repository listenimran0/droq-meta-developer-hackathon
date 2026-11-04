import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';

type Props = {
  title: string;
  meta?: string;
  index?: number | string;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
  showChevron?: boolean;
};

/** Brand list row — Found / Left / Friends / Notifications / Leaders. */
export const ListRow = memo(function ListRow({
  title,
  meta,
  index,
  onPress,
  onLongPress,
  disabled,
  trailing,
  leading,
  showChevron = true,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingVertical: 14,
          paddingLeft: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          borderLeftWidth: 2,
          borderLeftColor: 'transparent',
        },
        rowPressed: {
          opacity: 0.85,
          borderLeftColor: colors.accent,
          backgroundColor: colors.accentSoft,
        },
        index: {
          fontFamily: typography.bodyMedium,
          fontSize: 11,
          letterSpacing: 1,
          color: colors.accent,
          width: 28,
        },
        text: { flex: 1, gap: 4 },
        title: {
          fontFamily: typography.bodyMedium,
          fontSize: 16,
          color: colors.text,
        },
        meta: {
          fontFamily: typography.body,
          fontSize: 12,
          color: colors.textMuted,
        },
        chevron: {
          fontFamily: typography.display,
          fontSize: 22,
          color: colors.accent,
          lineHeight: 24,
        },
      }),
    [colors],
  );

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        (pressed || disabled) && styles.rowPressed,
      ]}
    >
      {index != null ? (
        <Text style={styles.index}>
          {typeof index === 'number' ? String(index).padStart(2, '0') : index}
        </Text>
      ) : null}
      {leading}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing}
      {showChevron && !trailing ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
});
