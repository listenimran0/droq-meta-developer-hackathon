import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Drop } from '@/types/drop';

const CACHE_PREFIX = 'drop.discovered.';

/** Minimal offline cache for already-unlocked Drop content */
export async function cacheDiscoveredDrop(drop: Drop): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CACHE_PREFIX}${drop.id}`, JSON.stringify(drop));
  } catch {
    // best-effort
  }
}

export async function getCachedDiscoveredDrop(id: string): Promise<Drop | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as Drop;
  } catch {
    return null;
  }
}
