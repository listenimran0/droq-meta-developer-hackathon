import type { DropType } from '@/types/drop';

export const NEARBY_RADIUS_M = 1000;
/** Max candidates returned for Discover focus cycling */
export const NEARBY_FETCH_LIMIT = 20;
/** Show dense / multi-signal UI when at least this many are waiting */
export const DENSE_NEARBY_THRESHOLD = 2;
/** Default unlock — phone GPS noise makes 10m unreliable in cities */
export const DEFAULT_UNLOCK_RADIUS_M = 40;
export const UNLOCK_RADIUS_OPTIONS = [25, 40, 75] as const;

export const PHOTO_MAX_WIDTH = 1600;
export const PHOTO_COMPRESS_QUALITY = 0.7;
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export const VOICE_MAX_DURATION_MS = 30_000;

/** Strict video limits — short clips only */
export const VIDEO_ENABLED = true;
export const VIDEO_MAX_DURATION_MS = 15_000;
export const VIDEO_MAX_BYTES = 8 * 1024 * 1024;

/** GPS watch cadence — Balanced accuracy; Discover still feels live without burning radio. */
export const LOCATION_REFRESH_MS = 5_000;
export const LOCATION_DISTANCE_M = 10;
/** Skip JS state updates for tiny GPS jitter */
export const LOCATION_DEBOUNCE_MS = 900;
/** Compass: ignore sub-degree noise */
export const HEADING_MIN_DELTA_DEG = 4;
export const HEADING_MIN_INTERVAL_MS = 160;

export const REPORT_RATE_LIMIT_MS = 60_000;
export const MAX_REPORTS_PER_HOUR = 5;

export const MVP_DROP_TYPES: DropType[] = [
  'memory',
  'message',
  'photo',
  'voice',
  'video',
  'puzzle',
  'challenge',
  'secret',
  'time_capsule',
];

export const DROP_TYPE_LABELS: Record<DropType, string> = {
  memory: 'Memory',
  message: 'Message',
  photo: 'Photo',
  voice: 'Voice',
  video: 'Video',
  puzzle: 'Puzzle',
  challenge: 'Evolving',
  secret: 'Secret',
  time_capsule: 'Time Capsule',
};

export const DROP_TYPE_HINTS: Partial<Record<DropType, string>> = {
  memory: 'A note for whoever stands here later',
  message: 'Say something short to a stranger',
  photo: 'A picture only this place can open',
  voice: 'Up to 30 seconds of audio',
  video: 'Max 15 seconds — keep it short',
  puzzle: 'Leave a clue — they need the answer to unlock',
  challenge: 'Others can add to it after they find it',
  secret: 'Tiny radius — they must be right on top of it',
  time_capsule: 'Sealed until a future unlock date',
};

export const VISIBILITY_OPTIONS: {
  value: 'public' | 'friends' | 'direct' | 'private';
  label: string;
  hint: string;
}[] = [
  { value: 'public', label: 'Public', hint: 'Anyone nearby can find it' },
  { value: 'friends', label: 'Friends only', hint: 'Only people you’ve added' },
  { value: 'direct', label: 'One friend', hint: 'Only one person you choose' },
  { value: 'private', label: 'Private', hint: 'Only you — open it from Drops you left' },
];

export const GHOST_UNLOCK_OPTIONS: { label: string; days: number }[] = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'In 1 week', days: 7 },
  { label: 'In 1 month', days: 30 },
  { label: 'In 1 year', days: 365 },
];

/** Lightweight daily themes — rotates by UTC day, no backend required. */
export const DAILY_THEMES: {
  id: string;
  title: string;
  hint: string;
  preferredType?: DropType;
}[] = [
  { id: 'voice', title: 'Voice only', hint: 'Leave or find a voice Drop today.', preferredType: 'voice' },
  { id: 'puzzle', title: 'Puzzle day', hint: 'Plant a clue only this place can open.', preferredType: 'puzzle' },
  { id: 'gratitude', title: 'Gratitude notes', hint: 'Leave a kind memory for a stranger.', preferredType: 'memory' },
  { id: 'photo', title: 'Photo trail', hint: 'A picture only this place unlocks.', preferredType: 'photo' },
  { id: 'secret', title: 'Tiny secrets', hint: 'Use a tight radius — right on top.', preferredType: 'secret' },
  { id: 'evolve', title: 'Evolving places', hint: 'Start or add to an Evolving Drop.', preferredType: 'challenge' },
  { id: 'ghost', title: 'Time capsules', hint: 'Seal something for a future walker.', preferredType: 'time_capsule' },
];

export function getDailyTheme(now = new Date()) {
  const utcDay = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000);
  return DAILY_THEMES[utcDay % DAILY_THEMES.length]!;
}

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'unsafe_location', label: 'Unsafe location' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
] as const;

export const SAFETY_COPY =
  'Only leave Drops in safe, publicly accessible places — never on roads, tracks, or private homes.';

export const OFFLINE_QUEUE_KEY = 'drop:offline_create_queue_v1';

/** Public web origin for share links (opens app or store landing). */
export const SHARE_WEB_ORIGIN = 'https://droq.app';

export function huntShareUrl(dropId: string): string {
  return `${SHARE_WEB_ORIGIN}/hunt/${dropId}`;
}

/** Partner sticker / printed QR — same teaser, partner-facing path. */
export function partnerQrUrl(dropId: string): string {
  return `${SHARE_WEB_ORIGIN}/q/${dropId}`;
}

export function huntDeepLink(dropId: string): string {
  return `droq://hunt/${dropId}`;
}
