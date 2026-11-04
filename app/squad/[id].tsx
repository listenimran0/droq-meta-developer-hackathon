import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FadeIn } from '@/components/ui/FadeIn';
import { Avatar } from '@/components/ui/Avatar';
import { ListRow } from '@/components/ui/ListRow';
import { LoadMoreFooter, TextLinkRow } from '@/components/ui/ListSection';
import { CloseButton } from '@/components/ui/CloseButton';
import { SoftLink } from '@/components/ui/SoftLink';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { listFriendships } from '@/services/friends';
import { inviteSquadFriend, joinSquadHunt } from '@/services/squad';
import type { Friendship } from '@/types/drop';
import { useAuth } from '@/hooks/useAuth';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useTheme } from '@/hooks/useTheme';
import { userErrorMessage } from '@/lib/userError';
import { layout, typography, type ThemeColors } from '@/constants/theme';

const PAGE = 40;

export default function SquadInviteScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id, dropId, mode } = useLocalSearchParams<{
    id: string;
    dropId?: string;
    mode?: string;
  }>();
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Keep the list on screen while it refreshes — replacing content the user is
  // already reading with a skeleton is what makes the app feel slow.
  const showSkeleton = useDelayedLoading(loading);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listFriendships(PAGE, 0);
      setFriends(rows.filter((f) => f.status === 'accepted'));
      setOffset(rows.length);
      setHasMore(rows.length >= PAGE);
    } catch (e) {
      Alert.alert('Friends', userErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const rows = await listFriendships(PAGE, offset);
      const accepted = rows.filter((f) => f.status === 'accepted');
      setFriends((prev) => {
        const seen = new Set(prev.map((f) => f.id));
        return [...prev, ...accepted.filter((f) => !seen.has(f.id))];
      });
      setOffset((prev) => prev + rows.length);
      setHasMore(rows.length >= PAGE);
    } catch (e) {
      Alert.alert('Friends', userErrorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, offset]);

  useFocusEffect(
    useCallback(() => {
      if (mode === 'join') {
        (async () => {
          try {
            await joinSquadHunt(id);
            router.replace({
              pathname: '/discover',
              params: { focusId: dropId, huntId: id },
            });
          } catch (e) {
            Alert.alert('Squad', userErrorMessage(e));
            router.back();
          }
        })();
        return;
      }
      load();
    }, [id, mode, dropId, load]),
  );

  const friendUserId = (f: Friendship) =>
    f.requester_id === user?.id ? f.addressee_id : f.requester_id;

  const friendPerson = (f: Friendship) =>
    f.requester_id === user?.id ? f.addressee : f.requester;

  const friendLabel = (f: Friendship) => {
    const other = friendPerson(f);
    return other?.display_name || other?.username || 'Friend';
  };

  const onInvite = async (friendId: string) => {
    setBusyId(friendId);
    try {
      await inviteSquadFriend(id, friendId);
      Alert.alert('Invited', 'They’ll get an alert to join the hunt.');
    } catch (e) {
      Alert.alert('Invite', userErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  if (mode === 'join') {
    return (
      <Screen>
        {showSkeleton ? <ListSkeleton rows={4} /> : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.pad}>
        <ScreenHeader
          title="Invite friends"
          subtitle="They see distance — not the pin"
          trailing={<CloseButton compact />}
        />
        <TextLinkRow
          items={[
            {
              label: 'Open Discover with squad',
              onPress: () =>
                router.replace({
                  pathname: '/discover',
                  params: { focusId: dropId, huntId: id },
                }),
            },
          ]}
        />
      </View>
      {showSkeleton && friends.length === 0 ? (
        <ListSkeleton />
      ) : (
        <FadeIn style={{ flex: 1 }}>
          <FlatList
            style={{ flex: 1 }}
            data={friends}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              <LoadMoreFooter
                visible={hasMore}
                loading={loadingMore}
                onPress={loadMore}
              />
            }
            ListEmptyComponent={
              <Text style={styles.empty}>Add friends first, then invite them here.</Text>
            }
            renderItem={({ item }) => {
              const fid = friendUserId(item);
              const busy = busyId === fid;
              const person = friendPerson(item);
              return (
                <ListRow
                  title={friendLabel(item)}
                  leading={
                    <Avatar
                      uri={person?.avatar_url}
                      name={person?.display_name || person?.username}
                      size="sm"
                    />
                  }
                  showChevron={false}
                  disabled={busy}
                  onPress={() => onInvite(fid)}
                  trailing={
                    <Text style={styles.invite}>{busy ? '…' : 'Invite'}</Text>
                  }
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
    list: { paddingHorizontal: layout.gutter, paddingBottom: 40, flexGrow: 1 },
    invite: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.accentBright,
    },
    empty: {
      fontFamily: typography.body,
      fontSize: 14,
      color: palette.textDim,
      marginTop: 24,
    },
  });
}
