/**
 * Maps thrown errors to short, user-safe copy.
 * Never surfaces Supabase, env keys, OAuth URLs, RLS, JWT, etc.
 */
const GENERIC = 'Something went wrong. Please try again.';

const SAFE_PREFIXES = [
  'Couldn’t',
  "Couldn't",
  'Please',
  'Enter',
  'Choose',
  'Location',
  'Camera',
  'Microphone',
  'Photo',
  'Videos must',
  'Keep trails',
  'Each stop',
  'Move closer',
  'Turn on',
  'Be the first',
  'Only you',
  'Friend request',
  'Username',
  'Password',
  'Email',
  'Sign in',
  'Not signed in',
];

function looksTechnical(msg: string): boolean {
  return /supabase|expo_public|\.env|rls|row-level|jwt|oauth|redirect url|localhost|projectid|androidmanifest|access_background|postgrest|pgrst|rpc\b|postgres|anon key|pkce|droq:\/\//i.test(
    msg,
  );
}

export function userErrorMessage(error: unknown, fallback = GENERIC): string {
  if (error == null) return fallback;
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown }).message === 'string'
          ? String((error as { message: string }).message)
          : '';

  const msg = raw.trim();
  if (!msg || msg === 'undefined' || msg === 'null') return fallback;
  if (looksTechnical(msg)) return fallback;

  // Auth / common SDK phrases → friendly
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return 'Email or password is incorrect.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Confirm your email, then try again.';
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Check your connection and try again.';
  }
  if (lower.includes('not signed in') || lower.includes('jwt expired')) {
    return 'Please sign in again.';
  }
  if (lower.includes('too far')) {
    return 'You’re not close enough yet. Walk closer and try again.';
  }
  if (lower.includes('time-locked') || lower.includes('time locked')) {
    return 'This Drop is sealed until its unlock date.';
  }
  if (lower.includes('incorrect puzzle')) {
    return 'That’s not the right answer. Try again.';
  }
  if (lower.includes('accuracy too low')) {
    return 'Location isn’t accurate enough yet. Step outside and try again.';
  }
  if (lower.includes('suspicious movement')) {
    return 'That unlock didn’t look right. Try again from the spot.';
  }
  if (lower.includes('permission denied') || lower.includes('row-level')) {
    return fallback;
  }

  // Allow short, already-friendly product messages
  if (msg.length <= 140 && SAFE_PREFIXES.some((p) => msg.startsWith(p))) {
    return msg;
  }
  if (msg.length <= 100 && !/[`{}<>]|Error:|at\s+\w+/.test(msg) && !looksTechnical(msg)) {
    return msg;
  }

  return fallback;
}
