import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen } from '@/components/ui/Screen';
import { createSessionFromUrl, extractAuthParams } from '@/services/auth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { userErrorMessage } from '@/lib/userError';
import { layout, typography, type ThemeColors } from '@/constants/theme';

/**
 * Deep-link landing after Google OAuth OR email confirmation.
 * openAuthSessionAsync often exchanges the code first — this screen must not
 * surface PKCE "verifier mismatch" when the sibling path already signed us in.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [message, setMessage] = useState('Finishing…');
  const params = useLocalSearchParams<{
    code?: string;
    access_token?: string;
    refresh_token?: string;
    type?: string;
    token_hash?: string;
  }>();
  const urlFromLinking = Linking.useURL();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let active = true;

    (async () => {
      try {
        // Prefer waiting for the WebBrowser path — avoids double exchange races
        for (let i = 0; i < 8; i++) {
          const existing = await supabase.auth.getSession();
          if (existing.data.session) {
            await refreshProfile();
            if (active) router.replace('/(tabs)/home');
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }

        const initial = await Linking.getInitialURL();
        const href =
          urlFromLinking ||
          initial ||
          (params.code
            ? `droq://auth/callback?code=${encodeURIComponent(params.code)}`
            : params.access_token && params.refresh_token
              ? `droq://auth/callback#access_token=${encodeURIComponent(params.access_token)}&refresh_token=${encodeURIComponent(params.refresh_token)}`
              : null);

        if (__DEV__) {
          if (__DEV__) console.log('[DROQ auth/callback] href=', href?.slice(0, 140));
        }

        // Email confirm / magic-link style: token_hash + type
        const tokenHash = params.token_hash;
        const otpType = params.type;
        if (tokenHash && otpType && /^(signup|email|invite|recovery|email_change)$/i.test(otpType)) {
          setMessage('Confirming email…');
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType as 'signup' | 'email' | 'invite' | 'recovery' | 'email_change',
          });
          if (error) throw error;
          await refreshProfile();
          if (active) {
            if (otpType === 'recovery') router.replace('/auth/reset');
            else router.replace('/(tabs)/home');
          }
          return;
        }

        if (!href || href.includes('localhost:3000')) {
          throw new Error('Couldn’t finish. Open the link from this phone’s email app.');
        }

        // Recovery links should land on set-password, not home
        if (/type=recovery/i.test(href) || href.includes('auth/reset')) {
          if (active) router.replace('/auth/reset');
          return;
        }

        const extracted = extractAuthParams(href);
        if (!extracted.code && !extracted.access_token) {
          throw new Error('Couldn’t finish. Open the link from this phone’s email app.');
        }

        const session = await createSessionFromUrl(href);
        if (!session) {
          const again = await supabase.auth.getSession();
          if (!again.data.session) {
            throw new Error('Couldn’t finish. Please try again.');
          }
        }

        await refreshProfile();
        if (active) router.replace('/(tabs)/home');
      } catch (e) {
        const again = await supabase.auth.getSession();
        if (again.data.session) {
          await refreshProfile();
          if (active) router.replace('/(tabs)/home');
          return;
        }
        if (!active) return;
        setMessage(userErrorMessage(e, 'Sign-in failed. Please try again.'));
        setTimeout(() => {
          if (active) router.replace('/(auth)/login');
        }, 2500);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <Screen>
      <View style={styles.wrap}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      paddingHorizontal: layout.gutter,
    },
    text: {
      fontFamily: typography.body,
      fontSize: 15,
      color: palette.textMuted,
      textAlign: 'center',
    },
  });
}
