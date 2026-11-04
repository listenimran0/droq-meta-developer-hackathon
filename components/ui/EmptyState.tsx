import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';
import { Button } from '@/components/ui/Button';

type Props = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  mark?: string;
};

export function EmptyState({ title, message, actionLabel, onAction, mark = '◇' }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          alignItems: 'center',
          gap: 12,
          paddingVertical: 40,
          paddingHorizontal: 20,
        },
        mark: {
          fontFamily: typography.brand,
          fontSize: 22,
          color: colors.accent,
          marginBottom: 4,
          letterSpacing: 2,
        },
        title: {
          fontFamily: typography.display,
          fontSize: 24,
          letterSpacing: -0.4,
          color: colors.text,
          textAlign: 'center',
        },
        message: {
          fontFamily: typography.body,
          fontSize: 15,
          lineHeight: 23,
          color: colors.textMuted,
          textAlign: 'center',
          maxWidth: 300,
        },
        btn: {
          marginTop: 16,
          alignSelf: 'stretch',
        },
      }),
    [colors],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.mark}>{mark}</Text>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.btn} />
      ) : null}
    </View>
  );
}
