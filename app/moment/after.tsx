import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/ui/Button';
import { BusinessBadge } from '@/components/ui/BusinessBadge';
import { SoftLink } from '@/components/ui/SoftLink';
import { Screen } from '@/components/ui/Screen';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { trackEvent } from '@/services/analytics';
import { fetchFoundLine } from '@/services/aiNarrator';
import { FoundCard } from '@/components/moment/FoundCard';
import { getDrop } from '@/services/drops';
import type { Drop, DropType } from '@/types/drop';
import { layout, leading, space, typography, type ThemeColors } from '@/constants/theme';

/**
 * 60-second micro-quest after unlock — one next outdoor action, not a feed.
 */
export default function AfterUnlockScreen() {
  const router = useRouter();
  const { id, type: typeParam } = useLocalSearchParams<{ id?: string; type?: DropType }>();
  const { colors } = useTheme();
  const { locale, t } = useI18n();
  const styles = useMemo(() => createStyles(colors, locale), [colors, locale]);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [epilogue, setEpilogue] = useState<string | null>(null);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (!id) return;
    getDrop(id)
      .then(setDrop)
      .catch(() => setDrop(null));
  }, [id]);

  const type = drop?.type ?? typeParam;

  // Found Epilogue: one warm AI line celebrating the find. Silent on failure.
  useEffect(() => {
    if (!id) return;
    let live = true;
    fetchFoundLine({
      dropId: id,
      dropType: type ?? 'memory',
      locale: locale === 'bn' ? 'bn' : 'en',
    })
      .then((line) => {
        if (live && line) {
          setEpilogue(line);
          trackEvent('epilogue_shown', { drop_id: id }).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id, type, locale]);

  const primary = (() => {
    if (drop?.next_drop_id) {
      return {
        label: t('afterTrail'),
        onPress: () =>
          router.replace({
            pathname: '/discover',
            params: { focusId: drop.next_drop_id! },
          }),
      };
    }
    if (type === 'challenge') {
      return {
        label: t('afterAddHere'),
        onPress: () => router.replace(`/drop/${id}`),
      };
    }
    if (drop?.human_chain_root_id || drop?.chain_hint) {
      return {
        label: t('afterChain'),
        onPress: () =>
          router.replace({
            pathname: '/create',
            params: {
              humanRoot: drop.human_chain_root_id ?? drop.id,
              fromDrop: drop.id,
            },
          }),
      };
    }
    return {
      label: t('afterOpen'),
      onPress: () => router.replace(`/drop/${id}`),
    };
  })();

  return (
    <Screen ambient="hero">
      <ScrollView
        contentContainerStyle={styles.wrap}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.eyebrow}>{t('afterEyebrow')}</Text>
        <Text style={styles.title}>{t('afterTitle')}</Text>
        <BusinessBadge show={drop?.is_business} name={drop?.business_name} category={drop?.business_category} />
        <Text style={styles.body}>{t('afterBody')}</Text>
        {epilogue ? <Text style={styles.epilogue}>“{epilogue}”</Text> : null}
        {id ? <FoundCard
            dropId={id}
            type={type ?? 'memory'}
            caption={epilogue}
            businessName={drop?.is_business ? drop.business_name : null}
          /> : null}

        <Button label={primary.label} onPress={primary.onPress} />

        <Button
          label={t('afterRace')}
          variant="ghost"
          onPress={() => router.replace(`/drop/${id}`)}
        />

        <SoftLink
          muted
          label={t('afterJustOpen')}
          onPress={() => router.replace(`/drop/${id}`)}
          style={styles.link}
        />
      </ScrollView>
    </Screen>
  );
}

function createStyles(palette: ThemeColors, locale: 'en' | 'bn') {
  const bn = locale === 'bn';
  return StyleSheet.create({
    wrap: {
      flexGrow: 1,
      paddingHorizontal: layout.gutter,
      paddingVertical: space.xl,
      justifyContent: 'center',
      gap: space.md,
    },
    eyebrow: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: bn ? 0 : 3,
      color: palette.accent,
    },
    title: {
      fontFamily: typography.brand,
      fontSize: 32,
      letterSpacing: bn ? 0 : -1,
      lineHeight: leading(locale, 32, 1.15, 1.45),
      color: palette.text,
    },
    body: {
      fontFamily: typography.body,
      fontSize: 15,
      lineHeight: leading(locale, 15, 1.5, 1.7),
      color: palette.textMuted,
    },
    epilogue: {
      fontFamily: typography.body,
      fontSize: 16,
      lineHeight: leading(locale, 16, 1.5, 1.7),
      fontStyle: 'italic',
      color: palette.accentBright,
    },
    link: { alignSelf: 'center', marginTop: space.sm },
  });
}
