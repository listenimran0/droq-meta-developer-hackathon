import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/hooks/useI18n';
import { darkColors, leading, radii, typography } from '@/constants/theme';
import type { DropType } from '@/types/drop';

type Props = {
  /** Muse Image (data URI or https URL) — full-bleed background. */
  imageUri: string;
  type: DropType;
  /** The AI epilogue line, shown as the subtitle. */
  subtitle?: string | null;
  businessName?: string | null;
  /** Rendered width in dp; height is width × 1.25 (4:5). Fonts scale with it. */
  width: number;
};

const INK = darkColors.text; // light text on a dark scrim, on every theme
const SCRIM = '5,6,9';

/** Stacked translucent bands = a gradient without a gradient dependency. */
function Scrim({ side, height, peak }: { side: 'top' | 'bottom'; height: number; peak: number }) {
  const steps = 28;
  return (
    <View pointerEvents="none" style={[styles.scrim, { height }, side === 'top' ? { top: 0 } : { bottom: 0 }]}>
      {Array.from({ length: steps }).map((_, i) => {
        const t = side === 'top' ? 1 - i / (steps - 1) : i / (steps - 1);
        return <View key={i} style={{ flex: 1, backgroundColor: `rgba(${SCRIM},${(peak * t * t).toFixed(3)})` }} />;
      })}
    </View>
  );
}

/**
 * The shareable Found card (4:5). What you see here is exactly what gets
 * captured and shared. No coordinates, place names or personal data.
 */
export function BrandedCard({ imageUri, type, subtitle, businessName, width }: Props) {
  const { t, locale, typeLabel } = useI18n();
  const w = width;
  const h = Math.round(w * 1.25);
  const pad = Math.round(w * 0.06);
  const fs = (ratio: number) => Math.round(w * ratio);
  const bn = locale === 'bn';

  return (
    <View style={[styles.card, { width: w, height: h }]}>
      <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
      <Scrim side="top" height={h * 0.3} peak={0.7} />
      <Scrim side="bottom" height={h * 0.68} peak={0.95} />

      <Text style={[styles.wordmark, { top: pad, left: pad, fontSize: fs(0.075) }]}>DROQ</Text>

      <View style={[styles.bottom, { paddingHorizontal: pad, paddingBottom: pad, gap: fs(0.025) }]}>
        <View style={styles.chips}>
          <View style={[styles.chip, { paddingHorizontal: fs(0.03), paddingVertical: fs(0.012) }]}>
            <Text style={[styles.chipText, { fontSize: fs(0.034), lineHeight: leading(locale, fs(0.034)) }]}>
              {typeLabel(type)}
            </Text>
          </View>
          {businessName?.trim() ? (
            <View style={[styles.chip, styles.chipBiz, { paddingHorizontal: fs(0.03), paddingVertical: fs(0.012) }]}>
              <Text
                numberOfLines={1}
                style={[styles.chipText, { fontSize: fs(0.034), lineHeight: leading(locale, fs(0.034)) }]}
              >
                {t('businessWord')} · {businessName.trim()}
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          style={[
            styles.headline,
            { fontSize: fs(0.1), lineHeight: leading(locale, fs(0.1), 1.1, 1.4), letterSpacing: bn ? 0 : -1 },
          ]}
        >
          {t('cardHeadline')}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={3}
            style={[styles.subtitle, { fontSize: fs(0.044), lineHeight: leading(locale, fs(0.044), 1.4, 1.65) }]}
          >
            “{subtitle}”
          </Text>
        ) : null}

        <View style={[styles.rule, { marginTop: fs(0.01) }]} />
        <Text style={[styles.tagline, { fontSize: fs(0.04), lineHeight: leading(locale, fs(0.04)) }]}>
          {t('cardTagline')}
        </Text>
        <Text style={[styles.credit, { fontSize: fs(0.03), lineHeight: leading(locale, fs(0.03)) }]}>
          {t('cardCredit')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: radii.md, backgroundColor: darkColors.bg },
  scrim: { position: 'absolute', left: 0, right: 0 },
  wordmark: { position: 'absolute', fontFamily: typography.brand, letterSpacing: 5, color: INK },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(247,244,238,0.5)', backgroundColor: 'rgba(5,6,9,0.45)' },
  chipBiz: { borderColor: darkColors.accentBright },
  chipText: { fontFamily: typography.bodyMedium, color: INK },
  headline: { fontFamily: typography.display, color: INK },
  subtitle: { fontFamily: typography.body, fontStyle: 'italic', color: 'rgba(247,244,238,0.88)' },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(247,244,238,0.35)' },
  tagline: { fontFamily: typography.bodyMedium, color: INK },
  credit: { fontFamily: typography.body, color: 'rgba(247,244,238,0.6)' },
});
