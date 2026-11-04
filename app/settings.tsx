import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BannerAdSlot } from '@/components/ads/BannerAdSlot';
import { Chip } from '@/components/ui/Chip';
import { CloseButton } from '@/components/ui/CloseButton';
import { FadeIn } from '@/components/ui/FadeIn';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Segment } from '@/components/ui/Segment';
import { useAuth } from '@/hooks/useAuth';
import { useAdFreeMinutes } from '@/hooks/useAdFree';
import { useI18n } from '@/hooks/useI18n';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useRewardedAd } from '@/hooks/useRewardedAd';
import { useTheme } from '@/hooks/useTheme';
import { AD_FREE_REWARD_MS } from '@/constants/ads';
import { clearAdFree, grantAdFree } from '@/lib/ads/adFree';
import type { ThemePreference } from '@/constants/theme';
import {
  getSimulationMode,
  isDevSimulationAvailable,
  setSimulationMode,
  simulationModeLabel,
  type SimulationMode,
} from '@/lib/devSimulation';
import {
  ensureNotificationPermissions,
  getNearbyAlertsEnabled,
  getNotificationPermissionGranted,
  registerPushToken,
  setNearbyAlertsEnabled,
} from '@/services/notifications';
import {
  isBackgroundNearbyAlertsRunning,
  startBackgroundNearbyAlerts,
  stopBackgroundNearbyAlerts,
} from '@/services/backgroundNearby';
import { flushOfflineQueue } from '@/services/offlineQueue';
import { userErrorMessage } from '@/lib/userError';
import { layout, radii, typography, type ThemeColors } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { reset } = useOnboarding();
  const { t, locale, setLocale } = useI18n();
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [alertsOn, setAlertsOn] = useState(false);
  const [bgOn, setBgOn] = useState(false);
  const [busyAlerts, setBusyAlerts] = useState(false);
  const [busyBg, setBusyBg] = useState(false);
  const [busyUpload, setBusyUpload] = useState(false);
  const [simMode, setSimMode] = useState<SimulationMode>(getSimulationMode());

  const rewardedAd = useRewardedAd();
  const adFreeMinutes = useAdFreeMinutes();
  const [busyReward, setBusyReward] = useState(false);

  const onWatchRewardAd = async () => {
    if (busyReward) return;
    setBusyReward(true);
    try {
      const earned = await rewardedAd.show();
      if (earned) {
        await grantAdFree(AD_FREE_REWARD_MS);
        Alert.alert('Ads removed', 'No ads for the next hour. Thanks for watching.');
      } else {
        Alert.alert('No reward', 'The video didn’t finish — try again in a minute.');
      }
    } catch {
      Alert.alert('No reward', 'The video didn’t finish — try again in a minute.');
    } finally {
      setBusyReward(false);
    }
  };

  const refreshStatus = useCallback(async () => {
    const [notif, pref, bg] = await Promise.all([
      getNotificationPermissionGranted().catch(() => false),
      getNearbyAlertsEnabled().catch(() => true),
      isBackgroundNearbyAlertsRunning().catch(() => false),
    ]);
    setAlertsOn(Boolean(notif && pref));
    setBgOn(bg);
    if (isDevSimulationAvailable()) setSimMode(getSimulationMode());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
    }, [refreshStatus]),
  );

  const onToggleAlerts = async (next: boolean) => {
    setBusyAlerts(true);
    try {
      if (next) {
        const ok = await ensureNotificationPermissions();
        if (ok) {
          await setNearbyAlertsEnabled(true);
          await registerPushToken();
          setAlertsOn(true);
        } else {
          await setNearbyAlertsEnabled(false);
          setAlertsOn(false);
          Alert.alert(
            'Alerts off',
            'Turn on Notifications for DROQ in phone Settings, then try again.',
          );
        }
      } else {
        await setNearbyAlertsEnabled(false);
        setAlertsOn(false);
        await stopBackgroundNearbyAlerts();
        setBgOn(false);
      }
    } finally {
      setBusyAlerts(false);
    }
  };

  const onToggleBackground = async (next: boolean) => {
    setBusyBg(true);
    try {
      if (next) {
        const ok = await startBackgroundNearbyAlerts();
        setBgOn(ok);
        if (!ok) {
          Alert.alert(
            'Background alerts',
            'Turn on Location → Allow all the time for DROQ in phone Settings, then try again.',
          );
        }
      } else {
        await stopBackgroundNearbyAlerts();
        setBgOn(false);
      }
    } catch (e) {
      setBgOn(false);
      Alert.alert('Background alerts', userErrorMessage(e, 'Couldn’t change this setting.'));
    } finally {
      setBusyBg(false);
    }
  };

  const onRetryUploads = async () => {
    setBusyUpload(true);
    try {
      const result = await flushOfflineQueue();
      Alert.alert(
        'Offline uploads',
        result.flushed
          ? `Uploaded ${result.flushed}. ${result.remaining} still waiting.`
          : result.remaining
            ? `${result.remaining} still waiting — check your connection.`
            : 'Nothing waiting to upload.',
      );
    } finally {
      setBusyUpload(false);
    }
  };

  return (
    <Screen ambient="none">
      <FadeIn style={{ flex: 1 }}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.wrap}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <ScreenHeader
          title={t('settings')}
          trailing={<CloseButton compact label={t('close')} />}
        />

        <Section title="Appearance" styles={styles}>
          <Segment
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            value={preference}
            onChange={(v) => setPreference(v)}
          />
          <Text style={styles.hint}>Follows your phone when set to System.</Text>
        </Section>

        <Section title="Language" styles={styles}>
          <Segment
            options={[
              { value: 'en', label: 'English' },
              { value: 'bn', label: 'বাংলা' },
            ]}
            value={locale}
            onChange={(v) => setLocale(v)}
          />
          <Text style={styles.hint}>App language for tabs and main actions.</Text>
        </Section>

        <Section title="Notifications" styles={styles}>
          <ToggleRow
            title="Push alerts"
            subtitle={alertsOn ? 'On — nearby & discoveries' : 'Off — tap to allow'}
            value={alertsOn}
            busy={busyAlerts}
            onValueChange={onToggleAlerts}
            styles={styles}
            colors={colors}
          />
          <ToggleRow
            title="Background nearby"
            subtitle={
              bgOn
                ? 'On — checks while app is closed'
                : 'Off — only checks when you open DROQ'
            }
            value={bgOn}
            busy={busyBg}
            onValueChange={onToggleBackground}
            styles={styles}
            colors={colors}
          />
        </Section>

        <Section title="Data" styles={styles}>
          <ActionRow
            title="Retry offline uploads"
            subtitle="Upload Drops saved without internet"
            busy={busyUpload}
            onPress={onRetryUploads}
            styles={styles}
            colors={colors}
          />
        </Section>

        <Section title="Ads" styles={styles}>
          {adFreeMinutes > 0 ? (
            <Pressable
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              onLongPress={
                __DEV__
                  ? () => {
                      void clearAdFree();
                    }
                  : undefined
              }
            >
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>Ad-free</Text>
                <Text style={styles.itemSub}>
                  No ads for the next {adFreeMinutes} min
                  {__DEV__ ? ' · hold to reset' : ''}
                </Text>
              </View>
              <Text style={styles.actionHint}>On</Text>
            </Pressable>
          ) : (
            <ActionRow
              title="Remove ads for 1 hour"
              subtitle={
                rewardedAd.ready
                  ? 'Watch a short video to support DROQ'
                  : 'Loading reward video…'
              }
              busy={busyReward}
              onPress={onWatchRewardAd}
              styles={styles}
              colors={colors}
            />
          )}
        </Section>

        <Section title="Legal" styles={styles}>
          <ActionRow
            title="Privacy policy"
            subtitle="How DROQ uses location and account data"
            onPress={() => Linking.openURL('https://droq.app/privacy')}
            styles={styles}
            colors={colors}
          />
          <ActionRow
            title="Delete account"
            subtitle="Request permanent removal of your data"
            onPress={() => Linking.openURL('https://droq.app/delete-account')}
            styles={styles}
            colors={colors}
          />
        </Section>

        <Section title="Account actions" styles={styles}>
          <ActionRow
            title="Sign out"
            subtitle="You’ll need to log in again"
            danger
            onPress={async () => {
              Alert.alert('Sign out?', 'You can sign back in anytime.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign out',
                  style: 'destructive',
                  onPress: async () => {
                    await signOut();
                    router.replace('/(auth)/login');
                  },
                },
              ]);
            }}
            styles={styles}
            colors={colors}
          />
          <ActionRow
            title="Replay intro"
            subtitle="Show the first-time how-to screens again"
            onPress={() => {
              Alert.alert('Replay intro?', 'This shows onboarding again.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Replay',
                  onPress: async () => {
                    await reset();
                    router.replace('/onboarding');
                  },
                },
              ]);
            }}
            styles={styles}
            colors={colors}
          />
        </Section>

        {isDevSimulationAvailable() ? (
          <Section title="GPS simulation" styles={styles}>
            <Text style={styles.hint}>
              Current: {simulationModeLabel(simMode)}. Tap a mode, then open Discover.
            </Text>
            <View style={styles.simGrid}>
              {(
                [
                  ['off', 'Off'],
                  ['found', 'Found'],
                  ['approaching', 'Approach'],
                  ['nearby', 'Nearby'],
                  ['pinned', 'Pinned'],
                  ['time_locked', 'Locked'],
                ] as const
              ).map(([mode, label]) => (
                <Chip
                  key={mode}
                  label={label}
                  selected={simMode === mode}
                  dense
                  style={styles.simChip}
                  onPress={() => {
                    setSimulationMode(mode);
                    setSimMode(mode);
                  }}
                />
              ))}
            </View>
          </Section>
        ) : null}

        <BannerAdSlot />
      </ScrollView>
      </FadeIn>
    </Screen>
  );
}

type Styles = ReturnType<typeof createStyles>;

function Section({
  title,
  children,
  styles,
}: {
  title: string;
  children: React.ReactNode;
  styles: Styles;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  busy,
  onValueChange,
  styles,
  colors,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  busy?: boolean;
  onValueChange: (next: boolean) => void;
  styles: Styles;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.item}>
      <View style={styles.itemText}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemSub}>{subtitle}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.bgSoft, true: colors.accentLine }}
          thumbColor={value ? colors.accentBright : colors.textDim}
          ios_backgroundColor={colors.bgSoft}
        />
      )}
    </View>
  );
}

function ActionRow({
  title,
  subtitle,
  onPress,
  danger,
  busy,
  styles,
  colors,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  danger?: boolean;
  busy?: boolean;
  styles: Styles;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
    >
      <View style={styles.itemText}>
        <Text style={[styles.itemTitle, danger && styles.danger]}>{title}</Text>
        <Text style={styles.itemSub}>{subtitle}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Text style={[styles.actionHint, danger && styles.danger]}>Tap</Text>
      )}
    </Pressable>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    wrap: {
      flexGrow: 1,
      paddingHorizontal: layout.gutter,
      paddingTop: 4,
      paddingBottom: 48,
      gap: 18,
    },
    back: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: palette.textMuted,
    },
    section: { gap: 10 },
    sectionTitle: {
      fontFamily: typography.bodyMedium,
      fontSize: 11,
      letterSpacing: 2.2,
      textTransform: 'uppercase',
      color: palette.accent,
    },
    card: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.bgElevated,
      overflow: 'hidden',
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border,
    },
    pressed: { opacity: 0.7 },
    itemText: { flex: 1, gap: 4 },
    itemTitle: {
      fontFamily: typography.bodyMedium,
      fontSize: 16,
      color: palette.text,
    },
    itemSub: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: 18,
      color: palette.textMuted,
    },
    chevron: {
      fontFamily: typography.display,
      fontSize: 22,
      color: palette.accent,
      lineHeight: 24,
    },
    actionHint: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.textDim,
    },
    danger: { color: palette.danger },
    hint: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: 19,
      color: palette.textDim,
      paddingHorizontal: 4,
      paddingBottom: 4,
    },
    simGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 12,
    },
    simChip: {
      minWidth: '30%',
      flexGrow: 1,
    },
  });
}
