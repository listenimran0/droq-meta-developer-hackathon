import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BannerAdSlot } from '@/components/ads/BannerAdSlot';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { FadeIn } from '@/components/ui/FadeIn';
import { CloseButton } from '@/components/ui/CloseButton';
import { SoftLink } from '@/components/ui/SoftLink';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { VISIBILITY_OPTIONS, huntShareUrl, partnerQrUrl } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { BusinessBadge } from '@/components/ui/BusinessBadge';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { deleteDrop, getDrop, updateDrop } from '@/services/drops';
import {
  addContribution,
  countContributions,
  countHumanChainHops,
  listContributionsPage,
} from '@/services/evolve';
import { getMediaUrl } from '@/services/media';
import {
  countReactions,
  getMyReaction,
  listReactionsPage,
  upsertReaction,
  type DropReaction,
  type FeedCursor,
} from '@/services/reactions';
import { createSquadHunt } from '@/services/squad';
import { formatUnlockCountdown } from '@/utils/time';
import { isDropTimeLocked } from '@/utils/location';
import { cacheDiscoveredDrop, getCachedDiscoveredDrop } from '@/lib/discoveryCache';
import type { Drop, DropContribution, DropVisibility } from '@/types/drop';
import { layout, typography, type ThemeColors } from '@/constants/theme';
import { userErrorMessage } from '@/lib/userError';

const REACTION_EMOJIS = ['✨', '🔥', '💚', '😮', '🫶'];

function VoicePlayer({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

  return (
    <Button
      label={playing ? 'Pause voice' : 'Play voice'}
      variant="ghost"
      onPress={() => {
        if (playing) player.pause();
        else player.play();
      }}
    />
  );
}

function VideoPlayer({ uri, style }: { uri: string; style: StyleProp<ViewStyle> }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls
    />
  );
}

export default function DropContentScreen() {
  const router = useRouter();
  const { t, typeLabel } = useI18n();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [drop, setDrop] = useState<Drop | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [photoFullscreen, setPhotoFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contributions, setContributions] = useState<DropContribution[]>([]);
  const [contribCursor, setContribCursor] = useState<FeedCursor | null>(null);
  const [contribTotal, setContribTotal] = useState(0);
  const [contribLoadingMore, setContribLoadingMore] = useState(false);
  const [hopCount, setHopCount] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // Only show the placeholder when the wait is long enough to notice.
  const showSkeleton = useDelayedLoading(loading);
  const [reactions, setReactions] = useState<DropReaction[]>([]);
  const [reactionCursor, setReactionCursor] = useState<FeedCursor | null>(null);
  const [reactionTotal, setReactionTotal] = useState(0);
  const [reactionLoadingMore, setReactionLoadingMore] = useState(false);
  const [myEmoji, setMyEmoji] = useState<string | null>(null);
  const [reactionNote, setReactionNote] = useState('');
  const [reacting, setReacting] = useState(false);
  const [squadBusy, setSquadBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editHint, setEditHint] = useState('');
  const [editVisibility, setEditVisibility] = useState<DropVisibility>('public');
  const [editBusy, setEditBusy] = useState(false);

  const isCreator = Boolean(drop && user?.id && drop.creator_id === user.id);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) return;
      setLoading(true);
      try {
        let d = await getDrop(id);
        if (!d) {
          d = await getCachedDiscoveredDrop(id);
        }
        if (!active) return;
        if (!d) {
          setError('This Drop is no longer available.');
          return;
        }
        setDrop(d);
        await cacheDiscoveredDrop(d);
        if (d.media_path) {
          try {
            const url = await getMediaUrl(d.media_path);
            if (active) setMediaUrl(url);
          } catch {
            // offline
          }
        }
        if (d.type === 'challenge') {
          const [page, total] = await Promise.all([
            listContributionsPage(d.id).catch(() => ({
              items: [] as DropContribution[],
              nextCursor: null,
            })),
            countContributions(d.id).catch(() => 0),
          ]);
          if (active) {
            setContributions(page.items);
            setContribCursor(page.nextCursor);
            setContribTotal(total);
          }
        }
        const rootId = d.human_chain_root_id ?? d.id;
        if (d.human_chain_root_id || d.chain_hint) {
          const hops = await countHumanChainHops(rootId).catch(() => 0);
          if (active) setHopCount(hops);
        }
        const [rxPage, rxTotal, mine] = await Promise.all([
          listReactionsPage(d.id).catch(() => ({
            items: [] as DropReaction[],
            nextCursor: null,
          })),
          countReactions(d.id).catch(() => 0),
          getMyReaction(d.id).catch(() => null),
        ]);
        if (active) {
          setReactions(rxPage.items);
          setReactionCursor(rxPage.nextCursor);
          setReactionTotal(rxTotal);
          setMyEmoji(mine?.emoji ?? null);
          setReactionNote(mine?.note ?? '');
        }
      } catch (e) {
        const cached = id ? await getCachedDiscoveredDrop(id) : null;
        if (cached && active) {
          setDrop(cached);
          setError(null);
        } else if (active) {
          setError(userErrorMessage(e, 'Couldn’t open Drop.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const startEdit = () => {
    if (!drop) return;
    setEditTitle(drop.title ?? '');
    setEditContent(drop.content ?? '');
    setEditHint(drop.chain_hint ?? '');
    setEditVisibility(drop.visibility);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!drop) return;
    setEditBusy(true);
    try {
      const updated = await updateDrop(drop.id, {
        title: editTitle,
        content: editContent,
        chainHint: editHint,
        visibility: editVisibility,
      });
      setDrop(updated);
      await cacheDiscoveredDrop(updated);
      setEditing(false);
    } catch (e) {
      Alert.alert('Couldn’t save', userErrorMessage(e, 'Try again.'));
    } finally {
      setEditBusy(false);
    }
  };

  const onDelete = () => {
    if (!drop) return;
    Alert.alert(
      'Delete this Drop?',
      'People won’t be able to find it anymore. This can’t be undone.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setEditBusy(true);
            try {
              await deleteDrop(drop.id);
              router.replace('/left');
            } catch (e) {
              Alert.alert('Couldn’t delete', userErrorMessage(e, 'Try again.'));
            } finally {
              setEditBusy(false);
            }
          },
        },
      ],
    );
  };

  const submitContribution = async () => {
    if (!drop) return;
    setSaving(true);
    try {
      await addContribution(drop.id, note);
      setNote('');
      const [page, total] = await Promise.all([
        listContributionsPage(drop.id),
        countContributions(drop.id),
      ]);
      setContributions(page.items);
      setContribCursor(page.nextCursor);
      setContribTotal(total);
    } catch (e) {
      Alert.alert('Couldn’t add', userErrorMessage(e, 'Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const refreshReactions = async (dropId: string) => {
    const [page, total] = await Promise.all([
      listReactionsPage(dropId),
      countReactions(dropId),
    ]);
    setReactions(page.items);
    setReactionCursor(page.nextCursor);
    setReactionTotal(total);
  };

  const loadMoreReactions = async () => {
    if (!drop || !reactionCursor || reactionLoadingMore) return;
    setReactionLoadingMore(true);
    try {
      const page = await listReactionsPage(drop.id, reactionCursor);
      setReactions((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.items.filter((r) => !seen.has(r.id))];
      });
      setReactionCursor(page.nextCursor);
    } catch (e) {
      Alert.alert('Reactions', userErrorMessage(e, 'Couldn’t load more.'));
    } finally {
      setReactionLoadingMore(false);
    }
  };

  const loadMoreContributions = async () => {
    if (!drop || !contribCursor || contribLoadingMore) return;
    setContribLoadingMore(true);
    try {
      const page = await listContributionsPage(drop.id, contribCursor);
      setContributions((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.items.filter((c) => !seen.has(c.id))];
      });
      setContribCursor(page.nextCursor);
    } catch (e) {
      Alert.alert('Contributions', userErrorMessage(e, 'Couldn’t load more.'));
    } finally {
      setContribLoadingMore(false);
    }
  };

  const onReact = async (emoji: string) => {
    if (!drop || isCreator) return;
    setReacting(true);
    try {
      await upsertReaction(drop.id, emoji, reactionNote);
      setMyEmoji(emoji);
      await refreshReactions(drop.id);
      Alert.alert(t('sendReaction'), t('reactionSent'));
    } catch (e) {
      Alert.alert('Reaction', userErrorMessage(e));
    } finally {
      setReacting(false);
    }
  };

  const sendReactionWithNote = async () => {
    if (!drop || isCreator || !myEmoji) return;
    setReacting(true);
    try {
      await upsertReaction(drop.id, myEmoji, reactionNote);
      await refreshReactions(drop.id);
      Alert.alert(t('sendReaction'), t('reactionSent'));
    } catch (e) {
      Alert.alert('Reaction', userErrorMessage(e));
    } finally {
      setReacting(false);
    }
  };

  const onShare = async () => {
    if (!drop) return;
    const web = huntShareUrl(drop.id);
    try {
      await Share.share({
        message: `Something is waiting in the real world on DROQ — no map pin, only distance.\n${web}`,
        url: web,
        title: 'DROQ hunt',
      });
    } catch {
      // cancelled
    }
  };

  const onSharePartnerQr = async () => {
    if (!drop) return;
    const web = partnerQrUrl(drop.id);
    try {
      await Share.share({
        message: `DROQ partner place — scan or open, then walk until it unlocks.\n${web}`,
        url: web,
        title: 'DROQ partner QR',
      });
    } catch {
      // cancelled
    }
  };

  const onSquad = async () => {
    if (!drop) return;
    setSquadBusy(true);
    try {
      const huntId = await createSquadHunt(drop.id);
      router.push({
        pathname: '/squad/[id]',
        params: { id: huntId, dropId: drop.id },
      });
    } catch (e) {
      Alert.alert('Squad', userErrorMessage(e));
    } finally {
      setSquadBusy(false);
    }
  };

  const revealTitle = useMemo(() => {
    if (!drop?.title) return null;
    return drop.title.replace(/^\[(SEED|DEMO)\]\s*/i, '').trim() || drop.title;
  }, [drop?.title]);

  if (loading) {
    return (
      <Screen ambient="none">
        {showSkeleton ? (
          <View style={{ paddingTop: 24 }}>
            <ListSkeleton rows={5} />
          </View>
        ) : null}
      </Screen>
    );
  }

  if (error || !drop) {
    return (
      <Screen ambient="none">
        <View style={styles.pad}>
          <Text style={styles.error}>{error ?? t('unavailable')}</Text>
          <Button label={t('back')} variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen ambient="none">
      <FadeIn style={{ flex: 1 }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <CloseButton label={t('close')} />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroRule} />
          <Text style={styles.type}>{typeLabel(drop.type)}</Text>
          <BusinessBadge show={drop.is_business} name={drop.business_name} category={drop.business_category} />
          {drop.unlock_at ? (
            <Text style={styles.meta}>
              {isDropTimeLocked(drop.unlock_at)
                ? formatUnlockCountdown(drop.unlock_at) ??
                  `Sealed until ${new Date(drop.unlock_at).toLocaleDateString()}`
                : `Opened ${new Date(drop.unlock_at).toLocaleDateString()}`}
            </Text>
          ) : (
            <Text style={styles.meta}>Unlocked in the real world</Text>
          )}

          {editing ? (
            <View style={styles.editBlock}>
              <TextField
                label="Title"
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Optional title"
              />
              <TextField
                label="Content"
                value={editContent}
                onChangeText={setEditContent}
                placeholder="What’s waiting here…"
                multiline
                style={{ minHeight: 100, textAlignVertical: 'top' }}
              />
              <TextField
                label="Chain hint"
                value={editHint}
                onChangeText={setEditHint}
                placeholder="Optional trail hint"
              />
              <Text style={styles.blockLabel}>Visibility</Text>
              {drop.visibility === 'direct' ? (
                <Text style={styles.meta}>
                  This Drop is for one friend. Change below to open it to more people.
                </Text>
              ) : null}
              <View style={styles.visRow}>
                {VISIBILITY_OPTIONS.filter((opt) => opt.value !== 'direct').map((opt) => (
                  <Chip
                    key={opt.value}
                    dense
                    label={opt.label}
                    selected={editVisibility === opt.value}
                    onPress={() => setEditVisibility(opt.value)}
                    style={styles.visChip}
                  />
                ))}
              </View>
              <Button label="Save changes" loading={editBusy} onPress={saveEdit} />
              <Button
                label="Cancel"
                variant="ghost"
                disabled={editBusy}
                onPress={() => setEditing(false)}
              />
            </View>
          ) : (
            <>
              {revealTitle ? <Text style={styles.title}>{revealTitle}</Text> : null}
              {drop.content ? <Text style={styles.body}>{drop.content}</Text> : null}
              {!drop.title && !drop.content && !drop.media_path ? (
                <Text style={styles.meta}>No text on this Drop.</Text>
              ) : null}
            </>
          )}
        </View>

        {drop.type === 'photo' && mediaUrl ? (
          <Pressable
            onPress={() => setPhotoFullscreen(true)}
            accessibilityRole="imagebutton"
            accessibilityLabel="View photo full screen"
            style={styles.photoWrap}
          >
            <Image source={{ uri: mediaUrl }} style={styles.photo} resizeMode="cover" />
            <Text style={styles.photoHint}>Tap to view full size</Text>
          </Pressable>
        ) : null}

        {drop.type === 'voice' && mediaUrl ? <VoicePlayer uri={mediaUrl} /> : null}
        {drop.type === 'video' && mediaUrl ? (
          <VideoPlayer uri={mediaUrl} style={styles.video} />
        ) : null}

        {drop.chain_hint || drop.next_drop_id ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>{t('chainHint')}</Text>
            {drop.chain_hint && !editing ? (
              <Text style={styles.blockBody}>{drop.chain_hint}</Text>
            ) : null}
            {drop.next_drop_id ? (
              <Button
                label={t('continueTrail')}
                variant="ghost"
                onPress={() =>
                  router.push({
                    pathname: '/discover',
                    params: { focusId: drop.next_drop_id! },
                  })
                }
              />
            ) : null}
          </View>
        ) : null}

        {isCreator && !editing ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Manage</Text>
            <View style={styles.linkRow}>
              <SoftLink label="Edit" onPress={startEdit} />
              <Text style={styles.linkSep}>·</Text>
              <SoftLink label="Partner QR" onPress={onSharePartnerQr} />
              <Text style={styles.linkSep}>·</Text>
              <Pressable onPress={onDelete} hitSlop={8} disabled={editBusy}>
                <Text style={styles.linkDanger}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Share</Text>
          <View style={styles.linkRow}>
            <SoftLink label={t('shareHunt')} onPress={onShare} />
            <Text style={styles.linkSep}>·</Text>
            <SoftLink
              label={squadBusy ? '…' : t('inviteSquad')}
              onPress={onSquad}
              disabled={squadBusy}
            />
          </View>
        </View>

        {!isCreator ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>{t('sendReaction')}</Text>
            <Text style={styles.blockHint}>A quiet thank-you to whoever planted this.</Text>
            <View style={styles.emojiRow}>
              {REACTION_EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => onReact(e)}
                  disabled={reacting}
                  style={[styles.emojiBtn, myEmoji === e && styles.emojiActive]}
                >
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <TextField
              label="Optional note"
              value={reactionNote}
              onChangeText={setReactionNote}
              placeholder="A few words for the creator…"
            />
            {myEmoji ? (
              <Button
                label="Send with note"
                variant="ghost"
                loading={reacting}
                onPress={sendReactionWithNote}
              />
            ) : null}
          </View>
        ) : null}

        {isCreator ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>
              Reactions{reactionTotal > 0 ? ` · ${reactionTotal}` : ''}
            </Text>
            {reactions.length === 0 ? (
              <Text style={styles.meta}>
                No reactions yet. You’ll see emoji and notes here when someone finds this.
              </Text>
            ) : (
              <>
                {reactions.map((r) => (
                  <View key={r.id} style={styles.reactionCard}>
                    <Avatar
                      uri={r.profiles?.avatar_url}
                      name={r.profiles?.display_name || r.profiles?.username}
                      size="sm"
                    />
                    <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                    <View style={styles.reactionText}>
                      <Text style={styles.contribution}>
                        {r.profiles?.username
                          ? `@${r.profiles.username}`
                          : r.profiles?.display_name || 'Someone'}
                      </Text>
                      {r.note ? <Text style={styles.reactionNote}>{r.note}</Text> : null}
                    </View>
                  </View>
                ))}
                {reactionCursor ? (
                  <Button
                    label={reactionLoadingMore ? 'Loading…' : 'Load more'}
                    variant="ghost"
                    loading={reactionLoadingMore}
                    onPress={loadMoreReactions}
                  />
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {drop.type === 'challenge' ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>
              Evolving Drop
              {contribTotal > 0 ? ` · ${contribTotal}` : ''}
            </Text>
            {contributions.length === 0 ? (
              <Text style={styles.meta}>
                {isCreator
                  ? 'No one has added yet. You’ll get an alert when they do.'
                  : 'Be the first to leave a mark here.'}
              </Text>
            ) : (
              <>
                {contributions.map((c) => (
                  <View key={c.id} style={styles.contribRow}>
                    <Avatar
                      uri={c.profiles?.avatar_url}
                      name={c.profiles?.display_name || c.profiles?.username}
                      size="sm"
                    />
                    <Text style={styles.contribution}>
                      {c.profiles?.username ? `@${c.profiles.username}: ` : ''}
                      {c.content}
                    </Text>
                  </View>
                ))}
                {contribCursor ? (
                  <Button
                    label={contribLoadingMore ? 'Loading…' : 'Load more'}
                    variant="ghost"
                    loading={contribLoadingMore}
                    onPress={loadMoreContributions}
                  />
                ) : null}
              </>
            )}
            <TextField
              label={isCreator ? 'Add as the place owner' : 'Add to this place'}
              value={note}
              onChangeText={setNote}
              placeholder="Leave a mark for the next person…"
              multiline
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
            <Button
              label="Contribute"
              loading={saving}
              disabled={!note.trim()}
              onPress={submitContribution}
            />
          </View>
        ) : null}

        {hopCount > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Human chain · {hopCount} hops</Text>
            <Text style={styles.meta}>People carried this further into the world.</Text>
          </View>
        ) : null}

        <View style={styles.placeStamp}>
          <View style={styles.placeDot} />
          <Text style={styles.place}>Found here — by showing up</Text>
        </View>

        <View style={styles.cta}>
          <Text style={styles.ctaEyebrow}>NEXT OUTSIDE</Text>
          <Text style={styles.ctaCopy}>Keep the chain going?</Text>
          <Button label="Leave something here" onPress={() => router.push('/create')} />
          <SoftLink
            label="Continue from this spot"
            onPress={() =>
              router.push({
                pathname: '/create',
                params: {
                  humanRoot: drop.human_chain_root_id ?? drop.id,
                  fromDrop: drop.id,
                },
              })
            }
            style={styles.ctaLinkWrap}
          />
          {!isCreator ? (
            <SoftLink
              muted
              label="Report"
              onPress={() =>
                router.push({ pathname: '/report', params: { id: drop.id } })
              }
              style={styles.ctaLinkWrap}
            />
          ) : null}
        </View>

        <BannerAdSlot />
      </ScrollView>
      </FadeIn>

      <Modal
        visible={photoFullscreen && Boolean(mediaUrl)}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoFullscreen(false)}
        statusBarTranslucent
      >
        <StatusBar barStyle="light-content" />
        <Pressable
          style={styles.photoFullscreen}
          onPress={() => setPhotoFullscreen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close full screen photo"
        >
          {mediaUrl ? (
            <Image
              source={{ uri: mediaUrl }}
              style={styles.photoFullscreenImage}
              resizeMode="contain"
            />
          ) : null}
          <Pressable
            onPress={() => setPhotoFullscreen(false)}
            hitSlop={{ top: 16, bottom: 16, left: 20, right: 20 }}
            style={[styles.photoFullscreenClose, { top: insets.top + 8 }]}
          >
            <Text style={styles.photoFullscreenCloseText}>Close</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    pad: { padding: layout.gutter, gap: 20 },
    scroll: { flex: 1 },
    content: {
      flexGrow: 1,
      paddingHorizontal: layout.gutter,
      paddingTop: 4,
      paddingBottom: 56,
      gap: 22,
    },
    topBar: {
      marginBottom: -4,
    },
    hero: {
      gap: 10,
      paddingBottom: 8,
    },
    heroRule: {
      width: 22,
      height: StyleSheet.hairlineWidth * 2,
      backgroundColor: palette.accent,
      borderRadius: 1,
      marginBottom: 6,
    },
    type: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 2.8,
      textTransform: 'uppercase',
      color: palette.accent,
    },
    title: {
      fontFamily: typography.brand,
      fontSize: 34,
      letterSpacing: -1.2,
      lineHeight: 38,
      color: palette.text,
      marginTop: 4,
    },
    body: {
      fontFamily: typography.body,
      fontSize: 17,
      lineHeight: 27,
      color: palette.text,
      maxWidth: 340,
    },
    blockBody: {
      fontFamily: typography.body,
      fontSize: 16,
      lineHeight: 25,
      color: palette.textMuted,
    },
    blockHint: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: 18,
      color: palette.textDim,
      marginTop: -4,
    },
    photo: {
      width: '100%',
      height: 340,
      backgroundColor: palette.bgSoft,
      borderRadius: 6,
    },
    photoWrap: {
      gap: 8,
    },
    photoHint: {
      fontFamily: typography.body,
      fontSize: 11,
      letterSpacing: 0.2,
      color: palette.textDim,
    },
    photoFullscreen: {
      flex: 1,
      backgroundColor: '#000',
      justifyContent: 'center',
      alignItems: 'center',
    },
    photoFullscreenImage: {
      width: '100%',
      height: '100%',
    },
    photoFullscreenClose: {
      position: 'absolute',
      right: layout.gutter,
      minHeight: 44,
      minWidth: 72,
      paddingVertical: 10,
      paddingHorizontal: 8,
      justifyContent: 'center',
      zIndex: 2,
    },
    photoFullscreenCloseText: {
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      color: '#fff',
    },
    video: {
      width: '100%',
      height: 320,
      backgroundColor: palette.bgSoft,
      borderRadius: 6,
    },
    placeStamp: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 4,
    },
    placeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: palette.accent,
      opacity: 0.7,
    },
    place: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 0.3,
      color: palette.textDim,
    },
    block: {
      gap: 12,
      paddingTop: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.border,
    },
    editBlock: {
      gap: 14,
      marginTop: 8,
    },
    blockLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 2.6,
      textTransform: 'uppercase',
      color: palette.accent,
    },
    contribution: {
      flex: 1,
      fontFamily: typography.body,
      fontSize: 15,
      lineHeight: 22,
      color: palette.textMuted,
    },
    meta: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: 18,
      color: palette.textDim,
    },
    reactionCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 8,
    },
    contribRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 6,
    },
    reactionEmoji: { fontSize: 22, lineHeight: 28 },
    reactionText: { flex: 1, gap: 4 },
    reactionNote: {
      fontFamily: typography.body,
      fontSize: 15,
      lineHeight: 22,
      color: palette.text,
    },
    linkRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
    },
    linkDanger: {
      fontFamily: typography.bodyMedium,
      fontSize: 14,
      color: palette.danger,
    },
    linkSep: {
      fontFamily: typography.body,
      fontSize: 14,
      color: palette.textDim,
    },
    ctaLinkWrap: {
      alignItems: 'center',
      paddingVertical: 4,
    },
    visRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    visChip: {
      flexGrow: 1,
      minWidth: '30%',
    },
    emojiRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    emojiBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.borderStrong,
    },
    emojiActive: {
      borderColor: palette.accent,
      backgroundColor: palette.accentSoft,
    },
    emoji: { fontSize: 20 },
    cta: {
      marginTop: 12,
      gap: 12,
      paddingTop: 22,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.border,
    },
    ctaEyebrow: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 2.8,
      color: palette.accent,
    },
    ctaCopy: {
      fontFamily: typography.display,
      fontSize: 20,
      letterSpacing: -0.4,
      lineHeight: 26,
      color: palette.text,
      marginBottom: 4,
    },
    error: {
      fontFamily: typography.body,
      fontSize: 15,
      color: palette.danger,
    },
  });
}
