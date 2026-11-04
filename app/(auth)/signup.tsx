import React, { useMemo, useState } from 'react';
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
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { SoftLink } from '@/components/ui/SoftLink';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import {
  getSession,
  resendSignupConfirmation,
  signInWithGoogle,
  signUp,
  signupNeedsEmailConfirmation,
} from '@/services/auth';
import { userErrorMessage } from '@/lib/userError';
import { layout, typography, type ThemeColors } from '@/constants/theme';

export default function SignupScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { configured, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const onSubmit = async () => {
    if (!configured) {
      Alert.alert('Can’t sign up', 'Something’s temporarily unavailable. Please try again later.');
      return;
    }
    if (!email.trim().includes('@')) {
      Alert.alert('Email', 'Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password', 'Use at least 6 characters.');
      return;
    }
    if (username.trim().length < 3) {
      Alert.alert('Username', 'Choose a username with at least 3 characters.');
      return;
    }
    setLoading(true);
    try {
      const data = await signUp(email, password, username);
      if (signupNeedsEmailConfirmation(data)) {
        Alert.alert(
          'Check your email',
          `We sent a confirmation link to ${email.trim().toLowerCase()}. Open it on this phone to finish signing up.`,
          [
            { text: 'OK', onPress: () => router.replace('/(auth)/login') },
            {
              text: 'Resend',
              onPress: async () => {
                setResendLoading(true);
                try {
                  await resendSignupConfirmation(email);
                  Alert.alert('Sent again', 'Check your inbox (and spam).');
                } catch (err) {
                  Alert.alert('Couldn’t resend', userErrorMessage(err));
                } finally {
                  setResendLoading(false);
                }
              },
            },
          ],
        );
        return;
      }
      await refreshProfile();
      router.replace('/(tabs)/home');
    } catch (e) {
      Alert.alert('Couldn’t create account', userErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    if (!configured) {
      Alert.alert('Can’t sign in', 'Something’s temporarily unavailable. Please try again later.');
      return;
    }
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      await refreshProfile();
      router.replace('/(tabs)/home');
    } catch (e) {
      const message = userErrorMessage(e);
      const raw = e instanceof Error ? e.message : '';
      await refreshProfile();
      const session = await getSession().catch(() => null);
      if (session) {
        router.replace('/(tabs)/home');
        return;
      }
      if (!/cancelled/i.test(raw)) {
        Alert.alert('Google sign-in failed', message);
      }
    } finally {
      setGoogleLoading(false);
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
          <FadeIn style={styles.header}>
            <Text style={styles.brand}>{t('joinDroq')}</Text>
            <Text style={styles.sub}>No followers. No feed. Just what’s waiting out there.</Text>
          </FadeIn>

          <FadeIn delay={90} style={styles.form}>
            <Button
              label={t('continueGoogle')}
              onPress={onGoogle}
              loading={googleLoading}
              disabled={loading}
            />
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.or}>{t('email')}</Text>
              <View style={styles.orLine} />
            </View>
            <TextField
              label={t('username')}
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
              placeholder="wanderer"
            />
            <TextField
              label={t('email')}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
            />
            <TextField
              label={t('password')}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
            />
            <Button
              label={t('createAccount')}
              variant="ghost"
              onPress={onSubmit}
              loading={loading || resendLoading}
              disabled={googleLoading}
            />
          </FadeIn>

          <FadeIn delay={160}>
            <SoftLink
              label="Already have an account"
              onPress={() => router.push('/(auth)/login')}
              style={styles.link}
            />
          </FadeIn>
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
      gap: 36,
    },
    header: { gap: 12 },
    brand: {
      fontFamily: typography.brand,
      fontSize: 36,
      letterSpacing: 2,
      color: palette.text,
    },
    sub: {
      fontFamily: typography.body,
      fontSize: 15,
      lineHeight: 23,
      color: palette.textMuted,
      maxWidth: 280,
    },
    form: { gap: 18 },
    orRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    orLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: palette.borderStrong,
    },
    or: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      color: palette.textDim,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    link: { alignSelf: 'center' },
  });
}
