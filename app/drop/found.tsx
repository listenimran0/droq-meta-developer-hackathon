import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import {
  getSimulationMode,
  resolveDevCoordinates,
  setSimulationMode,
  setSimulationTarget,
} from '@/lib/devSimulation';
import { useUserLocation } from '@/hooks/useUserLocation';
import { unlockDrop } from '@/services/drops';
import { getReliableCoordinatesForUnlock } from '@/services/location';
import { userErrorMessage } from '@/lib/userError';
import type { DropType } from '@/types/drop';
import { calculateDistance, canUnlockAtDistance } from '@/utils/location';
import { layout, typography, type ThemeColors } from '@/constants/theme';

export default function DropFoundScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id, type, lat, lng, radius, huntId } = useLocalSearchParams<{
    id: string;
    type?: DropType;
    lat?: string;
    lng?: string;
    radius?: string;
    huntId?: string;
  }>();

  const dropLat = lat ? Number(lat) : undefined;
  const dropLng = lng ? Number(lng) : undefined;
  const unlockRadius = radius ? Number(radius) : 40;
  const targetDrop =
    Number.isFinite(dropLat) && Number.isFinite(dropLng)
      ? { latitude: dropLat!, longitude: dropLng! }
      : null;

  const { coords, refresh } = useUserLocation({
    enabled: true,
    targetDrop,
  });
  const [loading, setLoading] = useState(false);
  const [puzzleAttempt, setPuzzleAttempt] = useState('');
  const needsPuzzle = type === 'puzzle';

  const onUnlock = async () => {
    if (!id) return;
    if (needsPuzzle && !puzzleAttempt.trim()) {
      Alert.alert('Puzzle', 'Enter the answer to unlock this Drop.');
      return;
    }
    setLoading(true);
    try {
      // Dev sim: stand exactly on the Drop. Never mix with emulator GPS.
      if (targetDrop && __DEV__ && getSimulationMode() !== 'off') {
        setSimulationTarget(targetDrop);
        setSimulationMode('found');
      }

      const sim = resolveDevCoordinates(dropLat, dropLng);
      let position: {
        latitude: number;
        longitude: number;
        accuracy?: number | null;
      } | null = sim;

      if (!position) {
        position = await getReliableCoordinatesForUnlock(
          undefined,
          3,
          coords,
        ).catch(async () => {
          let fallback = coords;
          if (!fallback) fallback = await refresh();
          if (!fallback) {
            throw new Error('Location isn’t available. Please check your permission.');
          }
          return fallback;
        });
      }

      if (!position) {
        throw new Error('Location isn’t available. Please check your permission.');
      }

      if (
        Number.isFinite(dropLat) &&
        Number.isFinite(dropLng) &&
        Number.isFinite(unlockRadius)
      ) {
        const dist = calculateDistance(
          position.latitude,
          position.longitude,
          dropLat!,
          dropLng!,
        );
        if (!canUnlockAtDistance(dist, unlockRadius, position.accuracy)) {
          throw new Error('You’re not close enough yet. Walk closer and try again.');
        }
      }

      await unlockDrop(
        id,
        position.latitude,
        position.longitude,
        position.accuracy ?? null,
        needsPuzzle ? puzzleAttempt.trim() : null,
      );
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (huntId) {
        router.replace({
          pathname: '/moment/race-finish',
          params: {
            dropId: id,
            youWon: '1',
            winnerName: 'You',
          },
        });
        return;
      }
      router.replace({
        pathname: '/moment/after',
        params: { id, type: type ?? undefined },
      });
    } catch (e) {
      Alert.alert('Couldn’t unlock', userErrorMessage(e, 'Move closer and try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen ambient="none">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.wrap}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces
          alwaysBounceVertical
        >
          <Text style={styles.eyebrow}>{t('youFoundADrop')}</Text>
          <Text style={styles.title}>{t('foundTitle')}</Text>

          {needsPuzzle ? (
            <TextField
              label={t('puzzleAnswer')}
              value={puzzleAttempt}
              onChangeText={setPuzzleAttempt}
              placeholder={t('puzzlePlaceholder')}
              autoCapitalize="none"
            />
          ) : null}

          <Button label={t('unlock')} onPress={onUnlock} loading={loading} />
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
      gap: 28,
    },
    eyebrow: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 3,
      color: palette.accent,
    },
    title: {
      fontFamily: typography.display,
      fontSize: 28,
      lineHeight: 36,
      color: palette.text,
    },
  });
}
