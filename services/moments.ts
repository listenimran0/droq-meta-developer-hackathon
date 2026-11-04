import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getMyCreatedDrops, getNearbyDrops } from '@/services/drops';
import { getSquadDistances, type MySquadHunt } from '@/services/squad';
import type { DropType, NearbyDrop } from '@/types/drop';
import { calculateDistance, isDropTimeLocked } from '@/utils/location';

function requireConfigured() {
  if (!isSupabaseConfigured) throw new Error('Something went wrong. Please try again.');
}

const OPENING_SOON_MS = 7 * 24 * 60 * 60 * 1000;
const CELEBRATE_KEY = (id: string) => `droq:celebrate:challenge:${id}`;

export type OpeningSoon = {
  id: string;
  unlock_at: string;
  type: DropType;
  source: 'mine' | 'nearby';
  latitude?: number;
  longitude?: number;
};

/** Time capsules opening within 7 days — yours or nearby. */
export async function listOpeningSoon(lat?: number, lng?: number): Promise<OpeningSoon[]> {
  requireConfigured();
  const now = Date.now();
  const horizon = now + OPENING_SOON_MS;
  const out: OpeningSoon[] = [];
  const seen = new Set<string>();

  const mine = await getMyCreatedDrops(40, 0).catch(() => [] as Awaited<ReturnType<typeof getMyCreatedDrops>>);
  for (const d of mine) {
    if (!d.unlock_at || !isDropTimeLocked(d.unlock_at)) continue;
    const t = new Date(d.unlock_at).getTime();
    if (!Number.isFinite(t) || t > horizon) continue;
    seen.add(d.id);
    out.push({
      id: d.id,
      unlock_at: d.unlock_at,
      type: d.type,
      source: 'mine',
      latitude: d.latitude,
      longitude: d.longitude,
    });
  }

  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    const nearby = await getNearbyDrops(lat, lng).catch(() => [] as NearbyDrop[]);
    for (const d of nearby) {
      if (seen.has(d.id) || !d.unlock_at || !isDropTimeLocked(d.unlock_at)) continue;
      const t = new Date(d.unlock_at).getTime();
      if (!Number.isFinite(t) || t > horizon) continue;
      seen.add(d.id);
      out.push({
        id: d.id,
        unlock_at: d.unlock_at,
        type: d.type,
        source: 'nearby',
        latitude: d.latitude,
        longitude: d.longitude,
      });
    }
  }

  return out.sort(
    (a, b) => new Date(a.unlock_at).getTime() - new Date(b.unlock_at).getTime(),
  );
}

export type SquadRaceOutcome = {
  finished: boolean;
  youWon: boolean;
  winnerId: string | null;
  winnerName: string | null;
  unlockedCount: number;
  endsAt: string | null;
};

/** First squad member to unlock the race Drop wins. */
export async function getSquadRaceOutcome(
  hunt: Pick<MySquadHunt, 'hunt_id' | 'drop_id' | 'ends_at'>,
): Promise<SquadRaceOutcome> {
  requireConfigured();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const rows = await getSquadDistances(hunt.hunt_id).catch(() => []);
  const memberIds = rows.map((r) => r.user_id);
  if (memberIds.length === 0) {
    return {
      finished: false,
      youWon: false,
      winnerId: null,
      winnerName: null,
      unlockedCount: 0,
      endsAt: hunt.ends_at,
    };
  }

  const { data, error } = await supabase
    .from('drop_discoveries')
    .select('user_id, discovered_at')
    .eq('drop_id', hunt.drop_id)
    .in('user_id', memberIds)
    .order('discovered_at', { ascending: true });

  if (error) throw error;
  const unlocks = data ?? [];
  const first = unlocks[0];
  if (!first) {
    return {
      finished: false,
      youWon: false,
      winnerId: null,
      winnerName: null,
      unlockedCount: 0,
      endsAt: hunt.ends_at,
    };
  }

  const winnerRow = rows.find((r) => r.user_id === first.user_id);
  return {
    finished: true,
    youWon: first.user_id === user.id,
    winnerId: first.user_id,
    winnerName: winnerRow?.display_name || winnerRow?.username || 'A walker',
    unlockedCount: unlocks.length,
    endsAt: hunt.ends_at,
  };
}

export type TrailPassportItem = {
  discoveryId: string;
  dropId: string;
  title: string;
  type: DropType;
  nextDropId: string | null;
  chainHint: string | null;
  humanChainRootId: string | null;
  discoveredAt: string;
};

/** Found drops that still have a trail to continue. */
export async function listTrailPassport(limit = 20): Promise<TrailPassportItem[]> {
  requireConfigured();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('drop_discoveries')
    .select(
      'id, drop_id, discovered_at, drops(id, type, title, next_drop_id, chain_hint, human_chain_root_id)',
    )
    .eq('user_id', user.id)
    .order('discovered_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    drop_id: string;
    discovered_at: string;
    drops: {
      id: string;
      type: DropType;
      title: string | null;
      next_drop_id: string | null;
      chain_hint: string | null;
      human_chain_root_id: string | null;
    } | null;
  }>;

  return rows
    .filter((r) => {
      const d = r.drops;
      if (!d) return false;
      return Boolean(d.next_drop_id || d.chain_hint || d.human_chain_root_id);
    })
    .map((r) => ({
      discoveryId: r.id,
      dropId: r.drops!.id,
      title: r.drops!.title?.trim() || 'Trail stop',
      type: r.drops!.type,
      nextDropId: r.drops!.next_drop_id,
      chainHint: r.drops!.chain_hint,
      humanChainRootId: r.drops!.human_chain_root_id,
      discoveredAt: r.discovered_at,
    }));
}

export async function shouldCelebrateChallenge(challengeId: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(CELEBRATE_KEY(challengeId));
  return !v;
}

export async function markChallengeCelebrated(challengeId: string): Promise<void> {
  await AsyncStorage.setItem(CELEBRATE_KEY(challengeId), '1');
}

export function isInsideChallenge(
  challenge: { center_lat: number; center_lng: number; radius_m: number },
  lat?: number | null,
  lng?: number | null,
): boolean {
  if (lat == null || lng == null) return false;
  return (
    calculateDistance(lat, lng, challenge.center_lat, challenge.center_lng) <=
    challenge.radius_m
  );
}
