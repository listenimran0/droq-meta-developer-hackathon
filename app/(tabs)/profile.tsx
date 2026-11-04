import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BannerAdSlot } from '@/components/ads/BannerAdSlot';
import { FadeIn } from '@/components/ui/FadeIn';
import { BusinessPlansCard } from '@/components/business/BusinessPlansCard';
import { ListSection, NavRow } from '@/components/ui/ListSection';
import { Screen } from '@/components/ui/Screen';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { getProfileStats } from '@/services/auth';
import { getMediaUrl } from '@/services/media';
import { unreadNotificationCount } from '@/services/notifications';
import type { ProfileStats } from '@/types/drop';
import { layout, typography, type ThemeColors } from '@/constants/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, user, refreshProfile } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  // Only show the placeholder when the wait is long enough to notice.
  const showSkeleton = useDelayedLoading(loading);
  const [unread, setUnread] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!user?.id) {
          setLoading(false);
          return;
        }
        setLoading(true);
        try {
          await refreshProfile();
          const [s, u] = await Promise.all([
            getProfileStats(user.id),
            unreadNotificationCount().catch(() => 0),
          ]);
          if (active) {
            setStats(s);
            setUnread(u);
          }
        } catch {
          // Keep last good stats
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [user?.id, refreshProfile]),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const raw = profile?.avatar_url?.trim();
        if (!raw) {
          if (active) setAvatarUrl(null);
          return;
        }
        const url = await getMediaUrl(raw).catch(() => (/^https?:\/\//i.test(raw) ? raw : null));
        if (active) setAvatarUrl(url);
      })();
      return () => {
        active = false;
      };
    }, [profile?.avatar_url]),
  );

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const metaName =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    (typeof meta.display_name === 'string' && meta.display_name.trim()) ||
    null;
  const name = (
    profile?.display_name ||
    metaName ||
    profile?.username ||
    'Wanderer'
  ).toUpperCase();

  return (
    <Screen edges={['top']} ambient="none">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
        nestedScrollEnabled
        bounces
        alwaysBounceVertical
      >
        <FadeIn>
          <View style={styles.header}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.avatarLetter}>{name.slice(0, 1)}</Text>
              </View>
            )}
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>YOU</Text>
              <Text style={styles.name} numberOfLines={2}>
                {name}
              </Text>
              {profile?.username ? (
                <Text style={styles.handle} numberOfLines={1}>
                  @{profile.username}
                </Text>
              ) : null}
            </View>
          </View>
        </FadeIn>

        {showSkeleton && !stats ? (
          <ProfileSkeleton />
        ) : (
          <FadeIn>
            <View style={styles.stats}>
              <Pressable style={styles.stat} onPress={() => router.push('/(tabs)/discoveries')}>
                <Text style={styles.statValue}>{stats?.discovered ?? 0}</Text>
                <Text style={styles.statLabel}>Found</Text>
              </Pressable>
              <View style={styles.statDivider} />
              <Pressable style={styles.stat} onPress={() => router.push('/left')}>
                <Text style={styles.statValue}>{stats?.created ?? 0}</Text>
                <Text style={styles.statLabel}>Left</Text>
              </Pressable>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stats?.placesVisited ?? 0}</Text>
                <Text style={styles.statLabel}>Places</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stats?.streak ?? 0}</Text>
                <Text style={styles.statLabel}>{t('streakLabel')}</Text>
              </View>
            </View>

            <ListSection title="Account">
              <NavRow
                title={t('editProfile')}
                subtitle="Name, username, photo"
                onPress={() => router.push('/profile/edit')}
              />
              <NavRow
                title={unread > 0 ? `${t('alerts')} · ${unread}` : t('alerts')}
                subtitle="Nearby finds and discoveries"
                onPress={() => router.push('/notifications')}
              />
              <NavRow
                title={t('settings')}
                subtitle="Theme, language, notifications"
                onPress={() => router.push('/settings')}
                last
              />
            </ListSection>

            <ListSection title="Social">
              <NavRow
                title={t('friends')}
                subtitle="Friends-only Drops"
                onPress={() => router.push('/friends')}
              />
              <NavRow
                title="Days outside"
                subtitle="Who’s been exploring lately"
                onPress={() => router.push('/leaders')}
                last
              />
            </ListSection>

            <ListSection title="Create">
              <NavRow
                title="Drops you left"
                subtitle="Edit, reactions, partner QR"
                onPress={() => router.push('/left')}
              />
              <NavRow
                title="Plant a trail"
                subtitle="Linked stops with hints"
                onPress={() => router.push('/create/chain')}
                last
              />
            </ListSection>

            <ListSection title={t('businessSection')}>
              <NavRow
                title={t('businessCreate')}
                subtitle={t('businessCreateSub')}
                onPress={() => router.push({ pathname: '/create', params: { business: '1' } })}
              />
              <NavRow
                title={t('insightsLink')}
                subtitle={t('insightsLinkSub')}
                onPress={() => router.push('/insights')}
                last
              />
              <BusinessPlansCard />
            </ListSection>

            <ListSection title="Safety">
              <NavRow
                title={t('moderation')}
                subtitle="Reports on your Drops"
                onPress={() => router.push('/moderation')}
                last
              />
            </ListSection>
          </FadeIn>
        )}

        <View style={styles.adDock}>
          <BannerAdSlot spaced={false} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: layout.gutter,
      paddingTop: 12,
      paddingBottom: 48,
      flexGrow: 1,
      gap: 18,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 18,
      marginBottom: 8,
    },
    headerText: { flex: 1, gap: 4 },
    eyebrow: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 3,
      color: palette.accent,
    },
    avatar: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: palette.bgSoft,
      borderWidth: 1,
      borderColor: palette.accentLine,
    },
    avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
    avatarLetter: {
      fontFamily: typography.brand,
      fontSize: 26,
      color: palette.accent,
    },
    name: {
      fontFamily: typography.brand,
      fontSize: 24,
      letterSpacing: 0.5,
      color: palette.text,
    },
    handle: {
      fontFamily: typography.body,
      fontSize: 13,
      color: palette.textMuted,
    },
    stats: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: palette.borderStrong,
      marginBottom: 8,
    },
    stat: { flex: 1, gap: 4 },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: palette.borderStrong,
      marginHorizontal: 8,
    },
    statValue: {
      fontFamily: typography.brand,
      fontSize: 28,
      color: palette.text,
    },
    statLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: palette.textMuted,
    },
    adDock: {
      marginHorizontal: -layout.gutter,
      marginTop: 8,
    },
  });
}
