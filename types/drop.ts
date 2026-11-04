export type DropType =
  | 'memory'
  | 'message'
  | 'photo'
  | 'voice'
  | 'video'
  | 'puzzle'
  | 'challenge'
  | 'secret'
  | 'time_capsule';

export type DropVisibility = 'public' | 'friends' | 'direct' | 'private';

export type DropStatus = 'active' | 'expired' | 'hidden' | 'removed';

export type ReportReason =
  | 'spam'
  | 'inappropriate'
  | 'unsafe_location'
  | 'harassment'
  | 'other';

export type NotificationKind =
  | 'nearby_drop'
  | 'drop_discovered'
  | 'friend_request'
  | 'friend_accepted'
  | 'chain_progress'
  | 'drop_reaction'
  | 'squad_invite'
  | 'system';

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type Drop = {
  id: string;
  creator_id: string;
  type: DropType;
  title: string | null;
  content: string | null;
  media_path: string | null;
  latitude: number;
  longitude: number;
  unlock_radius: number;
  visibility: DropVisibility;
  recipient_id: string | null;
  unlock_at: string | null;
  expires_at: string | null;
  status: DropStatus;
  parent_drop_id: string | null;
  next_drop_id: string | null;
  puzzle_answer: string | null;
  chain_hint: string | null;
  human_chain_root_id: string | null;
  is_business?: boolean;
  business_name?: string | null;
  business_category?: 'cafe' | 'food' | 'books' | 'shop' | 'art' | 'other' | null;
  created_at: string;
};

/** Nearby candidate — no content/media until unlock */
export type NearbyDrop = {
  id: string;
  type: DropType;
  unlock_radius: number;
  latitude: number;
  longitude: number;
  unlock_at: string | null;
  expires_at: string | null;
  created_at: string;
  visibility: DropVisibility;
  /** Present when returned from get_nearby_drops (v1.3+) */
  distance_m?: number | null;
};

export type DropDiscovery = {
  id: string;
  drop_id: string;
  user_id: string;
  discovered_at: string;
};

export type DiscoveryWithDrop = DropDiscovery & {
  drops: Pick<
    Drop,
    'id' | 'type' | 'title' | 'content' | 'media_path' | 'created_at' | 'unlock_at'
  >;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

export type CreateDropInput = {
  type: DropType;
  title?: string;
  content?: string;
  mediaPath?: string;
  latitude: number;
  longitude: number;
  unlockRadius: number;
  visibility: DropVisibility;
  recipientId?: string | null;
  unlockAt?: string | null;
  puzzleAnswer?: string | null;
  chainHint?: string | null;
  parentDropId?: string | null;
  nextDropId?: string | null;
  humanChainRootId?: string | null;
  isBusiness?: boolean;
  businessName?: string | null;
  businessCategory?: 'cafe' | 'food' | 'books' | 'shop' | 'art' | 'other' | null;
};

export type ProfileStats = {
  discovered: number;
  created: number;
  placesVisited: number;
  streak: number;
};

export type AppNotification = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  drop_id: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  requester?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  addressee?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

export type DropContribution = {
  id: string;
  drop_id: string;
  author_id: string;
  content: string;
  media_path: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null;
};

export type HumanChainHop = {
  id: string;
  root_drop_id: string;
  from_drop_id: string | null;
  to_drop_id: string;
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
};
