import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { FadeIn } from '@/components/ui/FadeIn';
import { CloseButton } from '@/components/ui/CloseButton';
import { SoftLink } from '@/components/ui/SoftLink';
import { Screen } from '@/components/ui/Screen';
import { DiscoverSkeleton } from '@/components/ui/Skeleton';
import { ProximityPulse } from '@/components/discover/ProximityPulse';
import { CopilotCard } from '@/components/discover/CopilotCard';
import {
  setSimulationMode,
  setSimulationTarget,
} from '@/lib/devSimulation';
import { useHeading } from '@/hooks/useHeading';
import { useAdFree } from '@/hooks/useAdFree';
import { useRewardedAd } from '@/hooks/useRewardedAd';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/components/ui/Toast';
import { useUserLocation } from '@/hooks/useUserLocation';
import { userErrorMessage } from '@/lib/userError';
import { shouldRefreshNearby, stampNearby } from '@/lib/nearbyRefresh';
import { trackEvent } from '@/services/analytics';
import { fetchHuntHint, getLastNarratorError } from '@/services/aiNarrator';
import { getNearbyCount, getNearbyDrops } from '@/services/drops';
import { recordNearbyDropNotice } from '@/services/notifications';
import {
  getNearbyDropById,
  getSquadDistances,
  pingSquadLocation,
  type SquadDistanceRow,
} from '@/services/squad';
import { getSquadRaceOutcome } from '@/services/moments';
import type { NearbyDrop } from '@/types/drop';
import {
  bearingDegrees,
  calculateDistance,
  canUnlockAtDistance,
  COMPASS_HINT_RADIUS_M,
  formatAccuracy,
  formatDistance,
  formatDistanceBucket,
  isDropTimeLocked,
  isGpsSettlingForUnlock,
  NEARBY_NOTIFY_RADIUS_M,
  relativeBearing,
} from '@/utils/location';
import { layout, radii, typography, type ThemeColors } from '@/constants/theme';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { useTheme } from '@/hooks/useTheme';
import { formatUnlockCountdown } from '@/utils/time';

type Tracked = {
  drop: NearbyDrop;
  distance: number;
  locked: boolean;
};

const WINDS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Absolute bearing → 8-wind cardinal (N/NE/… — universal, no locale needed). */
function compassToCardinal(deg: number): string {
  const n = ((deg % 360) + 360) % 360;
  return WINDS[Math.round(n / 45) % 8] ?? 'N';
}

function rankCandidates(
  candidates: NearbyDrop[],
  coords: { latitude: number; longitude: number } | null,
): Tracked[] {
  if (!coords || candidates.length === 0) return [];
  return candidates
    .map((drop) => ({
      drop,
      distance:
        typeof drop.distance_m === 'number' && Number.isFinite(drop.distance_m)
          ? drop.distance_m
          : calculateDistance(
              coords.latitude,
              coords.longitude,
              drop.latitude,
              drop.longitude,
            ),
      locked: isDropTimeLocked(drop.unlock_at),
    }))
    .sort((a, b) => {
      if (a.locked !== b.locked) return a.locked ? 1 : -1;
      const aFriends =
        a.drop.visibility === 'friends' || a.drop.visibility === 'direct' ? 0 : 1;
      const bFriends =
        b.drop.visibility === 'friends' || b.drop.visibility === 'direct' ? 0 : 1;
      if (aFriends !== bFriends) return aFriends - bFriends;
      return a.distance - b.distance;
    });
}

export default function DiscoverScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { t, locale, typeLabel } = useI18n();
  const toast = useToast();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { focusId, huntId } = useLocalSearchParams<{ focusId?: string; huntId?: string }>();
  const [candidates, setCandidates] = useState<NearbyDrop[]>([]);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [focusDropId, setFocusDropId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loadingDrops, setLoadingDrops] = useState(true);
  const [squadRows, setSquadRows] = useState<SquadDistanceRow[]>([]);
  const [hintLevel, setHintLevel] = useState(0);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintFailed, setHintFailed] = useState(false);
  const [trend, setTrend] = useState<'warmer' | 'cooler' | null>(null);
  const lastDistRef = useRef<number | null>(null);
  const adFree = useAdFree();
  const rewarded = useRewardedAd();
  const foundHaptic = useRef(false);
  const nearbyNotified = useRef(false);
  const nearbyStamp = useRef<ReturnType<typeof stampNearby> | null>(null);

  const listenTarget = useMemo(() => {
    const preferredId = focusId || focusDropId;
    if (preferredId) {
      const hit = candidates.find((d) => d.id === preferredId);
      if (hit) return hit;
    }
    return candidates.find((d) => !isDropTimeLocked(d.unlock_at)) ?? candidates[0];
  }, [candidates, focusDropId, focusId]);

  const { coords, error: locationError, loading: locationLoading } = useUserLocation({
    enabled: isFocused,
    targetDrop: listenTarget
      ? { latitude: listenTarget.latitude, longitude: listenTarget.longitude }
      : null,
  });

  // Only show the placeholder when the wait is long enough to notice.
  const showSkeleton = useDelayedLoading(loadingDrops || locationLoading);

  const nearCompassBand =
    isFocused &&
    Boolean(coords && listenTarget) &&
    calculateDistance(
      coords!.latitude,
      coords!.longitude,
      listenTarget!.latitude,
      listenTarget!.longitude,
    ) <= COMPASS_HINT_RADIUS_M * 1.25;

  const heading = useHeading(nearCompassBand);
  const loadCandidates = useCallback(
    async (force = false) => {
      if (!coords) return;
      if (
        !force &&
        !shouldRefreshNearby(nearbyStamp.current, coords.latitude, coords.longitude)
      ) {
        return;
      }
      setLoadingDrops(true);
      setFetchError(null);
      try {
        const [drops, count] = await Promise.all([
          getNearbyDrops(coords.latitude, coords.longitude),
          getNearbyCount(coords.latitude, coords.longitude).catch(() => 0),
        ]);
        let next = drops;
        if (focusId && !next.some((d) => d.id === focusId)) {
          const focused = await getNearbyDropById(
            focusId,
            coords.latitude,
            coords.longitude,
          ).catch(() => null);
          if (focused) {
            next = [
              {
                id: focused.id,
                type: focused.type,
                unlock_radius: focused.unlock_radius,
                latitude: focused.latitude,
                longitude: focused.longitude,
                unlock_at: focused.unlock_at,
                expires_at: focused.expires_at,
                created_at: focused.created_at,
                visibility: focused.visibility,
              },
              ...next,
            ];
          }
        }
        nearbyStamp.current = stampNearby(coords.latitude, coords.longitude);
        setCandidates(next);
        setNearbyCount(Math.max(count, next.length));
        setFocusDropId((prev) => {
          if (focusId && next.some((d) => d.id === focusId)) return focusId;
          if (prev && next.some((d) => d.id === prev)) return prev;
          return next[0]?.id ?? null;
        });
      } catch (e) {
        setFetchError(userErrorMessage(e, 'Couldn’t load nearby Drops.'));
      } finally {
        setLoadingDrops(false);
      }
    },
    [coords?.latitude, coords?.longitude, focusId],
  );

  useEffect(() => {
    if (coords) loadCandidates(Boolean(focusId));
  }, [coords?.latitude, coords?.longitude, focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ranked: Tracked[] = useMemo(
    () => rankCandidates(candidates, coords),
    [coords?.latitude, coords?.longitude, candidates],
  );

  useEffect(() => {
    if (focusId) setFocusDropId(focusId);
  }, [focusId]);

  const tracked =
    ranked.find((r) => r.drop.id === focusDropId) ?? ranked[0] ?? null;

  const blips = useMemo(() => {
    if (!tracked || ranked.length < 2) return [];
    return ranked
      .filter((r) => r.drop.id !== tracked.drop.id)
      .slice(0, 3)
      .map((r) => ({
        id: r.drop.id,
        bucketLabel: formatDistanceBucket(r.distance),
      }));
  }, [ranked, tracked?.drop.id]);

  const unlockablesHere = useMemo(() => {
    if (!coords || !tracked) return [];
    return ranked.filter(
      (r) =>
        !r.locked &&
        !isGpsSettlingForUnlock(coords.accuracy, r.drop.unlock_radius) &&
        canUnlockAtDistance(r.distance, r.drop.unlock_radius, coords.accuracy),
    );
  }, [ranked, coords?.accuracy, tracked]);

  const gpsSettling =
    tracked &&
    isGpsSettlingForUnlock(coords?.accuracy, tracked.drop.unlock_radius);

  const within =
    tracked &&
    !tracked.locked &&
    !gpsSettling &&
    canUnlockAtDistance(
      tracked.distance,
      tracked.drop.unlock_radius,
      coords?.accuracy,
    );

  const showCompass =
    tracked &&
    !tracked.locked &&
    !within &&
    tracked.distance <= COMPASS_HINT_RADIUS_M &&
    heading != null &&
    coords;

  const compassOffset =
    showCompass && coords
      ? relativeBearing(
          heading!,
          bearingDegrees(
            coords.latitude,
            coords.longitude,
            tracked!.drop.latitude,
            tracked!.drop.longitude,
          ),
        )
      : null;

  useEffect(() => {
    foundHaptic.current = false;
    // Fresh hunt, fresh hints + trend.
    setHintLevel(0);
    setHintText(null);
    setHintLoading(false);
    setHintFailed(false);
    setTrend(null);
    lastDistRef.current = null;
  }, [tracked?.drop.id]);

  // Warmer/colder: distance delta with hysteresis so GPS noise won't flicker.
  useEffect(() => {
    if (!tracked || tracked.locked) return;
    const d = tracked.distance;
    const prev = lastDistRef.current;
    lastDistRef.current = d;
    if (prev == null || !Number.isFinite(d) || !Number.isFinite(prev)) return;
    const delta = prev - d;
    if (delta >= 5) setTrend('warmer');
    else if (delta <= -5) setTrend('cooler');
  }, [tracked?.drop.id, tracked?.distance, tracked?.locked]);

  useEffect(() => {
    if (within && !foundHaptic.current) {
      foundHaptic.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      trackEvent('drop_found_proximity', { drop_id: tracked?.drop.id });
    }
  }, [within, tracked?.drop.id]);

  useEffect(() => {
    if (!tracked || tracked.locked || tracked.distance > NEARBY_NOTIFY_RADIUS_M) return;
    if (nearbyNotified.current) return;
    nearbyNotified.current = true;
    recordNearbyDropNotice(
      tracked.drop.id,
      formatDistance(tracked.distance),
      nearbyCount || ranked.length,
    ).catch(() => {
      nearbyNotified.current = false;
    });
  }, [tracked?.drop.id, tracked?.distance, tracked?.locked, nearbyCount, ranked.length]);

  useEffect(() => {
    if (!huntId || !coords) return;
    let cancelled = false;
    const tick = async () => {
      try {
        await pingSquadLocation(huntId, coords.latitude, coords.longitude);
        const rows = await getSquadDistances(huntId);
        if (!cancelled) setSquadRows(rows);
        if (listenTarget?.id) {
          const outcome = await getSquadRaceOutcome({
            hunt_id: huntId,
            drop_id: listenTarget.id,
            ends_at: null,
          });
          if (!cancelled && outcome.finished && !outcome.youWon) {
            router.replace({
              pathname: '/moment/race-finish',
              params: {
                dropId: listenTarget.id,
                youWon: '0',
                winnerName: outcome.winnerName ?? undefined,
              },
            });
          }
        }
      } catch {
        // ignore
      }
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [huntId, coords?.latitude, coords?.longitude, listenTarget?.id, router]);

  const cycleFocus = () => {
    if (ranked.length < 2 || !tracked) return;
    const idx = ranked.findIndex((r) => r.drop.id === tracked.drop.id);
    const next = ranked[(idx + 1) % ranked.length];
    setFocusDropId(next.drop.id);
    trackEvent('discover_listen_another', { count: ranked.length });
  };

  // Hunt Copilot: 3 free escalating hints + a rewarded 4th (free when ad-free).
  // Failure toasts + leaves the retry line — never a dead button.
  const askHint = useCallback(async () => {
    if (!tracked || tracked.locked || hintLoading || rewarded.busy) return;
    const next = hintLevel + 1;
    if (next > 4) return;
    if (next === 4 && !adFree) {
      const earned = await rewarded.show().catch(() => false);
      if (!earned) return;
    }
    setHintLoading(true);
    try {
      const text = await fetchHuntHint({
        dropId: tracked.drop.id,
        dropType: tracked.drop.type,
        level: next,
        locale: locale === 'bn' ? 'bn' : 'en',
      });
      if (text) {
        setHintText(text);
        setHintLevel(next);
        setHintFailed(false);
        trackEvent('hint_asked', { drop_id: tracked.drop.id, level: next });
      } else {
        setHintFailed(true);
        const code = getLastNarratorError();
        toast(t('hintEmpty') + (__DEV__ && code ? ` [${code}]` : ''));
      }
    } finally {
      setHintLoading(false);
    }
  }, [tracked, tracked?.locked, hintLevel, hintLoading, locale, adFree, rewarded]);

  const openUnlock = (drop: NearbyDrop, distance: number) => {
    if (__DEV__) {
      setSimulationTarget({
        latitude: drop.latitude,
        longitude: drop.longitude,
      });
      setSimulationMode('found');
    }
    router.push({
      pathname: '/drop/found',
      params: {
        id: drop.id,
        type: drop.type,
        lat: String(drop.latitude),
        lng: String(drop.longitude),
        radius: String(drop.unlock_radius),
        ...(huntId ? { huntId } : {}),
      },
    });
    void distance;
  };

  if (locationError) {
    return (
      <Screen>
        <EmptyState
          title={t('locationUnavailable')}
          message="Please check your permission."
          actionLabel={t('close')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const countLabel = nearbyCount > 0 ? nearbyCount : ranked.length;

  const cardinalLabel =
    showCompass && heading != null && compassOffset != null
      ? `${compassToCardinal(heading + compassOffset)} · ${t('thisWay')}`
      : null;

  return (
    <Screen ambient="hero">
      <View style={styles.top}>
        <CloseButton label={t('close')} />
        {countLabel > 1 ? (
          <Text style={styles.countChip}>
            {countLabel} {t('waitingNearby')}
          </Text>
        ) : (
          <View />
        )}
      </View>

      <View style={styles.center}>
        {showSkeleton && !tracked ? (
          <DiscoverSkeleton />
        ) : fetchError && !tracked ? (
          <EmptyState
            title={t('networkError')}
            message={fetchError}
            actionLabel={t('retry')}
            onAction={() => loadCandidates(true)}
          />
        ) : !tracked ? (
          <EmptyState
            title={t('nothingNearby')}
            message={t('leaveFirst')}
            actionLabel={t('leaveDrop')}
            onAction={() => router.replace('/create')}
          />
        ) : (
          <FadeIn>
            <ProximityPulse
              distanceMeters={tracked.distance}
              found={Boolean(within)}
              locked={tracked.locked}
              size="lg"
              urgent={Boolean(within)}
              paused={!isFocused}
              compassOffset={compassOffset}
              compassLabel={cardinalLabel ?? t('thisWay')}
              intensity={
                tracked.distance <= 60 ? 'close' : tracked.distance <= 200 ? 'near' : 'far'
              }
              blips={blips}
              message={
                tracked.locked
                  ? formatUnlockCountdown(tracked.drop.unlock_at) ??
                    `Locked until ${new Date(tracked.drop.unlock_at!).toLocaleDateString()}`
                  : within
                    ? unlockablesHere.length > 1
                      ? t('severalHere')
                      : t('youFoundSomething')
                    : gpsSettling
                      ? t('gpsSettlingShort')
                      : t('somethingNearby')
              }
            />
          </FadeIn>
        )}
      </View>

      {squadRows.length > 0 ? (
        <View style={styles.squad}>
          <Text style={styles.squadTitle}>{t('squadNearby')}</Text>
          <Text style={styles.squadHint}>{t('squadRaceHint')}</Text>
          {squadRows.slice(0, 5).map((row) => (
            <View key={row.user_id} style={styles.squadPerson}>
              <Avatar
                uri={row.avatar_url}
                name={row.display_name || row.username}
                size="sm"
              />
              <Text style={styles.squadRow}>
                {row.display_name}
                {row.distance_m != null ? ` · ${formatDistance(row.distance_m)}` : ' · …'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.dock}>
        {coords?.accuracy != null ? (
          <Text style={styles.gpsMeta}>
            {gpsSettling
              ? `${t('gpsSettling')} (${formatAccuracy(coords.accuracy)}) — ${t('gpsWaitTighter')}`
              : `${t('gpsAccuracyAbout')} ${formatDistance(coords.accuracy)}`}
          </Text>
        ) : null}
        {!within && tracked && !tracked.locked ? (
          <Text style={styles.coach}>
            {gpsSettling ? t('stayStill') : t('walkUntilRing')}
          </Text>
        ) : null}

        {trend && !within && tracked && !tracked.locked ? (
          <Text style={trend === 'warmer' ? styles.warmer : styles.cooler}>
            {trend === 'warmer' ? t('warmer') : t('cooler')}
          </Text>
        ) : null}

        {within && unlockablesHere.length > 1 ? (
          <View style={styles.pickList}>
            <Text style={styles.pickTitle}>{t('severalHere')}</Text>
            {unlockablesHere.slice(0, 4).map((r) => (
              <Pressable
                key={r.drop.id}
                onPress={() => openUnlock(r.drop, r.distance)}
                style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.pickLabel}>
                  {typeLabel(r.drop.type)}
                </Text>
                <Text style={styles.pickDist}>{formatDistance(r.distance)}</Text>
              </Pressable>
            ))}
          </View>
        ) : within && tracked ? (
          <Button
            label={t('unlock')}
            onPress={() => openUnlock(tracked.drop, tracked.distance)}
          />
        ) : tracked?.locked ? (
          <Text style={styles.lockedNote}>
            {formatUnlockCountdown(tracked.drop.unlock_at) ?? t('timeCapsuleLocked')}
          </Text>
        ) : (
          <Text style={styles.hint}>{t('noMapPin')}</Text>
        )}

        {!within && tracked && !tracked.locked ? (
          <CopilotCard
            level={hintLevel}
            text={hintText}
            loading={hintLoading}
            busy={rewarded.busy}
            adFree={adFree}
            failed={hintFailed}
            onAsk={askHint}
          />
        ) : null}

        {ranked.length > 1 && !within ? (
          <SoftLink
            label={t('listenAnother')}
            onPress={cycleFocus}
            style={styles.listenBtn}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    top: {
      paddingHorizontal: 24,
      paddingTop: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    countChip: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 0.4,
      color: palette.accentBright,
      maxWidth: '58%',
      textAlign: 'right',
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    squad: {
      paddingHorizontal: layout.gutter,
      paddingBottom: 8,
      gap: 4,
    },
    squadTitle: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: palette.accent,
      marginBottom: 2,
    },
    squadHint: {
      fontFamily: typography.body,
      fontSize: 12,
      color: palette.textDim,
      marginBottom: 6,
    },
    squadRow: {
      flex: 1,
      fontFamily: typography.body,
      fontSize: 13,
      color: palette.textMuted,
    },
    squadPerson: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 4,
    },
    dock: {
      marginHorizontal: layout.gutter - 4,
      marginBottom: 10,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 14,
      minHeight: 104,
      justifyContent: 'center',
      gap: 8,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.borderStrong,
      backgroundColor: palette.bgElevated,
    },
    hint: {
      fontFamily: typography.body,
      fontSize: 14,
      lineHeight: 21,
      color: palette.textDim,
      textAlign: 'center',
    },
    coach: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      letterSpacing: 0.3,
      color: palette.accentBright,
      textAlign: 'center',
      marginBottom: 4,
    },
    lockedNote: {
      fontFamily: typography.body,
      fontSize: 14,
      color: palette.accentBright,
      textAlign: 'center',
    },
    gpsMeta: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: palette.textDim,
      textAlign: 'center',
    },
    listenBtn: {
      alignSelf: 'center',
    },
    warmer: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: palette.accent,
      textAlign: 'center',
    },
    cooler: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: palette.textDim,
      textAlign: 'center',
    },
    pickList: {
      gap: 6,
      marginBottom: 4,
    },
    pickTitle: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: palette.accent,
      textAlign: 'center',
      marginBottom: 4,
    },
    pickRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.borderStrong,
      borderRadius: radii.md,
      backgroundColor: palette.bgElevated,
    },
    pickLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      color: palette.text,
    },
    pickDist: {
      fontFamily: typography.body,
      fontSize: 13,
      color: palette.textMuted,
    },
  });
}
