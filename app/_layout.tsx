import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Syne_600SemiBold, Syne_700Bold } from '@expo-google-fonts/syne';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppBootstrap } from '@/components/AppBootstrap';
import { AuthProvider } from '@/hooks/useAuth';
import { I18nProvider } from '@/hooks/useI18n';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { ToastProvider } from '@/components/ui/Toast';
import { darkColors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 500, fade: true });

function ThemedChrome() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="auth/reset" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="discover" options={{ animation: 'fade' }} />
        <Stack.Screen name="hunt/[id]" />
        <Stack.Screen name="drop/found" />
        <Stack.Screen name="drop/[id]" />
        <Stack.Screen name="moment/after" options={{ animation: 'fade' }} />
        <Stack.Screen name="moment/challenge-done" options={{ animation: 'fade' }} />
        <Stack.Screen name="moment/race-finish" options={{ animation: 'fade' }} />
        <Stack.Screen name="create/index" />
        <Stack.Screen name="create/preview" />
        <Stack.Screen name="create/chain" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="left" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="leaders" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="moderation" />
        <Stack.Screen name="report" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="squad/[id]" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Syne_600SemiBold,
    Syne_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={darkColors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <AppBootstrap>
                <ToastProvider>
                  <ThemedChrome />
                </ToastProvider>
              </AppBootstrap>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  boot: {
    flex: 1,
    backgroundColor: darkColors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
