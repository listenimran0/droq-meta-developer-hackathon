import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { calculateDistance } from '@/utils/location';

function requireConfigured() {
  if (!isSupabaseConfigured) throw new Error('Something went wrong. Please try again.');
}

export type PlaceChallenge = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  center_lat: number;
  center_lng: number;
  radius_m: number;
  goal_count: number;
  found_count: number;
  complete: boolean;
};

export async function listMyPlaceChallenges(): Promise<PlaceChallenge[]> {
  requireConfigured();
  const { data, error } = await supabase.rpc('get_my_place_challenges');
  if (error) throw error;
  return (data ?? []) as PlaceChallenge[];
}

/** Pick the challenge the user is standing in, else the nearest incomplete one. */
export function pickRelevantChallenge(
  challenges: PlaceChallenge[],
  lat?: number | null,
  lng?: number | null,
): PlaceChallenge | null {
  if (challenges.length === 0) return null;
  const incomplete = challenges.filter((c) => !c.complete);
  const pool = incomplete.length > 0 ? incomplete : challenges;

  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return pool[0] ?? null;
  }

  const inside = pool
    .map((c) => ({
      c,
      d: calculateDistance(lat, lng, c.center_lat, c.center_lng),
    }))
    .filter((x) => x.d <= x.c.radius_m)
    .sort((a, b) => a.d - b.d);

  if (inside[0]) return inside[0].c;

  return pool
    .map((c) => ({
      c,
      d: calculateDistance(lat, lng, c.center_lat, c.center_lng),
    }))
    .sort((a, b) => a.d - b.d)[0]?.c ?? null;
}
