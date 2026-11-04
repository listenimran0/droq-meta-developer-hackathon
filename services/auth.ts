import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Profile, ProfileStats } from '@/types/drop';

/** Google (and similar OAuth) metadata keys for name + photo. */
function oauthDisplayName(meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  for (const key of ['display_name', 'full_name', 'name'] as const) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function oauthAvatarUrl(meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  for (const key of ['avatar_url', 'picture'] as const) {
    const v = meta[key];
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
  }
  return null;
}

/** Wait for handle_new_user trigger to create the profiles row (common OAuth race). */
export async function waitForProfile(
  userId: string,
  attempts = 8,
  delayMs = 200,
): Promise<Profile | null> {
  requireConfigured();
  for (let i = 0; i < attempts; i++) {
    const row = await getProfile(userId);
    if (row) return row;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

/**
 * Fill empty/auto profile name/photo from auth user_metadata (Google login).
 * Retries until the profiles row exists — OAuth often fires before the trigger finishes.
 */
export async function syncProfileFromAuth(user: User): Promise<Profile | null> {
  requireConfigured();
  const existing = await waitForProfile(user.id);
  if (!existing) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const oauthName = oauthDisplayName(meta);
  const oauthAvatar = oauthAvatarUrl(meta);
  if (!oauthName && !oauthAvatar) return existing;

  const emailLocal = (user.email ?? existing.email ?? '').split('@')[0] ?? '';
  const sanitizedLocal = emailLocal.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const currentName = (existing.display_name ?? '').trim();
  const neverGotGooglePhoto = !existing.avatar_url?.trim();

  const looksAutoName =
    !currentName ||
    currentName === existing.username ||
    currentName.toLowerCase() === emailLocal.toLowerCase() ||
    currentName.toLowerCase().replace(/[^a-z0-9_]/g, '') === sanitizedLocal ||
    currentName.toLowerCase().startsWith(`${sanitizedLocal}_`) ||
    // First Google sync: profile was created without a photo
    (neverGotGooglePhoto && !!oauthAvatar);

  const patch: Record<string, unknown> = {};
  if (oauthName && looksAutoName) patch.display_name = oauthName;
  // Prefer Google photo until the user uploads their own (storage path)
  if (oauthAvatar && neverGotGooglePhoto) {
    patch.avatar_url = oauthAvatar;
  }

  if (Object.keys(patch).length === 0) return existing;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select('id, email, username, display_name, avatar_url, created_at')
    .single();

  if (error) throw error;
  return data as Profile;
}

WebBrowser.maybeCompleteAuthSession();

function requireConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error('Something went wrong. Please try again.');
  }
}

/**
 * Deep-link back into the app after Google OAuth.
 *
 * Supabase → Authentication → URL Configuration → Redirect URLs must include:
 *   droq://auth/callback
 *   exp://127.0.0.1:8081/--/auth/callback
 *   exp://localhost:8081/--/auth/callback
 */
export function getAuthRedirectUri() {
  const native = makeRedirectUri({
    scheme: 'droq',
    path: 'auth/callback',
  });
  const viaLinking = Linking.createURL('auth/callback');
  const appOwnership = Constants.appOwnership;

  if (appOwnership === 'expo') {
    return viaLinking;
  }
  if (native.startsWith('droq://') || native.startsWith('com.droq.app://')) {
    return native;
  }
  if (viaLinking.startsWith('exp://') || viaLinking.startsWith('droq://')) {
    return viaLinking;
  }
  return 'droq://auth/callback';
}

/** Pull code / tokens from query + hash (RN URL quirks friendly). */
export function extractAuthParams(url: string): {
  code?: string;
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
  flow_id?: string;
} {
  let params: Record<string, string> = {};
  try {
    const { params: qp, errorCode } = QueryParams.getQueryParams(url);
    params = { ...(qp as Record<string, string>) };
    if (errorCode) params.error = errorCode;
  } catch {
    // fall through to manual parse
  }

  try {
    const parsed = Linking.parse(url);
    const q = parsed.queryParams ?? {};
    for (const [k, v] of Object.entries(q)) {
      if (typeof v === 'string' && v && !params[k]) params[k] = v;
    }
  } catch {
    // ignore
  }

  // Manual hash parse — some Android deep links keep #access_token=…
  const hashIdx = url.indexOf('#');
  if (hashIdx >= 0) {
    const hash = url.slice(hashIdx + 1).replace(/^\?/, '');
    for (const part of hash.split('&')) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const key = decodeURIComponent(part.slice(0, eq));
      const val = decodeURIComponent(part.slice(eq + 1));
      if (key && val && !params[key]) params[key] = val;
    }
  }

  // Manual query parse if still empty
  if (!params.code && !params.access_token) {
    const qIdx = url.indexOf('?');
    if (qIdx >= 0) {
      const query = url.slice(qIdx + 1).split('#')[0] ?? '';
      for (const part of query.split('&')) {
        const eq = part.indexOf('=');
        if (eq <= 0) continue;
        const key = decodeURIComponent(part.slice(0, eq));
        const val = decodeURIComponent(part.slice(eq + 1));
        if (key && val && !params[key]) params[key] = val;
      }
    }
  }

  return {
    code: params.code,
    access_token: params.access_token,
    refresh_token: params.refresh_token,
    error: params.error,
    error_description: params.error_description,
    flow_id: params.sb_flow_id,
  };
}

/** One exchange per auth code — openAuthSessionAsync + /auth/callback both fire. */
const inflightByCode = new Map<string, Promise<Session | null>>();

/**
 * The PKCE flow that is currently waiting for its auth code to come back.
 *
 * `supabase.auth.exchangeCodeForSession` can only pair an auth code with the
 * verifier that produced it if it knows which flow the code belongs to. In a
 * browser it reads `sb_flow_id` off `window.location`; React Native has no such
 * thing, so without a flow id the client falls back to "the most recently
 * stored verifier".
 *
 * That fallback only holds while a single flow is in flight. Start a second
 * one — a retry, an app reload during development, a browser tab left open —
 * and the newest verifier no longer matches the code the browser returns, so
 * the exchange fails with `bad_code_verifier`.
 *
 * So: keep exactly one flow in flight, remember it across app reloads, reuse
 * it when the user retries, and hand its id to the exchange so the code is
 * always matched with its own verifier.
 */
const PENDING_FLOW_KEY = 'droq.auth.pending_oauth_flow';
const PENDING_FLOW_TTL_MS = 10 * 60 * 1000;

type PendingOAuthFlow = { flowId: string; url: string; startedAt: number };

let pendingFlow: PendingOAuthFlow | null = null;
let pendingFlowLoaded = false;

async function readPendingFlow(): Promise<PendingOAuthFlow | null> {
  if (!pendingFlowLoaded) {
    pendingFlowLoaded = true;
    try {
      const raw = await AsyncStorage.getItem(PENDING_FLOW_KEY);
      pendingFlow = raw ? (JSON.parse(raw) as PendingOAuthFlow) : null;
    } catch {
      pendingFlow = null;
    }
  }
  if (pendingFlow && Date.now() - pendingFlow.startedAt > PENDING_FLOW_TTL_MS) {
    pendingFlow = null;
  }
  return pendingFlow;
}

async function writePendingFlow(flow: PendingOAuthFlow | null) {
  pendingFlow = flow;
  pendingFlowLoaded = true;
  try {
    if (flow) await AsyncStorage.setItem(PENDING_FLOW_KEY, JSON.stringify(flow));
    else await AsyncStorage.removeItem(PENDING_FLOW_KEY);
  } catch {
    // storage is best-effort; the in-memory copy still guides this session
  }
}

function isPkceRaceError(message: string) {
  return /code challenge|code verifier|code verifier not found|invalid.*verifier/i.test(
    message,
  );
}

async function exchangeCodeOnce(code: string, flowId?: string | null): Promise<Session | null> {
  const existing = inflightByCode.get(code);
  if (existing) return existing;

  const task = (async () => {
    const already = await supabase.auth.getSession();
    if (already.data.session) return already.data.session;

    const exchange = async (id?: string | null) => {
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        code,
        id ? { flowId: id } : undefined,
      );
      return { session: data.session, error };
    };

    // Prefer the flow-scoped verifier: it is the one that belongs to this code
    // even if another PKCE flow (a password reset, say) overwrote the shared
    // key in the meantime.
    let error: { message: string; code?: string } | null = null;
    if (flowId) {
      const scoped = await exchange(flowId);
      if (!scoped.error) {
        await writePendingFlow(null);
        return scoped.session;
      }
      error = scoped.error;
      // The slot is gone (storage cleared, or the flow was evicted) — the
      // shared key may still hold the right verifier, so try it once.
      if (!/verifier not found/i.test(scoped.error.message)) {
        if (__DEV__) {
          console.error('[DROQ auth] code exchange failed:', scoped.error.message);
        }
        throw scoped.error;
      }
    }

    const shared = await exchange(null);
    if (!shared.error) {
      await writePendingFlow(null);
      return shared.session;
    }
    error = shared.error;

    if (__DEV__) {
      console.error('[DROQ auth] code exchange failed:', error.message);
    }

    // Sibling path already exchanged this code and cleared the verifier
    if (isPkceRaceError(error.message)) {
      const raced = await supabase.auth.getSession();
      if (raced.data.session) return raced.data.session;
      // brief wait — other exchange may still be writing storage
      await new Promise((r) => setTimeout(r, 400));
      const again = await supabase.auth.getSession();
      if (again.data.session) return again.data.session;
    }
    throw error;
  })().finally(() => {
    inflightByCode.delete(code);
  });

  inflightByCode.set(code, task);
  return task;
}

export async function createSessionFromUrl(url: string) {
  const params = extractAuthParams(url);

  if (params.error) {
    throw new Error(params.error_description || params.error);
  }

  if (params.code) {
    const flowId = params.flow_id ?? (await readPendingFlow())?.flowId ?? null;
    return exchangeCodeOnce(params.code, flowId);
  }

  if (params.access_token && params.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
    return data.session;
  }

  return null;
}

export async function signUp(email: string, password: string, username: string) {
  requireConfigured();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: getAuthRedirectUri(),
      data: { username: username.trim().toLowerCase(), display_name: username.trim() },
    },
  });
  if (error) throw error;
  return data;
}

/** True when signup created a user but email confirmation is still required. */
export function signupNeedsEmailConfirmation(data: {
  session: Session | null;
  user: User | null;
}): boolean {
  if (data.session) return false;
  if (!data.user) return true;
  // Supabase returns a user with empty identities when the address is already registered
  // (anti-enumeration). Treat as “check email / try sign-in”.
  return true;
}

export async function resendSignupConfirmation(email: string) {
  requireConfigured();
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes('@')) {
    throw new Error('Enter a valid email address.');
  }
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: trimmed,
    options: { emailRedirectTo: getAuthRedirectUri() },
  });
  if (error) throw error;
}

export async function signIn(email: string, password: string) {
  requireConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    if (/email not confirmed|confirm your email/i.test(error.message)) {
      throw new Error('Confirm your email first. Open the link we sent, then try again.');
    }
    throw error;
  }
  return data;
}

/**
 * Google OAuth via system browser + deep link back into the app.
 */
export async function signInWithGoogle() {
  requireConfigured();
  const redirectTo = getAuthRedirectUri();

  if (__DEV__) {
    if (__DEV__) console.log('[DROQ auth] OAuth redirectTo =', redirectTo);
  }

  if (redirectTo.includes('localhost:3000')) {
    throw new Error('Google sign-in isn’t available right now. Please try again later.');
  }

  const pending = await readPendingFlow();

  let oauthUrl: string;
  if (pending?.url) {
    // A sign-in is already in flight. Re-open the SAME authorization request
    // instead of starting a second one: the code the browser returns then
    // still matches the verifier that is stored.
    oauthUrl = pending.url;
    if (__DEV__) {
      if (__DEV__) console.log('[DROQ auth] reusing pending OAuth flow', pending.flowId);
    }
  } else {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw error;
    if (!data.url) throw new Error('Could not start Google sign-in.');

    oauthUrl = data.url;
    await writePendingFlow({
      flowId: (data as { flowId?: string | null }).flowId ?? '',
      url: data.url,
      startedAt: Date.now(),
    });
  }

  const result = await WebBrowser.openAuthSessionAsync(oauthUrl, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('Google sign-in was cancelled.');
  }

  if (result.type !== 'success' || !('url' in result) || !result.url) {
    // Deep link may have already completed the session via /auth/callback
    const existing = await supabase.auth.getSession();
    if (existing.data.session) return existing.data.session;
    throw new Error('Google sign-in was cancelled.');
  }

  if (__DEV__) {
    if (__DEV__) console.log('[DROQ auth] OAuth result url =', result.url.slice(0, 120));
  }

  if (result.url.includes('localhost:3000')) {
    throw new Error('Google sign-in didn’t finish. Please try again.');
  }

  let session = null as Session | null;
  try {
    session = await createSessionFromUrl(result.url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (!isPkceRaceError(msg)) throw e;
  }

  // Race: Expo Router /auth/callback may have already exchanged the code
  if (!session) {
    const existing = await supabase.auth.getSession();
    session = existing.data.session;
  }

  if (!session) {
    throw new Error('Couldn’t finish Google sign-in. Please try again.');
  }

  // Pull Google name + photo into profiles (trigger may have missed OAuth keys)
  if (session.user) {
    await syncProfileFromAuth(session.user).catch(() => undefined);
  }

  return session;
}

export function getPasswordResetRedirectUri() {
  const native = makeRedirectUri({
    scheme: 'droq',
    path: 'auth/reset',
  });
  const viaLinking = Linking.createURL('auth/reset');
  const appOwnership = Constants.appOwnership;

  if (appOwnership === 'expo') {
    return viaLinking;
  }
  if (native.startsWith('droq://') || native.startsWith('com.droq.app://')) {
    return native;
  }
  if (viaLinking.startsWith('exp://') || viaLinking.startsWith('droq://')) {
    return viaLinking;
  }
  return 'droq://auth/reset';
}

export async function resetPasswordForEmail(email: string) {
  requireConfigured();
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes('@')) {
    throw new Error('Enter a valid email address.');
  }
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo: getPasswordResetRedirectUri(),
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  requireConfigured();
  if (newPassword.length < 6) {
    throw new Error('Password needs at least 6 characters.');
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOut() {
  await writePendingFlow(null);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, username, display_name, avatar_url, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const [discoveredRes, createdRes, streakRes] = await Promise.all([
    supabase
      .from('drop_discoveries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('drops')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', userId)
      .neq('status', 'removed')
      .neq('status', 'hidden'),
    supabase.rpc('get_discovery_streak', {}),
  ]);

  if (discoveredRes.error) throw discoveredRes.error;
  if (createdRes.error) throw createdRes.error;

  return {
    discovered: discoveredRes.count ?? 0,
    created: createdRes.count ?? 0,
    placesVisited: discoveredRes.count ?? 0,
    streak: typeof streakRes.data === 'number' ? streakRes.data : 0,
  };
}

export async function updateProfile(input: {
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
}): Promise<Profile> {
  requireConfigured();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName.trim() || null;
  if (input.username !== undefined) {
    const u = input.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (u.length < 3) throw new Error('Username needs at least 3 characters.');
    patch.username = u;
  }
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select('id, email, username, display_name, avatar_url, created_at')
    .single();

  if (error) throw error;
  return data as Profile;
}
