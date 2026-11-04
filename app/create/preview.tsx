import React, { useMemo, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { SoftLink } from '@/components/ui/SoftLink';
import { Screen } from '@/components/ui/Screen';
import { useTheme } from '@/hooks/useTheme';
import { huntShareUrl } from '@/constants/config';
import { createSquadHunt } from '@/services/squad';
import { userErrorMessage } from '@/lib/userError';
import { layout, typography, type ThemeColors } from '@/constants/theme';

export default function DropPreviewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [raceBusy, setRaceBusy] = useState(false);

  const onShare = async () => {
    if (!id) return;
    try {
      await Share.share({
        message: `I left something in the real world. Walk to find it.\n${huntShareUrl(id)}`,
      });
    } catch {
      // cancelled
    }
  };

  const onRace = async () => {
    if (!id) return;
    setRaceBusy(true);
    try {
      const huntId = await createSquadHunt(id);
      router.replace({
        pathname: '/squad/[id]',
        params: { id: huntId, dropId: id },
      });
    } catch (e) {
      Alert.alert('Race', userErrorMessage(e, 'Couldn’t start race.'));
    } finally {
      setRaceBusy(false);
    }
  };

  return (
    <Screen ambient="hero">
      <View style={styles.wrap}>
        <Text style={styles.eyebrow}>PLANTED</Text>
        <Text style={styles.title}>Your Drop is waiting outside.</Text>
        <Text style={styles.body}>
          Someone will find it by walking — not by scrolling. Invite a race or share the hunt
          while you’re still on the street.
        </Text>
        {id ? (
          <>
            <Button label="Invite a race" onPress={onRace} loading={raceBusy} />
            <Button label="Share hunt" variant="ghost" onPress={onShare} disabled={raceBusy} />
            <SoftLink
              muted
              label="View what I left"
              onPress={() => router.replace(`/drop/${id}`)}
              style={styles.link}
            />
          </>
        ) : null}
        <SoftLink
          muted
          label="Done"
          onPress={() => router.replace('/(tabs)/home')}
          style={styles.link}
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
    link: { alignSelf: 'center' },
  });
}
