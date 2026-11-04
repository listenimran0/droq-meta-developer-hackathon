import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { FeedCursor } from '@/services/reactions';
import type { DropContribution, HumanChainHop } from '@/types/drop';

function requireSupabase() {
  if (!isSupabaseConfigured) throw new Error('Something went wrong. Please try again.');
}

const PAGE_SIZE = 20;

export type ContributionPage = {
  items: DropContribution[];
  nextCursor: FeedCursor | null;
};

/** @deprecated Prefer listContributionsPage for scalable feeds */
export async function listContributions(dropId: string): Promise<DropContribution[]> {
  const page = await listContributionsPage(dropId);
  return page.items;
}

export async function listContributionsPage(
  dropId: string,
  cursor?: FeedCursor | null,
  limit = PAGE_SIZE,
): Promise<ContributionPage> {
  requireSupabase();
  const { data, error } = await supabase.rpc('list_drop_contributions_page', {
    p_drop_id: dropId,
    p_limit: limit,
    p_cursor_created_at: cursor?.created_at ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) throw error;
  const payload = (data ?? { items: [], next_cursor: null }) as {
    items?: DropContribution[];
    next_cursor?: FeedCursor | null;
  };
  return {
    items: (payload.items ?? []).map((row) => ({
      ...row,
      media_path: row.media_path ?? null,
      profiles: row.profiles ?? null,
    })),
    nextCursor: payload.next_cursor ?? null,
  };
}

export async function countContributions(dropId: string): Promise<number> {
  requireSupabase();
  const { count, error } = await supabase
    .from('drop_contributions')
    .select('id', { count: 'exact', head: true })
    .eq('drop_id', dropId);
  if (error) throw error;
  return count ?? 0;
}

export async function addContribution(dropId: string, content: string): Promise<void> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const trimmed = content.trim();
  if (!trimmed) throw new Error('Write something first.');

  const { error } = await supabase.from('drop_contributions').insert({
    drop_id: dropId,
    author_id: user.id,
    content: trimmed,
  });
  if (error) throw error;
}

export async function listHumanChainHops(
  rootDropId: string,
  limit = 50,
): Promise<HumanChainHop[]> {
  requireSupabase();
  const { data, error } = await supabase
    .from('human_chain_hops')
    .select('*')
    .eq('root_drop_id', rootDropId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as HumanChainHop[];
}

export async function countHumanChainHops(rootDropId: string): Promise<number> {
  requireSupabase();
  const { count, error } = await supabase
    .from('human_chain_hops')
    .select('id', { count: 'exact', head: true })
    .eq('root_drop_id', rootDropId);
  if (error) throw error;
  return count ?? 0;
}

export async function recordHumanChainHop(input: {
  rootDropId: string;
  fromDropId: string | null;
  toDropId: string;
  latitude?: number;
  longitude?: number;
}): Promise<void> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase.from('human_chain_hops').insert({
    root_drop_id: input.rootDropId,
    from_drop_id: input.fromDropId,
    to_drop_id: input.toDropId,
    user_id: user.id,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
  });
  if (error) throw error;
}

export async function createChainWithDrops(
  title: string,
  dropIds: string[],
): Promise<string> {
  requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data: chain, error } = await supabase
    .from('drop_chains')
    .insert({ title, creator_id: user.id })
    .select('id')
    .single();
  if (error) throw error;

  const items = dropIds.map((dropId, index) => ({
    chain_id: chain.id,
    drop_id: dropId,
    position: index + 1,
  }));

  const { error: itemsError } = await supabase.from('drop_chain_items').insert(items);
  if (itemsError) throw itemsError;

  // Link sequential next_drop_id — do not overwrite custom chain_hint
  for (let i = 0; i < dropIds.length - 1; i++) {
    await supabase
      .from('drops')
      .update({
        next_drop_id: dropIds[i + 1],
        parent_drop_id: i === 0 ? null : dropIds[i - 1],
      })
      .eq('id', dropIds[i])
      .eq('creator_id', user.id);
  }
  // Last stop parent pointer
  if (dropIds.length > 1) {
    await supabase
      .from('drops')
      .update({ parent_drop_id: dropIds[dropIds.length - 2] })
      .eq('id', dropIds[dropIds.length - 1]!)
      .eq('creator_id', user.id);
  }

  return chain.id as string;
}
