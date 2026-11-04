import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { Screen } from '@/components/ui/Screen';
import { BrandMark } from '@/components/ui/BrandMark';
import { DiscoverSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { getHuntTeaser } from '@/services/squad';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { userErrorMessage } from '@/lib/userError';
import { layout, typography, type ThemeColors } from '@/constants/theme';

/**
 * Cryptic invite landing — no coordinates or content.
 * Routes into Discover focused on the Drop.
 */
export default function HuntInviteScreen() {
  const router = useRouter();
  const { user, configured } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [message, setMessage] = useState('Opening hunt…');
  const [typeKey, setTypeKey] = useState<string | null>(null);
  const { typeLabel: typeName } = useI18n();
  const typeLabel = typeKey ? typeName(typeKey) : null;
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  // Only show the placeholder when the wait is long enough to notice.
  const showSkeleton = useDelayedLoading(!ready);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) {
        setError('Missing hunt.');
        return;
      }
      if (!configured) {
        setError('Something’s unavailable. Try again in a moment.');
        return;
      }
      if (!user) {
        setNeedsAuth(true);
        setMessage('Sign in to sense what’s waiting — the pin stays hidden.');
        setReady(true);
        return;
      }
      try {
        const teaser = await getHuntTeaser(id);
        if (!active) return;
        if (!teaser) {
          setError('This hunt isn’t available.');
          return;
        }
        setTypeKey(teaser.type);
        setLocked(teaser.locked);
        setNeedsAuth(false);
        setMessage(
          teaser.locked
            ? 'Something is sealed here — come back later.'
            : 'Something is waiting somewhere nearby. Distance is the only clue.',
        );
        setReady(true);
      } catch (e) {
        if (!active) return;
        const msg = userErrorMessage(e, 'Couldn’t open hunt.');
        if (/sign|auth|jwt|login/i.test(msg) || !user) {
          setNeedsAuth(true);
          setMessage('Sign in to sense what’s waiting — the pin stays hidden.');
          setReady(true);
        } else {
          setError(msg);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [id, user?.id, configured]);

  if (error) {
    return (
      <Screen>
        <View style={styles.wrap}>
          <Text style={styles.error}>{error}</Text>
          <Button label="Close" variant="ghost" onPress={() => router.replace('/(tabs)/home')} />
        </View>
      </Screen>
    );
  }

  if (!ready) {
    return (
      <Screen ambient="hero">
        {showSkeleton ? <DiscoverSkeleton /> : null}
      </Screen>
    );
  }

  return (
    <Screen ambient="hero">
      <FadeIn style={{ flex: 1 }}>
        <View style={styles.wrap}>
          <BrandMark size="sm" />
          {typeLabel ? <Text style={styles.type}>{typeLabel.toUpperCase()}</Text> : null}
          <Text style={styles.title}>{message}</Text>
          {needsAuth ? (
            <Button
              label="Sign in to hunt"
              onPress={() => router.replace('/(auth)/login')}
            />
          ) : !locked ? (
            <Button
              label="Start Discover"
              onPress={() =>
                router.replace({
                  pathname: '/discover',
                  params: { focusId: id },
                })
              }
            />
          ) : (
            <Button label="Back home" variant="ghost" onPress={() => router.replace('/(tabs)/home')} />
          )}
        </View>
      </FadeIn>
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      paddingHorizontal: layout.gutter,
      justifyContent: 'center',
      gap: 18,
    },
    brand: {
      fontFamily: typography.brand,
      fontSize: 36,
      letterSpacing: 8,
      color: palette.text,
    },
    type: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 3,
      color: palette.accent,
    },
    title: {
      fontFamily: typography.body,
      fontSize: 18,
      lineHeight: 28,
      color: palette.textMuted,
    },
    error: {
      fontFamily: typography.body,
      fontSize: 15,
      color: palette.danger,
    },
  });
}
