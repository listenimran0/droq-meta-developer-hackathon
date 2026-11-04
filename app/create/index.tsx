import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { CloseButton } from '@/components/ui/CloseButton';
import { SoftLink } from '@/components/ui/SoftLink';
import { TextField } from '@/components/ui/TextField';
import { GhostWriter } from '@/components/create/GhostWriter';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import {
  DEFAULT_UNLOCK_RADIUS_M,
  DROP_TYPE_HINTS,
  GHOST_UNLOCK_OPTIONS,
  MVP_DROP_TYPES,
  SAFETY_COPY,
  UNLOCK_RADIUS_OPTIONS,
  VIDEO_ENABLED,
  VIDEO_MAX_DURATION_MS,
  VISIBILITY_OPTIONS,
  VOICE_MAX_DURATION_MS,
} from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { usePlantLocation } from '@/hooks/usePlantLocation';
import { useI18n } from '@/hooks/useI18n';
import { createDrop } from '@/services/drops';
import { listFriendships } from '@/services/friends';
import { recordHumanChainHop } from '@/services/evolve';
import { uploadPhoto, uploadVideo, uploadVoice } from '@/services/media';
import { enqueueCreateDrop } from '@/services/offlineQueue';
import type { DropType, DropVisibility, Friendship } from '@/types/drop';
import { formatAccuracy, isAccuracyGoodEnoughToCreate } from '@/utils/location';
import { userErrorMessage } from '@/lib/userError';
import { useTheme } from '@/hooks/useTheme';
import { BUSINESS_CATEGORIES, type BusinessCategory } from '@/services/matching';
import { MIN_TOUCH, layout, leading, space, typography, type ThemeColors } from '@/constants/theme';

const CATEGORY_KEY = {
  cafe: 'catCafe', food: 'catFood', books: 'catBooks', shop: 'catShop', art: 'catArt', other: 'catOther',
} as const;

/** 1 Make · 2 Who finds it · 3 Leave it */
type Step = 1 | 2 | 3;

export default function CreateDropScreen() {
  const router = useRouter();
  const { t: tr, typeLabel, locale } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams<{
    humanRoot?: string;
    fromDrop?: string;
    preferType?: string;
    business?: string;
  }>();
  const { user } = useAuth();
  const { coords, loading: locationLoading, error: locationError, refresh, resolveForPlant } =
    usePlantLocation();
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const [step, setStep] = useState<Step>(1);
  const [type, setType] = useState<DropType>(() => {
    const pref = params.preferType as DropType | undefined;
    if (pref && MVP_DROP_TYPES.includes(pref)) return pref;
    return 'memory';
  });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [puzzleAnswer, setPuzzleAnswer] = useState('');
  const [chainHint, setChainHint] = useState('');
  const [isBusiness, setIsBusiness] = useState(params.business === '1');
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState<BusinessCategory>('cafe');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [unlockRadius, setUnlockRadius] = useState(DEFAULT_UNLOCK_RADIUS_M);
  const [visibility, setVisibility] = useState<DropVisibility>('public');
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [friendRows, setFriendRows] = useState<Friendship[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [timeLock, setTimeLock] = useState<'now' | 'future'>(() =>
    params.preferType === 'time_capsule' ? 'future' : 'now',
  );
  const [unlockAt, setUnlockAt] = useState<string | null>(() => {
    if (params.preferType === 'time_capsule') {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString();
    }
    return null;
  });
  const [ghostDays, setGhostDays] = useState(30);
  const [showMore, setShowMore] = useState(
    () => params.preferType === 'time_capsule',
  );
  const [showMoreTypes, setShowMoreTypes] = useState(() => {
    const pref = params.preferType as DropType | undefined;
    return Boolean(pref && !['memory', 'message', 'photo', 'voice'].includes(pref));
  });
  const [submitting, setSubmitting] = useState(false);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingRef = useRef(false);

  const isRecording = recorderState.isRecording;
  recordingRef.current = isRecording;
  const availableTypes = MVP_DROP_TYPES.filter((t) => t !== 'video' || VIDEO_ENABLED);
  const primaryTypes = availableTypes.filter((t) =>
    (['memory', 'message', 'photo', 'voice'] as DropType[]).includes(t),
  );
  const extraTypes = availableTypes.filter(
    (t) => !(['memory', 'message', 'photo', 'voice'] as DropType[]).includes(t),
  );
  const visibleTypes = showMoreTypes ? availableTypes : primaryTypes;

  const acceptedFriends = useMemo(() => {
    if (!user?.id) return [];
    return friendRows
      .filter((f) => f.status === 'accepted')
      .map((f) => {
        const other = f.requester_id === user.id ? f.addressee : f.requester;
        return {
          id: f.requester_id === user.id ? f.addressee_id : f.requester_id,
          label: other?.display_name || other?.username || 'Friend',
          handle: other?.username ? `@${other.username}` : null,
          avatar_url: other?.avatar_url ?? null,
        };
      })
      .filter((f) => Boolean(f.id));
  }, [friendRows, user?.id]);

  const recipientLabel = useMemo(() => {
    if (visibility !== 'direct' || !recipientId) return null;
    return acceptedFriends.find((f) => f.id === recipientId)?.label ?? 'Friend';
  }, [visibility, recipientId, acceptedFriends]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setFriendsLoading(true);
        try {
          const rows = await listFriendships(80, 0);
          if (active) setFriendRows(rows);
        } catch {
          if (active) setFriendRows([]);
        } finally {
          if (active) setFriendsLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const contentReady = useMemo(() => {
    if (
      type === 'message' ||
      type === 'memory' ||
      type === 'challenge' ||
      type === 'secret' ||
      type === 'time_capsule'
    ) {
      return content.trim().length > 0;
    }
    if (type === 'puzzle') {
      return content.trim().length > 0 && puzzleAnswer.trim().length > 0;
    }
    if (type === 'photo') return Boolean(photoUri);
    if (type === 'voice') return Boolean(voiceUri);
    if (type === 'video') return Boolean(videoUri);
    return true;
  }, [type, content, photoUri, voiceUri, videoUri, puzzleAnswer]);

  const canContinue =
    step === 1
      ? contentReady
      : step === 2
        ? visibility !== 'direct' || Boolean(recipientId)
        : true;

  const createAccuracyOk = isAccuracyGoodEnoughToCreate(coords?.accuracy);
  const createAccuracyLabel =
    coords?.accuracy != null ? formatAccuracy(coords.accuracy) : null;

  useEffect(() => {
    return () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
    };
  }, []);

  const selectType = (t: DropType) => {
    setType(t);
    if (t === 'time_capsule') {
      setTimeLock('future');
      setGhostDays(30);
      setShowMore(true);
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setUnlockAt(d.toISOString());
    } else if (t === 'secret') {
      setUnlockRadius(25);
    }
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera', 'Camera permission is needed for photo Drops.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
      allowsEditing: true,
      aspect: [4, 5],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const pickPhotoFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos', 'Photo library permission is needed to choose a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: true,
      aspect: [4, 5],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const pickVideo = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera', 'Camera permission is needed for video Drops.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: Math.floor(VIDEO_MAX_DURATION_MS / 1000),
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.duration && asset.duration > VIDEO_MAX_DURATION_MS / 1000 + 0.5) {
        Alert.alert('Too long', 'Videos must be 15 seconds or less.');
        return;
      }
      setVideoUri(asset.uri);
    }
  };

  const pickVideoFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Videos', 'Photo library permission is needed to choose a video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: Math.floor(VIDEO_MAX_DURATION_MS / 1000),
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.duration && asset.duration > VIDEO_MAX_DURATION_MS / 1000 + 0.5) {
        Alert.alert('Too long', 'Videos must be 15 seconds or less.');
        return;
      }
      setVideoUri(asset.uri);
    }
  };

  const startRecording = async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microphone', 'Microphone permission is needed for voice Drops.');
      return;
    }
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
    setVoiceUri(null);

    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => {
      stopRecording().catch(() => undefined);
    }, VOICE_MAX_DURATION_MS);
  };

  const stopRecording = async () => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
    if (!recordingRef.current && !recorderState.isRecording) return;
    try {
      await audioRecorder.stop();
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 80));
    setVoiceUri(audioRecorder.uri ?? null);
    await setAudioModeAsync({ allowsRecording: false });
  };

  const submit = async () => {
    if (visibility === 'direct' && !recipientId) {
      Alert.alert('One friend', 'Pick who this Drop is for.');
      return;
    }
    setSubmitting(true);
    let position = coords;
    try {
      // The same fix the "Plant here" card showed — never a different spot.
      position = await resolveForPlant();
      if (!isAccuracyGoodEnoughToCreate(position.accuracy)) {
        throw new Error(
          `Location isn’t accurate enough yet (±${Math.round(position.accuracy ?? 0)}m). Step outside, wait a moment, then try again.`,
        );
      }

      const baseInput = {
        type,
        title: title.trim() || undefined,
        content: content.trim() || undefined,
        latitude: position.latitude,
        longitude: position.longitude,
        unlockRadius,
        visibility,
        recipientId: visibility === 'direct' ? recipientId : null,
        unlockAt: timeLock === 'future' ? unlockAt : null,
        puzzleAnswer: type === 'puzzle' ? puzzleAnswer.trim() : null,
        chainHint: chainHint.trim() || null,
        humanChainRootId: params.humanRoot ?? null,
        parentDropId: params.fromDrop ?? null,
        isBusiness: isBusiness && businessName.trim().length > 0,
        businessName: isBusiness ? businessName.trim().slice(0, 60) : null,
        businessCategory: isBusiness ? businessCategory : null,
      };

      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        await enqueueCreateDrop({
          ...baseInput,
          localPhotoUri: photoUri,
          localVoiceUri: voiceUri,
          localVideoUri: videoUri,
        });
        Alert.alert(
          'Saved offline',
          'Your Drop will upload automatically when you’re back online.',
        );
        router.replace('/(tabs)/home');
        return;
      }

      let mediaPath: string | undefined;
      if (type === 'photo' && photoUri) mediaPath = await uploadPhoto(photoUri);
      if (type === 'voice' && voiceUri) mediaPath = await uploadVoice(voiceUri);
      if (type === 'video' && videoUri) mediaPath = await uploadVideo(videoUri);

      const drop = await createDrop({ ...baseInput, mediaPath });

      if (params.humanRoot) {
        await recordHumanChainHop({
          rootDropId: params.humanRoot,
          fromDropId: params.fromDrop ?? null,
          toDropId: drop.id,
          latitude: position.latitude,
          longitude: position.longitude,
        }).catch(() => undefined);
      }

      router.replace({
        pathname: '/create/preview',
        params: { id: drop.id },
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      const message = userErrorMessage(e, 'Try again.');
      if (position && /network|fetch|offline|Failed to fetch/i.test(raw)) {
        try {
          await enqueueCreateDrop({
            type,
            title: title.trim() || undefined,
            content: content.trim() || undefined,
            latitude: position.latitude,
            longitude: position.longitude,
            unlockRadius,
            visibility,
            unlockAt: timeLock === 'future' ? unlockAt : null,
            puzzleAnswer: type === 'puzzle' ? puzzleAnswer.trim() : null,
            chainHint: chainHint.trim() || null,
            humanChainRootId: params.humanRoot ?? null,
            parentDropId: params.fromDrop ?? null,
            localPhotoUri: photoUri,
            localVoiceUri: voiceUri,
            localVideoUri: videoUri,
          });
          Alert.alert('Saved offline', 'We’ll retry the upload when you’re online.');
          router.replace('/(tabs)/home');
          return;
        } catch {
          // fall through
        }
      }
      Alert.alert('Couldn’t leave your Drop', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen ambient="none">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <CloseButton
            compact
            label={step === 1 ? tr('close') : tr('back')}
            onPress={() => (step === 1 ? (router.canGoBack() ? router.back() : router.replace('/(tabs)/home')) : setStep((s) => (s - 1) as Step))}
          />

          <View style={styles.progress}>
            {([1, 2, 3] as Step[]).map((s) => (
              <View key={s} style={styles.progressItem}>
                <View style={[styles.progressTick, s < step && styles.progressTickDone, s === step && styles.progressTickOn]}>
                  <Text
                    style={[
                      styles.progressTickNum,
                      s < step && styles.progressTickNumDone,
                      s === step && styles.progressTickNumOn,
                    ]}
                  >
                    {s}
                  </Text>
                </View>
                <Text style={[styles.progressLabel, s === step && styles.progressLabelOn]}>
                  {s === 1 ? 'What' : s === 2 ? 'Who' : 'Leave'}
                </Text>
              </View>
            ))}
          </View>

          <ScreenHeader
            title={step === 1 ? tr('stepMake') : step === 2 ? tr('stepWho') : tr('stepLeave')}
            subtitle={stepSubtitle(step, type)}
            size="display"
          />

          {params.humanRoot ? (
            <Text style={styles.chainBanner}>Continuing a trail from this place.</Text>
          ) : null}

          {step === 1 && (
            <View style={styles.form}>
              <View style={styles.block}>
                <View style={styles.typeHeader}>
                  <Text style={styles.sectionLabel}>Type</Text>
                  {extraTypes.length > 0 ? (
                    <SoftLink
                      label={showMoreTypes ? 'Less' : 'More'}
                      onPress={() => setShowMoreTypes((v) => !v)}
                    />
                  ) : null}
                </View>
                <View style={styles.typeGrid}>
                  {visibleTypes.map((t) => (
                    <Chip
                      key={t}
                      label={typeLabel(t)}
                      selected={type === t}
                      onPress={() => selectType(t)}
                      dense
                      style={styles.chipHalf}
                    />
                  ))}
                </View>
                {DROP_TYPE_HINTS[type] ? (
                  <Text style={styles.typeHint}>{DROP_TYPE_HINTS[type]}</Text>
                ) : null}
              </View>

              <View style={styles.block}>
                <TextField
                  label="Title (optional)"
                  value={title}
                  onChangeText={setTitle}
                  placeholder="A quiet title"
                />

                {(type === 'memory' ||
                  type === 'message' ||
                  type === 'puzzle' ||
                  type === 'challenge' ||
                  type === 'secret' ||
                  type === 'time_capsule') && (
                  <>
                  <TextField
                    label={
                      type === 'puzzle'
                        ? 'Clue'
                        : type === 'challenge'
                          ? 'Starter note'
                          : type === 'secret'
                            ? 'Secret'
                            : type === 'time_capsule'
                              ? 'Sealed message'
                              : type === 'memory'
                                ? 'Memory'
                                : 'Message'
                    }
                    value={content}
                    onChangeText={setContent}
                    placeholder={
                      type === 'puzzle'
                        ? 'What do you see when the light hits the railing?'
                        : type === 'challenge'
                          ? 'Start something others can grow…'
                          : type === 'secret'
                            ? 'Only for whoever stands exactly here…'
                            : type === 'time_capsule'
                              ? 'Open this when the date arrives…'
                              : type === 'memory'
                                ? 'I met my best friend here.'
                                : 'For whoever finds this…'
                    }
                    multiline
                    style={{ minHeight: 120, textAlignVertical: 'top' }}
                  />
                  {/* Muse drafts ideas + pre-screens safety; tap fills the field */}
                  <GhostWriter
                    key={type}
                    draft={content}
                    dropType={type}
                    onPick={setContent}
                    business={isBusiness}
                    businessName={businessName}
                  />
                  </>
                )}

                {type === 'puzzle' && (
                  <TextField
                    label="Secret answer"
                    value={puzzleAnswer}
                    onChangeText={setPuzzleAnswer}
                    placeholder="Required to unlock"
                    autoCapitalize="none"
                  />
                )}

                {(type === 'puzzle' || type === 'challenge' || type === 'memory') && (
                  <TextField
                    label="Hint to next place (optional)"
                    value={chainHint}
                    onChangeText={setChainHint}
                    placeholder="A soft nudge toward the next stop"
                  />
                )}

                <View style={styles.businessRow}>
                  <View style={styles.businessCopy}>
                    <Text style={styles.sectionLabel}>{tr('businessDrop')}</Text>
                    <Text style={[styles.typeHint, { lineHeight: leading(locale, 13, 1.45, 1.7) }]}>
                      {tr('businessDropHint')}
                    </Text>
                  </View>
                  <Switch
                    value={isBusiness}
                    onValueChange={setIsBusiness}
                    trackColor={{ true: colors.accent, false: colors.border }}
                    thumbColor={colors.bgElevated}
                    accessibilityLabel={tr('businessDrop')}
                  />
                </View>
                {isBusiness ? (
                  <TextField
                    label={tr('businessName')}
                    value={businessName}
                    onChangeText={(v) => setBusinessName(v.slice(0, 60))}
                    placeholder={tr('businessNamePlaceholder')}
                    maxLength={60}
                  />
                ) : null}
                {isBusiness ? (
                  <View style={styles.categoryBlock}>
                    <Text style={styles.sectionLabel}>{tr('businessCategory')}</Text>
                    <View style={styles.categoryRow}>
                      {BUSINESS_CATEGORIES.map((c) => (
                        <Chip
                          key={c}
                          dense
                          label={tr(CATEGORY_KEY[c])}
                          selected={businessCategory === c}
                          onPress={() => setBusinessCategory(c)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {type === 'photo' && (
                  <View style={styles.mediaBlock}>
                    {photoUri ? (
                      <Image source={{ uri: photoUri }} style={styles.photo} />
                    ) : null}
                    <Button
                      label={photoUri ? 'Retake photo' : 'Capture photo'}
                      variant={photoUri ? 'ghost' : 'primary'}
                      onPress={pickPhoto}
                    />
                    <Button
                      label={photoUri ? 'Choose another' : 'Choose from library'}
                      variant="ghost"
                      onPress={pickPhotoFromLibrary}
                    />
                  </View>
                )}

                {type === 'video' && (
                  <View style={styles.mediaBlock}>
                    <Text style={styles.meta}>
                      {videoUri ? 'Video captured (max 15s)' : 'Max 15 seconds · under 8MB'}
                    </Text>
                    <Button
                      label={videoUri ? 'Retake video' : 'Capture video'}
                      variant={videoUri ? 'ghost' : 'primary'}
                      onPress={pickVideo}
                    />
                    <Button
                      label={videoUri ? 'Choose another' : 'Choose from library'}
                      variant="ghost"
                      onPress={pickVideoFromLibrary}
                    />
                  </View>
                )}

                {type === 'voice' && (
                  <View style={styles.mediaBlock}>
                    <Text style={styles.meta}>
                      {voiceUri
                        ? 'Voice captured (max 30s)'
                        : isRecording
                          ? 'Recording…'
                          : 'Max 30 seconds'}
                    </Text>
                    <Button
                      label={isRecording ? 'Stop' : voiceUri ? 'Re-record' : 'Record voice'}
                      variant={voiceUri && !isRecording ? 'ghost' : 'primary'}
                      onPress={() => (isRecording ? stopRecording() : startRecording())}
                    />
                  </View>
                )}
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.form}>
              <View style={styles.block}>
                <Text style={styles.sectionLabel}>Who can find it</Text>
                <View style={styles.typeGrid}>
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.value}
                      label={opt.label}
                      selected={visibility === opt.value}
                      dense
                      style={styles.chipHalf}
                      onPress={() => {
                        setVisibility(opt.value);
                        if (opt.value !== 'direct') setRecipientId(null);
                      }}
                    />
                  ))}
                </View>
                <Text style={styles.typeHint}>
                  {VISIBILITY_OPTIONS.find((v) => v.value === visibility)?.hint}
                </Text>
              </View>

              {visibility === 'direct' ? (
                <View style={styles.block}>
                  <Text style={styles.sectionLabel}>Pick one friend</Text>
                  {friendsLoading ? (
                    <Text style={styles.meta}>Loading friends…</Text>
                  ) : acceptedFriends.length === 0 ? (
                    <View style={styles.emptyFriends}>
                      <Text style={styles.meta}>
                        Add a friend first, then leave a Drop just for them.
                      </Text>
                      <Button
                        label="Open Friends"
                        variant="ghost"
                        onPress={() => router.push('/friends')}
                      />
                    </View>
                  ) : (
                    <>
                      <View style={styles.friendPickList}>
                        {acceptedFriends.map((f) => (
                          <Pressable
                            key={f.id}
                            onPress={() => setRecipientId(f.id)}
                            style={[
                              styles.friendPickRow,
                              recipientId === f.id && styles.friendPickRowOn,
                            ]}
                          >
                            <Avatar uri={f.avatar_url} name={f.label} size="sm" />
                            <View style={styles.friendPickText}>
                              <Text style={styles.friendPickName} numberOfLines={1}>
                                {f.label}
                              </Text>
                              {f.handle ? (
                                <Text style={styles.friendPickHandle} numberOfLines={1}>
                                  {f.handle}
                                </Text>
                              ) : null}
                            </View>
                          </Pressable>
                        ))}
                      </View>
                      {recipientLabel ? (
                        <Text style={styles.typeHint}>Only {recipientLabel} can unlock this.</Text>
                      ) : (
                        <Text style={styles.typeHint}>Choose who this Drop is for.</Text>
                      )}
                    </>
                  )}
                </View>
              ) : null}

              <View style={styles.block}>
                <Text style={styles.sectionLabel}>Unlock distance</Text>
                <View style={styles.typeGrid}>
                  {UNLOCK_RADIUS_OPTIONS.map((r) => (
                    <Chip
                      key={r}
                      label={`${r}m`}
                      selected={unlockRadius === r}
                      dense
                      style={styles.chipHalf}
                      onPress={() => setUnlockRadius(r)}
                    />
                  ))}
                </View>
                <Text style={styles.typeHint}>
                  {unlockRadius <= 25
                    ? 'Tight — almost on top of it.'
                    : unlockRadius >= 75
                      ? 'Relaxed — nearby is enough.'
                      : 'Balanced for most phones.'}
                </Text>
              </View>

              <View style={styles.block}>
                <View style={styles.typeHeader}>
                  <Text style={styles.sectionLabel}>Seal date</Text>
                  {type !== 'time_capsule' ? (
                    <SoftLink
                      label={showMore ? 'Hide' : 'Add'}
                      onPress={() => setShowMore((v) => !v)}
                    />
                  ) : null}
                </View>

                {showMore || type === 'time_capsule' ? (
                  <>
                    <View style={styles.typeGrid}>
                      {type !== 'time_capsule' ? (
                        <Chip
                          label="Available now"
                          selected={timeLock === 'now'}
                          dense
                          style={styles.chipHalf}
                          onPress={() => {
                            setTimeLock('now');
                            setUnlockAt(null);
                          }}
                        />
                      ) : null}
                      {GHOST_UNLOCK_OPTIONS.map((opt) => (
                        <Chip
                          key={opt.days}
                          label={opt.label}
                          selected={timeLock === 'future' && ghostDays === opt.days}
                          dense
                          style={styles.chipHalf}
                          onPress={() => {
                            setTimeLock('future');
                            setGhostDays(opt.days);
                            const d = new Date();
                            d.setDate(d.getDate() + opt.days);
                            setUnlockAt(d.toISOString());
                          }}
                        />
                      ))}
                    </View>
                    <Text style={styles.typeHint}>
                      {timeLock === 'future' && unlockAt
                        ? `Opens ${new Date(unlockAt).toLocaleString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}`
                        : 'Unlock as soon as they’re close.'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.typeHint}>Optional — seal until a future date.</Text>
                )}
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={styles.form}>
              <View style={styles.block}>
                <Text style={styles.sectionLabel}>Summary</Text>
                <Text style={styles.reviewTitle}>
                  {title.trim() || typeLabel(type)}
                </Text>
                <View style={styles.typeGrid}>
                  <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipLabel}>Type</Text>
                    <Text style={styles.summaryChipValue} numberOfLines={1}>
                      {typeLabel(type)}
                    </Text>
                  </View>
                  <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipLabel}>Who</Text>
                    <Text style={styles.summaryChipValue} numberOfLines={1}>
                      {recipientLabel ??
                        VISIBILITY_OPTIONS.find((v) => v.value === visibility)?.label ??
                        visibility}
                    </Text>
                  </View>
                  <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipLabel}>Distance</Text>
                    <Text style={styles.summaryChipValue}>{unlockRadius}m</Text>
                  </View>
                  <View style={styles.summaryChip}>
                    <Text style={styles.summaryChipLabel}>Seal</Text>
                    <Text style={styles.summaryChipValue} numberOfLines={1}>
                      {timeLock === 'future' && unlockAt
                        ? new Date(unlockAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'Now'}
                    </Text>
                  </View>
                </View>
              </View>

              {(content || photoUri || videoUri || voiceUri) && (
                <View style={styles.block}>
                  <Text style={styles.sectionLabel}>Contents</Text>
                  {content ? (
                    <Text style={styles.previewBody} numberOfLines={4}>
                      {content}
                    </Text>
                  ) : null}
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                  ) : null}
                  {videoUri ? <Text style={styles.typeHint}>Video attached</Text> : null}
                  {voiceUri ? <Text style={styles.typeHint}>Voice attached</Text> : null}
                </View>
              )}

              <View style={styles.placeCard}>
                <Text style={styles.placeCardEyebrow}>Plant here</Text>
                <Text style={styles.placeCardTitle}>At your spot</Text>
                <Text style={styles.typeHint}>{SAFETY_COPY}</Text>
                {createAccuracyLabel ? (
                  <Text style={createAccuracyOk ? styles.placeCardMeta : styles.locError}>
                    GPS accuracy {createAccuracyLabel}
                    {createAccuracyOk
                      ? ' — clear enough to leave.'
                      : ' — too rough to plant. Step outside and wait for a clearer fix.'}
                  </Text>
                ) : locationLoading ? (
                  <Text style={styles.placeCardMeta}>Getting a clear GPS fix…</Text>
                ) : null}
                {!createAccuracyOk && coords ? (
                  <Button label="Refresh location" variant="ghost" onPress={() => refresh()} />
                ) : null}
                {locationError ? (
                  <Text style={styles.locError}>
                    {locationError}{' '}
                    <Text style={styles.locRetry} onPress={() => refresh()}>
                      Try again
                    </Text>
                  </Text>
                ) : null}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step < 3 ? (
            <Button
              label={step === 1 ? 'Next' : 'Review'}
              disabled={!canContinue}
              onPress={() => {
                if (step === 2 && visibility === 'direct' && !recipientId) {
                  Alert.alert('One friend', 'Pick who this Drop is for.');
                  return;
                }
                setStep((s) => Math.min(3, s + 1) as Step);
              }}
            />
          ) : (
            <Button
              label="Leave it here"
              loading={submitting || locationLoading}
              disabled={!createAccuracyOk}
              onPress={submit}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function stepSubtitle(step: Step, type: DropType): string {
  switch (step) {
    case 1:
      return 'Choose what you’re leaving, then write or capture it.';
    case 2:
      return 'Who can find it, how close they need to be, and any seal date.';
    default:
      return DROP_TYPE_HINTS[type] ?? 'Check the summary, then leave it at this spot.';
  }
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: layout.gutter,
      paddingTop: 12,
      paddingBottom: 56,
      gap: 28,
    },
    back: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: palette.textMuted,
    },
    progress: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
    },
    progressItem: {
      flex: 1,
      gap: 8,
      alignItems: 'center',
    },
    progressTick: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: palette.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.bgElevated,
    },
    progressTickOn: {
      borderColor: palette.accent,
      backgroundColor: palette.accentSoft,
    },
    progressTickDone: {
      borderColor: palette.accentLine,
      backgroundColor: palette.accent,
    },
    progressTickNum: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      color: palette.textDim,
    },
    progressTickNumOn: {
      color: palette.accentBright,
    },
    progressTickNumDone: {
      color: palette.ink,
    },
    progressLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: palette.textDim,
      textAlign: 'center',
    },
    progressLabelOn: {
      color: palette.accentBright,
    },
    placeCard: {
      gap: 10,
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.accentLine,
      backgroundColor: palette.accentSoft,
    },
    placeCardEyebrow: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 2.4,
      textTransform: 'uppercase',
      color: palette.accent,
    },
    placeCardTitle: {
      fontFamily: typography.display,
      fontSize: 22,
      color: palette.text,
      letterSpacing: -0.4,
    },
    placeCardMeta: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: 19,
      color: palette.textMuted,
    },
    chainBanner: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: 20,
      color: palette.accent,
    },
    form: { gap: 28 },
    block: { gap: 12 },
    businessRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg, minHeight: MIN_TOUCH, paddingVertical: space.sm },
    businessCopy: { flex: 1, gap: space.xs },
    categoryBlock: { gap: space.sm },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    sectionLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: palette.textMuted,
    },
    typeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    typeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chipHalf: {
      width: '48%',
    },
    typeHint: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: 19,
      color: palette.textDim,
    },
    emptyFriends: { gap: 14 },
    friendPickList: { gap: 4 },
    friendPickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'transparent',
    },
    friendPickRowOn: {
      borderColor: palette.accentLine,
      backgroundColor: palette.accentSoft,
    },
    friendPickText: { flex: 1, gap: 2 },
    friendPickName: {
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      color: palette.text,
    },
    friendPickHandle: {
      fontFamily: typography.body,
      fontSize: 12,
      color: palette.textDim,
    },
    mediaBlock: { gap: 14 },
    photo: {
      width: '100%',
      height: 280,
      backgroundColor: palette.bgSoft,
      borderRadius: 8,
    },
    photoPreview: {
      width: '100%',
      height: 160,
      backgroundColor: palette.bgSoft,
      borderRadius: 8,
    },
    meta: {
      fontFamily: typography.body,
      fontSize: 14,
      lineHeight: 21,
      color: palette.textMuted,
    },
    locError: {
      fontFamily: typography.body,
      fontSize: 14,
      lineHeight: 21,
      color: palette.danger,
      marginTop: 4,
    },
    locRetry: {
      fontFamily: typography.bodyMedium,
      color: palette.accent,
      textDecorationLine: 'underline',
    },
    reviewTitle: {
      fontFamily: typography.display,
      fontSize: 26,
      letterSpacing: -0.4,
      color: palette.text,
    },
    summaryChip: {
      width: '48%',
      minHeight: 56,
      paddingHorizontal: 12,
      paddingVertical: 10,
      justifyContent: 'center',
      gap: 2,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 8,
      backgroundColor: palette.bgSoft,
    },
    summaryChipLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.textDim,
    },
    summaryChipValue: {
      fontFamily: typography.bodyMedium,
      fontSize: 14,
      color: palette.text,
    },
    previewBody: {
      fontFamily: typography.body,
      fontSize: 16,
      lineHeight: 24,
      color: palette.text,
    },
    footer: {
      paddingHorizontal: layout.gutter,
      paddingTop: 8,
      paddingBottom: 12,
    },
  });
}

