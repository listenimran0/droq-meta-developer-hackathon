import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { HowItWorks } from '@/components/ui/HowItWorks';
import { Screen } from '@/components/ui/Screen';
import { BrandMark } from '@/components/ui/BrandMark';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useTheme } from '@/hooks/useTheme';
import { requestLocationPermission } from '@/services/location';
import { layout, typography, type ThemeColors } from '@/constants/theme';

const STEPS = [
  {
    mark: 'DROQ',
    title: 'The opposite of scrolling',
    body: 'Reels keep you on the couch. DROQ pulls you into the street — notes, photos, and secrets that only open when you stand there.',
  },
  {
    mark: '01',
    title: 'Your feet are the password',
    body: 'Allow location so DROQ can sense what’s nearby. Exact pins stay on your phone. We only listen for Drops around you.',
  },
  {
    mark: '02',
    title: 'Leave. Walk. Unlock.',
    body: 'Plant something for a stranger or a friend. Chase a mystery. Open it IRL. No infinite feed. No followers. Just moments that require showing up.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { finish } = useOnboarding();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [locDenied, setLocDenied] = useState(false);

  const current = STEPS[step]!;

  const next = async () => {
    if (step === 1) {
      setBusy(true);
      try {
        const status = await requestLocationPermission();
        setLocDenied(status !== 'granted');
      } finally {
        setBusy(false);
      }
    }
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    await finish();
    router.replace('/(auth)/login');
  };

  return (
    <Screen ambient="auth">
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.wrap}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.progress}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.tick, i === step && styles.tickActive, i < step && styles.tickDone]}
            />
          ))}
        </View>

        <FadeIn key={step} style={styles.hero}>
          {step === 0 ? (
            <BrandMark size="sm" />
          ) : (
            <Text style={styles.mark}>{current.mark}</Text>
          )}
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>
          {step === 2 ? <HowItWorks /> : null}
          {step === 1 && locDenied ? (
            <Text style={styles.warn}>
              Location was denied. You can still explore — turn it on later in Settings so nearby
              Drops appear.
            </Text>
          ) : null}
        </FadeIn>

        <Button
          label={step === STEPS.length - 1 ? 'Step outside' : 'Continue'}
          onPress={next}
          loading={busy}
        />
      </ScrollView>
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    wrap: {
      flexGrow: 1,
      paddingHorizontal: layout.gutter,
      paddingBottom: 20,
      justifyContent: 'space-between',
      gap: 24,
    },
    progress: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 20,
    },
    tick: {
      flex: 1,
      height: 2,
      backgroundColor: palette.borderStrong,
      borderRadius: 1,
    },
    tickActive: {
      backgroundColor: palette.accent,
    },
    tickDone: {
      backgroundColor: palette.accentLine,
    },
    hero: {
      gap: 18,
      paddingBottom: 24,
    },
    mark: {
      fontFamily: typography.brand,
      fontSize: 18,
      letterSpacing: 6,
      color: palette.accent,
    },
    title: {
      fontFamily: typography.brand,
      fontSize: 38,
      letterSpacing: -1,
      lineHeight: 44,
      color: palette.text,
      maxWidth: 320,
    },
    body: {
      fontFamily: typography.body,
      fontSize: 17,
      lineHeight: 27,
      color: palette.textMuted,
      maxWidth: 320,
    },
    warn: {
      fontFamily: typography.body,
      fontSize: 14,
      lineHeight: 21,
      color: palette.accentBright,
      marginTop: 4,
    },
  });
}
