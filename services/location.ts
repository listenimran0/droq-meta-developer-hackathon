import * as Location from 'expo-location';
import {
  MAX_CREATE_ACCURACY_M,
  MAX_UNLOCK_SETTLE_ACCURACY_M,
} from '@/utils/location';
import type { Coordinates } from '@/types/drop';
import { LOCATION_DISTANCE_M, LOCATION_REFRESH_MS } from '@/constants/config';

export type LocationPermissionState = 'undetermined' | 'granted' | 'denied';

export async function requestLocationPermission(): Promise<LocationPermissionState> {
  const { status: existing } = await Location.getForegroundPermissionsAsync();
  if (existing === 'granted') return 'granted';
  if (existing === 'denied') {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

function toCoords(position: Location.LocationObject): Coordinates {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
}

/**
 * High-accuracy fix for discovering / unlocking.
 * Balanced GPS is often ±30–50m — too coarse for 25–40m Drop radii.
 */
export async function getCurrentCoordinates(): Promise<Coordinates> {
  const permission = await requestLocationPermission();
  if (permission !== 'granted') {
    throw new Error('Location permission is required to discover Drops.');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
    mayShowUserSettingsDialog: true,
  });

  return toCoords(position);
}

async function sampleBestCoordinates(
  maxAccuracyM: number,
  attempts: number,
  permissionError: string,
  hint?: Coordinates | null,
): Promise<Coordinates> {
  const permission = await requestLocationPermission();
  if (permission !== 'granted') {
    throw new Error(permissionError);
  }

  // Reuse a fresh watch fix when already good enough — skips multi-sample radio work.
  if (
    hint?.accuracy != null &&
    hint.accuracy <= maxAccuracyM &&
    Number.isFinite(hint.latitude) &&
    Number.isFinite(hint.longitude)
  ) {
    return hint;
  }

  let best: Coordinates | null = hint ?? null;
  const start = hint?.accuracy != null && hint.accuracy <= maxAccuracyM * 1.4 ? 1 : 0;

  for (let i = start; i < attempts; i++) {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
      mayShowUserSettingsDialog: true,
    });
    const coords = toCoords(position);
    if (
      !best ||
      (coords.accuracy != null &&
        (best.accuracy == null || coords.accuracy < best.accuracy))
    ) {
      best = coords;
    }
    if (coords.accuracy == null || coords.accuracy <= maxAccuracyM) {
      return coords;
    }
    await new Promise((r) => setTimeout(r, 700));
  }

  if (!best) throw new Error('Couldn’t get a clear location. Move outdoors and try again.');
  if (best.accuracy != null && best.accuracy > maxAccuracyM) {
    throw new Error(
      `Location isn’t accurate enough yet (±${Math.round(best.accuracy)}m). Step outside, wait a moment, then try again.`,
    );
  }
  return best;
}

/**
 * Wait for a fix good enough to plant a Drop so two people at the same spot share the pin.
 */
export async function getReliableCoordinatesForCreate(
  maxAccuracyM: number = MAX_CREATE_ACCURACY_M,
  attempts = 4,
): Promise<Coordinates> {
  return sampleBestCoordinates(
    maxAccuracyM,
    attempts,
    'Location permission is required to leave a Drop.',
  );
}

/**
 * Multi-sample BestForNavigation fix before unlock — looser than create so mid-city unlocks still work.
 * Pass the latest watched coords as `hint` to skip sampling when accuracy is already good.
 */
export async function getReliableCoordinatesForUnlock(
  maxAccuracyM: number = MAX_UNLOCK_SETTLE_ACCURACY_M,
  attempts = 3,
  hint?: Coordinates | null,
): Promise<Coordinates> {
  return sampleBestCoordinates(
    maxAccuracyM,
    attempts,
    'Location permission is required to unlock Drops.',
    hint,
  );
}

/**
 * Continuous watch for Home / Discover — High (not BestForNavigation) to save battery
 * while staying accurate enough for proximity UI.
 */
export function watchCoordinates(
  onUpdate: (coords: Coordinates) => void,
  onError?: (error: Error) => void,
): { remove: () => void } {
  let subscription: Location.LocationSubscription | null = null;
  let cancelled = false;

  (async () => {
    try {
      const permission = await requestLocationPermission();
      if (permission !== 'granted') {
        onError?.(new Error('Location permission is needed. Turn it on in Settings.'));
        return;
      }
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: LOCATION_REFRESH_MS,
          distanceInterval: LOCATION_DISTANCE_M,
          mayShowUserSettingsDialog: true,
        },
        (position) => {
          if (cancelled) return;
          onUpdate(toCoords(position));
        },
      );
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error('Location unavailable'));
    }
  })();

  return {
    remove: () => {
      cancelled = true;
      subscription?.remove();
    },
  };
}
