import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { ReportReason } from '@/types/drop';

export type DropReportRow = {
  id: string;
  drop_id: string;
  reporter_id: string;
  reason: ReportReason;
  created_at: string;
  drops?: { id: string; title: string | null; type: string } | null;
};

function requireSupabase() {
  if (!isSupabaseConfigured) throw new Error('Something went wrong. Please try again.');
}

/** Reports filed against Drops you created (moderation inbox). */
export async function getReportsOnMyDrops(limit = 40): Promise<DropReportRow[]> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data: myDrops, error: dropsError } = await supabase
    .from('drops')
    .select('id')
    .eq('creator_id', user.id);
  if (dropsError) throw dropsError;
  const ids = (myDrops ?? []).map((d) => d.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('drop_reports')
    .select('id, drop_id, reporter_id, reason, created_at, drops(id, title, type)')
    .in('drop_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as DropReportRow[];
}

export async function hideMyDrop(dropId: string): Promise<void> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('drops')
    .update({ status: 'hidden' })
    .eq('id', dropId)
    .eq('creator_id', user.id);
  if (error) throw error;
}
