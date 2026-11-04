import React, { useEffect, useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';

type Props = {
  steps?: string[];
};

const DEFAULT_STEPS = [
  'Plant a Drop at a real place',
  'Walk toward the mystery — no map pin',
  'Stuck? Ask the AI for up to 3 hints',
  'Open it only when you show up',
];

const COLLAPSE_KEY = 'droq_how_it_works_collapsed';

/** Tiny loop explainer — collapsed by default so home stays compact. */
export function HowItWorks({ steps = DEFAULT_STEPS }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          gap: 10,
          paddingVertical: 4,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingVertical: 4,
        },
        label: {
          fontFamily: typography.bodyMedium,
          fontSize: 10,
          letterSpacing: 2.4,
          color: colors.accent,
        },
        chevron: {
          fontFamily: typography.bodyMedium,
          fontSize: 11,
          letterSpacing: 1,
          color: colors.textDim,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
        },
        num: {
          fontFamily: typography.bodyMedium,
          fontSize: 11,
          letterSpacing: 1,
          color: colors.textDim,
          width: 24,
          marginTop: 1,
        },
        step: {
          flex: 1,
          fontFamily: typography.body,
          fontSize: 14,
          lineHeight: 20,
          color: colors.textMuted,
        },
      }),
    [colors],
  );

  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(COLLAPSE_KEY).then((v) => {
      // Default collapsed; only expand if user previously opened it
      if (v === '0') setCollapsed(false);
    });
  }, []);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !collapsed;
    setCollapsed(next);
    AsyncStorage.setItem(COLLAPSE_KEY, next ? '1' : '0').catch(() => undefined);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
      >
        <Text style={styles.label}>HOW DROQ WORKS</Text>
        <Text style={styles.chevron}>{collapsed ? 'Show' : 'Hide'}</Text>
      </Pressable>
      {!collapsed
        ? steps.map((step, i) => (
            <View key={step} style={styles.row}>
              <Text style={styles.num}>{String(i + 1).padStart(2, '0')}</Text>
              <Text style={styles.step}>{step}</Text>
            </View>
          ))
        : null}
    </View>
  );
}
