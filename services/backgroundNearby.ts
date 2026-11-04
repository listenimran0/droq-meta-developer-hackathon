import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getNearbyDrops } from '@/services/drops';
import {
  getNearbyAlertsEnabled,
  recordNearbyDropNotice,
} from '@/services/notifications';
import {
  calculateDistance,
  formatDistance,
  isDropTimeLocked,
  NEARBY_NOTIFY_RADIUS_M,
} from '@/utils/location';

export const NEARBY_BG_TASK = 'DROQ_NEARBY_BACKGROUND';

TaskManager.defineTask(NEARBY_BG_TASK, async ({ data, error }) => {
  if (error || !data || !isSupabaseConfigured) return;
  try {
    if (!(await getNearbyAlertsEnabled())) return;

    const { locations } = data as { locations: Location.LocationObject[] };
    const latest = locations?.[locations.length - 1];
    if (!latest) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const drops = await getNearbyDrops(
      latest.coords.latitude,
      latest.coords.longitude,
      Math.min(1000, 400),
    );
    if (!drops.length) return;

    const ranked = drops
      .filter((d) => !isDropTimeLocked(d.unlock_at))
      .map((d) => ({
        ...d,
        distance: calculateDistance(
          latest.coords.latitude,
          latest.coords.longitude,
          d.latitude,
          d.longitude,
        ),
      }))
      .sort((a, b) => a.distance - b.distance);

    const closest = ranked[0];
    if (!closest || closest.distance > NEARBY_NOTIFY_RADIUS_M) return;

    await recordNearbyDropNotice(
      closest.id,
      formatDistance(closest.distance),
      ranked.length,
    );
  } catch {
    // never crash the background task
  }
});

export async function startBackgroundNearbyAlerts(): Promise<boolean> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;

    // Missing ACCESS_BACKGROUND_LOCATION in a stale native build throws — soft-fail.
    let bg: Location.PermissionResponse;
    try {
      bg = await Location.requestBackgroundPermissionsAsync();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/ACCESS_BACKGROUND_LOCATION|AndroidManifest/i.test(msg)) {
        console.warn(
          '[DROQ] Background location permission missing from native build. Rebuild the app.',
        );
        return false;
      }
      throw e;
    }
    if (bg.status !== 'granted') return false;

    const started = await Location.hasStartedLocationUpdatesAsync(NEARBY_BG_TASK).catch(
      () => false,
    );
    if (started) return true;

    await Location.startLocationUpdatesAsync(NEARBY_BG_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5 * 60 * 1000,
      distanceInterval: 75,
      deferredUpdatesInterval: 5 * 60 * 1000,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'DROQ',
        notificationBody: 'Listening for nearby Drops…',
        notificationColor: '#F2E4BE',
      },
    });
    return true;
  } catch (e) {
    console.warn('[DROQ] startBackgroundNearbyAlerts failed', e);
    return false;
  }
}

export async function stopBackgroundNearbyAlerts(): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(NEARBY_BG_TASK).catch(
      () => false,
    );
    if (started) await Location.stopLocationUpdatesAsync(NEARBY_BG_TASK);
  } catch {
    // ignore
  }
}

export async function isBackgroundNearbyAlertsRunning(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(NEARBY_BG_TASK).catch(() => false);
}
