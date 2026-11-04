import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { BrandMark } from '@/components/ui/BrandMark';
import { TextField } from '@/components/ui/TextField';
import { createSessionFromUrl, extractAuthParams, updatePassword } from '@/services/auth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { userErrorMessage } from '@/lib/userError';
import { layout, typography, type ThemeColors } from '@/constants/theme';

export default function AuthResetScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Opening reset link…');
  const ran = useRef(false);
  const urlFromLinking = Linking.useURL();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let active = true;

    (async () => {
      try {
        const initial = await Linking.getInitialURL();
        const href = urlFromLinking || initial;
        if (href) {
          const extracted = extractAuthParams(href);
          if (extracted.code || extracted.access_token) {
            await createSessionFromUrl(href);
          }
        }
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          if (active) {
            setMessage('This reset link expired. Request a new one from sign in.');
            setTimeout(() => router.replace('/(auth)/login'), 2500);
          }
          return;
        }
        if (active) {
          setReady(true);
          setMessage('Choose a new password.');
        }
      } catch (e) {
        if (active) {
          setMessage(userErrorMessage(e, 'Couldn’t open reset link.'));
          setTimeout(() => router.replace('/(auth)/login'), 2500);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const onSave = async () => {
    if (password.length < 6) {
      Alert.alert('Password', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Password', 'Passwords don’t match.');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      await refreshProfile();
      Alert.alert('Password updated', 'You’re signed in with your new password.');
      router.replace('/(tabs)/home');
    } catch (e) {
      Alert.alert('Couldn’t update', userErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen ambient="auth">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.wrap}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <BrandMark size="md" />
          <Text style={styles.sub}>{message}</Text>
          {ready ? (
            <View style={styles.form}>
              <TextField
                label="New password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
              />
              <TextField
                label="Confirm"
                secureTextEntry
                value={confirm}
                onChangeText={setConfirm}
                placeholder="••••••••"
              />
              <Button label="Save password" onPress={onSave} loading={loading} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    wrap: {
      flexGrow: 1,
      paddingHorizontal: layout.gutter,
      paddingVertical: 24,
      justifyContent: 'center',
      gap: 24,
    },
    brand: {
      fontFamily: typography.brand,
      fontSize: 36,
      letterSpacing: 8,
      color: palette.text,
    },
    sub: {
      fontFamily: typography.body,
      fontSize: 15,
      lineHeight: 22,
      color: palette.textMuted,
    },
    form: { gap: 16 },
  });
}
