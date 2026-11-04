import { NEARBY_FETCH_LIMIT, NEARBY_RADIUS_M } from '@/constants/config';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { trackEvent } from '@/services/analytics';
import type {
  CreateDropInput,
  DiscoveryWithDrop,
  Drop,
  DropType,
  NearbyDrop,
  ReportReason,
} from '@/types/drop';
import { isDropExpired } from '@/utils/location';

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error('Something went wrong. Please try again.');
  }
}

export async function createDrop(input: CreateDropInput): Promise<Drop> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    throw new Error('Couldn’t read your location. Please try again.');
  }
  if (input.visibility === 'direct' && !input.recipientId) {
    throw new Error('Pick a friend for this Drop.');
  }

  const { data, error } = await supabase
    .from('drops')
    .insert({
      creator_id: user.id,
      type: input.type,
      title: input.title ?? null,
      content: input.content ?? null,
      media_path: input.mediaPath ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      unlock_radius: input.unlockRadius,
      visibility: input.visibility,
      recipient_id:
        input.visibility === 'direct' ? input.recipientId ?? null : null,
      unlock_at: input.unlockAt ?? null,
      puzzle_answer: input.puzzleAnswer ?? null,
      chain_hint: input.chainHint ?? null,
      parent_drop_id: input.parentDropId ?? null,
      next_drop_id: input.nextDropId ?? null,
      human_chain_root_id: input.humanChainRootId ?? null,
      is_business: Boolean(input.isBusiness && input.businessName?.trim()),
      business_name: input.isBusiness ? input.businessName?.trim().slice(0, 60) || null : null,
      business_category: input.isBusiness ? input.businessCategory ?? 'other' : null,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) throw error;
  await trackEvent('drop_created', { type: input.type, visibility: input.visibility });
  return data as Drop;
}

export async function getNearbyDrops(
  latitude: number,
  longitude: number,
  radiusM: number = NEARBY_RADIUS_M,
  limit: number = NEARBY_FETCH_LIMIT,
): Promise<NearbyDrop[]> {
  requireSupabase();

  let { data, error } = await supabase.rpc('get_nearby_drops', {
    p_lat: latitude,
    p_lng: longitude,
    p_radius_m: radiusM,
    p_limit: limit,
  });

  // Pre-010 migration: 3-arg RPC only
  if (error) {
    const retry = await supabase.rpc('get_nearby_drops', {
      p_lat: latitude,
      p_lng: longitude,
      p_radius_m: radiusM,
    });
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;

  const rows = (data ?? []) as NearbyDrop[];
  return rows.filter((d) => !isDropExpired(d.expires_at));
}

/** Total waiting in radius (may exceed fetch limit). Falls back to list length if RPC missing. */
export async function getNearbyCount(
  latitude: number,
  longitude: number,
  radiusM: number = NEARBY_RADIUS_M,
): Promise<number> {
  requireSupabase();

  const { data, error } = await supabase.rpc('get_nearby_count', {
    p_lat: latitude,
    p_lng: longitude,
    p_radius_m: radiusM,
  });

  if (error) {
    // Migration not applied yet — approximate from capped list
    const drops = await getNearbyDrops(latitude, longitude, radiusM);
    return drops.length;
  }

  return typeof data === 'number' ? data : 0;
}

export async function getDrop(id: string): Promise<Drop | null> {
  requireSupabase();
  const { data, error } = await supabase.from('drops').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Drop | null;
}

/**
 * Server-side proximity verification + discovery record.
 * Includes accuracy / speed anti-spoof + optional puzzle gate.
 */
export async function unlockDrop(
  dropId: string,
  latitude: number,
  longitude: number,
  accuracy?: number | null,
  puzzleAttempt?: string | null,
): Promise<Drop> {
  requireSupabase();

  const { data, error } = await supabase.rpc('unlock_drop', {
    p_drop_id: dropId,
    p_lat: latitude,
    p_lng: longitude,
    p_accuracy: accuracy ?? null,
    p_puzzle_attempt: puzzleAttempt ?? null,
  });

  if (error) throw error;
  await trackEvent('drop_unlocked', { drop_id: dropId });
  return data as Drop;
}

export async function recordDiscovery(
  dropId: string,
  latitude: number,
  longitude: number,
  accuracy?: number | null,
  puzzleAttempt?: string | null,
): Promise<void> {
  await unlockDrop(dropId, latitude, longitude, accuracy, puzzleAttempt);
}

export async function getMyDiscoveries(limit = 30, offset = 0): Promise<DiscoveryWithDrop[]> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('drop_discoveries')
    .select(
      'id, drop_id, user_id, discovered_at, drops(id, type, title, content, media_path, created_at, unlock_at)',
    )
    .eq('user_id', user.id)
    .order('discovered_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []) as unknown as DiscoveryWithDrop[];
}

/** The types of the user's most recent finds (newest first) — a novelty signal for Sense. */
export async function getRecentFoundTypes(limit = 10): Promise<DropType[]> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('drop_discoveries')
    .select('discovered_at, drops(type)')
    .eq('user_id', user.id)
    .order('discovered_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as { drops: { type?: DropType } | { type?: DropType }[] | null }[])
    .map((r) => (Array.isArray(r.drops) ? r.drops[0]?.type : r.drops?.type))
    .filter((t): t is DropType => typeof t === 'string');
}

export async function deleteMyDiscovery(discoveryId: string): Promise<void> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error, count } = await supabase
    .from('drop_discoveries')
    .delete({ count: 'exact' })
    .eq('id', discoveryId)
    .eq('user_id', user.id);

  if (error) throw error;
  if (!count) throw new Error('Discovery not found');
}

export async function reportDrop(dropId: string, reason: ReportReason): Promise<void> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from('drop_reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', user.id)
    .gte('created_at', hourAgo);

  if (countError) throw countError;
  if ((count ?? 0) >= 5) {
    throw new Error('Too many reports. Please wait before reporting again.');
  }

  const { error } = await supabase.from('drop_reports').insert({
    drop_id: dropId,
    reporter_id: user.id,
    reason,
  });
  if (error) throw error;
  await trackEvent('drop_reported', { drop_id: dropId, reason });
}

export async function getMyCreatedDrops(limit = 30, offset = 0): Promise<Drop[]> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('drops')
    .select('*')
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data ?? []) as Drop[];
}

export async function linkNextDrop(fromId: string, toId: string, hint?: string): Promise<void> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('drops')
    .update({
      next_drop_id: toId,
      chain_hint: hint ?? 'The trail continues nearby.',
    })
    .eq('id', fromId)
    .eq('creator_id', user.id);

  if (error) throw error;
}

export type UpdateDropInput = {
  title?: string | null;
  content?: string | null;
  chainHint?: string | null;
  visibility?: Drop['visibility'];
  recipientId?: string | null;
  unlockRadius?: number;
};

export async function updateDrop(dropId: string, input: UpdateDropInput): Promise<Drop> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title?.trim() || null;
  if (input.content !== undefined) patch.content = input.content?.trim() || null;
  if (input.chainHint !== undefined) patch.chain_hint = input.chainHint?.trim() || null;
  if (input.visibility !== undefined) {
    patch.visibility = input.visibility;
    if (input.visibility === 'direct') {
      if (input.recipientId !== undefined) patch.recipient_id = input.recipientId;
    } else {
      patch.recipient_id = null;
    }
  } else if (input.recipientId !== undefined) {
    patch.recipient_id = input.recipientId;
  }
  if (input.unlockRadius !== undefined) patch.unlock_radius = input.unlockRadius;

  const { data, error } = await supabase
    .from('drops')
    .update(patch)
    .eq('id', dropId)
    .eq('creator_id', user.id)
    .select('*')
    .single();

  if (error) throw error;
  return data as Drop;
}

export async function deleteDrop(dropId: string): Promise<void> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('drops')
    .delete()
    .eq('id', dropId)
    .eq('creator_id', user.id);

  if (error) throw error;
}
