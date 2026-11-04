import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type DropReaction = {
  id: string;
  drop_id: string;
  user_id: string;
  emoji: string;
  note: string | null;
  created_at: string;
  profiles?: {
    username: string | null;
    display_name: string | null;
    avatar_url?: string | null;
  } | null;
};

export type FeedCursor = {
  created_at: string;
  id: string;
};

export type ReactionPage = {
  items: DropReaction[];
  nextCursor: FeedCursor | null;
};

const PAGE_SIZE = 20;

function requireConfigured() {
  if (!isSupabaseConfigured) throw new Error('Something went wrong. Please try again.');
}

export async function upsertReaction(
  dropId: string,
  emoji: string,
  note?: string | null,
): Promise<void> {
  requireConfigured();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in again.');

  const { error } = await supabase.from('drop_reactions').upsert(
    {
      drop_id: dropId,
      user_id: user.id,
      emoji,
      note: note?.trim() || null,
    },
    { onConflict: 'drop_id,user_id' },
  );
  if (error) throw error;
}

/** @deprecated Prefer listReactionsPage for scalable feeds */
export async function listReactions(dropId: string): Promise<DropReaction[]> {
  const page = await listReactionsPage(dropId);
  return page.items;
}

export async function listReactionsPage(
  dropId: string,
  cursor?: FeedCursor | null,
  limit = PAGE_SIZE,
): Promise<ReactionPage> {
  requireConfigured();
  const { data, error } = await supabase.rpc('list_drop_reactions_page', {
    p_drop_id: dropId,
    p_limit: limit,
    p_cursor_created_at: cursor?.created_at ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) throw error;
  const payload = (data ?? { items: [], next_cursor: null }) as {
    items?: DropReaction[];
    next_cursor?: FeedCursor | null;
  };
  return {
    items: (payload.items ?? []).map((row) => ({
      ...row,
      note: row.note ?? null,
      profiles: row.profiles ?? null,
    })),
    nextCursor: payload.next_cursor ?? null,
  };
}

export async function countReactions(dropId: string): Promise<number> {
  requireConfigured();
  const { count, error } = await supabase
    .from('drop_reactions')
    .select('id', { count: 'exact', head: true })
    .eq('drop_id', dropId);
  if (error) throw error;
  return count ?? 0;
}

export async function getMyReaction(dropId: string): Promise<DropReaction | null> {
  requireConfigured();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('drop_reactions')
    .select('id, drop_id, user_id, emoji, note, created_at')
    .eq('drop_id', dropId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data as DropReaction | null;
}
