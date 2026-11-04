import { isSupabaseConfigured, supabase } from '@/lib/supabase';

function requireConfigured() {
  if (!isSupabaseConfigured) throw new Error('Something went wrong. Please try again.');
}

export type DaysOutsideLeader = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  days_outside: number;
  is_me: boolean;
};

export async function listDaysOutsideLeaders(
  limit = 20,
): Promise<DaysOutsideLeader[]> {
  requireConfigured();
  const { data, error } = await supabase.rpc('get_days_outside_leaders', {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as DaysOutsideLeader[];
}

export function leaderLabel(row: DaysOutsideLeader): string {
  if (row.is_me) return 'You';
  if (row.username) return `@${row.username}`;
  if (row.display_name) return row.display_name;
  return 'Someone';
}
