import { EmptyState } from '@/components/ui/EmptyState';
import { FadeIn } from '@/components/ui/FadeIn';
import { ListRow } from '@/components/ui/ListRow';
import { LoadMoreFooter } from '@/components/ui/ListSection';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { useUserLocation } from '@/hooks/useUserLocation';
import { listMyPlaceChallenges, pickRelevantChallenge, type PlaceChallenge } from '@/services/challenges';
import { deleteMyDiscovery, getMyDiscoveries } from '@/services/drops';
import { listTrailPassport, type TrailPassportItem } from '@/services/moments';
import { createSquadHunt } from '@/services/squad';
import { ChallengeProgress } from '@/components/ui/ChallengeProgress';
import type { DiscoveryWithDrop } from '@/types/drop';
import { formatRelativeTime } from '@/utils/time';
import { layout, typography, type ThemeColors } from '@/constants/theme';
import { userErrorMessage } from '@/lib/userError';
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

const PAGE = 30;

export default function DiscoveriesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { typeLabel } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { coords } = useUserLocation({ enabled: false });
  const [items, setItems] = useState<DiscoveryWithDrop[]>([]);
  const [challenge, setChallenge] = useState<PlaceChallenge | null>(null);
  const [trails, setTrails] = useState<TrailPassportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Keep the list on screen while it refreshes — replacing content the user is
  // already reading with a skeleton is what makes the app feel slow.
  const showSkeleton = useDelayedLoading(loading);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raceBusyId, setRaceBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, challenges, trailRows] = await Promise.all([
        getMyDiscoveries(PAGE, 0),
        listMyPlaceChallenges().catch(() => [] as PlaceChallenge[]),
        listTrailPassport(12).catch(() => [] as TrailPassportItem[]),
      ]);
      setItems(data);
      setHasMore(data.length >= PAGE);
      setTrails(trailRows);
      setChallenge(
        pickRelevantChallenge(challenges, coords?.latitude, coords?.longitude),
      );
    } catch (e) {
      setError(userErrorMessage(e, 'Couldn’t load discoveries.'));
    } finally {
      setLoading(false);
    }
  }, [coords?.latitude, coords?.longitude]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const data = await getMyDiscoveries(PAGE, items.length);
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

  const startRace = async (dropId: string) => {
    setRaceBusyId(dropId);
    try {
      const huntId = await createSquadHunt(dropId);
      router.push({
        pathname: '/squad/[id]',
        params: { id: huntId, dropId },
      });
    } catch (e) {
      Alert.alert('Race', userErrorMessage(e, 'Couldn’t start race.'));
    } finally {
      setRaceBusyId(null);
    }
  };

  const removeFromFound = (item: DiscoveryWithDrop) => {
    const label = item.drops?.title?.trim() || 'this Drop';
    Alert.alert(
      'Remove from Found?',
      `“${label}” will leave your history. You can unlock it again nearby.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id);
            try {
              await deleteMyDiscovery(item.id);
              setItems((prev) => prev.filter((d) => d.id !== item.id));
            } catch (e) {
              Alert.alert('Found', userErrorMessage(e, 'Couldn’t remove.'));
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  const openRowActions = (item: DiscoveryWithDrop) => {
    const drop = item.drops;
    if (!drop?.id || raceBusyId === drop.id || deletingId === item.id) return;
    Alert.alert(drop.title?.trim() || typeLabel(drop.type), undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start a race', onPress: () => startRace(drop.id) },
      {
        text: 'Remove from Found',
        style: 'destructive',
        onPress: () => removeFromFound(item),
      },
    ]);
  };

  return (
    <Screen edges={['top']} ambient="none">
      <View style={styles.pad}>
        <ScreenHeader
          title="Found"
          eyebrow={items.length > 0 ? `${items.length}${hasMore ? '+' : ''} finds` : undefined}
        />
        {challenge ? (
          <Pressable
            onPress={() => router.push('/discover')}
            style={({ pressed }) => [styles.challengeBanner, pressed && { opacity: 0.85 }]}
          >
            <ChallengeProgress
              found={challenge.found_count}
              goal={challenge.goal_count}
              title={challenge.title}
              subtitle={challenge.subtitle}
              complete={challenge.complete}
            />
          </Pressable>
        ) : null}
        {trails.length > 0 ? (
          <View style={styles.trailBlock}>
            <Text style={styles.trailEyebrow}>TRAIL PASSPORT</Text>
            {trails.slice(0, 4).map((trail) => (
              <Pressable
                key={trail.discoveryId}
                onPress={() => {
                  if (trail.nextDropId) {
                    router.push({
                      pathname: '/discover',
                      params: { focusId: trail.nextDropId },
                    });
                    return;
                  }
                  router.push(`/drop/${trail.dropId}`);
                }}
                style={({ pressed }) => [styles.trailRow, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.trailTitle} numberOfLines={1}>
                  {trail.title}
                </Text>
                <Text style={styles.trailMeta} numberOfLines={1}>
                  {trail.nextDropId
                    ? 'Continue →'
                    : trail.chainHint
                      ? trail.chainHint
                      : 'Open stamp'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {showSkeleton && items.length === 0 ? (
        <ListSkeleton rows={7} />
      ) : error && items.length === 0 ? (
        <EmptyState title="Offline or unavailable" message={error} actionLabel="Retry" onAction={load} />
      ) : (
        <FadeIn style={{ flex: 1 }}>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            initialNumToRender={10}
            windowSize={7}
            removeClippedSubviews
            contentContainerStyle={styles.list}
            style={{ flex: 1 }}
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
                title="Nothing found yet"
                message="Head outside. Something may be waiting."
                actionLabel="Discover"
                onAction={() => router.push('/discover')}
                mark="✦"
              />
            }
            renderItem={({ item, index }) => {
              const drop = item.drops;
              if (!drop?.id) return null;
              const busy = raceBusyId === drop.id || deletingId === item.id;
              return (
                <ListRow
                  index={index + 1}
                  title={drop.title?.trim() || typeLabel(drop.type)}
                  meta={`${typeLabel(drop.type)} · ${formatRelativeTime(item.discovered_at)}`}
                  onPress={() => router.push(`/drop/${drop.id}`)}
                  onLongPress={() => openRowActions(item)}
                  disabled={busy}
                />
              );
            }}
          />
        </FadeIn>
      )}
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    pad: { paddingHorizontal: layout.gutter, paddingTop: 4, paddingBottom: 8, gap: 10 },
    challengeBanner: {
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border,
    },
    trailBlock: {
      gap: 8,
      paddingTop: 4,
    },
    trailEyebrow: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 2.4,
      color: palette.accent,
    },
    trailRow: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border,
      gap: 3,
    },
    trailTitle: {
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      color: palette.text,
    },
    trailMeta: {
      fontFamily: typography.body,
      fontSize: 12,
      color: palette.textDim,
    },
    list: { paddingHorizontal: layout.gutter, paddingBottom: 40, flexGrow: 1 },
    adHeader: { marginBottom: 12, gap: 8 },
    inlineError: {
      fontFamily: typography.body,
      fontSize: 12,
      color: palette.danger,
    },
  });
}
