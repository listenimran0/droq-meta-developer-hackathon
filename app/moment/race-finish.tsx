import React, { useEffect, useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useInterstitialBreak } from '@/hooks/useInterstitialAd';
import { useTheme } from '@/hooks/useTheme';
import { createSquadHunt } from '@/services/squad';
import { userErrorMessage } from '@/lib/userError';
import { layout, typography, type ThemeColors } from '@/constants/theme';

export default function RaceFinishScreen() {
  const router = useRouter();
  const { dropId, youWon, winnerName } = useLocalSearchParams<{
    dropId?: string;
    youWon?: string;
    winnerName?: string;
  }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const won = youWon === '1';
  // Natural break after the finish line — capped elsewhere, so rare races stay clean.
  useInterstitialBreak();

  useEffect(() => {
    Haptics.notificationAsync(
      won
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => undefined);
  }, [won]);

  const raceAgain = async () => {
    if (!dropId) return;
    try {
      const huntId = await createSquadHunt(dropId);
      router.replace({
        pathname: '/squad/[id]',
        params: { id: huntId, dropId },
      });
    } catch (e) {
      Alert.alert('Race', userErrorMessage(e, 'Couldn’t start race.'));
    }
  };

  return (
    <Screen ambient="hero">
      <View style={styles.wrap}>
        <Text style={styles.eyebrow}>{won ? 'FINISH LINE' : 'RACE OVER'}</Text>
        <Text style={styles.title}>
          {won ? 'You got there first.' : `${winnerName || 'Someone'} got there first.`}
        </Text>
        <Text style={styles.body}>
          No endless scoreboard — just who showed up sooner. Race the same Drop again, or
          walk somewhere new.
        </Text>
        <Button label="Race again" onPress={raceAgain} />
        {dropId ? (
          <Button
            label="Open the Drop"
            variant="ghost"
            onPress={() => router.replace(`/drop/${dropId}`)}
          />
        ) : (
          <Button
            label="Discover"
            variant="ghost"
            onPress={() => router.replace('/discover')}
          />
        )}
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
      fontSize: 34,
      letterSpacing: -1,
      lineHeight: 38,
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
