import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  getNearbyAlertsEnabled,
  setNearbyAlertsEnabled,
} from '@/lib/nearbyAlertsPref';
import type { AppNotification } from '@/types/drop';

const LOCAL_NEARBY_COOLDOWN_MS = 45 * 60 * 1000; // one local push per drop / 45m
/** Global OS banner throttle — stops spam in dense 1km zones */
const LOCAL_NEARBY_GLOBAL_COOLDOWN_MS = 30 * 60 * 1000;
const LOCAL_NEARBY_KEY = 'droq:nearbyLocalPush:v1';
const LOCAL_NEARBY_GLOBAL_KEY = '__global__';
const LOCAL_NEARBY_DENSE_KEY = '__dense__';
/** Use aggregated “several nearby” copy when count exceeds this */
export const DENSE_NOTIFY_THRESHOLD = 3;

export { getNearbyAlertsEnabled, setNearbyAlertsEnabled };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function requireSupabase() {
  if (!isSupabaseConfigured) throw new Error('Something went wrong. Please try again.');
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function getNotificationPermissionGranted(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return Boolean(current.granted);
}

async function ensureNearbyChannel() {
  if (Platform.OS !== 'android') return;
  // Channel id bumped once — Android freezes sound after first create.
  await Notifications.setNotificationChannelAsync('nearby_v2', {
    name: 'Nearby Drops',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 120, 250],
    enableVibrate: true,
  });
}

async function ensureSocialChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('social_v2', {
    name: 'Friends & finds',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 220, 100, 220],
    enableVibrate: true,
  });
}

export async function registerPushToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  const granted = await ensureNotificationPermissions();
  if (!granted) return null;

  await ensureNearbyChannel();
  await ensureSocialChannel();

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined;

  let token: string | null = null;
  try {
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = result.data;
  } catch {
    // Expo Go / missing projectId — still allow local notifications
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !token) return token;

  await supabase.from('user_push_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' },
  );

  return token;
}

export async function notifyLocalNearby(title: string, body: string, dropId?: string) {
  if (!(await getNearbyAlertsEnabled())) return;
  const granted = await getNotificationPermissionGranted();
  if (!granted) return;

  await ensureNearbyChannel();

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: dropId ? { drop_id: dropId, kind: 'nearby_drop' } : { kind: 'nearby_drop' },
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: 'nearby_v2' } : null),
    },
    trigger: null,
  });
}

/** Shared FG/BG throttle — per key + global 30m cap so dense zones don’t spam. */
export async function shouldFireLocalNearby(dropId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_NEARBY_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    const globalLast = map[LOCAL_NEARBY_GLOBAL_KEY] ?? 0;
    if (now - globalLast < LOCAL_NEARBY_GLOBAL_COOLDOWN_MS) return false;
    const last = map[dropId] ?? 0;
    if (now - last < LOCAL_NEARBY_COOLDOWN_MS) return false;
    map[dropId] = now;
    map[LOCAL_NEARBY_GLOBAL_KEY] = now;
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 40);
    await AsyncStorage.setItem(LOCAL_NEARBY_KEY, JSON.stringify(Object.fromEntries(entries)));
    return true;
  } catch {
    return true;
  }
}

export async function listNotifications(limit = 40, offset = 0): Promise<AppNotification[]> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  // Opportunistic hygiene when opening the feed (ignore if RPC unavailable)
  {
    await supabase.rpc('purge_my_notifications');
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  requireSupabase();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<number> {
  requireSupabase();
  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function clearReadNotifications(): Promise<number> {
  requireSupabase();
  const { data, error } = await supabase.rpc('clear_read_notifications');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function deleteNotification(id: string): Promise<void> {
  requireSupabase();
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}

export async function unreadNotificationCount(): Promise<number> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Smart nearby notice: upserts one unread row per drop (DB),
 * and throttles OS banner so GPS polling doesn’t spam.
 * When many Drops are nearby, uses one dense banner instead of per-drop spam.
 */
export async function recordNearbyDropNotice(
  dropId: string,
  distanceLabel: string,
  nearbyCount = 1,
) {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (!(await getNearbyAlertsEnabled())) return;

  const dense = nearbyCount >= DENSE_NOTIFY_THRESHOLD;
  const pushKey = dense ? LOCAL_NEARBY_DENSE_KEY : dropId;

  const { error } = await supabase.rpc('record_nearby_notification', {
    p_drop_id: dropId,
    p_distance_label: distanceLabel,
  });
  if (error) throw error;

  if (await shouldFireLocalNearby(pushKey)) {
    try {
      if (dense) {
        await notifyLocalNearby(
          'Several things are nearby',
          `${nearbyCount} waiting within walking distance. Open Discover.`,
          dropId,
        );
      } else {
        await notifyLocalNearby(
          'Something is waiting nearby',
          `Within ${distanceLabel}. Open Discover.`,
          dropId,
        );
      }
    } catch {
      // Don't leave cooldown stuck if schedule failed — best-effort only
    }
  }
}
