import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { BrandMark } from '@/components/ui/BrandMark';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useTheme } from '@/hooks/useTheme';
import { typography, type ThemeColors } from '@/constants/theme';

export default function SplashIndex() {
  const { session, loading: authLoading, configured } = useAuth();
  const { complete, loading: onboardingLoading } = useOnboarding();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (authLoading || onboardingLoading) return;
    SplashScreen.hideAsync().catch(() => undefined);
  }, [authLoading, onboardingLoading]);

  if (authLoading || onboardingLoading) {
    return (
      <View style={styles.wrap}>
        <BrandMark size="lg" />
        <Text style={styles.tag}>Something is waiting.</Text>
      </View>
    );
  }

  if (!complete) {
    return <Redirect href="/onboarding" />;
  }

  if (!configured) {
    // Allow exploring UI shell; auth screens explain missing config
    return <Redirect href="/(auth)/login" />;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href="/(tabs)/home" />;
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      backgroundColor: palette.bg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    tag: {
      fontFamily: typography.body,
      fontSize: 15,
      color: palette.textMuted,
    },
  });
}
