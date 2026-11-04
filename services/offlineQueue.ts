import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { OFFLINE_QUEUE_KEY } from '@/constants/config';
import { createDrop } from '@/services/drops';
import { uploadPhoto, uploadVideo, uploadVoice } from '@/services/media';
import { trackEvent } from '@/services/analytics';
import type { CreateDropInput, DropType } from '@/types/drop';

export type QueuedCreate = {
  id: string;
  createdAt: string;
  input: Omit<CreateDropInput, 'mediaPath'> & {
    localPhotoUri?: string | null;
    localVoiceUri?: string | null;
    localVideoUri?: string | null;
  };
  attempts: number;
  lastError?: string;
};

async function readQueue(): Promise<QueuedCreate[]> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedCreate[];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedCreate[]) {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
}

export async function getOfflineQueue(): Promise<QueuedCreate[]> {
  return readQueue();
}

export async function enqueueCreateDrop(
  input: QueuedCreate['input'],
): Promise<QueuedCreate> {
  const item: QueuedCreate = {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    input,
    attempts: 0,
  };
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
  await trackEvent('offline_enqueue', { type: input.type });
  return item;
}

async function uploadLocalMedia(item: QueuedCreate): Promise<string | undefined> {
  const { type, localPhotoUri, localVoiceUri, localVideoUri } = item.input;
  if (type === 'photo' && localPhotoUri) return uploadPhoto(localPhotoUri);
  if (type === 'voice' && localVoiceUri) return uploadVoice(localVoiceUri);
  if (type === 'video' && localVideoUri) return uploadVideo(localVideoUri);
  return undefined;
}

export async function flushOfflineQueue(): Promise<{ flushed: number; remaining: number }> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) return { flushed: 0, remaining: (await readQueue()).length };

  const queue = await readQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  const remaining: QueuedCreate[] = [];
  let flushed = 0;

  for (const item of queue) {
    try {
      const mediaPath = await uploadLocalMedia(item);
      const { localPhotoUri, localVoiceUri, localVideoUri, ...rest } = item.input;
      await createDrop({ ...rest, mediaPath });
      flushed += 1;
      await trackEvent('offline_flush_success', { type: item.input.type });
    } catch (e) {
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: e instanceof Error ? e.message : 'Upload failed',
      });
      await trackEvent('offline_flush_fail', {
        type: item.input.type,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }

  await writeQueue(remaining);
  return { flushed, remaining: remaining.length };
}

export function startOfflineQueueWatcher(onChange?: (remaining: number) => void) {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      flushOfflineQueue()
        .then((r) => onChange?.(r.remaining))
        .catch(() => undefined);
    }
  });
}

export function needsMediaUpload(type: DropType): boolean {
  return type === 'photo' || type === 'voice' || type === 'video';
}
