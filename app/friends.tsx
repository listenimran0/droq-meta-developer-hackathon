import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BannerAdSlot } from '@/components/ads/BannerAdSlot';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { FadeIn } from '@/components/ui/FadeIn';
import { ListRow } from '@/components/ui/ListRow';
import { LoadMoreFooter, TextLinkRow } from '@/components/ui/ListSection';
import { CloseButton } from '@/components/ui/CloseButton';
import { SoftLink } from '@/components/ui/SoftLink';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { PeopleSkeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useTheme } from '@/hooks/useTheme';
import {
  listFriendships,
  listSuggestedFriends,
  removeFriendship,
  respondToFriendRequest,
  searchProfiles,
  sendFriendRequest,
} from '@/services/friends';
import type { Friendship, Profile } from '@/types/drop';
import { layout, typography, type ThemeColors } from '@/constants/theme';
import { userErrorMessage } from '@/lib/userError';

const PAGE = 40;

export default function FriendsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [suggested, setSuggested] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Keep the list on screen while it refreshes — replacing content the user is
  // already reading with a skeleton is what makes the app feel slow.
  const showSkeleton = useDelayedLoading(loading);
  const [hasMore, setHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, ideas] = await Promise.all([
        listFriendships(PAGE, 0),
        listSuggestedFriends(10).catch(() => [] as Profile[]),
      ]);
      setFriends(rows);
      setHasMore(rows.length >= PAGE);
      setSuggested(ideas);
    } catch (e) {
      Alert.alert('Friends', userErrorMessage(e, 'Couldn’t load.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [rows, ideas] = await Promise.all([
        listFriendships(PAGE, 0),
        listSuggestedFriends(10).catch(() => [] as Profile[]),
      ]);
      setFriends(rows);
      setHasMore(rows.length >= PAGE);
      setSuggested(ideas);
    } catch (e) {
      Alert.alert('Friends', userErrorMessage(e, 'Couldn’t refresh.'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const rows = await listFriendships(PAGE, friends.length);
      setFriends((prev) => {
        const seen = new Set(prev.map((f) => f.id));
        return [...prev, ...rows.filter((f) => !seen.has(f.id))];
      });
      setHasMore(rows.length >= PAGE);
    } catch (e) {
      Alert.alert('Friends', userErrorMessage(e, 'Couldn’t load more.'));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, friends.length]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onSearch = async () => {
    if (query.trim().length < 2) {
      Alert.alert('Search', 'Type at least 2 letters of a username.');
      return;
    }
    setSearching(true);
    try {
      const rows = await searchProfiles(query);
      setResults(rows.filter((p) => p.id !== user?.id));
    } catch (e) {
      Alert.alert('Search', userErrorMessage(e, 'Try again.'));
    } finally {
      setSearching(false);
    }
  };

  const addFriend = async (id: string) => {
    setAddingId(id);
    try {
      await sendFriendRequest(id);
      Alert.alert('Sent', 'Friend request sent.');
      setResults([]);
      await load();
    } catch (e) {
      Alert.alert('Couldn’t send', userErrorMessage(e, 'Try again.'));
    } finally {
      setAddingId(null);
    }
  };

  const otherParty = (f: Friendship) => {
    if (!user) return null;
    return f.requester_id === user.id ? f.addressee : f.requester;
  };

  const pendingIn = useMemo(
    () => friends.filter((f) => f.status === 'pending' && f.addressee_id === user?.id),
    [friends, user?.id],
  );
  const pendingOut = useMemo(
    () => friends.filter((f) => f.status === 'pending' && f.requester_id === user?.id),
    [friends, user?.id],
  );
  const accepted = useMemo(
    () => friends.filter((f) => f.status === 'accepted'),
    [friends],
  );

  const friendRows = useMemo(
    () => [
      ...pendingIn.map((f) => ({ kind: 'incoming' as const, f })),
      ...pendingOut.map((f) => ({ kind: 'outgoing' as const, f })),
      ...accepted.map((f) => ({ kind: 'accepted' as const, f })),
    ],
    [pendingIn, pendingOut, accepted],
  );

  const personFace = (person?: { avatar_url?: string | null; display_name?: string | null; username?: string | null } | null) => (
    <Avatar
      uri={person?.avatar_url}
      name={person?.display_name || person?.username}
      size="sm"
    />
  );

  return (
    <Screen ambient="none">
      <View style={styles.pad}>
        <ScreenHeader title="Friends" trailing={<CloseButton compact />} />

        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Find by username…"
              autoCapitalize="none"
              onSubmitEditing={onSearch}
              returnKeyType="search"
              dense
            />
          </View>
          <SoftLink
            label={searching ? '…' : 'Search'}
            onPress={onSearch}
            disabled={searching}
            style={styles.searchBtn}
          />
        </View>
        {results.length > 0 ? (
          <TextLinkRow
            items={[{ label: 'Clear results', onPress: () => setResults([]) }]}
          />
        ) : null}
      </View>

      {results.length > 0 ? (
        <FlatList
          style={{ flex: 1 }}
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ListRow
              leading={personFace(item)}
              title={item.display_name || item.username || 'Someone'}
              meta={item.username ? `@${item.username}` : undefined}
              showChevron={false}
              trailing={<Text style={styles.action}>{addingId === item.id ? '…' : 'Add'}</Text>}
              disabled={addingId === item.id}
              onPress={() => addFriend(item.id)}
            />
          )}
        />
      ) : showSkeleton && results.length === 0 ? (
        <PeopleSkeleton />
      ) : (
        <FadeIn style={{ flex: 1 }}>
          <FlatList
            style={{ flex: 1 }}
            data={friendRows}
            keyExtractor={(item) => item.f.id}
            initialNumToRender={8}
            windowSize={7}
            removeClippedSubviews
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent}
              />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              <View style={styles.adHeader}>
                <BannerAdSlot spaced={false} />
                {suggested.length > 0 ? (
                  <View style={styles.suggestBlock}>
                    <Text style={styles.suggestLabel}>Suggested · days outside</Text>
                    {suggested.map((p) => (
                      <ListRow
                        key={p.id}
                        leading={personFace(p)}
                        title={p.display_name || p.username || 'Someone'}
                        meta={
                          p.username?.toLowerCase() === 'mdimrankhan'
                            ? `@${p.username} · founder`
                            : p.username
                              ? `@${p.username}`
                              : 'Out walking'
                        }
                        showChevron={false}
                        trailing={
                          <Text style={styles.action}>
                            {addingId === p.id ? '…' : 'Add'}
                          </Text>
                        }
                        disabled={addingId === p.id}
                        onPress={() => addFriend(p.id)}
                      />
                    ))}
                  </View>
                ) : null}
                {friendRows.length > 0 ? (
                  <Text style={styles.sectionLabel}>Your people</Text>
                ) : null}
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
              suggested.length > 0 ? null : (
                <EmptyState
                  title="No friends yet"
                  message="Add someone from suggestions, or search a username."
                  mark="◎"
                />
              )
            }
            renderItem={({ item }) => {
              const person = otherParty(item.f);
              const title = person?.display_name || person?.username || 'Someone';
              const meta = `${
                item.kind === 'incoming'
                  ? 'Wants to connect'
                  : item.kind === 'outgoing'
                    ? 'Request sent'
                    : 'Friends'
              }${person?.username ? ` · @${person.username}` : ''}`;

              if (item.kind === 'incoming') {
                return (
                  <ListRow
                    leading={personFace(person)}
                    title={title}
                    meta={meta}
                    showChevron={false}
                    onPress={() => {}}
                    trailing={
                      <View style={styles.rowActions}>
                        <Pressable
                          onPress={async () => {
                            try {
                              await respondToFriendRequest(item.f.id, true);
                              await load();
                            } catch (e) {
                              Alert.alert(
                                'Friends',
                                userErrorMessage(e, 'Couldn’t accept.'),
                              );
                            }
                          }}
                        >
                          <Text style={styles.action}>Accept</Text>
                        </Pressable>
                        <Pressable
                          onPress={async () => {
                            try {
                              await respondToFriendRequest(item.f.id, false);
                              await load();
                            } catch (e) {
                              Alert.alert(
                                'Friends',
                                userErrorMessage(e, 'Couldn’t decline.'),
                              );
                            }
                          }}
                        >
                          <Text style={styles.danger}>Decline</Text>
                        </Pressable>
                      </View>
                    }
                  />
                );
              }

              return (
                <ListRow
                  leading={personFace(person)}
                  title={title}
                  meta={meta}
                  showChevron={false}
                  trailing={
                    <Text style={styles.danger}>
                      {item.kind === 'outgoing' ? 'Cancel' : 'Remove'}
                    </Text>
                  }
                  onPress={async () => {
                    try {
                      await removeFriendship(item.f.id);
                      await load();
                    } catch (e) {
                      Alert.alert(
                        'Friends',
                        userErrorMessage(
                          e,
                          item.kind === 'outgoing' ? 'Couldn’t cancel.' : 'Couldn’t remove.',
                        ),
                      );
                    }
                  }}
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
    pad: { paddingHorizontal: layout.gutter, paddingTop: 4, gap: 8 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
    },
    searchField: { flex: 1 },
    searchBtn: {
      minHeight: 40,
      paddingHorizontal: 10,
      justifyContent: 'center',
      marginBottom: 2,
      alignSelf: 'flex-end',
    },
    list: { paddingHorizontal: layout.gutter, paddingBottom: 40, paddingTop: 8, flexGrow: 1 },
    adHeader: { marginBottom: 12, gap: 8 },
    suggestBlock: { gap: 0, marginBottom: 8 },
    suggestLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 2.4,
      textTransform: 'uppercase',
      color: palette.accent,
      marginBottom: 4,
      marginTop: 4,
    },
    sectionLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 2.4,
      textTransform: 'uppercase',
      color: palette.textDim,
      marginTop: 12,
      marginBottom: 2,
    },
    rowActions: { flexDirection: 'row', gap: 16 },
    action: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.accent,
    },
    danger: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.danger,
    },
  });
}
