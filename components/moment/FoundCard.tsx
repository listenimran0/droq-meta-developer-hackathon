import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PixelRatio, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { MIN_TOUCH, leading, radii, space, typography, type ThemeColors } from '@/constants/theme';
import { trackEvent } from '@/services/analytics';
import { fetchFoundCard } from '@/services/aiNarrator';
import type { DropType } from '@/types/drop';
import { dataUriToBase64, detectImageKind, foundCardFileName } from '@/utils/imageShare';
import { BrandedCard } from '@/components/moment/BrandedCard';
import { layout } from '@/constants/theme';

type Props = {
  dropId: string;
  type: DropType;
  caption?: string | null;
  /** Business drop → "Business · name" tag on the card */
  businessName?: string | null;
};

/** Muse Image: one shareable AI illustration of the moment you found a Drop. */
export function FoundCard({ dropId, type, caption, businessName }: Props) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const styles = useMemo(() => createStyles(colors, locale), [colors, locale]);
  const [busy, setBusy] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const cardRef = useRef<View>(null);
  const { width: screenW } = useWindowDimensions();
  const cardW = Math.min(screenW - layout.gutter * 2, 420);

  const make = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const out = await fetchFoundCard({
      dropId,
      dropType: type,
      locale: locale === 'bn' ? 'bn' : 'en',
    }).catch(() => null);
    setBusy(false);
    if (out) {
      setUri(out);
      trackEvent('found_card_made', { drop_id: dropId }).catch(() => undefined);
    } else setFailed(true);
  };

  const shareText = () => {
    trackEvent('found_card_shared', { drop_id: dropId, kind: 'text' }).catch(() => undefined);
    Share.share({ message: `${caption ? `“${caption}” ` : ''}${t('cardShareCaption')}` }).catch(
      () => undefined,
    );
  };

  /**
   * Share exactly what's on screen: capture the branded card to a 1080×1350 PNG
   * and share the file. Falls back to the raw Muse image (real format detected
   * from the bytes), then to text.
   */
  const share = async () => {
    try {
      if (cardRef.current && (await Sharing.isAvailableAsync())) {
        const px = PixelRatio.get();
        const out = await captureRef(cardRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
          width: 1080 / px,
          height: 1350 / px,
        });
        trackEvent('found_card_shared', { drop_id: dropId, kind: 'branded' }).catch(() => undefined);
        await Sharing.shareAsync(out, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('cardShare') });
        return;
      }
    } catch {
      // fall through to the raw image
    }
    const b64 = uri ? dataUriToBase64(uri) : null;
    if (b64) {
      try {
        const kind = detectImageKind(b64);
        const file = new File(Paths.cache, foundCardFileName(dropId, kind.ext));
        file.create({ overwrite: true });
        file.write(b64, { encoding: 'base64' });
        if (await Sharing.isAvailableAsync()) {
          trackEvent('found_card_shared', { drop_id: dropId, kind: 'image' }).catch(() => undefined);
          await Sharing.shareAsync(file.uri, {
            mimeType: kind.mime,
            UTI: kind.uti,
            dialogTitle: t('cardShare'),
          });
          return;
        }
      } catch {
        // fall through to the text share
      }
    }
    shareText();
  };

  return (
    <View style={styles.wrap}>
      {uri ? (
        <>
          <View ref={cardRef} collapsable={false} style={styles.cardWrap}>
            <BrandedCard imageUri={uri} type={type} subtitle={caption} businessName={businessName} width={cardW} />
          </View>
          <View style={styles.row}>
            <View style={styles.aiPill}>
              <Text style={styles.aiPillText}>{t('aiBadge')} · Muse Image</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={share} style={styles.shareBtn}>
              <Text style={styles.share}>{t('cardShare')}</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={shareText} style={styles.textBtn}>
            <Text style={styles.textShare}>{t('cardShareText')}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={make}
          disabled={busy}
          style={({ pressed }) => [styles.cta, (pressed || busy) && { opacity: 0.6 }]}
        >
          {busy ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.ctaText}>{t('cardMaking')}</Text>
            </View>
          ) : (
            <Text style={styles.ctaText}>✦ {t('cardCta')}</Text>
          )}
        </Pressable>
      )}
      {failed ? <Text style={styles.err}>{t('cardError')}</Text> : null}
    </View>
  );
}

function createStyles(colors: ThemeColors, locale: 'en' | 'bn') {
  return StyleSheet.create({
    wrap: { gap: space.md },
    cardWrap: { alignSelf: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
    aiPill: {
      backgroundColor: colors.accent,
      borderRadius: radii.sm,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
    },
    aiPillText: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: locale === 'bn' ? 0 : 0.6,
      color: colors.bg,
    },
    shareBtn: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center' },
    textBtn: { minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
    textShare: { fontFamily: typography.body, fontSize: 13, lineHeight: leading(locale, 13), color: colors.textMuted },
    share: { fontFamily: typography.bodyMedium, fontSize: 15, lineHeight: leading(locale, 15), color: colors.accent },
    cta: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      backgroundColor: colors.bgElevated,
      borderRadius: radii.md,
      minHeight: 52,
      paddingHorizontal: space.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: {
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      lineHeight: leading(locale, 15),
      color: colors.accent,
      textAlign: 'center',
    },
    err: { fontFamily: typography.body, fontSize: 13, lineHeight: leading(locale, 13), color: colors.danger },
  });
}
