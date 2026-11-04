import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { DropType, DropVisibility } from '@/types/drop';

function requireConfigured() {
  if (!isSupabaseConfigured) throw new Error('Something went wrong. Please try again.');
}

export type HuntTeaser = {
  id: string;
  type: DropType;
  unlock_at: string | null;
  locked: boolean;
  visibility: DropVisibility;
};

export type SquadDistanceRow = {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url?: string | null;
  distance_m: number | null;
  status: string;
};

export async function getHuntTeaser(dropId: string): Promise<HuntTeaser | null> {
  requireConfigured();
  const { data, error } = await supabase.rpc('get_hunt_teaser', { p_drop_id: dropId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as HuntTeaser) ?? null;
}

export async function getNearbyDropById(
  dropId: string,
  lat: number,
  lng: number,
) {
  requireConfigured();
  const { data, error } = await supabase.rpc('get_nearby_drop_by_id', {
    p_drop_id: dropId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function createSquadHunt(dropId: string): Promise<string> {
  requireConfigured();
  const { data, error } = await supabase.rpc('create_squad_hunt', { p_drop_id: dropId });
  if (error) throw error;
  return data as string;
}

export async function inviteSquadFriend(huntId: string, userId: string): Promise<void> {
  requireConfigured();
  const { error } = await supabase.rpc('invite_squad_friend', {
    p_hunt_id: huntId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function joinSquadHunt(huntId: string): Promise<void> {
  requireConfigured();
  const { error } = await supabase.rpc('join_squad_hunt', { p_hunt_id: huntId });
  if (error) throw error;
}

export async function pingSquadLocation(
  huntId: string,
  lat: number,
  lng: number,
): Promise<void> {
  requireConfigured();
  const { error } = await supabase.rpc('ping_squad_location', {
    p_hunt_id: huntId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) throw error;
}

export async function getSquadDistances(huntId: string): Promise<SquadDistanceRow[]> {
  requireConfigured();
  const { data, error } = await supabase.rpc('get_squad_distances', { p_hunt_id: huntId });
  if (error) throw error;
  return (data ?? []) as SquadDistanceRow[];
}

export async function getDiscoveryStreak(): Promise<number> {
  requireConfigured();
  const { data, error } = await supabase.rpc('get_discovery_streak');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export type MySquadHunt = {
  hunt_id: string;
  drop_id: string;
  host_id: string;
  status: string;
  created_at: string;
  ends_at: string | null;
  drop_type: DropType;
  member_count: number;
  is_host: boolean;
};

export async function listMySquadHunts(limit = 8): Promise<MySquadHunt[]> {
  requireConfigured();
  const { data, error } = await supabase.rpc('list_my_squad_hunts', {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as MySquadHunt[];
}
