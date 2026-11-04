import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@droq/ad_free_until';

let until = 0;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<(adFree: boolean) => void>();

function snapshot(): boolean {
  return until > Date.now();
}

function emit(): void {
  for (const listener of [...listeners]) listener(snapshot());
}

function hydrate(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > Date.now()) until = parsed;
        hydrated = true;
        emit();
      })
      .catch(() => {
        hydrated = true;
      });
  }
  return hydratePromise;
}

/** True while a rewarded ad (or anything else) has removed ads temporarily. */
export function isAdFree(): boolean {
  return snapshot();
}

export function adFreeRemainingMs(): number {
  return Math.max(0, until - Date.now());
}

/** Extend (never shrink) the ad-free window by `ms` from now. */
export async function grantAdFree(ms: number): Promise<void> {
  await hydrate();
  until = Math.max(until, Date.now() + ms);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(until));
  } catch {
    // Preference only — losing it costs the user nothing but an ad.
  }
  emit();
}

/** Dev/testing only — drop the ad-free window immediately. */
export async function clearAdFree(): Promise<void> {
  await hydrate();
  until = 0;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — in-memory clear already did the job.
  }
  emit();
}

/** Subscribe to ad-free changes; fires once immediately after hydration. */
export function subscribeAdFree(listener: (adFree: boolean) => void): () => void {
  listeners.add(listener);
  void hydrate().then(() => listener(snapshot()));
  return () => {
    listeners.delete(listener);
  };
}
