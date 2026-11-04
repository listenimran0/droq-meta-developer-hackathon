import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { radii, typography, type ThemeColors } from '@/constants/theme';

const DISMISS_MS = 3500;

type ToastFn = (message: string) => void;

const ToastContext = createContext<ToastFn>(() => undefined);

/** Show a transient bottom toast from anywhere: `const toast = useToast();` */
export function useToast(): ToastFn {
  return useContext(ToastContext);
}

/**
 * Global toast overlay — mount once at the root. One toast at a time;
 * a new message replaces the old one and resets the timer.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setMessage(msg);
  }, []);

  useEffect(() => {
    if (!message) return;
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMessage(null);
      });
    }, DISMISS_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, opacity]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {message ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.toast, { bottom: insets.bottom + 88, opacity }]}
        >
          <Text style={styles.text}>{message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    toast: {
      position: 'absolute',
      alignSelf: 'center',
      maxWidth: '88%',
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      borderRadius: radii.md,
      paddingVertical: 12,
      paddingHorizontal: 16,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    text: {
      fontFamily: typography.body,
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
      textAlign: 'center',
    },
  });
}
