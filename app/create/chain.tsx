import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { CloseButton } from '@/components/ui/CloseButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { useTheme } from '@/hooks/useTheme';
import { createDrop, linkNextDrop } from '@/services/drops';
import { createChainWithDrops } from '@/services/evolve';
import { getReliableCoordinatesForCreate } from '@/services/location';
import { DEFAULT_UNLOCK_RADIUS_M } from '@/constants/config';
import { layout, typography, type ThemeColors } from '@/constants/theme';
import { userErrorMessage } from '@/lib/userError';

type StopDraft = { title: string; content: string; hint: string };

const HOW_IT_WORKS = [
  'You write 2–5 stops. Each stop is a Drop with a short message.',
  'They’re planted near where you are now, linked in order.',
  'Stop 2+ stay hidden until the previous stop is unlocked — then the hint leads them on.',
] as const;

/**
 * Multi-stop trail: creates linked Drops near the creator’s GPS so finders
 * unlock them in sequence using chain hints + Continue the trail.
 */
export default function ChainBuilderScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [showHow, setShowHow] = useState(false);
  const [stops, setStops] = useState<StopDraft[]>([
    { title: '', content: '', hint: '' },
    { title: '', content: '', hint: '' },
  ]);
  const [saving, setSaving] = useState(false);

  const updateStop = (index: number, patch: Partial<StopDraft>) => {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addStop = () => {
    if (stops.length >= 5) {
      Alert.alert('That’s enough', 'A trail can have at most 5 stops.');
      return;
    }
    setStops((prev) => [...prev, { title: '', content: '', hint: '' }]);
  };

  const removeStop = (index: number) => {
    if (stops.length <= 2) {
      Alert.alert('Need two stops', 'A trail needs at least a start and a next stop.');
      return;
    }
    setStops((prev) => prev.filter((_, i) => i !== index));
  };

  const create = async () => {
    if (stops.some((s) => !s.content.trim())) {
      Alert.alert('Almost', 'Every stop needs a message for the finder to read.');
      return;
    }
    setSaving(true);
    try {
      const position = await getReliableCoordinatesForCreate();

      // Slight offset per stop so each is a distinct pin (~8–12m apart)
      const ids: string[] = [];
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i]!;
        const lat = position.latitude + i * 0.00008;
        const lng = position.longitude + i * 0.00006;
        const isLast = i === stops.length - 1;
        const drop = await createDrop({
          type: 'memory',
          title: stop.title.trim() || `Stop ${i + 1}`,
          content: stop.content.trim(),
          chainHint: isLast ? null : stop.hint.trim() || 'Keep walking — the next stop is close.',
          latitude: lat,
          longitude: lng,
          unlockRadius: DEFAULT_UNLOCK_RADIUS_M,
          visibility: 'public',
          parentDropId: i > 0 ? ids[i - 1] : null,
        });
        ids.push(drop.id);
      }

      for (let i = 0; i < ids.length - 1; i++) {
        await linkNextDrop(
          ids[i]!,
          ids[i + 1]!,
          stops[i]?.hint.trim() || 'Keep walking — the next stop is close.',
        );
      }

      await createChainWithDrops(title.trim() || 'Untitled trail', ids);

      Alert.alert(
        'Trail is live',
        `${ids.length} linked stops are near you. Stop 2+ stay hidden until someone unlocks the previous stop — then your hint leads them on.`,
        [{ text: 'Done', onPress: () => router.replace('/(tabs)/home') }],
      );
    } catch (e) {
      Alert.alert('Couldn’t plant trail', userErrorMessage(e, 'Try again outdoors with a clear GPS fix.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen ambient="none">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.wrap}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <CloseButton compact />

          <ScreenHeader
            title="Plant a trail"
            subtitle="Linked Drops — unlock one, follow the hint, find the next."
            size="display"
          />

          <Pressable
            onPress={() => setShowHow((v) => !v)}
            style={({ pressed }) => [styles.howBox, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.howTitle}>{showHow ? 'How it works ▴' : 'How it works ▾'}</Text>
            {showHow
              ? HOW_IT_WORKS.map((line, i) => (
                  <View key={line} style={styles.howRow}>
                    <Text style={styles.howNum}>{String(i + 1).padStart(2, '0')}</Text>
                    <Text style={styles.howText}>{line}</Text>
                  </View>
                ))
              : null}
          </Pressable>

          <TextField
            label="Trail name"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Rooftop loop"
          />

          <Text style={styles.sectionLabel}>Stops</Text>
          <Text style={styles.sectionHint}>
            Write what someone discovers at each place. The hint shows only after they unlock that
            stop — point them toward the next one.
          </Text>

          {stops.map((stop, index) => {
            const isLast = index === stops.length - 1;
            return (
              <View key={index} style={styles.stop}>
                <View style={styles.stopHeader}>
                  <Text style={styles.stopLabel}>
                    {index === 0 ? 'Start' : isLast ? 'Last stop' : `Stop ${index + 1}`}
                  </Text>
                  {stops.length > 2 ? (
                    <Pressable onPress={() => removeStop(index)} hitSlop={10}>
                      <Text style={styles.remove}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextField
                  label="Title (optional)"
                  value={stop.title}
                  onChangeText={(v) => updateStop(index, { title: v })}
                  placeholder={index === 0 ? 'Where it begins' : 'Name this mark'}
                />
                <TextField
                  label="Message they unlock"
                  value={stop.content}
                  onChangeText={(v) => updateStop(index, { content: v })}
                  placeholder="What they read when they arrive…"
                  multiline
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
                {!isLast ? (
                  <TextField
                    label="Hint toward the next stop"
                    value={stop.hint}
                    onChangeText={(v) => updateStop(index, { hint: v })}
                    placeholder="e.g. Walk toward the stairs / look left of the tree"
                  />
                ) : (
                  <Text style={styles.lastNote}>
                    Last stop — no hint needed. The trail ends here.
                  </Text>
                )}
              </View>
            );
          })}

          {stops.length < 5 ? (
            <Button label="Add another stop" variant="ghost" onPress={addStop} />
          ) : null}

          <View style={styles.plantNote}>
            <Text style={styles.plantNoteText}>
              Plants all stops near your current location (a few meters apart). Step outside for a
              clear GPS fix, then plant.
            </Text>
          </View>

          <Button
            label={`Plant ${stops.length}-stop trail here`}
            loading={saving}
            onPress={create}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    wrap: {
      flexGrow: 1,
      paddingHorizontal: layout.gutter,
      paddingTop: 12,
      paddingBottom: 56,
      gap: 24,
    },
    back: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: palette.textMuted,
    },
    howBox: {
      gap: 10,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.bgElevated,
    },
    howTitle: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 2.2,
      textTransform: 'uppercase',
      color: palette.accent,
      marginBottom: 2,
    },
    howRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    howNum: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 1,
      color: palette.textDim,
      width: 24,
      marginTop: 1,
    },
    howText: {
      flex: 1,
      fontFamily: typography.body,
      fontSize: 14,
      lineHeight: 20,
      color: palette.textMuted,
    },
    sectionLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: palette.textMuted,
      marginTop: 8,
    },
    sectionHint: {
      fontFamily: typography.body,
      fontSize: 14,
      lineHeight: 21,
      color: palette.textDim,
      marginTop: -12,
    },
    stop: {
      gap: 14,
      paddingTop: 20,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.border,
    },
    stopHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    stopLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: palette.accentBright,
    },
    remove: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.textDim,
    },
    lastNote: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: 19,
      color: palette.textDim,
      fontStyle: 'italic',
    },
    plantNote: {
      paddingVertical: 4,
    },
    plantNoteText: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: 19,
      color: palette.textDim,
      textAlign: 'center',
    },
  });
}
