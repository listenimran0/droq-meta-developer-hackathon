import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radii, typography, type ThemeColors } from '@/constants/theme';

export function ListSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function NavRow({
  title,
  subtitle,
  onPress,
  last,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        last && styles.itemLast,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.itemText}>
        <Text style={styles.itemTitle}>{title}</Text>
        {subtitle ? <Text style={styles.itemSub}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function TextLinkRow({
  items,
}: {
  items: Array<{
    label: string;
    onPress: () => void;
    danger?: boolean;
    disabled?: boolean;
  }>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.linkRow}>
      {items.map((item, i) => (
        <React.Fragment key={`${item.label}-${i}`}>
          {i > 0 ? <Text style={styles.linkSep}>·</Text> : null}
          <Pressable onPress={item.onPress} disabled={item.disabled} hitSlop={8}>
            <Text style={item.danger ? styles.linkDanger : styles.link}>
              {item.label}
            </Text>
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

export function LoadMoreFooter({
  visible,
  loading,
  onPress,
}: {
  visible: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!visible) return null;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.loadMore, pressed && styles.pressed]}
    >
      <Text style={styles.loadMoreText}>{loading ? 'Loading…' : 'Load more'}</Text>
    </Pressable>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    section: { gap: 10, marginBottom: 8 },
    sectionTitle: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 2.2,
      textTransform: 'uppercase',
      color: palette.accent,
    },
    card: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.bgElevated,
      overflow: 'hidden',
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border,
    },
    itemLast: { borderBottomWidth: 0 },
    pressed: { opacity: 0.7 },
    itemText: { flex: 1, gap: 4 },
    itemTitle: {
      fontFamily: typography.bodyMedium,
      fontSize: 16,
      color: palette.text,
    },
    itemSub: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: 18,
      color: palette.textMuted,
    },
    chevron: {
      fontFamily: typography.display,
      fontSize: 22,
      color: palette.accent,
      lineHeight: 24,
    },
    linkRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
    },
    link: {
      fontFamily: typography.bodyMedium,
      fontSize: 14,
      color: palette.accent,
    },
    linkDanger: {
      fontFamily: typography.bodyMedium,
      fontSize: 14,
      color: palette.danger,
    },
    linkSep: {
      fontFamily: typography.body,
      fontSize: 14,
      color: palette.textDim,
    },
    loadMore: {
      alignItems: 'center',
      paddingVertical: 18,
    },
    loadMoreText: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: palette.accent,
    },
  });
}
