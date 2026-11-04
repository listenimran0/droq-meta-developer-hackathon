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
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { SoftLink } from '@/components/ui/SoftLink';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { getSession, resetPasswordForEmail, signIn, signInWithGoogle } from '@/services/auth';
import { userErrorMessage } from '@/lib/userError';
import { layout, typography, type ThemeColors } from '@/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { configured, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const onForgot = () => {
    const target = email.trim();
    if (!target.includes('@')) {
      Alert.alert('Reset password', 'Enter your email above, then tap Forgot password.');
      return;
    }
    if (!configured) {
      Alert.alert('Can’t reset', 'Something’s temporarily unavailable. Please try again later.');
      return;
    }
    Alert.alert('Reset password?', `We’ll email a link to ${target}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send link',
        onPress: async () => {
          setResetLoading(true);
          try {
            await resetPasswordForEmail(target);
            Alert.alert(
              'Check your email',
              'Open the link on this phone to choose a new password.',
            );
          } catch (e) {
            Alert.alert('Couldn’t send', userErrorMessage(e));
          } finally {
            setResetLoading(false);
          }
        },
      },
    ]);
  };

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Sign in', 'Enter your email and password.');
      return;
    }
    if (!configured) {
      Alert.alert('Can’t sign in', 'Something’s temporarily unavailable. Please try again later.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      await refreshProfile();
      router.replace('/(tabs)/home');
    } catch (e) {
      Alert.alert('Couldn’t sign in', userErrorMessage(e));
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
            <BrandMark size="lg" />
            <Text style={styles.sub}>{t('signInSub')}</Text>
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
              placeholder="••••••••"
            />
            <Button
              label={t('enter')}
              variant="ghost"
              onPress={onSubmit}
              loading={loading}
              disabled={googleLoading || resetLoading}
            />
            <SoftLink
              muted
              label={resetLoading ? 'Sending…' : t('forgotPassword')}
              onPress={onForgot}
              disabled={resetLoading}
              style={styles.forgotLink}
            />
          </FadeIn>

          <FadeIn delay={160}>
            <SoftLink
              label={t('createAccount')}
              onPress={() => router.push('/(auth)/signup')}
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
      paddingVertical: 32,
      justifyContent: 'center',
      gap: 40,
    },
    header: { gap: 14 },
    sub: {
      fontFamily: typography.body,
      fontSize: 15,
      lineHeight: 24,
      color: palette.textMuted,
      maxWidth: 280,
      letterSpacing: 0.1,
    },
    form: { gap: 16 },
    orRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginVertical: 4,
    },
    orLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: palette.border,
    },
    or: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      color: palette.textDim,
      letterSpacing: 2.4,
      textTransform: 'uppercase',
    },
    link: { alignSelf: 'center' },
    forgotLink: { alignSelf: 'center' },
  });
}
