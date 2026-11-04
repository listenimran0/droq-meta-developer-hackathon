import { calculateDistance } from '@/utils/location';

const MIN_INTERVAL_MS = 10_000;
const MIN_MOVE_M = 28;

type Stamp = { at: number; lat: number; lng: number };

/**
 * Throttle nearby RPC refreshes so GPS ticks don’t hammer the network.
 * Returns true when a fetch should run.
 */
export function shouldRefreshNearby(
  stamp: Stamp | null,
  lat: number,
  lng: number,
  now = Date.now(),
): boolean {
  if (!stamp) return true;
  if (now - stamp.at >= MIN_INTERVAL_MS) return true;
  try {
    return calculateDistance(stamp.lat, stamp.lng, lat, lng) >= MIN_MOVE_M;
  } catch {
    return true;
  }
}

export function stampNearby(lat: number, lng: number, now = Date.now()): Stamp {
  return { at: now, lat, lng };
}
