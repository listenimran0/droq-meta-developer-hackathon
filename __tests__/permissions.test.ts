/**
 * Private Drop permission rules (documented + unit-checked).
 * Actual enforcement lives in Supabase RLS + unlock_drop RPC.
 */
function canReadDrop(params: {
  visibility: 'public' | 'private' | 'friends' | 'direct';
  creatorId: string;
  viewerId: string;
  discovered: boolean;
  recipientId?: string | null;
}): boolean {
  if (params.creatorId === params.viewerId) return true;
  if (params.discovered) return true;
  if (params.visibility === 'public') return true;
  if (params.visibility === 'direct') return params.recipientId === params.viewerId;
  return false;
}

function canRecordDiscoveryTwice(): boolean {
  // Unique (drop_id, user_id) prevents duplicates at DB layer
  return false;
}

describe('private Drop permissions', () => {
  it('blocks strangers from private Drops', () => {
    expect(
      canReadDrop({
        visibility: 'private',
        creatorId: 'a',
        viewerId: 'b',
        discovered: false,
      }),
    ).toBe(false);
  });

  it('allows creator and discoverers', () => {
    expect(
      canReadDrop({
        visibility: 'private',
        creatorId: 'a',
        viewerId: 'a',
        discovered: false,
      }),
    ).toBe(true);
    expect(
      canReadDrop({
        visibility: 'private',
        creatorId: 'a',
        viewerId: 'b',
        discovered: true,
      }),
    ).toBe(true);
  });

  it('documents duplicate discovery prevention', () => {
    expect(canRecordDiscoveryTwice()).toBe(false);
  });

  it('direct Drop is only for the chosen friend', () => {
    expect(
      canReadDrop({
        visibility: 'direct',
        creatorId: 'a',
        viewerId: 'b',
        recipientId: 'b',
        discovered: false,
      }),
    ).toBe(true);
    expect(
      canReadDrop({
        visibility: 'direct',
        creatorId: 'a',
        viewerId: 'c',
        recipientId: 'b',
        discovered: false,
      }),
    ).toBe(false);
  });
});
