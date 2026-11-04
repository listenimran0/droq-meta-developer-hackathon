import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter, useIsFocused } from 'expo-router';
import { AnimatedDistance } from '@/components/ui/AnimatedDistance';
import { Button } from '@/components/ui/Button';
import { BrandMark } from '@/components/ui/BrandMark';
import { FadeIn } from '@/components/ui/FadeIn';
import { SoftLink } from '@/components/ui/SoftLink';
import { Screen } from '@/components/ui/Screen';
import { HomeSkeleton } from '@/components/ui/Skeleton';
import { ProximityPulse } from '@/components/discover/ProximityPulse';
import { SenseCard } from '@/components/discover/SenseCard';
import { QuestCard } from '@/components/discover/QuestCard';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/hooks/useAuth';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { useUserLocation } from '@/hooks/useUserLocation';
import { userErrorMessage } from '@/lib/userError';
import { shouldRefreshNearby, stampNearby } from '@/lib/nearbyRefresh';
import { getProfileStats } from '@/services/auth';
import { getNearbyCount, getNearbyDrops, getRecentFoundTypes } from '@/services/drops';
import { partOfDay, pickSenseDrop, toSenseSignals } from '@/services/sense';
import { fetchSenseReason } from '@/services/aiNarrator';
import { trackEvent } from '@/services/analytics';
import { recordNearbyDropNotice } from '@/services/notifications';
import { getOfflineQueue } from '@/services/offlineQueue';
import { listMySquadHunts, type MySquadHunt } from '@/services/squad';
import { listOpeningSoon, type OpeningSoon } from '@/services/moments';
import type { DropType, NearbyDrop } from '@/types/drop';
import { getDailyTheme } from '@/constants/config';
import { formatUnlockCountdown } from '@/utils/time';
import {
  calculateDistance,
  canUnlockAtDistance,
  formatAccuracy,
  formatDistance,
  isDropTimeLocked,
  isGpsSettlingForUnlock,
  NEARBY_NOTIFY_RADIUS_M,
} from '@/utils/location';
import { layout, space, typography, type ThemeColors } from '@/constants/theme';
import { outdoorBand, outdoorPull } from '@/constants/voice';

/**
 * Home = one job: “Is something waiting near me?”
 *
 * User opens DROQ outdoors / mid-walk. They want distance + one next step.
 * Theme, race, how-to are secondary — never compete with the proximity hero.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { configured, user } = useAuth();
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isFocused = useIsFocused();
  const pullLine = useMemo(
    () => outdoorPull(outdoorBand(), locale === 'bn' ? 'bn' : 'en'),
    [locale],
  );  const { coords, error: locationError, refresh } = useUserLocation({
    enabled: isFocused,
  });
  const [nearby, setNearby] = useState<NearbyDrop[]>([]);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const [streak, setStreak] = useState(0);
  const [recentTypes, setRecentTypes] = useState<DropType[]>([]);
  const [race, setRace] = useState<MySquadHunt | null>(null);
  const [openingSoon, setOpeningSoon] = useState<OpeningSoon | null>(null);
  const notified = useRef(false);
  const nearbyStamp = useRef<ReturnType<typeof stampNearby> | null>(null);
  const streakFetchedAt = useRef(0);
  const socialFetchedAt = useRef(0);

  const load = useCallback(
    async (force = false) => {
      if (!coords || !configured) return;
      if (
        !force &&
        !shouldRefreshNearby(nearbyStamp.current, coords.latitude, coords.longitude)
      ) {
        return;
      }
      setLoading(true);
      setFetchError(null);
      try {
        const [drops, count, queue] = await Promise.all([
          getNearbyDrops(coords.latitude, coords.longitude),
          getNearbyCount(coords.latitude, coords.longitude).catch(() => 0),
          getOfflineQueue(),
        ]);
        nearbyStamp.current = stampNearby(coords.latitude, coords.longitude);
        setNearby(drops);
        const total = Math.max(count, drops.length);
        setNearbyCount(total);
        setQueued(queue.length);

        const closestNotify = drops
          .filter((d) => !isDropTimeLocked(d.unlock_at))
          .map((d) => ({
            d,
            dist: calculateDistance(
              coords.latitude,
              coords.longitude,
              d.latitude,
              d.longitude,
            ),
          }))
          .sort((a, b) => a.dist - b.dist)[0];

        if (
          closestNotify &&
          closestNotify.dist <= NEARBY_NOTIFY_RADIUS_M &&
          !notified.current
        ) {
          notified.current = true;
          recordNearbyDropNotice(
            closestNotify.d.id,
            formatDistance(closestNotify.dist),
            total,
          ).catch(() => {
            notified.current = false;
          });
        }
      } catch (e) {
        setFetchError(userErrorMessage(e, 'Couldn’t check nearby Drops.'));
        setNearby([]);
        setNearbyCount(0);
      } finally {
        setLoading(false);
      }
    },
    [coords, configured],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useFocusEffect(
    useCallback(() => {
      loadRef.current(false);
      if (user?.id && Date.now() - streakFetchedAt.current > 60_000) {
        getProfileStats(user.id)
          .then((s) => {
            streakFetchedAt.current = Date.now();
            setStreak(s.streak);
          })
          .catch(() => setStreak(0));
        getRecentFoundTypes(10)
          .then(setRecentTypes)
          .catch(() => setRecentTypes([]));
      }
      if (user?.id && Date.now() - socialFetchedAt.current > 45_000) {
        socialFetchedAt.current = Date.now();
        listMySquadHunts(1)
          .then((rows) => setRace(rows[0] ?? null))
          .catch(() => setRace(null));
        listOpeningSoon(coords?.latitude, coords?.longitude)
          .then((rows) => setOpeningSoon(rows[0] ?? null))
          .catch(() => setOpeningSoon(null));
      } else if (!user?.id) {
        setRace(null);
        setOpeningSoon(null);
      }
      // Intentionally omit coords — nearby load is handled by the coords effect below
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]),
  );

  useEffect(() => {
    if (!isFocused || !coords) return;
    loadRef.current(false);
  }, [coords?.latitude, coords?.longitude, isFocused]);
  const ranked = useMemo(() => {
    return nearby
      .map((d) => ({
        drop: d,
        distance: coords
          ? calculateDistance(coords.latitude, coords.longitude, d.latitude, d.longitude)
          : Infinity,
        locked: isDropTimeLocked(d.unlock_at),
      }))
      .sort((a, b) => {
        if (a.locked !== b.locked) return a.locked ? 1 : -1;
        return a.distance - b.distance;
      });
  }, [nearby, coords?.latitude, coords?.longitude]);

  const closest = ranked[0];
  const dailyTheme = useMemo(() => getDailyTheme(), []);
  /**
   * Sense — one smart pick from the already-fetched candidates. No extra
   * network, no content/coords in the output. Hidden on error/empty/locked.
   */
  const sense = useMemo(() => {
    if (!configured || locationError || !coords) return null;
    return pickSenseDrop(
      ranked.map((r) => ({ drop: r.drop, distance: r.distance })),
      { themeType: dailyTheme.preferredType, recentTypes, partOfDay: partOfDay(new Date()) },
    );
  }, [configured, locationError, coords?.latitude, coords?.longitude, ranked, dailyTheme, recentTypes]);
  /**
   * Muse narration for the pick — fire-and-forget, cached per drop.
   * Null (loading, offline, model down) falls back to template copy.
   */
  const questSignals = useMemo(() => {
    if (!configured || locationError || !coords) return [];
    return toSenseSignals(
      ranked.filter((r) => !r.locked).slice(0, 12).map((r) => ({ drop: r.drop, distance: r.distance })),
      { themeType: dailyTheme.preferredType },
    );
  }, [configured, locationError, coords?.latitude, coords?.longitude, ranked, dailyTheme]);
  const [senseAiReason, setSenseAiReason] = useState<string | null>(null);
  useEffect(() => {
    setSenseAiReason(null);
    if (!sense) return;
    let live = true;
    fetchSenseReason({
      dropId: sense.dropId,
      dropType: sense.type,
      distanceM: sense.distanceM,
      isSocial: sense.reasonKey === 'senseFriend',
      themeMatch: sense.reasonKey === 'senseTheme',
      locale: locale === 'bn' ? 'bn' : 'en',
    })
      .then((text) => {
        if (live && text) setSenseAiReason(text);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sense?.dropId, locale]);
  // Only show the placeholder when the wait is long enough to notice — a
  // skeleton that flashes for a frame reads as jank.
  const showSkeleton = useDelayedLoading(
    loading && !closest && configured && !locationError,
  );
  const gpsSettling =
    closest &&
    coords &&
    isGpsSettlingForUnlock(coords.accuracy, closest.drop.unlock_radius);
  const unlockReady =
    closest &&
    !closest.locked &&
    coords &&
    !gpsSettling &&
    canUnlockAtDistance(closest.distance, closest.drop.unlock_radius, coords.accuracy);

  const wasUnlockReady = useRef(false);
  useEffect(() => {
    if (unlockReady && !wasUnlockReady.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    wasUnlockReady.current = Boolean(unlockReady);
  }, [unlockReady]);

  /** One soft tick when a drop first comes within 50m — hysteresis (60m) so
   *  GPS jitter can't buzz the phone on every refresh. */
  const wasNearSignal = useRef(false);
  useEffect(() => {
    const distance = closest?.distance;
    if (typeof distance !== 'number') {
      wasNearSignal.current = false;
      return;
    }
    if (wasNearSignal.current) {
      if (distance > 60) wasNearSignal.current = false;
      return;
    }
    if (distance <= 50 && !closest?.locked && !unlockReady) {
      wasNearSignal.current = true;
      Haptics.selectionAsync().catch(() => undefined);
    }
  }, [closest?.distance, closest?.locked, unlockReady]);

  /** Race only when social urgency exists — invite or live hunt */
  const raceUrgent = Boolean(race && (race.status === 'invited' || race.status === 'joined'));

  const openUnlock = () => {
    if (!closest) {
      router.push('/discover');
      return;
    }
    if (unlockReady) {
      router.push({
        pathname: '/drop/found',
        params: {
          id: closest.drop.id,
          type: closest.drop.type,
          lat: String(closest.drop.latitude),
          lng: String(closest.drop.longitude),
          radius: String(closest.drop.unlock_radius),
          ...(race?.drop_id === closest.drop.id && race.status === 'joined'
            ? { huntId: race.hunt_id }
            : {}),
        },
      });
      return;
    }
    router.push('/discover');
  };

  const openRace = () => {
    if (!race) {
      router.push('/(tabs)/discoveries');
      return;
    }
    if (race.status === 'invited') {
      router.push({
        pathname: '/squad/[id]',
        params: { id: race.hunt_id, dropId: race.drop_id, mode: 'join' },
      });
      return;
    }
    router.push({
      pathname: '/discover',
      params: { focusId: race.drop_id, huntId: race.hunt_id },
    });
  };

  const hero = useMemo(() => {
    if (!configured) {
      return {
        kind: 'copy' as const,
        eyebrow: 'DROQ',
        title: 'Unavailable',
        detail: 'Try again in a moment.',
      };
    }
    if (locationError) {
      return {
        kind: 'copy' as const,
        eyebrow: 'LOCATION',
        title: t('locationUnavailable'),
        detail: 'Turn on Location for DROQ, then pull to refresh.',
      };
    }
    if (loading && !closest) {
      return null;
    }
    if (!closest) {
      return {
        kind: 'quiet' as const,
        eyebrow: 'OUTSIDE',
        title: t('nothingNearby'),
        detail: t('leaveFirst'),
      };
    }
    if (closest.locked) {
      return {
        kind: 'distance' as const,
        eyebrow: 'TIME LOCKED',
        title: formatDistance(closest.distance),
        detail:
          formatUnlockCountdown(closest.drop.unlock_at) ?? t('sealedLater'),
      };
    }
    if (gpsSettling) {
      return {
        kind: 'distance' as const,
        eyebrow: 'SETTLING',
        title: formatDistance(closest.distance),
        detail: `Hold still outdoors · ${formatAccuracy(coords?.accuracy)}`,
      };
    }
    if (unlockReady) {
      return {
        kind: 'distance' as const,
        eyebrow: 'YOU ARRIVED',
        title: formatDistance(closest.distance),
        // One poetic line already lives in the pull copy — keep this functional.
        detail: t('opensWhereYouStand'),
      };
    }
    return {
      kind: 'distance' as const,
      eyebrow: nearbyCount > 1 ? `${nearbyCount} ${t('nearbyWord')}` : t('nearbyWord'),
      title: formatDistance(closest.distance),
      detail: t('somethingWaiting'),
    };
  }, [
    configured,
    locationError,
    loading,
    closest,
    gpsSettling,
    unlockReady,
    nearbyCount,
    coords?.accuracy,
    t,
  ]);

  const primaryLabel = !configured
    ? t('retry')
    : locationError
      ? 'Try again'
      : unlockReady
        ? t('unlock')
        : !closest
          ? t('plantOne')
          : t('walkToIt');

  const onPrimary = () => {
    if (!configured || locationError) {
      refresh();
      return;
    }
    if (!closest) {
      router.push('/create');
      return;
    }
    openUnlock();
  };

  return (
    <Screen edges={['top']} ambient="hero">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={async () => {
              await refresh();
              await load(true);
            }}
            tintColor={colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* 1) Quiet chrome — brand, days outside, alerts */}
        <FadeIn delay={0} slide={false}>
          <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <BrandMark size="sm" />
            {streak > 0 ? (
              <View style={styles.streakPill} accessibilityLabel={`${streak} ${t('daysOutside')}`}>
                <Text style={styles.streakPillText}>
                  {streak}
                  {locale === 'bn' ? ' ' : ''}
                  {t('daysOutsideShort')}
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => router.push('/notifications')}
            hitSlop={14}
            style={({ pressed }) => pressed && { opacity: 0.5 }}
          >
            <Text style={styles.alerts}>{t('alerts')}</Text>
          </Pressable>
          </View>
        </FadeIn>

        <FadeIn delay={50}>
          <Text style={styles.pull}>{pullLine}</Text>
        </FadeIn>

        {/* 2) Proximity stage — one composition */}
        <View style={styles.hero}>
          {showSkeleton ? (
            <HomeSkeleton />
          ) : hero ? (
            <FadeIn delay={120}>
              {closest && hero.kind === 'distance' ? (
                <View style={styles.stage}>
                  <ProximityPulse
                    distanceMeters={closest.distance}
                    found={Boolean(unlockReady)}
                    locked={closest.locked}
                    size="sm"
                    ringsOnly
                    urgent={Boolean(unlockReady) || (closest.distance <= 50 && !closest.locked)}
                    paused={!isFocused}
                  />
                  <View style={styles.stageCopy}>
                    <Text style={styles.eyebrow}>{hero.eyebrow}</Text>
                    <AnimatedDistance meters={closest.distance} style={styles.heroDistance} />
                    <Text style={styles.heroDetail}>{hero.detail}</Text>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.eyebrow}>{hero.eyebrow}</Text>

                  {/* Quiet state — a still radar that keeps listening */}
                  {hero.kind === 'quiet' ? (
                    <ProximityPulse
                      distanceMeters={null}
                      size="sm"
                      ringsOnly
                      paused={!isFocused}
                    />
                  ) : null}

                  <Text
                    style={
                      hero.kind === 'distance'
                        ? styles.heroDistance
                        : hero.kind === 'quiet'
                          ? styles.heroQuiet
                          : styles.heroCopy
                    }
                    numberOfLines={hero.kind === 'quiet' ? 2 : 3}
                  >
                    {hero.title}
                  </Text>
                  <Text style={styles.heroDetail}>{hero.detail}</Text>
                </>
              )}
            </FadeIn>
          ) : null}
        </View>

        {/* 2b) Sense — one smart pick; tap walks it into Discover focus */}
        {sense && !showSkeleton ? (
          <FadeIn delay={160}>
            <SenseCard
              type={sense.type}
              distanceM={sense.distanceM}
              reason={senseAiReason ?? t(sense.reasonKey)}
              onPress={() => {
                trackEvent('sense_opened', { drop_id: sense.dropId }).catch(
                  () => undefined,
                );
                router.push({
                  pathname: '/discover',
                  params: { focusId: sense.dropId },
                });
              }}
            />
          </FadeIn>
        ) : null}

        {/* 2c) Quest Agent — Muse tool-calling plans a short walk */}
        {questSignals.length > 0 && !showSkeleton ? (
          <FadeIn delay={180}>
            <QuestCard
              signals={questSignals}
              recentTypes={recentTypes}
              onOpenDrop={(dropId) => {
                trackEvent('quest_step_opened', { drop_id: dropId }).catch(() => undefined);
                router.push({ pathname: '/discover', params: { focusId: dropId } });
              }}
            />
          </FadeIn>
        ) : null}

        {/* 3) Actions — one primary, one secondary */}
        <FadeIn delay={200}>
        <View style={styles.actions}>
          {fetchError ? <Text style={styles.error}>{fetchError}</Text> : null}
          {queued > 0 ? (
            <Text style={styles.queue}>{queued} waiting to upload offline</Text>
          ) : null}

          <Button
            label={primaryLabel}
            onPress={onPrimary}
            disabled={!configured && !locationError}
          />

          {/* LEAVE lives in the tab bar — no second button competing here. */}
          {configured && !locationError && !closest ? (
            <Button
              label={t('discover')}
              variant="ghost"
              onPress={() => router.push('/discover')}
            />
          ) : null}

          {/* 4) Secondary — race > opening soon > challenge > daily mission */}
          {raceUrgent ? (
            <SoftLink
              label={`${race?.status === 'invited' ? t('raceInvite') : t('raceActive')} →`}
              onPress={openRace}
            />
          ) : null}

          {openingSoon ? (
            <SoftLink
              label={`${formatUnlockCountdown(openingSoon.unlock_at) ?? t('opensOn')} · ${
                openingSoon.source === 'mine' ? 'yours' : 'nearby'
              } →`}
              onPress={() =>
                router.push({
                  pathname: '/discover',
                  params: { focusId: openingSoon.id },
                })
              }
            />
          ) : null}

        </View>
        </FadeIn>
      </ScrollView>
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: {
      flexGrow: 1,
      paddingHorizontal: layout.gutter,
      paddingTop: 6,
      paddingBottom: 18,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexShrink: 1,
    },
    streakPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.accentLine,
      backgroundColor: 'transparent',
    },
    streakPillText: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 0.6,
      color: palette.accentBright,
    },
    pull: {
      fontFamily: typography.body,
      fontSize: 12,
      lineHeight: 17,
      color: palette.textDim,
      marginTop: 10,
      marginBottom: 2,
      maxWidth: 280,
      letterSpacing: 0.1,
    },
    alerts: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: palette.textDim,
    },
    hero: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingVertical: 24,
      minHeight: 300,
    },
    stage: {
      alignItems: 'center',
      gap: 10,
    },
    stageCopy: {
      alignItems: 'center',
      marginTop: -4,
      gap: 8,
    },
    eyebrow: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 3.2,
      color: palette.accent,
      textAlign: 'center',
    },
    heroDistance: {
      fontFamily: typography.brand,
      fontSize: 68,
      letterSpacing: -3.2,
      lineHeight: 72,
      color: palette.text,
      textAlign: 'center',
    },
    heroCopy: {
      fontFamily: typography.brand,
      fontSize: 30,
      letterSpacing: -1,
      lineHeight: 36,
      color: palette.text,
      maxWidth: 300,
      marginBottom: 8,
      textAlign: 'center',
      alignSelf: 'center',
    },
    /** Quiet state — fewer words, bigger voice. */
    heroQuiet: {
      fontFamily: typography.brand,
      fontSize: 36,
      letterSpacing: -1.4,
      lineHeight: 42,
      color: palette.text,
      maxWidth: 290,
      marginTop: 4,
      marginBottom: 8,
      textAlign: 'center',
      alignSelf: 'center',
    },
    heroDetail: {
      fontFamily: typography.body,
      fontSize: 14,
      lineHeight: 21,
      color: palette.textMuted,
      maxWidth: 260,
      textAlign: 'center',
    },
    actions: {
      gap: space.md,
      paddingTop: space.xs,
      paddingBottom: space.sm,
    },
    queue: {
      fontFamily: typography.body,
      fontSize: 12,
      color: palette.accent,
      textAlign: 'center',
      marginBottom: 2,
    },
    error: {
      fontFamily: typography.body,
      fontSize: 12,
      color: palette.danger,
      textAlign: 'center',
      marginBottom: 2,
    },
  });
}
