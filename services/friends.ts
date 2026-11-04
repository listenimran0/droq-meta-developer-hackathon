import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Friendship, Profile } from '@/types/drop';

function requireSupabase() {
  if (!isSupabaseConfigured) throw new Error('Something went wrong. Please try again.');
}

export async function searchProfiles(query: string): Promise<Profile[]> {
  requireSupabase();
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, username, display_name, avatar_url, created_at')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(20);

  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function listFriendships(limit = 40, offset = 0): Promise<Friendship[]> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const rows = (data ?? []) as Friendship[];
  if (rows.length === 0) return [];

  const ids = Array.from(
    new Set(rows.flatMap((r) => [r.requester_id, r.addressee_id])),
  );
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids);

  const map = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    requester: map.get(r.requester_id),
    addressee: map.get(r.addressee_id),
  }));
}

export async function sendFriendRequest(addresseeId: string): Promise<void> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  if (user.id === addresseeId) throw new Error('You can’t friend yourself.');

  const { error } = await supabase.from('friendships').insert({
    requester_id: user.id,
    addressee_id: addresseeId,
    status: 'pending',
  });
  if (error) throw error;

  await supabase.from('notifications').insert({
    user_id: addresseeId,
    kind: 'friend_request',
    title: 'New friend request',
    body: 'Someone wants to explore with you.',
    data: { from_user_id: user.id },
  });
}

export async function respondToFriendRequest(
  friendshipId: string,
  accept: boolean,
): Promise<void> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  if (!accept) {
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    if (error) throw error;
    return;
  }

  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .eq('addressee_id', user.id)
    .select('requester_id')
    .single();

  if (error) throw error;

  if (data?.requester_id) {
    await supabase.from('notifications').insert({
      user_id: data.requester_id,
      kind: 'friend_accepted',
      title: 'Friend request accepted',
      body: 'You’re connected. Friends-only Drops are now visible.',
      data: { friendship_id: friendshipId },
    });
  }
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  requireSupabase();
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

/** Always pin this username first in suggestions (founder / known walker). */
export const PINNED_SUGGEST_USERNAME = 'mdimrankhan';

/**
 * Suggested friends: pinned founder + top days-outside walkers.
 * Skips self and people already friended / pending.
 */
export async function listSuggestedFriends(limit = 10): Promise<Profile[]> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data: edges, error: edgeError } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  if (edgeError) throw edgeError;

  const blocked = new Set<string>([user.id]);
  for (const e of edges ?? []) {
    blocked.add(e.requester_id);
    blocked.add(e.addressee_id);
  }

  const out: Profile[] = [];
  const seen = new Set<string>();

  const push = (p: Profile | null | undefined) => {
    if (!p?.id || blocked.has(p.id) || seen.has(p.id)) return;
    if (out.length >= limit) return;
    seen.add(p.id);
    out.push(p);
  };

  const { data: pinned } = await supabase
    .from('profiles')
    .select('id, email, username, display_name, avatar_url, created_at')
    .ilike('username', PINNED_SUGGEST_USERNAME)
    .maybeSingle();
  push(pinned as Profile | null);

  const { data: leaders, error: leadError } = await supabase.rpc('get_days_outside_leaders', {
    p_limit: 30,
  });
  if (leadError) throw leadError;

  const leaderRows = (leaders ?? []) as Array<{
    user_id: string;
    username: string | null;
    display_name: string | null;
    avatar_url?: string | null;
  }>;

  const missingAvatar = leaderRows
    .filter((r) => !r.avatar_url && r.user_id)
    .map((r) => r.user_id);
  let avatarMap = new Map<string, string | null>();
  if (missingAvatar.length > 0) {
    const { data: avatars } = await supabase
      .from('profiles')
      .select('id, avatar_url')
      .in('id', missingAvatar);
    avatarMap = new Map((avatars ?? []).map((a) => [a.id, a.avatar_url]));
  }

  for (const row of leaderRows) {
    push({
      id: row.user_id,
      email: null,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url ?? avatarMap.get(row.user_id) ?? null,
      created_at: new Date(0).toISOString(),
    });
  }

  if (out.length < limit) {
    const { data: recent } = await supabase
      .from('profiles')
      .select('id, email, username, display_name, avatar_url, created_at')
      .not('username', 'is', null)
      .order('created_at', { ascending: false })
      .limit(40);
    for (const p of recent ?? []) push(p as Profile);
  }

  return out;
}
