import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SoftLink } from '@/components/ui/SoftLink';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { typography, type ThemeColors } from '@/constants/theme';

type Props = {
  /** Hints successfully shown so far (0–4). */
  level: number;
  /** Current hint text, if any. */
  text: string | null;
  loading: boolean;
  /** A rewarded ad is playing — hold input. */
  busy: boolean;
  /** Ad-free users get the final nudge without an ad. */
  adFree: boolean;
  /** Last attempt failed (model/key/network) — show a graceful line. */
  failed: boolean;
  onAsk: () => void;
};

/**
 * Hunt Copilot card — the Discover screen's AI companion.
 * Idle: what it is + cost (3 free, 4th via ad). Loading: thinking.
 * Loaded: the hint + escalating follow-up. Failed: graceful retry line.
 */
export function CopilotCard({ level, text, loading, busy, adFree, failed, onAsk }: Props) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading || busy) {
    return <Text style={styles.line}>{busy ? t('hintAdPlaying') : t('hintThinking')}</Text>;
  }

  if (text) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>
          {t('aiBadge')} · {level}/4
        </Text>
        <Text style={styles.line}>{text}</Text>
        {level < 3 ? (
          <SoftLink label={t('hintMore')} onPress={onAsk} style={styles.link} />
        ) : level === 3 ? (
          <SoftLink
            label={adFree ? t('hintFinalFree') : t('hintFinal')}
            onPress={onAsk}
            style={styles.link}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.idle}>
      <SoftLink label={failed ? t('hintRetry') : t('hintAsk')} onPress={onAsk} />
      <Text style={styles.free}>{failed ? t('hintEmpty') : t('hintFree')}</Text>
    </View>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    card: {
      gap: 4,
      paddingVertical: 4,
    },
    eyebrow: {
      fontFamily: typography.bodyMedium,
      fontSize: 10,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: palette.accent,
      textAlign: 'center',
    },
    line: {
      fontFamily: typography.body,
      fontSize: 14,
      lineHeight: 21,
      fontStyle: 'italic',
      color: palette.text,
      textAlign: 'center',
    },
    link: {
      alignSelf: 'center',
    },
    idle: {
      alignItems: 'center',
      gap: 2,
    },
    free: {
      fontFamily: typography.body,
      fontSize: 11,
      color: palette.textDim,
      textAlign: 'center',
    },
  });
}
