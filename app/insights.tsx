import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CloseButton } from '@/components/ui/CloseButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FadeIn } from '@/components/ui/FadeIn';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { userErrorMessage } from '@/lib/userError';
import { fetchBusinessBrief } from '@/services/aiNarrator';
import {
  barHeights,
  bestTimeLine,
  conversionPct,
  fetchBusinessInsights,
  hourLabel,
  returningPct,
  type BusinessBrief,
  type BusinessInsights,
} from '@/services/insights';
import {
  MIN_TOUCH,
  layout,
  leading,
  radii,
  space,
  typography,
  type ThemeColors,
} from '@/constants/theme';

const BAR_MAX = 96;
const WINDOW_DAYS = 14;

/** "Verified visits": aggregates for the creator's own Drops. No finder identities. */
export default function InsightsScreen() {
  const { colors } = useTheme();
  const { t, locale, typeLabel } = useI18n();
  const styles = useMemo(() => createStyles(colors, locale), [colors, locale]);
  const [data, setData] = useState<BusinessInsights | null>(null);
  const [brief, setBrief] = useState<{ brief: BusinessBrief; ai: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefBusy, setBriefBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const insights = await fetchBusinessInsights(WINDOW_DAYS);
      setData(insights);
      setBrief(null);
      if (insights && insights.totalVisits > 0) {
        setBriefBusy(true);
        fetchBusinessBrief(insights, locale)
          .then(setBrief)
          .finally(() => setBriefBusy(false));
      }
    } catch (e) {
      setError(userErrorMessage(e, t('insightsLoadFail')));
    } finally {
      setLoading(false);
    }
  }, [locale, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const heights = data ? barHeights(data.daily, BAR_MAX) : [];
  const peak = data ? Math.max(0, ...data.daily.map((d) => d.visits)) : 0;
  const nLabel = (WINDOW_DAYS).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US');
  const lastDays = t('insightsLastDays').replace('{n}', nLabel);
  const aud = data?.audience ?? null;
  const wdMax = aud ? Math.max(1, ...aud.weekday) : 1;
  const wdLetters = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 0, 5 + i).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'narrow' }),
  );
  const retPct = aud ? returningPct(aud) : 0;
  const hasFunnel = !!data && data.funnel.shown + data.funnel.opened + data.funnel.verified > 0;

  return (
    <Screen>
      <View style={styles.pad}>
        <ScreenHeader title={t('insightsTitle')} trailing={<CloseButton compact label={t('close')} />} />
      </View>

      {error ? (
        <EmptyState
          title={t('insightsTitle')}
          message={error}
          actionLabel={t('retry')}
          onAction={load}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading && !!data} onRefresh={load} tintColor={colors.accent} />
          }
        >
          {loading && !data ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : !data || data.totalVisits === 0 ? (
            <FadeIn>
              <EmptyState title={t('insightsTitle')} message={t('insightsEmpty')} />
            </FadeIn>
          ) : (
            <FadeIn>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{data.totalVisits}</Text>
                  <Text style={styles.statLabel}>{t('insightsTotal')}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{data.uniqueVisitors}</Text>
                  <Text style={styles.statLabel}>{t('insightsUnique')}</Text>
                </View>
              </View>

              <Text style={styles.section}>{lastDays}</Text>
              <View style={styles.card}>
                <View style={styles.bars}>
                  {data.daily.map((d, i) => (
                    <View key={d.day} style={[styles.barCol, data.daily.length > 10 && styles.barColNarrow]}>
                      <Text style={styles.barVal}>{d.visits > 0 ? d.visits : ''}</Text>
                      <View
                        style={[
                          styles.bar,
                          { height: Math.max(heights[i] ?? 0, 2) },
                          d.visits === 0 && styles.barZero,
                          d.visits > 0 && d.visits < peak && styles.barDim,
                        ]}
                      />
                      <Text style={styles.barDay}>
                        {new Date(`${d.day}T00:00:00`).toLocaleDateString(
                          locale === 'bn' ? 'bn-BD' : 'en-US',
                          { weekday: 'narrow' },
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {aud ? (
                <>
                  <Text style={styles.section}>{t('audienceTitle')}</Text>
                  <View style={styles.card}>
                    <View style={styles.audRow}>
                      <View style={styles.audCell}>
                        <Text style={styles.audBig}>{aud.peakHour !== null ? hourLabel(aud.peakHour, locale === 'bn' ? 'bn' : 'en') : '–'}</Text>
                        <Text style={styles.statLabel}>{t('audiencePeak')}</Text>
                      </View>
                      <View style={styles.audCell}>
                        <Text style={styles.audBig}>{retPct}%</Text>
                        <Text style={styles.statLabel}>{t('audienceReturning')}</Text>
                      </View>
                    </View>
                    <View style={styles.splitTrack} accessibilityLabel={`${t('audienceNew')} ${aud.newVisitors}, ${t('audienceReturning')} ${aud.returningVisitors}`}>
                      <View style={[styles.splitReturning, { flex: Math.max(aud.returningVisitors, 0.001) }]} />
                      <View style={[styles.splitNew, { flex: Math.max(aud.newVisitors, 0.001) }]} />
                    </View>
                    <View style={styles.splitLegend}>
                      <Text style={styles.rowMeta}>{t('audienceReturning')}: {aud.returningVisitors}</Text>
                      <Text style={styles.rowMeta}>{t('audienceNew')}: {aud.newVisitors}</Text>
                    </View>

                    <Text style={[styles.section, styles.sectionInCard]}>{t('audienceWeekdays')}</Text>
                    <View style={styles.wdRow}>
                      {aud.weekday.map((v, i) => (
                        <View key={i} style={styles.wdCol}>
                          <View style={[styles.wdBar, { height: Math.max(v === 0 ? 2 : 6, Math.round((v / wdMax) * 40)) }, v === 0 && styles.barZero, v === wdMax && v > 0 && styles.wdPeak]} />
                          <Text style={styles.barDay}>{wdLetters[i]}</Text>
                        </View>
                      ))}
                    </View>

                    {aud.interests.length > 0 ? (
                      <>
                        <Text style={[styles.section, styles.sectionInCard]}>{t('audienceInterests')}</Text>
                        <View style={styles.chipRow}>
                          {aud.interests.map((it) => (
                            <View key={it.type} style={styles.interestChip}>
                              <Text style={styles.interestText}>{typeLabel(it.type)} · {it.visits}</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    ) : null}
                    <Text style={[styles.rowMeta, styles.note]}>{t('audienceNote')}</Text>
                  </View>
                </>
              ) : null}

              <Text style={styles.section}>{t('funnelTitle')}</Text>
              <View style={styles.card}>
                {hasFunnel ? (
                  <>
                    {([
                      ['funnelShown', data.funnel.shown],
                      ['funnelOpened', data.funnel.opened],
                      ['funnelVerified', data.funnel.verified],
                    ] as const).map(([k, v], i) => (
                      <View key={k} style={[styles.row, i > 0 && styles.rowDivider]}>
                        <Text style={[styles.rowTitle, { flex: 1 }]}>{t(k)}</Text>
                        <Text style={styles.audBigSm}>{v}</Text>
                      </View>
                    ))}
                    <View style={[styles.row, styles.rowDivider]}>
                      <Text style={[styles.rowTitle, { flex: 1 }]}>{t('funnelConversion')}</Text>
                      <Text style={styles.rowCount}>{conversionPct(data.funnel)}%</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.rowMeta}>{t('funnelEmpty')}</Text>
                )}
              </View>

              <Text style={styles.section}>{t('insightsTop')}</Text>
              <View style={styles.card}>
                {data.topDrops.map((d, i) => (
                  <View key={d.dropId} style={[styles.row, i > 0 && styles.rowDivider]}>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {d.businessName?.trim() || d.title?.trim() || typeLabel(d.type)}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={2}>
                        {typeLabel(d.type)} · {d.uniqueVisitors} {t('insightsUniqueRow')}
                      </Text>
                    </View>
                    <Text style={styles.rowCount}>
                      {d.unlockCount} {t('insightsVisits')}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={[styles.card, styles.briefCard]}>
                <View style={styles.briefHead}>
                  {!brief || brief.ai ? (
                    <View style={styles.aiPill}>
                      <Text style={styles.aiPillText}>{t('aiBadge')}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.briefTitle}>{t('insightsBriefTitle')}</Text>
                </View>
                {briefBusy && !brief ? (
                  <View style={styles.briefBusy}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.briefLine}>{t('insightsBriefLoading')}</Text>
                  </View>
                ) : brief ? (
                  <>
                    <Text style={styles.briefSummary}>{brief.brief.summary}</Text>
                    {brief.brief.bestTime ?? bestTimeLine(aud, locale === 'bn' ? 'bn' : 'en') ? (
                      <View style={styles.bestTime}>
                        <Text style={styles.bestTimeLabel}>{t('briefBestTime')}</Text>
                        <Text style={styles.bestTimeText}>
                          {brief.brief.bestTime ?? bestTimeLine(aud, locale === 'bn' ? 'bn' : 'en')}
                        </Text>
                      </View>
                    ) : null}
                    {brief.brief.tips.map((tip, i) => (
                      <View key={i} style={styles.tipRow}>
                        <Text style={styles.tipNum}>{i + 1}</Text>
                        <Text style={styles.tipText}>{tip}</Text>
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            </FadeIn>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const createStyles = (colors: ThemeColors, locale: 'en' | 'bn') =>
  StyleSheet.create({
    pad: { paddingHorizontal: layout.gutter, paddingTop: space.sm },
    content: { paddingHorizontal: layout.gutter, paddingTop: space.lg, paddingBottom: space.xl * 2 },
    loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center' },
    statsRow: { flexDirection: 'row', gap: space.md },
    stat: {
      flex: 1,
      backgroundColor: colors.bgElevated,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      paddingVertical: space.lg,
      paddingHorizontal: space.lg,
      gap: space.xs,
    },
    statNum: {
      fontFamily: typography.display,
      fontSize: 44,
      lineHeight: 52,
      color: colors.text,
    },
    statLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      lineHeight: leading(locale, 13),
      color: colors.textMuted,
    },
    section: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      lineHeight: leading(locale, 12),
      letterSpacing: locale === 'bn' ? 0 : 1.8,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginTop: space.xl,
      marginBottom: space.sm,
    },
    card: {
      backgroundColor: colors.bgElevated,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
    },
    bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm },
    barCol: { flex: 1, alignItems: 'center', gap: space.xs, justifyContent: 'flex-end' },
    barColNarrow: { gap: space.xs },
    bar: { width: '100%', maxWidth: space.xl, backgroundColor: colors.accent, borderRadius: radii.sm },
    barDim: { backgroundColor: colors.accentLine },
    barZero: { backgroundColor: colors.border },
    barVal: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      lineHeight: 16,
      color: colors.text,
      minHeight: 16,
    },
    barDay: { fontFamily: typography.body, fontSize: 12, lineHeight: leading(locale, 12), color: colors.textMuted },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      minHeight: MIN_TOUCH + space.md,
      paddingVertical: space.md,
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowCopy: { flex: 1, gap: space.xs },
    rowTitle: {
      fontFamily: typography.bodyMedium,
      fontSize: 15,
      lineHeight: leading(locale, 15),
      color: colors.text,
    },
    rowMeta: { fontFamily: typography.body, fontSize: 13, lineHeight: leading(locale, 13), color: colors.textMuted },
    rowCount: {
      flexShrink: 0,
      fontFamily: typography.bodyMedium,
      fontSize: 14,
      lineHeight: leading(locale, 14),
      color: colors.accent,
    },
    audRow: { flexDirection: 'row', gap: space.lg },
    audCell: { flex: 1, gap: space.xs },
    audBig: { fontFamily: typography.display, fontSize: 28, lineHeight: 36, color: colors.text },
    audBigSm: { fontFamily: typography.display, fontSize: 20, lineHeight: 28, color: colors.text },
    splitTrack: { flexDirection: 'row', height: space.sm, borderRadius: radii.sm, overflow: 'hidden', marginTop: space.md, backgroundColor: colors.border },
    splitReturning: { backgroundColor: colors.accent },
    splitNew: { backgroundColor: colors.accentLine },
    splitLegend: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, marginTop: space.sm },
    sectionInCard: { marginTop: space.lg },
    wdRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm, minHeight: 56 },
    wdCol: { flex: 1, alignItems: 'center', gap: space.xs, justifyContent: 'flex-end' },
    wdBar: { width: '70%', maxWidth: space.xl, backgroundColor: colors.accentLine, borderRadius: radii.sm },
    wdPeak: { backgroundColor: colors.accent },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    interestChip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
    interestText: { fontFamily: typography.body, fontSize: 13, lineHeight: leading(locale, 13), color: colors.textMuted },
    note: { marginTop: space.lg },
    bestTime: { gap: space.xs, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    bestTimeLabel: { fontFamily: typography.bodyMedium, fontSize: 12, lineHeight: leading(locale, 12), color: colors.accent },
    bestTimeText: { fontFamily: typography.bodyMedium, fontSize: 15, lineHeight: leading(locale, 15, 1.4, 1.7), color: colors.text },
    briefCard: { marginTop: space.xl, gap: space.md, paddingVertical: space.lg },
    briefHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    briefBusy: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
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
    briefTitle: {
      flexShrink: 1,
      fontFamily: typography.bodyMedium,
      fontSize: 14,
      lineHeight: leading(locale, 14),
      color: colors.text,
    },
    briefSummary: {
      fontFamily: typography.bodyMedium,
      fontSize: 16,
      lineHeight: leading(locale, 16, 1.45, 1.7),
      color: colors.text,
    },
    tipRow: { flexDirection: 'row', gap: space.md },
    tipNum: {
      width: space.lg,
      fontFamily: typography.bodyMedium,
      fontSize: 14,
      lineHeight: leading(locale, 14, 1.45, 1.7),
      color: colors.accent,
    },
    tipText: {
      flex: 1,
      fontFamily: typography.body,
      fontSize: 14,
      lineHeight: leading(locale, 14, 1.45, 1.7),
      color: colors.textMuted,
    },
    briefLine: { fontFamily: typography.body, fontSize: 14, lineHeight: leading(locale, 14), color: colors.textMuted },
  });
