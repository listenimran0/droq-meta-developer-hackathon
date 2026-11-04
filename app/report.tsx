import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { CloseButton } from '@/components/ui/CloseButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { REPORT_REASONS } from '@/constants/config';
import { useTheme } from '@/hooks/useTheme';
import { reportDrop } from '@/services/drops';
import type { ReportReason } from '@/types/drop';
import { layout, typography, type ThemeColors } from '@/constants/theme';
import { userErrorMessage } from '@/lib/userError';

export default function ReportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!id) return;
    setLoading(true);
    try {
      await reportDrop(id, reason);
      Alert.alert('Reported', 'Thanks for helping keep DROQ safe.');
      router.back();
    } catch (e) {
      Alert.alert('Couldn’t report', userErrorMessage(e, 'Try again later.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.wrap}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Report Drop"
          subtitle="Spam, harm, or unsafe placement"
          trailing={<CloseButton compact />}
        />
        <View style={styles.list}>
          {REPORT_REASONS.map((r) => (
            <Pressable
              key={r.value}
              onPress={() => setReason(r.value)}
              style={[styles.row, reason === r.value && styles.rowActive]}
            >
              <Text style={[styles.rowText, reason === r.value && styles.rowTextActive]}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Button label="Submit report" loading={loading} onPress={submit} />
      </ScrollView>
    </Screen>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    wrap: {
      flexGrow: 1,
      paddingHorizontal: layout.gutter,
      paddingTop: 4,
      paddingBottom: 48,
      gap: 18,
    },
    back: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      color: palette.textMuted,
    },
    list: { gap: 4 },
    row: {
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    rowActive: { borderBottomColor: palette.accent },
    rowText: {
      fontFamily: typography.body,
      fontSize: 16,
      color: palette.textMuted,
    },
    rowTextActive: { color: palette.text },
  });
}
