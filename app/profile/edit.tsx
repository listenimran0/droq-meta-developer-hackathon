import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { CloseButton } from '@/components/ui/CloseButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { updateProfile } from '@/services/auth';
import { getMediaUrl, uploadAvatar } from '@/services/media';
import { layout, typography, type ThemeColors } from '@/constants/theme';
import { userErrorMessage } from '@/lib/userError';

export default function EditProfileScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (profile?.avatar_url) {
      getMediaUrl(profile.avatar_url)
        .then((u) => setAvatarPreview(u))
        .catch(() => undefined);
    }
  }, [profile?.avatar_url]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos', 'Photo library permission is needed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setLocalAvatar(result.assets[0].uri);
      setAvatarPreview(result.assets[0].uri);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      let avatarUrl: string | undefined;
      if (localAvatar) avatarUrl = await uploadAvatar(localAvatar);
      await updateProfile({
        displayName,
        username,
        avatarUrl,
      });
      await refreshProfile();
      Alert.alert('Saved', 'Profile updated.');
      router.back();
    } catch (e) {
      Alert.alert('Couldn’t save', userErrorMessage(e, 'Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
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
          <ScreenHeader
            title={t('editProfile')}
            trailing={<CloseButton compact label={t('close')} />}
          />

          <Pressable onPress={pickAvatar} style={styles.avatarWrap}>
            {avatarPreview ? (
              <Image source={{ uri: avatarPreview }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.avatarLetter}>
                  {(displayName || username || '?').slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.changePhoto}>Change photo</Text>
          </Pressable>

          <TextField label="Display name" value={displayName} onChangeText={setDisplayName} />
          <TextField
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <Button label={t('save')} loading={saving} onPress={save} />
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
      paddingTop: 4,
      paddingBottom: 48,
      gap: 14,
    },
    back: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      color: palette.textMuted,
    },
    avatarWrap: { alignItems: 'center', gap: 10, marginVertical: 8 },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: palette.bgSoft,
    },
    avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
    avatarLetter: {
      fontFamily: typography.brand,
      fontSize: 36,
      color: palette.accent,
    },
    changePhoto: {
      fontFamily: typography.bodyMedium,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.accent,
    },
  });
}
