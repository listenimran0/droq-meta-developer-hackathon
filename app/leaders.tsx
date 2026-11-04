import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { FadeIn } from '@/components/ui/FadeIn';
import { ListRow } from '@/components/ui/ListRow';
import { CloseButton } from '@/components/ui/CloseButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useTheme } from '@/hooks/useTheme';
import {
  leaderLabel,
  listDaysOutsideLeaders,
  type DaysOutsideLeader,
} from '@/services/leaders';
import { layout, typography, type ThemeColors } from '@/constants/theme';
import { userErrorMessage } from '@/lib/userError';

/**
 * Local-feeling board: most days outside in the last 30 days.
 * No followers — just time spent in the world.
 */
export default function LeadersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [rows, setRows] = useState<DaysOutsideLeader[]>([]);
  const [loading, setLoading] = useState(true);
  // Keep the list on screen while it refreshes — replacing content the user is
  // already reading with a skeleton is what makes the app feel slow.
  const showSkeleton = useDelayedLoading(loading);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listDaysOutsideLeaders(25));
    } catch (e) {
      setError(userErrorMessage(e, 'Couldn’t load the board.'));
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
    <Screen>
      <View style={styles.pad}>
        <ScreenHeader
          title="Days outside"
          subtitle="Last 30 days · find or leave"
          trailing={<CloseButton compact />}
        />
      </View>

      {showSkeleton && rows.length === 0 ? (
        <ListSkeleton rows={8} />
      ) : error ? (
        <EmptyState title="Unavailable" message={error} actionLabel="Retry" onAction={load} />
      ) : (
        <FadeIn style={{ flex: 1 }}>
          <FlatList
            data={rows}
            keyExtractor={(item) => item.user_id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <EmptyState
                title="Quiet out there"
                message="Be the first to spend a day outside this month."
                actionLabel="Discover"
                onAction={() => router.replace('/discover')}
              />
            }
            renderItem={({ item, index }) => (
              <ListRow
                index={index + 1}
                leading={
                  <Avatar
                    uri={item.avatar_url}
                    name={item.display_name || item.username || (item.is_me ? 'You' : 'Someone')}
                    size="sm"
                  />
                }
                title={leaderLabel(item)}
                meta={
                  item.is_me
                    ? 'You'
                    : item.display_name && item.username
                      ? item.display_name
                      : undefined
                }
                showChevron={false}
                onPress={() => {}}
                trailing={
                  <Text style={[styles.days, item.is_me && styles.daysMe]}>
                    {item.days_outside}d
                  </Text>
                }
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
    pad: {
      paddingHorizontal: layout.gutter,
      paddingTop: 4,
      paddingBottom: 6,
      gap: 4,
    },
    list: {
      paddingHorizontal: layout.gutter,
      paddingBottom: 40,
      flexGrow: 1,
    },
    days: {
      fontFamily: typography.bodyMedium,
      fontSize: 14,
      color: palette.accentBright,
    },
    daysMe: {
      color: palette.accent,
    },
  });
}
