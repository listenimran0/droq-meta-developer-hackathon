import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { radii, typography, type ThemeColors } from '@/constants/theme';
import { fetchClueAssist, getLastNarratorError, type SafetyVerdict } from '@/services/aiNarrator';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { DropType } from '@/types/drop';

type Props = {
  /** User's rough words — the seed for ideas, also sent for safety check */
  draft: string;
  dropType: DropType;
  onPick: (text: string) => void;
  /** Business switch on → offer teasers instead of clues */
  business?: boolean;
  businessName?: string;
};

/**
 * Ghost Writer — Muse drafts clue options from the user's rough words.
 * The same call returns a safety verdict: blocked hides the options with a
 * kind redirect, risky shows a heads-up above them. Any failure collapses
 * to nothing — the user's own words are always enough.
 */
export function GhostWriter({ draft, dropType, onPick, business, businessName }: Props) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const toast = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [options, setOptions] = useState<string[]>([]);
  const [safety, setSafety] = useState<{ verdict: SafetyVerdict; note?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [tried, setTried] = useState(false);
  /** AI call attempted but returned nothing usable — show retry, not silence. */
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setOptions([]);
    setSafety(null);
    setTried(false);
    setFailed(false);
  }, [dropType, business]);

  const ready = draft.trim().length >= 2;

  const inspire = async () => {
    if (loading || !ready) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetchClueAssist({
        draft: draft.trim(),
        dropType,
        locale: locale === 'bn' ? 'bn' : 'en',
        business,
        businessName,
      });
      setTried(true);
      if (!res) {
        setOptions([]);
        setSafety(null);
        setFailed(true);
        const code = getLastNarratorError();
        toast(t('ghostError') + (__DEV__ && code ? ` [${code}]` : ''));
        return;
      }
      setOptions(res.options);
      setSafety(res.safety);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>✦ {t('ghostWriter')}</Text>
      <Button
        label={`✦ ${t('inspire')}`}
        variant="ghost"
        loading={loading}
        disabled={!ready}
        onPress={inspire}
      />
      {!tried && options.length === 0 ? (
        <Text style={styles.hint}>{t('inspireWhat')}</Text>
      ) : null}
      {!ready && !tried ? <Text style={styles.hint}>{t('inspireHint')}</Text> : null}
      {safety?.verdict === 'blocked' ? (
        <Text style={styles.blocked}>{safety.note ?? t('ghostBlocked')}</Text>
      ) : null}
      {safety && safety.verdict === 'risky' ? (
        <Text style={styles.risky}>
          {t('ghostRisky') + (safety.note ? ` ${safety.note}` : '')}
        </Text>
      ) : null}
      {options.map((opt) => (
        <Pressable
          key={opt}
          accessibilityRole="button"
          onPress={() => onPick(opt)}
          style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.optionText}>{opt}</Text>
          <Text style={styles.use}>↳</Text>
        </Pressable>
      ))}
      {tried && options.length === 0 && safety?.verdict !== 'blocked' ? (
        <Text style={failed ? styles.failed : styles.hint}>
          {failed ? t('ghostError') : t('ghostEmpty')}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      gap: 8,
      marginTop: 4,
    },
    eyebrow: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 2.4,
      color: colors.accent,
    },
    hint: {
      fontFamily: typography.body,
      fontSize: 12,
      color: colors.textDim,
    },
    failed: {
      fontFamily: typography.body,
      fontSize: 12,
      color: colors.danger,
    },
    blocked: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      lineHeight: 18,
      color: colors.danger,
    },
    risky: {
      fontFamily: typography.body,
      fontSize: 12,
      lineHeight: 17,
      color: colors.textMuted,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      borderRadius: radii.md,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    optionText: {
      flex: 1,
      fontFamily: typography.body,
      fontSize: 14,
      lineHeight: 19,
      color: colors.text,
    },
    use: {
      fontFamily: typography.body,
      fontSize: 16,
      color: colors.accent,
    },
  });
}
