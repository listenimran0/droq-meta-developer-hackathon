import React, { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';

type Props = ViewProps & {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /** Optional left control (rare) */
  leading?: ReactNode;
  /** Prefer Close here — same row as title, list stays left-aligned */
  trailing?: ReactNode;
  /**
   * `bar` — tight list/settings chrome (default).
   * `display` — larger title for create / step flows.
   */
  size?: 'bar' | 'display';
};

/**
 * Screen title chrome. Prefer `size="bar"` + `trailing={<CloseButton compact />}`
 * so Close shares the title row and content starts higher.
 */
export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  leading,
  trailing,
  size = 'bar',
  style,
  ...rest
}: Props) {
  const { colors } = useTheme();
  const display = size === 'display';
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          gap: display ? 8 : 4,
        },
        top: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: display ? undefined : 40,
        },
        leading: {
          flexShrink: 0,
        },
        titleBlock: {
          flex: 1,
          gap: display ? 6 : 2,
          minWidth: 0,
        },
        rule: {
          width: 18,
          height: StyleSheet.hairlineWidth * 2,
          backgroundColor: colors.accent,
          borderRadius: 1,
          marginBottom: 2,
        },
        eyebrow: {
          fontFamily: typography.bodyMedium,
          fontSize: 10,
          letterSpacing: 2.4,
          textTransform: 'uppercase',
          color: colors.accent,
        },
        title: {
          fontFamily: typography.brand,
          fontSize: display ? 30 : 24,
          color: colors.text,
          letterSpacing: display ? -1 : -0.7,
          lineHeight: display ? 34 : 28,
        },
        subtitle: {
          fontFamily: typography.body,
          fontSize: display ? 15 : 13,
          lineHeight: display ? 22 : 18,
          color: colors.textMuted,
          maxWidth: display ? 300 : undefined,
        },
        trailing: {
          flexShrink: 0,
        },
      }),
    [colors, display],
  );

  return (
    <View style={[styles.wrap, style]} {...rest}>
      <View style={styles.top}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={styles.titleBlock}>
          {display ? <View style={styles.rule} /> : null}
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title} numberOfLines={display ? 3 : 1}>
            {title}
          </Text>
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={display ? 4 : 2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
