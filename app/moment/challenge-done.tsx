import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useInterstitialBreak } from '@/hooks/useInterstitialAd';
import { useTheme } from '@/hooks/useTheme';
import { markChallengeCelebrated } from '@/services/moments';
import { layout, typography, type ThemeColors } from '@/constants/theme';

export default function ChallengeDoneScreen() {
  const router = useRouter();
  const { id, title, found, goal } = useLocalSearchParams<{
    id?: string;
    title?: string;
    found?: string;
    goal?: string;
  }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Natural break: the win has landed, next step hasn't started yet.
  useInterstitialBreak();

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (id) markChallengeCelebrated(id).catch(() => undefined);
  }, [id]);

  return (
    <Screen ambient="hero">
      <View style={styles.wrap}>
        <Text style={styles.eyebrow}>PLACE STAMPED</Text>
        <Text style={styles.title}>{title || 'Challenge complete'}</Text>
        <Text style={styles.body}>
          {found && goal
            ? `You found ${found} of ${goal} here. The street remembers walkers — not scrollers.`
            : 'You finished this place. Keep walking — another zone may be waiting.'}
        </Text>
        <Button label="Keep exploring" onPress={() => router.replace('/discover')} />
        <Button
          label="Home"
          variant="ghost"
          onPress={() => router.replace('/(tabs)/home')}
        />
      </View>
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      paddingHorizontal: layout.gutter,
      justifyContent: 'center',
      gap: 14,
    },
    eyebrow: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 3,
      color: palette.accent,
    },
    title: {
      fontFamily: typography.brand,
      fontSize: 36,
      letterSpacing: -1.2,
      lineHeight: 40,
      color: palette.text,
    },
    body: {
      fontFamily: typography.body,
      fontSize: 15,
      lineHeight: 23,
      color: palette.textMuted,
      marginBottom: 10,
      maxWidth: 320,
    },
  });
}
