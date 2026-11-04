import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { compareVersions } from '@/utils/version';

export { compareVersions };

const DISMISS_KEY = 'droq:updateDismissedVersion';

export type AppRelease = {
  latest_version: string;
  min_version: string;
  android_version_code: number;
  force_update: boolean;
  enabled: boolean;
  message: string | null;
  store_url_android: string;
  store_url_ios: string | null;
};

export type UpdateCheck = {
  available: boolean;
  force: boolean;
  release: AppRelease;
  installedVersion: string;
};

export function getInstalledVersion(): string {
  return (
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    '0.0.0'
  );
}

export function getInstalledAndroidVersionCode(): number | null {
  if (Platform.OS !== 'android') return null;
  const raw = Constants.expoConfig?.android?.versionCode;
  return typeof raw === 'number' ? raw : null;
}

export async function fetchAppRelease(): Promise<AppRelease | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('app_release')
    .select(
      'latest_version,min_version,android_version_code,force_update,enabled,message,store_url_android,store_url_ios',
    )
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return null;
  return data as AppRelease;
}

export async function checkForAppUpdate(): Promise<UpdateCheck | null> {
  const release = await fetchAppRelease();
  if (!release || !release.enabled) return null;

  const installedVersion = getInstalledVersion();
  const behindLatest = compareVersions(installedVersion, release.latest_version) < 0;
  const androidCode = getInstalledAndroidVersionCode();
  const behindCode =
    androidCode != null && androidCode < release.android_version_code;

  const available = behindLatest || behindCode;
  if (!available) return null;

  const belowMin = compareVersions(installedVersion, release.min_version) < 0;
  const force = release.force_update || belowMin;

  if (!force) {
    const dismissed = await AsyncStorage.getItem(DISMISS_KEY);
    if (dismissed === release.latest_version) return null;
  }

  return { available: true, force, release, installedVersion };
}

export async function dismissUpdatePrompt(latestVersion: string) {
  await AsyncStorage.setItem(DISMISS_KEY, latestVersion);
}

export function storeUrlForPlatform(release: AppRelease): string {
  if (Platform.OS === 'ios' && release.store_url_ios) return release.store_url_ios;
  return release.store_url_android;
}
