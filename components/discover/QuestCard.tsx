import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { MIN_TOUCH, leading, radii, space, typography, type ThemeColors } from '@/constants/theme';
import { trackEvent } from '@/services/analytics';
import { fetchQuestPlan } from '@/services/aiNarrator';
import { planQuestLocal, type Quest } from '@/services/quest';
import { partOfDay, type SenseSignal } from '@/services/sense';
import type { DropType } from '@/types/drop';

type Props = {
  signals: SenseSignal[];
  onOpenDrop: (dropId: string) => void;
  /** Types the walker found recently (newest first) — novelty signal for the fallback. */
  recentTypes?: DropType[];
};

const TIMES = [15, 30, 60] as const;
const MOODS = ['Chill', 'Curious', 'Brave'] as const;
const MOOD_KEY = { Chill: 'chill', Curious: 'curious', Brave: 'brave' } as const;
const MOOD_INTENT: Record<(typeof MOODS)[number], string> = {
  Chill: 'calm and unhurried',
  Curious: 'curious about unusual things',
  Brave: 'adventurous and bold',
};

/**
 * Quest Agent — Muse plans a 1–3 stop walk with tool calling. The agent's tool
 * trace is shown so the AI work is visible. Falls back to a local plan.
 */
export function QuestCard({ signals, onOpenDrop, recentTypes }: Props) {
  const { colors } = useTheme();
  const { t, locale, typeLabel } = useI18n();
  const styles = useMemo(() => createStyles(colors, locale), [colors, locale]);
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<number>(30);
  const [mood, setMood] = useState<(typeof MOODS)[number]>('Curious');
  const [busy, setBusy] = useState(false);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [failed, setFailed] = useState(false);

  const timeKey = { 15: 'questTime15', 30: 'questTime30', 60: 'questTime60' } as const;
  const moodKey = {
    Chill: 'questMoodChill',
    Curious: 'questMoodCurious',
    Brave: 'questMoodBrave',
  } as const;

  const plan = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setQuest(null);
    let result = await fetchQuestPlan({
      signals,
      intent: MOOD_INTENT[mood],
      minutes,
      locale: locale === 'bn' ? 'bn' : 'en',
      localHour: new Date().getHours(),
      mood: MOOD_KEY[mood],
    }).catch(() => null);
    if (!result) {
      result = planQuestLocal(signals, minutes, {
        mood: MOOD_KEY[mood],
        partOfDay: partOfDay(new Date()),
        recentTypes,
      });
    }
    setBusy(false);
    if (!result) {
      setFailed(true);
      return;
    }
    setQuest(result);
    trackEvent('quest_planned', {
      ai: result.ai,
      steps: result.steps.length,
      minutes,
    }).catch(() => undefined);
  };

  if (signals.length === 0) return null;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((v) => !v)}
        style={styles.head}
      >
        <Text style={styles.glyph}>⌖</Text>
        <View style={styles.aiPill}>
          <Text style={styles.aiPillText}>{t('aiBadge')}</Text>
        </View>
        <Text style={styles.eyebrow}>{t('questEyebrow')}</Text>
        <Text style={styles.chevron}>{open ? '⌃' : '›'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <View style={styles.chips}>
            {TIMES.map((m) => (
              <Pressable
                key={m}
                onPress={() => setMinutes(m)}
                style={[styles.chip, minutes === m && styles.chipOn]}
              >
                <Text style={[styles.chipText, minutes === m && styles.chipTextOn]}>
                  {t(timeKey[m])}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chips}>
            {MOODS.map((m) => (
              <Pressable
                key={m}
                onPress={() => setMood(m)}
                style={[styles.chip, mood === m && styles.chipOn]}
              >
                <Text style={[styles.chipText, mood === m && styles.chipTextOn]}>
                  {t(moodKey[m])}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={plan}
            disabled={busy}
            style={({ pressed }) => [styles.cta, (pressed || busy) && { opacity: 0.6 }]}
          >
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={colors.bg} />
                <Text style={styles.ctaText}>{t('questPlanning')}</Text>
              </View>
            ) : (
              <Text style={styles.ctaText}>{t('questCta')}</Text>
            )}
          </Pressable>

          {failed ? <Text style={styles.muted}>{t('questEmpty')}</Text> : null}

          {quest ? (
            <View style={styles.result}>
              {quest.title ? <Text style={styles.title}>{quest.title}</Text> : null}
              {quest.steps.map((s, i) => (
                <Pressable
                  key={s.dropId}
                  accessibilityRole="button"
                  onPress={() => onOpenDrop(s.dropId)}
                  style={({ pressed }) => [styles.step, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.stepNum}>{i + 1}</Text>
                  <View style={styles.stepCopy}>
                    <Text style={styles.stepTitle} numberOfLines={2}>
                      {s.teaser ?? typeLabel(s.type)}
                    </Text>
                    <Text style={styles.muted}>
                      {typeLabel(s.type)} · {s.walkMinutes} {t('questMinSuffix')}
                    </Text>
                    {s.why || s.whyKey ? (
                      <Text style={styles.why} accessibilityLabel={`${t('whyLabel')}: ${s.why ?? t(s.whyKey!)}`}>
                        ✦ {s.why ?? t(s.whyKey!)}
                      </Text>
                    ) : null}
                    {s.sponsored ? (
                      <Text style={styles.sponsored}>
                        {t('questSponsored')}
                        {s.business ? ` · ${s.business}` : ''}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
              {quest.ai && quest.trace.length > 0 ? (
                <Text style={styles.trace} numberOfLines={2}>
                  {t('questTools')}: {quest.trace.join(' → ')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors, locale: 'en' | 'bn') {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      borderRadius: radii.md,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      marginBottom: space.md,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: MIN_TOUCH },
    glyph: { fontFamily: typography.bodyMedium, fontSize: 16, color: colors.accent },
    aiPill: {
      backgroundColor: colors.accent,
      borderRadius: radii.sm,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
    },
    aiPillText: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: locale === 'bn' ? 0 : 0.8,
      color: colors.bg,
    },
    eyebrow: {
      flex: 1,
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: locale === 'bn' ? 0 : 1.6,
      textTransform: 'uppercase',
      color: colors.accent,
    },
    chevron: { fontFamily: typography.body, fontSize: 20, color: colors.textDim },
    body: { gap: space.md, marginTop: space.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    chip: {
      minHeight: MIN_TOUCH,
      justifyContent: 'center',
      paddingHorizontal: space.lg,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
    },
    chipOn: { borderColor: colors.accent },
    chipText: {
      fontFamily: typography.body,
      fontSize: 14,
      lineHeight: leading(locale, 14),
      color: colors.textMuted,
    },
    chipTextOn: { fontFamily: typography.bodyMedium, color: colors.accent },
    cta: {
      backgroundColor: colors.accent,
      borderRadius: radii.md,
      minHeight: 52,
      paddingHorizontal: space.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    busyRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
    ctaText: {
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      lineHeight: leading(locale, 15),
      color: colors.bg,
      textAlign: 'center',
    },
    result: { gap: space.sm },
    title: {
      fontFamily: typography.bodyMedium,
      fontSize: 16,
      lineHeight: leading(locale, 16),
      color: colors.text,
    },
    step: {
      flexDirection: 'row',
      gap: space.md,
      alignItems: 'center',
      minHeight: MIN_TOUCH,
      paddingVertical: space.xs,
    },
    stepNum: {
      width: space.xl,
      textAlign: 'center',
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      color: colors.accent,
    },
    stepCopy: { flex: 1, gap: space.xs },
    stepTitle: {
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      lineHeight: leading(locale, 15),
      color: colors.text,
    },
    why: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: leading(locale, 13),
      color: colors.textMuted,
    },
    sponsored: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      lineHeight: leading(locale, 12),
      color: colors.accent,
    },
    muted: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: leading(locale, 13),
      color: colors.textMuted,
    },
    trace: {
      fontFamily: typography.body,
      fontSize: 12,
      lineHeight: leading(locale, 12),
      color: colors.textDim,
    },
  });
}
