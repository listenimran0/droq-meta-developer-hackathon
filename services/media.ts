import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  PHOTO_COMPRESS_QUALITY,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_WIDTH,
  VIDEO_MAX_BYTES,
} from '@/constants/config';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const BUCKET = 'drop-media';

async function ensureConfigured() {
  if (!isSupabaseConfigured) throw new Error('Something went wrong. Please try again.');
}

function extensionFromUri(uri: string, fallback: string): string {
  const clean = uri.split('?')[0] ?? uri;
  const parts = clean.split('.');
  const ext = parts[parts.length - 1]?.toLowerCase();
  if (!ext || ext.length > 5) return fallback;
  return ext;
}

/**
 * Compress on-device before upload. Never upload original camera images.
 */
export async function compressPhoto(uri: string): Promise<{ uri: string; mimeType: string }> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: PHOTO_MAX_WIDTH } }],
    {
      compress: PHOTO_COMPRESS_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  const info = await FileSystem.getInfoAsync(result.uri);
  if (info.exists && 'size' in info && typeof info.size === 'number' && info.size > PHOTO_MAX_BYTES) {
    const tighter = await ImageManipulator.manipulateAsync(
      result.uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG },
    );
    return { uri: tighter.uri, mimeType: 'image/jpeg' };
  }

  return { uri: result.uri, mimeType: 'image/jpeg' };
}

async function uploadFile(
  localUri: string,
  folder: 'photos' | 'voice' | 'videos',
  mimeType: string,
  ext: string,
): Promise<string> {
  await ensureConfigured();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const path = `${user.id}/${folder}/${Date.now()}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const { error } = await supabase.storage.from(BUCKET).upload(path, binary, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function uploadPhoto(localUri: string): Promise<string> {
  const compressed = await compressPhoto(localUri);
  return uploadFile(compressed.uri, 'photos', compressed.mimeType, 'jpg');
}

export async function uploadVoice(localUri: string): Promise<string> {
  const ext = extensionFromUri(localUri, 'm4a');
  const mime =
    ext === 'wav'
      ? 'audio/wav'
      : ext === 'mp3'
        ? 'audio/mpeg'
        : 'audio/mp4';
  return uploadFile(localUri, 'voice', mime, ext);
}

/**
 * Strict video upload — reject oversized clips before upload.
 */
export async function uploadVideo(localUri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(localUri);
  if (info.exists && 'size' in info && typeof info.size === 'number' && info.size > VIDEO_MAX_BYTES) {
    throw new Error('Video is too large. Keep it under 8MB and 15 seconds.');
  }
  const ext = extensionFromUri(localUri, 'mp4');
  const mime = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  return uploadFile(localUri, 'videos', mime, ext);
}

export async function uploadAvatar(localUri: string): Promise<string> {
  const compressed = await compressPhoto(localUri);
  return uploadFile(compressed.uri, 'photos', compressed.mimeType, 'jpg');
}

export async function getMediaUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  // Google / external avatars are already absolute URLs
  if (/^https?:\/\//i.test(path)) return path;
  await ensureConfigured();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
