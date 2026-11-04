/** Earth radius in meters */
const EARTH_RADIUS_M = 6_371_000;

/** Minimum GPS buffer so phone jitter doesn’t hide same-spot unlocks */
export const MIN_GPS_BUFFER_M = 20;
/** Cap so spoofed “huge accuracy” can’t unlock from far away */
export const MAX_GPS_BUFFER_M = 60;
/** Refuse to plant a Drop when fix is worse than this */
export const MAX_CREATE_ACCURACY_M = 65;
/** Soft-block unlock settle when GPS is worse than this (city mid-range) */
export const MAX_UNLOCK_SETTLE_ACCURACY_M = 90;
/** Alert when something is this close (before unlock radius) */
export const NEARBY_NOTIFY_RADIUS_M = 200;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance between two WGS84 coordinates, in meters.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (![lat1, lon1, lat2, lon2].every((n) => Number.isFinite(n))) {
    throw new Error('Invalid coordinates');
  }
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) {
    throw new Error('Latitude out of range');
  }
  if (lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) {
    throw new Error('Longitude out of range');
  }

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Effective unlock allowance = drop radius + GPS uncertainty buffer.
 * Two phones at the “same spot” often disagree by 15–40m — without this, real users miss Drops.
 */
export function gpsUnlockBuffer(accuracyMeters?: number | null): number {
  const raw = accuracyMeters == null || !Number.isFinite(accuracyMeters) ? 30 : accuracyMeters;
  return Math.min(MAX_GPS_BUFFER_M, Math.max(MIN_GPS_BUFFER_M, raw));
}

export function effectiveUnlockRadius(
  unlockRadiusMeters: number,
  accuracyMeters?: number | null,
): number {
  return unlockRadiusMeters + gpsUnlockBuffer(accuracyMeters);
}

export function isWithinRadius(distanceMeters: number, radiusMeters: number): boolean {
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(radiusMeters)) {
    return false;
  }
  if (radiusMeters < 0) return false;
  return distanceMeters <= radiusMeters;
}

/** Client-side unlock gate — must stay aligned with server unlock_drop buffer logic */
export function canUnlockAtDistance(
  distanceMeters: number,
  unlockRadiusMeters: number,
  accuracyMeters?: number | null,
): boolean {
  return isWithinRadius(
    distanceMeters,
    effectiveUnlockRadius(unlockRadiusMeters, accuracyMeters),
  );
}

export function isAccuracyGoodEnoughToCreate(accuracyMeters?: number | null): boolean {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters)) return true; // emulator may omit
  return accuracyMeters <= MAX_CREATE_ACCURACY_M;
}

/**
 * When reported GPS error is larger than the Drop’s unlock radius,
 * “close enough” is unreliable — wait for a better fix before offering Unlock.
 */
export function isGpsSettlingForUnlock(
  accuracyMeters: number | null | undefined,
  unlockRadiusMeters: number,
): boolean {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters)) return false;
  if (!Number.isFinite(unlockRadiusMeters) || unlockRadiusMeters <= 0) return false;
  return accuracyMeters > unlockRadiusMeters;
}

export function isAccuracyGoodEnoughToUnlock(accuracyMeters?: number | null): boolean {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters)) return true;
  return accuracyMeters <= MAX_UNLOCK_SETTLE_ACCURACY_M;
}

/** Approximate bounding box for a radius in meters (MVP; PostGIS later). */
export function getBoundingBox(
  latitude: number,
  longitude: number,
  radiusMeters: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.cos(toRad(latitude)));
  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLng: longitude - lngDelta,
    maxLng: longitude + lngDelta,
  };
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1) return '<1m';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Coarse distance buckets for non-focus nearby signals.
 * Avoids leaking precise pins while still conveying “how far-ish”.
 */
export function formatDistanceBucket(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 75) return '~50m';
  if (meters < 150) return '~100m';
  if (meters < 300) return '~200m';
  if (meters < 650) return '~500m';
  if (meters < 1000) return '~800m';
  return 'far';
}

export function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

/** Relative turn from device heading to target bearing (−180…180). */
export function relativeBearing(headingDeg: number, targetBearingDeg: number): number {
  let diff = targetBearingDeg - headingDeg;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

/** Show compass hint when close but not yet unlockable */
export const COMPASS_HINT_RADIUS_M = 150;

export function formatAccuracy(accuracyMeters?: number | null): string {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters)) return '…';
  return `±${Math.round(accuracyMeters)}m`;
}

export function isDropTimeLocked(unlockAt: string | null | undefined, now = new Date()): boolean {
  if (!unlockAt) return false;
  return new Date(unlockAt).getTime() > now.getTime();
}

export function isDropExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function isDropDiscoverable(params: {
  unlockAt: string | null | undefined;
  expiresAt: string | null | undefined;
  status?: string;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  if (params.status && params.status !== 'active') return false;
  if (isDropTimeLocked(params.unlockAt, now)) return false;
  if (isDropExpired(params.expiresAt, now)) return false;
  return true;
}
