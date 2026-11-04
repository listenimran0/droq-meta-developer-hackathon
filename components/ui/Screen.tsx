import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { AmbientBackground } from '@/components/ui/AmbientBackground';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  children: React.ReactNode;
  /** Tab screens should use top-only to avoid double padding with tab bar */
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  ambient?: 'default' | 'hero' | 'auth' | 'none';
};

/**
 * Consistent safe-area shell for DROQ screens.
 * - Full screens: edges=['top','bottom'] (default)
 * - Tab roots: edges=['top']
 * Ambient motion pauses when the screen is not focused.
 */
export function Screen({
  children,
  edges = ['top', 'bottom'],
  style,
  contentStyle,
  ambient = 'default',
}: Props) {
  const { colors } = useTheme();
  const focused = useIsFocused();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: {
          flex: 1,
          backgroundColor: colors.bg,
        },
        content: {
          flex: 1,
          zIndex: 1,
        },
      }),
    [colors],
  );

  return (
    <SafeAreaView edges={edges} style={[styles.safe, style]}>
      {ambient !== 'none' ? (
        <AmbientBackground variant={ambient} paused={!focused} />
      ) : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}
