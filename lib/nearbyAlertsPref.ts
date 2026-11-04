import AsyncStorage from '@react-native-async-storage/async-storage';

const ALERTS_PREF_KEY = 'droq:nearbyAlertsEnabled';

/** User preference for nearby OS banners (independent of OS permission). Default on. */
export async function getNearbyAlertsEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ALERTS_PREF_KEY);
    if (raw == null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

export async function setNearbyAlertsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ALERTS_PREF_KEY, enabled ? '1' : '0');
}
