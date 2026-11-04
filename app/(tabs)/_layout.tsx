import { memo } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { radii, typography } from '@/constants/theme';

const TabItem = memo(function TabItem({
  glyph,
  label,
  focused,
  onPress,
}: {
  glyph: string;
  label: string;
  focused: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.tab, pressed && { opacity: 0.55 }]}
    >
      <Text
        style={{
          fontFamily: typography.bodyMedium,
          fontSize: 15,
          color: focused ? colors.accentBright : colors.textDim,
          letterSpacing: 0.4,
        }}
      >
        {glyph}
      </Text>
      <Text
        style={{
          fontFamily: typography.bodyMedium,
          fontSize: 9,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: focused ? colors.text : colors.textDim,
          marginTop: 3,
          opacity: focused ? 1 : 0.7,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
});

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  const { t } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
      tabBar={({ state, navigation }) => (
        <View
          style={[
            styles.bar,
            {
              paddingBottom: bottomPad,
              backgroundColor: colors.bg,
              borderTopColor: colors.border,
            },
          ]}
        >
          <View style={styles.row}>
            <TabItem
              glyph="◇"
              label={t('home')}
              focused={state.index === 0}
              onPress={() => {
                const route = state.routes[0];
                if (state.index !== 0) {
                  navigation.navigate(route.name);
                }
              }}
            />
            <TabItem
              glyph="✦"
              label={t('found')}
              focused={state.index === 1}
              onPress={() => {
                const route = state.routes[1];
                if (state.index !== 1) {
                  navigation.navigate(route.name);
                }
              }}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('leaveDrop')}
              onPress={() => router.push('/create')}
              style={({ pressed }) => [
                styles.leaveFab,
                {
                  backgroundColor: colors.accent,
                  borderColor: colors.accentBright,
                },
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={[styles.leaveFabPlus, { color: colors.ink }]}>+</Text>
              <Text style={[styles.leaveFabLabel, { color: colors.ink }]}>{t('leaveTab')}</Text>
            </Pressable>

            <TabItem
              glyph="◎"
              label={t('you')}
              focused={state.index === 2}
              onPress={() => {
                const route = state.routes[2];
                if (state.index !== 2) {
                  navigation.navigate(route.name);
                }
              }}
            />
          </View>
        </View>
      )}
    >
      <Tabs.Screen name="home" options={{ title: t('home') }} />
      <Tabs.Screen name="discoveries" options={{ title: t('found') }} />
      <Tabs.Screen name="profile" options={{ title: t('you') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  leaveFab: {
    minWidth: 68,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginHorizontal: 6,
  },
  leaveFabPlus: {
    fontFamily: typography.brand,
    fontSize: 18,
    lineHeight: 20,
    marginTop: -1,
  },
  leaveFabLabel: {
    fontFamily: typography.bodyMedium,
    fontSize: 8,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: 1,
  },
});
