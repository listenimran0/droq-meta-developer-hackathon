import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';
import { runWhenIdle } from '@/lib/runWhenIdle';
import {
  checkForAppUpdate,
  dismissUpdatePrompt,
  storeUrlForPlatform,
  type UpdateCheck,
} from '@/services/appUpdate';
import { layout, radii, typography, type ThemeColors } from '@/constants/theme';

/** Soft/force update sheet — checks Supabase `app_release` after first paint. */
export function UpdatePrompt() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [update, setUpdate] = useState<UpdateCheck | null>(null);

  useEffect(() => {
    const task = runWhenIdle(() => {
      void checkForAppUpdate()
        .then((result) => {
          if (result?.available) setUpdate(result);
        })
        .catch(() => undefined);
    });
    return () => task.cancel();
  }, []);

  if (!update) return null;

  const openStore = () => {
    const url = storeUrlForPlatform(update.release);
    Linking.openURL(url).catch(() => undefined);
  };

  const onLater = async () => {
    if (update.force) return;
    await dismissUpdatePrompt(update.release.latest_version);
    setUpdate(null);
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={update.force ? undefined : onLater}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>
            {update.force ? 'UPDATE REQUIRED' : 'NEW RELEASE'}
          </Text>
          <Text style={styles.title}>DROQ {update.release.latest_version}</Text>
          <Text style={styles.body}>
            {update.release.message?.trim() ||
              'A new version is available on the store. Update to keep exploring.'}
          </Text>
          <Text style={styles.meta}>You’re on {update.installedVersion}</Text>
          <Button label="Update" onPress={openStore} />
          {!update.force ? (
            <Pressable onPress={onLater} hitSlop={12} style={styles.laterWrap}>
              <Text style={styles.later}>Later</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: layout.gutter,
    },
    card: {
      backgroundColor: palette.bgElevated,
      borderRadius: radii.lg,
      padding: 22,
      gap: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border,
    },
    kicker: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 2,
      color: palette.accent,
    },
    title: {
      fontFamily: typography.brand,
      fontSize: 28,
      letterSpacing: 4,
      color: palette.text,
    },
    body: {
      fontFamily: typography.body,
      fontSize: 15,
      lineHeight: 22,
      color: palette.textMuted,
    },
    meta: {
      fontFamily: typography.body,
      fontSize: 12,
      color: palette.textDim,
      marginBottom: 4,
    },
    laterWrap: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    later: {
      fontFamily: typography.bodyMedium,
      fontSize: 14,
      color: palette.textDim,
    },
  });
}
