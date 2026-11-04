import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BannerAdSlot } from '@/components/ads/BannerAdSlot';
import { CloseButton } from '@/components/ui/CloseButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FadeIn } from '@/components/ui/FadeIn';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useTheme } from '@/hooks/useTheme';
import { getReportsOnMyDrops, hideMyDrop, type DropReportRow } from '@/services/moderation';
import { formatRelativeTime } from '@/utils/time';
import { layout, typography, type ThemeColors } from '@/constants/theme';
import { userErrorMessage } from '@/lib/userError';

export default function ModerationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<DropReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Keep the list on screen while it refreshes — replacing content the user is
  // already reading with a skeleton is what makes the app feel slow.
  const showSkeleton = useDelayedLoading(loading);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getReportsOnMyDrops());
    } catch (e) {
      setError(userErrorMessage(e, 'Couldn’t load reports.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen ambient="none">
      <View style={styles.pad}>
        <ScreenHeader
          title="Reports"
          subtitle="Flags on what you left"
          trailing={<CloseButton compact />}
        />
      </View>

      {showSkeleton && items.length === 0 ? (
        <ListSkeleton />
      ) : error ? (
        <EmptyState title="Unavailable" message={error} actionLabel="Retry" onAction={load} />
      ) : (
        <FadeIn style={{ flex: 1 }}>
          <FlatList
            style={{ flex: 1 }}
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.adHeader}>
                <BannerAdSlot spaced={false} />
              </View>
            }
            ListEmptyComponent={
              <EmptyState title="All quiet" message="No reports on your Drops." />
            }
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.title}>
                  {item.drops?.title?.trim() || item.drops?.type || 'Drop'}
                </Text>
                <Text style={styles.meta}>
                  {item.reason.replace('_', ' ')} · {formatRelativeTime(item.created_at)}
                </Text>
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      'Hide this Drop?',
                      'It will stop appearing for discoverers.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Hide',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await hideMyDrop(item.drop_id);
                              await load();
                            } catch (e) {
                              Alert.alert(
                                'Couldn’t hide',
                                userErrorMessage(e, 'Try again.'),
                              );
                            }
                          },
                        },
                      ],
                    );
                  }}
                >
                  <Text style={styles.hide}>Hide Drop</Text>
                </Pressable>
              </View>
            )}
          />
        </FadeIn>
      )}
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    pad: { paddingHorizontal: layout.gutter, paddingTop: 4, gap: 4 },
    back: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      color: palette.textMuted,
    },
    list: { paddingHorizontal: layout.gutter, paddingBottom: 40, flexGrow: 1 },
    adHeader: { marginBottom: 12 },
    row: {
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      gap: 6,
    },
    title: {
      fontFamily: typography.bodyMedium,
      fontSize: 16,
      color: palette.text,
    },
    meta: {
      fontFamily: typography.body,
      fontSize: 13,
      color: palette.textMuted,
    },
    hide: {
      marginTop: 8,
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.danger,
    },
  });
}
