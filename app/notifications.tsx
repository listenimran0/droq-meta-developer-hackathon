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
import { EmptyState } from '@/components/ui/EmptyState';
import { FadeIn } from '@/components/ui/FadeIn';
import { LoadMoreFooter, TextLinkRow } from '@/components/ui/ListSection';
import { CloseButton } from '@/components/ui/CloseButton';
import { SoftLink } from '@/components/ui/SoftLink';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useTheme } from '@/hooks/useTheme';
import {
  clearReadNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications';
import type { AppNotification } from '@/types/drop';
import { formatRelativeTime } from '@/utils/time';
import { layout, typography, type ThemeColors } from '@/constants/theme';
import { userErrorMessage } from '@/lib/userError';

const PAGE = 40;

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Keep the list on screen while it refreshes — a skeleton over content the
  // user is already reading is what makes the app feel slow.
  const showSkeleton = useDelayedLoading(loading);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listNotifications(PAGE, 0);
      setItems(data);
      setHasMore(data.length >= PAGE);
    } catch (e) {
      setError(userErrorMessage(e, 'Couldn’t load alerts.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const data = await listNotifications(PAGE, items.length);
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...data.filter((n) => !seen.has(n.id))];
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

  const onMarkAll = async () => {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
      );
    } catch (e) {
      Alert.alert('Alerts', userErrorMessage(e, 'Couldn’t update.'));
    } finally {
      setBusy(false);
    }
  };

  const onClearRead = async () => {
    Alert.alert('Clear read alerts?', 'Removes alerts you’ve already opened.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await clearReadNotifications();
            await load();
          } catch (e) {
            Alert.alert('Alerts', userErrorMessage(e, 'Couldn’t clear.'));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen ambient="none">
      <View style={styles.pad}>
        <ScreenHeader title="Alerts" trailing={<CloseButton compact />} />
        <TextLinkRow
          items={[
            {
              label: busy ? '…' : 'Mark all read',
              onPress: onMarkAll,
              disabled: busy || loading,
            },
            {
              label: 'Clear read',
              onPress: onClearRead,
              disabled: busy || loading,
            },
          ]}
        />
      </View>

      {showSkeleton && items.length === 0 ? (
        <ListSkeleton rows={7} />
      ) : error && items.length === 0 ? (
        <EmptyState title="Unavailable" message={error} actionLabel="Retry" onAction={load} />
      ) : (
        <FadeIn style={{ flex: 1 }}>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            initialNumToRender={10}
            windowSize={7}
            removeClippedSubviews
            contentContainerStyle={styles.list}
            style={styles.listFlex}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              <View style={styles.adHeader}>
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
                title="Quiet for now"
                message="You’ll hear when something is nearby or discovered."
              />
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.row, !item.read_at && styles.unread]}
                onPress={async () => {
                  if (!item.read_at) {
                    await markNotificationRead(item.id);
                    setItems((prev) =>
                      prev.map((n) =>
                        n.id === item.id
                          ? { ...n, read_at: new Date().toISOString() }
                          : n,
                      ),
                    );
                  }
                  if (item.kind === 'nearby_drop') {
                    router.push('/discover');
                  } else if (item.kind === 'squad_invite') {
                    const huntId =
                      typeof item.data?.hunt_id === 'string' ? item.data.hunt_id : null;
                    if (huntId) {
                      router.push({
                        pathname: '/squad/[id]',
                        params: {
                          id: huntId,
                          dropId: item.drop_id ?? undefined,
                          mode: 'join',
                        },
                      });
                    } else if (item.drop_id) {
                      router.push(`/hunt/${item.drop_id}`);
                    }
                  } else if (item.drop_id) {
                    router.push(`/drop/${item.drop_id}`);
                  } else if (
                    item.kind === 'friend_request' ||
                    item.kind === 'friend_accepted'
                  ) {
                    router.push('/friends');
                  }
                }}
                onLongPress={() => {
                  Alert.alert('Delete this alert?', item.title, [
                    { text: 'Keep', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await deleteNotification(item.id);
                          setItems((prev) => prev.filter((n) => n.id !== item.id));
                        } catch (e) {
                          Alert.alert('Alerts', userErrorMessage(e, 'Couldn’t delete.'));
                        }
                      },
                    },
                  ]);
                }}
              >
                <Text style={styles.title}>{item.title}</Text>
                {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
                <Text style={styles.meta}>
                  {formatRelativeTime(item.created_at)}
                  {!item.read_at ? ' · new' : ''}
                </Text>
              </Pressable>
            )}
          />
        </FadeIn>
      )}
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    pad: { paddingHorizontal: layout.gutter, paddingTop: 4, gap: 6, paddingBottom: 4 },
    listFlex: { flex: 1 },
    list: { paddingHorizontal: layout.gutter, paddingBottom: 40, flexGrow: 1 },
    adHeader: { marginBottom: 12 },
    row: {
      paddingVertical: 18,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border,
      gap: 6,
    },
    unread: {
      borderBottomColor: palette.accent,
    },
    title: {
      fontFamily: typography.bodyMedium,
      fontSize: 16,
      color: palette.text,
    },
    body: {
      fontFamily: typography.body,
      fontSize: 14,
      color: palette.textMuted,
    },
    meta: {
      fontFamily: typography.body,
      fontSize: 12,
      color: palette.textDim,
    },
  });
}
