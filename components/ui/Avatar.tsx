import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { getMediaUrl } from '@/services/media';
import { typography } from '@/constants/theme';

type Props = {
  uri?: string | null;
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
};

const SIZES = { sm: 36, md: 44, lg: 64 } as const;

/** Circular profile face — signed URL or letter fallback so lists feel human. */
export function Avatar({ uri, name, size = 'sm' }: Props) {
  const { colors } = useTheme();
  const dim = SIZES[size];
  const [resolved, setResolved] = useState<string | null>(null);
  const letter = (name?.trim()?.[0] || '?').toUpperCase();

  useEffect(() => {
    let alive = true;
    setResolved(null);
    if (!uri?.trim()) return;
    getMediaUrl(uri)
      .then((url) => {
        if (alive) setResolved(url);
      })
      .catch(() => {
        if (alive) setResolved(null);
      });
    return () => {
      alive = false;
    };
  }, [uri]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        face: {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: colors.bgSoft,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        letter: {
          fontFamily: typography.bodyMedium,
          fontSize: dim * 0.38,
          color: colors.accentBright,
        },
      }),
    [colors, dim],
  );

  return (
    <View style={styles.face} accessibilityIgnoresInvertColors>
      {resolved ? (
        <Image source={{ uri: resolved }} style={{ width: dim, height: dim }} />
      ) : (
        <Text style={styles.letter}>{letter}</Text>
      )}
    </View>
  );
}
