import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BannerAdSlot } from '@/components/ads/BannerAdSlot';
import { EmptyState } from '@/components/ui/EmptyState';
import { FadeIn } from '@/components/ui/FadeIn';
import { ListRow } from '@/components/ui/ListRow';
import { LoadMoreFooter } from '@/components/ui/ListSection';
import { CloseButton } from '@/components/ui/CloseButton';
import { SoftLink } from '@/components/ui/SoftLink';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { VISIBILITY_OPTIONS } from '@/constants/config';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { deleteDrop, getMyCreatedDrops } from '@/services/drops';
import type { Drop } from '@/types/drop';
import { formatRelativeTime } from '@/utils/time';
import { layout, typography, type ThemeColors } from '@/constants/theme';
import { userErrorMessage } from '@/lib/userError';

const PAGE = 30;

function statusLabel(status: Drop['status']): string {
  if (status === 'hidden') return ' · hidden';
  if (status === 'removed') return ' · removed';
  if (status === 'expired') return ' · expired';
  return '';
}

export default function LeftDropsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { typeLabel } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Keep the list on screen while it refreshes — replacing content the user is
  // already reading with a skeleton is what makes the app feel slow.
  const showSkeleton = useDelayedLoading(loading);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyCreatedDrops(PAGE, 0);
      setItems(data);
      setHasMore(data.length >= PAGE);
    } catch (e) {
      setError(userErrorMessage(e, 'Couldn’t load your Drops.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const data = await getMyCreatedDrops(PAGE, items.length);
      setItems((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        return [...prev, ...data.filter((d) => !seen.has(d.id))];
      });
      setHasMore(data.length >= PAGE);
    } catch (e) {
      setError(userErrorMessage(e, 'Couldn’t load more.'));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, items.length]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const confirmDelete = (item: Drop) => {
    Alert.alert(
      'Delete this Drop?',
      item.title?.trim() || typeLabel(item.type),
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDrop(item.id);
              setItems((prev) => prev.filter((d) => d.id !== item.id));
            } catch (e) {
              Alert.alert('Couldn’t delete', userErrorMessage(e, 'Try again.'));
            }
          },
        },
      ],
    );
  };

  return (
    <Screen ambient="none">
      <View style={styles.pad}>
        <ScreenHeader
          title="Drops you left"
          subtitle="Hold a row to delete"
          trailing={<CloseButton compact />}
        />
      </View>

      {showSkeleton && items.length === 0 ? (
        <ListSkeleton rows={7} />
      ) : error && items.length === 0 ? (
        <EmptyState title="Unavailable" message={error} actionLabel="Retry" onAction={load} />
      ) : (
        <FadeIn style={{ flex: 1 }}>
          <FlatList
            style={{ flex: 1 }}
            data={items}
            keyExtractor={(item) => item.id}
            initialNumToRender={10}
            windowSize={7}
            removeClippedSubviews
            contentContainerStyle={styles.list}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              <View style={styles.adHeader}>
                {error ? <Text style={styles.inlineError}>{error}</Text> : null}
                <BannerAdSlot spaced={false} />
              </View>
            }
            ListFooterComponent={
              <LoadMoreFooter
                visible={hasMore}
                loading={loadingMore}
                onPress={loadMore}
              />
            }
            ListEmptyComponent={
              <EmptyState
                title="You haven’t left anything yet"
                message="Pick a spot. Leave a note, photo, or secret — then walk away."
                actionLabel="Leave a Drop"
                onAction={() => router.push('/create')}
                mark="◇"
              />
            }
            renderItem={({ item, index }) => (
              <ListRow
                index={index + 1}
                title={item.title?.trim() || typeLabel(item.type)}
                meta={`${typeLabel(item.type)} · ${
                  VISIBILITY_OPTIONS.find((v) => v.value === item.visibility)?.label ??
                  item.visibility
                } · ${formatRelativeTime(item.created_at)}${statusLabel(item.status)}`}
                onPress={() => router.push(`/drop/${item.id}`)}
                onLongPress={() => confirmDelete(item)}
              />
            )}
          />
        </FadeIn>
      )}
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    pad: { paddingHorizontal: layout.gutter, paddingTop: 4, paddingBottom: 8, gap: 4 },
    list: { paddingHorizontal: layout.gutter, paddingBottom: 40, flexGrow: 1 },
    adHeader: { marginBottom: 16, gap: 8 },
    inlineError: {
      fontFamily: typography.body,
      fontSize: 12,
      color: palette.danger,
    },
  });
}
